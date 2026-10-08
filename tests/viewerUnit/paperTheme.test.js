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

function readViewerCss() {
	const dir = join(root, "src/viewer");
	const entry = readFileSync(join(dir, "viewer.css"), "utf8");
	return entry.replace(/@import\s+["']([^"']+)["'];/g, (_, rel) => readFileSync(join(dir, rel), "utf8"));
}

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

describe("paper theme", async () => {
	const { getSavedTheme, resolvedTheme } = await import("../../src/app/theme.js");

	it("treats missing localStorage as follow-OS", () => {
		assert.equal(getSavedTheme(), null);
		assert.ok(resolvedTheme() === "light" || resolvedTheme() === "dark");
	});

	it("catalog dock peeks on desktop after a structure is selected", () => {
		const html = readFileSync(join(root, "src/index.html"), "utf8");
		assert.match(html, /id="catalogFloat"[^>]*data-visibility="peek"/);
		const css = readViewerCss();
		assert.match(css, /body\.bLayers-no-selection \.bLayers-float-left/);
		assert.match(css, /translateX\(0\)/);
		assert.match(css, /\.bLayers-float-left\.bLayers-float-pinned/);
		const life = readFileSync(join(root, "src/app/previewLifecycle.js"), "utf8");
		assert.match(life, /peekFloatDock\(els\.catalogFloat\)/);
		assert.match(life, /catalogFloat\?\.contains\(ae\)/);
		const docks = readFileSync(join(root, "src/ui/docks.js"), "utf8");
		assert.match(docks, /if \(!pins\.catalog\) peekFloatDock/);
		assert.match(docks, /if \(isFloatPinned\(el\)\) return;/);
		assert.match(docks, /peekFloatDock\(el\)/);
		const persist = readFileSync(join(root, "src/viewer/catalogPersist.js"), "utf8");
		assert.match(persist, /if \(ctx\.isStale\?\.\(\)\) return 0;/);
		const cat = readFileSync(join(root, "src/viewer/catalog.js"), "utf8");
		assert.match(cat, /from "\.\/cameraPrefs\.js"/);
		assert.doesNotMatch(cat, /systems\/isoCamera/);
		const cargo = readFileSync(join(root, "src/viewer/entityCargo.js"), "utf8");
		assert.match(cargo, /polyMeshBufferGeo/);
	});

	it("paper stylesheet overlays peek docks, not magenta chrome", () => {
		const paper = readFileSync(join(root, "src/styles/paper.css"), "utf8");
		assert.match(paper, /--bLayers-float-peek/);
		assert.doesNotMatch(paper, /grid-template-areas:\s*"nav preview detail"/);
		assert.doesNotMatch(paper, /#D899D8|#C57CC5|#D38AD3/);
		const html = readFileSync(join(root, "src/index.html"), "utf8");
		assert.match(html, /themeBtn/);
		assert.match(html, /styles\/paper\.css/);
		assert.doesNotMatch(html, /Hover left edge/);
	});

	it("compass yaw maps look direction to Minecraft north=-Z", async () => {
		const { facingFromLookDir } = await import("../../src/ui/cameraCompass.js");
		assert.equal(facingFromLookDir(0, 0, -1).cardinal, "N");
		assert.equal(facingFromLookDir(1, 0, 0).cardinal, "E");
		assert.equal(facingFromLookDir(0, 0, 1).cardinal, "S");
		assert.equal(facingFromLookDir(-1, 0, 0).cardinal, "W");
		assert.equal(facingFromLookDir(0, -1, 0).cardinal, "Top");
		assert.ok(Math.abs(facingFromLookDir(0, 0, -1).yaw) < 1);
		assert.ok(Math.abs(facingFromLookDir(1, 0, 0).yaw - 90) < 1);
	});

	it("camera bar pops up from the bottom on hover or C", () => {
		const html = readFileSync(join(root, "src/index.html"), "utf8");
		assert.match(html, /id="camDock"/);
		assert.match(html, /id="camCompass"/);
		assert.match(html, /bLayers-cam-hit/);
		assert.match(html, /bLayers-cam-slide/);
		const css = readViewerCss();
		assert.match(css, /\.bLayers-cam-slide/);
		assert.match(css, /translateY\(calc\(100% \+ 8px\)\)/);
		assert.match(css, /\.bLayers-cam-dock:hover \.bLayers-cam-slide/);
		const keys = readFileSync(join(root, "src/ui/previewChrome.js"), "utf8");
		const cam = readFileSync(join(root, "src/ui/cameraBar.js"), "utf8");
		assert.match(cam, /toggleCamDock/);
		assert.match(keys, /e\.key === "c"/);
	});

	it("details dock scrolls as one column instead of clipping", () => {
		const html = readFileSync(join(root, "src/index.html"), "utf8");
		assert.match(html, /id="detailScroll"/);
		const css = readViewerCss();
		assert.match(css, /\.bLayers-detail-scroll/);
		assert.match(css, /overscroll-behavior:\s*contain/);
	});

	it("details dock camera selector includes a default zoom slider", async () => {
		const html = readFileSync(join(root, "src/index.html"), "utf8");
		assert.match(html, /id="defaultCamSelect"/);
		assert.match(html, /id="defaultZoom"/);
		assert.match(html, /id="defaultZoomVal"/);
		const css = readViewerCss();
		assert.match(css, /\.bLayers-default-zoom/);
		const { normalizeCameraZoom } = await import("../../src/viewer/cameraPrefs.js");
		const { stepSelectIndex, stepRangeValue } = await import("../../src/ui/cameraBar.js");
		assert.equal(normalizeCameraZoom(undefined), 1);
		assert.equal(normalizeCameraZoom(1.5), 1.5);
		assert.equal(normalizeCameraZoom(3), 2);
		assert.equal(normalizeCameraZoom(0), 0.5);
		assert.equal(stepSelectIndex(0, 12, 100), 1);
		assert.equal(stepSelectIndex(0, 12, -100), 0);
		assert.equal(stepSelectIndex(11, 12, 100), 11);
		assert.equal(stepRangeValue(100, 50, 200, 5, -80), 105);
		assert.equal(stepRangeValue(100, 50, 200, 5, 80), 95);
		assert.equal(stepRangeValue(50, 50, 200, 5, 80), 50);
		assert.equal(stepRangeValue(200, 50, 200, 5, -80), 200);
	});

	it("details dock uses structure name, Information, Materials, and feature picker", () => {
		const html = readFileSync(join(root, "src/index.html"), "utf8");
		assert.match(html, /id="detailFloatTitle"/);
		assert.match(html, />Information</);
		assert.match(html, />Materials</);
		assert.doesNotMatch(html, />Materials List</);
		assert.doesNotMatch(html, />Info</);
		assert.match(html, /id="detailAddFeatureBtn"/);
		assert.match(html, />\+ Add feature</);
		assert.match(html, /id="featureDialog"/);
		const css = readViewerCss();
		assert.match(css, /\.bLayers-feat-dialog\[open\]/);
		assert.match(css, /white-space:\s*normal/);
		const actionsAt = html.indexOf('class="bLayers-detail-actions"');
		const materialsAt = html.indexOf('id="materialsSection"');
		assert.ok(materialsAt > 0 && actionsAt > materialsAt, "Reload/Download/Remove should sit below Materials");
		const statsAt = html.indexOf('id="detailStats"');
		const hopperAt = html.indexOf('id="hopperStatsChip"');
		const headerBarAt = html.indexOf('id="selectionBar"');
		assert.ok(statsAt > 0 && hopperAt > statsAt, "Hopper lock chip should sit below entity stats");
		assert.ok(headerBarAt > 0 && hopperAt > headerBarAt, "Hopper lock chip should not live in the title bar");
		assert.doesNotMatch(html.slice(headerBarAt, headerBarAt + 500), /hopperStatsChip/);
	});

	it("editor feature cards do not shrink and wrap label text", () => {
		const css = readFileSync(join(root, "src/styles/editor.css"), "utf8");
		assert.match(css, /\.bLayers-ed-feat-card\s*\{[^}]*flex:\s*0 0 auto/s);
		assert.match(css, /\.bLayers-ed-feat-card\s*\{[^}]*min-height:\s*min-content/s);
		assert.match(css, /\.bLayers-ed-feat-main\s*\{[^}]*white-space:\s*normal/s);
		assert.match(css, /\.bLayers-ed-feat-name\s*\{[^}]*overflow-wrap:\s*anywhere/s);
	});
});
