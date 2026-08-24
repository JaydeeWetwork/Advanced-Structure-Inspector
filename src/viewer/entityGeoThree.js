/**
 * Bedrock entity geo JSON → Three.js mesh (official Mojang models).
 * Box-UV matches BlockGeoMaker entity cubes. Fetches via ResourcePackStack
 * (Mojang/bedrock-samples). FrontSide + per-face normals (no DoubleSide) so
 * overlapping cart walls don't z-fight — same idea as prismarine-viewer Entity.js.
 */

import {
	VANILLA_ENTITY_MODELS,
	flattenEntityCubes,
	pickGeometry,
	boxUvLayout,
	transformEntityPoint
} from "./entityModels.js";
import {
	VANILLA_SAMPLES_TAG,
	VANILLA_SAMPLES_FALLBACK_TAGS
} from "../data/packPins.js";

async function readPackJson(res) {
	const text = await res.text();
	try {
		return JSON.parse(text);
	} catch {
		const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
		return JSON.parse(stripped);
	}
}

/**
 * @param {any} cubeUv  [u,v] box origin or per-face object
 * @param {[number, number, number]} size
 * @returns {ReturnType<typeof boxUvLayout>}
 */
export function resolveCubeUvFaces(cubeUv, size) {
	const layout = boxUvLayout(size, true);
	if (Array.isArray(cubeUv) && cubeUv.length >= 2) {
		const ou = Number(cubeUv[0]) || 0;
		const ov = Number(cubeUv[1]) || 0;
		for (const face of Object.values(layout)) {
			face.uv = [face.uv[0] + ou, face.uv[1] + ov];
		}
		return layout;
	}
	if (cubeUv && typeof cubeUv === "object") {
		for (const name of Object.keys(layout)) {
			const spec = cubeUv[name];
			if (spec && typeof spec === "object" && Array.isArray(spec.uv)) {
				layout[name] = {
					uv: [Number(spec.uv[0]) || 0, Number(spec.uv[1]) || 0],
					uv_size: Array.isArray(spec.uv_size)
						? spec.uv_size
						: layout[name].uv_size
				};
			}
		}
	}
	return layout;
}

/**
 * Pixel rect → 0–1 UVs. Three.js flipY: Minecraft v=0 is top of PNG.
 * @returns {[[number, number], [number, number], [number, number], [number, number]]}
 */
export function pixelUvQuad(u, v, uw, vh, texW, texH) {
	const tw = texW || 64;
	const th = texH || 32;
	const u0 = u / tw;
	const u1 = (u + uw) / tw;
	const v0 = 1 - (v + vh) / th;
	const v1 = 1 - v / th;
	return [
		[u0, v0],
		[u1, v0],
		[u1, v1],
		[u0, v1]
	];
}

/**
 * @param {typeof import("three")} THREE
 * @param {any} geoBlock
 * @param {import("three").Texture} texture
 */
export function createGeometryMesh(THREE, geoBlock, texture) {
	const texW = Number(geoBlock?.description?.texture_width) || 64;
	const texH = Number(geoBlock?.description?.texture_height) || 32;
	const cubes = flattenEntityCubes(geoBlock);
	const positions = [];
	const normals = [];
	const uvs = [];
	const indices = [];
	let base = 0;

	const pushQuad = (p0, p1, p2, p3, quadUv) => {
		const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
		const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
		let nx = ay * bz - az * by;
		let ny = az * bx - ax * bz;
		let nz = ax * by - ay * bx;
		const nl = Math.hypot(nx, ny, nz);
		if (nl < 1e-8) return;
		nx /= nl;
		ny /= nl;
		nz /= nl;
		for (const p of [p0, p1, p2, p3]) {
			positions.push(p[0], p[1], p[2]);
			normals.push(nx, ny, nz);
		}
		for (const uv of quadUv) uvs.push(uv[0], uv[1]);
		indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
		base += 4;
	};

	for (const cube of cubes) {
		const [x, y, z] = cube.origin;
		const [w, h, d] = cube.size;
		if (!(w > 0 && h > 0 && d > 0)) continue;
		const xf = p => transformEntityPoint(p, cube);
		const c000 = xf([x, y, z]);
		const c100 = xf([x + w, y, z]);
		const c010 = xf([x, y + h, z]);
		const c110 = xf([x + w, y + h, z]);
		const c001 = xf([x, y, z + d]);
		const c101 = xf([x + w, y, z + d]);
		const c011 = xf([x, y + h, z + d]);
		const c111 = xf([x + w, y + h, z + d]);
		const faces = resolveCubeUvFaces(cube.uv, cube.size);
		const q = (face) =>
			pixelUvQuad(face.uv[0], face.uv[1], face.uv_size[0], face.uv_size[1], texW, texH);
		const maybeQuad = (p0, p1, p2, p3, face) => {
			if (!face) return;
			const uw = Number(face.uv_size?.[0]) || 0;
			const vh = Number(face.uv_size?.[1]) || 0;
			if (uw === 0 || vh === 0) return;
			pushQuad(p0, p1, p2, p3, q(face));
		};
		// west -X, east +X, down -Y, up +Y, north -Z, south +Z
		maybeQuad(c000, c001, c011, c010, faces.west);
		maybeQuad(c100, c110, c111, c101, faces.east);
		maybeQuad(c000, c100, c101, c001, faces.down);
		maybeQuad(c010, c011, c111, c110, faces.up);
		maybeQuad(c000, c010, c110, c100, faces.north);
		maybeQuad(c001, c101, c111, c011, faces.south);
	}

	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
	geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
	geo.setIndex(indices);
	// Keep per-face normals (prismarine-viewer Entity.js). computeVertexNormals
	// would average box corners and flicker lighting on overlapping cart walls.

	const mat = new THREE.MeshLambertMaterial({
		map: texture || null,
		color: texture ? 0xffffff : 0x6a6e75,
		transparent: !!texture,
		alphaTest: texture ? 0.1 : 0,
		side: THREE.FrontSide,
		depthWrite: true
	});
	const mesh = new THREE.Mesh(geo, mat);
	mesh.name = geoBlock?.description?.identifier || "entity-geo";
	mesh.frustumCulled = false;
	return mesh;
}

