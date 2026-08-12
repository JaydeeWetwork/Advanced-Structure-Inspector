/**
 * Catalog list + categories UI.
 */

import {
	catalog,
	els,
	getSelectedId,
	uiFlags
} from "../app/state.js";
import { setStatus, formatSize } from "../app/dom.js";

/** @type { (id: string|null, opts?: object) => void } */
let _selectEntry = () => {};

/**
 * @param { selectEntry: (id: string|null, opts?: object) => void } handlers
 */
export function bindCatalogHandlers(handlers) {
	_selectEntry = handlers.selectEntry;
}

export async function moveEntryToCategory(entryId, categoryId) {
	const cid = categoryId === "" || categoryId === "null" ? null : categoryId;
	await catalog.setEntryCategory(entryId, cid);
	renderList();
}

export async function onAddCategory() {
	const name = prompt("New category name:", "New category");
	if (name == null) return;
	const trimmed = name.trim();
	if (!trimmed) return;
	try {
		const cat = await catalog.addCategory(trimmed);
		setStatus(`Category “${cat.name}” created.`, "ok");
		renderList();
	} catch (e) {
		setStatus(`Could not create category: ${e?.message ?? e}`, "error");
	}
}

/**
 * @param {string} categoryId
 */
export async function onRenameCategory(categoryId) {
	const cat = catalog.getCategory(categoryId);
	if (!cat) return;
	const name = prompt("Rename category:", cat.name);
	if (name == null) return;
	const trimmed = name.trim();
	if (!trimmed || trimmed === cat.name) return;
	await catalog.renameCategory(categoryId, trimmed);
	renderList();
}

/**
 * @param {string} categoryId
 */
export async function onDeleteCategory(categoryId) {
	const cat = catalog.getCategory(categoryId);
	if (!cat) return;
	if (!confirm(`Delete category “${cat.name}”? Structures move to Uncategorized.`)) return;
	try {
		await catalog.removeCategory(categoryId);
		renderList();
		setStatus(`Category “${cat.name}” removed.`, "ok");
	} catch (e) {
		setStatus(`Delete category failed: ${e?.message ?? e}`, "error");
	}
}

/**
 * Build one structure row for the catalog list.
 * @param {any} entry
 * @returns {HTMLLIElement}
 */
export function createStructureRow(entry) {
	const li = document.createElement("li");
	li.className = "sdb-list-row" + (entry.id === getSelectedId() ? " selected" : "");
	li.tabIndex = 0;
	li.setAttribute("role", "option");
	li.setAttribute("aria-selected", entry.id === getSelectedId() ? "true" : "false");
	li.dataset.id = entry.id;

	const main = document.createElement("div");
	main.className = "sdb-list-row-main";

	const title = document.createElement("div");
	title.className = "sdb-list-title";
	title.textContent = entry.name;

	const meta = document.createElement("div");
	meta.className = "sdb-list-meta-line";
	const err = entry.parseError;
	const ent = entry.entityCount ? ` · ${entry.entityCount} ent` : "";
	meta.textContent = err
		? `Parse error · ${entry.sourceKind}`
		: `${formatSize(entry.size)} · ${Number(entry.blockCount || 0).toLocaleString()} blocks${ent}`;

	main.append(title, meta);

	const move = document.createElement("select");
	move.className = "sdb-list-move";
	move.title = "Move to category";
	move.setAttribute("aria-label", `Move ${entry.name} to category`);
	const optUncat = document.createElement("option");
	optUncat.value = "";
	optUncat.textContent = "Uncategorized";
	move.appendChild(optUncat);
	for (const c of catalog.listCategories()) {
		const opt = document.createElement("option");
		opt.value = c.id;
		opt.textContent = c.name;
		move.appendChild(opt);
	}
	move.value = entry.categoryId && catalog.getCategory(entry.categoryId) ? entry.categoryId : "";
	move.addEventListener("click", e => e.stopPropagation());
	move.addEventListener("mousedown", e => e.stopPropagation());
	move.addEventListener("change", e => {
		e.stopPropagation();
		void moveEntryToCategory(entry.id, move.value || null);
	});

	li.append(main, move);
	li.addEventListener("click", e => {
		if (e.target instanceof Element && e.target.closest("select")) return;
		_selectEntry(entry.id);
	});
	li.addEventListener("keydown", e => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			_selectEntry(entry.id);
		}
		if (e.key === "Delete" || e.key === "Backspace") {
			e.preventDefault();
			removeSelected();
		}
	});
	return li;
}

/**
 * @param {{ categoryId: string|null, name: string, collapsed: boolean, entries: any[], isUncategorized: boolean }} group
 * @param {number} catIndex among user categories (for reorder edges)
 * @param {number} userCatCount
 */
