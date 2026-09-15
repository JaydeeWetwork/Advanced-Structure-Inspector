/**
 * Preview chrome: layer badge, camera bar, inspect overlay, hotkeys.
 */

import { catalog, els, getSelectedId, primaryPreview, session } from "../app/state.js";
import { escapeHtml, tuckFloatDock } from "../app/dom.js";
import { bindFloatingWindow } from "./floatingWindow.js";
import { updatePreviewLoading, removePreviewLoading } from "./previewLoading.js";

/** @type {ReturnType<typeof bindFloatingWindow>|null} */
let inspectWin = null;

/** Iso cycle order (Iso button advances through these). */
export const ISO_PRESETS = /** @type {const} */ (["iso-north", "iso-south", "iso-east", "iso-west"]);
export const ISO_LABELS = {
	"iso-north": "Iso N",
	"iso-south": "Iso S",
	"iso-east": "Iso E",
	"iso-west": "Iso W",
	iso: "Iso N"
};

/** Valid default-camera option values (select + renderer). */
export const CAMERA_PRESET_OPTIONS = [
	"iso-north", "iso-south", "iso-east", "iso-west",
	"north", "south", "east", "west",
	"top", "layer", "free", "fly", "iso"
];

export function isIsoPreset(id) {
	return id === "iso" || ISO_PRESETS.includes(/** @type {any} */ (id));
}

/**
 * @param {string|null|undefined} preset
 */
export function normalizeCameraPreset(preset) {
	if (!preset || typeof preset !== "string") return "iso-north";
	if (preset === "iso" || preset === "default") return "iso-north";
	if (CAMERA_PRESET_OPTIONS.includes(preset)) return preset;
	return "iso-north";
}

/** Default opening zoom: 1 = current fit, 2 = twice as close, 0.5 = twice as far. */
export const CAMERA_ZOOM_MIN = 0.5;
export const CAMERA_ZOOM_MAX = 2;
export const CAMERA_ZOOM_DEFAULT = 1;

/**
 * @param {unknown} z
 * @returns {number}
 */
export function normalizeCameraZoom(z) {
	const n = Number(z);
	if (!Number.isFinite(n)) return CAMERA_ZOOM_DEFAULT;
	const clamped = Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, n));
	return Math.round(clamped * 20) / 20;
}

/**
 * Wheel over a &lt;select&gt;: scroll down → next option.
 * @param {number} index
 * @param {number} count
 * @param {number} deltaY
 */
export function stepSelectIndex(index, count, deltaY) {
	const dir = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
	if (!dir || count <= 0) return index;
	return Math.max(0, Math.min(count - 1, index + dir));
}

/**
 * Wheel over the zoom slider: scroll up → closer (higher %).
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @param {number} step
 * @param {number} deltaY
 */
export function stepRangeValue(value, min, max, step, deltaY) {
	const dir = deltaY < 0 ? 1 : deltaY > 0 ? -1 : 0;
	if (!dir) return value;
	const next = value + dir * step;
	return Math.max(min, Math.min(max, next));
}

/**
 * Sync the details-dock camera select + zoom slider from a catalog entry.
 * @param {{ defaultCameraPreset?: string, defaultCameraZoom?: number }|null|undefined} entry
 */
export function syncDefaultCamUi(entry) {
	if (els.defaultCamSelect) {
		els.defaultCamSelect.value = normalizeCameraPreset(entry?.defaultCameraPreset);
	}
	const z = normalizeCameraZoom(entry?.defaultCameraZoom);
	const pct = String(Math.round(z * 100));
	if (els.defaultZoom) els.defaultZoom.value = pct;
	if (els.defaultZoomVal) els.defaultZoomVal.textContent = `${pct}%`;
}

/**
 * @param {string} current
 * @returns {string}
 */
export function nextIsoPreset(current) {
	const cur = normalizeCameraPreset(current);
	const i = ISO_PRESETS.indexOf(/** @type {any} */ (cur));
	if (i < 0) return ISO_PRESETS[0];
	return ISO_PRESETS[(i + 1) % ISO_PRESETS.length];
}