/**
 * @param {import("../ResourcePackStack.js").default} rps
 * @param {string} pathNoExt
 * @returns {Promise<Blob|null>}
 */
export async function fetchVanillaTextureBlob(rps, pathNoExt) {
	for (const ext of [".png", ".tga"]) {
		if (rps?.fetchResource) {
			try {
				const res = await rps.fetchResource(pathNoExt + ext);
				if (res?.ok) {
					const blob = await res.blob();
					if (blob && blob.size > 8) return blob;
				}
			} catch {
				/* try CDN tags */
			}
		}
		for (const tag of [VANILLA_SAMPLES_TAG, ...VANILLA_SAMPLES_FALLBACK_TAGS]) {
			try {
				const url = `https://cdn.jsdelivr.net/gh/Mojang/bedrock-samples@${tag}/resource_pack/${pathNoExt}${ext}`;
				const res = await fetch(url);
				if (!res.ok) continue;
				const blob = await res.blob();
				if (blob && blob.size > 8) return blob;
			} catch {
				/* next tag */
			}
		}
	}
	return null;
}

/**
 * @param {typeof import("three")} THREE
 * @param {Blob} blob
 */
export async function blobToThreeTexture(THREE, blob) {
	const url = URL.createObjectURL(blob);
	try {
		const tex = await new Promise((resolve, reject) => {
			new THREE.TextureLoader().load(url, resolve, undefined, reject);
		});
		tex.colorSpace = THREE.SRGBColorSpace;
		tex.magFilter = THREE.NearestFilter;
		tex.minFilter = THREE.NearestFilter;
		tex.generateMipmaps = false;
		return tex;
	} finally {
		URL.revokeObjectURL(url);
	}
}

/**
 * Load official hull kit for all registered minecart kinds.
 * Shared geo/texture: cargo kinds clone the same hull.
 *
 * @param {typeof import("three")} THREE
 * @param {import("../ResourcePackStack.js").default} rps
 * @returns {Promise<Map<string, { template: import("three").Object3D, texture: import("three").Texture, cargo: string }>>}
 */
export async function loadVanillaEntityKit(THREE, rps) {
	/** @type {Map<string, { template: import("three").Object3D, texture: import("three").Texture, cargo: string }>} */
	const kit = new Map();
	if (!rps || !THREE) return kit;

	/** @type {Map<string, Promise<any>>} */
	const geoCache = new Map();
	/** @type {Map<string, Promise<import("three").Texture|null>>} */
	const texCache = new Map();

	const loadGeo = (path) => {
		if (!geoCache.has(path)) {
			geoCache.set(path, rps.fetchResource(path).then(async res => {
				if (!res?.ok) throw new Error(`geo ${path} ${res?.status}`);
				return readPackJson(res);
			}));
		}
		return geoCache.get(path);
	};
	const loadTex = (path) => {
		if (!texCache.has(path)) {
			texCache.set(path, (async () => {
				const blob = await fetchVanillaTextureBlob(rps, path);
				if (!blob) return null;
				return blobToThreeTexture(THREE, blob);
			})());
		}
		return texCache.get(path);
	};

	/** @type {Map<string, import("three").Mesh>} */
	const hullByKey = new Map();

	for (const [kind, def] of Object.entries(VANILLA_ENTITY_MODELS)) {
		try {
			let wantedIds = def.geoIds;
			try {
				const entRes = await rps.fetchResource(def.entityFile);
				if (entRes?.ok) {
					const entJson = await readPackJson(entRes);
					const desc = entJson?.["minecraft:client_entity"]?.description;
					const gid = desc?.geometry?.default;
					if (typeof gid === "string") {
						wantedIds = [gid, ...def.geoIds];
					}
				}
			} catch {
				/* table paths are enough */
			}

			const geoFile = await loadGeo(def.geoFile);
			const geoBlock = pickGeometry(geoFile, wantedIds);
			if (!geoBlock) continue;
			const texture = await loadTex(def.texture);
			if (!texture) {
				console.warn("[basi] minecart PNG missing for", kind, "— still meshing untextured hull");
			}

			const hullKey = `${def.geoFile}|${geoBlock.description?.identifier}|${def.texture}`;
			let hull = hullByKey.get(hullKey);
			if (!hull) {
				hull = createGeometryMesh(THREE, geoBlock, texture);
				hullByKey.set(hullKey, hull);
			}

			const template = new THREE.Group();
			template.name = `vanilla:${kind}`;
			const hullInst = new THREE.Mesh(hull.geometry, hull.material);
			hullInst.name = hull.name;
			hullInst.frustumCulled = false;
			template.add(hullInst);
			kit.set(kind, { template, texture, cargo: def.cargo });
		} catch (e) {
			console.warn("[basi] vanilla entity kit failed:", kind, e);
		}
	}
	return kit;
}

