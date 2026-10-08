/**
 * Poly-mesh template faces → Three BufferGeometry (Z-flip, reversed winding).
 */

/**
 * @param {typeof import("three")} THREE
 * @param {any[]|null|undefined} faces
 * @returns {import("three").BufferGeometry|null}
 */
export function facesToBufferGeometry(THREE, faces) {
	if (!THREE || !faces?.length) return null;
	const ordered = faces.length > 1
		? [...faces].sort((a, b) => (a.transparency ?? 0) - (b.transparency ?? 0))
		: faces;
	let i = 0;
	const positions = [];
	const uvs = [];
	const indices = [];
	for (const face of ordered) {
		const verts = face.vertices;
		if (!Array.isArray(verts) || verts.length < 4) continue;
		for (const v of verts) {
			const pos = v?.pos ?? [0, 0, 0];
			const uv = v?.uv ?? [0, 0];
			positions.push(Number(pos[0]) || 0, Number(pos[1]) || 0, 16 - (Number(pos[2]) || 0));
			uvs.push(Number(uv[0]) || 0, 1 - (Number(uv[1]) || 0));
		}
		indices.push(i + 2, i + 1, i, i + 2, i, i + 3);
		i += verts.length;
	}
	if (!positions.length) return null;
	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
	geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
	geo.setIndex(indices);
	geo.computeVertexNormals();
	return geo;
}
