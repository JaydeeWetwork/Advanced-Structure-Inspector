/**
 * Editor inspector: edit the selected category, entry, or structure.
 */

import { catalog, editorUi, els } from "../app/state.js";
import { setStatus } from "../app/dom.js";
import { renderFeatureChips } from "./featureChips.js";
import { renderEditor } from "./editorRender.js";
import { selectEditorNode } from "./editorSelect.js";

function hex6(color) {
	const h = String(color || "#64748b").replace("#", "");
	if (h.length === 3) return `#${h.split("").map(c => c + c).join("")}`;
	return `#${h}`.slice(0, 7);
}

function textField(label, value, field, onCommit) {
	const wrap = document.createElement("label");
	wrap.className = "bLayers-ed-field";
	const span = document.createElement("span");
	span.className = "bLayers-ed-label";
	span.textContent = label;
	const input = document.createElement(field === "textarea" ? "textarea" : "input");
	if (field !== "textarea") input.type = "text";
	else input.rows = 3;
	input.className = "bLayers-ed-input";
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
	wrap.className = "bLayers-ed-field bLayers-ed-color-field";
	const span = document.createElement("span");
	span.className = "bLayers-ed-label";
	span.textContent = label;
	const input = document.createElement("input");
	input.type = "color";
	input.className = "bLayers-ed-color";
	input.value = hex6(value);
	input.addEventListener("change", () => onCommit(input.value));
	wrap.append(span, input);
	return wrap;
}

function dangerBtn(label, title, onClick) {
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = "bLayers-btn secondary bLayers-ed-danger";
	btn.textContent = label;
	btn.title = title;
	btn.addEventListener("click", onClick);
	return btn;
}

function iconBtn(label, title, onClick) {
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = "bLayers-ed-icon-btn";
	btn.textContent = label;
	btn.title = title;
	btn.addEventListener("click", onClick);
	return btn;
}

function confirmRow(message, onYes) {
	const wrap = document.createElement("div");
	wrap.className = "bLayers-ed-actions";
	const ask = document.createElement("span");
	ask.className = "bLayers-ed-hint";
	ask.textContent = message;
	const yes = document.createElement("button");
	yes.type = "button";
	yes.className = "bLayers-btn secondary bLayers-ed-danger";
	yes.textContent = "Delete";
	yes.addEventListener("click", onYes);
	const no = document.createElement("button");
	no.type = "button";
	no.className = "bLayers-btn secondary";
	no.textContent = "Cancel";
	no.addEventListener("click", () => {
		editorUi.inspectConfirm = null;
		renderEditor();
	});
	wrap.append(ask, yes, no);
	return wrap;
}

