/**
 * Hopper lock statistics from structure NBT / inspect index.
 *
 * Bedrock hopper block states:
 *   - facing_direction: 0=down, 2=N, 3=S, 4=W, 5=E
 *   - toggle_bit: true/1 when the hopper is powered (locked) by redstone
 *
 * Hopper minecarts: no toggle_bit. They stop transferring when on a powered
 * activator rail; that is usually not baked into structure entity state.
 * We still count hopper minecarts; Enabled NBT is used when present.
 */

/**
 * @param {string|undefined|null} id
 */
function stripNs(id) {
	if (!id || typeof id !== "string") return "";
	return id.replace(/^minecraft:/, "").toLowerCase();
}

/**
 * @param {unknown} v
 * @returns {boolean|null} null if unknown
 */
function asBool(v) {
	if (v === true || v === 1 || v === "1" || v === "true") return true;
	if (v === false || v === 0 || v === "0" || v === "false") return false;
	return null;
}

/**
 * @typedef {object} HopperStats
 * @property {number} hoppers
 * @property {number} locked
 * @property {number} unlocked
 * @property {number} hopperMinecarts
 * @property {number} hopperMinecartsDisabled
 * @property {number} hopperMinecartsEnabled
 * @property {number} hopperMinecartsUnknown
 */

/**
 * Compute hopper lock stats from an inspect index (preferred) or raw NBT.
 * @param {import("./inspectStructure.js").InspectIndex|null|undefined} inspectIndex
 * @param {any} [rawNbt] optional fallback
 * @returns {HopperStats}
 */
export function computeHopperStats(inspectIndex, rawNbt) {
	/** @type {HopperStats} */
	const stats = {
		hoppers: 0,
		locked: 0,
		unlocked: 0,
		hopperMinecarts: 0,
		hopperMinecartsDisabled: 0,
		hopperMinecartsEnabled: 0,
		hopperMinecartsUnknown: 0
	};

	if (inspectIndex?.blocks) {
		for (const b of inspectIndex.blocks.values()) {
			const name = stripNs(b.name);
			if (name !== "hopper") continue;
			stats.hoppers++;
			const tb = asBool(b.states?.toggle_bit);
			// Also accept powered_bit aliases if ever present
			const powered = tb ?? asBool(b.states?.powered_bit);
			if (powered === true) stats.locked++;
			else stats.unlocked++;
		}
	} else if (rawNbt?.structure) {
		// Fallback scan of palette + indices
		const size = rawNbt.size;
		const sx = Number(size?.[0] ?? 0);
		const sy = Number(size?.[1] ?? 0);
		const sz = Number(size?.[2] ?? 0);
		const palette = rawNbt.structure?.palette?.default?.block_palette ?? [];
		const indices0 = rawNbt.structure?.block_indices?.[0];
		if (indices0 && sx && sy && sz) {
			for (let i = 0; i < sx * sy * sz; i++) {
				const p = Number(indices0[i] ?? -1);
				if (p < 0 || !(p in palette)) continue;
				const name = stripNs(palette[p]?.name);
				if (name !== "hopper") continue;
				stats.hoppers++;
				const tb = asBool(palette[p]?.states?.toggle_bit);
				if (tb === true) stats.locked++;
				else stats.unlocked++;
			}
		}
	}

	const ents = inspectIndex?.entities ?? [];
	for (const e of ents) {
		const id = stripNs(e.identifier);
		if (id !== "hopper_minecart" && id !== "minecart_hopper") continue;
		stats.hopperMinecarts++;
		const raw = e.raw || {};
		const en = asBool(raw.Enabled ?? raw.enabled);
		if (en === false) stats.hopperMinecartsDisabled++;
		else if (en === true) stats.hopperMinecartsEnabled++;
		else stats.hopperMinecartsUnknown++;
	}

	return stats;
}

/**
 * Lightweight hopper scan from a structure file (no material list).
 * Prefer this when only hopperStats is missing on a hydrated catalog entry.
 * @param {File} structureFile
 * @returns {Promise<HopperStats|null>}
 */
export async function scanHopperStatsFromFile(structureFile) {
	try {
		const NBT = await import("nbtify-readonly-typeless");
		const arrayBuffer = await structureFile.arrayBuffer();
		if (!structureFile.size || !arrayBuffer.byteLength) return null;
		let data;
		try {
			data = (await NBT.read(arrayBuffer, { endian: "little", strict: false })).data;
		} catch {
			data = (await NBT.read(arrayBuffer)).data;
		}
		if (!data?.structure) return null;
		// Prefer inspect index when cheap; palette+indices fallback is built into computeHopperStats
		try {
			const { buildInspectIndex } = await import("./inspectStructure.js");
			const inspect = buildInspectIndex(data);
			return computeHopperStats(inspect, data);
		} catch {
			return computeHopperStats(null, data);
		}
	} catch (e) {
		console.warn("[sdb] light hopper scan failed:", e);
		return null;
	}
}

/**
 * Short human-readable summary for the header.
 * @param {HopperStats} s
 * @returns {string}
 */
export function formatHopperStatsLine(s) {
	if (!s.hoppers && !s.hopperMinecarts) return "Hoppers: none";
	const parts = [];
	if (s.hoppers) {
		parts.push(`${s.locked} locked / ${s.hoppers} hoppers`);
	}
	if (s.hopperMinecarts) {
		if (s.hopperMinecartsDisabled || s.hopperMinecartsEnabled) {
			parts.push(
				`${s.hopperMinecarts} hopper carts (${s.hopperMinecartsDisabled} off)`
			);
		} else {
			parts.push(`${s.hopperMinecarts} hopper carts`);
		}
	}
	return parts.join(" · ");
}

/**
 * HTML-friendly multi-part stats for richer header chip.
 * @param {HopperStats} s
 * @returns {{ label: string, detail: string, locked: number, total: number, pct: number }}
 */
export function hopperStatsDisplay(s) {
	const total = s.hoppers;
	const locked = s.locked;
	const pct = total > 0 ? Math.round((locked / total) * 100) : 0;
	let detail = "";
	if (total) {
		const unlocked = s.unlocked;
		detail = `${locked}/${total} · ${unlocked} open`;
		if (s.hopperMinecarts) {
			detail += ` · ${s.hopperMinecarts} cart${s.hopperMinecarts === 1 ? "" : "s"}`;
		}
	} else if (s.hopperMinecarts) {
		detail = `${s.hopperMinecarts} hopper minecart${s.hopperMinecarts === 1 ? "" : "s"}`;
	} else {
		detail = "no hoppers";
	}
	return {
		label: total ? `Hoppers ${pct}% locked` : s.hopperMinecarts ? `Hopper carts ${s.hopperMinecarts}` : "Hoppers 0%",
		detail,
		locked,
		total,
		pct
	};
}
