/**
 * Bedrock double chests: two block entities with pairx/pairz (and optional pairlead).
 * Palette only stores name+facing, so both halves share one single-chest template.
 * We expand the palette so the player-left cell gets one 30-wide chest_large
 * (same BlockGeoMaker cubes as chest-minecart cargo). The partner is skipped.
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
 * Left/right from a player looking at the chest front (latch).
 * Partner to the right of this block → this is the left half.
 *
 * @param {"north"|"south"|"east"|"west"} facing
 * @param {number} dx pairx - x
 * @param {number} dz pairz - z
 * @returns {{ half: "left"|"right" }|null}
 */
export function classifyChestPair(facing, dx, dz) {
	if (Math.abs(dx) + Math.abs(dz) !== 1) return null;
	const right = {
		north: [1, 0],
		south: [-1, 0],
		east: [0, 1],
		west: [0, -1]
	}[facing];
	if (!right) return null;
	const towardRight = dx === right[0] && dz === right[1];
	return { half: towardRight ? "left" : "right" };
}

/**
 * Preview instances negate X (`-16*x`) but already flip Z in BufferGeometry.
 * North/south pairs sit on X, so those meshes need instance scale.x = -1
 * or the 30-wide geo grows the wrong way (into the neighbor, not the partner).
 *
 * @param {any} block palette entry
 */
export function doubleChestNeedsPreviewXMirror(block) {
	if (!String(block?.basi_block_shape ?? "").startsWith("chest_large")) return false;
	const s = String(chestFacing(block.states)).toLowerCase();
	return s === "north" || s === "south";
}

/**
 * East/west pairs sit on Z. The same 30-wide geo + yaw maps width onto Z,
 * and without scale.z = -1 it grows north/south into non-chest blocks
 * (e.g. JD-Semi-Universal-V4 east chests over hoppers).
 *
 * @param {any} block palette entry
 */
export function doubleChestNeedsPreviewZMirror(block) {
	if (!String(block?.basi_block_shape ?? "").startsWith("chest_large")) return false;
	const s = String(chestFacing(block.states)).toLowerCase();
	return s === "east" || s === "west";
}

