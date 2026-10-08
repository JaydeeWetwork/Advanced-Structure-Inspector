/** One DOM layout per container kind. */
import { formatItemLabel, readComposterFillLevel, shortItemLabel } from "./containerKind.js";
import {
	parseSignStyleRuns,
	parseSignTextLines,
	readRedstoneSignal,
	signArgbCss
} from "./inspectStructure.js";
/**
 * @param {(ItemStack|null)[]} slots
 * @param {number} rows
 * @param {number} cols
 * @param {Set<number>} disabled
 * @param {string} kind
 */
/**
 * Large chest: top 3 rows = player-left half, bottom 3 = player-right.
 * @param {(ItemStack|null)[]} slots length 54
 */
export function renderDoubleChestLayout(slots) {
	const wrap = document.createElement("div");
	wrap.className = "mc-inv-double";
	const empty = new Set();
	const top = renderSlotGrid(slots.slice(0, 27), 3, 9, empty, "double_chest");
	top.classList.add("double-top");
	const bot = renderSlotGrid(slots.slice(27, 54), 3, 9, empty, "double_chest");
	bot.classList.add("double-bot");
	wrap.append(top, bot);
	return wrap;
}
export function renderSlotGrid(slots, rows, cols, disabled, kind) {
	const grid = document.createElement("div");
	grid.className = `mc-inv-grid cols-${cols}`;
	grid.style.setProperty("--mc-cols", String(cols));
	const n = rows * cols;
	for (let i = 0; i < n; i++) {
		grid.appendChild(renderOneSlot(slots[i] ?? null, disabled.has(i), kind));
	}
	return grid;
}
/**
 * @param {ItemStack|null} item
 * @param {boolean} blocked
 * @param {string} [extraClass]
 */
export function renderOneSlot(item, blocked, extraClass = "") {
	const slot = document.createElement("div");
	slot.className = "mc-slot" + (blocked ? " blocked" : "") + (item ? " filled" : "") + (extraClass ? ` ${extraClass}` : "");
	if (blocked) {
		const x = document.createElement("span");
		x.className = "mc-slot-block-mark";
		x.textContent = "✕";
		slot.appendChild(x);
		slot.title = "Disabled slot";
		return slot;
	}
	if (item) {
		const bare = String(item.name || "").replace(/^minecraft:/i, "");
		// Icon filled async by hydrateInventoryIcons (Bedrock samples)
		const img = document.createElement("img");
		img.className = "mc-slot-icon";
		img.alt = "";
		img.decoding = "async";
		img.draggable = false;
		img.dataset.itemIcon = bare;
		// Pre-center so layout is correct before/as the image loads
		img.style.cssText =
			"position:absolute;left:50%;top:50%;right:auto;bottom:auto;"
			+ "transform:translate(-50%,-50%);width:32px;height:32px;"
			+ "margin:0;padding:0;border:none;display:block;object-fit:contain";
		slot.appendChild(img);
		// Text fallback until icon loads (or if missing)
		const label = document.createElement("span");
		label.className = "mc-slot-name";
		label.textContent = shortItemLabel(item.name);
		label.title = formatItemLabel(item.name);
		slot.appendChild(label);
		if (item.count > 1) {
			const c = document.createElement("span");
			c.className = "mc-slot-count";
			c.textContent = String(item.count);
			slot.appendChild(c);
		}
		slot.title = `${formatItemLabel(item.name)} × ${item.count}`;
	}
	return slot;
}
/** @param {(ItemStack|null)[]} slots */
export function renderFurnaceLayout(slots) {
	const wrap = document.createElement("div");
	wrap.className = "mc-inv-furnace";
	const col = document.createElement("div");
	col.className = "mc-inv-furnace-col";
	// slot 0 input, 1 fuel, 2 result (Bedrock convention often 0=input 1=fuel 2=result)
	const input = renderOneSlot(slots[0] ?? null, false, "furnace-in");
	const fuel = renderOneSlot(slots[1] ?? null, false, "furnace-fuel");
	const flame = document.createElement("div");
	flame.className = "mc-inv-flame";
	flame.textContent = "▲";
	col.appendChild(input);
	col.appendChild(flame);
	col.appendChild(fuel);
	const arrow = document.createElement("div");
	arrow.className = "mc-inv-arrow";
	arrow.textContent = "→";
	const out = renderOneSlot(slots[2] ?? null, false, "furnace-out");
	wrap.appendChild(col);
	wrap.appendChild(arrow);
	wrap.appendChild(out);
	return wrap;
}
/**
 * Minecraft brewing stand layout:
 *   [Fuel]     [Ingredient]
 *        ↘ bubbles ↙
 *   [Bottle] [Bottle] [Bottle]
 * Slots: 0–2 bottles, 3 ingredient, 4 fuel (Java/Bedrock).
 * @param {(ItemStack|null)[]} slots
 */
