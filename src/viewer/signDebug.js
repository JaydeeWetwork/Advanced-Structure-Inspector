/**
 * Live sign-text placement tweaks (preview GUI).
 * When a slider set looks right, Log recipe / re-click the sign and paste the dump.
 */

import {
	GEO_SCALE,
	describeSignPlacement,
	kindOfSign,
	signPlaneInstanceVerts
} from "./signPlacement.js";

const STORAGE_KEY = "sdb.signTweaks.v1";
const RECIPE_KEY = "sdb.signTweakRecipe.last";

/** @typedef {"this"|"all"|"wall"|"standing"|"hanging"} SignTweakApplyTo */

export const SIGN_TWEAK_EVENT = "sdb-sign-tweaks-changed";

/** Shared across duplicate ESM copies (?v= cache splits). */
function signDebugStore() {
	const g = globalThis;
	if (!g.__sdbSignDebug) {
		g.__sdbSignDebug = {
			tweaks: { ...DEFAULT_SIGN_TWEAKS },
			focus: /** @type {{ block: object, name: string }|null} */ (null),
			listeners: new Set()
		};
	}
	return g.__sdbSignDebug;
}

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

/** Live object — one instance even if this module is loaded twice. */
export const signTweaks = signDebugStore().tweaks;

loadSignTweaks();

/**
 * @param {object} block
 * @param {string} [name]
 */
export function setSignDebugFocus(block, name) {
	const store = signDebugStore();
	if (!block) {
		store.focus = null;
		return;
	}
	store.focus = {
		block,
		name: String(name || block.name || "")
	};
}

export function getSignDebugFocus() {
	return signDebugStore().focus;
}

/**
 * Overlay / renderer subscribe here (not CustomEvent — those can miss across copies).
 * @param {(tweaks: SignTweaks) => void} fn
 */
export function subscribeSignTweaks(fn) {
	const listeners = signDebugStore().listeners;
	listeners.add(fn);
	return () => listeners.delete(fn);
}

/** @param {string} kind */
export function tweaksAffectKind(kind, tweaks = signTweaks) {
	const a = tweaks.applyTo || "this";
	if (a === "this") return true;
	return a === "all" || a === kind;
}

/**
 * @param {{ x?: number, y?: number, z?: number, states?: object }} block
 * @param {string} name
 * @param {SignTweaks} [tweaks]
 */
export function tweaksAffectSign(block, name, tweaks = signTweaks) {
	const a = tweaks.applyTo || "this";
	if (a === "this") {
		const focus = signDebugStore().focus;
		if (!focus?.block) return true;
		return Number(block?.x) === Number(focus.block.x)
			&& Number(block?.y) === Number(focus.block.y)
			&& Number(block?.z) === Number(focus.block.z);
	}
	return tweaksAffectKind(kindOfSign(name, block?.states), tweaks);
}

