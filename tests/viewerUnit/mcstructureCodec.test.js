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
const previewCompressionFixture = join(__dirname, "fixtures/preview-26.60.30-compression1-all-rotations.mcstructure");

async function mcstructureWithCompression(structure, compression = 1, size = [1, 1, 1]) {
	const { write, Int32 } = await import("nbtify");
	return write({
		format_version: new Int32(2),
		compression: new Int32(compression),
		size: size.map(n => new Int32(n)),
		structure,
		structure_world_origin: [new Int32(0), new Int32(0), new Int32(0)]
	}, { endian: "little", compression: null, bedrockLevel: false, rootName: "" });
}

function stoneCompound(layers = [new Int32Array([0])]) {
	return {
		block_indices: layers,
		entities: [],
		palette: {
			default: {
				block_palette: [{ name: "minecraft:stone", states: {} }],
				block_position_data: {}
			}
		}
	};
}

async function deflatedStone() {
	const { write } = await import("nbtify");
	const { deflateSync } = await import("node:zlib");
	const inner = await write(stoneCompound(), {
		endian: "little",
		compression: null,
		bedrockLevel: false,
		rootName: ""
	});
	return deflateSync(Buffer.from(inner));
}

function nestedCompound(levels) {
	const parts = [Buffer.from([0x0a, 0x00, 0x00])];
	for (let i = 1; i < levels; i++) parts.push(Buffer.from([0x0a, 0x01, 0x00, 0x61]));
	parts.push(Buffer.alloc(levels));
	return Buffer.concat(parts);
}

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

