/**
 * Catalog list: category → entry → structure tree (browse only).
 */

import {
	catalog,
	els,
	getSelectedId,
	uiFlags
} from "../app/state.js";
import { formatSize } from "../app/dom.js";

/** @type { (id: string|null, opts?: object) => void } */
let _selectEntry = () => {};

/**
 * @param { selectEntry: (id: string|null, opts?: object) => void } handlers
 */
export function bindCatalogHandlers(handlers) {
	_selectEntry = handlers.selectEntry;
}

/**
 * @param {any} entry
 * @param {string|null} color
 * @returns {HTMLLIElement}
 */
export function createStructureRow(entry, color = null) {
	const li = document.createElement("li");
	li.className = "basi-list-row" + (entry.id === getSelectedId() ? " selected" : "");
	li.tabIndex = 0;
	li.setAttribute("role", "option");
	li.setAttribute("aria-selected", entry.id === getSelectedId() ? "true" : "false");
	li.dataset.id = entry.id;
	if (color) li.style.setProperty("--cat-color", color);

	const main = document.createElement("div");
	main.className = "basi-list-row-main";

	const title = document.createElement("div");
	title.className = "basi-list-title";
	title.textContent = entry.name;

	const meta = document.createElement("div");
	meta.className = "basi-list-meta-line";
	const err = entry.parseError;
	const ent = entry.entityCount ? ` · ${entry.entityCount} ent` : "";
	meta.textContent = err
		? `Parse error · ${entry.sourceKind}`
		: `${formatSize(entry.size)} · ${Number(entry.blockCount || 0).toLocaleString()} blocks${ent}`;

	main.append(title, meta);
	li.append(main);
	li.addEventListener("click", () => _selectEntry(entry.id));
	li.addEventListener("keydown", e => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			_selectEntry(entry.id);
		}
		if (e.key === "Delete" || e.key === "Backspace") {
			e.preventDefault();
			_selectEntry(entry.id);
			import("../app/previewLifecycle.js").then(m => m.removeSelected());
		}
	});
	return li;
}

/**
 * @param {string} name
 * @param {number} count
 * @param {boolean} collapsed
 * @param {string|null} color
 * @param {() => void} onToggle
 */
function treeHeader(name, count, collapsed, color, onToggle) {
	const header = document.createElement("div");
	header.className = "basi-cat-header";
	header.setAttribute("role", "button");
	header.tabIndex = 0;
	header.setAttribute("aria-expanded", collapsed ? "false" : "true");
	if (color) header.style.setProperty("--cat-color", color);

	const toggle = document.createElement("span");
	toggle.className = "basi-cat-toggle";
	toggle.textContent = collapsed ? "▸" : "▾";
	toggle.setAttribute("aria-hidden", "true");

	const label = document.createElement("span");
	label.className = "basi-cat-name";
	label.textContent = name;

	const countEl = document.createElement("span");
	countEl.className = "basi-cat-count";
	countEl.textContent = String(count);

	header.append(toggle, label, countEl);
	header.addEventListener("click", onToggle);
	header.addEventListener("keydown", e => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onToggle();
		}
	});
	return header;
}

/**
 * @param {{ category: any, structureCount: number, entries: { entry: any, structures: any[] }[] }} group
 * @param {string} query
 */
function createCategoryGroup(group, query) {
	const { category, entries } = group;
	const color = category.color || "#64748b";
	const collapsed = !!category.collapsed && !query;
	const wrap = document.createElement("li");
	wrap.className = "basi-cat-group" + (collapsed ? " is-collapsed" : "");
	wrap.dataset.categoryId = category.id;
	wrap.style.setProperty("--cat-color", color);

	wrap.appendChild(
		treeHeader(category.name, group.structureCount, collapsed, color, () => {
			void catalog.setCategoryCollapsed(category.id, !category.collapsed).then(() => renderList());
		})
	);

	if (!collapsed) {
		const body = document.createElement("ul");
		body.className = "basi-cat-body";
		if (!entries.length) {
			const empty = document.createElement("li");
			empty.className = "basi-list-empty basi-cat-empty";
			empty.textContent = "No entries";
			body.appendChild(empty);
		} else {
			for (const { entry, structures } of entries) {
				body.appendChild(createEntryGroup(entry, structures, color, query));
			}
		}
		wrap.appendChild(body);
	}
	return wrap;
}

