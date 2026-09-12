/**
 * Colored feature chips used in viewer details and the editor.
 */

import { contrastText } from "../viewer/catalog.js";

/**
 * @param {import("../viewer/catalog.js").CatalogFeature} feature
 * @param {{
 *   assigned?: boolean,
 *   interactive?: boolean,
 *   title?: string
 * }} [opts]
 * @returns {HTMLElement}
 */
export function createFeatureChip(feature, opts = {}) {
	const el = document.createElement(opts.interactive ? "button" : "span");
	if (opts.interactive) el.type = "button";
	el.className = "basi-feature-chip" + (opts.assigned ? " is-assigned" : "");
	el.dataset.featureId = feature.id;
	el.style.setProperty("--feat-color", feature.color || "#64748b");
	el.style.color = contrastText(feature.color || "#64748b");
	el.textContent = feature.name;
	el.title = opts.title || feature.description || feature.name;
	return el;
}

/**
 * @param {HTMLElement} host
 * @param {import("../viewer/catalog.js").CatalogFeature[]} features
 * @param {{ onClick?: (feature: import("../viewer/catalog.js").CatalogFeature) => void, assignedIds?: Set<string> }} [opts]
 */
export function renderFeatureChips(host, features, opts = {}) {
	if (!host) return;
	host.replaceChildren();
	if (!features.length) {
		host.classList.add("is-empty");
		return;
	}
	host.classList.remove("is-empty");
	const assigned = opts.assignedIds || new Set();
	for (const feature of features) {
		const chip = createFeatureChip(feature, {
			assigned: assigned.has(feature.id),
			interactive: typeof opts.onClick === "function"
		});
		if (opts.onClick) {
			chip.addEventListener("click", () => opts.onClick(feature));
		}
		host.appendChild(chip);
	}
}
