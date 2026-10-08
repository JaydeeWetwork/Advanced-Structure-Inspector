/** Sign, book, lectern, and redstone text taken from structure NBT. */
import { asList, coerceStringId, stripNs } from "./inspectItems.js";
// —— Sign / lectern / redstone helpers (unchanged API) ——
/** JSON text inside a sign or book string. NBT depth does not count this tree. */
const TEXT_COMPONENT_MAX_DEPTH = 100;
/** One flattened line. The inspect panel inserts the line; the canvas draws 80 characters. */
const TEXT_COMPONENT_MAX_LINE = 8192;
/**
 * Bracket and brace depth outside JSON strings. Stops once the cap is passed.
 * @param {string} s
 * @returns {number}
 */
function jsonNestingDepth(s) {
	let depth = 0;
	let max = 0;
	let inStr = false;
	let esc = false;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (inStr) {
			if (esc) {
				esc = false;
				continue;
			}
			if (c === "\\") {
				esc = true;
				continue;
			}
			if (c === "\"") inStr = false;
			continue;
		}
		if (c === "\"") {
			inStr = true;
			continue;
		}
		if (c === "{" || c === "[") {
			depth++;
			if (depth > max) max = depth;
			if (max > TEXT_COMPONENT_MAX_DEPTH) return max;
		} else if ((c === "}" || c === "]") && depth > 0) {
			depth--;
		}
	}
	return max;
}
/**
 * @param {string} line
 * @returns {string}
 */
function clipSignLine(line) {
	return line.length > TEXT_COMPONENT_MAX_LINE ? line.slice(0, TEXT_COMPONENT_MAX_LINE) : line;
}
/**
 * Plain sign lines. § codes are removed unless `keepCodes` is set for painting.
 * @param {string} raw
 * @param {boolean} [keepCodes]
 * @returns {string[]}
 */
export function parseSignTextLines(raw, keepCodes = false) {
	if (raw == null) return [];
	let s = String(raw);
	if (!s.trim()) return [];
	const t = s.trim();
	let fromComponent = false;
	if (t.startsWith("{") || t.startsWith("[")) {
		if (jsonNestingDepth(t) > TEXT_COMPONENT_MAX_DEPTH) return [];
		try {
			const j = JSON.parse(t);
			const flat = flattenTextComponent(j);
			// null means the depth cap tripped. "" is a real empty component.
			if (flat == null) return [];
			if (flat) {
				s = flat;
				fromComponent = true;
			}
		} catch {
			/* keep raw */
		}
	}
	s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	if (!keepCodes) s = s.replace(/§./g, "");
	const lines = s.split("\n").map(l => l.trimEnd());
	while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
	return fromComponent ? lines.map(clipSignLine) : lines;
}
/** Bedrock / Java formatting-code colors. §r returns to the sign dye. */
export const SIGN_FORMAT_COLORS = Object.freeze({
	"0": "#000000",
	"1": "#0000aa",
	"2": "#00aa00",
	"3": "#00aaaa",
	"4": "#aa0000",
	"5": "#aa00aa",
	"6": "#ffaa00",
	"7": "#aaaaaa",
	"8": "#555555",
	"9": "#5555ff",
	"a": "#55ff55",
	"b": "#55ffff",
	"c": "#ff5555",
	"d": "#ff55ff",
	"e": "#ffff55",
	"f": "#ffffff"
});
/**
 * CSS color for a sign face. `SignTextColor` is signed ARGB.
 * Glow ink draws that dye brighter. Black dye glows white, as it does in Minecraft.
 * @param {number|null|undefined} argb
 * @param {boolean} [glowing]
 * @returns {string}
 */
export function signArgbCss(argb, glowing = false) {
	if (argb == null || !Number.isFinite(Number(argb))) {
		return glowing ? "#ffffff" : "#000000";
	}
	const c = Number(argb) >>> 0;
	const r = (c >>> 16) & 255;
	const g = (c >>> 8) & 255;
	const b = c & 255;
	const black = r <= 0x22 && g <= 0x22 && b <= 0x22;
	if (glowing && black) return "#ffffff";
	if (!glowing) return `rgb(${r},${g},${b})`;
	const lift = (n) => Math.min(255, Math.round(n + (255 - n) * 0.28));
	return `rgb(${lift(r)},${lift(g)},${lift(b)})`;
}
/**
 * One line of sign text split into dye / formatting runs.
 * Plain text uses `baseCss` (the face dye). §0–§f recolor, §r restores the dye.
 * @param {string} line
 * @param {string} baseCss
 * @returns {{ text: string, color: string, bold: boolean, italic: boolean }[]}
 */
