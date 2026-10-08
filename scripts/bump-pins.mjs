/**
 * Move the samples tag, the TGA list, the fancy/opaque and carried lists,
 * and the block and item schema pins together.
 *
 * BlockUpdater.LATEST_VERSION changes only when a block schema's packed
 * maxVersion field changes. The samples marketing tag does not set it.
 *
 *   npm run bump:pins
 *   npm run bump:pins -- --samples v1.26.50.4 --block-schema 5.3.0 --item-schema 1.18.0
 *
 * After the writes, runs the shape-coverage check against the samples tag
 * on disk. A miss exits non-zero. The pins stay written.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { packedSchemaVersion } from "../src/viewer/blockUpgradeApply.js";
import { logFancyPlan, planFancyOpaqueFromPin } from "./index-fancy-opaque.mjs";
import { planVanillaTgaList } from "./index-vanilla-tga.mjs";
import { fetchOk, findPackPin, githubTree, isDirectRun, loadPinSources, repoRoot, writeIfChanged } from "./pinScriptUtil.mjs";

const TAG_RE = /^[\w.+-]+$/;
const NUMBERED_JSON = /(?:^|\/)(\d{4}_[^/]+\.json)$/;

function argValue(name) {
	const flag = `--${name}`;
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === flag) return argv[i + 1];
		if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
	}
	return undefined;
}

function requireTag(label, value) {
	if (!value || !TAG_RE.test(value)) throw new Error(`${label} tag is missing or has unexpected characters`);
	return value;
}

/**
 * @param {string} text
 * @param {string} name
 * @param {string} value
 */
export function setPackPin(text, name, value) {
	const pattern = new RegExp(`(export const ${name} = )"[^"]*"`);
	if (!pattern.test(text)) throw new Error(`pin source is missing ${name}`);
	return text.replace(pattern, `$1${JSON.stringify(value)}`);
}

/**
 * @param {{ filename: string, path?: string, maxVersionMajor: number, maxVersionMinor: number, maxVersionPatch: number, maxVersionRevision: number }} row
 */
export function formatBlockSchemaRow(row) {
	const parts = [`"filename":${JSON.stringify(row.filename)}`];
	if (row.path) parts.push(`"path":${JSON.stringify(row.path)}`);
	parts.push(
		`"maxVersionMajor":${row.maxVersionMajor}`,
		`"maxVersionMinor":${row.maxVersionMinor}`,
		`"maxVersionPatch":${row.maxVersionPatch}`,
		`"maxVersionRevision":${row.maxVersionRevision}`
	);
	return `\t{${parts.join(",")}}`;
}

/**
 * @param {object[]} rows
 * @param {string} [eol]
 */
export function formatBlockSchemaList(rows, eol = "\n") {
	return `[${eol}${rows.map(formatBlockSchemaRow).join(`,${eol}`)}${eol}]${eol}`;
}

/**
 * Numbered schema JSON at the repo root or in one folder. A folder copy wins over a root copy.
 * @param {{ path?: string, type?: string }[]} tree
 * @param {string} folder
 */
export function numberedSchemaPaths(tree, folder) {
	/** @type {Map<string, string>} */
	const byName = new Map();
	for (const node of tree) {
		if (node.type && node.type !== "blob") continue;
		const path = String(node.path || "");
		const match = path.match(NUMBERED_JSON);
		if (!match) continue;
		const filename = match[1];
		const inFolder = path === `${folder}/${filename}`;
		const atRoot = path === filename;
		if (!inFolder && !atRoot) continue;
		const previous = byName.get(filename);
		if (previous && previous.startsWith(`${folder}/`)) continue;
		byName.set(filename, path);
	}
	return [...byName.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([, path]) => path);
}

