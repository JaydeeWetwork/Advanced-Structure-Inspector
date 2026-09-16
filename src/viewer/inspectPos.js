/**
 * Inspect subtitle: structure cell + facing / bed half.
 * @param {{ kind?: string, structurePos?: number[], block?: any, entity?: any }} hit
 */
export function formatInspectLocation(hit) {
	if (!hit) return "";
	if (hit.kind === "block") {
		const pos = hit.structurePos
			|| (hit.block && [hit.block.x, hit.block.y, hit.block.z]);
		if (!Array.isArray(pos) || pos.length < 3) return "";
		const [x, y, z] = pos.map(Number);
		if (![x, y, z].every(Number.isFinite)) return "";
		const st = hit.block?.states && typeof hit.block.states === "object" ? hit.block.states : {};
		const bits = [];
		const card = st["minecraft:cardinal_direction"] ?? st.direction;
		if (card != null && card !== "") bits.push(String(card));
		if (st.head_piece_bit === 1 || st.head_piece_bit === "1") bits.push("head");
		else if (st.head_piece_bit === 0 || st.head_piece_bit === "0") bits.push("foot");
		const extra = bits.length ? ` · ${bits.join(" · ")}` : "";
		return `${x}, ${y}, ${z}${extra}`;
	}
	if (hit.kind === "entity" && Array.isArray(hit.entity?.pos) && hit.entity.pos.length >= 3) {
		const [x, y, z] = hit.entity.pos.map(Number);
		if (![x, y, z].every(Number.isFinite)) return "";
		return `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`;
	}
	return "";
}

/** @deprecated use formatInspectLocation */
export const formatInspectDebug = formatInspectLocation;
