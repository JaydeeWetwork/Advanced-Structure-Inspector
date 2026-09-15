/**
 * Inspect floating window + pick (dblclick / long-press).
 */

import { els, primaryPreview } from "../app/state.js";
import { escapeHtml } from "../app/dom.js";
import { bindFloatingWindow } from "./floatingWindow.js";

/** @type {ReturnType<typeof bindFloatingWindow>|null} */
let inspectWin = null;

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

export function deselectInspectAndRefresh() {
	clearInspectPanel();
	primaryPreview()?.requestRedraw?.();
}

/**
 * @param {number} clientX
 * @param {number} clientY
 */
export async function inspectAtClient(clientX, clientY) {
	const p = primaryPreview();
	if (!p?.pickAtClient) return;

	const hit = p.pickAtClient(clientX, clientY);
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
		const isContainer =
			kind !== "generic"
			|| hasItems
			|| (hit.kind === "block" && hit.block?.blockEntityId)
			|| blockName === "redstone_wire"
			|| blockName.includes("sign")
			|| blockName === "lectern";

		if (hit.kind === "miss" || !isContainer) {
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
			p.requestRedraw?.({ keepCamera: true });
			return;
		}
		const node = renderContainerUi(hit);
		showInspectPanelNode(node);
		void import("../viewer/itemIconLoader.js")
			.then(async ({ hydrateInventoryIcons }) => {
				const wanted = node.querySelectorAll?.("img[data-item-icon]")?.length ?? 0;
				if (!wanted) return;
				const n = await hydrateInventoryIcons(node);
				if (!n) {
					console.warn(
						`[basi] item icons: 0/${wanted} loaded (CDN 404s or unknown ids). Slot text labels still show.`
					);
				}
			})
			.catch(err => console.warn("[basi] item icons failed", err));
		p.requestRedraw?.({ keepCamera: true });
	} catch (err) {
		console.warn("[basi] container UI failed", err);
		clearInspectPanel();
	}
}

/**
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
