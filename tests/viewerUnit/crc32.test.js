import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32Hex } from "../../src/viewer/crc32.js";
import { ingestFiles } from "../../src/viewer/ingest.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("crc32Hex", () => {
	it("matches IEEE CRC-32 of 123456789", () => {
		assert.equal(crc32Hex(new TextEncoder().encode("123456789")), "cbf43926");
	});
});

describe("ingest duplicate skip", () => {
	it("keeps the first structure and warns on the same bytes", async () => {
		const buf = readFileSync(join(root, "tests/sampleStructures/hoppers.mcstructure"));
		const a = new File([buf], "a.mcstructure");
		const b = new File([buf], "b.mcstructure");
		const r = await ingestFiles([a, b]);
		assert.equal(r.entries.length, 1);
		assert.equal(r.entries[0].contentCrc32, crc32Hex(buf));
		assert.ok(r.warnings.some(w => /duplicate/i.test(w) && /b\.mcstructure/.test(w)));
	});

	it("skips when CRC is already in the catalog set", async () => {
		const buf = readFileSync(join(root, "tests/sampleStructures/hoppers.mcstructure"));
		const crc = crc32Hex(buf);
		const r = await ingestFiles([new File([buf], "again.mcstructure")], {
			knownCrcs: [crc]
		});
		assert.equal(r.entries.length, 0);
		assert.ok(r.warnings.some(w => /duplicate/i.test(w)));
	});
});
