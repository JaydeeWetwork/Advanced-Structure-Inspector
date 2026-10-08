/**
 * Palette CSR of structure cells.
 * `off[p]` is the first (x,y,z) triple of palette p. `off[slotCount]` is the triple count.
 * `xyz` length is that count times 3. A y-major fill keeps equal-y cells contiguous per palette.
 */

/**
 * @param {Int32Array} counts
 */
export function prefixOffsets(counts) {
	const off = new Int32Array(counts.length + 1);
	let total = 0;
	for (let i = 0; i < counts.length; i++) {
		off[i] = total;
		total += counts[i];
	}
	off[counts.length] = total;
	return { off, cursor: off.slice(), total };
}

/**
 * @param {{ off?: Int32Array }|null|undefined} csr
 * @param {number} paletteI
 * @returns {[number, number]}
 */
export function csrRange(csr, paletteI) {
	if (!csr?.off || paletteI < 0 || paletteI + 1 >= csr.off.length) return [0, 0];
	return [csr.off[paletteI], csr.off[paletteI + 1]];
}

/**
 * @param {{ off?: Int32Array }|null|undefined} csr
 * @param {number} paletteI
 */
export function csrCount(csr, paletteI) {
	const [start, end] = csrRange(csr, paletteI);
	return end - start;
}

/**
 * @param {{ off?: Int32Array, xyz?: Int32Array }} csr
 */
export function csrTotal(csr) {
	if (!csr?.off?.length) return 0;
	return csr.off[csr.off.length - 1];
}

/**
 * Materialize one palette for tests. Mesh code reads `xyz` directly.
 * @param {{ off?: Int32Array, xyz?: Int32Array }} csr
 * @param {number} paletteI
 * @returns {[number, number, number][]}
 */
export function csrTriples(csr, paletteI) {
	const [start, end] = csrRange(csr, paletteI);
	/** @type {[number, number, number][]} */
	const out = [];
	const xyz = csr?.xyz;
	if (!xyz) return out;
	for (let i = start; i < end; i++) {
		const o = i * 3;
		out.push([xyz[o], xyz[o + 1], xyz[o + 2]]);
	}
	return out;
}

/**
 * @param {Array<[number, number, number][]|null|undefined>} lists
 */
export function csrFromLists(lists) {
	const counts = new Int32Array(lists.length);
	for (let i = 0; i < lists.length; i++) counts[i] = lists[i]?.length ?? 0;
	const { off, cursor, total } = prefixOffsets(counts);
	const xyz = new Int32Array(total * 3);
	for (let p = 0; p < lists.length; p++) {
		for (const triple of lists[p] ?? []) {
			const o = cursor[p]++ * 3;
			xyz[o] = triple[0];
			xyz[o + 1] = triple[1];
			xyz[o + 2] = triple[2];
		}
	}
	return { off, xyz };
}

/**
 * Y-major runs inside one palette. `fn` receives the triple range `[start, end)`.
 * @param {{ off?: Int32Array, xyz?: Int32Array }|null|undefined} csr
 * @param {number} paletteI
 * @param {(y: number, tripleStart: number, tripleEnd: number) => void} fn
 */
export function forEachYRun(csr, paletteI, fn) {
	const [start, end] = csrRange(csr, paletteI);
	const xyz = csr?.xyz;
	if (!xyz || start === end) return;
	let i = start;
	while (i < end) {
		const y = xyz[i * 3 + 1];
		let j = i + 1;
		while (j < end && xyz[j * 3 + 1] === y) j++;
		fn(y, i, j);
		i = j;
	}
}
