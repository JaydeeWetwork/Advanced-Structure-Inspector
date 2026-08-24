/**
 * Apply pmmp/BedrockItemUpgradeSchema id/meta remaps to inspect inventory stacks.
 * Items are unversioned; run every schema in filename order (pmmp README).
 */

const NS = "minecraft:";

/**
 * @param {string} name
 */
function withNs(name) {
	if (!name) return name;
	return name.includes(":") ? name : NS + name;
}

/**
 * @param {string} name
 */
function stripNs(name) {
	return String(name ?? "").replace(/^minecraft:/, "");
}

/**
 * @param {string} name un-namespaced or namespaced
 * @param {number|null} damage
 * @param {object[]} schemas
 * @returns {{ name: string, damage: number|null }}
 */
export function applyItemUpgradeSchemas(name, damage, schemas) {
	let id = withNs(name);
	let meta = damage == null || damage === "" ? 0 : Number(damage);
	if (!Number.isFinite(meta)) meta = 0;
	for (const schema of schemas) {
		const metaMap = schema.remappedMetas?.[id];
		if (metaMap) {
			const next = metaMap[String(meta)] ?? metaMap[meta];
			if (typeof next === "string") {
				id = next;
				meta = 0;
			}
		}
		if (schema.renamedIds?.[id]) {
			id = schema.renamedIds[id];
		}
	}
	return {
		name: stripNs(id),
		damage: meta === 0 ? (damage == null ? null : 0) : meta
	};
}

/** Schema files in opencollab-incubator/BedrockItemUpgradeSchema id_meta_upgrade_schema/ (sorted). */
export const ITEM_UPGRADE_SCHEMA_FILES = [
	"0001_1.6_beta_to_1.6.0.json",
	"0011_1.11.4_to_1.12.0.json",
	"0021_1.16.0_to_1.16.100.json",
	"0031_1.16.100_to_1.16.200.json",
	"0041_1.16.200_to_1.17.30.json",
	"0051_1.17.40_to_1.18.0.json",
	"0061_1.18.0_to_1.18.10.json",
	"0071_1.18.10_to_1.18.30.json",
	"0081_1.18.30_to_1.19.30.34_beta.json",
	"0091_1.19.60_to_1.19.70.26_beta.json",
	"0101_1.19.70_to_1.19.80.24_beta.json",
	"0111_1.19.80_to_1.20.0.23_beta.json",
	"0121_1.20.0.23_beta_to_1.20.10.24_beta.json",
	"0131_1.20.10.24_beta_to_1.20.20.23_beta.json",
	"0141_1.20.20.23_beta_to_1.20.30.22_beta.json",
	"0151_1.20.30.22_beta_to_1.20.50.23_beta.json",
	"0161_1.20.50.23_beta_to_1.20.60.26_beta.json",
	"0171_1.20.60.26_beta_to_1.20.70.24_beta.json",
	"0181_1.20.70.24_beta_to_1.20.80.24_beta.json",
	"0191_1.20.80.24_beta_to_1.21.0.25_beta.json",
	"0201_1.21.0.25_beta_to_1.21.20.24_beta.json",
	"0211_1.21.20.24_beta_to_1.21.30.24_beta.json",
	"0221_1.21.30.24_beta_to_1.21.40.25.json",
	"0231_1.21.40.25_to_1.21.50.29_beta.json",
	"0241_1.21.50.29_beta_to_1.21.100.23_beta.json",
	"0251_1.21.100.23_beta_to_1.21.110.26_beta.json",
	"0261_1.26.10_to_1.26.20.json"
];

/** @type {Promise<object[]>|null} */
let schemasPromise = null;

/**
 * @param {{ bedrockItemUpgradeSchema: (path: string) => Promise<Response> }} fetchers
 */
export function loadItemUpgradeSchemas(fetchers) {
	if (!schemasPromise) {
		schemasPromise = Promise.all(
			ITEM_UPGRADE_SCHEMA_FILES.map(file =>
				fetchers.bedrockItemUpgradeSchema(`id_meta_upgrade_schema/${file}`)
					.then(res => (res.ok ? res.json() : {}))
					.catch(() => ({}))
			)
		);
	}
	return schemasPromise;
}

export function resetItemUpgradeCache() {
	schemasPromise = null;
}

/**
 * @param {{ name: string, damage: number|null }} stack
 * @param {object[]} schemas
 */
export function upgradeItemStack(stack, schemas) {
	if (!stack?.name) return stack;
	const next = applyItemUpgradeSchemas(stack.name, stack.damage, schemas);
	return { ...stack, name: next.name, damage: next.damage };
}