/**
 * Replace preview host with a text placeholder.
 * @param {string} msg
 * @param {{ force?: boolean }} [opts]
 *   force=true — allow clearing even if a previewCont/canvas is live
 *   (default false refuses mid-build clears that used to blank the view with no error)
 */
export function showPreviewPlaceholder(msg, opts = {}) {
	if (!els.previewHost) return;

	const host = els.previewHost;
	const locked = host.dataset.basiPreviewBuilding === "1";
	const hasLive =
		!!host.querySelector("canvas")
		|| !!host.querySelector(".previewCont");

	// Progress updates must never wipe a building/live preview — that was a silent blank screen
	if (!opts.force && (locked || hasLive)) {
		console.warn(
			"[basi] showPreviewPlaceholder refused to clear host "
			+ `(building=${locked}, live=${hasLive}): "${msg}". `
			+ "Use force:true only when intentionally replacing a preview."
		);
		// Still surface the message without destroying the view
		updatePreviewLoading(host, { msg });
		return;
	}

	host.replaceChildren();
	updatePreviewLoading(host, {
		msg,
		fraction: opts.error ? 0 : 0.04,
		error: !!opts.error
	});
	clearInspectPanel();
	updateLayerBadge(null);
}

/**
 * @param {number|null|undefined} layer
 * @param {number} [maxLayer]
 */
export function updateLayerBadge(layer, maxLayer) {
	if (!els.layerBadge) return;
	if (layer == null || !Number.isFinite(layer)) {
		els.layerBadge.classList.add("hidden");
		els.layerBadge.textContent = "";
		return;
	}
	const max = maxLayer ?? primaryPreview()?.getMaxLayer?.() ?? "?";
	els.layerBadge.classList.remove("hidden");
	els.layerBadge.textContent = `Layer ${layer} / ${max}`;
	els.layerBadge.title = `Active slice Y=${layer}`;
}

export function initInspectWindow() {
	if (!els.inspectPanel || !els.inspectWinBar || inspectWin) return;
	inspectWin = bindFloatingWindow({
		win: els.inspectPanel,
		bar: els.inspectWinBar,
		body: els.inspectPanelBody || undefined,
		collapseBtn: els.inspectCollapseBtn,
		closeBtn: els.inspectCloseBtn,
		storageKey: "basi.inspectWin.v1",
		onClose: () => deselectInspectAndRefresh()
	});
	window.addEventListener("resize", () => inspectWin?.clamp());
}

export function clearInspectPanel() {
	if (!els.inspectPanel) return;
	els.inspectPanel.classList.add("hidden");
	els.inspectPanelBody?.replaceChildren();
}

/**
 * Show Minecraft-style container UI (or hide).
 * @param {HTMLElement|null} node
 */
export function showInspectPanelNode(node) {
	if (!els.inspectPanel) return;
	if (!inspectWin) initInspectWindow();
	if (!node) {
		clearInspectPanel();
		return;
	}
	const body = els.inspectPanelBody || els.inspectPanel;
	body.replaceChildren(node);
	const title = node.querySelector?.(".mc-inv-title")?.textContent?.trim();
	if (els.inspectWinTitle) els.inspectWinTitle.textContent = title || "Inspect";
	els.inspectPanel.classList.remove("hidden");
	inspectWin?.setCollapsed(false);
	requestAnimationFrame(() => {
		inspectWin?.placeDefault();
		requestAnimationFrame(() => inspectWin?.placeDefault());
	});
	node.querySelector?.("[data-action=close-inspect]")?.addEventListener("click", () => {
		clearInspectPanel();
		primaryPreview()?.requestRedraw?.();
	});
}

/**
 * Deselect container UI and force a viewport redraw.
 */
export function deselectInspectAndRefresh() {
	clearInspectPanel();
	const p = primaryPreview();
	p?.requestRedraw?.();
}

export function isTypingTarget(el) {
	if (!el || !(el instanceof Element)) return false;
	const tag = el.tagName;
	if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
	if (/** @type {HTMLElement} */ (el).isContentEditable) return true;
	return false;
}

