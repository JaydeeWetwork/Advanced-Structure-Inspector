/**
 * File import.
 */

import { ingestFiles } from "../viewer/api/ingest.js";
import {
	catalog,
	els,
	getSelectedId,
	importState
} from "./state.js";
import { setStatus } from "./dom.js";
import { renderList } from "../ui/catalogList.js";
import { selectEntry } from "./previewLifecycle.js";

export async function handleFiles(files) {
	if (!files || !files.length) {
		setStatus("No files selected.", "error");
		return;
	}
	// Single-flight: ignore overlapping drop/pick while import runs
	if (importState.inFlight) {
		setStatus("Import already in progress — wait for it to finish.", "warn");
		return;
	}
	importState.inFlight = true;
	importState.abort = new AbortController();

	const fileArr = [...files];
	setStatus(`Importing ${fileArr.length} file(s)…`);
	if (els.previewBtn) els.previewBtn.disabled = true;
	if (els.importBtn) els.importBtn.disabled = true;

	try {
		const knownCrcs = catalog.list()
			.map(e => e.contentCrc32)
			.filter(Boolean);
		const { entries, warnings, errors } = await ingestFiles(fileArr, {
			onProgress: msg => setStatus(msg),
			signal: importState.abort?.signal,
			knownCrcs
		});

		const added = [];
		const persistFails = [];
		for (const fields of entries) {
			const entry = await catalog.add(fields);
			added.push(entry);
			if (entry.persistError) {
				persistFails.push(`${entry.name}: ${entry.persistError}`);
			}
		}

		renderList();

		const parts = [];
		if (added.length) parts.push(`Imported ${added.length} structure(s).`);
		if (warnings.length) parts.push(...warnings);
		if (errors.length) parts.push(...errors);
		if (persistFails.length) {
			parts.push(
				`IndexedDB save failed for ${persistFails.length} (in-memory only this session):`,
				...persistFails.slice(0, 3)
			);
		}
		if (catalog.lastPersistError && !persistFails.length) {
			parts.push(`IndexedDB: ${catalog.lastPersistError}`);
		}

		const kind = persistFails.length || (added.length && errors.length)
			? "warn"
			: added.length
				? "ok"
				: warnings.length
					? "warn"
					: "error";
		if (added.length) {
			setStatus(parts.join("\n"), kind);
			selectEntry(added[added.length - 1].id);
		} else {
			setStatus(parts.join("\n") || "Nothing imported.", kind);
		}
	} catch (e) {
		console.error(e);
		setStatus(`Import failed: ${e?.message ?? e}`, "error");
		renderList();
	} finally {
		importState.inFlight = false;
		importState.abort = null;
		if (els.importInput) els.importInput.value = "";
		if (els.importBtn) els.importBtn.disabled = false;
		if (els.previewBtn) els.previewBtn.disabled = !getSelectedId();
	}
}