/**
 * @param {any} entry
 * @param {any[]} structures
 * @param {string} color
 * @param {string} query
 */
function createEntryGroup(entry, structures, color, query) {
	const collapsed = !!entry.collapsed && !query;
	const wrap = document.createElement("li");
	wrap.className = "basi-entry-group" + (collapsed ? " is-collapsed" : "");
	wrap.dataset.entryId = entry.id;
	wrap.style.setProperty("--cat-color", color);

	wrap.appendChild(
		treeHeader(entry.name, structures.length, collapsed, color, () => {
			void catalog.setCatalogEntryCollapsed(entry.id, !entry.collapsed).then(() => renderList());
		})
	);

	if (!collapsed) {
		const body = document.createElement("ul");
		body.className = "basi-entry-body";
		if (!structures.length) {
			const empty = document.createElement("li");
			empty.className = "basi-list-empty basi-cat-empty";
			empty.textContent = "No structures";
			body.appendChild(empty);
		} else {
			for (const s of structures) {
				body.appendChild(createStructureRow(s, color));
			}
		}
		wrap.appendChild(body);
	}
	return wrap;
}

function createUncategorizedGroup(structures, query) {
	const collapsed = uiFlags.uncategorizedCollapsed && !query;
	const wrap = document.createElement("li");
	wrap.className = "basi-cat-group basi-cat-uncategorized" + (collapsed ? " is-collapsed" : "");
	wrap.dataset.categoryId = "uncategorized";

	wrap.appendChild(
		treeHeader("Uncategorized", structures.length, collapsed, null, () => {
			uiFlags.uncategorizedCollapsed = !uiFlags.uncategorizedCollapsed;
			renderList();
		})
	);

	if (!collapsed) {
		const body = document.createElement("ul");
		body.className = "basi-cat-body";
		if (!structures.length) {
			const empty = document.createElement("li");
			empty.className = "basi-list-empty basi-cat-empty";
			empty.textContent = "Imported files land here until assigned in Editor";
			body.appendChild(empty);
		} else {
			for (const s of structures) {
				body.appendChild(createStructureRow(s));
			}
		}
		wrap.appendChild(body);
	}
	return wrap;
}

export function renderList() {
	if (!els.catalogList || !els.catalogCount) return;

	const query = els.searchInput?.value ?? "";
	const tree = catalog.listTree({ query });
	const total = catalog.list().length;
	const matchCount = tree.uncategorized.structures.length
		+ tree.categories.reduce((n, g) => n + g.structureCount, 0);
	const q = query.trim();
	els.catalogCount.textContent = q
		? `${matchCount} match${matchCount === 1 ? "" : "es"} · ${total} total`
		: total === 1
			? "1 structure"
			: `${total} structures`;

	els.catalogList.replaceChildren();

	if (q && matchCount === 0 && total > 0) {
		const empty = document.createElement("li");
		empty.className = "basi-list-empty";
		empty.textContent = "No matches";
		els.catalogList.appendChild(empty);
		return;
	}

	if (total === 0) {
		const empty = document.createElement("li");
		empty.className = "basi-list-empty";
		empty.textContent = "No structures yet — import files above";
		els.catalogList.appendChild(empty);
	}

	els.catalogList.appendChild(createUncategorizedGroup(tree.uncategorized.structures, q));
	for (const group of tree.categories) {
		if (q && !group.structureCount && !group.entries.length) continue;
		els.catalogList.appendChild(createCategoryGroup(group, q));
	}
}
