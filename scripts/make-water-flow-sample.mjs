/**
 * Contained Bedrock water for the sample set.
 *
 * tests/sampleStructures/water.mcstructure is one source on glass.
 * liquid_depth equals Manhattan distance from that source, orthogonal
 * only, 0 through 7. Depth 7 does not spread. Depth 8 and above is the
 * falling bit; this pool does not use it, because an open falling column
 * becomes sources and floods. Glass is under every water cell and on
 * every orthogonal side that is not water, and the outer ring is glass.
 *
 * tests/sampleStructures/second_layer.mcstructure keeps its blocks.
 * Layer-0 flowing water is removed. A waterlog stays only as a source
 * (liquid_depth 0) on a block that holds water. Other waterlogs are removed.
 *
 * Usage (repo root):
 *   node scripts/make-water-flow-sample.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeMcstructure } from "../src/viewer/core/nbt/mcstructureCodec.js";
import { readMcstructureTyped } from "../src/viewer/core/nbt/mcstructureTyped.js";
import { getStructureIndexFromCoordinates } from "../src/utils/coordinates.js";
import { FLUID_FLOW, letsFluidThrough } from "./lib/fluidNeighbors.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WATER_OUT = path.join(ROOT, "tests", "sampleStructures", "water.mcstructure");
const SECOND_OUT = path.join(ROOT, "tests", "sampleStructures", "second_layer.mcstructure");

const VER = 18168865;
const SX = 17;
const SY = 2;
const SZ = 17;
const CX = 8;
const CZ = 8;
const WY = 1;

/** Blocks in second_layer that keep a source waterlog. */
const HOLDS_WATER = new Set([
	"mangrove_propagule",
	"big_dripleaf",
	"end_rod",
	"purpur_stairs"
]);

function bare(name) {
	return String(name ?? "").replace(/^minecraft:/, "");
}

function stateNumber(v) {
	if (v == null) return null;
	if (typeof v === "object" && "value" in v) return Number(v.value);
	return Number(v);
}

/**
 * @param {number} sx
 * @param {number} sy
 * @param {number} sz
 */
function indexOf(sx, sy, sz) {
	return (x, y, z) => getStructureIndexFromCoordinates([x, y, z], [sx, sy, sz]);
}

async function writeFlowPool() {
	const n = SX * SY * SZ;
	const layer0 = new Int32Array(n);
	const layer1 = new Int32Array(n);
	layer0.fill(-1);
	layer1.fill(-1);
	/** @type {{ name: string, states: Record<string, unknown>, version: number }[]} */
	const palette = [];
	const internMap = new Map();
	const intern = (name, states = {}) => {
		const key = `${name}|${JSON.stringify(states)}`;
		if (internMap.has(key)) return internMap.get(key);
		const i = palette.length;
		palette.push({ name, states, version: VER });
		internMap.set(key, i);
		return i;
	};
	const glass = intern("minecraft:glass");
	const waterAt = (depth) => intern("minecraft:water", { liquid_depth: depth });
	const idx = indexOf(SX, SY, SZ);
	const get = (x, y, z) => layer0[idx(x, y, z)];
	const set = (x, y, z, pi) => {
		layer0[idx(x, y, z)] = pi;
	};

	for (let x = 0; x < SX; x++) {
		for (let z = 0; z < SZ; z++) set(x, 0, z, glass);
	}
	for (let dz = -7; dz <= 7; dz++) {
		for (let dx = -7; dx <= 7; dx++) {
			const depth = Math.abs(dx) + Math.abs(dz);
			if (depth > 7) continue;
			set(CX + dx, WY, CZ + dz, waterAt(depth));
		}
	}

	const dirs = FLUID_FLOW.filter(([, dy]) => dy === 0).map(([dx, , dz]) => [dx, dz]);
	/** @type {number[][]} */
	const walls = [];
	for (let x = 0; x < SX; x++) {
		for (let z = 0; z < SZ; z++) {
			if (get(x, WY, z) < 0) continue;
			for (const [dx, dz] of dirs) {
				const nx = x + dx;
				const nz = z + dz;
				if (nx < 0 || nz < 0 || nx >= SX || nz >= SZ) {
					throw new Error(`water meets the sample edge at ${x},${WY},${z}`);
				}
				const npi = get(nx, WY, nz);
				const neighbor = npi >= 0 ? bare(palette[npi].name) : "";
				if (letsFluidThrough(neighbor)) walls.push([nx, nz]);
			}
		}
	}
	for (const [x, z] of walls) {
		if (get(x, WY, z) < 0) set(x, WY, z, glass);
	}
	for (let x = 0; x < SX; x++) {
		if (get(x, WY, 0) < 0) set(x, WY, 0, glass);
		if (get(x, WY, SZ - 1) < 0) set(x, WY, SZ - 1, glass);
	}
	for (let z = 0; z < SZ; z++) {
		if (get(0, WY, z) < 0) set(0, WY, z, glass);
		if (get(SX - 1, WY, z) < 0) set(SX - 1, WY, z, glass);
	}

	let sources = 0;
	const depthCount = new Map();
	for (let x = 0; x < SX; x++) {
		for (let z = 0; z < SZ; z++) {
			const pi = get(x, WY, z);
			if (pi < 0 || bare(palette[pi].name) !== "water") continue;
			const depth = stateNumber(palette[pi].states.liquid_depth);
			const expect = Math.abs(x - CX) + Math.abs(z - CZ);
			if (depth !== expect || depth > 7) {
				throw new Error(`depth ${depth} at ${x},${z}, manhattan ${expect}`);
			}
			if (get(x, 0, z) !== glass) throw new Error(`no glass under ${x},${z}`);
			if (x === 0 || z === 0 || x === SX - 1 || z === SZ - 1) {
				throw new Error(`water on the outer face at ${x},${z}`);
			}
			if (depth === 0) sources++;
			depthCount.set(depth, (depthCount.get(depth) || 0) + 1);
			for (const [dx, dz] of dirs) {
				const npi = get(x + dx, WY, z + dz);
				const neighbor = npi >= 0 ? bare(palette[npi].name) : "air";
				if (depth < 7 && neighbor !== "water") {
					throw new Error(`depth ${depth} at ${x},${z} touches ${neighbor}`);
				}
				if (neighbor === "water") {
					const nd = stateNumber(palette[npi].states.liquid_depth);
					const step = Math.abs(nd - depth);
					if (step !== 1 && !(depth === 0 && nd === 0)) {
						throw new Error(`depth jump ${depth} to ${nd} at ${x},${z}`);
					}
				} else if (neighbor !== "glass") {
					throw new Error(`depth ${depth} at ${x},${z} touches ${neighbor}`);
				}
			}
		}
	}
	if (sources !== 1) throw new Error(`${sources} sources`);
	if (depthCount.get(0) !== 1 || depthCount.get(7) !== 28) {
		throw new Error(`depth counts ${[...depthCount.entries()].join(" ")}`);
	}

	const bytes = await writeMcstructure({
		format_version: 1,
		size: new Int32Array([SX, SY, SZ]),
		structure_world_origin: new Int32Array([0, 0, 0]),
		structure: {
			block_indices: [layer0, layer1],
			palette: { default: { block_palette: palette, block_position_data: {} } },
			entities: []
		}
	});
	fs.writeFileSync(WATER_OUT, Buffer.from(bytes));
	console.log(`wrote water.mcstructure  ${SX}x${SY}x${SZ}  palette=${palette.length}  water=${[...depthCount.values()].reduce((a, b) => a + b, 0)}  ${bytes.byteLength} bytes`);
}

