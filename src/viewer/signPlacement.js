/**
 * Sign kind / board / euler — one table for overlay + fixture scripts.
 * Board boxes match src/data/blockShapeGeos.json.
 */

import {
	applyBlockGeoEuler,
	blockGeoEulerToThree,
	geoPointToThree
} from "./previewSpace.js";

/** @typedef {"wall"|"standing"|"hanging"} SignKind */

/**
 * Board in 0–16 geo. `front` is local-Z sign of the readable front face
 * (+1 = +Z / south @ identity, −1 = −Z / room side of a high-Z wall plate).
 * @type {Record<SignKind, { cx: number, cy: number, cz: number, w: number, h: number, front: number, halfT: number }>}
 */
export const SIGN_BOARD = {
	// template_wall_sign [0.25,4.25,14.25] × [15.5,7.75,1.5]
	wall: { cx: 8, cy: 8.125, cz: 15, w: 14, h: 6.5, front: -1, halfT: 0.75 },
	// template_standing_sign plaque [0.25,8.25,7.25] × [15.5,7.75,1.5]
	standing: { cx: 8, cy: 12.125, cz: 8, w: 14, h: 6.5, front: 1, halfT: 0.75 },
	// hanging_sign plaque [1,0,7] × [14,10,2]
	hanging: { cx: 8, cy: 5, cz: 8, w: 13, h: 9, front: 1, halfT: 1 }
};

/** Push text off the wood face (geo units). */
export const TEXT_LIFT = 0.55;

/** facing_direction 2–5 (wall_sign / hopper,hanging_sign). */
const CARDINAL_EULER = {
	north: /** @type {[number, number, number]} */ ([0, 0, 0]),
	south: /** @type {[number, number, number]} */ ([0, 180, 0]),
	west: /** @type {[number, number, number]} */ ([0, -90, 0]),
	east: /** @type {[number, number, number]} */ ([0, 90, 0])
};

const FACING_EULER = {
	2: CARDINAL_EULER.north,
	3: CARDINAL_EULER.south,
	4: CARDINAL_EULER.west,
	5: CARDINAL_EULER.east
};

const FACING_NAME = { 0: "down", 1: "up", 2: "N", 3: "S", 4: "W", 5: "E" };

/**
 * @param {string} name
 * @param {Record<string, unknown>|null|undefined} [states]
 * @returns {SignKind}
 */
export function kindOfSign(name, states) {
	const n = String(name || "").replace(/^minecraft:/, "");
	if (/hanging/i.test(n)) return "hanging";
	if (/wall_?sign/i.test(n)) return "wall";
	if (/standing_sign/i.test(n)) return "standing";
	const st = states || {};
	if (st.facing_direction != null && st.ground_sign_direction == null) return "wall";
	return "standing";
}

/**
 * @param {string} name
 * @returns {string}
 */
export function woodKind(name) {
	const n = String(name || "").replace(/^minecraft:/, "");
	const stripped = n
		.replace(/_?(wall|standing|hanging)_?sign$/i, "")
		.replace(/_sign$/i, "");
	if (!stripped || /^(wall|standing|hanging)$/i.test(stripped)) return "oak";
	return stripped;
}

/**
 * @param {SignKind} kind
 * @param {Record<string, unknown>|null|undefined} states
 * @returns {[number, number, number]}
 */
export function eulerOfSign(kind, states) {
	const st = states || {};
	if (kind === "standing") {
		return groundYaw(st);
	}
	if (kind === "hanging") {
		// attached_bit=1: 16-way yaw (ceiling / side chain). Else hopper,hanging_sign facing.
		const attached = st.attached_bit === 1 || st.attached_bit === true;
		if (attached) return groundYaw(st);
		return facingEuler(st);
	}
	if (typeof st.minecraft_cardinal_direction === "string") {
		return CARDINAL_EULER[st.minecraft_cardinal_direction] ?? [0, 0, 0];
	}
	return facingEuler(st);
}

/**
 * @param {SignKind} kind
 * @param {Record<string, unknown>|null|undefined} states
 * @returns {string}
 */
export function facingLabel(kind, states) {
	const st = states || {};
	if (kind === "standing" || (kind === "hanging" && (st.attached_bit === 1 || st.attached_bit === true))) {
		const g = Number(st.ground_sign_direction ?? 0) || 0;
		return `gsd=${g}(${((g / 16) * 360).toFixed(0)}°)`;
	}
	if (typeof st.minecraft_cardinal_direction === "string") {
		return `card=${st.minecraft_cardinal_direction}`;
	}
	if (st.facing_direction != null) {
		const fd = Number(st.facing_direction);
		return `fd=${fd}(${FACING_NAME[fd] ?? "?"})`;
	}
	return "face=?";
}

/**
 * Local-Z sign of the reader-facing side for this face.
 * @param {SignKind} kind
 * @param {boolean} isBack
 */
export function faceSide(kind, isBack) {
	const front = SIGN_BOARD[kind].front;
	return isBack ? -front : front;
}

/**
 * Block-center origin in instance space + board pose (group parent).
 * @param {{ x: number, y: number, z: number, states?: Record<string, unknown> }} block
 * @param {string} name
 */
export function signGroupPose(block, name) {
	const kind = kindOfSign(name, block.states);
	const board = SIGN_BOARD[kind];
	const eulerDeg = eulerOfSign(kind, block.states);
	return {
		kind,
		board,
		eulerDeg,
		origin: [
			-16 * block.x - 8,
			16 * block.y + 8,
			-16 * block.z - 8
		]
	};
}

/**
 * Face center in board-local space (block center at 0). Unrotated; group carries euler.
 * @param {{ cx: number, cy: number, cz: number, front: number, halfT: number }} board
 * @param {boolean} isBack
 */
