import { lazyLoadAsyncFunctionFactory, max, sleep } from "../../utils.js";
import {
	VANILLA_SAMPLES_TAG,
	VANILLA_SAMPLES_FALLBACK_TAGS,
	BLOCK_UPGRADE_OWNER,
	BLOCK_UPGRADE_REPO,
	BLOCK_UPGRADE_TAG,
	ITEM_UPGRADE_OWNER,
	ITEM_UPGRADE_REPO,
	ITEM_UPGRADE_TAG
} from "../../data/packPins.js";

export {
	VANILLA_SAMPLES_TAG,
	VANILLA_SAMPLES_FALLBACK_TAGS,
	BLOCK_UPGRADE_TAG,
	ITEM_UPGRADE_TAG
};

const vanillaDataFallbacks = VANILLA_SAMPLES_FALLBACK_TAGS.map(tag =>
	createLazyCachingFetcher("VanillaDataFetcher", "Mojang", "bedrock-samples", tag)
);

export default {
	vanillaData: createLazyCachingFetcher("VanillaDataFetcher", "Mojang", "bedrock-samples", VANILLA_SAMPLES_TAG),
	vanillaDataFallbacks,
	bedrockData: createLazyCachingFetcher("BedrockData", "pmmp", "BedrockData", "6.7.0+bedrock-1.26.30"),
	bedrockBlockUpgradeSchema: createLazyCachingFetcher(
		"BlockUpgrader",
		BLOCK_UPGRADE_OWNER,
		BLOCK_UPGRADE_REPO,
		BLOCK_UPGRADE_TAG
	),
	bedrockItemUpgradeSchema: createLazyCachingFetcher(
		"ItemUpgrader",
		ITEM_UPGRADE_OWNER,
		ITEM_UPGRADE_REPO,
		ITEM_UPGRADE_TAG
	)
};

const GITHUB_CDN = "https://cdn.jsdelivr.net/gh";
const CACHE_URL_PREFIX = "https://cache/";
/** jsDelivr 403 is a burst reject, not a missing file. Retry it on the same URL. */
const BAD_STATUS_CODES = [403, 429, 500, 502, 503];
/**
 * cdn.jsdelivr.net serves HTTP/2, so many small files share one connection.
 * 6 was the old HTTP/1.1 per-host cap. 32 left a large atlas waiting in a queue.
 * 64 stays far below the Chrome failure seen around 1600 simultaneous fetches.
 * A wider burst can 403. Those retries use the same URL and do not hold a slot.
 * Cache hits do not take a slot.
 */
export const VANILLA_CDN_SLOTS = 64;
const FETCH_TIMEOUT_MS = 12_000;

/**
 * @param {number} limit
 * @returns {() => Promise<() => void>}
 */
export function createFetchSlotGate(limit) {
	let active = 0;
	/** @type {Array<() => void>} */
	const waiters = [];
	return function acquire() {
		return new Promise(resolve => {
			const start = () => {
				active++;
				let released = false;
				resolve(() => {
					if (released) return;
					released = true;
					active--;
					const next = waiters.shift();
					if (next) next();
				});
			};
			if (active < limit) start();
			else waiters.push(start);
		});
	};
}

const acquireCdnSlot = createFetchSlotGate(VANILLA_CDN_SLOTS);

/**
 * One full download (headers and body).
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function withCdnSlot(fn) {
	return acquireCdnSlot().then(release => {
		return Promise.resolve()
			.then(fn)
			.finally(release);
	});
}

/**
 * @param {Parameters<typeof createCachingFetcher>} args
 */
function createLazyCachingFetcher(...args) {
	return lazyLoadAsyncFunctionFactory(createCachingFetcher, ...args);
}

/**
 * Replay a materialized response. Cache Storage and fetch bodies are one-shot;
 * keeping the bytes in memory lets every caller (atlas, geo, schemas) share one load.
 * @param {{ status: number, statusText: string, headers: [string, string][], buf: ArrayBuffer }} entry
 */
function replayEntry(entry) {
	return new Response(entry.buf, {
		status: entry.status,
		statusText: entry.statusText,
		headers: new Headers(entry.headers)
	});
}

/**
 * @param {Response} res
 */
async function materializeResponse(res) {
	return {
		status: res.status,
		statusText: res.statusText,
		headers: [...res.headers],
		buf: await res.arrayBuffer()
	};
}

/**
 * @param {string} name Internal cache name
 * @param {string} owner GitHub repository owner
 * @param {string} repo GitHub repository name
 * @param {string} version GitHub tag
 */
