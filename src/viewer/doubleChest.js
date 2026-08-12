/**
 * Bedrock double chests: two block entities with pairx/pairz (and optional pairlead).
 * Palette only stores name+facing, so both halves share one single-chest template.
 * We expand the palette so each paired half gets a dedicated "chest_half" shape
 * rotated so the open face points toward its partner.
 */

/**
 * @param {string} name
 */
export function isChestBlockName(name) {
	const n = String(name || "").replace(/^minecraft:/, "").toLowerCase();
	if (!n || n === "ender_chest") return false; // ender chests never double
	return (
		n === "chest"
		|| n === "trapped_chest"
		|| (n.endsWith("_chest") && !n.includes("ender"))
	);
}

/**
 * @param {Record<string, unknown>|null|undefined} states
 * @returns {"north"|"south"|"east"|"west"}
 */
export function chestFacing(states) {
	const raw =
		states?.["minecraft:cardinal_direction"]
		?? states?.cardinal_direction
		?? states?.facing_direction
		?? "north";
	const s = String(raw).toLowerCase();
	if (s === "north" || s === "south" || s === "east" || s === "west") return s;
	// Numeric facing_direction (rare on modern chests)
	if (s === "2") return "north";
	if (s === "3") return "south";
	if (s === "4") return "west";
	if (s === "5") return "east";
	return "north";
}

/**
 * Which local +X should point to the pair after block rotation is applied.
 * BlockGeoMaker rotates by cardinal; we encode extra yaw in sdb_pair_yaw.
 *
 * @param {"north"|"south"|"east"|"west"} facing
 * @param {number} dx pairx - x
 * @param {number} dz pairz - z
 * @returns {{ half: "a"|"b", latch: 0|1, yawExtra: number }|null}
 */
export function classifyChestPair(facing, dx, dz) {
	if ((dx === 0 && dz === 0) || (Math.abs(dx) + Math.abs(dz) !== 1)) return null;
	// Partner direction in structure space
	/** @type {"north"|"south"|"east"|"west"} */
	let toward;
	if (dx === 1) toward = "east";
	else if (dx === -1) toward = "west";
	else if (dz === 1) toward = "south";
	else toward = "north";

	// chest_half is open on local +X (east before block rotation).
	// After cardinal rotation (from blockStateDefinitions):
	//   north: identity → open east
	//   south: 180 → open west
	//   east: 90 → open south
	//   west: -90 → open north
	// We need open face toward partner. Compute extra yaw (multiples of 180) to flip.
	const openAfterFacing = {
		north: "east",
		south: "west",
		east: "south",
		west: "north"
	}[facing];

	const needFlip = openAfterFacing !== toward;
	// Latch on the "lead" or westward/northward half for a single latch look
	const latch = (dx + dz < 0 ? 1 : 0);
	return {
		half: needFlip ? "b" : "a",
		latch: /** @type {0|1} */ (latch),
		yawExtra: needFlip ? 180 : 0
	};
}

/**
 * Expand palette + remap indices so paired chests use chest_half geos.
 *
 * @param {any} nbt root structure NBT
 * @param {any[]} palette
 * @param {[Int32Array|number[], Int32Array|number[]]} indices
 * @returns {{ palette: any[], indices: [Int32Array, Int32Array], pairedCount: number }}
 */
