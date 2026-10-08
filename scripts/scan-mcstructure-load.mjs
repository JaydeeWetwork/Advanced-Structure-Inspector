/**
 * Load every .mcstructure under tests/sampleStructures, including user-structures/.
 * Usage: node scripts/scan-mcstructure-load.mjs scripts/logs/mcstructure-load-before.txt
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readMcstructure } from "../src/viewer/core/nbt/mcstructureCodec.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const samples = path.join(root, "tests", "sampleStructures");
const outPath = path.resolve(root, process.argv[2] || "scripts/logs/mcstructure-load.txt");

function walk(dir, acc = []) {
	if (!fs.existsSync(dir)) return acc;
	for (const name of fs.readdirSync(dir)) {
		const p = path.join(dir, name);
		const st = fs.statSync(p);
		if (st.isDirectory()) walk(p, acc);
		else if (name.endsWith(".mcstructure")) acc.push(p);
	}
	return acc;
}

const files = walk(samples).sort();
const lines = [];
let ok = 0;
let fail = 0;
const byVersion = new Map();
const v2 = [];

for (const file of files) {
	const rel = path.relative(root, file).replaceAll("\\", "/");
	const buf = fs.readFileSync(file);
	try {
		const { nbt } = await readMcstructure(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
		const version = Number(nbt?.format_version);
		const layers = nbt?.structure?.block_indices?.length ?? 0;
		ok++;
		byVersion.set(version, (byVersion.get(version) || 0) + 1);
		if (version === 2) v2.push(`${rel} layers=${layers} size=${[...nbt.size].join("x")}`);
		lines.push(`OK ${rel} format=${version} layers=${layers}`);
	} catch (e) {
		fail++;
		lines.push(`FAIL ${rel} ${e?.code || ""} ${e?.message || e}`);
	}
}

const summary = [
	`files ${files.length}`,
	`ok ${ok}`,
	`fail ${fail}`,
	...[...byVersion.entries()].sort((a, b) => a[0] - b[0]).map(([v, n]) => `format ${v}: ${n}`),
	"v2 files:",
	...(v2.length ? v2 : ["(none)"])
];
const text = [...summary, "", ...lines].join("\n") + "\n";
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, text);
console.log(summary.join("\n"));
console.log(`wrote ${path.relative(root, outPath)}`);
