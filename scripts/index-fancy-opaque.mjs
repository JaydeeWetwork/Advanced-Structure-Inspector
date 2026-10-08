/**
 * Pin the fancy-versus-opaque eigenvariants and the carried-texture list.
 * Hand eigenvariants (doors, furnaces, pumpkins, cave vines) stay as written.
 * A fancy/opaque block that already has a non-zero eigenvariant is left alone.
 *
 *   node scripts/index-fancy-opaque.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripJsonc } from "../src/utils/conversions.js";
import { resolveBlockShapeName } from "../src/viewer/appearanceFallback.js";
import { fetchOk, isDirectRun, readPackPin, repoRoot, writeIfChanged } from "./pinScriptUtil.mjs";

const BEGIN = "\t// BEGIN pin fancy/opaque — index 0 is the cutout. scripts/index-fancy-opaque.mjs";
const END = "\t// END pin fancy/opaque";

/**
 * @param {Record<string, { textures?: unknown }>} terrainData
 * @param {string} key
 * @returns {string[]|null}
 */
export function texturePaths(terrainData, key) {
	const entry = terrainData?.[key];
	if (!entry) return null;
	const textures = entry.textures;
	if (typeof textures === "string") return [textures];
	if (Array.isArray(textures)) {
		return textures.map(item => (typeof item === "string" ? item : item?.path)).filter(Boolean);
	}
	if (textures && typeof textures === "object" && textures.path) return [textures.path];
	return [];
}

/**
 * Blocks whose terrain key is a fancy sheet followed by an opaque sheet.
 * Index 0 is the cutout. Names are sorted.
 * @param {Record<string, { textures?: unknown }>} blocks
 * @param {Record<string, { textures?: unknown }>} terrainData
 */
export function fancyOpaqueBlockNames(blocks, terrainData) {
	const names = [];
	for (const [name, entry] of Object.entries(blocks ?? {})) {
		if (!entry || typeof entry !== "object") continue;
		const textures = entry.textures;
		const keys = typeof textures === "string"
			? [textures]
			: textures && typeof textures === "object" && !Array.isArray(textures)
				? [...new Set(Object.values(textures).filter(key => typeof key === "string"))]
				: [];
		const fancy = keys.some(key => {
			const paths = texturePaths(terrainData, key);
			if (!paths || paths.length < 2) return false;
			return paths.some(path => /opaque/i.test(path)) && !/opaque/i.test(paths[0]);
		});
		if (fancy) names.push(name);
	}
	names.sort();
	return names;
}

/**
 * Foliage whose placed texture should be the carried cutout.
 * A face map, an item icon, or a texture key in the tint table stays off the list.
 * A cross-texture block may use its own `${name}_carried` item icon (bush, firefly bush).
 * @param {Record<string, { textures?: unknown, carried_textures?: unknown }>} blocks
 * @param {Record<string, { textures?: unknown }>} terrainData
 * @param {Iterable<string>} tintKeys
 * @param {(name: string) => string} shapeFamilyOf
 */
export function classifyCarriedTextures(blocks, terrainData, tintKeys, shapeFamilyOf) {
	const tinted = new Set(tintKeys);
	const names = [];
	const tintSkipped = [];
	for (const [name, entry] of Object.entries(blocks ?? {})) {
		if (!entry || typeof entry !== "object") continue;
		const carried = entry.carried_textures;
		if (typeof carried !== "string" || typeof entry.textures !== "string") continue;
		const paths = texturePaths(terrainData, carried);
		if (!paths?.length) continue;
		const carriedHit = /carried/i.test(carried) || paths.some(path => /carried/i.test(path));
		if (!carriedHit) continue;
		if (tinted.has(entry.textures)) {
			tintSkipped.push(name);
			continue;
		}
		const blockArt = paths.every(path => path.startsWith("textures/blocks/"));
		const ownCrossIcon = !blockArt
			&& shapeFamilyOf(name) === "cross_texture"
			&& carried === `${name}_carried`;
		if (blockArt || ownCrossIcon) names.push(name);
	}
	names.sort();
	tintSkipped.sort();
	return { names, tintSkipped };
}

/**
 * @param {string} sourceText
 * @param {string[]} fancyNames
 */
export function mergeFancyEigenvariants(sourceText, fancyNames) {
	const eol = sourceText.includes("\r\n") ? "\r\n" : "\n";
	const parsed = JSON.parse(stripJsonc(sourceText));
	const pinned = [];
	const keptHand = [];
	for (const name of fancyNames) {
		if (Object.prototype.hasOwnProperty.call(parsed, name) && parsed[name] !== 0) keptHand.push(name);
		else pinned.push(name);
	}
	let lines = sourceText.split(/\r?\n/);
	const beginAt = lines.findIndex(line => line.startsWith("\t// BEGIN pin fancy/opaque"));
	const endAt = lines.findIndex(line => line.startsWith("\t// END pin fancy/opaque"));
	if (beginAt !== -1 && endAt > beginAt) lines.splice(beginAt, endAt - beginAt + 1);
	const pinSet = new Set(pinned);
	lines = lines.filter(line => {
		const match = line.match(/^\t"([^"]+)": 0,?$/);
		return !(match && pinSet.has(match[1]));
	});
	const schemaAt = lines.findIndex(line => line.includes('"$schema"'));
	if (schemaAt === -1) throw new Error("blockEigenvariants.json has no $schema line");
	const block = [BEGIN, ...pinned.map(name => `\t"${name}": 0,`), END];
	lines.splice(schemaAt, 0, ...block);
	let text = lines.join(eol);
	if (sourceText.endsWith(eol) && !text.endsWith(eol)) text += eol;
	if (!sourceText.endsWith(eol) && text.endsWith(eol)) text = text.slice(0, -eol.length);
	return { text, pinned, keptHand };
}

