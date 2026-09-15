/**
 * Detail dock: selection header, hoppers, materials, meta, notes.
 */

import {
	catalog,
	els,
	getSelectedId,
	uiFlags
} from "../app/state.js";
import { setStatus, formatSize, escapeHtml, stat } from "../app/dom.js";
import { contrastText } from "../viewer/catalog.js";
import { renderFeatureChips } from "./featureChips.js";

function $(id) {
	return document.getElementById(id);
}

/**
 * Top header: name and source. Hopper lock chip lives in the details dock.
 * @param {any|null} entry
 */
export function updateSelectionHeader(entry) {
	if (!entry) {
		els.selectionBar?.classList.add("hidden");
		if (els.detailFloatTitle) {
			els.detailFloatTitle.textContent = "Details";
			els.detailFloatTitle.title = "Details";
		}
		renderCategoryAssign(null);
		return;
	}
	els.selectionBar?.classList.remove("hidden");
	if (els.headerName) els.headerName.textContent = entry.name || "—";
	if (els.detailFloatTitle) {
		const name = entry.name || "Details";
		els.detailFloatTitle.textContent = name;
		els.detailFloatTitle.title = name;
	}
	if (els.headerSource) {
		els.headerSource.textContent = entry.parseError
			? `${entry.sourceName} (${entry.sourceKind}) — ${entry.parseError}`
			: `${entry.sourceName} · ${entry.sourceKind}`;
	}
	renderHopperChip(entry.hopperStats);
	renderCategoryAssign(entry);
}

/**
 * Category / entry selects above Information.
 * @param {any|null} entry
 */
export function renderCategoryAssign(entry) {
	const catSel = els.detailCategorySelect;
	const entSel = els.detailEntrySelect;
	if (!catSel || !entSel) return;
	bindCategoryAssignOnce();

	const cats = catalog.listCategories();
	catSel.replaceChildren();
	const none = document.createElement("option");
	none.value = "";
	none.textContent = "Uncategorized";
	catSel.appendChild(none);
	for (const c of cats) {
		const opt = document.createElement("option");
		opt.value = c.id;
		opt.textContent = c.name;
		catSel.appendChild(opt);
	}

	if (!entry) {
		catSel.value = "";
		entSel.replaceChildren();
		const empty = document.createElement("option");
		empty.value = "";
		empty.textContent = "—";
		entSel.appendChild(empty);
		entSel.disabled = true;
		els.detailEntryField?.classList.add("is-disabled");
		catSel.disabled = true;
		return;
	}

	catSel.disabled = false;
	const fn = entry.entryId ? catalog.getCatalogEntry(entry.entryId) : null;
	const categoryId = fn?.categoryId || "";
	catSel.value = categoryId;

	entSel.replaceChildren();
	if (!categoryId) {
		const empty = document.createElement("option");
		empty.value = "";
		empty.textContent = "—";
		entSel.appendChild(empty);
		entSel.disabled = true;
		els.detailEntryField?.classList.add("is-disabled");
		return;
	}

	entSel.disabled = false;
	els.detailEntryField?.classList.remove("is-disabled");
	for (const e of catalog.listCatalogEntries(categoryId)) {
		const opt = document.createElement("option");
		opt.value = e.id;
		opt.textContent = e.name;
		entSel.appendChild(opt);
	}
	entSel.value = entry.entryId || "";
}

function bindCategoryAssignOnce() {
	const catSel = els.detailCategorySelect;
	const entSel = els.detailEntrySelect;
	if (!catSel || catSel.dataset.bound) return;
	catSel.dataset.bound = "1";
	catSel.addEventListener("change", () => {
		const id = getSelectedId();
		if (!id) return;
		const catId = catSel.value || null;
		void catalog.assignStructureToCategory(id, catId).then(
			() => {
				setStatus("Category updated.", "ok");
				catSel.blur();
			},
			() => {
				setStatus("That category has no entry. Add one in Editor.", "warn");
				renderCategoryAssign(catalog.get(id));
			}
		);
	});
	entSel?.addEventListener("change", () => {
		const id = getSelectedId();
		if (!id) return;
		void catalog.setStructureEntry(id, entSel.value || null).then(() => {
			setStatus("Entry updated.", "ok");
			entSel.blur();
		});
	});
}

/**
 * Color for hopper lock percent: red (0% bad) → yellow → green (100% good).
 * @param {number} pct 0–100
 * @returns {string} css color
 */
