/**
 * Editor left pane: taxonomy tree + inspector.
 */

import { catalog, editorUi, els } from "../app/state.js";
import { formatSize, setStatus } from "../app/dom.js";
import { renderFeatureChips } from "./featureChips.js";
import { renderEditor } from "./editorRender.js";

function hex6(color) {
	const h = String(color || "#64748b").replace("#", "");
	if (h.length === 3) return `#${h.split("").map(c => c + c).join("")}`;
	return `#${h}`.slice(0, 7);
}

function isSelected(kind, id) {
	return editorUi.selected?.kind === kind && editorUi.selected?.id === id;
}

function select(kind, id) {
	editorUi.selected = { kind, id };
	editorUi.expandedFeatureId = null;
	renderEditor();
}

function stop(e) {
	e.stopPropagation();
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
		const types = [...(e.dataTransfer?.types || [])];
		if (!types.includes(CAT_DRAG) && !types.includes("text/plain")) return;
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
		const fromId = raw.startsWith("cat:") ? raw.slice(4) : raw;
		clearDropMarks(host);
		if (!fromId) return;
		e.preventDefault();
		const row = categoryRowFromPoint(e.clientX, e.clientY);
		if (!row || row.dataset.id === fromId) return;
		const box = row.getBoundingClientRect();
		const place = e.clientY < box.top + box.height / 2 ? "before" : "after";
		void catalog.moveCategoryTo(fromId, row.dataset.id, place).then(() => {
			editorUi.dragCategoryId = null;
			renderEditor();
			setStatus("Category moved.", "ok");
		});
	});
	host.addEventListener("dragleave", e => {
		if (!host.contains(e.relatedTarget)) clearDropMarks(host);
	});
}

/**
 * @param {string} label
 * @param {string} value
 * @param {string} field
 * @param {(v: string) => void} onCommit
 */
function textField(label, value, field, onCommit) {
	const wrap = document.createElement("label");
	wrap.className = "basi-ed-field";
	const span = document.createElement("span");
	span.className = "basi-ed-label";
	span.textContent = label;
	const input = document.createElement(field === "textarea" ? "textarea" : "input");
	if (field !== "textarea") {
		input.type = "text";
	} else {
		input.rows = 3;
	}
	input.className = "basi-ed-input";
	input.value = value || "";
	input.addEventListener("blur", () => onCommit(input.value));
	input.addEventListener("keydown", e => {
		if (e.key === "Enter" && field !== "textarea") {
			e.preventDefault();
			input.blur();
		}
	});
	wrap.append(span, input);
	return wrap;
}

function colorField(label, value, onCommit) {
	const wrap = document.createElement("label");
	wrap.className = "basi-ed-field basi-ed-color-field";
	const span = document.createElement("span");
	span.className = "basi-ed-label";
	span.textContent = label;
	const input = document.createElement("input");
	input.type = "color";
	input.className = "basi-ed-color";
	input.value = hex6(value);
	input.addEventListener("change", () => onCommit(input.value));
	wrap.append(span, input);
	return wrap;
}

function dangerBtn(label, title, onClick) {
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = "basi-btn secondary basi-ed-danger";
	btn.textContent = label;
	btn.title = title;
	btn.addEventListener("click", onClick);
	return btn;
}