export function signFaceLocalOffset(board, isBack) {
	const side = isBack ? -board.front : board.front;
	return {
		x: board.cx - 8,
		y: board.cy - 8,
		z: board.cz - 8 + side * (board.halfT + TEXT_LIFT),
		side
	};
}

/**
 * @param {{ x: number, y: number, z: number, states?: Record<string, unknown> }} block
 * @param {string} name
 * @param {boolean} isBack
 */
export function placeSignFace(block, name, isBack) {
	const kind = kindOfSign(name, block.states);
	const board = SIGN_BOARD[kind];
	const eulerDeg = eulerOfSign(kind, block.states);
	const side = faceSide(kind, isBack);
	const localZ = board.cz + side * (board.halfT + TEXT_LIFT);
	const [gx, gy, gz] = applyBlockGeoEuler([board.cx, board.cy, localZ], eulerDeg);
	// Match BlockGeoSystem vertex Z-flip (16 - z) via geoPointToThree
	const [tx, ty, tz] = geoPointToThree(block.x, block.y, block.z, gx, gy, gz);
	return { kind, board, eulerDeg, side, localZ, tx, ty, tz };
}

/**
 * Wood plaque center in three.js space (between F and B text planes).
 * @param {{ x: number, y: number, z: number, states?: Record<string, unknown> }} block
 * @param {string} name
 */
export function boardCenterThree(block, name) {
	const kind = kindOfSign(name, block.states);
	const board = SIGN_BOARD[kind];
	const eulerDeg = eulerOfSign(kind, block.states);
	const [gx, gy, gz] = applyBlockGeoEuler([board.cx, board.cy, board.cz], eulerDeg);
	const [x, y, z] = geoPointToThree(block.x, block.y, block.z, gx, gy, gz);
	return { x, y, z, kind, board, eulerDeg };
}

/**
 * Snapshot used by inspect UI + overlay footer (no THREE).
 * @param {{ x: number, y: number, z: number, states?: Record<string, unknown> }} block
 * @param {string} name
 */
export function describeSignPlacement(block, name) {
	const kind = kindOfSign(name, block.states);
	const wood = woodKind(name);
	const facing = facingLabel(kind, block.states);
	const front = placeSignFace(block, name, false);
	const back = placeSignFace(block, name, true);
	const board = boardCenterThree(block, name);
	const st = block.states && typeof block.states === "object" ? { ...block.states } : {};
	return {
		name: String(name || "").replace(/^minecraft:/, ""),
		wood,
		kind,
		facing,
		states: st,
		eulerDeg: front.eulerDeg,
		pos: { x: block.x, y: block.y, z: block.z },
		boardThree: [round3(board.x), round3(board.y), round3(board.z)],
		front: summarizeFace(front),
		back: summarizeFace(back)
	};
}

/**
 * One-line overlay footer, e.g. `F standing gsd=15(338°)`.
 * @param {ReturnType<typeof describeSignPlacement>} desc
 * @param {boolean} isBack
 */
export function signDebugFooter(desc, isBack) {
	const tag = isBack ? "B" : "F";
	return `${tag} ${desc.kind} ${desc.facing}`;
}

/**
 * @param {{ side: number, localZ: number, tx: number, ty: number, tz: number }} placed
 */
function summarizeFace(placed) {
	return {
		side: placed.side,
		localZ: round3(placed.localZ),
		three: [round3(placed.tx), round3(placed.ty), round3(placed.tz)]
	};
}

/** @param {number} n */
function round3(n) {
	return Math.round(Number(n) * 1000) / 1000;
}

/**
 * Board local +X/+Y/+Z after BlockGeoMaker euler (same map as plaque vertices).
 * @param {[number, number, number]} eulerDeg
 * @returns {{ x: [number, number, number], y: [number, number, number], z: [number, number, number] }}
 */
export function signBoardAxes(eulerDeg) {
	const o = applyBlockGeoEuler([8, 8, 8], eulerDeg);
	const px = applyBlockGeoEuler([9, 8, 8], eulerDeg);
	const py = applyBlockGeoEuler([8, 9, 8], eulerDeg);
	const pz = applyBlockGeoEuler([8, 8, 9], eulerDeg);
	return {
		x: [px[0] - o[0], px[1] - o[1], px[2] - o[2]],
		y: [py[0] - o[0], py[1] - o[1], py[2] - o[2]],
		z: [pz[0] - o[0], pz[1] - o[1], pz[2] - o[2]]
	};
}

/**
 * Plane axes = baked board axes. Back = 180° around board Y (flip X and Z)
 * so F and B face outward on opposite plaque faces with LTR text.
 *
 * @param {typeof import("three")} THREE
 * @param {[number, number, number]} eulerDeg
 * @param {number} side
 */
export function signFaceOrientation(THREE, eulerDeg, side) {
	const q = new THREE.Quaternion().setFromEuler(
		blockGeoEulerToThree(eulerDeg[0], eulerDeg[1], eulerDeg[2], THREE)
	);
	if (side < 0) {
		q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
	}
	return { quaternion: q, scaleX: side < 0 ? -1 : 1 };
}

/**
 * @param {Record<string, unknown>} st
 * @returns {[number, number, number]}
 */
function groundYaw(st) {
	const facing = Number(st.ground_sign_direction ?? 0) || 0;
	return [0, (facing / 16) * 360, 0];
}

/**
 * @param {Record<string, unknown>} st
 * @returns {[number, number, number]}
 */
function facingEuler(st) {
	const fd = Number(st.facing_direction);
	return FACING_EULER[fd] ?? [0, 0, 0];
}
