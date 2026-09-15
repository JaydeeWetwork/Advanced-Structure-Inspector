/**
 * Edge-swipe classification for iPad chrome (catalog / details / camera).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	EDGE_BAND,
	TAP_MAX_PX,
	edgeBandAt,
	classifyOpenSwipe,
	classifyCloseSwipe,
	isSwipeIgnoreTarget,
	closeSwipeTarget
} from "../../src/ui/edgeSwipe.js";

const stage = { left: 0, top: 80, right: 1024, bottom: 800 };

describe("TAP_MAX_PX", () => {
	it("allows more slop than axis lock so an iPad tap still hides chrome", () => {
		assert.equal(TAP_MAX_PX >= 24, true);
	});
});

describe("edgeBandAt", () => {
	it("returns null in the canvas center", () => {
		assert.equal(edgeBandAt(512, 400, stage), null);
	});

	it("returns left in the left band", () => {
		assert.equal(edgeBandAt(20, 400, stage), "left");
		assert.equal(edgeBandAt(EDGE_BAND.left, 400, stage), "left");
	});

	it("returns right in the right band", () => {
		assert.equal(edgeBandAt(1024 - 10, 400, stage), "right");
	});

	it("returns bottom in the bottom band", () => {
		assert.equal(edgeBandAt(512, 800 - 10, stage), "bottom");
	});

	it("prefers the closer edge in a corner", () => {
		assert.equal(edgeBandAt(8, 800 - 8, stage), "left");
		assert.equal(edgeBandAt(40, 800 - 8, stage), "bottom");
	});

	it("returns null outside the stage", () => {
		assert.equal(edgeBandAt(-1, 400, stage), null);
		assert.equal(edgeBandAt(512, 0, stage), null);
	});
});

describe("classifyOpenSwipe", () => {
	it("stays pending until axis lock", () => {
		assert.equal(classifyOpenSwipe("left", 8, 0), "pending");
		assert.equal(classifyOpenSwipe("bottom", 0, -8), "pending");
	});

	it("opens catalog on rightward swipe from the left band", () => {
		assert.equal(classifyOpenSwipe("left", 40, 4), "catalog");
		assert.equal(classifyOpenSwipe("left", 80, 10), "catalog");
	});

	it("opens details on leftward swipe from the right band", () => {
		assert.equal(classifyOpenSwipe("right", -40, 2), "detail");
	});

	it("opens camera on upward swipe from the bottom band", () => {
		assert.equal(classifyOpenSwipe("bottom", 2, -40), "cam");
	});

	it("cancels when the axis is wrong", () => {
		assert.equal(classifyOpenSwipe("left", -40, 0), null);
		assert.equal(classifyOpenSwipe("left", 8, 40), null);
		assert.equal(classifyOpenSwipe("right", 40, 0), null);
		assert.equal(classifyOpenSwipe("bottom", 40, -8), null);
		assert.equal(classifyOpenSwipe("bottom", 0, 40), null);
	});

	it("stays pending until swipe min after axis lock", () => {
		assert.equal(classifyOpenSwipe("left", 20, 2), "pending");
		assert.equal(classifyOpenSwipe("bottom", 1, -20), "pending");
	});
});

describe("classifyCloseSwipe", () => {
	it("closes catalog on leftward swipe", () => {
		assert.equal(classifyCloseSwipe("catalog", -40, 3), "close");
		assert.equal(classifyCloseSwipe("catalog", 40, 0), null);
		assert.equal(classifyCloseSwipe("catalog", 0, 40), null);
	});

	it("closes details on rightward swipe", () => {
		assert.equal(classifyCloseSwipe("detail", 40, 0), "close");
		assert.equal(classifyCloseSwipe("detail", -40, 0), null);
	});

	it("closes camera on downward swipe", () => {
		assert.equal(classifyCloseSwipe("cam", 2, 40), "close");
		assert.equal(classifyCloseSwipe("cam", 0, -40), null);
		assert.equal(classifyCloseSwipe("cam", 40, 8), null);
	});
});

describe("swipe DOM helpers", () => {
	it("isSwipeIgnoreTarget is false without a DOM Element", () => {
		assert.equal(isSwipeIgnoreTarget(null), false);
		assert.equal(isSwipeIgnoreTarget({}), false);
	});

	it("closeSwipeTarget is null without a DOM Element", () => {
		assert.equal(closeSwipeTarget(null, false), null);
	});
});