export function hopperLockColor(pct) {
	const t = Math.max(0, Math.min(100, pct)) / 100;
	// HSL: 0° red → 120° green (100% locked = best)
	const hue = 120 * t;
	const sat = 70;
	const light = 38 + t * 6;
	return `hsl(${hue.toFixed(1)} ${sat}% ${light.toFixed(0)}%)`;
}

/**
 * @param {import("../viewer/hopperStats.js").HopperStats|null|undefined} stats
 */
export function renderHopperChip(stats) {
	if (!els.hopperStatsLabel) return;
	const chip = $("hopperStatsChip");
	if (!stats) {
		els.hopperStatsLabel.textContent = "Hoppers —";
		if (els.hopperStatsDetail) els.hopperStatsDetail.textContent = "";
		if (chip) {
			chip.style.removeProperty("--hopper-lock-color");
			chip.classList.remove("has-locked", "has-pct");
		}
		return;
	}
	const locked = stats.locked ?? 0;
	const total = stats.hoppers ?? 0;
	const carts = stats.hopperMinecarts ?? 0;
	const pct = total > 0 ? Math.round((locked / total) * 100) : 0;

	if (!total && !carts) {
		els.hopperStatsLabel.textContent = "Hoppers 0%";
		if (els.hopperStatsDetail) els.hopperStatsDetail.textContent = "no hoppers in structure";
		if (chip) {
			chip.style.setProperty("--hopper-lock-color", hopperLockColor(0));
			chip.classList.add("has-pct");
			chip.classList.remove("has-locked");
		}
		return;
	}
	if (total) {
		els.hopperStatsLabel.textContent = `Hoppers ${pct}% locked`;
		const parts = [`${locked}/${total}`, `${stats.unlocked ?? total - locked} open`];
		if (carts) parts.push(`${carts} cart${carts === 1 ? "" : "s"}`);
		if (els.hopperStatsDetail) els.hopperStatsDetail.textContent = parts.join(" · ");
	} else {
		els.hopperStatsLabel.textContent = `Hopper carts ${carts}`;
		if (els.hopperStatsDetail) {
			els.hopperStatsDetail.textContent = "minecart hoppers (lock via activator rail in-game)";
		}
	}
	if (chip) {
		chip.style.setProperty("--hopper-lock-color", hopperLockColor(total ? pct : 0));
		chip.classList.add("has-pct");
		chip.classList.toggle("has-locked", locked > 0);
		chip.title =
			`Hopper lock: ${pct}% (${locked} of ${total}). `
			+ "Bedrock toggle_bit=true when powered/locked by redstone. "
			+ "Hopper minecarts use activator rails in-game.";
	}
}

/**
 * @param {any} entry
 * @returns {Set<string>}
 */
export function acquiredMaterialSet(entry) {
	const arr = Array.isArray(entry?.acquiredMaterials) ? entry.acquiredMaterials : [];
	return new Set(arr.map(String));
}

/**
 * Sort materials: needed first (most→least), acquired last (most→least).
 * @param {any[]} materials
 * @param {Set<string>} acquired
 */
export function sortMaterialsWithAcquired(materials, acquired) {
	return [...materials].sort((a, b) => {
		const aa = acquired.has(a.id) ? 1 : 0;
		const ba = acquired.has(b.id) ? 1 : 0;
		if (aa !== ba) return aa - ba; // unacquired first
		return (b.count - a.count) || String(a.label).localeCompare(String(b.label));
	});
}

/**
 * Toggle acquired flag for a material id on the selected structure.
 * @param {string} entryId
 * @param {string} materialId
 * @param {boolean} acquired
 */
export async function setMaterialAcquired(entryId, materialId, acquired) {
	const entry = catalog.get(entryId);
	if (!entry) return;
	const set = acquiredMaterialSet(entry);
	if (acquired) set.add(materialId);
	else set.delete(materialId);
	try {
		await catalog.patch(entryId, { acquiredMaterials: [...set] });
	} catch {
		/* persist error is on catalog.lastPersistError */
	}
	if (getSelectedId() === entryId) {
		renderMaterialList(catalog.get(entryId));
	}
}

/**
 * Vertical material list: grouped variants, count, stacks/shulkers, most → least.
 * Acquired items sink to the bottom. Empty list only auto-rebuilds once.
 * @param {any} entry
 */
