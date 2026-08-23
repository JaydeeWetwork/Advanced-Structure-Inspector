/**
 * Live sign-text placement tweaks (preview GUI).
 * When a slider set looks right, Log recipe / re-click the sign and paste the dump.
 */

import {
	GEO_SCALE,
	describeSignPlacement,
	signPlaneInstanceVerts
} from "./signPlacement.js";

const STORAGE_KEY = "sdb.signTweaks.v1";
const RECIPE_KEY = "sdb.signTweakRecipe.last";

/** @typedef {"all"|"wall"|"standing"|"hanging"} SignTweakApplyTo */

/**
 * @typedef {object} SignTweaks
 * @property {SignTweakApplyTo} applyTo
 * @property {number} liftAdd  along outward (+Z of the text plane)
 * @property {number} slideX   along text right
 * @property {number} slideY   along text up
 * @property {number} yawDeg   around up (turns the plane in XZ)
 * @property {number} pitchDeg around right (tilts top/bottom)
 * @property {number} rollDeg  around outward (spins letters)
 * @property {number} scale
 * @property {number} worldX   raw three.js nudge
 * @property {number} worldY
 * @property {number} worldZ
 * @property {boolean} flipX
 * @property {boolean} flipFront
 * @property {boolean} markers
 * @property {boolean} doubleSide
 * @property {boolean} logOnChange
 * @property {string} note
 */

/** @type {SignTweaks} */
export const DEFAULT_SIGN_TWEAKS = {
	applyTo: "all",
	liftAdd: 0,
	slideX: 0,
	slideY: 0,
	yawDeg: 0,
	pitchDeg: 0,
	rollDeg: 0,
	scale: 1,
	worldX: 0,
	worldY: 0,
	worldZ: 0,
	flipX: false,
	flipFront: false,
	markers: false,
	doubleSide: false,
	logOnChange: false,
	note: ""
};

/** Live object bound to lil-gui. */
export const signTweaks = { ...DEFAULT_SIGN_TWEAKS };

/** @type {{ block: object, name: string }|null} */
let focus = null;

loadSignTweaks();

/**
 * @param {object} block
 * @param {string} [name]
 */
export function setSignDebugFocus(block, name) {
	if (!block) {
		focus = null;
		return;
	}
	focus = {
		block,
		name: String(name || block.name || "")
	};
}

export function getSignDebugFocus() {
	return focus;
}

/** @param {string} kind */
export function tweaksAffectKind(kind, tweaks = signTweaks) {
	const a = tweaks.applyTo || "all";
	return a === "all" || a === kind;
}

/** @param {SignTweaks} [t] */
export function tweaksAreIdentity(t = signTweaks) {
	return t.liftAdd === 0
		&& t.slideX === 0
		&& t.slideY === 0
		&& t.yawDeg === 0
		&& t.pitchDeg === 0
		&& t.rollDeg === 0
		&& t.scale === 1
		&& t.worldX === 0
		&& t.worldY === 0
		&& t.worldZ === 0
		&& !t.flipX
		&& !t.flipFront;
}

export function resetSignTweaks() {
	Object.assign(signTweaks, DEFAULT_SIGN_TWEAKS);
	saveSignTweaks();
}

export function saveSignTweaks() {
	try {
		const { logOnChange, note, ...rest } = signTweaks;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
	} catch {
		/* ignore quota / private mode */
	}
}

function loadSignTweaks() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return;
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return;
		for (const key of Object.keys(DEFAULT_SIGN_TWEAKS)) {
			if (key === "logOnChange" || key === "note") continue;
			if (key in parsed) signTweaks[key] = parsed[key];
		}
	} catch {
		/* ignore */
	}
}

/**
 * @param {[number, number, number]} v
 * @param {[number, number, number]} axis unit
 * @param {number} deg
 * @returns {[number, number, number]}
 */
export function rotateVecAroundAxis(v, axis, deg) {
	const a = (Number(deg) || 0) * Math.PI / 180;
	if (!a) return [v[0], v[1], v[2]];
	const c = Math.cos(a);
	const s = Math.sin(a);
	const [ax, ay, az] = axis;
	const [vx, vy, vz] = v;
	const dot = ax * vx + ay * vy + az * vz;
	const omc = 1 - c;
	return [
		vx * c + (ay * vz - az * vy) * s + ax * dot * omc,
		vy * c + (az * vx - ax * vz) * s + ay * dot * omc,
		vz * c + (ax * vy - ay * vx) * s + az * dot * omc
	];
}

function neg(v) {
	return [-v[0], -v[1], -v[2]];
}

