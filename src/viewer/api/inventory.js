/**
 * Public Inventory / NBT extract API.
 * UI should only consume these — not re-parse structure NBT ad hoc.
 */

export {
	buildInspectIndex,
	extractInventoryItems,
	normalizeItemStack,
	asList,
	extractSignText,
	extractSignFace,
	parseSignTextLines,
	extractLecternBook,
	extractBookPages,
	readRedstoneSignal,
	formatInspectText
} from "../inspectStructure.js";

export {
	resolveContainerKind,
	layoutForKind,
	renderContainerUi,
	readComposterFillLevel
} from "../containerUi.js";

export {
	kindOfSign,
	describeSignPlacement,
	signDebugFooter,
	placeSignFace
} from "../signPlacement.js";