/** Coerce nbtify wrappers and primitives to a number. */
export function nbtNumber(v) {
	if (v == null) return NaN;
	if (typeof v === "object" && "value" in v) return Number(/** @type {{ value: unknown }} */ (v).value);
	return Number(v);
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
			[x, y, z] = worldToLocal(nbtNumber(be.x), nbtNumber(be.y), nbtNumber(be.z));
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

		const [px, , pz] = worldToLocal(nbtNumber(be.pairx), oy, nbtNumber(be.pairz));
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

		const texPath = chestTexturePath(name, true);
		const shape = cls.half === "left" ? `chest_large<${texPath}>` : "chest_double_skip";
		const halfKey = `${name}|${facing}|${cls.half}|${shape}`;
		let newPi = halfPalette.get(halfKey);
		if (newPi == null) {
			newPi = newPalette.length;
			halfPalette.set(halfKey, newPi);
			newPalette.push({
				name: block.name,
				states: {
					...(block.states || {}),
					basi_chest_half: cls.half
				},
				basi_block_shape: shape
			});
		}
		layer0[flat] = newPi;
		pairedCount++;
	}

	if (pairedCount) {
		console.info(
			`[basi] double-chest: ${pairedCount} halves → ${halfPalette.size} unique geo variants`
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
 * @param {boolean} [isDouble]
 */
function chestTexturePath(name, isDouble = false) {
	const n = name.toLowerCase();
	if (n === "trapped_chest") {
		return isDouble ? "textures/entity/chest/trapped_double" : "textures/entity/chest/trapped";
	}
	if (n.includes("copper")) {
		let base = "copper_default";
		if (n.includes("oxidized")) base = "copper_oxidized";
		else if (n.includes("weathered")) base = "copper_weathered";
		else if (n.includes("exposed")) base = "copper_exposed";
		return `textures/entity/chest/${base}${isDouble ? "_double" : ""}`;
	}
	return isDouble ? "textures/entity/chest/double_normal" : "textures/entity/chest/normal";
}

/**
 * In-game large-chest title from a block id.
 * @param {string} name
 */
export function largeChestTitle(name) {
	const n = String(name || "").replace(/^minecraft:/, "").toLowerCase();
	if (n === "trapped_chest") return "Large Trapped Chest";
	if (n.includes("copper") && n.endsWith("_chest")) {
		const words = n
			.replace(/_chest$/, "")
			.split("_")
			.filter(Boolean)
			.map(w => w[0].toUpperCase() + w.slice(1));
		return `Large ${words.join(" ")} Chest`;
	}
	return "Large Chest";
}

/**
 * Combine two 27-slot halves into the 54-slot large-chest order:
 * player-left = rows 0–2 (slots 0–26), player-right = rows 3–5 (slots 27–53).
 * If one half already stores slots ≥ 27, treat that list as the full chest.
 *
 * @param {{ name: string, count: number, slot: number|null }[]} leftItems
 * @param {{ name: string, count: number, slot: number|null }[]} rightItems
 */
export function mergeDoubleChestInventories(leftItems, rightItems) {
	const left = Array.isArray(leftItems) ? leftItems.filter(Boolean) : [];
	const right = Array.isArray(rightItems) ? rightItems.filter(Boolean) : [];
	const maxSlot = Math.max(
		-1,
		...left.map(it => Number(it.slot)),
		...right.map(it => Number(it.slot))
	);
	if (maxSlot >= 27) {
		const source = left.some(it => Number(it.slot) >= 27) ? left : right;
		return source.map(it => ({ ...it }));
	}
	/** @param {{ name: string, count: number, slot: number|null }[]} items @param {number} offset */
	const shift = (items, offset) => {
		let auto = 0;
		const used = new Set();
		return items.map(it => {
			let s = it.slot;
			if (s == null || !Number.isFinite(s) || s < 0 || s > 26 || used.has(s)) {
				while (used.has(auto) && auto < 27) auto++;
				s = auto++;
			}
			used.add(s);
			return { ...it, slot: s + offset };
		});
	};
	return [...shift(left, 0), ...shift(right, 27)];
}

/**
 * After inspect blocks are indexed, pair Bedrock chests (pairx/pairz) and
 * attach combined 54-slot inventories to both halves.
 *
 * @param {Map<string, any>} blocks
 * @param {number} ox structure_world_origin x
 * @param {number} oz structure_world_origin z
 * @returns {number} pair count (halves)
 */
export function linkInspectDoubleChests(blocks, ox, oz) {
	if (!blocks?.size) return 0;
	let n = 0;
	for (const block of blocks.values()) {
		if (block.doubleChest) continue;
		if (block.pairx == null || block.pairz == null) continue;
		if (block.forceunpair === true) continue;
		if (!isChestBlockName(block.name)) continue;

		const pairx = nbtNumber(block.pairx);
		const pairz = nbtNumber(block.pairz);
		if (!Number.isFinite(pairx) || !Number.isFinite(pairz)) continue;
		const px = Math.floor(pairx - Number(ox || 0));
		const pz = Math.floor(pairz - Number(oz || 0));
		const partner = blocks.get(`${px},${block.y},${pz}`);
		if (!partner || partner.pairx == null || partner.pairz == null || partner.doubleChest) continue;
		const backX = Math.floor(nbtNumber(partner.pairx) - Number(ox || 0));
		const backZ = Math.floor(nbtNumber(partner.pairz) - Number(oz || 0));
		if (backX !== block.x || backZ !== block.z) continue;

		const dx = px - block.x;
		const dz = pz - block.z;
		const cls = classifyChestPair(chestFacing(block.states), dx, dz);
		if (!cls) continue;

		const left = cls.half === "left" ? block : partner;
		const right = cls.half === "left" ? partner : block;
		const doubleItems = mergeDoubleChestInventories(left.items || [], right.items || []);
		const leftKey = `${left.x},${left.y},${left.z}`;
		const rightKey = `${right.x},${right.y},${right.z}`;
		left.doubleChest = { half: "left", partnerKey: rightKey };
		right.doubleChest = { half: "right", partnerKey: leftKey };
		left.doubleItems = doubleItems;
		right.doubleItems = doubleItems;
		n += 2;
	}
	return n;
}