async function stripSecondLayer() {
	const buf = fs.readFileSync(SECOND_OUT);
	const { nbt } = await readMcstructureTyped(buf);
	const pal = nbt.structure.palette.default.block_palette;
	const layers = nbt.structure.block_indices;
	if (!Array.isArray(layers) || layers.length < 2) throw new Error("second_layer needs two layers");
	const be = nbt.structure.palette.default.block_position_data ?? {};
	const beCount = Object.keys(be).length;

	let sourcePi = -1;
	for (let i = 0; i < pal.length; i++) {
		if (bare(pal[i].name) === "water" && stateNumber(pal[i].states?.liquid_depth) === 0) {
			sourcePi = i;
			break;
		}
	}
	if (sourcePi < 0) {
		pal.push({
			name: "minecraft:water",
			states: { liquid_depth: 0 },
			version: pal[0]?.version ?? VER
		});
		sourcePi = pal.length - 1;
	}

	const l0 = layers[0];
	const l1 = layers[1];
	let cleared = 0;
	let kept = 0;
	let dropped = 0;
	for (let i = 0; i < l0.length; i++) {
		const hostPi = Number(l0[i]);
		const waterPi = Number(l1[i]);
		const host = hostPi >= 0 ? bare(pal[hostPi].name) : "";
		if (host === "water") {
			l0[i] = -1;
			cleared++;
		}
		if (waterPi >= 0 && bare(pal[waterPi].name) === "water") {
			if (HOLDS_WATER.has(host)) {
				l1[i] = sourcePi;
				kept++;
			} else {
				l1[i] = -1;
				dropped++;
			}
		}
	}

	const bytes = await writeMcstructure(nbt);
	fs.writeFileSync(SECOND_OUT, Buffer.from(bytes));

	const check = await readMcstructureTyped(fs.readFileSync(SECOND_OUT));
	const cpal = check.nbt.structure.palette.default.block_palette;
	const [c0, c1] = check.nbt.structure.block_indices;
	const cbe = Object.keys(check.nbt.structure.palette.default.block_position_data ?? {}).length;
	if (cbe !== beCount) throw new Error(`block entities ${beCount} -> ${cbe}`);
	if (Number(check.nbt.format_version) !== 1) throw new Error("second_layer format_version changed");
	for (let i = 0; i < c0.length; i++) {
		const a = Number(c0[i]);
		const b = Number(c1[i]);
		if (a >= 0 && bare(cpal[a].name) === "water") throw new Error("layer-0 water remains");
		if (b >= 0 && bare(cpal[b].name) === "water") {
			const host = a >= 0 ? bare(cpal[a].name) : "";
			const depth = stateNumber(cpal[b].states?.liquid_depth);
			if (!HOLDS_WATER.has(host) || depth !== 0) {
				throw new Error(`illegal waterlog on ${host} depth ${depth}`);
			}
		}
	}
	console.log(`patched second_layer.mcstructure  cleared layer0=${cleared}  waterlog source=${kept}  waterlog removed=${dropped}  blockEntities=${cbe}  ${bytes.byteLength} bytes`);
}

await writeFlowPool();
await stripSecondLayer();
