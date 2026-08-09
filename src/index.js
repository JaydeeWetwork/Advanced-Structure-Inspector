/**
 * Structure Database Viewer — primary app entry.
 * Reuses HoloPrint parse/extract/preview; does not log to upstream Supabase.
 */

import * as HoloPrint from "./HoloPrint.js";
import ResourcePackStack from "./ResourcePackStack.js";
import StructureCatalog from "./viewer/catalog.js";
import { ingestFiles } from "./viewer/ingest.js";

const catalog = new StructureCatalog();
/** @type {string|null} */
let selectedId = null;
/** @type {AbortController|null} */
let previewAbort = null;

const els = {
	importInput: /** @type {HTMLInputElement} */ (document.getElementById("importInput")),
	clearCatalogBtn: document.getElementById("clearCatalogBtn"),
	dropzone: document.getElementById("dropzone"),
	dropzoneBrowseBtn: document.getElementById("dropzoneBrowseBtn"),
	searchInput: /** @type {HTMLInputElement} */ (document.getElementById("searchInput")),
	catalogList: document.getElementById("catalogList"),
	catalogCount: document.getElementById("catalogCount"),
	catalogHint: document.getElementById("catalogHint"),
	statusBox: document.getElementById("statusBox"),
	emptyState: document.getElementById("emptyState"),
	detailPanel: document.getElementById("detailPanel"),
	detailName: document.getElementById("detailName"),
	detailSource: document.getElementById("detailSource"),
	detailStats: document.getElementById("detailStats"),
	detailPalette: document.getElementById("detailPalette"),
	previewHost: document.getElementById("previewHost"),
	previewBtn: /** @type {HTMLButtonElement} */ (document.getElementById("previewBtn")),
	downloadBtn: document.getElementById("downloadBtn"),
	removeBtn: document.getElementById("removeBtn")
};

function setStatus(message, kind = "") {
	if (!message) {
		els.statusBox.classList.add("hidden");
		els.statusBox.textContent = "";
		els.statusBox.classList.remove("error", "ok");
		return;
	}
	els.statusBox.classList.remove("hidden", "error", "ok");
	if (kind) els.statusBox.classList.add(kind);
	els.statusBox.textContent = message;
}

function renderList() {
	const query = els.searchInput.value;
	const items = catalog.search({ query });
	els.catalogCount.textContent = `${catalog.list().length} structure${catalog.list().length === 1 ? "" : "s"}`;
	els.catalogHint.textContent = query ? `${items.length} match${items.length === 1 ? "" : "es"}` : "";

	els.catalogList.replaceChildren();
	for (const entry of items) {
		const li = document.createElement("li");
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "sdb-catalog-item" + (entry.id === selectedId ? " selected" : "");
		btn.innerHTML = `
			<h3></h3>
			<p class="meta"></p>
		`;
		btn.querySelector("h3").textContent = entry.name;
		btn.querySelector(".meta").textContent =
			`${entry.size.join("×")} · ${entry.blockCount.toLocaleString()} blocks · ${entry.sourceKind}`;
		btn.addEventListener("click", () => selectEntry(entry.id));
		li.appendChild(btn);
		els.catalogList.appendChild(li);
	}
}

/**
 * @param {string|null} id
 */
function selectEntry(id) {
	selectedId = id;
	renderList();
	const entry = id ? catalog.get(id) : null;
	if (!entry) {
		els.emptyState.classList.remove("hidden");
		els.detailPanel.classList.add("hidden");
		return;
	}

	els.emptyState.classList.add("hidden");
	els.detailPanel.classList.remove("hidden");
	els.detailName.textContent = entry.name;
	els.detailSource.textContent = `Source: ${entry.sourceName} (${entry.sourceKind})`;

	const origin = entry.worldOrigin ? entry.worldOrigin.join(", ") : "—";
	els.detailStats.innerHTML = [
		stat("Size", entry.size.join(" × ")),
		stat("Blocks", entry.blockCount.toLocaleString()),
		stat("Palette", String(entry.paletteSize)),
		stat("World origin", origin)
	].join("");

	els.detailPalette.replaceChildren();
	const names = entry.blockNames.length ? entry.blockNames : ["(empty palette)"];
	for (const name of names) {
		const div = document.createElement("div");
		div.textContent = name;
		els.detailPalette.appendChild(div);
	}

	// Reset preview host when switching entries
	resetPreviewHost();
}

function stat(label, value) {
	return `<div class="sdb-stat"><span class="label">${label}</span><span class="value">${escapeHtml(value)}</span></div>`;
}

