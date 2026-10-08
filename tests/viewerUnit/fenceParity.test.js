/**
 * Precomputed fence and pane links must match the per-cell walk.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getStructureIndexFromCoordinates } from "../../src/utils/coordinates.js";
import { resolveBlockShapeName } from "../../src/viewer/appearanceFallback.js";
import { shapeFamily } from "../../src/viewer/occupancySkip.js";
import {
	applyNeighborConnections,
	isFenceBlockName,
	isGlassPaneName
} from "../../src/viewer/fenceConnections.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const DIRS = [
	["minecraft:connection_east", 1, 0],
	["minecraft:connection_west", -1, 0],
	["minecraft:connection_south", 0, 1],
	["minecraft:connection_north", 0, -1]
];

function connectionIsOn(value) {
	return value === 1 || value === true || value === "1" || value === "true";
}

function hasStoredConnections(states) {
	if (!states) return false;
	return DIRS.some(([key]) => connectionIsOn(states[key]));
}

const FAMILIES = [
	{
		label: "fence connections",
		isSource: isFenceBlockName,
		connect: n => isFenceBlockName(n) || /fence_gate$/.test(n),
		skip: /glass|leaves|barrier/
	},
	{
		label: "glass pane connections",
		isSource: isGlassPaneName,
		connect: n => isGlassPaneName(n) || /_bars$/.test(n),
		skip: /leaves|barrier/
	}
];

function links(name, shapeOf, family) {
	const n = String(name || "").replace(/^minecraft:/, "");
	if (!n || n === "air" || n === "cave_air" || n === "void_air") return false;
	if (family.connect(n)) return true;
	const shape = shapeOf(n);
	if (shape === "double_slab") return true;
	if (shape !== "block") return false;
	if (family.skip.test(n)) return false;
	return true;
}

function shapeOfFromTable(blockShapes) {
	const individual = blockShapes?.individual_blocks ?? {};
	const patterns = Object.entries(blockShapes?.patterns ?? {}).map(
		([rule, shape]) => [new RegExp(rule), shape]
	);
	return name => shapeFamily(resolveBlockShapeName(
		String(name || "").replace(/^minecraft:/, ""),
		individual,
		patterns
	).shape);
}

function familyFor(name, families) {
	for (const family of families) {
		if (family.isSource(name)) return family;
	}
	return null;
}

/** Previous per-cell walk, kept as the equivalence reference. */
function stampReference(size, palette, indices, blockShapes) {
	const families = FAMILIES;
	const sx = Number(size?.[0] ?? 0);
	const sy = Number(size?.[1] ?? 0);
	const sz = Number(size?.[2] ?? 0);
	const layerSrc = indices?.[0];
	if (!layerSrc || !sx || !sy || !sz || !palette?.length) {
		return { palette, indices, linked: 0 };
	}
	const shapeOf = shapeOfFromTable(blockShapes);
	const layer0 = layerSrc instanceof Int32Array ? new Int32Array(layerSrc) : Int32Array.from(layerSrc);
	const nextPalette = palette.slice();
	const structureSize = [sx, sy, sz];
	let linked = 0;
	for (let x = 0; x < sx; x++) {
		for (let y = 0; y < sy; y++) {
			for (let z = 0; z < sz; z++) {
				const flat = getStructureIndexFromCoordinates([x, y, z], structureSize);
				const pi = Number(layer0[flat] ?? -1);
				if (pi < 0) continue;
				const block = nextPalette[pi];
				const family = block && familyFor(block.name, families);
				if (!family) continue;
				if (hasStoredConnections(block.states)) continue;
				const states = { ...(block.states || {}) };
				let any = false;
				for (const [key, dx, dz] of DIRS) {
					const nx = x + dx;
					const nz = z + dz;
					let on = 0;
					if (nx >= 0 && nz >= 0 && nx < sx && nz < sz) {
						const nFlat = getStructureIndexFromCoordinates([nx, y, nz], structureSize);
						const npi = Number(layer0[nFlat] ?? -1);
						const neighbor = npi >= 0 ? nextPalette[npi] : null;
						if (neighbor && links(neighbor.name, shapeOf, family)) on = 1;
					}
					states[key] = on;
					if (on) any = true;
				}
				if (!any) continue;
				const variantKey = `${block.name}|${DIRS.map(([key]) => states[key]).join("")}|${JSON.stringify(block.states ?? {})}|${JSON.stringify(block.block_entity_data ?? null)}`;
				let newPi = nextPalette.findIndex((row, index) => index >= palette.length && variantKey === row.__variantKey);
				if (newPi < 0) {
					newPi = nextPalette.length;
					nextPalette.push({ ...block, states, __variantKey: variantKey });
				}
				layer0[flat] = newPi;
				linked++;
			}
		}
	}
	return {
		linked,
		cells: [...layer0].map(pi => {
			const block = nextPalette[pi];
			if (!block) return null;
			return { name: block.name, states: block.states ?? null };
		})
	};
}

function cellsOf(result) {
	return [...result.indices[0]].map(pi => {
		if (pi < 0) return null;
		const block = result.palette[pi];
		if (!block) return null;
		return { name: block.name, states: block.states ?? null };
	});
}

function assertSame(size, palette, indices, shapes, label) {
	const reference = stampReference(size, palette, indices, shapes);
	const got = applyNeighborConnections(size, palette, indices, shapes);
	assert.equal(got.linked, reference.linked, label);
	assert.deepEqual(cellsOf(got), reference.cells, label);
}

describe("fence connection parity", () => {
	it("matches the per-cell walk on a seeded 32³ grid", () => {
		const sx = 32;
		const sy = 32;
		const sz = 32;
		const names = ["oak_fence", "glass_pane", "stone", "oak_stairs", "glass", "cobblestone_wall", "air"];
		let seed = 0xC0FFEE;
		const next = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			return seed;
		};
		const palette = names.map(name => ({ name, states: {} }));
		const layer = new Int32Array(sx * sy * sz);
		for (let i = 0; i < layer.length; i++) layer[i] = next() % names.length;
		const indices = [layer, new Int32Array(layer.length).fill(-1)];
		assertSame([sx, sy, sz], palette, indices, null, "random grid");
	});

	it("matches the per-cell walk on fence and pane samples", async () => {
		const { readMcstructure } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const dir = join(root, "tests/sampleStructures");
		const files = readdirSync(dir).filter(name => /fence|pane|bar/i.test(name) && name.endsWith(".mcstructure"));
		assert.ok(files.length > 0, "expected fence or pane samples");
		for (const name of files) {
			const buf = readFileSync(join(dir, name));
			const { nbt } = await readMcstructure(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
			const palette = [...(nbt.structure?.palette?.default?.block_palette ?? [])];
			const indices = nbt.structure.block_indices;
			assertSame(nbt.size, palette, indices, null, name);
		}
	});
});