export function parseSignStyleRuns(line, baseCss) {
	const base = baseCss || "#000000";
	/** @type {{ text: string, color: string, bold: boolean, italic: boolean }[]} */
	const runs = [];
	let color = base;
	let bold = false;
	let italic = false;
	const parts = String(line ?? "").split("§");
	const push = (text) => {
		if (!text) return;
		const last = runs[runs.length - 1];
		if (last && last.color === color && last.bold === bold && last.italic === italic) {
			last.text += text;
		} else {
			runs.push({ text, color, bold, italic });
		}
	};
	push(parts[0] ?? "");
	for (let i = 1; i < parts.length; i++) {
		const chunk = parts[i];
		if (!chunk) continue;
		const code = chunk[0].toLowerCase();
		const rest = chunk.slice(1);
		if (SIGN_FORMAT_COLORS[code]) color = SIGN_FORMAT_COLORS[code];
		else if (code === "r") {
			color = base;
			bold = false;
			italic = false;
		} else if (code === "l") bold = true;
		else if (code === "o") italic = true;
		else {
			push("§" + chunk);
			continue;
		}
		push(rest);
	}
	return runs.length ? runs : [{ text: "", color: base, bold: false, italic: false }];
}
/**
 * `null` means a child passed the depth cap. `""` is a real empty component.
 * @param {any} node
 * @param {number} [depth]
 * @returns {string|null}
 */
function flattenTextComponent(node, depth = 0) {
	if (depth > TEXT_COMPONENT_MAX_DEPTH) return null;
	if (node == null) return "";
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) {
		let out = "";
		for (const child of node) {
			const part = flattenTextComponent(child, depth + 1);
			if (part == null) return null;
			out += part;
		}
		return out;
	}
	if (typeof node !== "object") return "";
	if (Array.isArray(node.rawtext)) {
		let out = "";
		for (const child of node.rawtext) {
			const part = flattenTextComponent(child, depth + 1);
			if (part == null) return null;
			out += part;
		}
		return out;
	}
	let out = "";
	if (node.text != null) out += String(node.text);
	if (node.translate != null) out += String(node.translate);
	if (Array.isArray(node.extra)) {
		for (const child of node.extra) {
			const part = flattenTextComponent(child, depth + 1);
			if (part == null) return null;
			out += part;
		}
	}
	return out;
}
/**
 * @param {any} face
 */
export function extractSignFace(face) {
	if (!face || typeof face !== "object") {
		return { lines: [], color: null, glowing: false, raw: "" };
	}
	const raw =
		face.Text != null
			? String(face.Text)
			: face.text != null
				? String(face.text)
				: "";
	let lines = parseSignTextLines(raw);
	if (!lines.length) {
		const legacy = [];
		for (let i = 1; i <= 4; i++) {
			const k = `Text${i}`;
			const v = face[k] ?? face[`text${i}`];
			if (v != null && String(v).length) legacy.push(...parseSignTextLines(String(v)));
		}
		lines = legacy;
	}
	const colorRaw = face.SignTextColor ?? face.Color ?? face.color;
	const color =
		colorRaw == null || colorRaw === ""
			? null
			: Number(colorRaw);
	const glowing =
		face.IgnoreLighting === 1
		|| face.IgnoreLighting === true
		|| face.GlowingText === 1
		|| face.GlowingText === true;
	return {
		lines,
		color: Number.isFinite(color) ? color : null,
		glowing: !!glowing,
		raw
	};
}
/**
 * @param {any} blockEntity
 */
