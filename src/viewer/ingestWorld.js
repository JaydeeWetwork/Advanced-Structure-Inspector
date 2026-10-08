/**
 * LevelDB structure templates inside a world or template zip.
 */

import { throwIfAborted } from "./abortUtil.js";
import {
	fileWithSafeStructureName,
	IngestError,
	ZIP_MAX_ENTRY_BYTES,
	ZIP_MAX_STRUCTURES,
	ZIP_MAX_UNCOMPRESSED
} from "./ingestBudget.js";
import { withZipEntries, zipEntryToFile } from "./ingestZip.js";

/**
 * @param {string} filename
 */
function zipBaseName(filename) {
	const name = String(filename || "");
	return name.slice(name.lastIndexOf("/") + 1);
}

/**
 * @param {string} filename
 */
function zipDirName(filename) {
	const name = String(filename || "");
	return name.includes("/") ? name.slice(0, name.lastIndexOf("/") + 1) : "";
}

/**
 * Match the world reader's names: drop one leading `mystructure:`, then replace colons.
 * @param {string} key
 */
function structureNameFromWorldKey(key) {
	const prefix = "structuretemplate_";
	let name = String(key).slice(prefix.length);
	const ns = "mystructure:";
	if (name.startsWith(ns)) name = name.slice(ns.length);
	return name.replaceAll(":", "_") + ".mcstructure";
}

/**
 * Inflate only the LevelDB directory that contains CURRENT, counting those bytes
 * against the shared zip budget, then read keys from the capped files.
 * LevelDB's own block decode still runs inside that cap.
 * @param {File} file
 * @param {{ signal?: AbortSignal, running: { n: number, structures?: number } }} ctx
 * @returns {Promise<File[]>}
 */
export async function readCappedWorldStructures(file, ctx) {
	throwIfAborted(ctx.signal);
	return withZipEntries(file, async (entries, zip) => {
		const current = entries.find(entry => zipBaseName(entry.filename) === "CURRENT");
		if (!current) {
			throw new IngestError("UNRECOGNIZED_SOURCE", "Cannot find LevelDB files in this world");
		}
		const dbRoot = zipDirName(current.filename);
		const dbEntries = entries.filter(entry => (
			!entry.directory && String(entry.filename || "").startsWith(dbRoot)
		));
		let inflated = 0;
		/** @param {number} n */
		const charge = n => {
			inflated += n;
			if (ctx.running.n + inflated > ZIP_MAX_UNCOMPRESSED) {
				throw new IngestError(
					"ZIP_TOO_LARGE",
					`world database exceeds ${ZIP_MAX_UNCOMPRESSED} bytes`
				);
			}
		};
		const dbFiles = [];
		for (let i = 0; i < dbEntries.length; i++) {
			throwIfAborted(ctx.signal);
			dbFiles.push(await zipEntryToFile(dbEntries[i], i, zip, `db_${i}`, ctx.signal, charge));
		}
		const { readLevelDb } = await import("mcbe-leveldb-reader");
		const keys = await readLevelDb(dbFiles);
		const structures = [];
		let sum = 0;
		for (const [key, value] of Object.entries(keys ?? {})) {
			if (!String(key).startsWith("structuretemplate_")) continue;
			const bytes = value?.value ?? new Uint8Array();
			const n = bytes?.byteLength ?? 0;
			if (n > ZIP_MAX_ENTRY_BYTES) {
				throw new IngestError(
					"ZIP_TOO_LARGE",
					`structure in world exceeds ${ZIP_MAX_ENTRY_BYTES} bytes`
				);
			}
			sum += n;
			if (ctx.running.n + sum > ZIP_MAX_UNCOMPRESSED) {
				throw new IngestError(
					"ZIP_TOO_LARGE",
					`world structures exceed ${ZIP_MAX_UNCOMPRESSED} bytes`
				);
			}
			if ((ctx.running.structures || 0) + structures.length >= ZIP_MAX_STRUCTURES) {
				throw new IngestError(
					"ZIP_TOO_MANY_STRUCTURES",
					`world has more than ${ZIP_MAX_STRUCTURES} structures`
				);
			}
			const named = new File(
				[bytes],
				structureNameFromWorldKey(key),
				{ type: "application/mcstructure" }
			);
			structures.push(fileWithSafeStructureName(named));
		}
		ctx.running.n += sum;
		ctx.running.structures = (ctx.running.structures || 0) + structures.length;
		return structures;
	});
}

/**
 * Pack-page world extract. A `.zip` on that input stays a LevelDB read.
 * @param {File} file
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<File[]>}
 */
export async function extractWorldStructureFiles(file, opts = {}) {
	return readCappedWorldStructures(file, {
		signal: opts.signal,
		running: { n: 0, structures: 0 }
	});
}