/**
 * @param {string} sourceText
 * @param {string[]} names
 */
export function replaceCarriedList(sourceText, names) {
	const rendered = `[${names.map(name => JSON.stringify(name)).join(", ")}]`;
	const pattern = /("blocks_to_use_carried_textures": )\[[^\]]*\]/;
	if (!pattern.test(sourceText)) throw new Error("textureAtlasMappings.json is missing blocks_to_use_carried_textures");
	return sourceText.replace(pattern, `$1${rendered}`);
}

function shapeFamily(shape) {
	const cut = String(shape).indexOf("<");
	return cut === -1 ? shape : shape.slice(0, cut);
}

async function fetchJsonc(url) {
	const res = await fetchOk(url);
	return JSON.parse(stripJsonc(await res.text()));
}

/**
 * @param {{ pinned: number, keptHand: string[], carried: number, addedCarried: string[], removedCarried: string[], tintSkipped: string[] }} summary
 */
export function logFancyPlan(summary) {
	console.log(`fancy/opaque eigenvariants: ${summary.pinned} pinned at 0`);
	if (summary.keptHand.length) console.log(`kept hand eigenvariant: ${summary.keptHand.join(", ")}`);
	console.log(`carried textures: ${summary.carried}`);
	if (summary.addedCarried.length) console.log(`carried added: ${summary.addedCarried.join(", ")}`);
	if (summary.removedCarried.length) console.log(`carried removed: ${summary.removedCarried.join(", ")}`);
	if (summary.tintSkipped.length) console.log(`carried skipped (tinted block texture): ${summary.tintSkipped.join(", ")}`);
}

/**
 * @param {string} [tag]
 */
export async function planFancyOpaqueFromPin(tag = readPackPin("VANILLA_SAMPLES_TAG")) {
	const root = repoRoot();
	const base = `https://cdn.jsdelivr.net/gh/Mojang/bedrock-samples@${tag}/resource_pack/`;
	const [blocks, terrain] = await Promise.all([
		fetchJsonc(`${base}blocks.json`),
		fetchJsonc(`${base}textures/terrain_texture.json`)
	]);
	const terrainData = terrain.texture_data ?? {};
	const mappingsPath = join(root, "src/data/textureAtlasMappings.json");
	const mappingsText = readFileSync(mappingsPath, "utf8");
	const mappings = JSON.parse(stripJsonc(mappingsText));
	const tintKeys = Object.keys(mappings.terrain_texture_tints?.terrain_texture_keys ?? {});
	const shapes = JSON.parse(stripJsonc(readFileSync(join(root, "src/data/blockShapes.json"), "utf8")));
	const individual = shapes.individual_blocks ?? {};
	const patterns = Object.entries(shapes.patterns ?? {}).map(([rule, shape]) => [new RegExp(rule), shape]);
	const shapeFamilyOf = name => shapeFamily(resolveBlockShapeName(name, individual, patterns).shape);

	const fancy = fancyOpaqueBlockNames(blocks, terrainData);
	const { names: carried, tintSkipped } = classifyCarriedTextures(blocks, terrainData, tintKeys, shapeFamilyOf);
	const eigenPath = join(root, "src/data/blockEigenvariants.json");
	const merged = mergeFancyEigenvariants(readFileSync(eigenPath, "utf8"), fancy);
	const previousCarried = mappings.blocks_to_use_carried_textures ?? [];
	return {
		eigenPath,
		eigenText: merged.text,
		carriedPath: mappingsPath,
		carriedText: replaceCarriedList(mappingsText, carried),
		summary: {
			pinned: merged.pinned.length,
			keptHand: merged.keptHand,
			carried: carried.length,
			addedCarried: carried.filter(name => !previousCarried.includes(name)),
			removedCarried: previousCarried.filter(name => !carried.includes(name)),
			tintSkipped
		}
	};
}

/**
 * @param {string} [tag]
 */
export async function writeFancyOpaqueFromPin(tag) {
	const plan = await planFancyOpaqueFromPin(tag);
	writeIfChanged(plan.eigenPath, plan.eigenText);
	writeIfChanged(plan.carriedPath, plan.carriedText);
	logFancyPlan(plan.summary);
	return plan.summary;
}

if (isDirectRun(import.meta.url)) {
	await writeFancyOpaqueFromPin();
}
