/**
 * Fill FrontText + BackText on every sign in sample structure files.
 *
 * Uses nbtify (writable) + little-endian Bedrock .mcstructure format.
 * Labels encode face / wood / facing so orientation bugs are obvious in the viewer.
 *
 * Usage (from repo root):
 *   node scripts/fill-sign-test-text.mjs
 *   node scripts/fill-sign-test-text.mjs tests/sampleStructures/signs.mcstructure
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as NBT from "nbtify";
import { facingLabel, kindOfSign, woodKind } from "../src/viewer/signPlacement.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SAMPLE_DIR = path.join(ROOT, "tests", "sampleStructures");

const DEFAULT_FILES = [
	path.join(SAMPLE_DIR, "signs.mcstructure"),
	path.join(SAMPLE_DIR, "hanging_signs.mcstructure")
];

/** Bedrock dye-ish ARGB (signed) for readable variety */
const COLORS = {
	black: -16777216, // 0xFF000000
	white: -1, // 0xFFFFFFFF
	red: -1154611, // ~dye red
	blue: -12827478,
	green: -11838016,
	yellow: -171,
	orange: -1533681,
	pink: -4251856,
	cyan: -15242472,
	purple: -7785804
};

const COLOR_CYCLE = [
	COLORS.black,
	COLORS.white,
	COLORS.red,
	COLORS.blue,
	COLORS.green,
	COLORS.yellow,
	COLORS.orange,
	COLORS.pink
];

/**
 * @param {unknown} name
 * @returns {string}
 */
function bareName(name) {
	if (typeof name === "string") return name.replace(/^minecraft:/, "");
	if (name && typeof name === "object" && "value" in /** @type {object} */ (name)) {
		return String(/** @type {{ value: unknown }} */ (name).value).replace(/^minecraft:/, "");
	}
	return "?";
}

/**
 * @param {object} args
 * @param {"F"|"B"} args.side
 * @param {number} args.index 1-based
 * @param {string} args.wood
 * @param {string} args.kind wall|standing|hanging
 * @param {string} args.facing
 * @param {number} args.x
 * @param {number} args.y
 * @param {number} args.z
 * @param {boolean} args.glow
 * @param {string} args.colorName
 */
function buildLines({ side, index, wood, kind, facing, x, y, z, glow, colorName }) {
	// 4 lines max typical; keep short for plaque width
	const line1 = `${side}#${String(index).padStart(2, "0")} ${wood}`;
	const line2 = `${kind} ${facing}`;
	const line3 = `@${x},${y},${z}`;
	const line4 = glow ? `GLOW ${colorName}` : `ink ${colorName}`;
	return [line1, line2, line3, line4].join("\n");
}

/**
 * Ensure a face compound has expected keys; mutate in place.
 * @param {Record<string, unknown>} face
 * @param {string} text
 * @param {number} color
 * @param {boolean} glow
 */
function applyFace(face, text, color, glow) {
	face.Text = text;
	face.FilteredText = "";
	face.SignTextColor = color | 0;
	// Bedrock: IgnoreLighting = glowing text
	face.IgnoreLighting = glow ? 1 : 0;
	if ("HideGlowOutline" in face) face.HideGlowOutline = 0;
	if ("PersistFormatting" in face) face.PersistFormatting = 1;
	if ("TextOwner" in face) face.TextOwner = "";
	// Also set GlowingText if present on some formats
	if ("GlowingText" in face) face.GlowingText = glow ? 1 : 0;
}

/**
 * @param {string} filePath
 */