/**
 * Sync layer UI from the active preview instance.
 */
export function syncLayerUiFromPreview() {
	const p = primaryPreview();
	if (!p?.getSelectedLayer) {
		updateLayerBadge(null);
		return;
	}
	updateLayerBadge(p.getSelectedLayer(), p.getMaxLayer?.());
}

/** @param {string|null|undefined} id */
export function isNsewPreset(id) {
	return id === "north" || id === "south" || id === "east" || id === "west";
}

/**
 * Highlight active camera preset button, sync tilt, show tilt only in layer mode + NSEW.
 * @param {string} [preset]
 */
export function syncCamBarActive(preset) {
	const p = primaryPreview();
	const id = normalizeCameraPreset(preset || p?.getCameraPreset?.() || "iso-north");
	document.querySelectorAll("#camBar [data-cam]").forEach(btn => {
		const cam = btn.getAttribute("data-cam") || "";
		const active =
			cam === id
			|| (cam === "iso" && isIsoPreset(id));
		btn.classList.toggle("active", active);
	});
	// Iso button label shows current iso quarter
	if (els.camIsoBtn) {
		const isoId = isIsoPreset(id) ? (id === "iso" ? "iso-north" : id) : null;
		els.camIsoBtn.textContent = isoId ? (ISO_LABELS[isoId] || "Iso") : "Iso N";
		els.camIsoBtn.title = isoId
			? `Isometric 3/4 ${isoId.replace("iso-", "").toUpperCase()} (ortho) — click to cycle N→S→E→W`
			: "Cycle isometric 3/4 N → S → E → W (orthographic)";
	}
	const inLayer = p?.getSelectedLayer?.() != null && Number.isFinite(p.getSelectedLayer());
	const showTilt = inLayer && isNsewPreset(id);
	const tiltWrap = document.querySelector(".basi-cam-tilt");
	if (tiltWrap) {
		tiltWrap.classList.toggle("hidden", !showTilt);
	}
	const camTilt = /** @type {HTMLInputElement|null} */ (document.getElementById("camTilt"));
	const camTiltVal = document.getElementById("camTiltVal");
	const tilt = p?.getCameraTilt?.();
	if (camTilt && tilt != null && Number.isFinite(tilt)) {
		camTilt.value = String(Math.round(tilt));
		if (camTiltVal) camTiltVal.textContent = `${Math.round(tilt)}°`;
	}
}

/**
 * Apply a camera preset from UI or hotkey (keeps tilt UI in sync).
 * Clicking Iso cycles iso-north → south → east → west.
 * @param {string} preset
 * @param {{ cycleIso?: boolean }} [opts]
 */
export function applyCameraPreset(preset, opts = {}) {
	const p = primaryPreview();
	if (!p?.setCameraPreset) {
		console.warn("[basi] applyCameraPreset: no active preview");
		return false;
	}
	let next = preset;
	// Iso toolbar button cycles through iso-N/S/E/W
	if (opts.cycleIso || preset === "iso") {
		const cur = p.getCameraPreset?.() || "iso-north";
		next = isIsoPreset(cur) ? nextIsoPreset(cur) : "iso-north";
	}
	next = normalizeCameraPreset(next);
	const inLayer = p.getSelectedLayer?.() != null && Number.isFinite(p.getSelectedLayer());
	// Layer mode + NSEW: ensure tilt is set (default 67 if never touched this session)
	if (inLayer && isNsewPreset(next)) {
		const t = p.getCameraTilt?.();
		if (t == null || !Number.isFinite(t)) {
			p.setCameraTilt?.(67, { reframe: false });
		}
	}
	const tiltEl = /** @type {HTMLInputElement|null} */ (document.getElementById("camTilt"));
	if (tiltEl && p.setCameraTilt && isNsewPreset(next)) {
		p.setCameraTilt(+tiltEl.value, { reframe: false });
	}
	try {
		p.setCameraPreset(next);
	} catch (err) {
		console.error("[basi] setCameraPreset failed", next, err);
		return false;
	}
	syncCamBarActive(next);
	// Force a paint even if damping is off / loop idle
	p.requestRedraw?.();
	return true;
}

