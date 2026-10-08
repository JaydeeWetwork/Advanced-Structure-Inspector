import { structurePosToThree } from "./previewSpace.js";

/**
 * Vanilla container menus close past this many blocks from the block center.
 * Preview space is 16 units per cell.
 */
export const INSPECT_CLOSE_BLOCKS = 8;
export const INSPECT_BLOCK_UNITS = 16;

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

/**
 * Preview-space point the open inspect is anchored to.
 * Block cells use the same center as the point-light placement
 * `[-16x-8, 16y+8, -16z-8]`. Entity positions stay on their mesh origin.
 * @param {{ kind?: string, structurePos?: number[], block?: any, entity?: { pos?: number[] } }} hit
 * @returns {{ x: number, y: number, z: number } | null}
 */
export function inspectAnchorInPreview(hit) {
	if (!hit) return null;
	if (hit.kind === "block") {
		const pos = hit.structurePos
			|| (hit.block && [hit.block.x, hit.block.y, hit.block.z]);
		if (!Array.isArray(pos) || pos.length < 3) return null;
		const [lx, ly, lz] = pos.map(Number);
		if (![lx, ly, lz].every(Number.isFinite)) return null;
		const [x, y, z] = structurePosToThree(lx + 0.5, ly + 0.5, lz + 0.5);
		return { x, y, z };
	}
	if (hit.kind === "entity" && Array.isArray(hit.entity?.pos) && hit.entity.pos.length >= 3) {
		const [lx, ly, lz] = hit.entity.pos.map(Number);
		if (![lx, ly, lz].every(Number.isFinite)) return null;
		const [x, y, z] = structurePosToThree(lx, ly, lz);
		return { x, y, z };
	}
	return null;
}

/**
 * Close an inspect opened in fly mode once the camera leaves the block.
 * Opened inside the reach: close past `closeBlocks` from the anchor.
 * Opened from farther away: close after flying that same distance farther out,
 * so a distant double-click does not vanish on the next step.
 * @param {{ x: number, y: number, z: number }} camera
 * @param {{ x: number, y: number, z: number }} anchor
 * @param {number} openDistance
 * @param {number} [closeBlocks]
 */
export function shouldCloseInspectAfterFly(camera, anchor, openDistance, closeBlocks = INSPECT_CLOSE_BLOCKS) {
	if (!camera || !anchor) return false;
	const dist = Math.hypot(camera.x - anchor.x, camera.y - anchor.y, camera.z - anchor.z);
	if (!Number.isFinite(dist) || !Number.isFinite(openDistance)) return false;
	const reach = closeBlocks * INSPECT_BLOCK_UNITS;
	if (!(reach > 0)) return false;
	if (openDistance <= reach) return dist > reach;
	return dist > openDistance + reach;
}