async function readBlockSchemaRow(tag, repoPath) {
	const url = `https://cdn.jsdelivr.net/gh/opencollab-incubator/BedrockBlockUpgradeSchema@${tag}/${repoPath}`;
	const res = await fetchOk(url);
	const json = await res.json();
	for (const key of ["maxVersionMajor", "maxVersionMinor", "maxVersionPatch", "maxVersionRevision"]) {
		if (!Number.isInteger(json[key])) throw new Error(`${repoPath} is missing ${key}`);
	}
	const filename = repoPath.split("/").pop();
	/** @type {{ filename: string, path?: string, maxVersionMajor: number, maxVersionMinor: number, maxVersionPatch: number, maxVersionRevision: number }} */
	const row = {
		filename,
		maxVersionMajor: json.maxVersionMajor,
		maxVersionMinor: json.maxVersionMinor,
		maxVersionPatch: json.maxVersionPatch,
		maxVersionRevision: json.maxVersionRevision
	};
	if (!repoPath.startsWith("nbt_upgrade_schema/")) row.path = repoPath;
	return row;
}

/**
 * Item schema index. `path` is set only when the file is not under id_meta_upgrade_schema/.
 * @param {{ filename: string, path?: string }[]} entries
 * @param {string} [eol]
 */
export function formatItemSchemaList(entries, eol = "\n") {
	const lines = entries.map(entry => {
		const parts = [`"filename":${JSON.stringify(entry.filename)}`];
		if (entry.path) parts.push(`"path":${JSON.stringify(entry.path)}`);
		return `\t{${parts.join(",")}}`;
	});
	return `[${eol}${lines.join(`,${eol}`)}${eol}]${eol}`;
}

/**
 * @param {string} sourceText
 * @param {number} packed
 */
export function replaceLatestVersion(sourceText, packed) {
	const current = sourceText.match(/static LATEST_VERSION = (\d+);/);
	if (!current) throw new Error("BlockUpdater.LATEST_VERSION is missing");
	if (Number(current[1]) === packed) return { text: sourceText, changed: false, previous: packed };
	const major = (packed >>> 24) & 0xff;
	const minor = (packed >>> 16) & 0xff;
	const patch = (packed >>> 8) & 0xff;
	const revision = packed & 0xff;
	const pattern = /\t\/\/[^\n]*\r?\n\tstatic LATEST_VERSION = \d+;[^\n]*/;
	if (!pattern.test(sourceText)) throw new Error("LATEST_VERSION comment block was not found");
	const eol = sourceText.includes("\r\n") ? "\r\n" : "\n";
	const replacement = `\t// Schemas advertise packed field ${major}.${minor}.${patch}.${revision}.${eol}\tstatic LATEST_VERSION = ${packed}; // ${major}.${minor}.${patch}.${revision}`;
	return {
		text: sourceText.replace(pattern, replacement),
		changed: true,
		previous: Number(current[1])
	};
}

async function planBlockSchemas(tag) {
	const tree = await githubTree("opencollab-incubator", "BedrockBlockUpgradeSchema", tag);
	const paths = numberedSchemaPaths(tree, "nbt_upgrade_schema");
	if (!paths.length) throw new Error(`No block schema files on ${tag}`);
	const rows = await Promise.all(paths.map(path => readBlockSchemaRow(tag, path)));
	const root = repoRoot();
	const listPath = join(root, "src/data/blockUpgradeSchemaList.json");
	const previous = readFileSync(listPath, "utf8");
	const eol = previous.includes("\r\n") ? "\r\n" : "\n";
	const updaterPath = join(root, "src/viewer/engine/BlockUpdater.js");
	const packed = rows.reduce((max, row) => Math.max(max, packedSchemaVersion(row)), 0);
	const updated = replaceLatestVersion(readFileSync(updaterPath, "utf8"), packed);
	return {
		listPath,
		listText: formatBlockSchemaList(rows, eol),
		updaterPath,
		updaterText: updated.text,
		count: rows.length,
		tag,
		packed,
		versionChanged: updated.changed,
		previousVersion: updated.previous
	};
}

const ITEM_SCHEMA_FOLDER = "id_meta_upgrade_schema";

