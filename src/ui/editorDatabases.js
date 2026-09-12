/**
 * Named catalog switcher in the editor (rename / save as / load / new).
 */

import { catalog, editorUi, els, setSelectedId } from "../app/state.js";
import { setStatus } from "../app/dom.js";
import { renderEditor } from "./editorRender.js";
import { renderList } from "./catalogList.js";
import {
	addCatalogRecord,
	copySeedState,
	createCatalogRecord,
	DEFAULT_DB_NAME,
	getActiveCatalog,
	listCatalogs,
	removeCatalogRecord,
	renameCatalog,
	setActiveCatalogId,
	touchCatalog
} from "../viewer/catalogRegistry.js";
import { dbClearAll, dbCloneCatalog, dbDeleteCatalog, setActiveDbName } from "../viewer/db.js";

async function switchToRecord(item) {
	if (!item) return;
	setActiveCatalogId(item.id);
	setActiveDbName(item.dbName);
	editorUi.selected = null;
	setSelectedId(null);
	await catalog.reloadFromDb();
	touchCatalog(item.id);
	renderList();
	renderEditor();
	setStatus(`Loaded “${item.name}”.`, "ok");
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
		renameCatalog(active.id, next);
		renderEditorDbBar();
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
		void switchToRecord(item);
	});

	const saveAs = document.createElement("button");
	saveAs.type = "button";
	saveAs.className = "basi-btn secondary";
	saveAs.textContent = "Save as";
	saveAs.addEventListener("click", async () => {
		const suggested = `${active.name} copy`;
		const typed = prompt("Save this database as:", suggested);
		if (typed == null) return;
		const rec = addCatalogRecord(typed);
		try {
			await dbCloneCatalog(active.dbName, rec.dbName);
			copySeedState(active.dbName, rec.dbName);
			await switchToRecord(rec);
			setStatus(`Saved as “${rec.name}”.`, "ok");
		} catch (e) {
			setStatus(`Save as failed: ${e?.message ?? e}`, "error");
		}
	});

	const neu = document.createElement("button");
	neu.type = "button";
	neu.className = "basi-btn secondary";
	neu.textContent = "New";
	neu.title = "New database with the default category layout";
	neu.addEventListener("click", async () => {
		const typed = prompt("Name for the new database:", "Untitled");
		if (typed == null) return;
		const rec = createCatalogRecord(typed);
		setActiveDbName(rec.dbName);
		editorUi.selected = null;
		setSelectedId(null);
		await catalog.reloadFromDb();
		renderList();
		renderEditor();
		setStatus(`Created “${rec.name}”.`, "ok");
	});

	host.append(name, load, saveAs, neu);

	if (items.length > 1) {
		const del = document.createElement("button");
		del.type = "button";
		del.className = "basi-btn secondary basi-ed-danger";
		del.textContent = "Delete";
		del.title = "Delete this database";
		del.addEventListener("click", async () => {
			if (!confirm(`Delete database “${active.name}”? Structures in it are removed from this browser.`)) return;
			const gone = removeCatalogRecord(active.id);
			if (!gone) return;
			try {
				if (gone.removed.dbName !== DEFAULT_DB_NAME) {
					await dbDeleteCatalog(gone.removed.dbName);
				} else {
					setActiveDbName(gone.removed.dbName);
					await dbClearAll();
				}
			} catch (e) {
				console.warn("[basi] catalog delete", e);
			}
			await switchToRecord(gone.next);
			setStatus(`Deleted “${gone.removed.name}”.`, "ok");
		});
		host.appendChild(del);
	}
}
