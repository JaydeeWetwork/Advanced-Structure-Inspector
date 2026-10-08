/**
 * Close every water or lava cell that can flow out of a sample.
 *
 * Sources are layer-0 water and lava, layer-1 water on waterlogged
 * blocks, and blocks Minecraft turns into sources when placed: a living
 * sea pickle, or a living coral fan that is not already waterlogged.
 * Bedrock spreads that water orthogonally into air and downward. It does
 * not spread upward. A neighbor that is already a block stops that step.
 * Buttons, air, and blocks water breaks do not stop a step. Those faces
 * become glass, and that glass is not itself waterlogged. A face on the
 * sample edge grows the volume unless allowGrow is false.
 *
 * The version-2 water-plant fixture is rebuilt from water_plants after
 * this run: node scripts/make-v2-two-layer-fixture.mjs
 *
 * Usage (repo root):
 *   node scripts/seal-water-sources.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Float32, Int32 } from "nbtify";
import { writeMcstructure } from "../src/viewer/core/nbt/mcstructureCodec.js";
import { readMcstructureTyped } from "../src/viewer/core/nbt/mcstructureTyped.js";
import { getCoordinatesFromStructureIndex, getStructureIndexFromCoordinates } from "../src/utils/coordinates.js";
import { FLUID_FLOW, FLUID_IDS, bareBlockName, letsFluidThrough, placedAsFluidSource } from "./lib/fluidNeighbors.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLES = path.join(ROOT, "tests", "sampleStructures");

const bare = bareBlockName;

function decode(i, sy, sz) {
	return getCoordinatesFromStructureIndex(i, [0, sy, sz]);
}

function encode(x, y, z, sy, sz) {
	return getStructureIndexFromCoordinates([x, y, z], [0, sy, sz]);
}

function addDelta(v, d) {
	if (!d) return v;
	const n = Number(v) + d;
	if (v instanceof Float32) return new Float32(n);
	if (v instanceof Int32) return new Int32(n);
	return n;
}

/**
 * Glass in every open flow face. `allowGrow` false throws instead of padding,
 * for a structure whose size is already fixed.
 * @param {Record<string, any>} nbt typed root, mutated in place
 * @param {{ allowGrow?: boolean }} [opts]
 * @returns {{ faces: number, edge: number, air: number, replaced: number, sx: number, sy: number, sz: number, nsx: number, nsy: number, nsz: number } | null}
 */