export function notifySignTweaksChanged() {
	saveSignTweaks();
	const tweaks = signDebugStore().tweaks;
	for (const fn of [...signDebugStore().listeners]) {
		try {
			fn(tweaks);
		} catch (e) {
			console.warn("[sdb] sign tweak listener failed", e);
		}
	}
	try {
		globalThis.dispatchEvent(new CustomEvent(SIGN_TWEAK_EVENT));
	} catch {
		/* ignore */
	}
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
		"judo32",
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
	const focus = signDebugStore().focus;
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
 * Inspect-panel dump text (baseline + current recipe).
 * @param {object} block
 */
export function formatSignInspectDump(block) {
	const desc = describeSignPlacement(block, block.name);
	const st = Object.entries(desc.states)
		.map(([k, v]) => `${k}=${v}`)
		.join(" ");
	const f = desc.front;
	const b = desc.back;
	const lines = [
		`${desc.kind} ${desc.wood}  ${desc.facing}`,
		`cell ${desc.pos.x},${desc.pos.y},${desc.pos.z}  euler ${desc.eulerDeg.join(",")}`,
		st ? `states ${st}` : "states (none)",
		`board three ${desc.boardThree.join(",")}`,
		`F side=${f.side} localZ=${f.localZ} three=${f.three.join(",")}  d=${f.dBoard.join(",")}`,
		`B side=${b.side} localZ=${b.localZ} three=${b.three.join(",")}  d=${b.dBoard.join(",")}`
	];
	if (!tweaksAreIdentity(signTweaks)) {
		const front = applySignTweaks(signPlaneInstanceVerts(block, block.name, false), signTweaks);
		const back = applySignTweaks(signPlaneInstanceVerts(block, block.name, true), signTweaks);
		lines.push(formatSignTweakRecipe({
			desc,
			tweaks: signTweaks,
			tweakedFront: [front.placed.tx, front.placed.ty, front.placed.tz],
			tweakedBack: [back.placed.tx, back.placed.ty, back.placed.tz],
			basisZ: front.basis.z,
			basisX: front.basis.x
		}));
	}
	return lines.join("\n");
}

const SLIDERS = [
	{ key: "liftAdd", label: "lift (out)", min: -8, max: 8, step: 0.05 },
	{ key: "slideX", label: "slide X", min: -8, max: 8, step: 0.05 },
	{ key: "slideY", label: "slide Y", min: -8, max: 8, step: 0.05 },
	{ key: "yawDeg", label: "yaw", min: -180, max: 180, step: 0.5 },
	{ key: "pitchDeg", label: "pitch", min: -180, max: 180, step: 0.5 },
	{ key: "rollDeg", label: "roll", min: -180, max: 180, step: 0.5 },
	{ key: "scale", label: "scale", min: 0.2, max: 2, step: 0.01 },
	{ key: "worldX", label: "world X", min: -16, max: 16, step: 0.05 },
	{ key: "worldY", label: "world Y", min: -16, max: 16, step: 0.05 },
	{ key: "worldZ", label: "world Z", min: -16, max: 16, step: 0.05 }
];

/**
 * Controls that live in the sign inspect panel (not lil-gui).
 * @param {object} [block]
 * @param {{ dumpEl?: HTMLElement|null }} [opts]
 */
export function renderSignTweakControls(block = null, opts = {}) {
	if (block) setSignDebugFocus(block, block.name);

	const root = document.createElement("div");
	root.className = "sdb-sign-tweaks";
	root.addEventListener("pointerdown", e => e.stopPropagation());
	root.addEventListener("wheel", e => e.stopPropagation(), { passive: true });

	const title = document.createElement("div");
	title.className = "sdb-sign-tweaks-title";
	title.textContent = "Text placement debug";
	root.appendChild(title);

	const applyRow = document.createElement("label");
	applyRow.className = "sdb-sign-tweak-row sdb-sign-tweak-select";
	const applyLab = document.createElement("span");
	applyLab.className = "sdb-sign-tweak-label";
	applyLab.textContent = "apply to";
	const applySel = document.createElement("select");
	for (const opt of ["this", "all", "wall", "standing", "hanging"]) {
		const o = document.createElement("option");
		o.value = opt;
		o.textContent = opt === "this" ? "this sign" : opt;
		applySel.appendChild(o);
	}
	applySel.value = signTweaks.applyTo;
	applyRow.append(applyLab, applySel);
	root.appendChild(applyRow);

	/** @type {{ key: string, input: HTMLInputElement, val?: HTMLElement }[]} */
	const widgets = [];

	const grid = document.createElement("div");
	grid.className = "sdb-sign-tweak-grid";
	for (const spec of SLIDERS) {
		const row = document.createElement("label");
		row.className = "sdb-sign-tweak-row";
		const name = document.createElement("span");
		name.className = "sdb-sign-tweak-label";
		name.textContent = spec.label;
		const input = document.createElement("input");
		input.type = "range";
		input.min = String(spec.min);
		input.max = String(spec.max);
		input.step = String(spec.step);
		input.value = String(signTweaks[spec.key]);
		const val = document.createElement("span");
		val.className = "sdb-sign-tweak-val";
		val.textContent = fmtTweak(signTweaks[spec.key]);
		row.append(name, input, val);
		grid.appendChild(row);
		widgets.push({ key: spec.key, input, val });
	}
	root.appendChild(grid);

	const flags = document.createElement("div");
	flags.className = "sdb-sign-tweak-flags";
	for (const spec of [
		{ key: "flipX", label: "flip X" },
		{ key: "flipFront", label: "flip front" },
		{ key: "markers", label: "markers" },
		{ key: "doubleSide", label: "2-sided" },
		{ key: "logOnChange", label: "log on change" }
	]) {
		const row = document.createElement("label");
		row.className = "sdb-sign-tweak-check";
		const input = document.createElement("input");
		input.type = "checkbox";
		input.checked = !!signTweaks[spec.key];
		row.append(input, document.createTextNode(" " + spec.label));
		flags.appendChild(row);
		widgets.push({ key: spec.key, input });
	}
	root.appendChild(flags);

	const noteRow = document.createElement("label");
	noteRow.className = "sdb-sign-tweak-row sdb-sign-tweak-note";
	const noteLab = document.createElement("span");
	noteLab.className = "sdb-sign-tweak-label";
	noteLab.textContent = "note";
	const note = document.createElement("input");
	note.type = "text";
	note.placeholder = "what you fixed…";
	note.value = signTweaks.note || "";
	noteRow.append(noteLab, note);
	root.appendChild(noteRow);

	const btns = document.createElement("div");
	btns.className = "sdb-sign-tweak-actions";
	const logBtn = document.createElement("button");
	logBtn.type = "button";
	logBtn.textContent = "Log recipe";
	const resetBtn = document.createElement("button");
	resetBtn.type = "button";
	resetBtn.textContent = "Reset";
	btns.append(logBtn, resetBtn);
	root.appendChild(btns);

	const hint = document.createElement("div");
	hint.className = "sdb-sign-tweak-hint";
	hint.textContent = "Drag until text sits on wood, then Log recipe and paste it in chat.";
	root.appendChild(hint);

	let logTimer = 0;
	const fire = () => {
		notifySignTweaksChanged();
		const dumpEl = opts.dumpEl || root.parentElement?.querySelector?.(".mc-sign-debug");
		if (dumpEl && block) dumpEl.textContent = formatSignInspectDump(block);
		if (signTweaks.logOnChange) {
			clearTimeout(logTimer);
			logTimer = setTimeout(() => {
				void emitSignTweakRecipe({ reason: "slider" });
			}, 200);
		}
	};

	const readWidgets = () => {
		signTweaks.applyTo = /** @type {SignTweakApplyTo} */ (applySel.value);
		signTweaks.note = note.value;
		for (const w of widgets) {
			if (w.input.type === "checkbox") signTweaks[w.key] = w.input.checked;
			else {
				signTweaks[w.key] = Number(w.input.value);
				if (w.val) w.val.textContent = fmtTweak(signTweaks[w.key]);
			}
		}
	};

	const syncWidgets = () => {
		applySel.value = signTweaks.applyTo;
		note.value = signTweaks.note || "";
		for (const w of widgets) {
			if (w.input.type === "checkbox") w.input.checked = !!signTweaks[w.key];
			else {
				w.input.value = String(signTweaks[w.key]);
				if (w.val) w.val.textContent = fmtTweak(signTweaks[w.key]);
			}
		}
	};

	applySel.addEventListener("change", () => {
		readWidgets();
		fire();
	});
	note.addEventListener("input", () => {
		signTweaks.note = note.value;
		saveSignTweaks();
	});
	for (const w of widgets) {
		w.input.addEventListener("input", () => {
			readWidgets();
			fire();
		});
	}
	logBtn.addEventListener("click", () => {
		readWidgets();
		void emitSignTweakRecipe({ copy: true, reason: "button" });
		logBtn.textContent = "Copied";
		setTimeout(() => {
			logBtn.textContent = "Log recipe";
		}, 1200);
	});
	resetBtn.addEventListener("click", () => {
		resetSignTweaks();
		syncWidgets();
		notifySignTweaksChanged();
		const dumpEl = opts.dumpEl || root.parentElement?.querySelector?.(".mc-sign-debug");
		if (dumpEl && block) dumpEl.textContent = formatSignInspectDump(block);
	});

	return root;
}

function fmtTweak(n) {
	const v = Number(n);
	if (!Number.isFinite(v)) return "0";
	return Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
}
