import { lazyLoadAsyncFunctionFactory, max, sleep } from "./utils.js";
import {
	VANILLA_SAMPLES_TAG,
	BLOCK_UPGRADE_OWNER,
	BLOCK_UPGRADE_REPO,
	BLOCK_UPGRADE_TAG,
	ITEM_UPGRADE_OWNER,
	ITEM_UPGRADE_REPO,
	ITEM_UPGRADE_TAG
} from "./data/packPins.js";

export {
	VANILLA_SAMPLES_TAG,
	BLOCK_UPGRADE_TAG,
	ITEM_UPGRADE_TAG
};

export default {
	vanillaData: createLazyCachingFetcher("VanillaDataFetcher", "Mojang", "bedrock-samples", VANILLA_SAMPLES_TAG),
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
const BAD_STATUS_CODES = [429, 500, 502, 503];

/**
 * @param {Parameters<typeof createCachingFetcher>} args
 */
function createLazyCachingFetcher(...args) {
	return lazyLoadAsyncFunctionFactory(createCachingFetcher, ...args);
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

	/**
	 * Fetches a file, checking first against cache.
	 * No holoprint-repository-tracker: cache miss always hits the CDN.
	 * @param {string} filename
	 * @returns {Promise<Response>}
	 */
	return async filename => {
		let fullUrl = `${baseUrl}/${filename}`;
		let cacheLink = CACHE_URL_PREFIX + filename;
		let res = await cache.match(cacheLink);
		if(BAD_STATUS_CODES.includes(res?.status)) {
			await cache.delete(cacheLink);
			res = undefined;
		} else if(res) {
			return res;
		}
		res = await retrieve(fullUrl);
		let fetchAttempsLeft = 5;
		const fetchRetryTimeout = 1000;
		while(BAD_STATUS_CODES.includes(res.status) && fetchAttempsLeft--) {
			console.debug(`Encountered bad HTTP status ${res.status} from ${fullUrl}, trying again in ${fetchRetryTimeout}ms`);
			await sleep(fetchRetryTimeout);
			res = await retrieve(fullUrl);
		}
		if(BAD_STATUS_CODES.includes(res.status)) {
			console.error(`Couldn't avoid getting bad HTTP status code ${res.status} for ${fullUrl}`);
		} else if(res.ok) {
			await cache.put(cacheLink, res.clone());
		}
		return res;
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
 * Actually load a file, for when it's not found in cache.
 * @param {string} url
 * @returns {Promise<Response>}
 */
async function retrieve(url) {
	const maxFetchAttempts = 3;
	const fetchRetryTimeout = 500; // ms
	let lastError;
	for(let i = 0; i < maxFetchAttempts; i++) {
		try {
			return await fetch(url);
		} catch(e) {
			if(navigator.onLine && e instanceof TypeError && e.message == "Failed to fetch") { // random Chrome issue when fetching many images at the same time. observed when fetching 1600 images at the same time.
				console.debug(`Failed to fetch resource at ${url}, trying again in ${fetchRetryTimeout}ms`);
				lastError = e;
				await sleep(fetchRetryTimeout);
			} else {
				throw e;
			}
		}
	}
	console.error(`Failed to fetch resource at ${url} after ${maxFetchAttempts} attempts...`);
	throw lastError;
}