export function renderBrewingLayout(slots) {
	const wrap = document.createElement("div");
	wrap.className = "mc-inv-brewing";
	// Top row: fuel (left) + ingredient (center)
	const top = document.createElement("div");
	top.className = "mc-inv-brewing-top";
	const fuelCol = document.createElement("div");
	fuelCol.className = "mc-inv-brewing-col";
	const fuelLabel = document.createElement("span");
	fuelLabel.className = "mc-inv-slot-label";
	fuelLabel.textContent = "Fuel";
	fuelCol.append(fuelLabel, renderOneSlot(slots[4] ?? null, false, "brew-fuel"));
	const ingCol = document.createElement("div");
	ingCol.className = "mc-inv-brewing-col";
	const ingLabel = document.createElement("span");
	ingLabel.className = "mc-inv-slot-label";
	ingLabel.textContent = "Ingredient";
	ingCol.append(ingLabel, renderOneSlot(slots[3] ?? null, false, "brew-ingredient"));
	// Spacer keeps fuel left-ish, ingredient centered over bottles
	const topSpacer = document.createElement("div");
	topSpacer.className = "mc-inv-brewing-top-spacer";
	top.append(fuelCol, topSpacer, ingCol);
	const mid = document.createElement("div");
	mid.className = "mc-inv-brewing-mid";
	mid.setAttribute("aria-hidden", "true");
	mid.textContent = "↓";
	// Bottom: three potion bottles
	const bottles = document.createElement("div");
	bottles.className = "mc-inv-brewing-bottles";
	for (let i = 0; i < 3; i++) {
		const col = document.createElement("div");
		col.className = "mc-inv-brewing-col";
		const lab = document.createElement("span");
		lab.className = "mc-inv-slot-label";
		lab.textContent = "Bottle";
		col.append(renderOneSlot(slots[i] ?? null, false, `brew-bottle-${i}`), lab);
		bottles.appendChild(col);
	}
	wrap.append(top, mid, bottles);
	return wrap;
}
/**
 * Composter inspect: visual fill 0–8 from block state.
 * @param {Record<string, unknown>|null|undefined} states
 */
export function renderComposterLayout(states) {
	const wrap = document.createElement("div");
	wrap.className = "mc-inv-composter";
	const level = readComposterFillLevel(states);
	const known = level != null;
	const fill = known ? level : 0;
	const barrel = document.createElement("div");
	barrel.className = "mc-composter-barrel";
	barrel.setAttribute("role", "img");
	barrel.setAttribute(
		"aria-label",
		known ? `Composter fill level ${fill} of 8` : "Composter fill level unknown"
	);
	// 8 fill steps from bottom (level 1..8); level 0 empty
	const layers = document.createElement("div");
	layers.className = "mc-composter-layers";
	for (let step = 1; step <= 8; step++) {
		const layer = document.createElement("div");
		layer.className =
			"mc-composter-layer"
			+ (known && fill >= step ? " is-filled" : "")
			+ (known && fill === 8 && step === 8 ? " is-ready" : "");
		layer.title = `Level ${step}`;
		layers.appendChild(layer);
	}
	barrel.appendChild(layers);
	const rim = document.createElement("div");
	rim.className = "mc-composter-rim";
	barrel.appendChild(rim);
	const readout = document.createElement("div");
	readout.className = "mc-composter-readout";
	if (known) {
		readout.textContent =
			fill === 0
				? "Empty · 0 / 8"
				: fill === 8
					? "Full · 8 / 8 · bone meal ready"
					: `Fill level · ${fill} / 8`;
	} else {
		readout.textContent = "Fill level not in structure data";
	}
	wrap.append(barrel, readout);
	return wrap;
}
/**
 * Sign face text panel + placement dump for overlay QA.
 * @param {import("./inspectStructure.js").InspectBlock|null} [block]
 */
