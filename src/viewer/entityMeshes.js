/**
 * Structure-entity meshes (minecart family).
 *
 * Hull prefers official Mojang geo + PNG from bedrock-samples
 * (`loadEntityModelKit`). Cargo prefers BlockGeoMaker cubes (same as placed
 * chest/hopper/tnt/command_block) from the structure atlas; colored boxes
 * remain a fallback.
 *
 * Coordinate mapping matches PreviewRenderer block placement (Z-flip).
 */

import { structurePosToThree } from "./previewSpace.js";
import { entityMeshKind } from "./entityExtract.js";
import { loadVanillaEntityKit } from "./entityGeoThree.js?v=judo39";
import { buildCargoKit, placeCargoMesh } from "./entityCargo.js?v=judo39";

export { structurePosToThree };
export { loadVanillaEntityKit as loadEntityModelKit };
export { buildCargoKit };

/** Hull AABB in model units (floor y≈0.5, walls to 10.5, cargo to ~15). */
export const MINECART_PICK_SIZE = [20, 15, 16];
export const MINECART_PICK_CENTER = [0, 7.5, 0];

/** Rail plane in blockShapeGeos (`"rail"` pos y=1). */
export const RAIL_PLANE_Y = 1;
/** Vanilla hull floor bottom after the 90° X cube (y=0.5..2.5). */
export const HULL_FLOOR_BOTTOM = 0.5;
/** Hair above the rail so the 2-unit floor doesn't z-fight the plane. */
export const HULL_SIT_LIFT = 0.5;

/**
 * World Y so the iron floor sits on the rail, not on raw NBT Pos.
 * Flat rails: snap to the cell's rail plane. Slopes: keep NBT Y (climb) and
 * only drop by the hull floor offset.
 *
 * @param {number} ly structure-local Y
 * @param {number|null|undefined} railDirection
 */
export function minecartWorldY(ly, railDirection) {
	const y = Number(ly) || 0;
	const d = Number(railDirection);
	const sloped = d >= 2 && d <= 5;
	if (sloped) {
		return 16 * y - HULL_FLOOR_BOTTOM + HULL_SIT_LIFT;
	}
	const cellY = Math.floor(y);
	return 16 * cellY + RAIL_PLANE_Y - HULL_FLOOR_BOTTOM + HULL_SIT_LIFT;
}

/**
 * Invisible solid volume so inspect rays hit the tub interior, not the rail.
 * `material.visible = false` skips drawing; the object stays raycastable.
 * @param {typeof import("three")} THREE
 * @param {import("three").Object3D} group
 */
export function addMinecartPickVolume(THREE, group) {
	const mat = new THREE.MeshBasicMaterial({
		visible: false,
		side: THREE.DoubleSide
	});
	const mesh = new THREE.Mesh(
		new THREE.BoxGeometry(MINECART_PICK_SIZE[0], MINECART_PICK_SIZE[1], MINECART_PICK_SIZE[2]),
		mat
	);
	mesh.position.set(MINECART_PICK_CENTER[0], MINECART_PICK_CENTER[1], MINECART_PICK_CENTER[2]);
	mesh.name = "sdb-pick-volume";
	mesh.userData.sdbPickProxy = true;
	mesh.frustumCulled = false;
	group.add(mesh);
	return mesh;
}

/**
 * Infer pitch (degrees, nose up positive) from Bedrock rail_direction under the cart.
 * 2=E↑ 3=W↑ 4=N↑ 5=S↑ → ~45° along the climb.
 * @param {number|null|undefined} railDirection
 * @param {number} yawDeg cart yaw (Bedrock Rotation[0])
 * @returns {number} pitch degrees
 */
