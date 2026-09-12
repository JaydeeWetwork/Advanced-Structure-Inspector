/**
 * One-time default catalog rename: structure-db-viewer → asi-db-viewer.
 * Call from catalog boot only — not from hydrate/reload.
 */

import {
	DEFAULT_DB_NAME,
	LEGACY_DEFAULT_DB_NAME,
	dbCatalogRowCount,
	dbCloneCatalog,
	dbDeleteCatalog
} from "./db.js";
import { remapLegacyDefaultDbNames } from "./catalogRegistry.js";

const MIGRATE_FLAG_KEY = "basi.defaultDbMigrated.v1";

export function canonicalDefaultDbName(name) {
	if (!name || name === LEGACY_DEFAULT_DB_NAME) return DEFAULT_DB_NAME;
	return name;
}

/**
 * Pure plan. Delete is never in the plan — the orchestrator deletes only
 * after a clone in this same call succeeds.
 * @param {{ destCount?: number, sourceCount?: number, legacyKnownMissing?: boolean }} input
 * @returns {{ clone: boolean, remap: boolean, writeFlag: boolean }}
 */
export function decideDefaultCatalogMigration(input = {}) {
	if (input.legacyKnownMissing) {
		return { clone: false, remap: true, writeFlag: true };
	}
	const destEmpty = (Number(input.destCount) || 0) === 0;
	const sourceHasData = (Number(input.sourceCount) || 0) > 0;
	return {
		clone: destEmpty && sourceHasData,
		remap: destEmpty && !sourceHasData,
		writeFlag: destEmpty && !sourceHasData
	};
}

/**
 * @param {string} name
 * @returns {Promise<boolean|null>}
 */
async function databaseExists(name) {
	if (typeof indexedDB === "undefined") return false;
	if (typeof indexedDB.databases !== "function") return null;
	try {
		const list = await indexedDB.databases();
		return (list || []).some(d => d && d.name === name);
	} catch {
		return null;
	}
}

function readMigrateFlag() {
	try {
		if (typeof localStorage === "undefined") return null;
		return localStorage.getItem(MIGRATE_FLAG_KEY);
	} catch {
		return null;
	}
}

function writeMigrateFlag() {
	try {
		if (typeof localStorage === "undefined") return;
		localStorage.setItem(MIGRATE_FLAG_KEY, DEFAULT_DB_NAME);
	} catch {
		/* ignore */
	}
}

/**
 * Clone empty dest from legacy, delete legacy only if clone succeeded,
 * then point the registry at asi-db-viewer.
 * @returns {Promise<{ cloned: boolean, deleted: boolean, skipped?: boolean }>}
 */
export async function ensureDefaultCatalogMigrated() {
	if (typeof indexedDB === "undefined" || DEFAULT_DB_NAME === LEGACY_DEFAULT_DB_NAME) {
		remapLegacyDefaultDbNames();
		return { cloned: false, deleted: false, skipped: true };
	}
	if (readMigrateFlag() === DEFAULT_DB_NAME) {
		remapLegacyDefaultDbNames();
		return { cloned: false, deleted: false, skipped: true };
	}

	const destKnown = await databaseExists(DEFAULT_DB_NAME);
	const legacyKnown = await databaseExists(LEGACY_DEFAULT_DB_NAME);
	const destCount = destKnown === false ? 0 : await dbCatalogRowCount(DEFAULT_DB_NAME);
	const sourceCount = legacyKnown === false ? 0 : await dbCatalogRowCount(LEGACY_DEFAULT_DB_NAME);
	const plan = decideDefaultCatalogMigration({
		destCount,
		sourceCount,
		legacyKnownMissing: legacyKnown === false
	});

	let cloned = false;
	if (plan.clone) {
		await dbCloneCatalog(LEGACY_DEFAULT_DB_NAME, DEFAULT_DB_NAME);
		cloned = true;
	}

	let deleted = false;
	if (cloned) {
		try {
			await dbDeleteCatalog(LEGACY_DEFAULT_DB_NAME);
			deleted = true;
		} catch (e) {
			console.warn("[basi] legacy IndexedDB delete failed:", e);
		}
	}

	if (cloned || plan.remap) remapLegacyDefaultDbNames();
	if (cloned || plan.writeFlag) writeMigrateFlag();
	return { cloned, deleted };
}
