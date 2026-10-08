/**
 * Unit tests for Bedrock Layers (Node --test).
 * Pure logic + lightweight mocks — no browser / WebGL required.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");

// Minimal DOMException for Node if missing
if (typeof globalThis.DOMException === "undefined") {
	globalThis.DOMException = class DOMException extends Error {
		constructor(message, name = "Error") {
			super(message);
			this.name = name;
		}
	};
}

const { throwIfAborted, isAbortError } = await import("../../src/viewer/abortUtil.js");
const {
	cloneBlockIndices,
	normalizeVec3,
	mergeMultiplePalettesAndIndices,
	IGNORED_BLOCKS
} = await import("../../src/viewer/paletteCore.js");
const {
	getCachedDataFile,
	clearDataFileCache,
	getCachedFileBuild,
	clearAllPreviewCaches
} = await import("../../src/viewer/previewCache.js");
const { countStructureEntities } = await import("../../src/viewer/entityCount.js");
const StructureCatalog = (await import("../../src/viewer/catalog.js")).default;

// ---- abortUtil -----------------------------------------------------------

describe("inspect pick (first classified hit)", async () => {
	const inspectMod = await import("../../src/viewer/systems/InspectRaycaster.js");
	const InspectRaycaster = inspectMod.default;

	it("does not export slack / chooseInspectHit", () => {
		assert.equal(inspectMod.chooseInspectHit, undefined);
		assert.equal(inspectMod.ENTITY_PICK_SLACK, undefined);
	});

	it("returns miss when the raycaster is not initialized", () => {
		const picker = new InspectRaycaster({
			canvas: null,
			camera: null,
			scene: null,
			layers: null,
			selectedLayer: null,
			inspectIndex: null,
			blockPalette: null
		});
		assert.deepEqual(picker.pickAtClient(0, 0), { kind: "miss" });
	});
});

describe("sign / lectern / redstone extract", async () => {
	const {
		extractSignText,
		extractLecternBook,
		extractBookPages,
		parseSignStyleRuns,
		parseSignTextLines,
		readRedstoneSignal,
		signArgbCss
	} = await import("../../src/viewer/inspectStructure.js");

	it("parses sign FrontText / BackText", () => {
		const sign = extractSignText({
			id: "Sign",
			FrontText: { Text: "Hello\nWorld\n\n", SignTextColor: -1 },
			BackText: { Text: "Back" },
			IsWaxed: 1
		});
		assert.ok(sign);
		assert.deepEqual(sign.front.lines, ["Hello", "World"]);
		assert.deepEqual(sign.back.lines, ["Back"]);
		assert.equal(sign.waxed, true);
	});

	it("strips section codes from sign text", () => {
		assert.deepEqual(parseSignTextLines("§cRed§r line"), ["Red line"]);
		assert.deepEqual(parseSignTextLines("§cRed§r line", true), ["§cRed§r line"]);
	});

	it("flattens sign rawtext and refuses JSON nested past 100", () => {
		assert.deepEqual(
			parseSignTextLines('{"rawtext":[{"text":"Hello [world]"}]}'),
			["Hello [world]"]
		);
		assert.deepEqual(parseSignTextLines("{not json"), ["{not json"]);
		const under = "[".repeat(100) + '"leaf"' + "]".repeat(100);
		assert.deepEqual(parseSignTextLines(under), ["leaf"]);
		const over = "[".repeat(101) + '"leaf"' + "]".repeat(101);
		assert.deepEqual(parseSignTextLines(over), []);
		const disguised = "{" + "}".repeat(50) + over;
		assert.deepEqual(parseSignTextLines(disguised), []);
		const big = "a".repeat(9000);
		const lines = parseSignTextLines(JSON.stringify({ text: big }));
		assert.equal(lines.length, 1);
		assert.equal(lines[0], "a".repeat(8192));

		let page = "leaf";
		for (let i = 0; i < 101; i++) page = [page];
		const book = extractBookPages({
			Name: "minecraft:written_book",
			tag: { pages: [page, over] }
		});
		assert.deepEqual(book.pages, ["", ""]);
	});

	it("paints sign dye and glow ink", () => {
		assert.equal(signArgbCss(-16777216, false), "rgb(0,0,0)");
		assert.equal(signArgbCss(-16777216, true), "#ffffff");
		assert.equal(signArgbCss(-1, false), "rgb(255,255,255)");
		assert.equal(signArgbCss(0xff3c44aa | 0, false), "rgb(60,68,170)");
		assert.equal(signArgbCss(null, false), "#000000");
		assert.equal(signArgbCss(null, true), "#ffffff");
		const runs = parseSignStyleRuns("§cRed §fWhite", "rgb(0,0,0)");
		assert.equal(runs[0].text, "Red ");
		assert.equal(runs[0].color, "#ff5555");
		assert.equal(runs[1].text, "White");
		assert.equal(runs[1].color, "#ffffff");
		const reset = parseSignStyleRuns("§l§cBold§r dye", "rgb(1,2,3)");
		assert.equal(reset[0].text, "Bold");
		assert.equal(reset[0].bold, true);
		assert.equal(reset[0].color, "#ff5555");
		assert.equal(reset[1].text, " dye");
		assert.equal(reset[1].color, "rgb(1,2,3)");
		assert.equal(reset[1].bold, false);
	});

	it("reads lectern book + pages", () => {
		const lec = extractLecternBook({
			id: "Lectern",
			hasBook: 1,
			page: 1,
			book: {
				Name: "minecraft:written_book",
				tag: {
					title: "Notes",
					author: "Mapmaker",
					pages: ["Page A", "Page B text"]
				}
			}
		});
		assert.equal(lec.hasBook, true);
		assert.equal(lec.page, 1);
		assert.equal(lec.book.title, "Notes");
		assert.equal(lec.book.author, "Mapmaker");
		assert.equal(lec.book.pages[1], "Page B text");
	});

	it("extractBookPages handles empty writable book", () => {
		const b = extractBookPages({ Name: "minecraft:writable_book", Count: 1 });
		assert.equal(b.itemName, "writable_book");
		assert.equal(b.pages.length, 0);
	});

	it("readRedstoneSignal clamps 0–15", () => {
		assert.equal(readRedstoneSignal({ redstone_signal: 12 }), 12);
		assert.equal(readRedstoneSignal({ redstone_signal: 0 }), 0);
		assert.equal(readRedstoneSignal({ power: 99 }), 15);
		assert.equal(readRedstoneSignal(null), null);
	});
});

describe("inventory extract (minecarts / nbtify shapes)", async () => {
	const {
		extractInventoryItems,
		normalizeItemStack,
		asList
	} = await import("../../src/viewer/inspectStructure.js");

	it("links paired chests and merges 54-slot items on the inspect index", async () => {
		const { buildInspectIndex } = await import("../../src/viewer/inspectStructure.js");
		const data = {
			size: [2, 1, 1],
			structure_world_origin: [10, 64, 20],
			structure: {
				block_indices: [new Int32Array([0, 0]), new Int32Array([-1, -1])],
				palette: {
					default: {
						block_palette: [
							{ name: "minecraft:chest", states: { "minecraft:cardinal_direction": "north" } }
						],
						block_position_data: {
							0: {
								block_entity_data: {
									id: "Chest",
									x: 10,
									y: 64,
									z: 20,
									pairx: 11,
									pairz: 20,
									Items: [{ Name: "minecraft:dirt", Count: 1, Slot: 0 }]
								}
							},
							1: {
								block_entity_data: {
									id: "Chest",
									x: 11,
									y: 64,
									z: 20,
									pairx: 10,
									pairz: 20,
									Items: [{ Name: "minecraft:diamond", Count: 2, Slot: 0 }]
								}
							}
						}
					}
				},
				entities: []
			}
		};
		const idx = buildInspectIndex(data);
		const left = idx.blocks.get("0,0,0");
		const right = idx.blocks.get("1,0,0");
		assert.equal(left.doubleChest.half, "left");
		assert.equal(right.doubleChest.half, "right");
		assert.equal(left.doubleItems.find(i => i.name === "dirt")?.slot, 0);
		assert.equal(left.doubleItems.find(i => i.name === "diamond")?.slot, 27);
		assert.equal(right.doubleItems.find(i => i.name === "diamond")?.slot, 27);
		assert.equal(left.blockEntity, undefined);
		assert.equal("raw" in left, false);
	});

	it("asList handles arrays, value wrappers, and numeric-key maps", () => {
		assert.equal(asList([{ Name: "a" }]).length, 1);
		assert.equal(asList({ value: [{ Name: "a" }, { Name: "b" }] }).length, 2);
		assert.equal(asList({ 0: { Name: "dirt" }, 1: { Name: "stone" } }).length, 2);
		assert.equal(asList({ value: { 0: { Name: "x" } } }).length, 1);
	});

	it("normalizeItemStack reads nested Item and string Name", () => {
		const a = normalizeItemStack({
			Slot: 2,
			Name: "minecraft:diamond",
			Count: 16n
		});
		assert.equal(a.name, "diamond");
		assert.equal(a.count, 16);
		assert.equal(a.slot, 2);

		const b = normalizeItemStack({
			Slot: 0,
			Item: { Name: "minecraft:hopper", Count: 1 }
		});
		assert.equal(b.name, "hopper");
		assert.equal(b.slot, 0);

		// Numeric id alone is not a valid item name
		assert.equal(normalizeItemStack({ id: 3, Count: 1 }), null);
	});

	it("extracts hopper_minecart Items (array form)", () => {
		const items = extractInventoryItems({
			identifier: "minecraft:hopper_minecart",
			Items: [
				{ Slot: 0, Name: "minecraft:iron_ingot", Count: 32 },
				{ Slot: 3, Name: "minecraft:undyed_shulker_box", Count: 1 }
			]
		});
		assert.equal(items.length, 2);
		assert.equal(items[0].name, "iron_ingot");
		assert.equal(items[0].slot, 0);
		assert.equal(items[1].name, "undyed_shulker_box");
	});

	it("extracts chest_minecart Items (numeric-key map form)", () => {
		const items = extractInventoryItems({
			identifier: "minecraft:chest_minecart",
			Items: {
				0: { Slot: 0, Name: "minecraft:cobblestone", Count: 64 },
				5: { Slot: 5, name: "minecraft:chest", Count: 2 }
			}
		});
		assert.equal(items.length, 2);
		assert.equal(items[0].name, "cobblestone");
		assert.equal(items[1].slot, 5);
	});

	it("extracts nested Item wrapper stacks", () => {
		const items = extractInventoryItems({
			Items: [
				{ Slot: 1, Item: { Name: "minecraft:arrow", Count: 8 } }
			]
		});
		assert.equal(items.length, 1);
		assert.equal(items[0].name, "arrow");
		assert.equal(items[0].count, 8);
		assert.equal(items[0].slot, 1);
	});
});
