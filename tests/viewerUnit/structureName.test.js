/**
 * Structure file names must not become HTML.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileWithSafeStructureName, safeStructureFileName } from "../../src/viewer/ingest.js";
import { buildStructureCoordRow } from "../../src/pack/structureCoordRow.js";

function fakeElement(tag) {
	return {
		tagName: String(tag).toLowerCase(),
		children: [],
		attrs: {},
		htmlFor: "",
		id: "",
		className: "",
		textContent: "",
		value: "",
		type: "",
		setAttribute(key, value) {
			this.attrs[key] = String(value);
		},
		appendChild(child) {
			this.children.push(child);
			return child;
		},
		querySelectorAll(sel) {
			const want = String(sel).toLowerCase();
			const out = [];
			const walk = node => {
				for (const child of node.children ?? []) {
					if (child.tagName === want) out.push(child);
					walk(child);
				}
			};
			walk(this);
			return out;
		}
	};
}

function fakeDocument() {
	return {
		createElement(tag) {
			return fakeElement(tag);
		},
		createDocumentFragment() {
			return fakeElement("#fragment");
		},
		createTextNode(text) {
			return { tagName: "#text", text, children: [] };
		}
	};
}

describe("structure file names", () => {
	it("keeps a hostile name as text and creates no img element", () => {
		const file = new File(["x"], "<img src=x onerror=alert(1)>.mcstructure");
		const row = buildStructureCoordRow(file, [1, 2, 3], fakeDocument());
		const label = row.querySelectorAll("label")[0];
		assert.match(label.textContent, /<img src=x onerror=alert\(1\)>/);
		assert.equal(row.querySelectorAll("img").length, 0);
	});

	it("strips path segments and characters outside the safe set", () => {
		assert.equal(safeStructureFileName("a/../../x.mcstructure"), "x.mcstructure");
		const cleaned = safeStructureFileName("<img src=x onerror=alert(1)>.mcstructure");
		assert.equal(cleaned.includes("<"), false);
		assert.equal(cleaned.includes(">"), false);
		const file = fileWithSafeStructureName(new File(["abc"], "dir/<bad>.mcstructure"));
		assert.equal(file.name.includes("<"), false);
		assert.equal(file.size, 3);
		assert.equal(safeStructureFileName("城堡.mcstructure"), "城堡.mcstructure");
		assert.equal(safeStructureFileName("房子.mcstructure"), "房子.mcstructure");
		assert.notEqual(safeStructureFileName("城堡.mcstructure"), safeStructureFileName("房子.mcstructure"));
	});
});
