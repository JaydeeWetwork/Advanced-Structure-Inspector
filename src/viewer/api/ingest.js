/**
 * Public structure ingest API (browser / File-based).
 */

export {
	IngestError,
	ingestFiles,
	detectSourceKind,
	expandSourceFile,
	sanitizeZipEntryName,
	assertZipBudget,
	ZIP_MAX_ENTRIES,
	ZIP_MAX_UNCOMPRESSED,
	ZIP_MAX_ENTRY_BYTES,
	ZIP_MAX_STRUCTURES,
	INGEST_MAX_TOP_FILES
} from "../ingest.js";
