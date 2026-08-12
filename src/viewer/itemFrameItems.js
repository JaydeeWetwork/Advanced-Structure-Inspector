/**
 * Item icons displayed inside Bedrock item frames / glow item frames.
 *
 * Frames are blocks (minecraft:frame / glow_frame) with block entities
 * ItemFrame / GlowItemFrame holding Item { Name, Count, Damage } and ItemRotation.
 */

import { structurePosToThree } from "./entityMeshes.js";
import { getItemIconUrl } from "./itemIconLoader.js?v=judo17";

/**
 * @typedef {object} ItemFramePlacement
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {string} itemName  bare id without minecraft:
 * @property {number} facing    Bedrock facing_direction 0–5
 * @property {number} itemRotationDeg  ItemRotation (0, 45, …)
 * @property {boolean} glow
 */

/**
 * Collect filled item frames from an inspect index.
 * @param {import("./inspectStructure.js").InspectIndex|null|undefined} inspectIndex
 * @returns {ItemFramePlacement[]}
 */
export function extractItemFramePlacements(inspectIndex) {
	/** @type {ItemFramePlacement[]} */
	const out = [];
	if (!inspectIndex?.blocks) return out;

	for (const b of inspectIndex.blocks.values()) {
		const name = String(b.name || "").replace(/^minecraft:/i, "").toLowerCase();
		const beId = String(b.blockEntityId || "").replace(/^minecraft:/i, "");
		const isFrame =
			name === "frame"
			|| name === "glow_frame"
			|| name === "item_frame"
			|| name === "glow_item_frame"
			|| beId === "ItemFrame"
			|| beId === "GlowItemFrame";
		if (!isFrame) continue;

		// Prefer Item from block entity NBT
		const be = b.blockEntity || {};
		const itemNbt = be.Item || be.item || null;
		let itemName = null;
		if (itemNbt && typeof itemNbt === "object") {
			const n = itemNbt.Name ?? itemNbt.name ?? itemNbt.id;
			if (typeof n === "string" && n) itemName = n.replace(/^minecraft:/i, "");
		}
		// Fallback to extracted items list
		if (!itemName && Array.isArray(b.items) && b.items[0]?.name) {
			itemName = String(b.items[0].name).replace(/^minecraft:/i, "");
		}
		if (!itemName) continue;

		const facing = Number(
			b.states?.facing_direction
			?? be.Facing
			?? be.facing
			?? 2
		);
		const itemRotationDeg = Number(be.ItemRotation ?? be.itemRotation ?? 0) || 0;
		const glow =
			name.includes("glow")
			|| beId === "GlowItemFrame";

		out.push({
			x: b.x,
			y: b.y,
			z: b.z,
			itemName,
			facing: Number.isFinite(facing) ? facing : 2,
			itemRotationDeg,
			glow
		});
	}
	return out;
}

/**
 * Bedrock item_frame facing_direction → Euler degrees [x,y,z], same as
 * blockStateDefinitions.json "item_frame.facing_direction".
 * Default geo has the plate on local +Z (near z=15.5 in 0–16 block space).
 * @param {number} facing 0=down 1=up 2=north 3=south 4=west 5=east
 * @returns {[number, number, number]}
 */
export function frameFacingEulerDeg(facing) {
	switch (facing) {
		case 0: return [90, 0, 0]; // down
		case 1: return [-90, 0, 0]; // up
		case 2: return [0, 0, 0]; // north (default geo)
		case 3: return [0, 180, 0]; // south
		case 4: return [0, -90, 0]; // west
		case 5: return [0, 90, 0]; // east
		default: return [0, 0, 0];
	}
}

/**
 * Rotate a point around block center with BlockGeoMaker.#applyEulerRotation
 * (X-Y-Z order, each axis using the *negated* blockStateDefs angle).
 *
 * Plain Three.js Euler(rx,ry,rz) matches wall Y facings but flips up/down:
 * icons then sit ~1 block on the wrong side of floor/ceiling frames.
 *
 * @param {[number, number, number]} pos
 * @param {[number, number, number]} rotationDeg [rx, ry, rz] from blockStateDefs
 * @param {[number, number, number]} [pivot=[8,8,8]]
 * @returns {[number, number, number]}
 */
export function applyBlockGeoEuler(pos, rotationDeg, pivot = [8, 8, 8]) {
	const deg = Math.PI / 180;
	let x = pos[0] - pivot[0];
	let y = pos[1] - pivot[1];
	let z = pos[2] - pivot[2];
	const [rx, ry, rz] = rotationDeg;
	// X: rotate (y,z) by -rx
	{
		const a = -rx * deg;
		const c = Math.cos(a), s = Math.sin(a);
		const ny = y * c - z * s;
		const nz = y * s + z * c;
		y = ny;
		z = nz;
	}
	// Y: rotate (x,z) by -ry
	{
		const a = -ry * deg;
		const c = Math.cos(a), s = Math.sin(a);
		const nx = x * c - z * s;
		const nz = x * s + z * c;
		x = nx;
		z = nz;
	}
	// Z: rotate (x,y) by -rz
	{
		const a = -rz * deg;
		const c = Math.cos(a), s = Math.sin(a);
		const nx = x * c - y * s;
		const ny = x * s + y * c;
		x = nx;
		y = ny;
	}
	return [x + pivot[0], y + pivot[1], z + pivot[2]];
}

/**
 * Convert blockStateDefs euler into a Three.js Euler matching BlockGeoMaker.
 * @param {number} rx
 * @param {number} ry
 * @param {number} rz
 * @param {typeof import("three")} THREE
 * @returns {import("three").Euler}
 */