export function sealLiquidLeaks(nbt, { allowGrow = true } = {}) {
	const [sx, sy, sz] = [...nbt.size].map(Number);
	const origin = [...nbt.structure_world_origin].map(Number);
	const pal = nbt.structure.palette.default.block_palette;
	const l0 = nbt.structure.block_indices[0];
	const l1 = nbt.structure.block_indices[1];
	if (!l0) throw new Error("structure is missing a layer");

	const nameAt = (x, y, z) => {
		if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return null;
		const pi = Number(l0[encode(x, y, z, sy, sz)]);
		if (pi < 0) return "";
		const name = bare(pal[pi].name);
		// A saved minecraft:air block flows just like an empty cell.
		if (name === "air" || name === "cave_air" || name === "void_air") return "";
		return name;
	};

	/** @type {{ x: number, y: number, z: number, nx: number, ny: number, nz: number, kind: string }[]} */
	const leaks = [];
	for (let y = 0; y < sy; y++) {
		for (let z = 0; z < sz; z++) {
			for (let x = 0; x < sx; x++) {
				const i = encode(x, y, z, sy, sz);
				const a = Number(l0[i]);
				const b = l1 ? Number(l1[i]) : -1;
				const aName = a >= 0 ? bare(pal[a].name) : "";
				const bName = b >= 0 ? bare(pal[b].name) : "";
				const waterlogged = FLUID_IDS.has(bName);
				const becomesSource = a >= 0 && placedAsFluidSource(aName, pal[a].states, waterlogged);
				if (!FLUID_IDS.has(aName) && !waterlogged && !becomesSource) continue;
				for (const [dx, dy, dz] of FLUID_FLOW) {
					const nx = x + dx;
					const ny = y + dy;
					const nz = z + dz;
					const neighbor = nameAt(nx, ny, nz);
					if (neighbor == null) leaks.push({ x, y, z, nx, ny, nz, kind: "edge" });
					else if (letsFluidThrough(neighbor)) {
						leaks.push({ x, y, z, nx, ny, nz, kind: neighbor === "" ? "air" : neighbor });
					}
				}
			}
		}
	}
	if (leaks.length === 0) return null;
	if (!allowGrow) {
		for (const leak of leaks) {
			if (leak.nx < 0 || leak.ny < 0 || leak.nz < 0 || leak.nx >= sx || leak.ny >= sy || leak.nz >= sz) {
				throw new Error(`seal would grow the structure for ${leak.x},${leak.y},${leak.z}`);
			}
		}
	}

	const pad = [0, 0, 0];
	const padHi = [0, 0, 0];
	for (const leak of leaks) {
		if (leak.nx < 0) pad[0] = 1;
		if (leak.ny < 0) pad[1] = 1;
		if (leak.nz < 0) pad[2] = 1;
		if (leak.nx >= sx) padHi[0] = 1;
		if (leak.ny >= sy) padHi[1] = 1;
		if (leak.nz >= sz) padHi[2] = 1;
	}
	const nsx = sx + pad[0] + padHi[0];
	const nsy = sy + pad[1] + padHi[1];
	const nsz = sz + pad[2] + padHi[2];
	const n0 = new Int32Array(nsx * nsy * nsz);
	const n1 = new Int32Array(nsx * nsy * nsz);
	n0.fill(-1);
	n1.fill(-1);
	for (let y = 0; y < sy; y++) {
		for (let z = 0; z < sz; z++) {
			for (let x = 0; x < sx; x++) {
				const from = encode(x, y, z, sy, sz);
				const to = encode(x + pad[0], y + pad[1], z + pad[2], nsy, nsz);
				n0[to] = Number(l0[from]);
				n1[to] = l1 ? Number(l1[from]) : -1;
			}
		}
	}

	let glass = -1;
	for (let i = 0; i < pal.length; i++) {
		const states = pal[i].states ?? {};
		if (bare(pal[i].name) === "glass" && Object.keys(states).length === 0) {
			glass = i;
			break;
		}
	}
	if (glass < 0) {
		pal.push({
			name: "minecraft:glass",
			states: {},
			version: pal[0]?.version ?? 18163713
		});
		glass = pal.length - 1;
	}

	let replaced = 0;
	for (const leak of leaks) {
		const nx = leak.nx + pad[0];
		const ny = leak.ny + pad[1];
		const nz = leak.nz + pad[2];
		if (nx < 0 || ny < 0 || nz < 0 || nx >= nsx || ny >= nsy || nz >= nsz) {
			throw new Error(`pad missed ${nx},${ny},${nz}`);
		}
		const ni = encode(nx, ny, nz, nsy, nsz);
		const existing = n0[ni];
		const existingName = existing >= 0 ? bare(pal[existing].name) : "";
		const flows = letsFluidThrough(existing < 0 ? "" : existingName);
		if (!flows) continue;
		if (existing >= 0) replaced++;
		n0[ni] = glass;
		n1[ni] = -1;
	}

	const beIn = nbt.structure.palette.default.block_position_data ?? {};
	/** @type {Record<string, unknown>} */
	const beOut = {};
	for (const [key, value] of Object.entries(beIn)) {
		const [x, y, z] = decode(Number(key), sy, sz);
		const nx = x + pad[0];
		const ny = y + pad[1];
		const nz = z + pad[2];
		const data = value?.block_entity_data;
		if (data && "x" in data) data.x = addDelta(data.x, pad[0]);
		if (data && "y" in data) data.y = addDelta(data.y, pad[1]);
		if (data && "z" in data) data.z = addDelta(data.z, pad[2]);
		beOut[String(encode(nx, ny, nz, nsy, nsz))] = value;
	}
	nbt.structure.palette.default.block_position_data = beOut;

	const entities = nbt.structure.entities ?? [];
	for (const entity of entities) {
		if (!Array.isArray(entity.Pos)) continue;
		entity.Pos = entity.Pos.map((n, i) => addDelta(n, pad[i] || 0));
	}

	nbt.size = new Int32Array([nsx, nsy, nsz]);
	nbt.structure.block_indices = [n0, n1];

	for (let y = 0; y < nsy; y++) {
		for (let z = 0; z < nsz; z++) {
			for (let x = 0; x < nsx; x++) {
				const i = encode(x, y, z, nsy, nsz);
				const host = n0[i] >= 0 ? pal[n0[i]] : null;
				const aName = host ? bare(host.name) : "";
				const bName = n1[i] >= 0 ? bare(pal[n1[i]].name) : "";
				const waterlogged = FLUID_IDS.has(bName);
				const becomesSource = host && placedAsFluidSource(aName, host.states, waterlogged);
				if (!FLUID_IDS.has(aName) && !waterlogged && !becomesSource) continue;
				for (const [dx, dy, dz] of FLUID_FLOW) {
					const nx = x + dx;
					const ny = y + dy;
					const nz = z + dz;
					if (nx < 0 || ny < 0 || nz < 0 || nx >= nsx || ny >= nsy || nz >= nsz) {
						throw new Error(`still open at ${x},${y},${z}`);
					}
					const ni = n0[encode(nx, ny, nz, nsy, nsz)];
					const nName = ni >= 0 ? bare(pal[ni].name) : "";
					if (letsFluidThrough(ni < 0 ? "" : nName)) {
						throw new Error(`air beside ${x},${y},${z}`);
					}
				}
			}
		}
	}
	for (const [key, value] of Object.entries(beOut)) {
		const [x, y, z] = decode(Number(key), nsy, nsz);
		const data = value?.block_entity_data ?? {};
		if (Number(data.x) !== origin[0] + x || Number(data.y) !== origin[1] + y || Number(data.z) !== origin[2] + z) {
			throw new Error(`block entity ${key} is not on its cell`);
		}
	}

	const edge = leaks.filter(l => l.kind === "edge").length;
	const air = leaks.filter(l => l.kind === "air").length;
	return {
		faces: leaks.length,
		edge,
		air,
		replaced,
		sx,
		sy,
		sz,
		nsx,
		nsy,
		nsz
	};
}