/**
 * Step Y slice from keyboard or 3-finger tap.
 * @param {1|-1|"all"} delta
 * @returns {boolean}
 */
export function applyLayerStep(delta) {
	if (!session.hasActive) return false;
	if (els.detailPanel?.classList.contains("hidden")) return false;
	const p = primaryPreview();
	if (!p) return false;
	if (delta === "all") {
		p.showAllLayers?.();
		updateLayerBadge(null);
	} else {
		const layer = p.stepLayer?.(delta);
		updateLayerBadge(layer, p.getMaxLayer?.());
	}
	syncCamBarActive(p.getCameraPreset?.());
	p.requestRedraw?.();
	deselectInspectAndRefresh();
	return true;
}

/**
 * Leave layer slice and restore this structure's default camera (usually iso).
 * Used by the iPad three-finger tap in the middle of the preview.
 * @returns {boolean}
 */
export function restoreDefaultCamera() {
	if (!session.hasActive) return false;
	if (els.detailPanel?.classList.contains("hidden")) return false;
	const p = primaryPreview();
	if (!p) return false;
	p.showAllLayers?.();
	updateLayerBadge(null);
	const entry = getSelectedId() ? catalog.get(getSelectedId()) : null;
	const preset = normalizeCameraPreset(entry?.defaultCameraPreset);
	const zoom = normalizeCameraZoom(entry?.defaultCameraZoom);
	p.setCameraZoom?.(zoom, { reframe: false });
	applyCameraPreset(preset);
	deselectInspectAndRefresh();
	return true;
}

/**
 * @param {KeyboardEvent} e
 */
export function onPreviewKeydown(e) {
	if (isTypingTarget(e.target)) return;
	if (!session.hasActive) return;
	// Only when detail is open
	if (els.detailPanel?.classList.contains("hidden")) return;

	const p = primaryPreview();
	if (!p) return;

	if (e.key === "ArrowUp") {
		e.preventDefault();
		applyLayerStep(1);
		return;
	}
	if (e.key === "ArrowDown") {
		e.preventDefault();
		applyLayerStep(-1);
		return;
	}
	if (e.key === "ArrowLeft") {
		e.preventDefault();
		applyLayerStep("all");
		return;
	}
	if (e.key === "ArrowRight") {
		e.preventDefault();
		// Re-frame with remembered camera preset + tilt (same as clicking that preset)
		const preset = p.getCameraPreset?.() || "iso";
		if (preset === "free") {
			applyCameraPreset(p.getSelectedLayer?.() != null ? "north" : "iso");
		} else {
			applyCameraPreset(preset);
		}
		deselectInspectAndRefresh();
		return;
	}
	if ((e.key === "c" || e.key === "C") && !e.ctrlKey && !e.metaKey && !e.altKey) {
		e.preventDefault();
		toggleCamDock();
		return;
	}
	// Number keys 1–7 for camera presets (same as UI buttons)
	// While fly mode is active, leave WASD / Space / Shift to the renderer
	if (p.isFlyMode || p.getCameraPreset?.() === "fly") {
		const flyCode = e.code === "KeyW" || e.code === "KeyA" || e.code === "KeyS" || e.code === "KeyD"
			|| e.code === "Space"
			|| e.code === "ShiftLeft" || e.code === "ShiftRight";
		if (flyCode) return;
	}
	const camKeys = {
		"1": "iso", // cycles iso N/S/E/W
		"2": "north",
		"3": "south",
		"4": "east",
		"5": "west",
		"6": "top",
		"7": "free",
		"8": "fly"
	};
	if (camKeys[e.key] && p.setCameraPreset) {
		e.preventDefault();
		applyCameraPreset(camKeys[e.key], { cycleIso: camKeys[e.key] === "iso" });
		return;
	}
	if (e.key === "Escape") {
		deselectInspectAndRefresh();
		const dock = document.getElementById("camDock");
		if (dock?.classList.contains("basi-cam-open")) toggleCamDock(false);
	}
}