function norm(v) {
	const l = Math.hypot(v[0], v[1], v[2]) || 1;
	return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * @param {{ x: [number, number, number], y: [number, number, number], z: [number, number, number] }} basis
 * @param {SignTweaks} tweaks
 */
export function tweakSignBasis(basis, tweaks) {
	let x = norm(basis.x);
	let y = norm(basis.y);
	let z = norm(basis.z);
	if (tweaks.yawDeg) {
		x = rotateVecAroundAxis(x, y, tweaks.yawDeg);
		z = rotateVecAroundAxis(z, y, tweaks.yawDeg);
		x = norm(x);
		z = norm(z);
	}
	if (tweaks.pitchDeg) {
		y = rotateVecAroundAxis(y, x, tweaks.pitchDeg);
		z = rotateVecAroundAxis(z, x, tweaks.pitchDeg);
		y = norm(y);
		z = norm(z);
	}
	if (tweaks.rollDeg) {
		x = rotateVecAroundAxis(x, z, tweaks.rollDeg);
		y = rotateVecAroundAxis(y, z, tweaks.rollDeg);
		x = norm(x);
		y = norm(y);
	}
	if (tweaks.flipX) x = neg(x);
	if (tweaks.flipFront) {
		z = neg(z);
		x = neg(x);
	}
	return { x, y, z };
}

/**
 * @param {ReturnType<typeof import("./signPlacement.js").signPlaneInstanceVerts>} baked
 * @param {SignTweaks} [tweaks]
 */
export function applySignTweaks(baked, tweaks = signTweaks) {
	if (!baked || tweaksAreIdentity(tweaks)) return baked;
	const basis = tweakSignBasis(baked.basis, tweaks);
	const scale = Number(tweaks.scale);
	const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
	const hw = baked.placed.board.w * GEO_SCALE / 2 * s;
	const hh = baked.placed.board.h * GEO_SCALE / 2 * s;
	const origin = baked.origin;
	const tx = baked.placed.tx
		+ basis.x[0] * tweaks.slideX
		+ basis.y[0] * tweaks.slideY
		+ basis.z[0] * tweaks.liftAdd
		+ tweaks.worldX;
	const ty = baked.placed.ty
		+ basis.x[1] * tweaks.slideX
		+ basis.y[1] * tweaks.slideY
		+ basis.z[1] * tweaks.liftAdd
		+ tweaks.worldY;
	const tz = baked.placed.tz
		+ basis.x[2] * tweaks.slideX
		+ basis.y[2] * tweaks.slideY
		+ basis.z[2] * tweaks.liftAdd
		+ tweaks.worldZ;
	/** @param {number} sx @param {number} sy */
	const corner = (sx, sy) => [
		tx + basis.x[0] * sx * hw + basis.y[0] * sy * hh - origin[0],
		ty + basis.x[1] * sx * hw + basis.y[1] * sy * hh - origin[1],
		tz + basis.x[2] * sx * hw + basis.y[2] * sy * hh - origin[2]
	];
	return {
		...baked,
		basis,
		verts: [corner(-1, 1), corner(1, 1), corner(-1, -1), corner(1, -1)],
		placed: { ...baked.placed, tx, ty, tz }
	};
}

function r3(n) {
	return Math.round(Number(n) * 1000) / 1000;
}

function vec3s(v) {
	if (!v) return "?";
	if (Array.isArray(v)) return v.map(r3).join(",");
	if (typeof v.tx === "number") return [v.tx, v.ty, v.tz].map(r3).join(",");
	if (typeof v.x === "number") return [v.x, v.y, v.z].map(r3).join(",");
	return String(v);
}

/**
 * Pasteable block for chat. Include inspected sign when we have one.
 * @param {object} [extra]
 */
export function formatSignTweakRecipe(extra = {}) {
	const t = extra.tweaks || signTweaks;
	const lines = [
		"---SIGN_TWEAK---",
		"judo28",
		`note: ${t.note || extra.note || "(none)"}`,
		`applyTo: ${t.applyTo}`,
		`liftAdd: ${t.liftAdd}`,
		`slideX: ${t.slideX}  slideY: ${t.slideY}`,
		`yawDeg: ${t.yawDeg}  pitchDeg: ${t.pitchDeg}  rollDeg: ${t.rollDeg}`,
		`scale: ${t.scale}`,
		`worldNudge: ${t.worldX}, ${t.worldY}, ${t.worldZ}`,
		`flipX: ${!!t.flipX}  flipFront: ${!!t.flipFront}`,
		`markers: ${!!t.markers}  doubleSide: ${!!t.doubleSide}`
	];
	const desc = extra.desc;
	if (desc) {
		lines.push("-- inspected --");
		lines.push(`${desc.kind} ${desc.wood}  ${desc.facing}`);
		lines.push(`cell ${desc.pos.x},${desc.pos.y},${desc.pos.z}  euler ${desc.eulerDeg.join(",")}`);
		lines.push(`board ${vec3s(desc.boardThree)}`);
		lines.push(`baseline F ${vec3s(desc.front.three)}  d=${vec3s(desc.front.dBoard)}`);
		lines.push(`baseline B ${vec3s(desc.back.three)}  d=${vec3s(desc.back.dBoard)}`);
	}
	if (extra.tweakedFront) {
		lines.push(`tweaked F ${vec3s(extra.tweakedFront)}  basisZ=${vec3s(extra.basisZ)}`);
		if (extra.basisX) lines.push(`tweaked basisX ${vec3s(extra.basisX)}`);
	}
	if (extra.tweakedBack) {
		lines.push(`tweaked B ${vec3s(extra.tweakedBack)}`);
	}
	lines.push("---END---");
	return lines.join("\n");
}

/**
 * @param {object} [extra]
 * @returns {string}
 */
export function logSignTweakRecipe(extra = {}) {
	const text = formatSignTweakRecipe(extra);
	try {
		localStorage.setItem(RECIPE_KEY, text);
	} catch {
		/* ignore */
	}
	try {
		globalThis.__sdbSignTweakRecipe = text;
	} catch {
		/* ignore */
	}
	console.info("[sdb] sign tweak recipe (paste this):\n" + text);
	return text;
}

/**
 * @param {string} text
 */
export async function copySignTweakRecipe(text) {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			console.info("[sdb] sign tweak recipe copied to clipboard");
			return true;
		}
	} catch (e) {
		console.warn("[sdb] clipboard copy failed", e);
	}
	return false;
}