describe("mcstructureCodec", async () => {
	const {
		gateMcstructureBytes,
		readMcstructure,
		McstructureCodecError,
		MCSTRUCTURE_MAX_BYTES,
		isNBTValidMcstructure,
		assertZlibChecksum
	} = await import("../../src/viewer/core/nbt/mcstructureCodec.js");

	it("rejects empty, oversized, gzip, and zlib before nbtify", () => {
		assert.throws(() => gateMcstructureBytes({ byteLength: 0 }), e => e.code === "STRUCTURE_EMPTY");
		assert.throws(
			() => gateMcstructureBytes({ byteLength: MCSTRUCTURE_MAX_BYTES + 1 }),
			e => e.code === "STRUCTURE_TOO_LARGE"
		);
		const gzip = new Uint8Array([0x1f, 0x8b, 0, 0, 0, 0, 0, 0, 0, 0]);
		assert.throws(() => gateMcstructureBytes(gzip), e => e.code === "STRUCTURE_COMPRESSED");
		const zlib = new Uint8Array([0x78, 0x9c, 0, 0, 0, 0, 0, 0, 0, 0]);
		assert.throws(() => gateMcstructureBytes(zlib), e => e.code === "STRUCTURE_COMPRESSED");
	});

	it("parses sample hoppers.mcstructure", async () => {
		const p = join(root, "tests/sampleStructures/hoppers.mcstructure");
		if (!existsSync(p)) return;
		const buf = readFileSync(p);
		const { nbt, diagnostics } = await readMcstructure(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
		assert.equal(isNBTValidMcstructure(nbt), true);
		assert.ok(diagnostics.volume > 0);
	});

	it("rejects missing format_version after a compound-shaped object via layers assert", async () => {
		const { assertMcstructureLayers } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		assert.throws(
			() => assertMcstructureLayers({ format_version: 2, size: new Int32Array([1, 1, 1]) }),
			e => e instanceof McstructureCodecError
				&& e.code === "STRUCTURE_NBT_REJECTED"
				&& e.message === "missing structure"
		);
	});

	it("accepts format 2 with one block layer and rejects a short layer", async () => {
		const { assertMcstructureLayers } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const oneLayer = {
			format_version: 2,
			size: new Int32Array([1, 1, 1]),
			structure_world_origin: new Int32Array([0, 0, 0]),
			structure: { block_indices: [new Int32Array([0])] }
		};
		const normalized = assertMcstructureLayers(oneLayer);
		assert.equal(normalized.volume, 1);
		assert.equal(normalized.formatVersion, 2);
		assert.equal(normalized.layersInFile, 1);
		assert.equal(oneLayer.structure.block_indices.length, 2);
		assert.equal(oneLayer.structure.block_indices[1][0], -1);
		assert.equal(isNBTValidMcstructure(oneLayer), true);
		assert.throws(
			() => assertMcstructureLayers({
				format_version: 2,
				size: new Int32Array([2, 1, 1]),
				structure_world_origin: new Int32Array([0, 0, 0]),
				structure: { block_indices: [new Int32Array([0])] }
			}),
			e => e instanceof McstructureCodecError
				&& e.code === "STRUCTURE_NBT_REJECTED"
				&& e.message === "block_indices[0] length 1 !== volume 2"
		);
		assert.throws(
			() => assertMcstructureLayers({
				...oneLayer,
				format_version: 3,
				size: new Int32Array([1, 1, 1]),
				structure: { block_indices: [new Int32Array([0]), new Int32Array([-1])] }
			}),
			e => e instanceof McstructureCodecError
				&& e.code === "STRUCTURE_UNSUPPORTED_VERSION"
				&& e.message === "unsupported format_version 3 (Bedrock Layers reads 1, 2)"
				&& e.extra.formatVersion === 3
				&& /format_version 3/.test(e.userMessage())
				&& /newer Minecraft/.test(e.userMessage())
				&& /1 and 2/.test(e.userMessage())
		);
		assert.throws(
			() => assertMcstructureLayers({
				format_version: 1,
				size: new Int32Array([1, 1, 1]),
				structure_world_origin: new Int32Array([0, 0, 0]),
				structure: { block_indices: [new Int32Array([0])] }
			}),
			e => e instanceof McstructureCodecError
				&& e.code === "STRUCTURE_NBT_REJECTED"
				&& /format_version 1 needs 2/.test(e.message)
		);
		const base = oneLayer;
		assert.throws(
			() => assertMcstructureLayers({
				...base,
				size: new Int32Array([2048, 2048, 2048]),
				structure: { block_indices: [new Int32Array(0), new Int32Array(0)] }
			}),
			e => e instanceof McstructureCodecError && e.code === "STRUCTURE_NBT_REJECTED"
		);
	});

	const sampleBuf = name => {
		const b = readFileSync(join(root, "tests/sampleStructures", name));
		return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
	};
	const v2Base = () => ({
		format_version: 2,
		size: new Int32Array([3, 1, 1]),
		structure_world_origin: new Int32Array([0, 0, 0]),
		structure: { block_indices: [new Int32Array([0, 1, -1])] }
	});

	it("loads a real v2 single-layer save and pads layer 1 with -1", async () => {
		const { nbt, diagnostics } = await readMcstructure(sampleBuf("format_v2_single_layer_redstone_dust.mcstructure"));
		assert.equal(Number(nbt.format_version), 2);
		assert.deepEqual([...nbt.size], [16, 10, 16]);
		assert.equal(diagnostics.volume, 2560);
		const [l0, l1] = nbt.structure.block_indices;
		assert.equal(nbt.structure.block_indices.length, 2);
		assert.equal(l0.length, 2560);
		assert.equal(l1.length, 2560);
		assert.ok(l1.every(n => n === -1));
		const wires = nbt.structure.palette.default.block_palette.filter(b => b.name === "minecraft:redstone_wire");
		assert.ok(wires.length > 0);
		const [c0, c1] = cloneBlockIndices(nbt.structure.block_indices);
		assert.equal(c0.length, 2560);
		assert.equal(c1.length, 2560);
	});

	it("loads a v2 file with both layers and keeps the waterlog layer", async () => {
		const v2 = await readMcstructure(sampleBuf("format_v2_two_layer_water_plants.mcstructure"));
		const v1 = await readMcstructure(sampleBuf("water_plants.mcstructure"));
		assert.equal(Number(v2.nbt.format_version), 2);
		assert.equal(v2.nbt.structure.block_indices.length, 2);
		assert.deepEqual([...v2.nbt.structure.block_indices[0]], [...v1.nbt.structure.block_indices[0]]);
		assert.deepEqual([...v2.nbt.structure.block_indices[1]], [...v1.nbt.structure.block_indices[1]]);
		assert.ok(v2.nbt.structure.block_indices[1].some(n => n !== -1));
	});

	it("rejects a v2 file with zero or three layers, a short layer, and a missing layer list", async () => {
		const { assertMcstructureLayers } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const layer = () => new Int32Array([0, 0, 0]);
		const cases = [
			[{ ...v2Base(), structure: { block_indices: [] } }, /0 layer\(s\); format_version 2 needs 1 or 2/],
			[{ ...v2Base(), structure: { block_indices: [layer(), layer(), layer()] } }, /3 layer\(s\)/],
			[{ ...v2Base(), structure: { block_indices: [layer(), new Int32Array(2)] } }, /block_indices\[1\] length 2 !== volume 3/],
			[{ ...v2Base(), structure: { block_indices: [layer(), 5] } }, /block_indices\[1\] is not an int array/],
			[{ ...v2Base(), structure: {} }, /missing structure\.block_indices/]
		];
		for (const [nbt, re] of cases) {
			assert.throws(
				() => assertMcstructureLayers(nbt),
				e => e instanceof McstructureCodecError && e.code === "STRUCTURE_NBT_REJECTED" && re.test(e.message),
				String(re)
			);
		}
	});

	it("names the shape check that failed instead of a generic message", async () => {
		const { assertMcstructureLayers, mcstructureShapeProblem } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const base = v2Base();
		const without = key => Object.fromEntries(Object.entries(base).filter(([k]) => k !== key));
		const cases = [
			[null, /root is not an NBT compound/],
			[without("format_version"), /missing format_version/],
			[{ ...base, format_version: 1.5 }, /format_version is not a whole number/],
			[without("size"), /missing size/],
			[{ ...base, size: new Int32Array([1, 1]) }, /size is not a list of 3 ints/],
			[without("structure"), /missing structure$/],
			[without("structure_world_origin"), /missing structure_world_origin/],
			[{ ...base, structure_world_origin: [0, 0, 0.5] }, /structure_world_origin is not a list of 3 ints/],
			[{ ...base, size: [1, 1, "1"] }, /size is not a list of 3 ints/]
		];
		for (const [nbt, re] of cases) {
			assert.throws(
				() => assertMcstructureLayers(nbt),
				e => e instanceof McstructureCodecError && e.code === "STRUCTURE_NBT_REJECTED" && re.test(e.message),
				String(re)
			);
			assert.match(mcstructureShapeProblem(nbt).message, re);
			assert.equal(isNBTValidMcstructure(nbt), false);
		}
		assert.equal(mcstructureShapeProblem(base), null);
		const { Int32 } = await import("nbtify");
		const listed = {
			format_version: 2,
			size: [new Int32(1), new Int32(1), new Int32(1)],
			structure_world_origin: [0, 0, 0],
			structure: { block_indices: [new Int32Array([0])] }
		};
		assert.equal(mcstructureShapeProblem(listed), null);
		assert.equal(isNBTValidMcstructure(listed), true);
		const { writeMcstructure } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		await writeMcstructure(listed);
		assert.equal(listed.structure.block_indices.length, 1);
	});

	it("inflates a version 2 structure compound stored as zlib", async () => {
		const { write, Int32 } = await import("nbtify");
		const { deflateSync } = await import("node:zlib");
		const structure = {
			block_indices: [new Int32Array([0, -1]), new Int32Array([-1, -1])],
			entities: [],
			palette: {
				default: {
					block_palette: [{ name: "minecraft:stone", states: {}, version: new Int32(18168865) }],
					block_position_data: {}
				}
			}
		};
		const inner = await write(structure, {
			endian: "little",
			compression: null,
			bedrockLevel: false,
			rootName: ""
		});
		const zlibBytes = deflateSync(Buffer.from(inner));
		const bytes = await write({
			format_version: new Int32(2),
			compression: new Int32(1),
			size: [new Int32(2), new Int32(1), new Int32(1)],
			structure: zlibBytes,
			structure_world_origin: [new Int32(0), new Int32(0), new Int32(0)]
		}, { endian: "little", compression: null, bedrockLevel: false, rootName: "" });
		const { nbt } = await readMcstructure(bytes);
		assert.equal(nbt.compression, undefined);
		assert.equal(nbt.structure.palette.default.block_palette[0].name, "minecraft:stone");
		assert.equal(isNBTValidMcstructure(nbt), true);
	});

	it("rejects compression other than 0 or 1", async () => {
		const { write, Int32 } = await import("nbtify");
		const bytes = await write({
			format_version: new Int32(2),
			compression: new Int32(2),
			size: [new Int32(1), new Int32(1), new Int32(1)],
			structure: { block_indices: [new Int32Array([0])] },
			structure_world_origin: [new Int32(0), new Int32(0), new Int32(0)]
		}, { endian: "little", compression: null, bedrockLevel: false, rootName: "" });
		await assert.rejects(
			() => readMcstructure(bytes),
			e => e instanceof McstructureCodecError && e.code === "STRUCTURE_COMPRESSED" && /compression 2/.test(e.message)
		);
	});

	it("rejects an empty compression 1 zlib stream", async () => {
		const bytes = await mcstructureWithCompression(new Uint8Array([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01]));
		await assert.rejects(
			() => readMcstructure(bytes),
			e => e instanceof McstructureCodecError && e.code === "STRUCTURE_NBT_REJECTED"
		);
	});

	it("reports an inflated compression 1 payload that is not NBT as STRUCTURE_NBT_REJECTED", async () => {
		const { write, Int32 } = await import("nbtify");
		const { deflateSync } = await import("node:zlib");
		const zlibBytes = deflateSync(Buffer.from("not nbt"));
		const bytes = await write({
			format_version: new Int32(2),
			compression: new Int32(1),
			size: [new Int32(1), new Int32(1), new Int32(1)],
			structure: zlibBytes,
			structure_world_origin: [new Int32(0), new Int32(0), new Int32(0)]
		}, { endian: "little", compression: null, bedrockLevel: false, rootName: "" });
		await assert.rejects(
			() => readMcstructure(bytes),
			e => e instanceof McstructureCodecError && e.code === "STRUCTURE_NBT_REJECTED"
		);
	});

	it("decodes the 26.60.30 preview compression fixture", async () => {
		const p = previewCompressionFixture;
		const buf = readFileSync(p);
		const { nbt, diagnostics } = await readMcstructure(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
		assert.equal(nbt.compression, undefined);
		assert.equal(Number(nbt.format_version), 2);
		assert.deepEqual([...nbt.size], [64, 45, 64]);
		assert.equal(nbt.structure.block_indices.length, 2);
		for (const layer of nbt.structure.block_indices) {
			assert.ok(layer instanceof Int32Array);
			assert.equal(layer.length, 184320);
		}
		assert.equal(nbt.structure.palette.default.block_palette.length, 2091);
		assert.equal(Object.keys(nbt.structure.palette.default.block_position_data).length, 1318);
		assert.equal(nbt.structure.entities.length, 677);
		assert.deepEqual(diagnostics.warnings, []);
	});

	it("catalog-parses the preview compression fixture", async () => {
		const { parseStructureFile } = await import("../../src/viewer/parseStructure.js");
		const p = previewCompressionFixture;
		const buf = readFileSync(p);
		const parsed = await parseStructureFile(new File([buf], "preview-26.60.30-compression1-all-rotations.mcstructure"));
		assert.equal(parsed.paletteSize, 2091);
		assert.equal(parsed.blockCount, 184320);
		assert.equal(parsed.entityCount, 677);
	});

	it("round-trips the preview compression fixture through an uncompressed write", async () => {
		const { writeMcstructure } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const p = previewCompressionFixture;
		const buf = readFileSync(p);
		const { nbt } = await readMcstructure(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
		const written = await writeMcstructure(nbt);
		const back = await readMcstructure(written);
		assert.equal(back.nbt.structure.palette.default.block_palette.length, 2091);
		assert.equal(back.nbt.structure.block_indices[0].length, 184320);
		assert.equal(back.nbt.structure.block_indices[1].length, 184320);
		assert.equal(back.nbt.structure.entities.length, 677);
		assert.equal(back.nbt.compression, undefined);
	});

	it("rejects compression 1 when structure is a compound", async () => {
		const bytes = await mcstructureWithCompression({ block_indices: [new Int32Array([0])] });
		await assert.rejects(
			() => readMcstructure(bytes),
			e => e instanceof McstructureCodecError && e.code === "STRUCTURE_NBT_REJECTED"
		);
	});

	it("rejects raw deflate and gzip payloads inside compression 1", async () => {
		const { write } = await import("nbtify");
		const { deflateRawSync, gzipSync } = await import("node:zlib");
		const inner = Buffer.from(await write(stoneCompound(), {
			endian: "little", compression: null, bedrockLevel: false, rootName: ""
		}));
		for (const payload of [deflateRawSync(inner), gzipSync(inner)]) {
			const bytes = await mcstructureWithCompression(payload);
			await assert.rejects(
				() => readMcstructure(bytes),
				e => e instanceof McstructureCodecError && e.code === "STRUCTURE_NBT_REJECTED"
			);
		}
	});

	it("rejects a truncated zlib payload and a flipped checksum", async () => {
		const z = await deflatedStone();
		const truncated = await mcstructureWithCompression(z.subarray(0, z.length - 8));
		const flipped = Buffer.from(z);
		flipped[flipped.length - 1] ^= 0xff;
		const badSum = await mcstructureWithCompression(flipped);
		for (const bytes of [truncated, badSum]) {
			await assert.rejects(
				() => readMcstructure(bytes),
				e => e instanceof McstructureCodecError && e.code === "STRUCTURE_NBT_REJECTED"
			);
		}
	});

	it("rejects a zlib tail that is not the checksum of the inflated bytes", async () => {
		const { inflateSync } = await import("node:zlib");
		const z = Buffer.from(await deflatedStone());
		const inflated = inflateSync(z);
		assert.doesNotThrow(() => assertZlibChecksum(z, inflated));
		const bad = Buffer.from(z);
		bad[bad.length - 1] ^= 0xff;
		assert.throws(
			() => assertZlibChecksum(bad, inflated),
			e => e instanceof McstructureCodecError && e.code === "STRUCTURE_NBT_REJECTED" && /trailing bytes/.test(e.message)
		);
	});

	it("rejects junk after the zlib stream", async () => {
		const z = await deflatedStone();
		const bytes = await mcstructureWithCompression(Buffer.concat([z, Buffer.from("TRAILING")]));
		await assert.rejects(
			() => readMcstructure(bytes),
			e => e instanceof McstructureCodecError && e.code === "STRUCTURE_NBT_REJECTED"
		);
	});

	it("rejects junk after the inner compound", async () => {
		const { write } = await import("nbtify");
		const { deflateSync } = await import("node:zlib");
		const inner = Buffer.from(await write(stoneCompound(), {
			endian: "little", compression: null, bedrockLevel: false, rootName: ""
		}));
		const bytes = await mcstructureWithCompression(deflateSync(Buffer.concat([inner, Buffer.from([1, 2, 3])])));
		await assert.rejects(
			() => readMcstructure(bytes),
			e => e instanceof McstructureCodecError && e.code === "STRUCTURE_NBT_REJECTED"
		);
	});

	it("stops a zlib payload that inflates past 64 MiB", async () => {
		const { deflateSync } = await import("node:zlib");
		const { MCSTRUCTURE_MAX_BYTES } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const bomb = deflateSync(Buffer.alloc(MCSTRUCTURE_MAX_BYTES + 1));
		const bytes = await mcstructureWithCompression(bomb);
		await assert.rejects(
			() => readMcstructure(bytes),
			e => e instanceof McstructureCodecError && e.code === "STRUCTURE_TOO_LARGE"
		);
	});

	it("rejects an inner payload nested 64 levels deep", async () => {
		const { deflateSync } = await import("node:zlib");
		const bytes = await mcstructureWithCompression(deflateSync(nestedCompound(65)));
		await assert.rejects(
			() => readMcstructure(bytes),
			e => e instanceof McstructureCodecError && e.code === "STRUCTURE_NBT_REJECTED" && /depth/.test(e.message)
		);
	});

	it("reads a highly compressible all-air structure", async () => {
		const { write, Int32 } = await import("nbtify");
		const { deflateSync } = await import("node:zlib");
		const vol = 64 * 384 * 64;
		const inner = await write({
			block_indices: [new Int32Array(vol), new Int32Array(vol)],
			entities: [],
			palette: {
				default: {
					block_palette: [{ name: "minecraft:air", states: {}, version: new Int32(18168865) }],
					block_position_data: {}
				}
			}
		}, { endian: "little", compression: null, bedrockLevel: false, rootName: "" });
		const zlibBytes = deflateSync(Buffer.from(inner), { level: 9 });
		const ratio = inner.byteLength / zlibBytes.byteLength;
		assert.ok(ratio > 1000, `ratio ${ratio}`);
		const bytes = await mcstructureWithCompression(zlibBytes, 1, [64, 384, 64]);
		const { nbt } = await readMcstructure(bytes);
		assert.equal(nbt.structure.block_indices[0].length, vol);
		assert.equal(nbt.compression, undefined);
	});

	it("strips dangerous NBT object keys", async () => {
		const { assertNbtQuotas, stripDangerousNbtKeys } = await import(
			"../../src/viewer/core/nbt/mcstructureCodec.js"
		);
		const o = { ok: 1 };
		Object.defineProperty(o, "__proto__", { value: { polluted: true }, enumerable: true, configurable: true });
		stripDangerousNbtKeys(o);
		assert.equal(Object.prototype.polluted, undefined);
		assert.equal(o.ok, 1);
		assert.doesNotThrow(() => assertNbtQuotas({ ok: true, constructor: { x: 1 } }, 1));
	});

	it("rejects NBT depth over 64", async () => {
		const { assertNbtQuotas } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		let nest = {};
		let cur = nest;
		for (let i = 0; i < 70; i++) {
			cur.child = {};
			cur = cur.child;
		}
		assert.throws(
			() => assertNbtQuotas(nest, 1),
			e => e instanceof McstructureCodecError && e.code === "STRUCTURE_NBT_REJECTED"
		);
	});

	it("does not treat uint32 length coincidence as level.dat", () => {
		const buf = new Uint8Array(16);
		buf[0] = 0x0a;
		buf[3] = 0x01;
		new DataView(buf.buffer).setUint32(4, 8, true);
		buf[8] = 0x0a;
		assert.doesNotThrow(() => gateMcstructureBytes(buf));
	});

	it("detects a real level.dat version header", () => {
		const buf = new Uint8Array(16);
		const v = new DataView(buf.buffer);
		v.setUint32(0, 8, true);
		v.setUint32(4, 8, true);
		buf[8] = 0x0a;
		assert.throws(() => gateMcstructureBytes(buf), e => e.code === "STRUCTURE_LEVEL_DAT");
	});

	it("round-trips hoppers.mcstructure through writeMcstructure", async () => {
		const p = join(root, "tests/sampleStructures/hoppers.mcstructure");
		if (!existsSync(p)) return;
		const { writeMcstructure } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const buf = readFileSync(p);
		const { nbt } = await readMcstructure(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
		const out = await writeMcstructure(nbt);
		const { nbt: again } = await readMcstructure(out);
		assert.equal(isNBTValidMcstructure(again), true);
		assert.ok(again.size instanceof Int32Array);
		assert.ok(again.structure_world_origin instanceof Int32Array);
		assert.equal(again.size.length, 3);
	});

	it("loads version 2 with one layer and with two layers", async () => {
		const { assertMcstructureLayers } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const fixture = join(root, "tests/sampleStructures/format_v2_single_layer_redstone_dust.mcstructure");
		const buf = readFileSync(fixture);
		const { nbt } = await readMcstructure(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
		assert.equal(Number(nbt.format_version), 2);
		assert.equal(nbt.structure.block_indices.length, 2);
		assert.ok(nbt.structure.block_indices[1].every(v => v === -1));
		const two = {
			format_version: 2,
			size: new Int32Array([1, 1, 1]),
			structure_world_origin: new Int32Array([0, 0, 0]),
			structure: { block_indices: [new Int32Array([0]), new Int32Array([4])] }
		};
		assert.equal(assertMcstructureLayers(two).volume, 1);
		assert.equal(two.structure.block_indices[1][0], 4);
	});

	it("cloneBlockIndices pads a missing waterlog layer with -1", async () => {
		const { cloneBlockIndices } = await import("../../src/viewer/paletteCore.js");
		const [layer0, layer1] = cloneBlockIndices([new Int32Array([2, 5, 5])]);
		assert.deepEqual([...layer0], [2, 5, 5]);
		assert.deepEqual([...layer1], [-1, -1, -1]);
		const src = [new Int32Array([1, 2]), new Int32Array([3, -1])];
		const [c, d] = cloneBlockIndices(src);
		assert.deepEqual([...d], [3, -1]);
		c[0] = 99;
		assert.equal(src[0][0], 1);
	});

	it("names an unknown format version", async () => {
		const { assertMcstructureLayers } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		assert.throws(
			() => assertMcstructureLayers({
				format_version: 9,
				size: new Int32Array([1, 1, 1]),
				structure_world_origin: new Int32Array([0, 0, 0]),
				structure: { block_indices: [new Int32Array([0]), new Int32Array([-1])] }
			}),
			e => e instanceof McstructureCodecError
				&& e.code === "STRUCTURE_UNSUPPORTED_VERSION"
				&& e.extra.formatVersion === 9
				&& /"dust\.mcstructure"/.test(e.userMessage("dust.mcstructure"))
				&& /format_version 9/.test(e.userMessage("dust.mcstructure"))
				&& /newer Minecraft/.test(e.userMessage("dust.mcstructure"))
				&& /1 and 2/.test(e.userMessage("dust.mcstructure"))
		);
	});

	it("writes format, size, and states with nbtify tag types", async () => {
		const { writeMcstructure } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const { read, Int32, Int8, TAG, TAG_TYPE } = await import("nbtify");
		const nbt = {
			format_version: 2,
			size: new Int32Array([1, 1, 1]),
			structure_world_origin: new Int32Array([3, 4, 5]),
			structure: {
				block_indices: [new Int32Array([0])],
				palette: {
					default: {
						block_palette: [{
							name: "minecraft:lever",
							states: { open_bit: false, facing_direction: 3 },
							version: 18168865
						}],
						block_position_data: {}
					}
				},
				entities: []
			}
		};
		const bytes = await writeMcstructure(nbt);
		assert.equal(nbt.structure.block_indices.length, 1);
		const typed = await read(bytes, { endian: "little", compression: null, bedrockLevel: false, strict: false });
		const data = typed.data;
		assert.equal(data.format_version[Symbol.toStringTag], "Int32");
		assert.equal(Number(data.format_version), 2);
		assert.ok(Array.isArray(data.size));
		assert.equal(data.size[TAG_TYPE], TAG.INT);
		assert.ok(data.size.every(v => v instanceof Int32));
		assert.deepEqual(data.size.map(Number), [1, 1, 1]);
		assert.equal(data.structure_world_origin[TAG_TYPE], TAG.INT);
		assert.deepEqual([...data.structure_world_origin].map(Number), [3, 4, 5]);
		const block = data.structure.palette.default.block_palette[0];
		assert.ok(block.states.open_bit instanceof Int8);
		assert.equal(Number(block.states.open_bit), 0);
		assert.ok(block.states.facing_direction instanceof Int32);
		assert.equal(Number(block.states.facing_direction), 3);
		assert.ok(block.version instanceof Int32);
		const { nbt: again } = await readMcstructure(bytes);
		assert.ok(again.size instanceof Int32Array);
		assert.equal(again.structure.block_indices.length, 2);
		assert.equal(again.structure.block_indices[1][0], -1);
	});

	const tagOf = async () => {
		const NBT = await import("nbtify");
		const T = v => {
			const name = NBT.TAG[NBT.getTagType(v)];
			return name === "LIST" ? `List<${v.length ? T(v[0]) : "End"}>` : name;
		};
		return { NBT, T };
	};
	const readTyped = async bytes => {
		const NBT = await import("nbtify");
		return (await NBT.read(bytes, { endian: "little", compression: null, bedrockLevel: false })).data;
	};

	it("writeMcstructure writes Bedrock tag types for a v1 file read through the typeless reader", async () => {
		const { writeMcstructure } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const { T } = await tagOf();
		const { nbt } = await readMcstructure(sampleBuf("levers.mcstructure"));
		const out = await writeMcstructure(nbt);
		const r = await readTyped(out);
		assert.equal(T(r.format_version), "INT");
		assert.equal(Number(r.format_version), 1);
		assert.equal(T(r.size), "List<INT>");
		assert.equal(T(r.structure_world_origin), "List<INT>");
		assert.equal(T(r.structure.block_indices), "List<List<INT>>");
		assert.equal(r.structure.block_indices.length, 2);
		for (const b of r.structure.palette.default.block_palette) {
			assert.equal(T(b.version), "INT", b.name);
			for (const [k, v] of Object.entries(b.states)) {
				const t = T(v);
				if (k === "open_bit") assert.equal(t, "BYTE", `${b.name}.${k}`);
				else assert.ok(t === "INT" || t === "STRING", `${b.name}.${k} is ${t}`);
			}
		}
	});

	it("writeMcstructure keeps a v2 one-layer save byte-identical when given typed input", async () => {
		const { writeMcstructure } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const { readMcstructureTyped } = await import("../../src/viewer/core/nbt/mcstructureTyped.js");
		const buf = sampleBuf("format_v2_single_layer_redstone_dust.mcstructure");
		const { nbt } = await readMcstructureTyped(buf);
		const out = await writeMcstructure(nbt);
		assert.deepEqual(Buffer.from(out), Buffer.from(buf));
	});

	it("writeMcstructure writes v2 layers as List<Int_Array> and leaves out an all -1 second layer", async () => {
		const { writeMcstructure } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const { T } = await tagOf();
		const one = await readTyped(await writeMcstructure((await readMcstructure(sampleBuf("format_v2_single_layer_redstone_dust.mcstructure"))).nbt));
		assert.equal(T(one.format_version), "INT");
		assert.equal(T(one.structure.block_indices), "List<INT_ARRAY>");
		assert.equal(one.structure.block_indices.length, 1);
		const two = await readTyped(await writeMcstructure((await readMcstructure(sampleBuf("format_v2_two_layer_water_plants.mcstructure"))).nbt));
		assert.equal(T(two.structure.block_indices), "List<INT_ARRAY>");
		assert.equal(two.structure.block_indices.length, 2);
	});

	it("typeMcstructureForWrite types states, keeps nbtify-typed values, and types sample-script roots", async () => {
		const { NBT, T } = await tagOf();
		const { typeMcstructureForWrite, BEDROCK_BOOL_BLOCK_STATES } = await import("../../src/viewer/core/nbt/mcstructureTyped.js");
		assert.ok(BEDROCK_BOOL_BLOCK_STATES.has("open_bit"));
		assert.ok(BEDROCK_BOOL_BLOCK_STATES.has("crafting"));
		assert.ok(!BEDROCK_BOOL_BLOCK_STATES.has("redstone_signal"));
		const src = {
			format_version: 1,
			size: new Int32Array([1, 1, 1]),
			structure_world_origin: new Int32Array([0, 0, 0]),
			structure: {
				block_indices: [new Int32Array([0]), new Int32Array([-1])],
				palette: { default: {
					block_palette: [{ name: "minecraft:crafter", states: { crafting: 1, triggered_bit: true, orientation: "up_north", custom: new NBT.Int16(3) }, version: 18163713 }],
					block_position_data: { 0: { block_entity_data: { id: "Crafter", x: 0, Pos: new Float32Array([0.5, 1.25, 2.5]), span: new Float64Array([0.25, 1.5]), shorts: new Int16Array([4, -2]), whole: new Float32Array([0, 1, -2]), flag: new NBT.Int8(1), uid: 5n } } }
				} },
				entities: []
			}
		};
		const t = typeMcstructureForWrite(src, NBT);
		assert.equal(Number(src.format_version), 1, "input not mutated");
		assert.equal(T(t.format_version), "INT");
		assert.equal(T(t.size), "List<INT>");
		assert.equal(T(t.structure.block_indices), "List<List<INT>>");
		const b = t.structure.palette.default.block_palette[0];
		assert.equal(T(b.version), "INT");
		assert.equal(T(b.states.crafting), "BYTE");
		assert.equal(T(b.states.triggered_bit), "BYTE");
		assert.equal(T(b.states.orientation), "STRING");
		assert.equal(T(b.states.custom), "SHORT");
		const be = t.structure.palette.default.block_position_data[0].block_entity_data;
		assert.equal(T(be.x), "INT");
		assert.equal(T(be.Pos), "List<FLOAT>");
		assert.ok(be.Pos.every(n => T(n) === "FLOAT"));
		assert.equal(T(be.span), "List<DOUBLE>");
		assert.ok(be.span.every(n => T(n) === "DOUBLE"));
		assert.equal(T(be.shorts), "List<SHORT>");
		assert.equal(T(be.whole), "List<FLOAT>");
		assert.ok(be.whole.every(n => n instanceof NBT.Float32));
		assert.equal(T(be.flag), "BYTE");
		assert.equal(T(be.uid), "LONG");
		assert.deepEqual(Object.keys(t), ["format_version", "size", "structure", "structure_world_origin"]);
	});

	it("typeless write keeps rails and cushions motion lists as Float", async () => {
		const { writeMcstructure } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const NBT = await import("nbtify");
		for (const name of ["rails.mcstructure", "cushions.mcstructure"]) {
			const { nbt } = await readMcstructure(sampleBuf(name));
			const written = await writeMcstructure(nbt);
			const data = (await NBT.read(written, { endian: "little", compression: null, bedrockLevel: false })).data;
			const entities = data.structure.entities;
			assert.ok(entities.length > 0, name);
			for (const entity of entities) {
				assert.equal(entity.Pos.length, 3, name);
				assert.ok(entity.Pos.every(n => n instanceof NBT.Float32), name);
				assert.equal(entity.Rotation.length, 2, name);
				assert.ok(entity.Rotation.every(n => n instanceof NBT.Float32), name);
				assert.equal(entity.Motion.length, 3, name);
				assert.ok(entity.Motion.every(n => n instanceof NBT.Float32), name);
			}
		}
	});

	it("minecarts.mcstructure stores every entity Pos as a length-3 float list", async () => {
		const { nbt } = await readMcstructure(sampleBuf("minecarts.mcstructure"));
		const entities = nbt.structure.entities;
		assert.ok(entities.length > 0);
		for (const entity of entities) {
			assert.ok(entity.Pos instanceof Float32Array);
			assert.equal(entity.Pos.length, 3);
		}
	});

	it("vendored INT_ARRAY and LONG_ARRAY reads use indexed loops", async () => {
		const src = readFileSync(join(root, "src/vendor/nbtify-readonly-typeless/index.js"), "utf8");
		assert.equal(src.includes("for(let n in r)"), false);
		assert.match(src, /new Int32Array\(e\);for\(let n=0;n<e;n\+\+\)/);
		assert.match(src, /new BigInt64Array\(e\);for\(let n=0;n<e;n\+\+\)/);
		const NBT = await import("nbtify");
		const vendor = await import("../../src/vendor/nbtify-readonly-typeless/index.js");
		const bytes = await NBT.write({
			ints: Int32Array.of(3, -4, 9),
			longs: BigInt64Array.of(1n, -2n)
		}, { endian: "little", compression: null });
		const read = await vendor.read(bytes, { endian: "little", compression: null, bedrockLevel: false });
		assert.deepEqual(Array.from(read.data.ints), [3, -4, 9]);
		assert.deepEqual(Array.from(read.data.longs), [1n, -2n]);
	});
});