export function pitchFromRailDirection(railDirection, yawDeg = 0) {
	const d = Number(railDirection);
	if (!Number.isFinite(d) || d < 2 || d > 5) return 0;
	// Slope angle ≈ 45° for full block rise
	const slope = 40;
	// Align pitch sign with cart facing along the climb
	const yaw = ((Number(yawDeg) % 360) + 360) % 360;
	// Approximate: 0° faces +Z south in MC; after our Z-flip use entity yaw as-is
	// Climb directions in structure space:
	// 2 east (+X), 3 west (-X), 4 north (-Z), 5 south (+Z)
	const climbYaw = { 2: -90, 3: 90, 4: 180, 5: 0 }[d] ?? 0;
	let diff = Math.abs(((yaw - climbYaw + 540) % 360) - 180);
	// If facing opposite climb, pitch negative (going down)
	const facingClimb = diff > 90;
	return facingClimb ? -slope : slope;
}

/**
 * @param {typeof import("three")} THREE
 * @param {import("three").Material} mat
 * @param {[number,number,number]} size
 * @param {[number,number,number]} pos
 */
function box(THREE, mat, size, pos) {
	const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
	m.position.set(pos[0], pos[1], pos[2]);
	return m;
}

/**
 * @param {typeof import("three")} THREE
 * @param {import("three").Material} cartMat
 * @param {import("three").Material} darkMat
 * @param {import("three").Material} wheelMat
 * @param {import("three").Material} rimMat
 */
function buildMinecartHull(THREE, cartMat, darkMat, wheelMat, rimMat) {
	const g = new THREE.Group();
	g.name = "minecart-hull";

	// Body shell — slightly inset walls so silhouette reads
	g.add(box(THREE, cartMat, [20, 1.4, 16], [0, 2.4, 0]));
	g.add(box(THREE, darkMat, [17.5, 0.5, 13.5], [0, 3.1, 0]));

	g.add(box(THREE, cartMat, [20, 6.2, 1.5], [0, 5.6, 7.25]));
	g.add(box(THREE, cartMat, [20, 6.2, 1.5], [0, 5.6, -7.25]));
	g.add(box(THREE, cartMat, [1.5, 6.2, 14.5], [9.25, 5.6, 0]));
	g.add(box(THREE, cartMat, [1.5, 6.2, 14.5], [-9.25, 5.6, 0]));

	// Rim highlight
	g.add(box(THREE, rimMat, [20.6, 1.0, 1.3], [0, 8.9, 7.5]));
	g.add(box(THREE, rimMat, [20.6, 1.0, 1.3], [0, 8.9, -7.5]));
	g.add(box(THREE, rimMat, [1.3, 1.0, 14.2], [9.55, 8.9, 0]));
	g.add(box(THREE, rimMat, [1.3, 1.0, 14.2], [-9.55, 8.9, 0]));

	// Wheels + axles
	const wheelGeo = [3.0, 3.0, 1.3];
	for (const [wx, wy, wz] of [
		[5.5, 1.15, 8.1],
		[-5.5, 1.15, 8.1],
		[5.5, 1.15, -8.1],
		[-5.5, 1.15, -8.1]
	]) {
		g.add(box(THREE, wheelMat, wheelGeo, [wx, wy, wz]));
	}
	g.add(box(THREE, wheelMat, [13.5, 0.7, 0.7], [0, 1.15, 8.1]));
	g.add(box(THREE, wheelMat, [13.5, 0.7, 0.7], [0, 1.15, -8.1]));

	return g;
}

function standInMat(THREE, color) {
	return new THREE.MeshLambertMaterial({
		color,
		polygonOffset: true,
		polygonOffsetFactor: -1,
		polygonOffsetUnits: -2
	});
}

function buildChestCargo(THREE, wood, strap) {
	const g = new THREE.Group();
	// Inset from hull inner walls (x±8, z±6, floor y=2.5) so stand-ins don't z-fight.
	g.add(box(THREE, wood, [10, 8, 10], [0, 7.5, 0]));
	g.add(box(THREE, wood, [10.4, 2.2, 10.4], [0, 12.4, 0]));
	g.add(box(THREE, strap, [2, 2, 1], [0, 11.2, 5.4]));
	g.add(box(THREE, strap, [10.6, 0.8, 0.6], [0, 9.5, 5.1]));
	g.add(box(THREE, strap, [10.6, 0.8, 0.6], [0, 9.5, -5.1]));
	return g;
}

