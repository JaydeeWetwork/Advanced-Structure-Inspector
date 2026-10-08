/**
 * Versioned vanilla pack fetch + texture decode cache.
 * Atlas and item icons share this so they do not hit divergent CDN URLs.
 */

import fetchers from "../engine/fetchers.js";
import {
	VANILLA_SAMPLES_TAG,
	VANILLA_SAMPLES_FALLBACK_TAGS
} from "../../data/packPins.js";
import { jsonc, stringToImageData, toImage, toImageData } from "../../utils.js";
import { defaultVersionContext, packTags } from "./VersionContext.js";
import { preferTgaForVanillaPath } from "./vanillaTextureExt.js";

/**
 * Older pins are only for a file the current pin does not have.
 * A 403 or 5xx is a CDN failure on this URL, not a reason to walk tags.
 * @param {number} status
 */
export function walksToNextPackTag(status) {
	return status === 404;
}

/**
 * Remember a success or a real miss. Anything else is retried on the next call.
 * @param {number} status
 */
export function shouldCachePackResult(status) {
	return (status >= 200 && status < 300) || walksToNextPackTag(status);
}

/**
 * Share one in-flight load. Write the settled map only when the status is cacheable.
 * @template T
 * @param {Map<string, Promise<T>>} settled
 * @param {Map<string, Promise<{ value: T, status: number }>>} flight
 * @param {string} key
 * @param {() => Promise<{ value: T, status: number }>} load
 * @returns {Promise<T>}
 */
function cachedResult(settled, flight, key, load) {
	const hit = settled.get(key);
	if (hit) return hit;
	let pending = flight.get(key);
	if (!pending) {
		pending = load().finally(() => {
			if (flight.get(key) === pending) flight.delete(key);
		});
		flight.set(key, pending);
	}
	return pending.then(({ value, status }) => {
		if (shouldCachePackResult(status) && !settled.has(key)) {
			settled.set(key, Promise.resolve(value));
		}
		return value;
	});
}

/**
 * Local color file, `.png` then `.tga`. Not stored in the vanilla decode cache.
 * @param {string} pathNoExt
 * @param {{ getLocalFile?: (path: string) => Blob|File|null }} [stack]
 * @returns {{ imageRes: Response, ext: ".png"|".tga" } | null}
 */
export function readLocalColorFile(pathNoExt, stack) {
	const getLocalFile = stack?.getLocalFile;
	if (typeof getLocalFile !== "function") return null;
	const p = normPath(pathNoExt);
	for (const ext of [".png", ".tga"]) {
		let file = null;
		try {
			file = getLocalFile.call(stack, `${p}${ext}`);
		} catch {
			continue;
		}
		if (file) return { imageRes: new Response(file), ext };
	}
	return null;
}

/**
 * @param {Response|null|undefined} imageRes
 * @param {string|null|undefined} ext
 * @returns {Promise<{ imageData: ImageData, imageIsTga: boolean } | null>}
 */
