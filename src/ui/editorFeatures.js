/**
 * Editor right pane: feature library.
 */

import { catalog, editorUi, els } from "../app/state.js";
import { setStatus } from "../app/dom.js";
import { contrastText } from "../viewer/catalog.js";
import { renderEditor } from "./editorRender.js";

function hex6(color) {
	const h = String(color || "#64748b").replace("#", "");
	if (h.length === 3) return `#${h.split("").map(c => c + c).join("")}`;
	return `#${h}`.slice(0, 7);
}

function structureSelected() {
	return editorUi.selected?.kind === "structure" ? editorUi.selected.id : null;
}

function assignedSet(structureId) {
	const s = structureId ? catalog.get(structureId) : null;
	return new Set(s?.featureIds || []);
}

export async function addFeatureFromEditor() {
	const feat = await catalog.addFeature({ name: "New feature", color: "#64748b" });
	editorUi.expandedFeatureId = feat.id;
	renderEditor();
	setStatus("Feature created.", "ok");
}

export function renderEditorFeatures() {
	const wrap = els.editorFeatureList;
	const hint = els.editorFeatureHint;
	if (!wrap) return;

	const sid = structureSelected();
	const assigned = assignedSet(sid);
	const q = (els.editorFeatureFilter?.value ?? editorUi.featureFilter).trim().toLowerCase();
	editorUi.featureFilter = q;
	const list = catalog.listFeatures().filter(f => {
		if (!q) return true;
		const hay = [f.name, f.description, f.useCases, f.slug].join(" ").toLowerCase();
		return hay.includes(q);
	});

	if (hint) {
		hint.textContent = sid
			? `Click a card to assign it to “${catalog.get(sid)?.name ?? "structure"}”.`
			: "Select a structure on the left, then click a card to assign it.";
	}

	wrap.replaceChildren();
	if (!list.length) {
		const empty = document.createElement("p");
		empty.className = "basi-ed-hint";
		empty.textContent = q ? "No matching features" : "No features yet";
		wrap.appendChild(empty);
		return;
	}
	for (const feat of list) {
		wrap.appendChild(renderFeatureCard(feat, assigned.has(feat.id), sid));
	}
}

function renderFeatureCard(feat, assigned, structureId) {
	const card = document.createElement("article");
	card.className = "basi-ed-feat-card" + (assigned ? " is-assigned" : "");
	card.style.setProperty("--feat-color", feat.color || "#64748b");

	const bar = document.createElement("button");
	bar.type = "button";
	bar.className = "basi-ed-feat-main";
	bar.title = structureId ? "Toggle on selected structure" : feat.description;
	bar.addEventListener("click", () => {
		if (structureId) {
			void catalog.toggleStructureFeature(structureId, feat.id).then(() => renderEditor());
			return;
		}
		editorUi.expandedFeatureId = editorUi.expandedFeatureId === feat.id ? null : feat.id;
		renderEditorFeatures();
	});

	const name = document.createElement("div");
	name.className = "basi-ed-feat-name";
	name.style.color = contrastText(feat.color || "#64748b");
	name.style.background = feat.color || "#64748b";
	name.textContent = feat.name;

	const desc = document.createElement("p");
	desc.className = "basi-ed-feat-desc";
	desc.textContent = feat.description || "No description";

	const tags = document.createElement("div");
	tags.className = "basi-ed-feat-tags";
	for (const cid of feat.categoryIds) {
		const cat = catalog.getCategory(cid);
		if (!cat) continue;
		const pill = document.createElement("span");
		pill.className = "basi-ed-cat-pill";
		pill.style.setProperty("--cat-color", cat.color);
		pill.textContent = cat.name;
		tags.appendChild(pill);
	}
	if (assigned) {
		const on = document.createElement("span");
		on.className = "basi-ed-assigned-flag";
		on.textContent = "On structure";
		tags.appendChild(on);
	}

	bar.append(name, tags);
	if (editorUi.expandedFeatureId === feat.id && feat.description) {
		bar.appendChild(desc);
	}
	card.appendChild(bar);

	const tools = document.createElement("div");
	tools.className = "basi-ed-feat-tools";
	const edit = document.createElement("button");
	edit.type = "button";
	edit.className = "basi-ed-icon-btn";
	edit.textContent = "Edit";
	edit.addEventListener("click", e => {
		e.stopPropagation();
		editorUi.expandedFeatureId = editorUi.expandedFeatureId === feat.id ? null : feat.id;
		renderEditorFeatures();
	});
	const up = document.createElement("button");
	up.type = "button";
	up.className = "basi-ed-icon-btn";
	up.textContent = "↑";
	up.title = "Move up";
	up.addEventListener("click", e => {
		e.stopPropagation();
		void catalog.reorderFeature(feat.id, -1).then(() => renderEditor());
	});
	const down = document.createElement("button");
	down.type = "button";
	down.className = "basi-ed-icon-btn";
	down.textContent = "↓";
	down.title = "Move down";
	down.addEventListener("click", e => {
		e.stopPropagation();
		void catalog.reorderFeature(feat.id, 1).then(() => renderEditor());
	});
	tools.append(edit, up, down);
	card.appendChild(tools);

	if (editorUi.expandedFeatureId === feat.id) {
		card.appendChild(featureForm(feat));
	}
	return card;
}

