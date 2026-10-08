/**
 * Unit tests for Bedrock Layers (Node --test).
 * Pure logic + lightweight mocks — no browser / WebGL required.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");

// Minimal DOMException for Node if missing
if (typeof globalThis.DOMException === "undefined") {
	globalThis.DOMException = class DOMException extends Error {
		constructor(message, name = "Error") {
			super(message);
			this.name = name;
		}
	};
}

const { throwIfAborted, isAbortError } = await import("../../src/viewer/abortUtil.js");
const {
	cloneBlockIndices,
	normalizeVec3,
	mergeMultiplePalettesAndIndices,
	IGNORED_BLOCKS
} = await import("../../src/viewer/paletteCore.js");
const {
	getCachedDataFile,
	clearDataFileCache,
	getCachedFileBuild,
	clearAllPreviewCaches
} = await import("../../src/viewer/previewCache.js");
const { countStructureEntities } = await import("../../src/viewer/entityCount.js");
const StructureCatalog = (await import("../../src/viewer/catalog.js")).default;

// ---- abortUtil -----------------------------------------------------------

describe("copper state sample structures", () => {
	async function loadSample(file) {
		const { readMcstructure } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const buf = readFileSync(join(root, "tests/sampleStructures", file));
		return (await readMcstructure(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))).nbt;
	}
	function palNames(nbt) {
		return nbt.structure.palette.default.block_palette.map(b =>
			String(b.name || "").replace(/^minecraft:/, "")
		);
	}

	it("copper_bulbs covers 8 ids × lit × powered_bit", async () => {
		const nbt = await loadSample("copper_bulbs.mcstructure");
		const bulbs = palNames(nbt).filter(n => n.endsWith("copper_bulb"));
		assert.equal(new Set(bulbs).size, 8);
		assert.equal(new Set(bulbs.map((n, i) => {
			const st = nbt.structure.palette.default.block_palette.find(b =>
				String(b.name).replace(/^minecraft:/, "") === n
			);
			return n;
		})).size, 8);
		const variants = nbt.structure.palette.default.block_palette.filter(b =>
			String(b.name).includes("copper_bulb")
		);
		assert.equal(variants.length, 32);
	});

	it("copper_chests covers 8 ids, 4 facings, and east double pairs", async () => {
		const nbt = await loadSample("copper_chests.mcstructure");
		const names = palNames(nbt).filter(n => n.endsWith("copper_chest"));
		assert.equal(new Set(names).size, 8);
		const { applyDoubleChestPalette } = await import("../../src/viewer/doubleChest.js");
		const r = applyDoubleChestPalette(
			nbt,
			nbt.structure.palette.default.block_palette,
			nbt.structure.block_indices
		);
		assert.equal(r.pairedCount, 16);
	});

	it("copper_golems covers 8 ids × 4 poses × 4 facings", async () => {
		const nbt = await loadSample("copper_golems.mcstructure");
		const names = palNames(nbt).filter(n => n.includes("copper_golem_statue"));
		assert.equal(new Set(names).size, 8);
		const bpd = nbt.structure.palette.default.block_position_data || {};
		assert.equal(Object.keys(bpd).length, 128);
		const poses = [0, 0, 0, 0];
		for (const row of Object.values(bpd)) {
			const p = Number(row.block_entity_data?.Pose);
			assert.ok(p >= 0 && p <= 3);
			poses[p]++;
		}
		assert.deepEqual(poses, [32, 32, 32, 32]);
	});
});

describe("straw / shelf / poplar sample structures", () => {
	async function loadSample(file) {
		const { readMcstructure } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const buf = readFileSync(join(root, "tests/sampleStructures", file));
		return (await readMcstructure(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))).nbt;
	}
	function palNames(nbt) {
		return nbt.structure.palette.default.block_palette.map(b =>
			String(b.name || "").replace(/^minecraft:/, "")
		);
	}

	it("straw_beds is four complete NSEW pairs with no occupied/direction extras", async () => {
		const nbt = await loadSample("straw_beds.mcstructure");
		const beds = nbt.structure.palette.default.block_palette.filter(b =>
			String(b.name).endsWith("straw_bed")
		);
		assert.equal(beds.length, 8);
		const cards = new Set(beds.map(b => b.states?.["minecraft:cardinal_direction"]));
		assert.deepEqual([...cards].sort(), ["east", "north", "south", "west"]);
		assert.ok(beds.every(b => b.states?.occupied_bit == null && b.states?.direction == null));
		const [sx, , sz] = [...nbt.size];
		assert.ok(sx >= 10 && sz >= 6);
	});

	it("shelf_mushrooms covers growth 0/1 × 4 cardinals", async () => {
		const nbt = await loadSample("shelf_mushrooms.mcstructure");
		const m = nbt.structure.palette.default.block_palette.filter(b =>
			String(b.name).includes("shelf_mushroom")
		);
		assert.equal(m.length, 8);
	});

	it("poplar_wood covers all 22 poplar block ids including three leaf colors", async () => {
		const nbt = await loadSample("poplar_wood.mcstructure");
		const ids = new Set(palNames(nbt).filter(n => /poplar/.test(n)));
		for (const need of [
			"poplar_log",
			"poplar_wood",
			"stripped_poplar_log",
			"stripped_poplar_wood",
			"poplar_planks",
			"poplar_slab",
			"poplar_stairs",
			"poplar_fence",
			"poplar_fence_gate",
			"poplar_door",
			"poplar_trapdoor",
			"poplar_button",
			"poplar_pressure_plate",
			"poplar_standing_sign",
			"poplar_wall_sign",
			"poplar_hanging_sign",
			"poplar_shelf",
			"poplar_sapling",
			"orange_poplar_leaves",
			"red_poplar_leaves",
			"yellow_poplar_leaves"
		]) {
			assert.ok(ids.has(need), need);
		}
		assert.equal(ids.size, 22);
	});
});

// ---- sample structure smoke (optional nbtify) --------------

describe("sample structure parse (optional nbtify)", () => {
	const samplePath = join(root, "tests/sampleStructures/hoppers.mcstructure");

	it("parses hoppers.mcstructure NBT and counts entities", async (t) => {
		let NBT;
		try {
			// Resolved from tests/viewerUnit/node_modules when run with cwd=viewerUnit
			NBT = await import("nbtify-readonly-typeless");
		} catch {
			t.skip("nbtify-readonly-typeless not installed in this environment");
			return;
		}
		const buf = readFileSync(samplePath);
		const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		const data = (await NBT.read(ab, { endian: "little", strict: false })).data;
		const size = normalizeVec3(data.size);
		assert.ok(size.some(n => n > 0), "structure size should be non-zero");
		assert.ok(data.structure?.palette?.default?.block_palette?.length > 0);
		const entityCount = countStructureEntities(data);
		assert.equal(typeof entityCount, "number");
		assert.ok(entityCount >= 0);
	});
});

// ---- PreviewRenderer dispose shape (static options exist) ----------------
