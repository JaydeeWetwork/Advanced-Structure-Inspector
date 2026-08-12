/**
 * Unified Three.js dispose policy for ASI preview systems.
 *
 * Ownership:
 *  - Shared geos (palette buffer geos) are never disposed here.
 *  - Shared maps (atlas, minecart atlas, item-frame icon cache) are never disposed here.
 *  - Shared materials (regular/transparent/floor) are never disposed here.
 *  - InstancedMesh.dispose() frees instance buffers without touching shared geo.
 */

/**
 * @typedef {object} DisposePolicy
 * @property {(geo: import("three").BufferGeometry) => boolean} [isSharedGeometry]
 * @property {(mat: import("three").Material) => boolean} [isSharedMaterial]
 * @property {(map: import("three").Texture) => boolean} [isSharedMap]
 * @property {boolean} [disposeGeometry=true]
 * @property {boolean} [disposeMaterials=true]
 */

/**
 * @param {import("three").Object3D|null|undefined} root
 * @param {DisposePolicy} [policy]
 */
export function disposeObject3D(root, policy = {}) {
	if (!root) return;
	const isSharedGeometry = policy.isSharedGeometry ?? (() => false);
	const isSharedMaterial = policy.isSharedMaterial ?? (() => false);
	const isSharedMap = policy.isSharedMap ?? (() => false);
	const disposeGeometry = policy.disposeGeometry !== false;
	const disposeMaterials = policy.disposeMaterials !== false;

	root.traverse(obj => {
		// InstancedMesh: free instance matrix buffer; keep shared palette geometry
		if (obj.isInstancedMesh && typeof obj.dispose === "function") {
			try {
				// Three.js InstancedMesh.dispose disposes geometry too in some versions —
				// detach shared geo first so palette cache stays valid.
				const sharedGeo = obj.geometry && isSharedGeometry(obj.geometry);
				if (sharedGeo) {
					const geo = obj.geometry;
					obj.geometry = null;
					try {
						obj.dispose();
					} catch {
						/* ignore */
					}
					obj.geometry = geo;
				} else {
					obj.dispose();
				}
			} catch {
				/* ignore */
			}
		}

		if (disposeGeometry && obj.geometry && !isSharedGeometry(obj.geometry)) {
			try {
				obj.geometry.dispose?.();
			} catch {
				/* ignore */
			}
		}

		if (!disposeMaterials || !obj.material) return;
		const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
		for (const m of mats) {
			if (!m || isSharedMaterial(m)) continue;
			// Detach shared maps before disposing material so caches stay valid
			if (m.map && isSharedMap(m.map)) {
				m.map = null;
			} else if (m.map && !isSharedMap(m.map)) {
				try {
					m.map.dispose?.();
				} catch {
					/* ignore */
				}
			}
			try {
				m.dispose?.();
			} catch {
				/* ignore */
			}
		}
	});
}

/**
 * Remove children from a group and dispose them with policy.
 * @param {import("three").Object3D|null|undefined} parent
 * @param {DisposePolicy} [policy]
 */
export function clearChildren(parent, policy) {
	if (!parent) return;
	const kids = [...parent.children];
	for (const child of kids) {
		parent.remove(child);
		disposeObject3D(child, policy);
	}
}