async function planItemSchemas(tag) {
	const tree = await githubTree("opencollab-incubator", "BedrockItemUpgradeSchema", tag);
	const paths = numberedSchemaPaths(tree, ITEM_SCHEMA_FOLDER);
	if (!paths.length) throw new Error(`No item schema files on ${tag}`);
	const entries = paths.map(path => {
		const filename = path.split("/").pop();
		return path.startsWith(`${ITEM_SCHEMA_FOLDER}/`) ? { filename } : { filename, path };
	});
	const listPath = join(repoRoot(), "src/data/itemUpgradeSchemaList.json");
	let eol = "\r\n";
	try {
		const previous = readFileSync(listPath, "utf8");
		eol = previous.includes("\r\n") ? "\r\n" : "\n";
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
	return {
		path: listPath,
		text: formatItemSchemaList(entries, eol),
		count: entries.length,
		tag,
		rootFiles: entries.filter(entry => entry.path).map(entry => entry.filename)
	};
}

export async function bumpPins({ samples, blockSchema, itemSchema } = {}) {
	const root = repoRoot();
	const files = loadPinSources();
	const read = name => findPackPin(name, files).value;
	const nextSamples = requireTag("samples", samples ?? read("VANILLA_SAMPLES_TAG"));
	const nextBlock = requireTag("block schema", blockSchema ?? read("BLOCK_UPGRADE_TAG"));
	const nextItem = requireTag("item schema", itemSchema ?? read("ITEM_UPGRADE_TAG"));
	const setLoadedPin = (name, value) => {
		const hit = findPackPin(name, files);
		const file = files.find(item => item.rel === hit.rel);
		file.text = setPackPin(file.text, name, value);
	};
	setLoadedPin("VANILLA_SAMPLES_TAG", nextSamples);
	setLoadedPin("BLOCK_UPGRADE_TAG", nextBlock);
	setLoadedPin("ITEM_UPGRADE_TAG", nextItem);

	const [tga, fancy, block, item] = await Promise.all([
		planVanillaTgaList(nextSamples),
		planFancyOpaqueFromPin(nextSamples),
		planBlockSchemas(nextBlock),
		planItemSchemas(nextItem)
	]);

	let wrotePins = false;
	for (const file of files) {
		if (writeIfChanged(file.path, file.text)) wrotePins = true;
	}
	const wroteTga = writeIfChanged(tga.path, tga.text);
	writeIfChanged(fancy.eigenPath, fancy.eigenText);
	writeIfChanged(fancy.carriedPath, fancy.carriedText);
	const wroteBlockList = writeIfChanged(block.listPath, block.listText);
	writeIfChanged(block.updaterPath, block.updaterText);
	const wroteItemList = writeIfChanged(item.path, item.text);

	console.log(wrotePins
		? `pins: samples ${nextSamples}, block schema ${nextBlock}, item schema ${nextItem}`
		: `pins unchanged: samples ${nextSamples}, block schema ${nextBlock}, item schema ${nextItem}`);
	console.log(`${wroteTga ? "wrote" : "kept"} ${tga.count} TGA paths for ${tga.tag}`);
	logFancyPlan(fancy.summary);
	console.log(`block schemas: ${block.count} on ${block.tag}${wroteBlockList ? "" : " (list unchanged)"}`);
	console.log(block.versionChanged
		? `LATEST_VERSION ${block.previousVersion} → ${block.packed}`
		: `LATEST_VERSION stays ${block.packed}`);
	console.log(`item schemas: ${item.count} on ${item.tag}${wroteItemList ? "" : " (list unchanged)"}`);
	if (item.rootFiles.length) console.log(`item schemas outside ${ITEM_SCHEMA_FOLDER}/: ${item.rootFiles.join(", ")}`);

	// After the pin file is on disk, so the coverage module reads the new tag.
	const { checkBlockShapeCoverage } = await import("../tests/checkBlockShapeCoverage/index.js");
	const coverage = await checkBlockShapeCoverage();
	const shapeMisses = coverage.fallbackCube.length + coverage.missingShape.length;
	const woodMisses = coverage.missingBlocksJson.length + coverage.missingTerrain.length;
	if (shapeMisses || woodMisses) {
		throw new Error(
			`shape coverage failed on ${coverage.pin}: ${coverage.fallbackCube.length} fallback cube, ${coverage.missingShape.length} missing shape, ${coverage.missingBlocksJson.length} wood blocks.json, ${coverage.missingTerrain.length} wood terrain`
		);
	}
	console.log(`shape coverage ok on ${coverage.pin}: ${coverage.mapped.length} mapped`);
}

if (isDirectRun(import.meta.url)) {
	const samples = argValue("samples");
	const blockSchema = argValue("block-schema");
	const itemSchema = argValue("item-schema");
	try {
		await bumpPins({ samples, blockSchema, itemSchema });
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