function escapeHtml(s) {
	return String(s)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function resetPreviewHost() {
	if (previewAbort) {
		previewAbort.abort();
		previewAbort = null;
	}
	els.previewHost.replaceChildren();
	const p = document.createElement("p");
	p.className = "meta";
	p.style.cssText = "padding:12px;color:#ccc;margin:0";
	p.textContent = "Click “Load 3D preview” to render with HoloPrint’s PreviewRenderer.";
	els.previewHost.appendChild(p);
	els.previewBtn.disabled = !selectedId;
}

/**
 * @param {FileList|File[]} files
 */
async function handleFiles(files) {
	if (!files?.length) return;
	setStatus(`Importing ${files.length} file(s)…`);
	els.previewBtn.disabled = true;

	try {
		const { entries, warnings, errors } = await ingestFiles(files);
		const added = [];
		for (const fields of entries) {
			added.push(catalog.add(fields));
		}

		const parts = [];
		if (added.length) parts.push(`Added ${added.length} structure(s).`);
		if (warnings.length) parts.push(warnings.join("\n"));
		if (errors.length) parts.push(errors.join("\n"));

		if (added.length) {
			setStatus(parts.join("\n") || "Done.", errors.length ? "error" : "ok");
			selectEntry(added[0].id);
		} else {
			setStatus(parts.join("\n") || "No structures imported.", "error");
			renderList();
		}
	} catch (e) {
		console.error(e);
		setStatus(String(e?.message ?? e), "error");
	} finally {
		els.importInput.value = "";
	}
}

async function loadPreview() {
	const entry = selectedId ? catalog.get(selectedId) : null;
	if (!entry) return;

	previewAbort = new AbortController();
	const signal = previewAbort.signal;

	els.previewBtn.disabled = true;
	els.previewHost.replaceChildren();
	const loading = document.createElement("p");
	loading.style.cssText = "padding:12px;color:#eee;margin:0";
	loading.textContent = "Building geometry / textures for preview (this may take a while)…";
	els.previewHost.appendChild(loading);

	try {
		const previewCont = document.createElement("div");
		previewCont.className = "previewCont";
		// Minimal config: skip heavy control retextures; raise preview limit for viewer use
		const config = HoloPrint.addDefaultConfig({
			PACK_NAME: entry.name,
			RETEXTURE_CONTROL_ITEMS: false,
			UI_CONTROLS_ENABLED: false,
			PLAYER_CONTROLS_ENABLED: false,
			PREVIEW_BLOCK_LIMIT: 50_000,
			SHOW_PREVIEW_SKYBOX: true,
			SHOW_PREVIEW_WIDGETS: true
		});
		const rps = new ResourcePackStack();
		const res = await HoloPrint.makePack(entry.file, config, rps, previewCont);
		if (signal.aborted) return;

		els.previewHost.replaceChildren(previewCont);
		if (res.previews) {
			await res.previews;
		}
		setStatus(`Preview ready for “${entry.name}”. Pack blob also generated in memory (not auto-downloaded).`, "ok");
	} catch (e) {
		if (signal.aborted) return;
		console.error(e);
		els.previewHost.replaceChildren();
		const err = document.createElement("p");
		err.style.cssText = "padding:12px;color:#f88;margin:0";
		err.textContent = `Preview failed: ${e?.message ?? e}`;
		els.previewHost.appendChild(err);
		setStatus(String(e?.message ?? e), "error");
	} finally {
		if (!signal.aborted) {
			els.previewBtn.disabled = false;
		}
	}
}

function downloadSelected() {
	const entry = selectedId ? catalog.get(selectedId) : null;
	if (!entry) return;
	const url = URL.createObjectURL(entry.file);
	const a = document.createElement("a");
	a.href = url;
	a.download = entry.file.name || `${entry.name}.mcstructure`;
	a.click();
	URL.revokeObjectURL(url);
}

function removeSelected() {
	if (!selectedId) return;
	catalog.remove(selectedId);
	selectedId = null;
	selectEntry(null);
	renderList();
	setStatus("Removed structure from catalog.", "ok");
}

function wireUi() {
	els.importInput.addEventListener("change", () => handleFiles(els.importInput.files));
	els.dropzoneBrowseBtn.addEventListener("click", () => els.importInput.click());
	els.clearCatalogBtn.addEventListener("click", () => {
		if (!catalog.list().length) return;
		if (!confirm("Clear the entire catalog for this session?")) return;
		catalog.clear();
		selectedId = null;
		selectEntry(null);
		renderList();
		setStatus("Catalog cleared.", "ok");
	});
	els.searchInput.addEventListener("input", () => renderList());
	els.previewBtn.addEventListener("click", () => loadPreview());
	els.downloadBtn.addEventListener("click", () => downloadSelected());
	els.removeBtn.addEventListener("click", () => removeSelected());

	const dz = els.dropzone;
	["dragenter", "dragover"].forEach(type => {
		dz.addEventListener(type, e => {
			e.preventDefault();
			dz.classList.add("dragover");
		});
	});
	["dragleave", "drop"].forEach(type => {
		dz.addEventListener(type, e => {
			e.preventDefault();
			dz.classList.remove("dragover");
		});
	});
	dz.addEventListener("drop", e => {
		const dt = e.dataTransfer;
		if (dt?.files?.length) handleFiles(dt.files);
	});

	// Whole-window drop convenience
	window.addEventListener("dragover", e => e.preventDefault());
	window.addEventListener("drop", e => {
		if (e.target === dz || dz.contains(/** @type {Node} */ (e.target))) return;
		e.preventDefault();
		if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
	});
}

function showPersistedIndexHint() {
	const index = StructureCatalog.loadPersistedIndex();
	if (index.length) {
		els.catalogHint.textContent = `${index.length} prior (re-import files)`;
		setStatus(
			`Found a saved metadata index for ${index.length} structure(s). File bytes are not stored yet — re-import the same sources to restore the catalog.`,
			""
		);
	}
}

wireUi();
renderList();
selectEntry(null);
showPersistedIndexHint();

console.info("Structure DB Viewer scaffold ready — HoloPrint core VERSION:", HoloPrint.VERSION);