export function renderMaterialList(entry) {
	const list = els.detailMaterialList;
	if (!list) return;
	list.replaceChildren();

	/** @type {any[]} */
	let materials = entry.materials;
	if (!Array.isArray(materials) || !materials.length) {
		// Guard: only attempt rebuild once per entry (empty [] after rebuild is valid)
		if (entry.file && !entry._materialsLoadAttempted) {
			entry._materialsLoadAttempted = true;
			const liLoading = document.createElement("li");
			liLoading.className = "basi-mat-empty";
			liLoading.textContent = "Loading materials…";
			list.appendChild(liLoading);
			if (els.materialListHint) els.materialListHint.textContent = "";
			void ensureMaterials(entry).then(async mats => {
				entry.materials = Array.isArray(mats) ? mats : [];
				try {
					await catalog.patch(entry.id, { materials: entry.materials });
				} catch {
					/* persist optional */
				}
				if (getSelectedId() === entry.id) {
					renderMaterialList(entry);
				}
			});
			return;
		}
		const li = document.createElement("li");
		li.className = "basi-mat-empty";
		li.textContent = "No materials";
		list.appendChild(li);
		if (els.materialListHint) els.materialListHint.textContent = "";
		return;
	}

	const acquired = acquiredMaterialSet(entry);
	materials = sortMaterialsWithAcquired(materials, acquired);

	const totalKinds = materials.length;
	const acquiredN = materials.filter(m => acquired.has(m.id)).length;
	// Header format: "Materials List 16/64" (acquired / total kinds)
	if (els.materialListHint) {
		els.materialListHint.textContent = `${acquiredN}/${totalKinds}`;
	}

	for (const row of materials) {
		const isAcquired = acquired.has(row.id);
		const li = document.createElement("li");
		li.className = "basi-mat-row" + (isAcquired ? " is-acquired" : "");

		const checkWrap = document.createElement("label");
		checkWrap.className = "basi-mat-check";
		checkWrap.title = isAcquired ? "Mark as still needed" : "Mark as acquired";
		const cb = document.createElement("input");
		cb.type = "checkbox";
		cb.checked = isAcquired;
		cb.setAttribute("aria-label", `Acquired: ${row.label}`);
		cb.addEventListener("change", () => {
			void setMaterialAcquired(entry.id, row.id, cb.checked);
		});
		// Prevent double-toggle from label quirks
		cb.addEventListener("click", e => e.stopPropagation());
		checkWrap.appendChild(cb);

		const left = document.createElement("div");
		left.className = "basi-mat-name";
		left.append(document.createTextNode(row.label));
		const idEl = document.createElement("span");
		idEl.className = "basi-mat-id";
		idEl.textContent = row.id;
		left.appendChild(idEl);

		const right = document.createElement("div");
		right.className = "basi-mat-right";

		const total = document.createElement("span");
		total.className = "basi-mat-count";
		total.textContent = Number(row.count).toLocaleString();
		total.title = "Total items (grouped variants summed)";

		const part = document.createElement("span");
		part.className = "basi-mat-partition";
		const partitionText = row.partition || formatPartitionFallback(row);
		// Shulkers / stacks / loose breakdown under the total
		if (partitionText && partitionText !== String(row.count)) {
			part.textContent = partitionText;
			part.title = "Shulkers (27 stacks) + stacks + loose";
			right.append(total, part);
		} else {
			right.append(total);
		}

		li.append(checkWrap, left, right);
		list.appendChild(li);
	}
}

/**
 * Fill Creator / Credits / Source link inputs for the selected structure.
 * @param {any|null} entry
 */
export function syncMetaFields(entry) {
	if (els.metaCreator) {
		els.metaCreator.value = entry?.creator ? String(entry.creator) : "";
	}
	if (els.metaCredits) {
		els.metaCredits.value = entry?.credits ? String(entry.credits) : "";
	}
	if (els.metaSourceLink) {
		els.metaSourceLink.value = entry?.sourceLink ? String(entry.sourceLink) : "";
		els.metaSourceLink.classList.remove("is-invalid");
	}
	els.metaSourceLinkError?.classList.add("hidden");
	renderAssignedFeatures(entry);
}

/**
 * Read-only assigned feature chips for the viewer detail dock.
 * @param {any|null} entry
 */
export function renderAssignedFeatures(entry) {
	const host = els.detailFeatureChips;
	if (!host) return;
	if (!entry) {
		host.replaceChildren();
		host.classList.add("is-empty");
		return;
	}
	const features = catalog.listFeaturesForStructure(entry.id);
	renderFeatureChips(host, features, {
		onClick: feature => {
			void catalog.toggleStructureFeature(entry.id, feature.id).then(() => {
				const next = catalog.get(entry.id);
				renderAssignedFeatures(next);
				renderFeaturePicker();
			});
		}
	});
	if (!features.length) {
		host.classList.add("is-empty");
	}
}

/**
 * Open the viewer feature picker (same idea as the editor feature library).
 */
