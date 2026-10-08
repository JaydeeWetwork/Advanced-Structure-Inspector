/**
 * Write tests/sampleStructures/format_v2_two_layer_water_plants.mcstructure:
 * water_plants.mcstructure re-saved in the version 2 layout with both layers kept
 * (format_version Int 2, block_indices List<Int_Array> ×2). Every other tag is
 * copied with its original type. This is a converted file, not an in-game save;
 * it covers the v2 case where the second (waterlog) layer is present.
 *
 * The single-layer v2 fixture (format_v2_single_layer_redstone_dust.mcstructure)
 * is a real Minecraft save and is not generated.
 *
 * Usage (repo root):
 *   node scripts/make-v2-two-layer-fixture.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Int32, write } from "nbtify";
import { readMcstructure } from "../src/viewer/core/nbt/mcstructureCodec.js";
import { readMcstructureTyped } from "../src/viewer/core/nbt/mcstructureTyped.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "tests", "sampleStructures", "water_plants.mcstructure");
const OUT = path.join(ROOT, "tests", "sampleStructures", "format_v2_two_layer_water_plants.mcstructure");

const raw = fs.readFileSync(SRC);
const { nbt } = await readMcstructureTyped(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
nbt.format_version = new Int32(2);
nbt.structure.block_indices = nbt.structure.block_indices.map(
	layer => Int32Array.from(layer, n => Number(n))
);
// nbtify write directly (not writeMcstructure) so the all-present second layer is kept as-is.
const bytes = new Uint8Array(await write(nbt, { endian: "little", compression: null, bedrockLevel: false, rootName: "" }));
const check = await readMcstructure(bytes);
fs.writeFileSync(OUT, bytes);
console.log(`wrote ${path.relative(ROOT, OUT)}  ${bytes.byteLength} bytes  volume=${check.diagnostics.volume}`);