export function renderSignLayout(block = null) {
	const wrap = document.createElement("div");
	wrap.className = "mc-inv-text-panel mc-inv-sign";
	const data = block?.sign;
	if (!data) {
		wrap.textContent = "No sign text in block entity.";
		return wrap;
	}
	const addFace = (label, face) => {
		const sec = document.createElement("div");
		sec.className = "mc-text-face";
		const h = document.createElement("div");
		h.className = "mc-text-face-label";
		const bits = [label];
		if (face.glowing) bits.push("glowing");
		if (face.color != null) bits.push(`argb=${face.color >>> 0}`);
		h.textContent = bits.join(" · ");
		sec.appendChild(h);
		const pre = document.createElement("pre");
		pre.className = "mc-text-lines";
		const glowing = !!face.glowing;
		const base = signArgbCss(face.color, glowing);
		pre.style.background = glowing ? "#14120f" : "#e6d3a3";
		pre.style.color = base;
		const painted = face.raw ? parseSignTextLines(face.raw, true) : face.lines;
		const lines = painted.length ? painted : ["(blank)"];
		lines.forEach((line, i) => {
			if (i) pre.appendChild(document.createElement("br"));
			for (const run of parseSignStyleRuns(line, base)) {
				const span = document.createElement("span");
				span.textContent = run.text;
				span.style.color = run.color;
				if (run.italic) span.style.fontStyle = "italic";
				pre.appendChild(span);
			}
		});
		sec.appendChild(pre);
		wrap.appendChild(sec);
	};
	addFace("Front", data.front);
	addFace("Back", data.back);
	if (data.waxed) {
		const w = document.createElement("div");
		w.className = "mc-text-meta";
		w.textContent = "Waxed";
		wrap.appendChild(w);
	}
	return wrap;
}
/**
 * Lectern book reader panel.
 * @param {import("./inspectStructure.js").InspectBlock|null} [block]
 */
export function renderLecternLayout(block = null) {
	const wrap = document.createElement("div");
	wrap.className = "mc-inv-text-panel mc-inv-lectern";
	const data = block?.lectern;
	if (!data) {
		wrap.textContent = "No lectern data.";
		return wrap;
	}
	if (!data.hasBook) {
		wrap.textContent = "Lectern is empty (no book).";
		return wrap;
	}
	const meta = document.createElement("div");
	meta.className = "mc-text-meta";
	const bk = data.book;
	const bits = [];
	bits.push(bk?.itemName || "book");
	if (bk?.title) bits.push(`“${bk.title}”`);
	if (bk?.author) bits.push(`by ${bk.author}`);
	bits.push(`page ${data.page + 1}/${Math.max(data.totalPages || bk?.pages?.length || 1, 1)}`);
	meta.textContent = bits.join(" · ");
	wrap.appendChild(meta);
	const pre = document.createElement("pre");
	pre.className = "mc-text-lines mc-book-page";
	if (bk?.pages?.length) {
		const idx = Math.max(0, Math.min(data.page, bk.pages.length - 1));
		pre.textContent = bk.pages[idx] || "(empty page)";
		if (bk.pages.length > 1) {
			const all = document.createElement("details");
			all.className = "mc-book-all";
			const sum = document.createElement("summary");
			sum.textContent = `All ${bk.pages.length} pages`;
			all.appendChild(sum);
			bk.pages.forEach((p, i) => {
				const pg = document.createElement("pre");
				pg.className = "mc-text-lines mc-book-page";
				pg.textContent = `— ${i + 1} —\n${p || "(empty)"}`;
				all.appendChild(pg);
			});
			wrap.append(pre, all);
			return wrap;
		}
	} else {
		pre.textContent =
			"Book present but no page text in NBT "
			+ "(empty writable book, or pages not stored in this structure).";
	}
	wrap.appendChild(pre);
	return wrap;
}
/**
 * Redstone power meter from block states.
 * @param {Record<string, unknown>|null|undefined} states
 */
export function renderRedstoneLayout(states) {
	const wrap = document.createElement("div");
	wrap.className = "mc-inv-text-panel mc-inv-redstone";
	const power = readRedstoneSignal(states);
	const label = document.createElement("div");
	label.className = "mc-text-meta";
	label.textContent =
		power == null
			? "redstone_signal not present on this block"
			: `Power ${power} / 15`;
	wrap.appendChild(label);
	const bar = document.createElement("div");
	bar.className = "mc-rs-bar";
	bar.setAttribute("role", "meter");
	bar.setAttribute("aria-valuemin", "0");
	bar.setAttribute("aria-valuemax", "15");
	bar.setAttribute("aria-valuenow", String(power ?? 0));
	for (let i = 0; i < 15; i++) {
		const cell = document.createElement("div");
		cell.className = "mc-rs-cell" + (power != null && power > i ? " on" : "");
		// Approximate Bedrock dust brightness
		const t = (i + 1) / 15;
		const r = Math.round(77 + (255 - 77) * t);
		const g = Math.round(0 + 51 * t);
		cell.style.setProperty("--rs", `rgb(${r},${g},0)`);
		bar.appendChild(cell);
	}
	wrap.appendChild(bar);
	return wrap;
}
