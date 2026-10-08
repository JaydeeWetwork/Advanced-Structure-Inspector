/**
 * Centered preview load overlay + progress bar on #previewHost.
 */

/**
 * @param {HTMLElement} host
 */
export function ensurePreviewLoading(host) {
	let el = host.querySelector(".bLayers-preview-loading");
	if (el) return el;
	el = document.createElement("div");
	el.className = "bLayers-preview-loading";
	el.setAttribute("role", "status");
	el.setAttribute("aria-live", "polite");
	el.innerHTML =
		`<div class="bLayers-preview-loading-card">`
		+ `<p class="bLayers-preview-loading-msg"></p>`
		+ `<div class="bLayers-preview-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">`
		+ `<div class="bLayers-preview-progress-fill"></div>`
		+ `</div></div>`;
	host.appendChild(el);
	return el;
}

/**
 * @param {HTMLElement|null|undefined} host
 * @param {{ msg?: string, fraction?: number, error?: boolean }} [opts]
 */
export function updatePreviewLoading(host, opts = {}) {
	if (!host) return;
	const el = ensurePreviewLoading(host);
	const msgEl = el.querySelector(".bLayers-preview-loading-msg");
	const bar = el.querySelector(".bLayers-preview-progress");
	const fill = el.querySelector(".bLayers-preview-progress-fill");
	if (opts.msg != null && msgEl) msgEl.textContent = opts.msg;
	el.classList.toggle("is-error", !!opts.error);
	if (typeof opts.fraction === "number" && Number.isFinite(opts.fraction)) {
		const pct = Math.max(0, Math.min(100, Math.round(opts.fraction * 100)));
		if (fill) fill.style.width = `${pct}%`;
		if (bar) bar.setAttribute("aria-valuenow", String(pct));
	}
}

/**
 * @param {HTMLElement|null|undefined} host
 */
export function removePreviewLoading(host) {
	host?.querySelector(".bLayers-preview-loading")?.remove();
}
