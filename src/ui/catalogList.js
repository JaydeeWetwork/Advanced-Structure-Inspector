/**
 * Catalog list: category → entry → structure tree (browse + drag onto categories).
 */

import {
	catalog,
	els,
	getSelectedId,
	uiFlags
} from "../app/state.js";
import { formatSize, setStatus } from "../app/dom.js";

const STRUCT_DRAG = "application/x-basi-structure";
const SCROLL_EDGE = 36;
const SCROLL_STEP = 18;

let _structDrag = false;
let _wheelBound = false;

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
	li.draggable = true;
	li.title = "Drag onto a category";
	li.addEventListener("dragstart", e => {
		e.stopPropagation();
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData(STRUCT_DRAG, entry.id);
		e.dataTransfer.setData("text/plain", `struct:${entry.id}`);
		li.classList.add("is-dragging");
		_structDrag = true;
	});
	li.addEventListener("dragend", () => {
		_structDrag = false;
		li.classList.remove("is-dragging");
		clearDropMarks();
	});
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
	bindCatalogStructureDnD(els.catalogList);
}

function clearDropMarks() {
	els.catalogList?.querySelectorAll(".is-drop-target").forEach(el => {
		el.classList.remove("is-drop-target");
	});
}

function dropHostFromPoint(clientX, clientY) {
	const el = document.elementFromPoint(clientX, clientY);
	const host = el?.closest?.(".basi-entry-group, .basi-cat-group");
	return host instanceof HTMLElement ? host : null;
}

function dropHostFromEvent(e) {
	return dropHostFromPoint(e.clientX, e.clientY)
		|| (e.target instanceof Element ? e.target.closest(".basi-entry-group, .basi-cat-group") : null);
}

function markDropHost(host) {
	clearDropMarks();
	host?.classList.add("is-drop-target");
}

function scrollCatalogBy(delta) {
	const list = els.catalogList;
	if (!list || !delta) return;
	list.scrollTop += delta;
}

function pointerOverCatalog(clientX, clientY) {
	const list = els.catalogList;
	if (!list) return false;
	const r = list.getBoundingClientRect();
	return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

function onCatalogDragWheel(e) {
	if (!_structDrag) return;
	if (!pointerOverCatalog(e.clientX, e.clientY)) return;
	const list = els.catalogList;
	if (!list) return;
	e.preventDefault();
	let dy = e.deltaY;
	if (e.deltaMode === 1) dy *= 16;
	else if (e.deltaMode === 2) dy *= list.clientHeight;
	scrollCatalogBy(dy);
	markDropHost(dropHostFromPoint(e.clientX, e.clientY));
}

function autoScrollCatalog(clientY) {
	const list = els.catalogList;
	if (!list) return;
	const r = list.getBoundingClientRect();
	if (clientY < r.top + SCROLL_EDGE) scrollCatalogBy(-SCROLL_STEP);
	else if (clientY > r.bottom - SCROLL_EDGE) scrollCatalogBy(SCROLL_STEP);
}

function structureIdFromDrag(e) {
	const dt = e.dataTransfer;
	if (!dt) return "";
	const typed = dt.getData(STRUCT_DRAG);
	if (typed) return typed;
	const plain = dt.getData("text/plain") || "";
	return plain.startsWith("struct:") ? plain.slice(7) : "";
}

async function assignDroppedStructure(structureId, host) {
	if (!structureId || !host) return;
	const entryId = host.dataset.entryId;
	const categoryId = host.dataset.categoryId;
	try {
		if (entryId) {
			await catalog.setStructureEntry(structureId, entryId);
		} else if (categoryId === "uncategorized") {
			await catalog.assignStructureToCategory(structureId, null);
		} else if (categoryId) {
			await catalog.assignStructureToCategory(structureId, categoryId);
		} else {
			return;
		}
		setStatus("Moved to category.", "ok");
	} catch {
		setStatus("That category has no entry. Add one in Editor.", "warn");
	}
}

function isStructureDragEvent(e) {
	if (_structDrag) return true;
	const types = [...(e.dataTransfer?.types || [])].map(t => String(t).toLowerCase());
	return types.includes(STRUCT_DRAG);
}

function bindCatalogStructureDnD(host) {
	if (!host || host.dataset.structDndBound) return;
	host.dataset.structDndBound = "1";
	if (!_wheelBound) {
		_wheelBound = true;
		document.addEventListener("wheel", onCatalogDragWheel, { capture: true, passive: false });
	}
	host.addEventListener("dragover", e => {
		if (!isStructureDragEvent(e)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
		autoScrollCatalog(e.clientY);
		markDropHost(dropHostFromEvent(e));
	});
	host.addEventListener("drop", e => {
		const dropHost = dropHostFromEvent(e);
		clearDropMarks();
		_structDrag = false;
		const id = structureIdFromDrag(e);
		if (!id || !dropHost) return;
		e.preventDefault();
		void assignDroppedStructure(id, dropHost);
	});
	host.addEventListener("dragleave", e => {
		if (!host.contains(e.relatedTarget)) clearDropMarks();
	});
}