/**
 * Build recipe from current sliders + last clicked sign (if any).
 * @param {{ copy?: boolean, reason?: string }} [opts]
 */
export async function emitSignTweakRecipe(opts = {}) {
	/** @type {Record<string, unknown>} */
	const extra = { tweaks: { ...signTweaks }, note: signTweaks.note };
	if (focus?.block) {
		const name = focus.name;
		extra.desc = describeSignPlacement(focus.block, name);
		const front = applySignTweaks(signPlaneInstanceVerts(focus.block, name, false), signTweaks);
		const back = applySignTweaks(signPlaneInstanceVerts(focus.block, name, true), signTweaks);
		extra.tweakedFront = [front.placed.tx, front.placed.ty, front.placed.tz];
		extra.tweakedBack = [back.placed.tx, back.placed.ty, back.placed.tz];
		extra.basisZ = front.basis.z;
		extra.basisX = front.basis.x;
	}
	const text = logSignTweakRecipe(extra);
	if (opts.copy) await copySignTweakRecipe(text);
	return text;
}

/**
 * @param {import("lil-gui").GUI} gui
 * @param {{ rebuildOverlays?: () => void, requestRender?: () => void }} hooks
 */
export function wireSignDebugGui(gui, hooks = {}) {
	const folder = gui.addFolder("Sign text debug");
	folder.close();
	let timer = 0;
	const onChange = () => {
		saveSignTweaks();
		clearTimeout(timer);
		timer = setTimeout(() => {
			hooks.rebuildOverlays?.();
			hooks.requestRender?.();
			if (signTweaks.logOnChange) {
				void emitSignTweakRecipe({ reason: "slider" });
			}
		}, 40);
	};

	folder.add(signTweaks, "applyTo", ["all", "wall", "standing", "hanging"]).name("apply to").onChange(onChange);
	folder.add(signTweaks, "liftAdd", -8, 8, 0.05).name("lift (outward)").onChange(onChange);
	folder.add(signTweaks, "slideX", -8, 8, 0.05).name("slide X (right)").onChange(onChange);
	folder.add(signTweaks, "slideY", -8, 8, 0.05).name("slide Y (up)").onChange(onChange);
	folder.add(signTweaks, "yawDeg", -180, 180, 0.5).name("yaw (around up)").onChange(onChange);
	folder.add(signTweaks, "pitchDeg", -180, 180, 0.5).name("pitch (tilt)").onChange(onChange);
	folder.add(signTweaks, "rollDeg", -180, 180, 0.5).name("roll (spin letters)").onChange(onChange);
	folder.add(signTweaks, "scale", 0.2, 2, 0.01).name("scale").onChange(onChange);
	folder.add(signTweaks, "worldX", -16, 16, 0.05).name("world X").onChange(onChange);
	folder.add(signTweaks, "worldY", -16, 16, 0.05).name("world Y").onChange(onChange);
	folder.add(signTweaks, "worldZ", -16, 16, 0.05).name("world Z").onChange(onChange);
	folder.add(signTweaks, "flipX").name("flip X (mirror)").onChange(onChange);
	folder.add(signTweaks, "flipFront").name("flip front (180)").onChange(onChange);
	folder.add(signTweaks, "markers").name("markers").onChange(onChange);
	folder.add(signTweaks, "doubleSide").name("double side").onChange(onChange);
	folder.add(signTweaks, "note").name("note");
	folder.add(signTweaks, "logOnChange").name("log on change");

	const actions = {
		logRecipe() {
			void emitSignTweakRecipe({ copy: true, reason: "button" });
		},
		reset() {
			resetSignTweaks();
			for (const c of folder.controllersRecursive?.() ?? folder.controllers ?? []) {
				c.updateDisplay?.();
			}
			hooks.rebuildOverlays?.();
			hooks.requestRender?.();
			console.info("[sdb] sign tweaks reset");
		}
	};
	folder.add(actions, "logRecipe").name("Log recipe (copy)");
	folder.add(actions, "reset").name("Reset sliders");
}
