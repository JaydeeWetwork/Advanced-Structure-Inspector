/**
 * Shared palette + layer grid for tests/sampleStructures writers.
 *
 * writeMcstructure types the output for Bedrock: format_version Int,
 * size/origin List<Int>, v1 layers List<List<Int>>, bool states Byte, other
 * numeric states and `version` Int. Block entity fields passed to putBe should
 * use nbtify types (Int8, Int16, Float32, bigint) where the game expects
 * something other than Int; untyped whole numbers are written as Int.
 */

import fs from "node:fs";
import path from "node:path";
import { writeMcstructure } from "../../src/viewer/core/nbt/mcstructureCodec.js";
import { getStructureIndexFromCoordinates } from "../../src/utils/coordinates.js";

export const SAMPLE_BLOCK_VERSION = 18163713;

/**
 * @param {string} name
 * @param {object} [states]
 * @param {number} [ver]
 */
export function pal(name, states = {}, ver = SAMPLE_BLOCK_VERSION) {
	const n = String(name).includes(":") ? name : `minecraft:${name}`;
	return { name: n, states, version: ver };
}

/**
 * @param {number} sx
 * @param {number} sy
 * @param {number} sz
 * @param {{ floor?: string, fillFloor?: boolean, version?: number }} [opts]
 */
export function grid(sx, sy, sz, opts = {}) {
	const floor = opts.floor ?? "smooth_stone";
	const fillFloor = opts.fillFloor !== false;
	const version = opts.version ?? SAMPLE_BLOCK_VERSION;
	const n = sx * sy * sz;
	const layer0 = new Int32Array(n);
	const layer1 = new Int32Array(n);
	layer0.fill(-1);
	layer1.fill(-1);
	const palette = [pal("air", {}, version), pal(floor, {}, version)];
	const internMap = new Map([[`air|{}|${version}`, 0], [`${floor}|{}|${version}`, 1]]);
	const intern = (name, states = {}, ver = version) => {
		const key = `${name}|${JSON.stringify(states)}|${ver}`;
		if (internMap.has(key)) return internMap.get(key);
		const i = palette.length;
		palette.push(pal(name, states, ver));
		internMap.set(key, i);
		return i;
	};
	const idx = (x, y, z) => getStructureIndexFromCoordinates([x, y, z], [sx, sy, sz]);
	const set = (x, y, z, pi) => {
		if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) {
			throw new Error(`oob ${x},${y},${z} in ${sx}x${sy}x${sz}`);
		}
		layer0[idx(x, y, z)] = pi;
	};
	if (fillFloor) {
		for (let x = 0; x < sx; x++) {
			for (let z = 0; z < sz; z++) set(x, 0, z, 1);
		}
	}
	/** @type {Record<string, { block_entity_data: Record<string, unknown> }>} */
	const bpd = {};
	const putBe = (x, y, z, be) => {
		bpd[String(idx(x, y, z))] = { block_entity_data: { ...be, x, y, z } };
	};
	/** @type {object[]} */
	const entities = [];
	const addEntity = (entity) => {
		entities.push(entity);
		return entity;
	};
	return { sx, sy, sz, intern, set, putBe, addEntity, idx, bpd, palette, layer0, layer1, entities, version };
}

/**
 * @param {ReturnType<typeof grid>} g
 */
export function structureNbt(g) {
	return {
		format_version: 1, // written as TAG_Int by writeMcstructure
		size: new Int32Array([g.sx, g.sy, g.sz]), // written as List<Int>
		structure_world_origin: new Int32Array([0, 0, 0]),
		structure: {
			block_indices: [g.layer0, g.layer1],
			palette: {
				default: {
					block_palette: g.palette,
					block_position_data: g.bpd || {}
				}
			},
			entities: g.entities ?? []
		}
	};
}

/**
 * @param {string} outPath
 * @param {ReturnType<typeof grid>} g
 */
export async function writeSampleNbt(outPath, g) {
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	const bytes = await writeMcstructure(structureNbt(g));
	fs.writeFileSync(outPath, bytes);
	const file = outPath.replace(/^.*[\\/]/, "");
	console.log(
		`wrote ${file}  ${g.sx}×${g.sy}×${g.sz}  palette=${g.palette.length}  ${bytes.byteLength} bytes`
	);
	return bytes;
}
