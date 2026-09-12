/**
 * Public Structure Catalog API (IndexedDB-backed).
 */

export { default as StructureCatalog } from "../catalog.js";
export {
	dbPutStructure,
	dbDeleteStructure,
	dbClearAll,
	dbClearStructures,
	dbLoadAll,
	dbPutCategory,
	dbPutCategories,
	dbDeleteCategory,
	dbLoadCategories,
	dbPutEntry,
	dbPutEntries,
	dbDeleteEntry,
	dbLoadEntries,
	dbPutFeature,
	dbPutFeatures,
	dbDeleteFeature,
	dbLoadFeatures,
	dbCloneCatalog,
	dbDeleteCatalog,
	setActiveDbName,
	getActiveDbName
} from "../db.js";
