/**
 * Read zip members into File objects under the ingest byte caps.
 */

import { throwIfAborted } from "./abortUtil.js";
import {
	assertZipBudget,
	assertZipEntryInflation,
	IngestError,
	sanitizeZipEntryName,
	ZIP_MAX_ENTRY_BYTES,
	ZIP_MAX_STRUCTURES,
	ZIP_MAX_UNCOMPRESSED
} from "./ingestBudget.js";

const ADDON_NEST_MAX_DEPTH = 2;

/**
 * Counts inflated bytes and stops past ZIP_MAX_ENTRY_BYTES. `writable` feeds writeUint8Array.
 * `charge` sees each chunk before it is kept, so a shared budget can stop a world database mid-inflate.
 * @param {typeof import("@zip.js/zip.js")} zip
 * @param {(n: number) => void} [charge]
 */
function countingBlobWriter(zip, charge) {
	const inner = new zip.BlobWriter();
	const sink = inner.writable.getWriter();
	let written = 0;
	/** @type {IngestError|null} */
	let error = null;
	/** @param {Uint8Array} array */
	async function writeUint8Array(array) {
		const n = array?.byteLength ?? 0;
		written += n;
		if (written > ZIP_MAX_ENTRY_BYTES) {
			error = new IngestError(
				"ZIP_TOO_LARGE",
				`zip entry exceeds ${ZIP_MAX_ENTRY_BYTES} bytes`
			);
			await sink.abort(error).catch(() => {});
			throw error;
		}
		if (charge) {
			try {
				charge(n);
			} catch (e) {
				error = e instanceof IngestError
					? e
					: new IngestError("ZIP_TOO_LARGE", e instanceof Error ? e.message : String(e));
				await sink.abort(error).catch(() => {});
				throw error;
			}
		}
		await sink.write(array);
	}
	const writable = new WritableStream({
		write(chunk) {
			return writeUint8Array(chunk);
		},
		close() {
			return sink.close();
		},
		abort(reason) {
			return sink.abort(reason);
		}
	});
	return {
		get writable() {
			return writable;
		},
		writeUint8Array,
		get error() {
			return error;
		},
		getData() {
			if (error) throw error;
			return inner.getData();
		}
	};
}

/**
 * @param {string} filename
 */
function isAddonNestedArchive(filename) {
	const n = filename.toLowerCase();
	return n.endsWith(".mcworld")
		|| n.endsWith(".mctemplate")
		|| n.endsWith(".mcpack")
		|| n.endsWith(".mcaddon");
}

/**
 * @param {File} file
 * @param {(entries: any[], zip: typeof import("@zip.js/zip.js")) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
export async function withZipEntries(file, fn) {
	const zip = await import("@zip.js/zip.js");
	const reader = new zip.ZipReader(new zip.BlobReader(file));
	try {
		const entries = await reader.getEntries();
		assertZipBudget(entries);
		return await fn(entries, zip);
	} finally {
		await reader.close().catch(() => {});
	}
}

/**
 * @param {any} entry
 * @param {number} i
 * @param {typeof import("@zip.js/zip.js")} zip
 * @param {string} [fallbackName]
 * @param {AbortSignal} [signal]
 * @param {(n: number) => void} [charge]
 */
export async function zipEntryToFile(entry, i, zip, fallbackName, signal, charge) {
	throwIfAborted(signal);
	if (entry.encrypted) {
		throw new IngestError("ZIP_ENCRYPTED", "encrypted zip entries are not imported");
	}
	assertZipEntryInflation(entry);
	const opts = signal ? { signal } : {};
	const counter = countingBlobWriter(zip, charge);
	let blob;
	try {
		blob = await entry.getData(counter, opts);
	} catch (e) {
		if (counter.error) throw counter.error;
		throw e;
	}
	if (blob.size > ZIP_MAX_ENTRY_BYTES) {
		throw new IngestError(
			"ZIP_TOO_LARGE",
			`zip entry exceeds ${ZIP_MAX_ENTRY_BYTES} bytes`
		);
	}
	const name = sanitizeZipEntryName(entry.filename) || fallbackName || `file_${i}`;
	return new File([blob], name);
}

/**
 * Shared budget for one import. `structures` counts .mcstructure files already kept.
 * @typedef {object} ZipRunningBudget
 * @property {number} n
 * @property {number} [structures]
 */

/**
 * `expandNested` is required when `nest` is set. The walker calls it before the
 * next entry so the shared byte cap stays in order.
 * @typedef {object} ZipExtractCtx
 * @property {boolean} [nest]
 * @property {number} [nestDepth]
 * @property {ZipRunningBudget} running
 * @property {AbortSignal} [signal]
 * @property {(file: File, ctx: { nestDepth: number, running: ZipRunningBudget, signal?: AbortSignal }) => Promise<{ structures: File[] }>} [expandNested]
 */

/**
 * Walk one zip. Nested addon archives expand through `ctx.expandNested`.
 * @param {File} file
 * @param {ZipExtractCtx} ctx
 * @returns {Promise<File[]>}
 */
export async function extractMcstructuresFromZip(file, ctx) {
	const nest = !!ctx.nest;
	const nestDepth = ctx.nestDepth ?? 0;
	const running = ctx.running;
	const signal = ctx.signal;
	if (nest && typeof ctx.expandNested !== "function") {
		throw new TypeError("extractMcstructuresFromZip requires expandNested when nest is set");
	}
	return withZipEntries(file, async (entries, zip) => {
		const structures = [];
		const addSize = n => {
			running.n += n;
			if (running.n > ZIP_MAX_UNCOMPRESSED) {
				throw new IngestError(
					"ZIP_TOO_LARGE",
					`extracted bytes exceed ${ZIP_MAX_UNCOMPRESSED}`
				);
			}
		};
		const addStructure = f => {
			running.structures = (running.structures || 0) + 1;
			if (running.structures > ZIP_MAX_STRUCTURES) {
				throw new IngestError(
					"ZIP_TOO_MANY_STRUCTURES",
					`more than ${ZIP_MAX_STRUCTURES} .mcstructure files in this import`
				);
			}
			structures.push(f);
		};
		for (let i = 0; i < entries.length; i++) {
			throwIfAborted(signal);
			const entry = entries[i];
			if (entry.directory || entry.encrypted) continue;
			const lower = (entry.filename || "").toLowerCase();
			if (lower.endsWith(".mcstructure")) {
				const f = await zipEntryToFile(entry, i, zip, `structure_${i}.mcstructure`, signal);
				const name = f.name.endsWith(".mcstructure") ? f.name : `${f.name}.mcstructure`;
				const structure = new File([f], name, { type: "application/mcstructure" });
				addSize(structure.size);
				addStructure(structure);
				continue;
			}
			if (nest && nestDepth < ADDON_NEST_MAX_DEPTH && isAddonNestedArchive(lower)) {
				const nested = await zipEntryToFile(entry, i, zip, `nested_${i}`, signal);
				addSize(nested.size);
				const inner = await ctx.expandNested(nested, {
					nestDepth: nestDepth + 1,
					running,
					signal
				});
				structures.push(...inner.structures);
			}
		}
		return structures;
	});
}