async function fillFile(filePath) {
	const abs = path.resolve(filePath);
	if (!fs.existsSync(abs)) {
		throw new Error(`Missing file: ${abs}`);
	}
	const raw = fs.readFileSync(abs);
	const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
	const root = await NBT.read(ab, { endian: "little", strict: false });
	const data = root.data;
	const palette = data?.structure?.palette?.default?.block_palette ?? [];
	const indices = data?.structure?.block_indices?.[0] ?? [];
	const beMap = data?.structure?.palette?.default?.block_position_data;
	if (!beMap || typeof beMap !== "object") {
		throw new Error(`${path.basename(abs)}: no block_position_data`);
	}

	const size = data.size;
	const sx = Number(size[0]);
	const sy = Number(size[1]);
	const sz = Number(size[2]);

	/** linear index → local xyz (Bedrock: x + z*sx + y*sx*sz) */
	function idxToLocal(i) {
		const y = Math.floor(i / (sx * sz));
		const rem = i % (sx * sz);
		const z = Math.floor(rem / sx);
		const x = rem % sx;
		return { x, y, z };
	}

	let updated = 0;
	let skipped = 0;
	const report = [];

	// Stable order by index key
	const keys = Object.keys(beMap).sort((a, b) => Number(a) - Number(b));
	let signIndex = 0;

	for (const key of keys) {
		const entry = beMap[key];
		const bed = entry?.block_entity_data ?? entry;
		if (!bed || typeof bed !== "object") {
			skipped++;
			continue;
		}
		const id = String(bed.id ?? "");
		const isSign =
			id === "Sign"
			|| id === "HangingSign"
			|| /sign/i.test(id)
			|| bed.FrontText
			|| bed.front_text;
		if (!isSign) {
			skipped++;
			continue;
		}

		signIndex++;
		const i = Number(key);
		const local = Number.isFinite(i) ? idxToLocal(i) : { x: 0, y: 0, z: 0 };
		const pi = Number(indices[i]);
		const block = Number.isFinite(pi) ? palette[pi] : null;
		const blockName = bareName(block?.name);
		const states = block?.states ?? {};
		const wood = woodKind(blockName);
		const kind = kindOfSign(blockName, states);
		const facing = facingLabel(kind, states);

		// Alternate glow; back face uses next color in cycle so sides differ
		const glowFront = signIndex % 3 === 0;
		const glowBack = signIndex % 3 === 1;
		const colorFront = COLOR_CYCLE[(signIndex - 1) % COLOR_CYCLE.length];
		const colorBack = COLOR_CYCLE[signIndex % COLOR_CYCLE.length];
		const colorFrontName = Object.entries(COLORS).find(([, v]) => v === colorFront)?.[0] ?? "c";
		const colorBackName = Object.entries(COLORS).find(([, v]) => v === colorBack)?.[0] ?? "c";

		if (!bed.FrontText || typeof bed.FrontText !== "object") {
			bed.FrontText = {
				FilteredText: "",
				HideGlowOutline: 0,
				IgnoreLighting: 0,
				PersistFormatting: 1,
				SignTextColor: COLORS.black,
				Text: "",
				TextOwner: ""
			};
		}
		if (!bed.BackText || typeof bed.BackText !== "object") {
			bed.BackText = {
				FilteredText: "",
				HideGlowOutline: 0,
				IgnoreLighting: 0,
				PersistFormatting: 1,
				SignTextColor: COLORS.black,
				Text: "",
				TextOwner: ""
			};
		}

		const frontText = buildLines({
			side: "F",
			index: signIndex,
			wood,
			kind,
			facing,
			x: local.x,
			y: local.y,
			z: local.z,
			glow: glowFront,
			colorName: colorFrontName
		});
		const backText = buildLines({
			side: "B",
			index: signIndex,
			wood,
			kind,
			facing,
			x: local.x,
			y: local.y,
			z: local.z,
			glow: glowBack,
			colorName: colorBackName
		});

		applyFace(bed.FrontText, frontText, colorFront, glowFront);
		applyFace(bed.BackText, backText, colorBack, glowBack);

		updated++;
		report.push({
			i: signIndex,
			key,
			block: blockName,
			kind,
			facing,
			front: frontText.replace(/\n/g, " | "),
			back: backText.replace(/\n/g, " | "),
			glowF: glowFront,
			glowB: glowBack
		});
	}

	const outBuf = await NBT.write(root);
	fs.writeFileSync(abs, Buffer.from(outBuf));

	// Verify round-trip
	const verify = await NBT.read(outBuf, { endian: "little", strict: false });
	const vBe = verify.data?.structure?.palette?.default?.block_position_data;
	let withText = 0;
	for (const k of Object.keys(vBe || {})) {
		const bed = vBe[k]?.block_entity_data ?? vBe[k];
		const t = bed?.FrontText?.Text ?? bed?.FrontText?.text;
		if (t && String(t).trim()) withText++;
	}

	return {
		file: path.relative(ROOT, abs),
		bytesIn: raw.length,
		bytesOut: outBuf.byteLength,
		updated,
		skipped,
		verifiedWithFrontText: withText,
		sample: report.slice(0, 3),
		size: [sx, sy, sz]
	};
}

async function main() {
	const args = process.argv.slice(2).filter(a => !a.startsWith("-"));
	const files = args.length ? args : DEFAULT_FILES;

	console.log("fill-sign-test-text — writing distinctive F/B labels\n");
	const results = [];
	for (const f of files) {
		const r = await fillFile(f);
		results.push(r);
		console.log(`✓ ${r.file}`);
		console.log(`  size ${r.size.join("×")}  signs updated ${r.updated}  (${r.bytesIn} → ${r.bytesOut} bytes)`);
		console.log(`  verify front text present: ${r.verifiedWithFrontText}`);
		for (const s of r.sample) {
			console.log(`  #${s.i} ${s.block} ${s.facing}`);
			console.log(`     F: ${s.front}`);
			console.log(`     B: ${s.back}`);
		}
		console.log("");
	}

	const total = results.reduce((n, r) => n + r.updated, 0);
	console.log(`Done. ${total} signs labeled across ${results.length} file(s).`);
	console.log("Import signs.mcstructure / hanging_signs.mcstructure in the viewer to QA text orientation.");
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
