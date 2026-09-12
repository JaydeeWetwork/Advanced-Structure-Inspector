/**
 * Named catalog switcher: rename, save as, load, new, delete.
 */

import { catalog, editorUi, els, session } from "../app/state.js";
import { setStatus } from "../app/dom.js";
import { renderEditor } from "./editorRender.js";
import { getActiveCatalog, listCatalogs } from "../viewer/catalogRegistry.js";
import { selectEntry } from "../app/previewLifecycle.js";

function resetAfterCatalogSwitch() {
	editorUi.selected = null;
	editorUi.inspectConfirm = null;
	try {
		session.clearEverything({ resetIcons: false });
	} catch {
		/* ignore */
	}
	selectEntry(null);
}

export function renderEditorDbBar() {
	const host = els.editorDbBar;
	if (!host) return;
	const active = getActiveCatalog();
	const items = listCatalogs();
	host.replaceChildren();

	const name = document.createElement("input");
	name.type = "text";
	name.className = "basi-ed-db-name";
	name.value = active.name;
	name.title = "Rename this database";
	name.spellcheck = false;
	name.addEventListener("blur", () => {
		const next = name.value.trim();
		if (!next || next === active.name) {
			name.value = active.name;
			return;
		}
		catalog.renameActive(next);
		renderEditor();
		setStatus(`Renamed to “${next}”.`, "ok");
	});
	name.addEventListener("keydown", e => {
		if (e.key === "Enter") {
			e.preventDefault();
			name.blur();
		}
	});

	const load = document.createElement("select");
	load.className = "basi-ed-input basi-ed-db-load";
	load.title = "Load a saved database";
	for (const item of items) {
		const opt = document.createElement("option");
		opt.value = item.id;
		opt.textContent = item.id === active.id ? `${item.name} (current)` : item.name;
		load.appendChild(opt);
	}
	load.value = active.id;
	load.addEventListener("change", () => {
		const item = items.find(i => i.id === load.value);
		if (!item || item.id === active.id) return;
		resetAfterCatalogSwitch();
		void catalog.activate(item.id).then(() => {
			setStatus(`Loaded “${item.name}”.`, "ok");
		}).catch(e => setStatus(`Load failed: ${e?.message ?? e}`, "error"));
	});

	host.append(name, load);

	const form = editorUi.dbForm;
	if (form) {
		if (form.mode === "delete") {
			const warn = document.createElement("span");
			warn.className = "basi-ed-hint";
			warn.textContent = `Delete “${active.name}”?`;
			const yes = document.createElement("button");
			yes.type = "button";
			yes.className = "basi-btn secondary basi-ed-danger";
			yes.textContent = "Confirm";
			yes.addEventListener("click", async () => {
				try {
					editorUi.dbForm = null;
					resetAfterCatalogSwitch();
					const next = await catalog.deleteActive();
					setStatus(`Deleted “${active.name}”. Loaded “${next.name}”.`, "ok");
				} catch (e) {
					setStatus(`Delete failed: ${e?.message ?? e}`, "error");
				}
			});
			const no = document.createElement("button");
			no.type = "button";
			no.className = "basi-btn secondary";
			no.textContent = "Cancel";
			no.addEventListener("click", () => {
				editorUi.dbForm = null;
				renderEditor();
			});
			host.append(warn, yes, no);
			return;
		}

		const input = document.createElement("input");
		input.type = "text";
		input.className = "basi-ed-input";
		input.value = form.name || "";
		input.placeholder = form.mode === "new" ? "New database name" : "Save as…";
		input.addEventListener("input", () => {
			form.name = input.value;
		});
		const ok = document.createElement("button");
		ok.type = "button";
		ok.className = "basi-btn";
		ok.textContent = form.mode === "new" ? "Create" : "Save";
		ok.addEventListener("click", async () => {
			const n = (form.name || "").trim();
			if (!n) return;
			try {
				const mode = form.mode;
				editorUi.dbForm = null;
				resetAfterCatalogSwitch();
				if (mode === "new") await catalog.createEmpty(n);
				else await catalog.saveAs(n);
				setStatus(mode === "new" ? `Created “${n}”.` : `Saved as “${n}”.`, "ok");
			} catch (e) {
				setStatus(`Failed: ${e?.message ?? e}`, "error");
			}
		});
		const no = document.createElement("button");
		no.type = "button";
		no.className = "basi-btn secondary";
		no.textContent = "Cancel";
		no.addEventListener("click", () => {
			editorUi.dbForm = null;
			renderEditor();
		});
		host.append(input, ok, no);
		return;
	}

	const saveAs = document.createElement("button");
	saveAs.type = "button";
	saveAs.className = "basi-btn secondary";
	saveAs.textContent = "Save as";
	saveAs.addEventListener("click", () => {
		editorUi.dbForm = { mode: "saveAs", name: `${active.name} copy` };
		renderEditor();
	});

	const neu = document.createElement("button");
	neu.type = "button";
	neu.className = "basi-btn secondary";
	neu.textContent = "New";
	neu.title = "New database with the default category layout";
	neu.addEventListener("click", () => {
		editorUi.dbForm = { mode: "new", name: "Untitled" };
		renderEditor();
	});

	host.append(saveAs, neu);

	if (items.length > 1) {
		const del = document.createElement("button");
		del.type = "button";
		del.className = "basi-btn secondary basi-ed-danger";
		del.textContent = "Delete";
		del.addEventListener("click", () => {
			editorUi.dbForm = { mode: "delete" };
			renderEditor();
		});
		host.appendChild(del);
	}
}
