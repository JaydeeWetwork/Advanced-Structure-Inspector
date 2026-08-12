/**
 * Preview chrome: layer badge, camera bar, inspect overlay, hotkeys.
 */

import { els, primaryPreview, session } from "../app/state.js";
import { escapeHtml } from "../app/dom.js";

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
	const locked = host.dataset.sdbPreviewBuilding === "1";
	const hasLive =
		!!host.querySelector("canvas")
		|| !!host.querySelector(".previewCont");

	// Progress updates must never wipe a building/live preview — that was a silent blank screen
	if (!opts.force && (locked || hasLive)) {
		console.warn(
			"[sdb] showPreviewPlaceholder refused to clear host "
			+ `(building=${locked}, live=${hasLive}): "${msg}". `
			+ "Use force:true only when intentionally replacing a preview."
		);
		// Still surface the message without destroying the view
		const existing = host.querySelector(".sdb-preview-loading-msg, .meta");
		if (existing && !host.querySelector("canvas")) {
			existing.textContent = msg;
		}
		return;
	}

	host.replaceChildren();
	const p = document.createElement("p");
	p.className = "meta";
	p.style.cssText = "padding:12px;color:#ccc;margin:0";
	p.textContent = msg;
	host.appendChild(p);
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

export function clearInspectPanel() {
	if (!els.inspectPanel) return;
	els.inspectPanel.classList.add("hidden");
	els.inspectPanel.replaceChildren();
}

/**
 * Show Minecraft-style container UI (or hide).
 * @param {HTMLElement|null} node
 */
export function showInspectPanelNode(node) {
	if (!els.inspectPanel) return;
	if (!node) {
		clearInspectPanel();
		return;
	}
	els.inspectPanel.classList.remove("hidden");
	els.inspectPanel.replaceChildren(node);
	// Close button inside mockup
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
			? `Isometric ${isoId.replace("iso-", "").toUpperCase()} — click to cycle N→S→E→W`
			: "Cycle isometric N → S → E → W";
	}
	const inLayer = p?.getSelectedLayer?.() != null && Number.isFinite(p.getSelectedLayer());
	const showTilt = inLayer && isNsewPreset(id);
	const tiltWrap = document.querySelector(".sdb-cam-tilt");
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
		console.warn("[sdb] applyCameraPreset: no active preview");
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
		console.error("[sdb] setCameraPreset failed", next, err);
		return false;
	}
	syncCamBarActive(next);
	// Force a paint even if damping is off / loop idle
	p.requestRedraw?.();
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
		const layer = p.stepLayer?.(1);
		updateLayerBadge(layer, p.getMaxLayer?.());
		// Entering layer mode sets N@67 inside renderer; refresh lit buttons + tilt visibility
		syncCamBarActive(p.getCameraPreset?.());
		p.requestRedraw?.();
		deselectInspectAndRefresh();
		return;
	}
	if (e.key === "ArrowDown") {
		e.preventDefault();
		const layer = p.stepLayer?.(-1);
		updateLayerBadge(layer, p.getMaxLayer?.());
		syncCamBarActive(p.getCameraPreset?.());
		p.requestRedraw?.();
		deselectInspectAndRefresh();
		return;
	}
	if (e.key === "ArrowLeft") {
		e.preventDefault();
		p.showAllLayers?.();
		updateLayerBadge(null);
		syncCamBarActive(p.getCameraPreset?.());
		p.requestRedraw?.();
		deselectInspectAndRefresh();
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
	}
}

/**
 * Double-click canvas → Minecraft-style inventory mockup for containers.
 * @param {MouseEvent} e
 */
export async function onPreviewDblClick(e) {
	const p = primaryPreview();
	if (!p?.pickAtClient) return;
	const t = e.target;
	if (!(t instanceof HTMLCanvasElement) && !(t instanceof Element && t.closest?.("canvas"))) {
		return;
	}

	const hit = p.pickAtClient(e.clientX, e.clientY);
	// Only open UI for containers / entities with inventory layouts; still show mockup for any block as generic if it has items or is known container
	try {
		const { renderContainerUi, resolveContainerKind } = await import("../viewer/containerUi.js");
		const src =
			hit.kind === "block" && hit.block
				? { name: hit.block.name, blockEntityId: hit.block.blockEntityId }
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
			// Non-container block: still show a tiny panel with just the name (no pos/states)
			if (hit.kind === "block" && hit.block) {
				const wrap = document.createElement("div");
				wrap.className = "mc-inv mc-inv-simple";
				wrap.innerHTML = `<div class="mc-inv-header"><span class="mc-inv-title">${escapeHtml(hit.block.name)}</span><button type="button" class="mc-inv-close" data-action="close-inspect" aria-label="Close">×</button></div>`;
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
		void import("../viewer/itemIconLoader.js?v=judo17")
			.then(async ({ hydrateInventoryIcons }) => {
				const wanted = node.querySelectorAll?.("img[data-item-icon]")?.length ?? 0;
				// Empty inventories have no icon imgs — not an error
				if (!wanted) return;
				const n = await hydrateInventoryIcons(node);
				if (!n) {
					console.warn(
						`[sdb] item icons: 0/${wanted} loaded (CDN 404s or unknown ids). Slot text labels still show.`
					);
				}
			})
			.catch(err => console.warn("[sdb] item icons failed", err));
		// Keep camera + layer when opening inventory mockup
		p.requestRedraw?.({ keepCamera: true });
	} catch (err) {
		console.warn("[sdb] container UI failed", err);
		clearInspectPanel();
	}
}