export function renderEditorInspector() {
	const host = els.editorInspector;
	if (!host) return;
	host.replaceChildren();
	const sel = editorUi.selected;
	if (!sel || sel.kind === "uncategorized") {
		const hint = document.createElement("p");
		hint.className = "bLayers-ed-hint";
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
		h.className = "bLayers-ed-inspect-title";
		h.textContent = "Category";
		host.appendChild(h);
		host.appendChild(textField("Name", cat.name, "text", v => {
			void catalog.patchCategory(cat.id, { name: v });
		}));
		host.appendChild(textField("Description", cat.description, "textarea", v => {
			void catalog.patchCategory(cat.id, { description: v });
		}));
		host.appendChild(colorField("Color", cat.color, v => {
			void catalog.patchCategory(cat.id, { color: v });
		}));
		if (editorUi.inspectConfirm === `cat:${cat.id}`) {
			host.appendChild(confirmRow(`Delete “${cat.name}” and its entries?`, async () => {
				await catalog.removeCategory(cat.id);
				editorUi.inspectConfirm = null;
				editorUi.selected = null;
				renderEditor();
				setStatus(`Category “${cat.name}” removed.`, "ok");
			}));
			return;
		}
		const actions = document.createElement("div");
		actions.className = "bLayers-ed-actions";
		actions.append(
			iconBtn("↑", "Move up", () => {
				void catalog.reorderCategory(cat.id, -1);
			}),
			iconBtn("↓", "Move down", () => {
				void catalog.reorderCategory(cat.id, 1);
			}),
			dangerBtn("Delete category", "Entries are deleted; structures become Uncategorized", () => {
				editorUi.inspectConfirm = `cat:${cat.id}`;
				renderEditor();
			})
		);
		host.appendChild(actions);
		return;
	}

	if (sel.kind === "entry") {
		const ent = catalog.getCatalogEntry(sel.id);
		if (!ent) return;
		const h = document.createElement("h3");
		h.className = "bLayers-ed-inspect-title";
		h.textContent = "Entry";
		host.appendChild(h);
		host.appendChild(textField("Name", ent.name, "text", v => {
			void catalog.patchCatalogEntry(ent.id, { name: v });
		}));
		host.appendChild(textField("Description", ent.description, "textarea", v => {
			void catalog.patchCatalogEntry(ent.id, { description: v });
		}));
		const parent = document.createElement("label");
		parent.className = "bLayers-ed-field";
		const pLabel = document.createElement("span");
		pLabel.className = "bLayers-ed-label";
		pLabel.textContent = "Category";
		const pSel = document.createElement("select");
		pSel.className = "bLayers-ed-input";
		for (const c of catalog.listCategories()) {
			const opt = document.createElement("option");
			opt.value = c.id;
			opt.textContent = c.name;
			pSel.appendChild(opt);
		}
		pSel.value = ent.categoryId;
		pSel.addEventListener("change", () => {
			void catalog.patchCatalogEntry(ent.id, { categoryId: pSel.value });
		});
		parent.append(pLabel, pSel);
		host.appendChild(parent);
		const assign = document.createElement("label");
		assign.className = "bLayers-ed-field";
		const aLabel = document.createElement("span");
		aLabel.className = "bLayers-ed-label";
		aLabel.textContent = "Assign structure";
		const aSel = document.createElement("select");
		aSel.className = "bLayers-ed-input";
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
			selectEditorNode("structure", id);
			setStatus("Structure assigned.", "ok");
		});
		assign.append(aLabel, aSel);
		host.appendChild(assign);
		if (editorUi.inspectConfirm === `ent:${ent.id}`) {
			host.appendChild(confirmRow(`Delete entry “${ent.name}”?`, async () => {
				await catalog.removeCatalogEntry(ent.id);
				editorUi.inspectConfirm = null;
				editorUi.selected = null;
				renderEditor();
				setStatus(`Entry “${ent.name}” removed.`, "ok");
			}));
			return;
		}
		const actions = document.createElement("div");
		actions.className = "bLayers-ed-actions";
		actions.append(
			iconBtn("↑", "Move up", () => {
				void catalog.reorderCatalogEntry(ent.id, -1);
			}),
			iconBtn("↓", "Move down", () => {
				void catalog.reorderCatalogEntry(ent.id, 1);
			}),
			dangerBtn("Delete entry", "Structures become Uncategorized", () => {
				editorUi.inspectConfirm = `ent:${ent.id}`;
				renderEditor();
			})
		);
		host.appendChild(actions);
		return;
	}

	if (sel.kind === "structure") {
		const s = catalog.get(sel.id);
		if (!s) return;
		const h = document.createElement("h3");
		h.className = "bLayers-ed-inspect-title";
		h.textContent = "Structure";
		host.appendChild(h);
		host.appendChild(textField("Name", s.name, "text", v => {
			void catalog.patch(s.id, { name: v });
		}));
		const parent = document.createElement("label");
		parent.className = "bLayers-ed-field";
		const pLabel = document.createElement("span");
		pLabel.className = "bLayers-ed-label";
		pLabel.textContent = "Entry";
		const pSel = document.createElement("select");
		pSel.className = "bLayers-ed-input";
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
			void catalog.setStructureEntry(s.id, pSel.value || null);
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
		featLabel.className = "bLayers-ed-label";
		featLabel.textContent = "Features";
		host.appendChild(featLabel);
		const chips = document.createElement("div");
		chips.className = "bLayers-feature-chips";
		const assigned = catalog.listFeaturesForStructure(s.id);
		renderFeatureChips(chips, assigned, {
			onClick: feature => {
				void catalog.toggleStructureFeature(s.id, feature.id);
			}
		});
		if (!assigned.length) {
			chips.classList.add("is-empty");
			chips.textContent = "None yet";
		}
		host.appendChild(chips);
		const manage = document.createElement("button");
		manage.type = "button";
		manage.className = "bLayers-btn secondary";
		manage.textContent = editorUi.featuresOpen ? "Hide feature library" : "Add / edit features";
		manage.addEventListener("click", () => {
			editorUi.featuresOpen = !editorUi.featuresOpen;
			renderEditor();
		});
		host.appendChild(manage);
	}
}
