/**
 * Public catalog API. Persistence stays inside StructureCatalog / db.js.
 */

export { default as StructureCatalog } from "../catalog.js";
export { DEFAULT_DB_NAME } from "../db.js";
export {
	activateCatalog,
	createEmptyCatalog,
	deleteActiveCatalog,
	renameActiveCatalog,
	saveCatalogAs
} from "../catalogSwitch.js";
export { getActiveCatalog, listCatalogs } from "../catalogRegistry.js";