export function openFeatureDialog() {
	const dlg = els.featureDialog;
	if (!dlg || !getSelectedId()) return;
	renderFeaturePicker();
	if (typeof dlg.showModal === "function") dlg.showModal();
	else dlg.setAttribute("open", "");
	els.featureNewName?.focus();
}

export function closeFeatureDialog() {
	const dlg = els.featureDialog;
	if (!dlg) return;
	if (typeof dlg.close === "function") dlg.close();
	else dlg.removeAttribute("open");
}

export function renderFeaturePicker() {
	const host = els.featureDialogList;
	if (!host) return;
	const sid = getSelectedId();
	const entry = sid ? catalog.get(sid) : null;
	const assigned = new Set(entry?.featureIds || []);
	if (els.featureDialogHint) {
		els.featureDialogHint.textContent = entry
			? `Click a feature to assign it to “${entry.name}”.`
			: "Select a structure first.";
	}
	host.replaceChildren();
	const list = catalog.listFeatures();
	if (!list.length) {
		const empty = document.createElement("p");
		empty.className = "basi-ed-hint";
		empty.textContent = "No features yet — create one above.";
		host.appendChild(empty);
		return;
	}
	for (const feat of list) {
		const card = document.createElement("button");
		card.type = "button";
		card.className = "basi-ed-feat-card basi-feat-pick" + (assigned.has(feat.id) ? " is-assigned" : "");
		card.style.setProperty("--feat-color", feat.color || "#64748b");
		const name = document.createElement("div");
		name.className = "basi-ed-feat-name";
		name.style.background = feat.color || "#64748b";
		name.style.color = contrastText(feat.color || "#64748b");
		name.textContent = feat.name;
		const desc = document.createElement("p");
		desc.className = "basi-ed-feat-desc";
		desc.textContent = feat.description || "No description";
		card.append(name, desc);
		if (assigned.has(feat.id)) {
			const flag = document.createElement("span");
			flag.className = "basi-ed-assigned-flag";
			flag.textContent = "Assigned";
			card.appendChild(flag);
		}
		card.addEventListener("click", () => {
			if (!sid) return;
			void catalog.toggleStructureFeature(sid, feat.id).then(() => {
				renderAssignedFeatures(catalog.get(sid));
				renderFeaturePicker();
			});
		});
		host.appendChild(card);
	}
}

/**
 * @param {string} [rawName]
 * @param {string} [rawColor]
 */
export async function createFeatureFromDialog(rawName, rawColor) {
	const sid = getSelectedId();
	if (!sid) return null;
	const name = String(rawName || "").trim() || "New feature";
	const color = String(rawColor || "#64748b");
	const feat = await catalog.addFeature({ name, color });
	await catalog.toggleStructureFeature(sid, feat.id);
	if (els.featureNewName) els.featureNewName.value = "";
	renderAssignedFeatures(catalog.get(sid));
	renderFeaturePicker();
	return feat;
}

/**
 * Normalize/validate a web URL. Empty is allowed. Returns null if invalid non-empty.
 * @param {string} raw
 * @returns {{ ok: true, value: string } | { ok: false, value: string }}
 */
export function normalizeSourceLink(raw) {
	const trimmed = String(raw ?? "").trim();
	if (!trimmed) return { ok: true, value: "" };
	let url = trimmed;
	// Allow bare domains by prepending https://
	if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
		url = `https://${url}`;
	}
	try {
		const u = new URL(url);
		if (u.protocol !== "http:" && u.protocol !== "https:") {
			return { ok: false, value: trimmed };
		}
		return { ok: true, value: u.href };
	} catch {
		return { ok: false, value: trimmed };
	}
}

/**
 * Persist a meta text field on blur/change for the selected structure.
 * @param {"creator"|"credits"|"sourceLink"} field
 * @param {string} raw
 */
export async function saveMetaField(field, raw) {
	if (!getSelectedId()) return;
	const entry = catalog.get(getSelectedId());
	if (!entry) return;

	if (field === "sourceLink") {
		const result = normalizeSourceLink(raw);
		if (!result.ok) {
			els.metaSourceLink?.classList.add("is-invalid");
			els.metaSourceLinkError?.classList.remove("hidden");
			return;
		}
		els.metaSourceLink?.classList.remove("is-invalid");
		els.metaSourceLinkError?.classList.add("hidden");
		// Normalize display to canonical URL when non-empty
		if (els.metaSourceLink && result.value) {
			els.metaSourceLink.value = result.value;
		}
		if ((entry.sourceLink || "") === result.value) return;
		entry.sourceLink = result.value;
		try {
			await catalog.patch(getSelectedId(), { sourceLink: result.value });
		} catch {
			/* keep in-memory */
		}
		return;
	}

	const value = String(raw ?? "");
	if ((entry[field] || "") === value) return;
	entry[field] = value;
	try {
		await catalog.patch(getSelectedId(), { [field]: value });
	} catch {
		/* keep in-memory */
	}
}