async function createCachingFetcher(name, owner, repo, version) {
	let cacheName = `${name}@${version}`;
	let baseUrl = `${GITHUB_CDN}/${owner}/${repo}@${version}`;
	let cache = await caches.open(cacheName);

	let oldCacheNames = (await caches.keys()).filter(c => (c.startsWith(`${name}@`) || c.startsWith(`${name}_`)) && c != cacheName);
	sortVersions(oldCacheNames).forEach(oldName => caches.delete(oldName));

	/** @type {Map<string, Promise<{ status: number, statusText: string, headers: [string, string][], buf: ArrayBuffer }>>} */
	let memoryEntries = new Map();

	/**
	 * In-memory replay → current Cache Storage → CDN. Does not copy older pins
	 * into this pin's cache.
	 * @param {string} filename
	 * @returns {Promise<Response>}
	 */
	return async filename => {
		let inflight = memoryEntries.get(filename);
		if(inflight) {
			return replayEntry(await inflight);
		}
		let loadPromise = (async () => {
			let fullUrl = `${baseUrl}/${filename}`;
			let cacheLink = CACHE_URL_PREFIX + filename;
			let res = await cache.match(cacheLink);
			if(BAD_STATUS_CODES.includes(res?.status)) {
				await cache.delete(cacheLink);
				res = undefined;
			}
			if(res) {
				return materializeResponse(res);
			}
			let entry = await loadCdnEntry(fullUrl);
			let fetchAttempsLeft = 5;
			const fetchRetryTimeout = 1000;
			while(BAD_STATUS_CODES.includes(entry.status) && fetchAttempsLeft--) {
				console.debug(`Encountered bad HTTP status ${entry.status} from ${fullUrl}, trying again in ${fetchRetryTimeout}ms`);
				await sleep(fetchRetryTimeout);
				entry = await loadCdnEntry(fullUrl);
			}
			if(BAD_STATUS_CODES.includes(entry.status)) {
				console.error(`Couldn't avoid getting bad HTTP status code ${entry.status} for ${fullUrl}`);
			} else if(entry.status >= 200 && entry.status < 300) {
				await cache.put(cacheLink, replayEntry(entry));
			}
			return entry;
		})();
		memoryEntries.set(filename, loadPromise);
		try {
			let entry = await loadPromise;
			if(BAD_STATUS_CODES.includes(entry.status)) {
				memoryEntries.delete(filename);
			}
			return replayEntry(entry);
		} catch(e) {
			memoryEntries.delete(filename);
			throw e;
		}
	}
}

/**
 * Sorts strings of versions, lowest to highest.
 * @param {string[]} versions
 * @returns {string[]}
 */
function sortVersions(versions) {
	let versionsAndParsed = versions.map(v => [v, Array.from(v.matchAll(/\d+/g)).map(m => +m[0])]);
	versionsAndParsed.sort(([, a], [, b]) => Array(max(a.length, b.length)).fill().map((_, i) => (a[i] ?? 0) - (b[i] ?? 0)).find(d => d) || 0);
	return versionsAndParsed.map(([ver]) => ver);
}

/**
 * @param {unknown} e
 */
function isRetryableFetchError(e) {
	if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
	if (e instanceof TypeError && e.message == "Failed to fetch") return true; // Chrome drops fetches when too many images are in flight.
	const name = /** @type {{ name?: string }} */ (e)?.name;
	return name === "TimeoutError" || name === "AbortError";
}

/**
 * One CDN download. The slot covers headers and body only.
 * A timeout or a dropped fetch waits outside the slot, then tries again.
 * @param {string} url
 * @returns {Promise<{ status: number, statusText: string, headers: [string, string][], buf: ArrayBuffer }>}
 */
async function loadCdnEntry(url) {
	const maxFetchAttempts = 3;
	const fetchRetryTimeout = 500;
	let lastError;
	for(let i = 0; i < maxFetchAttempts; i++) {
		try {
			return await withCdnSlot(async () => materializeResponse(await fetch(url, {
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
			})));
		} catch(e) {
			lastError = e;
			if(!isRetryableFetchError(e) || i === maxFetchAttempts - 1) {
				console.error(`Failed to fetch resource at ${url} after ${i + 1} attempts...`);
				throw e;
			}
			console.debug(`Failed to fetch resource at ${url}, trying again in ${fetchRetryTimeout}ms`);
			await sleep(fetchRetryTimeout);
		}
	}
	throw lastError;
}