/**
 * @param {string} file
 */
async function sealFile(file) {
	const raw = fs.readFileSync(file);
	const { nbt } = await readMcstructureTyped(raw);
	const result = sealLiquidLeaks(nbt);
	if (!result) return null;
	const bytes = await writeMcstructure(nbt);
	fs.writeFileSync(file, Buffer.from(bytes));
	const entities = nbt.structure.entities ?? [];
	const beOut = nbt.structure.palette.default.block_position_data ?? {};
	console.log(
		`sealed ${path.basename(file)}  ${result.sx}x${result.sy}x${result.sz} -> ${result.nsx}x${result.nsy}x${result.nsz}  faces=${result.faces} (edge=${result.edge} air=${result.air} replaced=${result.replaced})  entities=${entities.length}  blockEntities=${Object.keys(beOut).length}`
	);
	return path.basename(file);
}

function sameScript(invoked) {
	if (!invoked) return false;
	try {
		return fs.realpathSync(invoked).toLowerCase() === fs.realpathSync(fileURLToPath(import.meta.url)).toLowerCase();
	} catch {
		return path.resolve(invoked).toLowerCase() === path.resolve(fileURLToPath(import.meta.url)).toLowerCase();
	}
}
if (sameScript(process.argv[1])) {
	const names = fs.readdirSync(SAMPLES).filter(name => name.endsWith(".mcstructure") && name !== "format_v2_two_layer_water_plants.mcstructure");
	const changed = [];
	for (const name of names) {
		const result = await sealFile(path.join(SAMPLES, name));
		if (result) changed.push(result);
	}
	console.log(changed.length ? `changed ${changed.join(", ")}` : "no open water");
}