export function applyDoubleChestPalette(nbt, palette, indices) {
	const size = nbt?.size;
	const sx = Number(size?.[0] ?? 0);
	const sy = Number(size?.[1] ?? 0);
	const sz = Number(size?.[2] ?? 0);
	const origin = nbt?.structure_world_origin;
	const ox = Number(origin?.[0] ?? 0);
	const oy = Number(origin?.[1] ?? 0);
	const oz = Number(origin?.[2] ?? 0);

	const structure = nbt?.structure;
	const bpd = structure?.palette?.default?.block_position_data ?? {};
	const idx0 = indices?.[0];
	if (!idx0 || !sx || !palette?.length) {
		return { palette, indices, pairedCount: 0 };
	}

	const layer0 = idx0 instanceof Int32Array ? new Int32Array(idx0) : Int32Array.from(idx0);
	const layer1 = indices[1] instanceof Int32Array
		? new Int32Array(indices[1])
		: Int32Array.from(indices[1] || []);

	/** @type {any[]} */
	const newPalette = palette.map(b => ({ ...b, states: b.states ? { ...b.states } : {} }));
	/** @type {Map<string, number>} halfKey → palette index */
	const halfPalette = new Map();
	let pairedCount = 0;

	const worldToLocal = (wx, wy, wz) => [wx - ox, wy - oy, wz - oz];

	for (const [k, v] of Object.entries(bpd)) {
		const be = v?.block_entity_data;
		if (!be) continue;
		const id = String(be.id ?? "");
		if (!/chest/i.test(id) || /ender/i.test(id)) continue;
		if (be.pairx == null || be.pairz == null) continue;
		if (be.forceunpair === 1 || be.forceunpair === true) continue;

		const i = Number(k);
		if (!Number.isFinite(i) || i < 0) continue;
		// Prefer BE x,y,z; fall back to index unpack
		let x;
		let y;
		let z;
		if (be.x != null && be.y != null && be.z != null) {
			[x, y, z] = worldToLocal(Number(be.x), Number(be.y), Number(be.z));
		} else {
			// index i = (x * sy + y) * sz + z
			const t = Math.floor(i / sz);
			z = i % sz;
			y = t % sy;
			x = Math.floor(t / sy);
		}
		x = Math.floor(x);
		y = Math.floor(y);
		z = Math.floor(z);
		if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) continue;

		const [px, , pz] = worldToLocal(Number(be.pairx), oy, Number(be.pairz));
		const dx = Math.round(px - x);
		const dz = Math.round(pz - z);

		const flat = (x * sy + y) * sz + z;
		const pi = Number(layer0[flat] ?? -1);
		if (pi < 0 || !(pi in newPalette)) continue;
		const block = newPalette[pi];
		const name = String(block?.name ?? "").replace(/^minecraft:/, "");
		if (!isChestBlockName(name)) continue;

		const facing = chestFacing(block.states);
		const cls = classifyChestPair(facing, dx, dz);
		if (!cls) continue;

		const texPath = chestTexturePath(name);
		const halfKey = `${name}|${facing}|${cls.half}|${cls.latch}|${texPath}`;
		let newPi = halfPalette.get(halfKey);
		if (newPi == null) {
			newPi = newPalette.length;
			halfPalette.set(halfKey, newPi);
			newPalette.push({
				name: block.name,
				states: {
					...(block.states || {}),
					// Synthetic states consumed by block shape / rotation
					sdb_chest_half: cls.half,
					sdb_chest_latch: cls.latch,
					sdb_pair_yaw: cls.yawExtra
				},
				// Hint for BlockGeoMaker shape override
				sdb_block_shape: `chest_half<${texPath}>`
			});
		}
		layer0[flat] = newPi;
		pairedCount++;
	}

	if (pairedCount) {
		console.info(
			`[sdb] double-chest: ${pairedCount} halves → ${halfPalette.size} unique geo variants`
		);
	}

	return {
		palette: newPalette,
		indices: [layer0, layer1],
		pairedCount,
		uniqueHalves: halfPalette.size
	};
}

/**
 * @param {string} name without minecraft:
 */
function chestTexturePath(name) {
	const n = name.toLowerCase();
	if (n === "trapped_chest") return "textures/entity/chest/trapped";
	if (n.includes("copper")) {
		if (n.includes("oxidized")) return "textures/entity/chest/copper_oxidized";
		if (n.includes("weathered")) return "textures/entity/chest/copper_weathered";
		if (n.includes("exposed")) return "textures/entity/chest/copper_exposed";
		return "textures/entity/chest/copper_default";
	}
	return "textures/entity/chest/normal";
}
