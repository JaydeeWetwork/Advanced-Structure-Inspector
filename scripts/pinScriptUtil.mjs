/**
 * Shared helpers for pin scripts. Read pins from disk so a bump can edit
 * packPins.js or schemaPins.js and then regenerate without a stale import.
 */
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const RETRY_STATUSES = new Set([403, 429, 500, 502, 503]);

export function repoRoot() {
	return join(here, "..");
}

const PIN_FILES = ["src/data/packPins.js", "src/data/schemaPins.js"];

/**
 * @returns {{ rel: string, path: string, text: string }[]}
 */
export function loadPinSources() {
	return PIN_FILES.map(rel => {
		const path = join(repoRoot(), rel);
		return { rel, path, text: readFileSync(path, "utf8") };
	});
}

/**
 * One definition of `name` across the pin files. Two copies is an error.
 * @param {string} name
 * @param {{ rel: string, text: string }[]} files
 * @returns {{ rel: string, value: string }}
 */
export function findPackPin(name, files) {
	const pattern = new RegExp(`export const ${name} = "([^"]*)"`, "g");
	/** @type {{ rel: string, value: string }[]} */
	const hits = [];
	for (const file of files) {
		const matches = [...file.text.matchAll(pattern)];
		if (matches.length > 1) throw new Error(`${file.rel} defines ${name} more than once`);
		if (matches.length === 1) hits.push({ rel: file.rel, value: matches[0][1] });
	}
	if (hits.length === 1) return hits[0];
	if (hits.length === 0) throw new Error(`pin files are missing ${name}`);
	throw new Error(`${name} is defined in ${hits.map(hit => hit.rel).join(" and ")}`);
}

export function readPackPin(name) {
	return findPackPin(name, loadPinSources()).value;
}

/**
 * Write only when the bytes differ. Missing files are created.
 * @param {string} filePath
 * @param {string} next
 */
export function writeIfChanged(filePath, next) {
	let previous = null;
	try {
		previous = readFileSync(filePath, "utf8");
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
	if (previous === next) return false;
	writeFileSync(filePath, next);
	return true;
}

/**
 * Fetch a URL, retrying transient CDN and rate-limit statuses.
 * @param {string} url
 * @param {RequestInit} [options]
 */
export async function fetchOk(url, options) {
	let lastStatus = 0;
	for (let attempt = 1; attempt <= 5; attempt++) {
		const res = await fetch(url, options);
		if (res.ok) return res;
		lastStatus = res.status;
		if (!RETRY_STATUSES.has(res.status) || attempt === 5) {
			throw new Error(`${url} → HTTP ${res.status}`);
		}
		await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
	}
	throw new Error(`${url} → HTTP ${lastStatus}`);
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string} tag
 */
export async function githubTree(owner, repo, tag) {
	const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${tag}?recursive=1`;
	const res = await fetchOk(url, {
		headers: { "User-Agent": "bedrockLayers-pack-index", Accept: "application/vnd.github+json" }
	});
	const body = await res.json();
	if (!Array.isArray(body.tree)) throw new Error(`GitHub tree ${owner}/${repo}@${tag} has no tree`);
	if (body.truncated) throw new Error(`GitHub tree ${owner}/${repo}@${tag} was truncated`);
	return body.tree;
}

/**
 * True when this module is the process entry. realpathSync matches Windows
 * npm launches where pathToFileURL(argv[1]) is not import.meta.url.
 * @param {string} metaUrl
 */
export function isDirectRun(metaUrl) {
	const entry = process.argv[1];
	if (!entry || !metaUrl) return false;
	try {
		return realpathSync(fileURLToPath(metaUrl)) === realpathSync(entry);
	} catch {
		return false;
	}
}
