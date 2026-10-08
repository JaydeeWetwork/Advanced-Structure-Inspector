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
	parseSignStyleRuns,
	signArgbCss,
	extractLecternBook,
	extractBookPages,
	parseDisabledSlots,
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
	signFaceTag,
	placeSignFace
} from "../signPlacement.js";