function buildHopperCargo(THREE, iron) {
	const g = new THREE.Group();
	g.add(box(THREE, iron, [10, 2, 10], [0, 11.2, 0]));
	g.add(box(THREE, iron, [8, 2.4, 8], [0, 9.4, 0]));
	g.add(box(THREE, iron, [6, 2.2, 6], [0, 7.2, 0]));
	g.add(box(THREE, iron, [3.5, 2, 3.5], [0, 5.2, 0]));
	g.add(box(THREE, iron, [2.2, 1.4, 2.2], [0, 4.0, 0]));
	return g;
}

function buildTntCargo(THREE, red, white) {
	const g = new THREE.Group();
	g.add(box(THREE, red, [10, 10, 10], [0, 8.5, 0]));
	g.add(box(THREE, white, [10.2, 2.6, 10.2], [0, 8.5, 0]));
	return g;
}

function buildCommandCargo(THREE, mat) {
	const g = new THREE.Group();
	g.add(box(THREE, mat, [10, 10, 10], [0, 8.5, 0]));
	return g;
}

function addCargo(THREE, group, kind, mats = null) {
	const k = String(kind || "").toLowerCase();
	const accentMat = mats?.accentMat ?? standInMat(THREE, 0xb08d57);
	const chestWood = mats?.chestWood ?? standInMat(THREE, 0x8b5a2b);
	const chestStrap = mats?.chestStrap ?? standInMat(THREE, 0xc9a227);
	const ironMat = mats?.ironMat ?? standInMat(THREE, 0x5a5a62);
	const tntRed = mats?.tntRed ?? standInMat(THREE, 0xb33a2e);
	const tntWhite = mats?.tntWhite ?? standInMat(THREE, 0xe8e0d8);
	const cmdMat = mats?.cmdMat ?? standInMat(THREE, 0xc48a3a);
	if (k === "hopper" || k === "hopper_minecart" || k === "minecart_hopper") {
		group.add(buildHopperCargo(THREE, ironMat));
	} else if (k === "chest" || k === "chest_minecart" || k === "minecart_chest") {
		group.add(buildChestCargo(THREE, chestWood, chestStrap));
	} else if (k === "tnt" || k === "tnt_minecart") {
		group.add(buildTntCargo(THREE, tntRed, tntWhite));
	} else if (k === "command" || k === "command_block_minecart") {
		group.add(buildCommandCargo(THREE, cmdMat));
	} else if (!mats) {
		/* vanilla hull already reads as empty cart */
	} else {
		group.add(buildSeat(THREE, accentMat));
	}
}

function buildSeat(THREE, seatMat) {
	const g = new THREE.Group();
	g.add(box(THREE, seatMat, [10, 1.2, 10], [0, 3.8, 0]));
	return g;
}

/**
 * @param {import("three").Object3D} group
 * @param {import("./entityExtract.js").PreviewEntity} entity
 * @param {number|null|undefined} railDirection
 */
function applyEntityPose(group, entity, railDirection) {
	const [lx, ly, lz] = entity.pos || [0, 0, 0];
	const [tx, , tz] = structurePosToThree(Number(lx) || 0, Number(ly) || 0, Number(lz) || 0);
	const ty = minecartWorldY(Number(ly) || 0, railDirection);
	group.position.set(tx, ty, tz);

	const yawDeg = Number(entity.yawDeg) || 0;
	group.rotation.y = -(yawDeg * (Math.PI / 180));

	let pitchDeg = Number(entity.pitchDeg) || 0;
	if (Math.abs(pitchDeg) < 0.5 && railDirection != null) {
		pitchDeg = pitchFromRailDirection(railDirection, yawDeg);
	}
	if (Math.abs(pitchDeg) > 0.5) {
		group.rotation.order = "YXZ";
		group.rotation.x = pitchDeg * (Math.PI / 180);
	}
}