/**
 * Raise the camera bar from the bottom edge. Omit `force` to toggle.
 * @param {boolean} [force]
 */
export function toggleCamDock(force) {
	const dock = document.getElementById("camDock");
	if (!dock) return false;
	const on = force == null ? !dock.classList.contains("basi-cam-open") : !!force;
	dock.classList.toggle("basi-cam-open", on);
	dock.setAttribute("aria-expanded", on ? "true" : "false");
	if (on) dock.classList.remove("basi-cam-tucked");
	return on;
}

/**
 * Hide catalog, details, camera bar, and inspect (iPad tap on the 3D view).
 */
export function hidePreviewChrome() {
	tuckFloatDock(els?.catalogFloat);
	tuckFloatDock(els?.detailFloat);
	const dock = document.getElementById("camDock");
	if (dock) {
		dock.classList.add("basi-cam-tucked");
		dock.classList.remove("basi-cam-open");
		dock.setAttribute("aria-expanded", "false");
	}
	const active = document.activeElement;
	if (active instanceof HTMLElement && active.closest?.(".basi-float, .basi-cam-dock, .basi-inspect-panel")) {
		active.blur();
	}
	clearInspectPanel();
}

/**
 * Pick at client coords → Minecraft-style inventory mockup for containers.
 * @param {number} clientX
 * @param {number} clientY
 */
export async function inspectAtClient(clientX, clientY) {
	const p = primaryPreview();
	if (!p?.pickAtClient) return;

	const hit = p.pickAtClient(clientX, clientY);
	// Only open UI for containers / entities with inventory layouts; still show mockup for any block as generic if it has items or is known container
	try {
		const { renderContainerUi, resolveContainerKind } = await import("../viewer/containerUi.js");
		const src =
			hit.kind === "block" && hit.block
				? {
					name: hit.block.name,
					blockEntityId: hit.block.blockEntityId,
					doubleChest: hit.block.doubleChest || null
				}
				: hit.kind === "entity" && hit.entity
					? { name: hit.entity.identifier, identifier: hit.entity.identifier }
					: null;
		const kind = src ? resolveContainerKind(src) : "generic";
		const hasItems =
			(hit.kind === "block" && hit.block?.items?.length)
			|| (hit.kind === "entity" && hit.entity?.items?.length);
		const blockName = String(hit.block?.name || "").replace(/^minecraft:/, "");
		// Composter / sign / lectern / redstone etc. open mockups without inventory
		const isContainer =
			kind !== "generic"
			|| hasItems
			|| (hit.kind === "block" && hit.block?.blockEntityId)
			|| blockName === "redstone_wire"
			|| blockName.includes("sign")
			|| blockName === "lectern";

		if (hit.kind === "miss" || !isContainer) {
			// Non-container: tiny name panel. Empty minecarts used to miss this and
			// look like a dead click.
			if (hit.kind === "block" && hit.block) {
				const wrap = document.createElement("div");
				wrap.className = "mc-inv mc-inv-simple";
				wrap.innerHTML = `<div class="mc-inv-header"><span class="mc-inv-title">${escapeHtml(hit.block.name)}</span><button type="button" class="mc-inv-close" data-action="close-inspect" aria-label="Close">×</button></div>`;
				showInspectPanelNode(wrap);
			} else if (hit.kind === "entity" && hit.entity) {
				const wrap = document.createElement("div");
				wrap.className = "mc-inv mc-inv-simple";
				const label = escapeHtml(
					hit.entity.customName || hit.entity.identifier || "entity"
				);
				wrap.innerHTML = `<div class="mc-inv-header"><span class="mc-inv-title">${label}</span><button type="button" class="mc-inv-close" data-action="close-inspect" aria-label="Close">×</button></div>`;
				showInspectPanelNode(wrap);
			} else {
				clearInspectPanel();
			}
			// Keep camera pose + layer selection; only fit/redraw canvas
			p.requestRedraw?.({ keepCamera: true });
			return;
		}
		const node = renderContainerUi(hit);
		showInspectPanelNode(node);
		// Load Bedrock item icons into slots (vanilla samples via CDN)
		void import("../viewer/itemIconLoader.js")
			.then(async ({ hydrateInventoryIcons }) => {
				const wanted = node.querySelectorAll?.("img[data-item-icon]")?.length ?? 0;
				// Empty inventories have no icon imgs — not an error
				if (!wanted) return;
				const n = await hydrateInventoryIcons(node);
				if (!n) {
					console.warn(
						`[basi] item icons: 0/${wanted} loaded (CDN 404s or unknown ids). Slot text labels still show.`
					);
				}
			})
			.catch(err => console.warn("[basi] item icons failed", err));
		// Keep camera + layer when opening inventory mockup
		p.requestRedraw?.({ keepCamera: true });
	} catch (err) {
		console.warn("[basi] container UI failed", err);
		clearInspectPanel();
	}
}

