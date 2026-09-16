/**
 * Pin-bump checklist: samples block ids vs ASI shape maps.
 * Fallback unit cubes are reported, not a failure. Missing shape keys fail.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { VANILLA_SAMPLES_TAG } from "../../src/data/packPins.js";
import { resolveBlockShapeName } from "../../src/viewer/appearanceFallback.js";
import { IGNORED_BLOCKS } from "../../src/viewer/paletteCore.js";
import { stripJsonc } from "../../src/utils/conversions.js";
import { applyBlocksJsonPatch } from "../../src/viewer/blocksJsonPatch.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const GITHUB_CDN = "https://cdn.jsdelivr.net/gh";
const SAMPLES_BLOCKS = `Mojang/bedrock-samples@${VANILLA_SAMPLES_TAG}/metadata/vanilladata_modules/mojang-blocks.json`;
const SAMPLES_BLOCKS_DOT_JSON = `Mojang/bedrock-samples@${VANILLA_SAMPLES_TAG}/resource_pack/blocks.json`;
const SAMPLES_TERRAIN = `Mojang/bedrock-samples@${VANILLA_SAMPLES_TAG}/resource_pack/textures/terrain_texture.json`;
const WOOD_KIND_RE = /_(door|trapdoor|fence|fence_gate)$|^(fence|fence_gate|trapdoor|wooden_door)$/;

const CHEMISTRY_PREFIXES = ["hard_", "element_", "colored_torch_"];
const CHEMISTRY_NAMES = new Set([
	"chemical_heat",
	"compound_creator",
	"lab_table",
	"material_reducer",
	"underwater_torch"
]);

function readJsonc(rel) {
	return JSON.parse(stripJsonc(readFileSync(join(root, rel), "utf8")));
}

function shapeFamily(shape) {
	const i = String(shape).indexOf("<");
	return i === -1 ? shape : shape.slice(0, i);
}

function skipName(blockName) {
	if (IGNORED_BLOCKS.includes(blockName)) return true;
	if (CHEMISTRY_PREFIXES.some(p => blockName.startsWith(p))) return true;
	if (CHEMISTRY_NAMES.has(blockName)) return true;
	return false;
}

async function fetchMojangBlocks() {
	const url = `${GITHUB_CDN}/${SAMPLES_BLOCKS}`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
	}
	return res.json();
}

function listBlockNames(mojangBlocks) {
	const items = mojangBlocks?.data_items;
	if (!Array.isArray(items)) {
		throw new Error("mojang-blocks.json missing data_items[]");
	}
	const names = [];
	for (const item of items) {
		const raw = String(item?.name ?? "");
		const blockName = raw.replace(/^minecraft:/, "");
		if (!blockName || skipName(blockName)) continue;
		names.push(blockName);
	}
	return names;
}

export async function checkBlockShapeCoverage({ log = console.log } = {}) {
	const blockShapes = readJsonc("src/data/blockShapes.json");
	const blockShapeGeos = readJsonc("src/data/blockShapeGeos.json");
	const geoKeys = new Set(Object.keys(blockShapeGeos).filter(k => k !== "$schema"));
	const patterns = Object.entries(blockShapes.patterns ?? {}).map(([rule, shape]) => [
		new RegExp(rule),
		shape
	]);
	const individual = blockShapes.individual_blocks ?? {};

	const mojangBlocks = await fetchMojangBlocks();
	const names = listBlockNames(mojangBlocks);

	const mapped = [];
	const fallbackCube = [];
	const missingShape = [];

	for (const blockName of names) {
		const { shape, fallback } = resolveBlockShapeName(blockName, individual, patterns);
		const family = shapeFamily(shape);
		if (!geoKeys.has(family)) {
			missingShape.push({ blockName, shape, family, fallback });
			continue;
		}
		if (fallback) fallbackCube.push(blockName);
		else mapped.push(blockName);
	}

	log(`pin: ${VANILLA_SAMPLES_TAG}`);
	log(`blocks: ${names.length} (after skip)`);
	log(`mapped: ${mapped.length}`);
	log(`fallback_cube: ${fallbackCube.length}`);
	log(`missing_shape: ${missingShape.length}`);

	if (fallbackCube.length) {
		log("\nfallback_cube:");
		for (const name of fallbackCube) log(`  ${name}`);
	}
	if (missingShape.length) {
		log("\nmissing_shape:");
		for (const row of missingShape) {
			log(`  ${row.blockName} -> ${row.shape} (family ${row.family})`);
		}
	}

	const patches = readJsonc("src/data/textureAtlasMappings.json").blocks_dot_json_patches;
	const [blocksDot, terrain] = await Promise.all([
		fetchJsonc(SAMPLES_BLOCKS_DOT_JSON),
		fetchJsonc(SAMPLES_TERRAIN)
	]);
	const terrainKeys = terrain?.texture_data ?? {};
	const missingBlocksJson = [];
	const missingTerrain = [];
	for (const blockName of names) {
		if (!WOOD_KIND_RE.test(blockName)) continue;
		const { name: mapped } = applyBlocksJsonPatch(blockName, patches);
		const entry = blocksDot[mapped];
		if (!entry) {
			missingBlocksJson.push({ blockName, mapped });
			continue;
		}
		const tex = entry.textures;
		const keys = typeof tex === "string" ? [tex] : Object.values(tex || {});
		for (const key of keys) {
			if (key && !terrainKeys[key]) {
				missingTerrain.push({ blockName, mapped, key });
			}
		}
	}

	log(`wood_missing_blocks_json: ${missingBlocksJson.length}`);
	log(`wood_missing_terrain: ${missingTerrain.length}`);
	if (missingBlocksJson.length) {
		log("\nwood_missing_blocks_json:");
		for (const row of missingBlocksJson) log(`  ${row.blockName} -> ${row.mapped}`);
	}
	if (missingTerrain.length) {
		log("\nwood_missing_terrain:");
		for (const row of missingTerrain) {
			log(`  ${row.blockName} (${row.mapped}) terrain ${row.key}`);
		}
	}

	return {
		pin: VANILLA_SAMPLES_TAG,
		mapped,
		fallbackCube,
		missingShape,
		missingBlocksJson,
		missingTerrain
	};
}

async function fetchJsonc(relPath) {
	const url = `${GITHUB_CDN}/${relPath}`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
	return JSON.parse(stripJsonc(await res.text()));
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
	try {
		const result = await checkBlockShapeCoverage();
		if (result.missingShape.length || result.missingBlocksJson.length || result.missingTerrain.length) {
			process.exitCode = 1;
		}
	} catch (e) {
		console.error(e instanceof Error ? e.message : e);
		process.exitCode = 2;
	}
}