export function extractSignText(blockEntity) {
	if (!blockEntity || typeof blockEntity !== "object") return null;
	const id = stripNs(String(blockEntity.id ?? ""));
	const isSign =
		id === "Sign"
		|| id === "HangingSign"
		|| /sign/i.test(id);
	if (!isSign && !blockEntity.FrontText && !blockEntity.front_text && blockEntity.Text1 == null) {
		return null;
	}
	const front = extractSignFace(
		blockEntity.FrontText ?? blockEntity.front_text ?? blockEntity
	);
	const back = extractSignFace(
		blockEntity.BackText ?? blockEntity.back_text ?? null
	);
	const waxed =
		blockEntity.IsWaxed === 1
		|| blockEntity.IsWaxed === true
		|| blockEntity.isWaxed === 1;
	return { front, back, waxed: !!waxed };
}
/**
 * @param {any} bookItem
 */
export function extractBookPages(bookItem) {
	const empty = { title: null, author: null, pages: [], itemName: "book" };
	if (!bookItem || typeof bookItem !== "object") return empty;
	const itemName = stripNs(
		coerceStringId(bookItem.Name)
		?? coerceStringId(bookItem.name)
		?? "book"
	);
	const tag = bookItem.tag ?? bookItem.Tag ?? bookItem;
	const title =
		tag.title != null
			? String(tag.title)
			: tag.Title != null
				? String(tag.Title)
				: null;
	const author =
		tag.author != null
			? String(tag.author)
			: tag.Author != null
				? String(tag.Author)
				: null;
	/** @type {string[]} */
	const pages = [];
	const pushPage = p => {
		if (p == null) return;
		if (typeof p === "string" || typeof p === "number") {
			const raw = String(p);
			const lines = parseSignTextLines(raw);
			const trimmed = raw.trim();
			const refused = (trimmed.startsWith("{") || trimmed.startsWith("["))
				&& jsonNestingDepth(trimmed) > TEXT_COMPONENT_MAX_DEPTH;
			if (refused) pages.push("");
			else pages.push(lines.join("\n") || raw);
			return;
		}
		if (typeof p === "object") {
			const flat = flattenTextComponent(p);
			if (flat == null) {
				pages.push("");
				return;
			}
			const text = flat || (p.text != null ? String(p.text) : "");
			if (!text) return;
			const lines = parseSignTextLines(text);
			const page = lines.join("\n") || text;
			pages.push(flat ? page.split("\n").map(clipSignLine).join("\n") : page);
		}
	};
	const pageSrc =
		tag.pages
		?? tag.Pages
		?? bookItem.pages
		?? bookItem.Pages
		?? null;
	const list = asList(pageSrc);
	if (list.length) {
		for (const p of list) pushPage(p);
	} else if (pageSrc && typeof pageSrc === "object" && !Array.isArray(pageSrc)) {
		for (const p of asList(pageSrc)) pushPage(p);
	}
	return { title, author, pages, itemName };
}
/**
 * @param {any} blockEntity
 */
export function extractLecternBook(blockEntity) {
	if (!blockEntity || typeof blockEntity !== "object") return null;
	const id = stripNs(String(blockEntity.id ?? ""));
	if (id && id !== "Lectern" && !/lectern/i.test(id)) {
		if (!blockEntity.book && !blockEntity.Book && !blockEntity.BookItem) return null;
	}
	const rawBook =
		blockEntity.book
		?? blockEntity.Book
		?? blockEntity.BookItem
		?? null;
	const hasBookFlag =
		blockEntity.hasBook === 1
		|| blockEntity.hasBook === true
		|| !!rawBook;
	const page = Number(blockEntity.page ?? blockEntity.Page ?? 0) || 0;
	const book = rawBook ? extractBookPages(rawBook) : null;
	const totalPages =
		Number(blockEntity.totalPages ?? blockEntity.TotalPages ?? book?.pages?.length ?? 0)
		|| (book?.pages?.length ?? 0);
	return {
		hasBook: !!hasBookFlag,
		page,
		totalPages,
		book
	};
}
/**
 * @param {Record<string, unknown>|null|undefined} states
 * @returns {number|null}
 */
export function readRedstoneSignal(states) {
	if (!states || typeof states !== "object") return null;
	const raw =
		states.redstone_signal
		?? states.power
		?? states.Power;
	if (raw == null || raw === "") return null;
	const n = Number(raw);
	return Number.isFinite(n) ? Math.max(0, Math.min(15, Math.floor(n))) : null;
}
