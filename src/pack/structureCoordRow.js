/**
 * Coordinate-lock row for one structure file. Names go in textContent.
 */

import { removeFileExtension } from "../utils/files.js";

/**
 * @param {Document} doc
 * @param {Record<string, string|number>} attrs
 */
function numberInput(doc, attrs) {
	const input = doc.createElement("input", { is: "resizing-input" });
	input.setAttribute("is", "resizing-input");
	input.type = "number";
	for (const [key, value] of Object.entries(attrs)) {
		if (key === "value") input.value = String(value);
		input.setAttribute(key, String(value));
	}
	return input;
}

/**
 * @param {File} file
 * @param {number[]} [pos]
 * @param {Document} [doc]
 * @returns {DocumentFragment}
 */
export function buildStructureCoordRow(file, pos = [0, 0, 0], doc = document) {
	const randomId = String(Math.random());
	const row = doc.createDocumentFragment();

	const label = doc.createElement("label");
	label.htmlFor = randomId;
	label.textContent = `${removeFileExtension(file.name)}:`;
	row.appendChild(label);

	const vec = doc.createElement("vec-3-input");
	vec.id = randomId;
	for (const slot of ["x", "y", "z"]) {
		const i = slot === "x" ? 0 : slot === "y" ? 1 : 2;
		vec.appendChild(numberInput(doc, {
			min: -10000000,
			max: 10000000,
			step: 1,
			value: pos[i] ?? 0,
			placeholder: 0,
			slot
		}));
	}
	row.appendChild(vec);

	const rotation = doc.createElement("label");
	const icon = doc.createElement("span");
	icon.className = "material-symbols";
	icon.textContent = "rotate_right";
	rotation.appendChild(icon);
	rotation.appendChild(doc.createTextNode(": "));
	rotation.appendChild(numberInput(doc, {
		min: -270,
		max: 270,
		step: 90,
		value: 0,
		placeholder: 0
	}));
	const degrees = doc.createElement("span");
	degrees.textContent = "°";
	rotation.appendChild(degrees);
	row.appendChild(rotation);
	return row;
}