async function imageDataFromResponse(imageRes, ext) {
	if (imageRes && ext === ".png") {
		const image = await toImage(imageRes);
		return { imageData: await toImageData(image), imageIsTga: false };
	}
	if (imageRes && ext === ".tga") {
		const { default: TGALoader } = await import("tga-js");
		const loader = new TGALoader();
		loader.load(new Uint8Array(await imageRes.arrayBuffer()));
		return { imageData: loader.getImageData(), imageIsTga: true };
	}
	return null;
}


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
	/** @type {Map<string, Promise<{ value: object|null, status: number }>>} */
	#jsonFlight = new Map();
	/** `${tag}:${resource_pack/...}` known missing */
	#missing = new Set();
	/** pathNoExt → Promise<decoded> */
	#decoded = new Map();
	/** @type {Map<string, Promise<{ value: object, status: number }>>} */
	#decodedFlight = new Map();
	/** pathNoExt → object URL (PNG) */
	#iconUrls = new Map();
	#prewarm = null;

	/**
	 * Load pack JSON for the atlas (blocks, terrain, items). Safe to call often.
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
		await Promise.all([
			this.getJson("resource_pack/blocks.json", ctx),
			this.getJson("resource_pack/textures/terrain_texture.json", ctx),
			this.getJson("resource_pack/textures/item_texture.json", ctx)
		]);
		const tag = ctx?.renderPackTag || VANILLA_SAMPLES_TAG;
		console.info(`[bLayers] pack assets ready tag=${tag}`);
	}

	/**
	 * The color extension for this stem. Samples ship one file, never both.
	 * @param {string} pathNoExt
	 * @returns {".png"|".tga"}
	 */
	extensionsToTry(pathNoExt) {
		const p = normPath(pathNoExt);
		return preferTgaForVanillaPath(p) ? ".tga" : ".png";
	}

	/**
	 * Vanilla file under the repo (`resource_pack/...`).
	 * @param {string} filePath
	 * @param {import("./VersionContext.js").BedrockVersionContext} [ctx]
	 * @returns {Promise<{ res: Response|null, tag: string|null, status: number }>}
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
				if (res?.ok) return { res, tag, status: res.status };
				if (walksToNextPackTag(res?.status)) {
					this.#missing.add(missKey);
					continue;
				}
				return { res: null, tag: null, status: res?.status ?? 0 };
			} catch {
				return { res: null, tag: null, status: 0 };
			}
		}
		return { res: null, tag: null, status: 404 };
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
		const tag = ctx?.renderPackTag || VANILLA_SAMPLES_TAG;
		const key = `${tag}:${filePath}`;
		return cachedResult(this.#json, this.#jsonFlight, key, async () => {
			const { res, status } = await this.fetchVanilla(filePath, ctx);
			if (res?.ok) return { value: await jsonc(res), status };
			return { value: null, status };
		});
	}

	/**
	 * One extension, then {@link fetchVanilla} walks pins.
	 * @param {string} pathNoExt pack-relative, no extension
	 * @param {import("./VersionContext.js").BedrockVersionContext} [ctx]
	 * @returns {Promise<{ imageRes: Response|null, ext: string|null, tag: string|null, status: number }>}
	 */
	async fetchTexture(pathNoExt, ctx) {
		await this.prewarm(ctx);
		const p = normPath(pathNoExt);
		const ext = this.extensionsToTry(p);
		const found = await this.fetchVanilla(`${p}${ext}`, ctx);
		if (found.res?.ok) {
			return { imageRes: found.res, ext, tag: found.tag, status: found.status };
		}
		return { imageRes: null, ext: null, tag: null, status: found.status };
	}

	/**
	 * Decode a vanilla PNG/TGA to ImageData. Atlas may use a placeholder on miss.
	 * Local packs are not part of this cache. Use {@link decodeTexturePreferLocal}.
	 * @param {string} pathNoExt
	 * @param {object} [opts]
	 * @param {boolean} [opts.placeholder]
	 * @param {import("./VersionContext.js").BedrockVersionContext} [opts.ctx]
	 */
	decodeTexture(pathNoExt, opts = {}) {
		const p = normPath(pathNoExt);
		const placeholder = opts.placeholder !== false;
		const ctx = opts.ctx ?? defaultVersionContext();
		const tag = ctx.renderPackTag || VANILLA_SAMPLES_TAG;
		const cacheKey = `${tag}|${p}|${placeholder ? "ph" : "noph"}`;
		return cachedResult(this.#decoded, this.#decodedFlight, cacheKey, async () => {
			const { imageRes, ext, status } = await this.fetchTexture(p, ctx);
			const decoded = await imageDataFromResponse(imageRes, ext);
			if (decoded) {
				return { value: { ...decoded, imageNotFound: false }, status };
			}
			return {
				value: {
					imageData: placeholder ? stringToImageData(p) : null,
					imageIsTga: false,
					imageNotFound: true
				},
				status
			};
		});
	}

	/**
	 * Local `.png` then `.tga`, then the vanilla pin. A local hit is not written into the pin cache.
	 * @param {string} pathNoExt
	 * @param {{ getLocalFile?: (path: string) => Blob|File|null }} [stack]
	 * @param {object} [opts]
	 * @param {boolean} [opts.placeholder]
	 * @param {import("./VersionContext.js").BedrockVersionContext} [opts.ctx]
	 */
	async decodeTexturePreferLocal(pathNoExt, stack, opts = {}) {
		const local = readLocalColorFile(pathNoExt, stack);
		if (local) {
			const decoded = await imageDataFromResponse(local.imageRes, local.ext);
			if (decoded) return { ...decoded, imageNotFound: false };
		}
		return this.decodeTexture(pathNoExt, opts);
	}

	/**
	 * Color texture as an image. Local pack first, then the pin.
	 * @param {string} pathNoExt
	 * @param {{ getLocalFile?: (path: string) => Blob|File|null }} [resourcePackStack]
	 * @returns {Promise<HTMLImageElement|null>}
	 */
	async loadColorImage(pathNoExt, resourcePackStack) {
		const { imageData, imageNotFound } = await this.decodeTexturePreferLocal(pathNoExt, resourcePackStack, {
			placeholder: false
		});
		if (imageNotFound || !imageData) return null;
		return toImage(imageData);
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
		if (imageNotFound || !imageData) return null;
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