/**
 * Free-text detail lines on the selected structure (shown in Details panel).
 * @param {any} entry
 */
export function renderUserDetails(entry) {
	const list = els.userDetailsList;
	if (!list) return;
	list.replaceChildren();
	const notes = Array.isArray(entry.userDetails) ? entry.userDetails : [];
	if (!notes.length) {
		list.classList.add("is-empty");
		return;
	}
	list.classList.remove("is-empty");
	// Newest first
	const ordered = [...notes].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
	for (const note of ordered) {
		const li = document.createElement("li");
		li.className = "basi-detail-note";
		const text = document.createElement("div");
		text.className = "basi-detail-note-text";
		text.textContent = note.text;
		const del = document.createElement("button");
		del.type = "button";
		del.className = "basi-detail-note-del";
		del.title = "Remove detail";
		del.textContent = "×";
		del.addEventListener("click", () => {
			void removeUserDetail(entry.id, note.id);
		});
		li.append(text, del);
		list.appendChild(li);
	}
}

/**
 * @param {string} entryId
 * @param {string} text
 */
export async function addUserDetail(entryId, text) {
	const entry = catalog.get(entryId);
	if (!entry) return;
	const trimmed = String(text || "").trim();
	if (!trimmed) return;
	const note = {
		id: typeof crypto !== "undefined" && crypto.randomUUID
			? crypto.randomUUID()
			: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
		text: trimmed
	};
	const next = [...(entry.userDetails || []), note];
	entry.userDetails = next;
	try {
		await catalog.patch(entryId, { userDetails: next });
	} catch {
		/* keep in-memory */
	}
	if (getSelectedId() === entryId) renderUserDetails(entry);
}

/**
 * @param {string} entryId
 * @param {string} noteId
 */
export async function removeUserDetail(entryId, noteId) {
	const entry = catalog.get(entryId);
	if (!entry) return;
	const next = (entry.userDetails || []).filter(n => n.id !== noteId);
	entry.userDetails = next;
	try {
		await catalog.patch(entryId, { userDetails: next });
	} catch {
		/* keep in-memory */
	}
	if (getSelectedId() === entryId) renderUserDetails(entry);
}

/**
 * @param {HTMLElement|null|undefined} btn
 * @param {HTMLElement|null|undefined} body
 * @param {boolean} collapsed
 */
export function applyCollapseState(btn, body, collapsed) {
	if (btn) {
		btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
		const t = btn.querySelector(".basi-collapse-toggle");
		if (t) t.textContent = collapsed ? "▸" : "▾";
		btn.classList.toggle("is-collapsed", collapsed);
	}
	if (body) body.hidden = !!collapsed;
}

export function syncDetailCollapsibles() {
	applyCollapseState(els.detailsCollapseBtn, els.detailsCollapseBody, uiFlags.detailsSectionCollapsed);
	applyCollapseState(els.materialsCollapseBtn, els.materialsCollapseBody, uiFlags.materialsSectionCollapsed);
}

/** @param {any} row */
export function formatPartitionFallback(row) {
	if (row.shulkers || row.stacks || (row.loose != null && row.loose !== row.count)) {
		const bits = [];
		if (row.shulkers) bits.push(`${row.shulkers} shulker${row.shulkers === 1 ? "" : "s"}`);
		if (row.stacks) bits.push(`${row.stacks} stack${row.stacks === 1 ? "" : "s"}`);
		if (row.loose) bits.push(String(row.loose));
		return bits.join(" + ");
	}
	return "";
}

/**
 * @param {{ file: File, materials?: any[] }} entry
 */
export async function ensureMaterials(entry) {
	try {
		const { buildMaterialListFromFile } = await import("../viewer/materialList.js");
		return await buildMaterialListFromFile(entry.file);
	} catch (e) {
		console.warn("[basi] material list rebuild failed:", e);
		return [];
	}
}

/**
 * Light hopper scan (no material list rebuild).
 * @param {{ file: File, hopperStats?: any, id?: string }} entry
 */
export async function ensureHopperStats(entry) {
	try {
		const { scanHopperStatsFromFile } = await import("../viewer/hopperStats.js");
		return await scanHopperStatsFromFile(entry.file);
	} catch (e) {
		console.warn("[basi] hopper stats failed:", e);
		return null;
	}
}