function field(label, el) {
	const wrap = document.createElement("label");
	wrap.className = "basi-ed-field";
	const span = document.createElement("span");
	span.className = "basi-ed-label";
	span.textContent = label;
	wrap.append(span, el);
	return wrap;
}

function featureForm(feat) {
	const form = document.createElement("div");
	form.className = "basi-ed-feat-form";

	const name = document.createElement("input");
	name.className = "basi-ed-input";
	name.value = feat.name;
	name.addEventListener("blur", () => {
		void catalog.patchFeature(feat.id, { name: name.value }).then(() => renderEditor());
	});

	const desc = document.createElement("textarea");
	desc.className = "basi-ed-input";
	desc.rows = 4;
	desc.value = feat.description || "";
	desc.addEventListener("blur", () => {
		void catalog.patchFeature(feat.id, { description: desc.value });
	});

	const uses = document.createElement("textarea");
	uses.className = "basi-ed-input";
	uses.rows = 3;
	uses.placeholder = "When this feature matters…";
	uses.value = feat.useCases || "";
	uses.addEventListener("blur", () => {
		void catalog.patchFeature(feat.id, { useCases: uses.value });
	});

	const color = document.createElement("input");
	color.type = "color";
	color.className = "basi-ed-color";
	color.value = hex6(feat.color);
	color.addEventListener("change", () => {
		void catalog.patchFeature(feat.id, { color: color.value }).then(() => renderEditor());
	});

	const cats = document.createElement("div");
	cats.className = "basi-ed-cat-checks";
	const current = new Set(feat.categoryIds);
	for (const c of catalog.listCategories()) {
		const lab = document.createElement("label");
		lab.className = "basi-ed-check";
		const cb = document.createElement("input");
		cb.type = "checkbox";
		cb.checked = current.has(c.id);
		cb.addEventListener("change", () => {
			if (cb.checked) current.add(c.id);
			else current.delete(c.id);
			void catalog.patchFeature(feat.id, { categoryIds: [...current] }).then(() => renderEditor());
		});
		const swatch = document.createElement("span");
		swatch.className = "basi-ed-swatch";
		swatch.style.background = c.color;
		lab.append(cb, swatch, document.createTextNode(c.name));
		cats.appendChild(lab);
	}

	const del = document.createElement("button");
	del.type = "button";
	del.className = "basi-btn secondary basi-ed-danger";
	del.textContent = "Delete feature";
	del.addEventListener("click", async () => {
		if (!confirm(`Delete feature “${feat.name}”? It will be removed from all structures.`)) return;
		await catalog.removeFeature(feat.id);
		if (editorUi.expandedFeatureId === feat.id) editorUi.expandedFeatureId = null;
		renderEditor();
		setStatus(`Feature “${feat.name}” removed.`, "ok");
	});

	form.append(
		field("Name", name),
		field("Description", desc),
		field("Use cases", uses),
		field("Color", color),
		field("Categories", cats),
		del
	);
	return form;
}
