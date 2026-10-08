/**
 * IndexedDB persistence for the structure catalog.
 * Structure rows, taxonomy rows, and catalog copy live in the sibling modules.
 */
export {
	CATALOG_DB_PREFIX,
	canonicalCatalogDbName,
	DEFAULT_DB_NAME,
	getActiveDbName,
	isProtectedDefaultDbName,
	LEGACY_CATALOG_PREFIX,
	LEGACY_DEFAULT_DB_NAME,
	PREVIOUS_DEFAULT_DB_NAME,
	setActiveDbName
} from "./dbSession.js";
export {
	bytesFromStoredBlob,
	dbClearAll,
	dbClearStructures,
	dbDeleteStructure,
	dbLoadAll,
	dbPutStructure,
	fileFromBytes,
	fileFromStoredBlob
} from "./dbStructures.js";
export {
	dbCatalogRowCount,
	dbCloneCatalog,
	dbDeleteCatalog,
	dbDeleteCategory,
	dbDeleteEntry,
	dbDeleteFeature,
	dbGetMeta,
	dbLoadCategories,
	dbLoadEntries,
	dbLoadFeatures,
	dbPutCategories,
	dbPutCategory,
	dbPutEntries,
	dbPutEntry,
	dbPutFeature,
	dbPutFeatures,
	dbPutMeta,
	dbRemoveCategoryCascade,
	dbRemoveEntryCascade,
	dbRemoveFeatureCascade
} from "./dbTaxonomy.js";
/** Drop legacy localStorage metadata index from the scaffold era. */
export function clearLegacyLocalStorageIndex() {
	try {
		localStorage.removeItem("structure-db-viewer.catalog-index.v1");
	} catch {
		/* ignore */
	}
}