export function blockGeoEulerToThree(rx, ry, rz, THREE) {
	// BlockGeoMaker X: rotate(y,z) by -rx  ≡  Three.js Rx(-rx)
	// BlockGeoMaker Y: rotate(x,z) by -ry  ≡  Three.js Ry(+ry)
	// BlockGeoMaker Z: rotate(x,y) by -rz  ≡  Three.js Rz(-rz)
	return new THREE.Euler(
		-rx * (Math.PI / 180),
		ry * (Math.PI / 180),
		-rz * (Math.PI / 180),
		"XYZ"
	);
}

/**
 * Plate center in 0–16 geo space after facing rotation (BlockGeoMaker-compatible).
 * @param {number} facing
 * @param {number} [geoZ=15.35] plate Z before rotation (room-side of plate)
 * @returns {[number, number, number]}
 */
export function framePlateLocalGeo(facing, geoZ = 15.5 - 0.15) {
	return applyBlockGeoEuler([8, 8, geoZ], frameFacingEulerDeg(facing));
}

/**
 * Outward normal of the frame plate in geo space (local +Z after BlockGeoMaker rotation).
 * @param {number} facing
 * @returns {[number, number, number]}
 */
export function frameOutwardNormal(facing) {
	// Match BlockGeoMaker: apply -rx on (y,z), -ry on (x,z)
	const [rx, ry] = frameFacingEulerDeg(facing);
	const deg = Math.PI / 180;
	let x = 0, y = 0, z = 1;
	// X: rotate (y,z) by -rx
	{
		const a = -rx * deg;
		const c = Math.cos(a), s = Math.sin(a);
		const ny = y * c - z * s;
		const nz = y * s + z * c;
		y = ny;
		z = nz;
	}
	// Y: rotate (x,z) by -ry
	{
		const a = -ry * deg;
		const c = Math.cos(a), s = Math.sin(a);
		const nx = x * c - z * s;
		const nz = x * s + z * c;
		x = nx;
		z = nz;
	}
	const len = Math.hypot(x, y, z) || 1;
	return [x / len, y / len, z / len];
}

/**
 * Load a nearest-neighbor item texture via the inventory icon pipeline.
 * @param {typeof import("three")} THREE
 * @param {string} itemName
 * @returns {Promise<import("three").Texture|null>}
 */
export async function loadItemTexture(THREE, itemName) {
	try {
		const url = await getItemIconUrl(itemName);
		if (!url) return null;
		const texture = await new Promise((resolve, reject) => {
			new THREE.TextureLoader().load(url, resolve, undefined, reject);
		});
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.magFilter = THREE.NearestFilter;
		texture.minFilter = THREE.NearestFilter;
		texture.generateMipmaps = false;
		return texture;
	} catch (e) {
		console.warn("[sdb] item frame texture failed:", itemName, e);
		return null;
	}
}

/**
 * Create a textured plane for the item inside a frame.
 * @param {typeof import("three")} THREE
 * @param {ItemFramePlacement} placement
 * @param {import("three").Texture|null} texture
 * @returns {import("three").Object3D}
 */
export function createItemFrameItemObject3D(THREE, placement, texture) {
	const group = new THREE.Group();
	group.name = `item_frame_item:${placement.itemName}@${placement.x},${placement.y},${placement.z}`;
	group.userData.previewEntity = true; // cleaned with entities
	group.userData.itemFrameItem = true;
	group.userData.layerY = placement.y;
	group.userData.sdbItemFrame = placement;

	// Plane in local space facing +Z (same as default item_frame plate)
	const size = 10; // matches inner frame opening (~10 units in block geo)
	const geo = new THREE.PlaneGeometry(size, size);
	const mat = texture
		? new THREE.MeshBasicMaterial({
			map: texture,
			transparent: true,
			alphaTest: 0.05,
			side: THREE.DoubleSide,
			depthWrite: true,
			...(placement.glow ? { color: 0xffffff } : {})
		})
		: new THREE.MeshBasicMaterial({
			color: 0xcccccc,
			side: THREE.DoubleSide,
			transparent: true,
			opacity: 0.85
		});

	const mesh = new THREE.Mesh(geo, mat);
	// ItemRotation: spin in the plane of the frame
	const rotRad = (Number(placement.itemRotationDeg) || 0) * (Math.PI / 180);
	mesh.rotation.z = -rotRad;
	group.add(mesh);

	// Match BlockGeoMaker + PreviewRenderer:
	// 1) plate in 0–16 geo space (item_frame plate at z≈15.5, room-side 15.35)
	// 2) rotate with BlockGeoMaker-compatible euler (not plain Three Euler — that
	//    flips up/down so icons float ~1 block off floor/ceiling frames)
	// 3) structurePosToThree (per-block Z flip: z' = 16 - z)
	const [ex, ey, ez] = frameFacingEulerDeg(placement.facing);
	const [px, py, pz] = framePlateLocalGeo(placement.facing);
	const q = new THREE.Quaternion().setFromEuler(blockGeoEulerToThree(ex, ey, ez, THREE));

	const lx = placement.x + px / 16;
	const ly = placement.y + py / 16;
	const lz = placement.z + pz / 16;
	const [tx, ty, tz] = structurePosToThree(lx, ly, lz);
	group.position.set(tx, ty, tz);
	// Same rotation as the baked frame geo (local +Z follows plate)
	group.quaternion.copy(q);

	// Slight glow bias for glow frames
	if (placement.glow && mat.color) {
		mat.color.setHex(0xffffee);
	}

	group.traverse(obj => {
		if (obj.isMesh) {
			obj.frustumCulled = false;
			obj.castShadow = false;
			obj.receiveShadow = false;
		}
	});

	return group;
}