/**
 * Clone a kit template while sharing BufferGeometry + Material (vanilla PNG).
 * @param {typeof import("three")} THREE
 * @param {import("three").Object3D} template
 */
function cloneVanillaTemplate(THREE, template) {
	const g = new THREE.Group();
	g.name = template.name;
	template.traverse(obj => {
		if (!obj.isMesh || obj === template) return;
		const m = new THREE.Mesh(obj.geometry, obj.material);
		m.name = obj.name;
		m.frustumCulled = false;
		g.add(m);
	});
	return g;
}

export function createEntityObject3D(THREE, entity, materials = {}) {
	const kind = entityMeshKind(entity.identifier || entity.meshKind || "")
		|| String(entity.identifier || "").replace(/^minecraft:/, "");
	const group = new THREE.Group();
	group.name = `entity:${entity.rawId || kind}`;
	group.userData.previewEntity = true;
	group.userData.sdbEntity = entity;
	group.userData.sdbMeshKind = kind;

	const kitEntry = materials.entityKit?.get?.(kind);
	if (kitEntry?.template) {
		const hull = cloneVanillaTemplate(THREE, kitEntry.template);
		hull.userData.sdbVanillaHull = true;
		group.add(hull);
		const cargoKind = kitEntry.cargo || "";
		const cargoEntry = cargoKind && cargoKind !== "none"
			? materials.cargoKit?.get?.(cargoKind)
			: null;
		if (cargoEntry?.geometry) {
			const cargo = new THREE.Mesh(cargoEntry.geometry, cargoEntry.material);
			cargo.name = `vanilla-cargo:${cargoKind}`;
			placeCargoMesh(cargo);
			group.add(cargo);
		} else {
			addCargo(THREE, group, cargoKind);
		}
		addMinecartPickVolume(THREE, group);
		applyEntityPose(group, entity, materials.railDirection);
		group.traverse(obj => {
			if (obj.isMesh) {
				obj.castShadow = false;
				obj.receiveShadow = false;
				obj.frustumCulled = false;
			}
		});
		return group;
	}

	const s = materials.scale ?? 0.72;

	// Fallback: flat boxes if vanilla geo/PNG did not load
	const cartMat = new THREE.MeshLambertMaterial({ color: 0x6a6e75 });
	const darkMat = new THREE.MeshLambertMaterial({ color: 0x2c2e33 });
	const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141518 });
	const rimMat = new THREE.MeshLambertMaterial({ color: 0x8a909a });
	const accentMat = new THREE.MeshLambertMaterial({ color: 0xb08d57 });
	const chestWood = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
	const chestStrap = new THREE.MeshLambertMaterial({ color: 0xc9a227 });
	const ironMat = new THREE.MeshLambertMaterial({ color: 0x5a5a62 });
	const tntRed = new THREE.MeshLambertMaterial({ color: 0xb33a2e });
	const tntWhite = new THREE.MeshLambertMaterial({ color: 0xe8e0d8 });
	const cmdMat = new THREE.MeshLambertMaterial({ color: 0xc48a3a });

	group.add(buildMinecartHull(THREE, cartMat, darkMat, wheelMat, rimMat));
	addCargo(THREE, group, kind, {
		accentMat, chestWood, chestStrap, ironMat, tntRed, tntWhite, cmdMat
	});
	addMinecartPickVolume(THREE, group);
	group.scale.setScalar(s);
	applyEntityPose(group, entity, materials.railDirection);

	group.traverse(obj => {
		if (obj.isMesh) {
			obj.castShadow = false;
			obj.receiveShadow = false;
			obj.frustumCulled = false;
		}
	});

	return group;
}

/**
 * Kept for API compatibility — texture is intentionally not applied to box hulls.
 * @returns {Promise<null>}
 */
export async function loadMinecartTexture(_THREE, _resourcePackStack) {
	return null;
}
