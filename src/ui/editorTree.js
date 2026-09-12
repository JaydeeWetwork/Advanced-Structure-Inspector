/**
 * Editor left pane: taxonomy tree.
 */

import { catalog, editorUi, els } from "../app/state.js";
import { formatSize, setStatus } from "../app/dom.js";
import { renderEditor } from "./editorRender.js";
import { selectEditorNode } from "./editorSelect.js";

function isSelected(kind, id) {
	return editorUi.selected?.kind === kind && editorUi.selected?.id === id;
}

function stop(e) {
	e.stopPropagation();
}

function select(kind, id) {
	selectEditorNode(kind, id);
}

const CAT_DRAG = "application/x-basi-category";

function clearDropMarks(host) {
	host?.querySelectorAll(".basi-ed-node.drop-before, .basi-ed-node.drop-after").forEach(el => {
		el.classList.remove("drop-before", "drop-after");
	});
}

function categoryRowFromPoint(clientX, clientY) {
	const el = document.elementFromPoint(clientX, clientY);
	const row = el?.closest?.(".basi-ed-node");
	if (!row) return null;
	if (row.dataset.kind === "category") return row;
	const cid = row.dataset.categoryId;
	if (!cid) return null;
	return els.editorTree?.querySelector(`.basi-ed-node[data-kind="category"][data-id="${CSS.escape(cid)}"]`) ?? null;
}

function bindTreeScrollAndDnD(host) {
	if (host.dataset.dndBound) return;
	host.dataset.dndBound = "1";
	host.addEventListener("scroll", () => {
		editorUi.treeScroll = host.scrollTop;
	}, { passive: true });
	host.addEventListener("dragover", e => {
		const types = [...(e.dataTransfer?.types || [])].map(t => t.toLowerCase());
		if (!types.includes(CAT_DRAG) && !types.includes("text/plain")) return;
		if (!editorUi.dragCategoryId) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		const r = host.getBoundingClientRect();
		const edge = 32;
		if (e.clientY < r.top + edge) host.scrollTop -= 14;
		else if (e.clientY > r.bottom - edge) host.scrollTop += 14;
		clearDropMarks(host);
		const row = categoryRowFromPoint(e.clientX, e.clientY);
		if (!row || row.dataset.id === editorUi.dragCategoryId) return;
		const box = row.getBoundingClientRect();
		row.classList.add(e.clientY < box.top + box.height / 2 ? "drop-before" : "drop-after");
	});
	host.addEventListener("drop", e => {
		const raw = e.dataTransfer?.getData(CAT_DRAG) || e.dataTransfer?.getData("text/plain") || "";
		const fromId = raw.startsWith("cat:") ? raw.slice(4) : "";
		clearDropMarks(host);
		if (!fromId) return;
		e.preventDefault();
		const row = categoryRowFromPoint(e.clientX, e.clientY);
		if (!row || row.dataset.id === fromId) return;
		const box = row.getBoundingClientRect();
		const place = e.clientY < box.top + box.height / 2 ? "before" : "after";
		void catalog.moveCategoryTo(fromId, row.dataset.id, place).then(() => {
			editorUi.dragCategoryId = null;
			setStatus("Category moved.", "ok");
		});
	});
	host.addEventListener("dragleave", e => {
		if (!host.contains(e.relatedTarget)) clearDropMarks(host);
	});
}

function nodeRow({ kind, id, name, meta, color, collapsed, depth, onToggle, onClick, categoryId, draggable }) {
	const row = document.createElement("div");
	row.className = "basi-ed-node" + (isSelected(kind, id) ? " is-selected" : "");
	row.dataset.kind = kind;
	row.dataset.id = id;
	if (categoryId) row.dataset.categoryId = categoryId;
	row.style.setProperty("--depth", String(depth));
	if (color) row.style.setProperty("--cat-color", color);
	row.tabIndex = 0;
	row.setAttribute("role", "treeitem");
	row.setAttribute("aria-selected", isSelected(kind, id) ? "true" : "false");
	if (draggable) {
		row.draggable = true;
		row.classList.add("is-draggable");
		row.title = "Drag to reorder";
		row.addEventListener("dragstart", e => {
			editorUi.dragCategoryId = id;
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData(CAT_DRAG, `cat:${id}`);
			e.dataTransfer.setData("text/plain", `cat:${id}`);
			row.classList.add("is-dragging");
		});
		row.addEventListener("dragend", () => {
			editorUi.dragCategoryId = null;
			row.classList.remove("is-dragging");
			clearDropMarks(els.editorTree);
		});
	}

	if (onToggle) {
		const tog = document.createElement("button");
		tog.type = "button";
		tog.className = "basi-ed-toggle";
		tog.textContent = collapsed ? "▸" : "▾";
		tog.addEventListener("click", e => {
			stop(e);
			onToggle();
		});
		row.appendChild(tog);
	} else {
		const pad = document.createElement("span");
		pad.className = "basi-ed-toggle-spacer";
		row.appendChild(pad);
	}

	const label = document.createElement("span");
	label.className = "basi-ed-node-name";
	label.textContent = name;
	row.appendChild(label);

	if (meta) {
		const m = document.createElement("span");
		m.className = "basi-ed-node-meta";
		m.textContent = meta;
		row.appendChild(m);
	}

	row.addEventListener("click", onClick);
	row.addEventListener("keydown", e => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onClick();
		}
		if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && onToggle) {
			e.preventDefault();
			onToggle();
		}
	});
	return row;
}

