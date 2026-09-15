/**
 * Three-finger layer-tap band classification.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	LAYER_TAP_MIN_BAND,
	classifyLayerTap,
	layerBandPx,
	centroidOf,
	isLayerTapIgnoreTarget
} from "../../src/ui/layerTap.js";

const host = { top: 80, bottom: 880, height: 800 };

describe("layerBandPx", () => {
	it("uses 22% when that is larger than 96px", () => {
		assert.equal(layerBandPx(800), 800 * 0.22);
	});

	it("floors at 96px on a short host", () => {
		assert.equal(layerBandPx(200), LAYER_TAP_MIN_BAND);
	});
});

describe("classifyLayerTap", () => {
	it("returns null outside the host", () => {
		assert.equal(classifyLayerTap(0, host), null);
		assert.equal(classifyLayerTap(900, host), null);
		assert.equal(classifyLayerTap(400, null), null);
	});

	it("maps the top band to up", () => {
		assert.equal(classifyLayerTap(80, host), "up");
		assert.equal(classifyLayerTap(80 + layerBandPx(800), host), "up");
	});

	it("maps the bottom band to down", () => {
		assert.equal(classifyLayerTap(880, host), "down");
		assert.equal(classifyLayerTap(880 - layerBandPx(800), host), "down");
	});

	it("maps the middle to all layers", () => {
		assert.equal(classifyLayerTap(480, host), "all");
	});
});

describe("centroidOf", () => {
	it("averages points", () => {
		assert.deepEqual(
			centroidOf([
				{ x: 0, y: 0 },
				{ x: 30, y: 60 },
				{ x: 60, y: 0 }
			]),
			{ x: 30, y: 20 }
		);
	});

	it("returns null for an empty list", () => {
		assert.equal(centroidOf([]), null);
	});
});

describe("isLayerTapIgnoreTarget", () => {
	it("is false without a DOM Element", () => {
		assert.equal(isLayerTapIgnoreTarget(null), false);
		assert.equal(isLayerTapIgnoreTarget({}), false);
	});
});