/**
 * Double-click canvas → inspect (desktop).
 * @param {MouseEvent} e
 */
export async function onPreviewDblClick(e) {
	const t = e.target;
	if (!(t instanceof HTMLCanvasElement) && !(t instanceof Element && t.closest?.("canvas"))) {
		return;
	}
	return inspectAtClient(e.clientX, e.clientY);
}

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_PX = 10;

function setOrbitSuppressed(on) {
	const host = els.previewHost;
	const canvas = host?.querySelector?.("canvas");
	if (canvas) {
		if (on) canvas.dataset.basiSuppressOrbit = "1";
		else delete canvas.dataset.basiSuppressOrbit;
	}
	const controls = primaryPreview()?.orbitControls;
	if (controls) controls.enabled = !on;
}

/**
 * Long-press canvas (touch) → same inspect path as double-click.
 * @param {HTMLElement|null} host
 */
export function bindPreviewInspectLongPress(host) {
	if (!host) return;
	let timer = 0;
	let startX = 0;
	let startY = 0;
	/** @type {number|null} */
	let pointerId = null;
	let fired = false;

	const clearTimer = () => {
		if (timer) {
			clearTimeout(timer);
			timer = 0;
		}
	};

	const onDown = e => {
		if (!(e instanceof PointerEvent) || e.pointerType !== "touch") return;
		if (e.isPrimary === false) {
			clearTimer();
			return;
		}
		const t = e.target;
		if (!(t instanceof Element) || !t.closest("canvas")) return;
		startX = e.clientX;
		startY = e.clientY;
		pointerId = e.pointerId;
		fired = false;
		clearTimer();
		timer = window.setTimeout(() => {
			timer = 0;
			fired = true;
			setOrbitSuppressed(true);
			void inspectAtClient(startX, startY);
			try {
				navigator.vibrate?.(10);
			} catch {
				/* ignore */
			}
		}, LONG_PRESS_MS);
	};

	const onMove = e => {
		if (!(e instanceof PointerEvent) || pointerId == null || e.pointerId !== pointerId) return;
		if (e.isPrimary === false) {
			clearTimer();
			return;
		}
		if (Math.hypot(e.clientX - startX, e.clientY - startY) > LONG_PRESS_MOVE_PX) {
			clearTimer();
		}
	};

	const onEnd = e => {
		if (!(e instanceof PointerEvent)) return;
		if (pointerId == null || e.pointerId !== pointerId) return;
		clearTimer();
		pointerId = null;
		if (fired) {
			const canvas = host.querySelector("canvas");
			requestAnimationFrame(() => {
				const controls = primaryPreview()?.orbitControls;
				if (controls) controls.enabled = true;
				if (canvas) delete canvas.dataset.basiSuppressOrbit;
			});
			fired = false;
		}
	};

	const onContextMenu = e => {
		if (!(e.target instanceof Element) || !e.target.closest("canvas")) return;
		e.preventDefault();
	};

	host.addEventListener("pointerdown", onDown);
	host.addEventListener("pointermove", onMove);
	host.addEventListener("pointerup", onEnd);
	host.addEventListener("pointercancel", onEnd);
	host.addEventListener("contextmenu", onContextMenu);
}