export function createCategoryGroup(group, catIndex, userCatCount) {
	const wrap = document.createElement("li");
	wrap.className = "sdb-cat-group" + (group.collapsed ? " is-collapsed" : "");
	wrap.dataset.categoryId = group.categoryId ?? "uncategorized";

	const header = document.createElement("div");
	header.className = "sdb-cat-header";
	header.setAttribute("role", "button");
	header.tabIndex = 0;
	header.setAttribute("aria-expanded", group.collapsed ? "false" : "true");

	const toggle = document.createElement("span");
	toggle.className = "sdb-cat-toggle";
	toggle.textContent = group.collapsed ? "▸" : "▾";
	toggle.setAttribute("aria-hidden", "true");

	const label = document.createElement("span");
	label.className = "sdb-cat-name";
	label.textContent = group.name;

	const count = document.createElement("span");
	count.className = "sdb-cat-count";
	count.textContent = String(group.entries.length);

	const actions = document.createElement("div");
	actions.className = "sdb-cat-actions";

	const stop = e => e.stopPropagation();

	if (!group.isUncategorized) {
		const up = document.createElement("button");
		up.type = "button";
		up.className = "sdb-cat-btn";
		up.title = "Move category up";
		up.textContent = "↑";
		up.disabled = catIndex <= 0;
		up.addEventListener("click", e => {
			stop(e);
			void catalog.reorderCategory(group.categoryId, -1).then(() => renderList());
		});

		const down = document.createElement("button");
		down.type = "button";
		down.className = "sdb-cat-btn";
		down.title = "Move category down";
		down.textContent = "↓";
		down.disabled = catIndex >= userCatCount - 1;
		down.addEventListener("click", e => {
			stop(e);
			void catalog.reorderCategory(group.categoryId, 1).then(() => renderList());
		});

		const rename = document.createElement("button");
		rename.type = "button";
		rename.className = "sdb-cat-btn";
		rename.title = "Rename category";
		rename.textContent = "✎";
		rename.addEventListener("click", e => {
			stop(e);
			void onRenameCategory(group.categoryId);
		});

		const del = document.createElement("button");
		del.type = "button";
		del.className = "sdb-cat-btn sdb-cat-btn-danger";
		del.title = "Delete category";
		del.textContent = "×";
		del.addEventListener("click", e => {
			stop(e);
			void onDeleteCategory(group.categoryId);
		});

		actions.append(up, down, rename, del);
	}

	header.append(toggle, label, count, actions);

	const toggleCollapse = () => {
		if (group.isUncategorized) {
			uiFlags.uncategorizedCollapsed = !uiFlags.uncategorizedCollapsed;
			renderList();
			return;
		}
		void catalog
			.setCategoryCollapsed(group.categoryId, !group.collapsed)
			.then(() => renderList());
	};
	header.addEventListener("click", e => {
		if (e.target instanceof Element && e.target.closest(".sdb-cat-actions")) return;
		toggleCollapse();
	});
	header.addEventListener("keydown", e => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			toggleCollapse();
		}
	});

	wrap.appendChild(header);

	if (!group.collapsed) {
		const body = document.createElement("ul");
		body.className = "sdb-cat-body";
		if (!group.entries.length) {
			const empty = document.createElement("li");
			empty.className = "sdb-list-empty sdb-cat-empty";
			empty.textContent = group.isUncategorized
				? "No uncategorized structures"
				: "Empty — move structures here";
			body.appendChild(empty);
		} else {
			for (const entry of group.entries) {
				body.appendChild(createStructureRow(entry));
			}
		}
		wrap.appendChild(body);
	}

	return wrap;
}

export function renderList() {
	if (!els.catalogList || !els.catalogCount) return;

	const query = els.searchInput?.value ?? "";
	const groups = catalog.listGrouped({ query });
	// Apply session collapse for Uncategorized
	for (const g of groups) {
		if (g.isUncategorized) g.collapsed = uiFlags.uncategorizedCollapsed;
	}

	const total = catalog.list().length;
	const matchCount = groups.reduce((n, g) => n + g.entries.length, 0);
	const q = query.trim();
	els.catalogCount.textContent = q
		? `${matchCount} match${matchCount === 1 ? "" : "es"} · ${total} total`
		: total === 1
			? "1 structure"
			: `${total} structures`;

	els.catalogList.replaceChildren();

	if (total === 0) {
		const empty = document.createElement("li");
		empty.className = "sdb-list-empty";
		empty.textContent = "No structures yet — import files above";
		els.catalogList.appendChild(empty);
		// Still show category headers so users can create/organize
	}

	if (q && matchCount === 0 && total > 0) {
		const empty = document.createElement("li");
		empty.className = "sdb-list-empty";
		empty.textContent = "No matches";
		els.catalogList.appendChild(empty);
		return;
	}

	const userCats = groups.filter(g => !g.isUncategorized);
	let userIdx = 0;
	for (const group of groups) {
		// When filtering, skip empty groups (except keep Uncategorized if nothing else)
		if (q && !group.entries.length) continue;
		const idx = group.isUncategorized ? -1 : userIdx++;
		els.catalogList.appendChild(
			createCategoryGroup(group, idx, userCats.length)
		);
	}
}

