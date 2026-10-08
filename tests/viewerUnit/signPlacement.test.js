import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("signPlacement", async () => {
	const {
		kindOfSign,
		eulerOfSign,
		placeSignFace,
		SIGN_BOARD,
		woodKind
	} = await import("../../src/viewer/signPlacement.js");

	it("classifies wall / standing / hanging from name", () => {
		assert.equal(kindOfSign("oak_wall_sign", {}), "wall");
		assert.equal(kindOfSign("minecraft:standing_sign", {}), "standing");
		assert.equal(kindOfSign("oak_hanging_sign", { facing_direction: 2 }), "hanging");
		assert.equal(woodKind("darkoak_wall_sign"), "darkoak");
		assert.equal(woodKind("oak_hanging_sign"), "oak");
	});

	it("uses hanging board at cell center, not wall plate z=15", () => {
		assert.equal(SIGN_BOARD.hanging.cz, 8);
		assert.equal(SIGN_BOARD.wall.cz, 15);
		const h = placeSignFace(
			{ x: 0, y: 0, z: 0, states: { facing_direction: 2, attached_bit: 0 } },
			"oak_hanging_sign",
			false
		);
		assert.equal(h.kind, "hanging");
		assert.ok(Math.abs(h.board.cy - 5) < 0.01, `hanging cy=${h.board.cy}`);
	});

	it("hanging attached_bit uses ground_sign_direction yaw", () => {
		const e = eulerOfSign("hanging", {
			attached_bit: 1,
			facing_direction: 0,
			ground_sign_direction: 4
		});
		assert.deepEqual(e, [0, 90, 0]);
		const wallLike = eulerOfSign("hanging", {
			attached_bit: 0,
			facing_direction: 3,
			ground_sign_direction: 0
		});
		assert.deepEqual(wallLike, [0, 180, 0]);
	});

	it("describeSignPlacement reports F/B and footer", async () => {
		const { describeSignPlacement, signFaceTag } = await import("../../src/viewer/signPlacement.js");
		const d = describeSignPlacement(
			{ x: 2, y: 0, z: 0, states: { facing_direction: 4 } },
			"oak_wall_sign"
		);
		assert.equal(d.kind, "wall");
		assert.equal(d.facing.includes("fd=4"), true);
		assert.equal(d.front.side, -1);
		assert.equal(d.back.side, 1);
		assert.match(signFaceTag(d, false), /^F wall fd=4/);
	});

	it("standing gsd=15 board sits between F and B", async () => {
		const { describeSignPlacement } = await import("../../src/viewer/signPlacement.js");
		const d = describeSignPlacement(
			{ x: 5, y: 0, z: 0, states: { ground_sign_direction: 15 } },
			"standing_sign"
		);
		assert.equal(d.kind, "standing");
		assert.equal(d.eulerDeg[1], 337.5);
		const [fx, , fz] = d.front.three;
		const [bx, , bz] = d.back.three;
		const [ox, , oz] = d.boardThree;
		assert.ok(ox > Math.min(fx, bx) && ox < Math.max(fx, bx), `board x ${ox} not between ${fx} ${bx}`);
		assert.ok(oz > Math.min(fz, bz) && oz < Math.max(fz, bz), `board z ${oz} not between ${fz} ${bz}`);
	});

	it("sign text matches Z-flipped block geo (16 - z)", async () => {
		const { geoPointToThree, blockVertexToThree } = await import("../../src/viewer/previewSpace.js");
		const { placeSignFace } = await import("../../src/viewer/signPlacement.js");
		const p = placeSignFace(
			{ x: 0, y: 0, z: 0, states: { facing_direction: 2 } },
			"oak_wall_sign",
			false
		);
		const flipped = geoPointToThree(0, 0, 0, 8, 8.125, p.localZ);
		const unflipped = blockVertexToThree(0, 0, 0, 8, 8.125, p.localZ);
		assert.deepEqual([p.tx, p.ty, p.tz], flipped);
		assert.notEqual(p.tz, unflipped[2]);
	});

	it("wall front is geo -Z (side -1) not isBack", async () => {
		const { SIGN_BOARD, signFaceLocalOffset } = await import("../../src/viewer/signPlacement.js");
		const f = signFaceLocalOffset(SIGN_BOARD.wall, false);
		const b = signFaceLocalOffset(SIGN_BOARD.wall, true);
		assert.equal(f.side, -1);
		assert.equal(b.side, 1);
		assert.ok(f.z < SIGN_BOARD.wall.cz - 8, "wall F is on the room side of the plate");
		assert.ok(b.z > SIGN_BOARD.wall.cz - 8, "wall B is on the wall side of the plate");
	});

	it("standing face offsets sit outside plaque thickness", async () => {
		const { SIGN_BOARD, signFaceLocalOffset, signFaceLift } = await import("../../src/viewer/signPlacement.js");
		const board = SIGN_BOARD.standing;
		const f = signFaceLocalOffset(board, false);
		const bk = signFaceLocalOffset(board, true);
		const lift = signFaceLift(board);
		assert.ok(lift > board.halfT * 0.9, `lift ${lift} should clear scaled plaque`);
		assert.ok(Math.abs(f.z) > board.halfT * 0.9, `front |z| ${f.z}`);
		assert.ok(Math.abs(bk.z) > board.halfT * 0.9, `back |z| ${bk.z}`);
		assert.equal(Math.sign(f.z), 1);
		assert.equal(Math.sign(bk.z), -1);
	});

	it("at 45° three.js outward is not Ry(+45) +Z (Z-flip)", async () => {
		const { placeSignFace, boardCenterThree } = await import("../../src/viewer/signPlacement.js");
		const block = { x: 0, y: 0, z: 0, states: { ground_sign_direction: 2 } };
		const f = placeSignFace(block, "standing_sign", false);
		const mid = boardCenterThree(block, "standing_sign");
		const ox = f.tx - mid.x, oy = f.ty - mid.y, oz = f.tz - mid.z;
		const len = Math.hypot(ox, oy, oz);
		const nx = ox / len, nz = oz / len;
		const ryZx = Math.sin(45 * Math.PI / 180);
		const ryZz = Math.cos(45 * Math.PI / 180);
		const dot = nx * ryZx + nz * ryZz;
		assert.ok(Math.abs(dot) < 0.2, `outward should not match Ry(45)+Z, dot=${dot}`);
		assert.ok(Math.abs(nx + nz) < 0.05, `45° Z-flip outward ~ (a,0,-a), got ${nx},${nz}`);
	});

	it("gsd=2 cell 8,0,0 dump uses Z-flipped F/B (not plaque-plane sandwich)", async () => {
		const { describeSignPlacement, signFaceBasis } = await import("../../src/viewer/signPlacement.js");
		const d = describeSignPlacement(
			{ x: 8, y: 0, z: 0, states: { ground_sign_direction: 2 } },
			"oak_standing_sign"
		);
		assert.deepEqual(d.boardThree, [-136, 12.125, -8]);
		const [fdx, , fdz] = d.front.dBoard;
		const [bdx, , bdz] = d.back.dBoard;
		assert.ok(Math.abs(fdx + fdz) < 0.05, `F d should be (a,0,-a), got ${d.front.dBoard}`);
		assert.ok(Math.abs(bdx + bdz) < 0.05, `B d should be (-a,0,a), got ${d.back.dBoard}`);
		assert.ok(fdx > 0 && fdz < 0, `F d ${d.front.dBoard}`);
		assert.ok(bdx < 0 && bdz > 0, `B d ${d.back.dBoard}`);
		const f = signFaceBasis(
			{ tx: d.front.three[0], ty: d.front.three[1], tz: d.front.three[2] },
			{ x: d.boardThree[0], y: d.boardThree[1], z: d.boardThree[2] }
		);
		const b = signFaceBasis(
			{ tx: d.back.three[0], ty: d.back.three[1], tz: d.back.three[2] },
			{ x: d.boardThree[0], y: d.boardThree[1], z: d.boardThree[2] }
		);
		const sandwich = f.z[0] * b.z[0] + f.z[1] * b.z[1] + f.z[2] * b.z[2];
		assert.ok(sandwich < -0.99, `F/B +Z must be opposite, dot=${sandwich}`);
		assert.ok(Math.abs(f.y[1] - 1) < 0.05, `standing text up should be +Y, y=${f.y}`);
		const ryDot = f.z[0] * Math.sin(Math.PI / 4) + f.z[2] * Math.cos(Math.PI / 4);
		assert.ok(Math.abs(ryDot) < 0.2, `plane +Z must not be Ry(45)+Z, dot=${ryDot}`);
	});

	it("bakes 45° plane verts onto instance origin (not mesh quaternion)", async () => {
		const { signPlaneInstanceVerts, instanceOriginThree } = await import("../../src/viewer/signPlacement.js");
		const block = { x: 8, y: 0, z: 0, states: { ground_sign_direction: 2 } };
		const baked = signPlaneInstanceVerts(block, "oak_standing_sign", false);
		assert.deepEqual(baked.origin, instanceOriginThree(8, 0, 0));
		const [o0, o1, o2] = baked.origin;
		const world = baked.verts.map(v => [v[0] + o0, v[1] + o1, v[2] + o2]);
		const cx = (world[0][0] + world[1][0] + world[2][0] + world[3][0]) / 4;
		const cy = (world[0][1] + world[1][1] + world[2][1] + world[3][1]) / 4;
		const cz = (world[0][2] + world[1][2] + world[2][2] + world[3][2]) / 4;
		assert.ok(Math.abs(cx - baked.placed.tx) < 1e-6, `center x ${cx} vs ${baked.placed.tx}`);
		assert.ok(Math.abs(cy - baked.placed.ty) < 1e-6, `center y ${cy}`);
		assert.ok(Math.abs(cz - baked.placed.tz) < 1e-6, `center z ${cz}`);
		// width edges must follow 45° Z-flip (not world +X)
		const e0x = world[1][0] - world[0][0];
		const e0z = world[1][2] - world[0][2];
		const elen = Math.hypot(e0x, e0z);
		const ex = e0x / elen, ez = e0z / elen;
		assert.ok(Math.abs(Math.abs(ex) - Math.abs(ez)) < 0.05, `45° width along diagonal, edge=${ex},${ez}`);
		assert.ok(Math.abs(ex) > 0.5, "width must not be axis-aligned");
	});

	it("wall fd=2 instance verts sit on the Z-flipped plate, not 1 block out", async () => {
		const { signPlaneInstanceVerts, boardCenterThree } = await import("../../src/viewer/signPlacement.js");
		const block = { x: 11, y: 0, z: 5, states: { facing_direction: 2 } };
		const baked = signPlaneInstanceVerts(block, "warped_wall_sign", false);
		const mid = boardCenterThree(block, "warped_wall_sign");
		const [o0, o1, o2] = baked.origin;
		const cz = baked.verts.reduce((s, v) => s + v[2], 0) / 4 + o2;
		assert.ok(Math.abs(cz - baked.placed.tz) < 1e-6);
		assert.ok(Math.abs(baked.placed.tz - mid.z) < 2, `F should be ~1 geo from board, Δz=${baked.placed.tz - mid.z}`);
		assert.ok(baked.placed.tz > mid.z, "wall F is toward room (+Z after flip)");
		const unflippedZ = -16 * 5 - 16 + baked.placed.localZ;
		assert.ok(Math.abs(baked.placed.tz - unflippedZ) > 8, "must not use unflipped instance Z");
	});

	it("F minus B is along baked board +Z for gsd=15", async () => {
		const { placeSignFace, boardCenterThree, signBoardAxes, eulerOfSign } =
			await import("../../src/viewer/signPlacement.js");
		const block = { x: 0, y: 0, z: 0, states: { ground_sign_direction: 15 } };
		const f = placeSignFace(block, "standing_sign", false);
		const mid = boardCenterThree(block, "standing_sign");
		const axes = signBoardAxes(eulerOfSign("standing", block.states));
		const dx = f.tx - mid.x, dy = f.ty - mid.y, dz = f.tz - mid.z;
		const len = Math.hypot(dx, dy, dz);
		const nx = dx / len, ny = dy / len, nz = dz / len;
		// Block geo buffer uses z' = 16 - z, so world direction Z is negated
		assert.ok(Math.abs(nx - axes.z[0]) < 1e-6, `nx ${nx} vs ${axes.z[0]}`);
		assert.ok(Math.abs(ny - axes.z[1]) < 1e-6, `ny ${ny}`);
		assert.ok(Math.abs(nz - -axes.z[2]) < 1e-6, `nz ${nz} vs ${-axes.z[2]}`);
	});
});
