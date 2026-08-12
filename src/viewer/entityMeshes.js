/**
 * Procedural Three.js meshes for structure entities (minecart family).
 *
 * Minecart entity skins (minecart.png) are UV layouts for geo models — NOT
 * tileable materials. Mapping that atlas onto box faces looks like a black/grey
 * mess, so we use flat materials only. Cargo (chest/hopper/TNT) uses solid colors
 * that read clearly at structure scale.
 *
 * Coordinate mapping matches PreviewRenderer block placement (Z-flip).
 */

/**
 * Structure-local continuous coords → PreviewRenderer three.js space.
 * @param {number} lx
 * @param {number} ly
 * @param {number} lz
 * @returns {[number, number, number]}
 */
export function structurePosToThree(lx, ly, lz) {
	const fx = Math.floor(lx);
	const ux = lx - fx;
	const x = -16 * fx - 16 + 16 * ux;
	const y = 16 * ly;
	const z = -16 * lz;
	return [x, y, z];
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

function buildChestCargo(THREE, wood, strap) {
	const g = new THREE.Group();
	g.add(box(THREE, wood, [12, 8, 12], [0, 7.5, 0]));
	g.add(box(THREE, wood, [12.4, 2.2, 12.4], [0, 12.6, 0]));
	g.add(box(THREE, strap, [2, 2, 1], [0, 11.2, 6.4]));
	g.add(box(THREE, strap, [12.6, 0.8, 0.6], [0, 9.5, 6.1]));
	g.add(box(THREE, strap, [12.6, 0.8, 0.6], [0, 9.5, -6.1]));
	return g;
}

function buildHopperCargo(THREE, iron) {
	const g = new THREE.Group();
	g.add(box(THREE, iron, [12, 2, 12], [0, 11.5, 0]));
	g.add(box(THREE, iron, [10, 2.5, 10], [0, 9.5, 0]));
	g.add(box(THREE, iron, [7, 2.5, 7], [0, 7.2, 0]));
	g.add(box(THREE, iron, [4, 2.5, 4], [0, 5.2, 0]));
	g.add(box(THREE, iron, [2.5, 1.5, 2.5], [0, 3.8, 0]));
	return g;
}

function buildTntCargo(THREE, red, white) {
	const g = new THREE.Group();
	g.add(box(THREE, red, [12, 12, 12], [0, 9.5, 0]));
	g.add(box(THREE, white, [12.2, 3, 12.2], [0, 9.5, 0]));
	return g;
}

function buildCommandCargo(THREE, mat) {
	const g = new THREE.Group();
	g.add(box(THREE, mat, [12, 12, 12], [0, 9.5, 0]));
	return g;
}

function buildSeat(THREE, seatMat) {
	const g = new THREE.Group();
	g.add(box(THREE, seatMat, [10, 1.2, 10], [0, 3.8, 0]));
	return g;
}

/**
 * @param {typeof import("three")} THREE
 * @param {import("./entityExtract.js").PreviewEntity} entity
 * @param {{
 *   minecartTexture?: import("three").Texture|null,
 *   scale?: number,
 *   railDirection?: number|null
 * }} [materials]
 * @returns {import("three").Object3D}
 */
export function createEntityObject3D(THREE, entity, materials = {}) {
	const kind = String(entity.identifier || entity.meshKind || "").replace(/^minecraft:/, "");
	const group = new THREE.Group();
	group.name = `entity:${entity.rawId || kind}`;
	group.userData.previewEntity = true;
	group.userData.sdbEntity = entity;

	const s = materials.scale ?? 0.72;

	// Flat materials only — entity skin atlas is not valid on arbitrary boxes
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

	const k = kind.toLowerCase();
	if (k === "hopper_minecart" || k === "minecart_hopper") {
		group.add(buildHopperCargo(THREE, ironMat));
	} else if (k === "chest_minecart" || k === "minecart_chest") {
		group.add(buildChestCargo(THREE, chestWood, chestStrap));
	} else if (k === "tnt_minecart") {
		group.add(buildTntCargo(THREE, tntRed, tntWhite));
	} else if (k === "command_block_minecart") {
		group.add(buildCommandCargo(THREE, cmdMat));
	} else {
		group.add(buildSeat(THREE, accentMat));
	}

	group.scale.setScalar(s);

	const [lx, ly, lz] = entity.pos || [0, 0, 0];
	const [tx, ty, tz] = structurePosToThree(Number(lx) || 0, Number(ly) || 0, Number(lz) || 0);
	group.position.set(tx, ty, tz);

	// Yaw: Bedrock Rotation[0]; negate for preview Z-flip
	const yawDeg = Number(entity.yawDeg) || 0;
	const yaw = yawDeg * (Math.PI / 180);
	group.rotation.y = -yaw;

	// Pitch: prefer entity Rotation[1], else rail under cart
	let pitchDeg = Number(entity.pitchDeg) || 0;
	if (Math.abs(pitchDeg) < 0.5 && materials.railDirection != null) {
		pitchDeg = pitchFromRailDirection(materials.railDirection, yawDeg);
	}
	// Pitch around local X after yaw (nose up/down along track)
	if (Math.abs(pitchDeg) > 0.5) {
		group.rotation.order = "YXZ";
		group.rotation.x = pitchDeg * (Math.PI / 180);
	}

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