export function renderEditorTree() {
	const host = els.editorTree;
	if (!host) return;
	bindTreeScrollAndDnD(host);
	const keepScroll = Number.isFinite(editorUi.treeScroll) ? editorUi.treeScroll : host.scrollTop;
	host.replaceChildren();

	const tree = catalog.listTree();

	host.appendChild(
		nodeRow({
			kind: "uncategorized",
			id: "uncategorized",
			name: "Uncategorized",
			meta: String(tree.uncategorized.structures.length),
			collapsed: editorUi.uncategorizedCollapsed,
			depth: 0,
			onToggle: () => {
				editorUi.uncategorizedCollapsed = !editorUi.uncategorizedCollapsed;
				renderEditor();
			},
			onClick: () => select("uncategorized", "uncategorized")
		})
	);
	if (!editorUi.uncategorizedCollapsed) {
		if (!tree.uncategorized.structures.length) {
			const empty = document.createElement("div");
			empty.className = "basi-ed-empty";
			empty.style.setProperty("--depth", "1");
			empty.textContent = "Imported files wait here";
			host.appendChild(empty);
		}
		for (const s of tree.uncategorized.structures) {
			host.appendChild(
				nodeRow({
					kind: "structure",
					id: s.id,
					name: s.name,
					meta: formatSize(s.size),
					depth: 1,
					onClick: () => select("structure", s.id)
				})
			);
		}
	}

	for (const group of tree.categories) {
		const color = group.category.color;
		host.appendChild(
			nodeRow({
				kind: "category",
				id: group.category.id,
				name: group.category.name,
				meta: String(group.structureCount),
				color,
				collapsed: group.category.collapsed,
				depth: 0,
				draggable: true,
				onToggle: () => {
					void catalog.setCategoryCollapsed(group.category.id, !group.category.collapsed);
				},
				onClick: () => select("category", group.category.id)
			})
		);
		if (group.category.collapsed) continue;
		for (const { entry, structures } of group.entries) {
			host.appendChild(
				nodeRow({
					kind: "entry",
					id: entry.id,
					name: entry.name,
					meta: String(structures.length),
					color,
					collapsed: entry.collapsed,
					depth: 1,
					categoryId: group.category.id,
					onToggle: () => {
						void catalog.setCatalogEntryCollapsed(entry.id, !entry.collapsed);
					},
					onClick: () => select("entry", entry.id)
				})
			);
			if (entry.collapsed) continue;
			if (!structures.length) {
				const empty = document.createElement("div");
				empty.className = "basi-ed-empty";
				empty.style.setProperty("--depth", "2");
				empty.textContent = "No structures";
				host.appendChild(empty);
			}
			for (const s of structures) {
				host.appendChild(
					nodeRow({
						kind: "structure",
						id: s.id,
						name: s.name,
						meta: formatSize(s.size),
						color,
						depth: 2,
						categoryId: group.category.id,
						onClick: () => select("structure", s.id)
					})
				);
			}
		}
	}

	host.scrollTop = keepScroll;
	requestAnimationFrame(() => {
		if (els.editorTree) els.editorTree.scrollTop = keepScroll;
	});
}

export function renderEditorToolbar() {
	const host = els.editorTreeToolbar;
	if (!host) return;
	host.replaceChildren();

	const addCat = document.createElement("button");
	addCat.type = "button";
	addCat.className = "basi-btn secondary";
	addCat.textContent = "+ Category";
	addCat.addEventListener("click", async () => {
		const created = await catalog.addCategory("New category");
		select("category", created.id);
		setStatus(`Category “${created.name}” created.`, "ok");
	});

	const addEntry = document.createElement("button");
	addEntry.type = "button";
	addEntry.className = "basi-btn secondary";
	addEntry.textContent = "+ Entry";
	const sel = editorUi.selected;
	let categoryId = null;
	if (sel?.kind === "category") categoryId = sel.id;
	if (sel?.kind === "entry") categoryId = catalog.getCatalogEntry(sel.id)?.categoryId ?? null;
	addEntry.disabled = !categoryId;
	addEntry.title = categoryId ? "Add an entry in the selected category" : "Select a category first";
	addEntry.addEventListener("click", async () => {
		if (!categoryId) return;
		const created = await catalog.addCatalogEntry({ categoryId, name: "New entry" });
		select("entry", created.id);
		setStatus(`Entry “${created.name}” created.`, "ok");
	});

	const features = document.createElement("button");
	features.type = "button";
	features.className = "basi-btn" + (editorUi.featuresOpen ? "" : " secondary");
	features.classList.add("basi-ed-toolbar-features");
	features.textContent = editorUi.featuresOpen ? "Hide features" : "Features";
	features.addEventListener("click", () => {
		editorUi.featuresOpen = !editorUi.featuresOpen;
		renderEditor();
	});

	host.append(addCat, addEntry, features);
}
