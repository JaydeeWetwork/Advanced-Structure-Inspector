/**
 * Click-inspect data from .mcstructure NBT.
 * The index covers block entities. A pick of a plain block falls back to the palette.
 */
import { describeSignPlacement } from "./signPlacement.js";
import { CONTAINER_BLOCK_ENTITY_IDS } from "./inspectIndex.js";
import { readRedstoneSignal } from "./signText.js";
export {
	asList,
	extractInventoryItems,
	nbtBool,
	normalizeItemStack,
	parseDisabledSlots
} from "./inspectItems.js";
export { blockKey, buildInspectIndex, CONTAINER_BLOCK_ENTITY_IDS } from "./inspectIndex.js";
export {
	extractBookPages,
	extractLecternBook,
	extractSignFace,
	extractSignText,
	parseSignStyleRuns,
	parseSignTextLines,
	readRedstoneSignal,
	signArgbCss,
	SIGN_FORMAT_COLORS
} from "./signText.js";
/**
 * @param {{ kind: "block"|"entity"|"miss", block?: InspectBlock, entity?: InspectEntity, layer?: number|null }} hit
 * @returns {string}
 */
export function formatInspectText(hit) {
	if (!hit || hit.kind === "miss") {
		return "Nothing under cursor.";
	}
	const lines = [];
	if (hit.kind === "block" && hit.block) {
		const b = hit.block;
		lines.push(`Block: ${b.name}`);
		lines.push(`Pos: ${b.x}, ${b.y}, ${b.z}`);
		if (b.states && Object.keys(b.states).length) {
			const st = Object.entries(b.states)
				.map(([k, v]) => `${k}=${v}`)
				.join(", ");
			lines.push(`States: ${st}`);
		}
		const power = readRedstoneSignal(b.states);
		if (power != null && String(b.name || "").includes("redstone")) {
			lines.push(`Redstone power: ${power}/15`);
		}
		if (b.waterlogName) lines.push(`Also: ${b.waterlogName}`);
		if (b.blockEntityId) lines.push(`Block entity: ${b.blockEntityId}`);
		const sign = b.sign;
		if (sign) {
			const d = describeSignPlacement(b, b.name);
			lines.push(`Sign ${d.kind} ${d.wood} ${d.facing}`);
			lines.push(`  euler ${d.eulerDeg.join(",")}  F side=${d.front.side} B side=${d.back.side}`);
			const f = sign.front.lines.filter(Boolean);
			const bk = sign.back.lines.filter(Boolean);
			if (f.length) {
				lines.push("Front:");
				f.forEach(l => lines.push(`  ${l}`));
			} else {
				lines.push("Front: (blank)");
			}
			if (bk.length) {
				lines.push("Back:");
				bk.forEach(l => lines.push(`  ${l}`));
			} else {
				lines.push("Back: (blank)");
			}
			if (sign.waxed) lines.push("Waxed");
		}
		const lectern = b.lectern;
		if (lectern) {
			if (!lectern.hasBook) {
				lines.push("Lectern: no book");
			} else {
				const bk = lectern.book;
				lines.push(
					`Lectern book: ${bk?.itemName || "book"}`
					+ (bk?.title ? ` “${bk.title}”` : "")
					+ (bk?.author ? ` by ${bk.author}` : "")
				);
				lines.push(`Page ${lectern.page + 1}/${Math.max(lectern.totalPages, 1)}`);
				if (bk?.pages?.length) {
					const cur = bk.pages[lectern.page] ?? bk.pages[0];
					if (cur) {
						lines.push("— page text —");
						String(cur).split("\n").forEach(l => lines.push(l));
					}
				} else {
					lines.push("(no page text in NBT)");
				}
			}
		}
		const inv = b.doubleChest && Array.isArray(b.doubleItems) ? b.doubleItems : b.items;
		if (inv?.length) {
			lines.push(`Inventory (${inv.length}):`);
			for (const it of inv) {
				const slot = it.slot != null ? `[${it.slot}] ` : "";
				const dmg = it.damage != null ? ` dmg=${it.damage}` : "";
				lines.push(`  ${slot}${it.count}× ${it.name}${dmg}`);
			}
		} else if (b.blockEntityId && CONTAINER_BLOCK_ENTITY_IDS.has(b.blockEntityId) && !lectern) {
			lines.push("Inventory: empty");
		}
	} else if (hit.kind === "entity" && hit.entity) {
		const e = hit.entity;
		lines.push(`Entity: ${e.identifier}`);
		if (e.customName) lines.push(`Name: ${e.customName}`);
		lines.push(`Pos: ${e.pos.map(n => Number(n).toFixed(2)).join(", ")}`);
		if (e.items?.length) {
			lines.push(`Inventory (${e.items.length}):`);
			for (const it of e.items) {
				const slot = it.slot != null ? `[${it.slot}] ` : "";
				const dmg = it.damage != null ? ` dmg=${it.damage}` : "";
				lines.push(`  ${slot}${it.count}× ${it.name}${dmg}`);
			}
		} else {
			lines.push("Inventory: empty / none");
		}
	}
	return lines.join("\n");
}
