/**
 * Histogram material counts must match the old per-cell walk.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function stripName(name) {
	if (typeof name === "string") return name.replace(/^minecraft:/, "");
	if (name && typeof name === "object" && "value" in name) {
		const v = name.value;
		if (typeof v === "string") return v.replace(/^minecraft:/, "");
	}
	return null;
}

function legacyMaterialList(data, blockToMaterial, formatMaterialLabel, getStackSize, partitionCount, formatPartition) {
	const palette = data?.structure?.palette?.default?.block_palette ?? [];
	const paletteList = Array.isArray(palette) || ArrayBuffer.isView(palette) ? [...palette] : [];
	const layers = data?.structure?.block_indices ?? [];
	const counts = new Map();
	const addPaletteIndex = (paletteI, layerI) => {
		const n = Number(paletteI);
		if (!Number.isFinite(n) || n < 0) return;
		const block = paletteList[n];
		if (!block) return;
		const name = stripName(block?.name);
		const mapped = blockToMaterial(name, block, layerI);
		if (!mapped) return;
		counts.set(mapped.material, (counts.get(mapped.material) ?? 0) + mapped.mult);
	};
	layers.forEach((layer, layerI) => {
		if (!layer || !(Array.isArray(layer) || ArrayBuffer.isView(layer))) return;
		for (const idx of layer) addPaletteIndex(idx, layerI);
	});
	const rows = [...counts.entries()].map(([id, raw]) => {
		const count = Number.isInteger(raw) ? raw : Math.ceil(raw - 1e-9);
		const finalCount = count < 1 && raw > 0 ? 1 : count;
		const stackSize = getStackSize(id);
		const part = partitionCount(finalCount, stackSize);
		return {
			id,
			label: formatMaterialLabel(id),
			count: finalCount,
			stackSize: part.stackSize,
			shulkers: part.shulkers,
			stacks: part.stacks,
			loose: part.loose,
			partition: formatPartition(part)
		};
	});
	rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
	return rows;
}

describe("material list histogram", async () => {
	const materialList = await import("../../src/viewer/materialList.js");
	const { readMcstructure } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");

	it("matches a per-cell count on every sample structure", async () => {
		const dir = join(root, "tests/sampleStructures");
		const files = readdirSync(dir).filter(name => name.endsWith(".mcstructure"));
		assert.ok(files.length > 0);
		for (const name of files) {
			const buf = readFileSync(join(dir, name));
			const { nbt } = await readMcstructure(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
			const legacy = legacyMaterialList(
				nbt,
				materialList.blockToMaterial,
				materialList.formatMaterialLabel,
				materialList.getStackSize,
				materialList.partitionCount,
				materialList.formatPartition
			);
			assert.deepEqual(materialList.buildMaterialListFromNbt(nbt), legacy, name);
		}
	});

	it("logs a missing bed color at most once", () => {
		const errors = [];
		const orig = console.error;
		console.error = (...args) => {
			errors.push(args.join(" "));
		};
		try {
			const cells = 64 * 64 * 64;
			const data = {
				structure: {
					palette: {
						default: {
							block_palette: [
								{ name: "bed" },
								{ name: "red_bed", block_entity_data: {} }
							]
						}
					},
					block_indices: [new Int32Array(cells).fill(0), new Int32Array([1])]
				}
			};
			materialList.buildMaterialListFromNbt(data);
		} finally {
			console.error = orig;
		}
		const bedErrors = errors.filter(line => line.includes("bed"));
		assert.ok(bedErrors.length <= 1, `expected at most one bed error, got ${bedErrors.length}`);
	});

	it("does not log for prototype property names", () => {
		const errors = [];
		const orig = console.error;
		console.error = (...args) => {
			errors.push(args.join(" "));
		};
		try {
			const names = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"];
			materialList.buildMaterialListFromNbt({
				structure: {
					palette: { default: { block_palette: names.map(name => ({ name })) } },
					block_indices: [Int32Array.from(names.keys()), new Int32Array(names.length).fill(-1)]
				}
			});
		} finally {
			console.error = orig;
		}
		assert.deepEqual(errors, []);
	});
});
