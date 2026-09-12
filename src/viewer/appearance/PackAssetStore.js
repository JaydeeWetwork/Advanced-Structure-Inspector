/**
 * Versioned vanilla pack fetch + texture decode cache.
 * Atlas and item icons share this so they do not hit divergent CDN URLs.
 */

import fetchers from "../../fetchers.js";
import {
	VANILLA_SAMPLES_TAG,
	VANILLA_SAMPLES_FALLBACK_TAGS
} from "../../data/packPins.js";
import { jsonc, stringToImageData, toImage, toImageData } from "../../utils.js";
import { defaultVersionContext, packTags } from "./VersionContext.js";

/**
 * @param {string} p
 */
function normPath(p) {
	return String(p || "")
		.replace(/\\/g, "/")
		.replace(/^\//, "")
		.replace(/\.(png|tga)$/i, "");
}

/**
 * @param {string} tag
 */
function fetcherForTag(tag) {
	if (tag === VANILLA_SAMPLES_TAG) return fetchers.vanillaData;
	const i = VANILLA_SAMPLES_FALLBACK_TAGS.indexOf(tag);
	if (i >= 0 && fetchers.vanillaDataFallbacks?.[i]) {
		return fetchers.vanillaDataFallbacks[i];
	}
	return fetchers.vanillaData;
}

export default class PackAssetStore {
	/** @type {Map<string, Promise<object|null>>} */
	#json = new Map();
	/** tag → Map<pathNoExt, ".png"|".tga"|""> */
	#extByTag = new Map();
	/** `${tag}:${resource_pack/...}` known missing */
	#missing = new Set();
	/** pathNoExt → Promise<decoded> */
	#decoded = new Map();
	/** pathNoExt → object URL (PNG) */
	#iconUrls = new Map();
	#prewarm = null;

	/**
	 * Load texture_list + pack JSON for every tag in ctx. Safe to call often.
	 * @param {import("./VersionContext.js").BedrockVersionContext} [ctx]
	 */
	prewarm(ctx) {
		if (!this.#prewarm) {
			this.#prewarm = this.#runPrewarm(ctx).catch(err => {
				this.#prewarm = null;
				throw err;
			});
		}
		return this.#prewarm;
	}

	/**
	 * @param {import("./VersionContext.js").BedrockVersionContext} [ctx]
	 */
	async #runPrewarm(ctx) {
		const tags = packTags(ctx);
		const lists = await Promise.all(tags.map(tag => this.#indexTextureList(tag)));
		await Promise.all([
			this.getJson("resource_pack/blocks.json", ctx),
			this.getJson("resource_pack/textures/terrain_texture.json", ctx),
			this.getJson("resource_pack/textures/item_texture.json", ctx)
		]);
		const n = lists.reduce((a, m) => a + m, 0);
		console.info(
			`[basi] pack assets ready tags=${tags.join(",")} texture_list_entries=${n}`
		);
	}

	/**
	 * @param {string} tag
	 * @returns {Promise<number>}
	 */
	async #indexTextureList(tag) {
		if (this.#extByTag.has(tag)) return this.#extByTag.get(tag).size;
		const map = new Map();
		this.#extByTag.set(tag, map);
		try {
			const fetchTag = fetcherForTag(tag);
			const res = await fetchTag("resource_pack/textures/texture_list.json");
			if (!res?.ok) return 0;
			const data = await jsonc(res);
			const arr = Array.isArray(data)
				? data
				: (data?.texture_list ?? data?.textures ?? []);
			if (!Array.isArray(arr)) return 0;
			for (const entry of arr) {
				const s = String(entry).replace(/\\/g, "/");
				const m = s.match(/^(.*)\.(png|tga)$/i);
				if (m) map.set(normPath(m[1]), `.${m[2].toLowerCase()}`);
				else map.set(normPath(s), "");
			}
		} catch (e) {
			console.debug("[basi] texture_list.json", tag, e);
		}
		return map.size;
	}

	/**
	 * @param {string} pathNoExt
	 * @param {import("./VersionContext.js").BedrockVersionContext} [ctx]
	 * @returns {string[]}
	 */
	extensionsToTry(pathNoExt, ctx) {
		const p = normPath(pathNoExt);
		for (const tag of packTags(ctx)) {
			const known = this.#extByTag.get(tag)?.get(p);
			if (known === ".png" || known === ".tga") return [known];
		}
		return [".png", ".tga"];
	}

	/**
	 * @param {string} tag
	 * @param {string} pathNoExt
	 * @param {string} ext
	 */
	#rememberExt(tag, pathNoExt, ext) {
		let map = this.#extByTag.get(tag);
		if (!map) {
			map = new Map();
			this.#extByTag.set(tag, map);
		}
		map.set(normPath(pathNoExt), ext);
	}

	/**
	 * Vanilla file under the repo (`resource_pack/...`).
	 * @param {string} filePath
	 * @param {import("./VersionContext.js").BedrockVersionContext} [ctx]
	 * @returns {Promise<{ res: Response|null, tag: string|null }>}
	 */
	async fetchVanilla(filePath, ctx) {
		const path = filePath.startsWith("resource_pack/")
			? filePath
			: `resource_pack/${filePath}`;
		for (const tag of packTags(ctx)) {
			const missKey = `${tag}:${path}`;
			if (this.#missing.has(missKey)) continue;
			try {
				const res = await fetcherForTag(tag)(path);
				if (res?.ok) return { res, tag };
				this.#missing.add(missKey);
			} catch {
				this.#missing.add(missKey);
			}
		}
		return { res: null, tag: null };
	}

	/**
	 * @param {string} filePath
	 * @param {import("./VersionContext.js").BedrockVersionContext} [ctx]
	 * @returns {Promise<Response>}
	 */
	async fetchVanillaResponse(filePath, ctx) {
		const { res } = await this.fetchVanilla(filePath, ctx);
		return res ?? new Response(null, { status: 404, statusText: "Not Found" });
	}

	/**
	 * @param {string} filePath
	 * @param {import("./VersionContext.js").BedrockVersionContext} [ctx]
	 */
	getJson(filePath, ctx) {
		const key = filePath;
		if (this.#json.has(key)) return this.#json.get(key);
		const p = this.fetchVanilla(filePath, ctx).then(async ({ res }) => {
			if (!res?.ok) return null;
			return jsonc(res);
		}).catch(err => {
			this.#json.delete(key);
			throw err;
		});
		this.#json.set(key, p);
		return p;
	}

	/**
	 * @param {string} pathNoExt pack-relative, no extension
	 * @param {import("./VersionContext.js").BedrockVersionContext} [ctx]
	 * @param {{ tryLocal?: (pathWithExt: string) => Promise<Response|null>|Response|null }} [opts]
	 */
	async fetchTexture(pathNoExt, ctx, opts = {}) {
		const p = normPath(pathNoExt);
		const exts = this.extensionsToTry(p, ctx);
		if (opts.tryLocal) {
			for (const ext of exts) {
				try {
					const local = await opts.tryLocal(`${p}${ext}`);
					if (local?.ok) return { imageRes: local, ext, tag: "local" };
				} catch {
					/* next */
				}
			}
		}
		for (const tag of packTags(ctx)) {
			const tryExts = this.extensionsToTry(p, { renderPackTag: tag, fallbackPackTags: [] });
			for (const ext of tryExts) {
				const missKey = `${tag}:resource_pack/${p}${ext}`;
				if (this.#missing.has(missKey)) continue;
				const { res } = await this.fetchVanilla(`${p}${ext}`, {
					renderPackTag: tag,
					fallbackPackTags: [],
					label: tag,
					mode: "upgrade"
				});
				if (res?.ok) {
					this.#rememberExt(tag, p, ext);
					return { imageRes: res, ext, tag };
				}
			}
		}
		return { imageRes: null, ext: null, tag: null };
	}

	/**
	 * Decode PNG/TGA to ImageData. Atlas may use a placeholder on miss.
	 * @param {string} pathNoExt
	 * @param {object} [opts]
	 * @param {boolean} [opts.placeholder]
	 * @param {(pathWithExt: string) => Promise<Response|null>|Response|null} [opts.tryLocal]
	 * @param {import("./VersionContext.js").BedrockVersionContext} [opts.ctx]
	 */
	decodeTexture(pathNoExt, opts = {}) {
		const p = normPath(pathNoExt);
		const placeholder = opts.placeholder !== false;
		const cacheKey = `${p}|${placeholder ? "ph" : "noph"}`;
		if (this.#decoded.has(cacheKey)) return this.#decoded.get(cacheKey);
		const promise = (async () => {
			const { imageRes, ext } = await this.fetchTexture(p, opts.ctx ?? defaultVersionContext(), {
				tryLocal: opts.tryLocal
			});
			let imageData;
			let imageIsTga = ext === ".tga";
			let imageNotFound = false;
			if (imageRes && ext === ".png") {
				const image = await toImage(imageRes);
				imageData = await toImageData(image);
			} else if (imageRes && imageIsTga) {
				const { default: TGALoader } = await import("tga-js");
				const loader = new TGALoader();
				loader.load(new Uint8Array(await imageRes.arrayBuffer()));
				imageData = loader.getImageData();
			} else {
				imageNotFound = true;
				imageData = placeholder ? stringToImageData(p) : null;
			}
			return { imageData, imageIsTga, imageNotFound };
		})().catch(err => {
			this.#decoded.delete(cacheKey);
			throw err;
		});
		this.#decoded.set(cacheKey, promise);
		return promise;
	}

	/**
	 * PNG object URL for &lt;img&gt;. Null if missing (no placeholder).
	 * @param {string} pathNoExt
	 * @param {import("./VersionContext.js").BedrockVersionContext} [ctx]
	 * @returns {Promise<string|null>}
	 */
	async getIconObjectUrl(pathNoExt, ctx) {
		const p = normPath(pathNoExt);
		if (this.#iconUrls.has(p)) return this.#iconUrls.get(p);
		const { imageData, imageNotFound } = await this.decodeTexture(p, {
			placeholder: false,
			ctx: ctx ?? defaultVersionContext()
		});
		if (imageNotFound || !imageData) {
			this.#iconUrls.set(p, null);
			return null;
		}
		const can = document.createElement("canvas");
		can.width = imageData.width;
		can.height = imageData.height;
		can.getContext("2d").putImageData(imageData, 0, 0);
		const pngBlob = await new Promise(resolve => can.toBlob(resolve, "image/png"));
		if (!pngBlob) {
			this.#iconUrls.set(p, null);
			return null;
		}
		const url = URL.createObjectURL(pngBlob);
		this.#iconUrls.set(p, url);
		return url;
	}
}

export const packAssetStore = new PackAssetStore();
