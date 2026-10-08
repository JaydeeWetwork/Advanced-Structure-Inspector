/**
 * Apply pmmp/BedrockItemUpgradeSchema id/meta remaps to inspect inventory stacks.
 * Items are unversioned; run every schema in filename order (pmmp README).
 */
import { schemaCdnPath } from "./blockUpgradeApply.js";

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

const ITEM_SCHEMA_FOLDER = "id_meta_upgrade_schema";

/**
 * Filename index. Same shape as the block schema list: `path` only when the file
 * is not under id_meta_upgrade_schema/.
 */
async function loadItemSchemaList() {
	const url = new URL("data/itemUpgradeSchemaList.json", location.href).href;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
	const list = await res.json();
	if (!Array.isArray(list)) throw new Error("item schema list is not an array");
	return list;
}

/** @type {Promise<object[]>|null} */
let schemasPromise = null;

/**
 * @param {{ bedrockItemUpgradeSchema: (path: string) => Promise<Response> }} fetchers
 */
export function loadItemUpgradeSchemas(fetchers) {
	if (!schemasPromise) {
		schemasPromise = loadItemSchemaList()
			.then(list => Promise.all(
				list.map(entry =>
					fetchers.bedrockItemUpgradeSchema(schemaCdnPath(entry, ITEM_SCHEMA_FOLDER))
						.then(res => (res.ok ? res.json() : {}))
						.catch(() => ({}))
				)
			))
			.catch(error => {
				schemasPromise = null;
				throw error;
			});
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