function iconBtn(label, title, onClick, disabled = false) {
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = "basi-ed-icon-btn";
	btn.textContent = label;
	btn.title = title;
	btn.disabled = disabled;
	btn.addEventListener("click", e => {
		stop(e);
		onClick();
	});
	return btn;
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
					void catalog
						.setCategoryCollapsed(group.category.id, !group.category.collapsed)
						.then(() => renderEditor());
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
						void catalog
							.setCatalogEntryCollapsed(entry.id, !entry.collapsed)
							.then(() => renderEditor());
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

export function renderEditorInspector() {
	const host = els.editorInspector;
	if (!host) return;
	host.replaceChildren();
	const sel = editorUi.selected;
	if (!sel || sel.kind === "uncategorized") {
		const hint = document.createElement("p");
		hint.className = "basi-ed-hint";
		hint.textContent = sel?.kind === "uncategorized"
			? "Uncategorized structures have not been assigned to an entry yet. Select one, then pick an entry."
			: "Select a category, entry, or structure to edit it.";
		host.appendChild(hint);
		return;
	}

	if (sel.kind === "category") {
		const cat = catalog.getCategory(sel.id);
		if (!cat) return;
		const h = document.createElement("h3");
		h.className = "basi-ed-inspect-title";
		h.textContent = "Category";
		host.appendChild(h);
		host.appendChild(textField("Name", cat.name, "text", v => {
			void catalog.patchCategory(cat.id, { name: v }).then(() => renderEditor());
		}));
		host.appendChild(textField("Description", cat.description, "textarea", v => {
			void catalog.patchCategory(cat.id, { description: v });
		}));
		host.appendChild(colorField("Color", cat.color, v => {
			void catalog.patchCategory(cat.id, { color: v }).then(() => renderEditor());
		}));
		const actions = document.createElement("div");
		actions.className = "basi-ed-actions";
		actions.append(
			iconBtn("↑", "Move up", () => {
				void catalog.reorderCategory(cat.id, -1).then(() => renderEditor());
			}),
			iconBtn("↓", "Move down", () => {
				void catalog.reorderCategory(cat.id, 1).then(() => renderEditor());
			}),
			dangerBtn("Delete category", "Entries are deleted; structures become Uncategorized", async () => {
				if (!confirm(`Delete category “${cat.name}”? Entries inside it are removed and their structures move to Uncategorized.`)) return;
				await catalog.removeCategory(cat.id);
				editorUi.selected = null;
				renderEditor();
				setStatus(`Category “${cat.name}” removed.`, "ok");
			})
		);
		host.appendChild(actions);
		return;
	}

	if (sel.kind === "entry") {
		const ent = catalog.getCatalogEntry(sel.id);
		if (!ent) return;
		const h = document.createElement("h3");
		h.className = "basi-ed-inspect-title";
		h.textContent = "Entry";
		host.appendChild(h);
		host.appendChild(textField("Name", ent.name, "text", v => {
			void catalog.patchCatalogEntry(ent.id, { name: v }).then(() => renderEditor());
		}));
		host.appendChild(textField("Description", ent.description, "textarea", v => {
			void catalog.patchCatalogEntry(ent.id, { description: v });
		}));
		const parent = document.createElement("label");
		parent.className = "basi-ed-field";
		const pLabel = document.createElement("span");
		pLabel.className = "basi-ed-label";
		pLabel.textContent = "Category";
		const pSel = document.createElement("select");
		pSel.className = "basi-ed-input";
		for (const c of catalog.listCategories()) {
			const opt = document.createElement("option");
			opt.value = c.id;
			opt.textContent = c.name;
			pSel.appendChild(opt);
		}
		pSel.value = ent.categoryId;
		pSel.addEventListener("change", () => {
			void catalog.patchCatalogEntry(ent.id, { categoryId: pSel.value }).then(() => renderEditor());
		});
		parent.append(pLabel, pSel);
		host.appendChild(parent);
		const assign = document.createElement("label");
		assign.className = "basi-ed-field";
		const aLabel = document.createElement("span");
		aLabel.className = "basi-ed-label";
		aLabel.textContent = "Assign structure";
		const aSel = document.createElement("select");
		aSel.className = "basi-ed-input";
		const placeholder = document.createElement("option");
		placeholder.value = "";
		placeholder.textContent = "Choose a structure…";
		aSel.appendChild(placeholder);
		for (const s of catalog.list()) {
			const opt = document.createElement("option");
			opt.value = s.id;
			const parentEnt = s.entryId ? catalog.getCatalogEntry(s.entryId) : null;
			opt.textContent = parentEnt ? `${s.name} (${parentEnt.name})` : s.name;
			aSel.appendChild(opt);
		}
		aSel.addEventListener("change", async () => {
			const id = aSel.value;
			if (!id) return;
			await catalog.setStructureEntry(id, ent.id);
			select("structure", id);
			setStatus("Structure assigned.", "ok");
		});
		assign.append(aLabel, aSel);
		host.appendChild(assign);
		const actions = document.createElement("div");
		actions.className = "basi-ed-actions";
		actions.append(
			iconBtn("↑", "Move up", () => {
				void catalog.reorderCatalogEntry(ent.id, -1).then(() => renderEditor());
			}),
			iconBtn("↓", "Move down", () => {
				void catalog.reorderCatalogEntry(ent.id, 1).then(() => renderEditor());
			}),
			dangerBtn("Delete entry", "Structures become Uncategorized", async () => {
				if (!confirm(`Delete entry “${ent.name}”? Structures move to Uncategorized.`)) return;
				await catalog.removeCatalogEntry(ent.id);
				editorUi.selected = null;
				renderEditor();
				setStatus(`Entry “${ent.name}” removed.`, "ok");
			})
		);
		host.appendChild(actions);
		return;
	}

	if (sel.kind === "structure") {
		const s = catalog.get(sel.id);
		if (!s) return;
		const h = document.createElement("h3");
		h.className = "basi-ed-inspect-title";
		h.textContent = "Structure";
		host.appendChild(h);
		host.appendChild(textField("Name", s.name, "text", v => {
			void catalog.patch(s.id, { name: v }).then(() => renderEditor());
		}));
		const parent = document.createElement("label");
		parent.className = "basi-ed-field";
		const pLabel = document.createElement("span");
		pLabel.className = "basi-ed-label";
		pLabel.textContent = "Entry";
		const pSel = document.createElement("select");
		pSel.className = "basi-ed-input";
		const none = document.createElement("option");
		none.value = "";
		none.textContent = "Uncategorized";
		pSel.appendChild(none);
		for (const c of catalog.listCategories()) {
			const group = document.createElement("optgroup");
			group.label = c.name;
			for (const e of catalog.listCatalogEntries(c.id)) {
				const opt = document.createElement("option");
				opt.value = e.id;
				opt.textContent = e.name;
				group.appendChild(opt);
			}
			pSel.appendChild(group);
		}
		pSel.value = s.entryId || "";
		pSel.addEventListener("change", () => {
			void catalog.setStructureEntry(s.id, pSel.value || null).then(() => renderEditor());
		});
		parent.append(pLabel, pSel);
		host.appendChild(parent);
		host.appendChild(textField("Creator", s.creator, "text", v => {
			void catalog.patch(s.id, { creator: v });
		}));
		host.appendChild(textField("Credits", s.credits, "text", v => {
			void catalog.patch(s.id, { credits: v });
		}));
		host.appendChild(textField("Source", s.sourceLink, "text", v => {
			void catalog.patch(s.id, { sourceLink: v });
		}));

		const featLabel = document.createElement("div");
		featLabel.className = "basi-ed-label";
		featLabel.textContent = "Features";
		host.appendChild(featLabel);
		const chips = document.createElement("div");
		chips.className = "basi-feature-chips";
		const assigned = catalog.listFeaturesForStructure(s.id);
		renderFeatureChips(chips, assigned, {
			onClick: feature => {
				void catalog.toggleStructureFeature(s.id, feature.id).then(() => renderEditor());
			}
		});
		if (!assigned.length) {
			chips.classList.add("is-empty");
			chips.textContent = "None yet";
		}
		host.appendChild(chips);
		const manage = document.createElement("button");
		manage.type = "button";
		manage.className = "basi-btn secondary";
		manage.textContent = editorUi.featuresOpen ? "Hide feature library" : "Add / edit features";
		manage.addEventListener("click", () => {
			editorUi.featuresOpen = !editorUi.featuresOpen;
			renderEditor();
		});
		host.appendChild(manage);
	}
}
