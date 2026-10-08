/**
 * Compare committed pins with upstream releases. Prints an issue body and
 * exits 2 when a pin is behind. Exits 0 when they match.
 *
 *   node scripts/check-pin-freshness.mjs
 */
import { VANILLA_TGA_PATHS } from "../src/data/vanillaTgaTextures.js";
import { fetchOk, githubTree, isDirectRun, readPackPin } from "./pinScriptUtil.mjs";

const MAX_RELEASE_PAGES = 20;

/**
 * First stable tag on one releases page. Null when the page has none.
 * @param {unknown} releases
 * @returns {string|null}
 */
export function stableTagFromReleaseList(releases) {
	if (!Array.isArray(releases)) return null;
	const stable = releases.find(release => release && release.draft !== true && release.prerelease !== true && release.tag_name);
	return stable ? String(stable.tag_name) : null;
}

/**
 * GitHub Link rel=next, limited to the releases API.
 * @param {string|null|undefined} linkHeader
 * @returns {string|null}
 */
export function nextReleasesUrl(linkHeader) {
	if (!linkHeader) return null;
	for (const part of String(linkHeader).split(",")) {
		const match = part.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
		if (!match) continue;
		const url = match[1];
		if (url.startsWith("https://api.github.com/")) return url;
	}
	return null;
}

/**
 * @param {string} owner
 * @param {string} repo
 */
export async function latestStableReleaseTag(owner, repo) {
	let url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=30`;
	const headers = {
		"User-Agent": "bedrockLayers-pack-index",
		Accept: "application/vnd.github+json"
	};
	if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
	const seen = new Set();
	for (let page = 0; page < MAX_RELEASE_PAGES && url; page++) {
		if (seen.has(url)) break;
		seen.add(url);
		const res = await fetchOk(url, { headers });
		const releases = await res.json();
		if (!Array.isArray(releases)) throw new Error(`${owner}/${repo} releases were not a list`);
		const tag = stableTagFromReleaseList(releases);
		if (tag) return tag;
		url = nextReleasesUrl(res.headers.get("link"));
	}
	throw new Error(`${owner}/${repo} has no stable release`);
}

/**
 * Color TGA stems, matching scripts/index-vanilla-tga.mjs.
 * @param {{ path?: string }[]} tree
 */
export function tgaStemsFromTree(tree) {
	const tga = [];
	for (const node of tree) {
		const path = String(node?.path || "");
		if (!path.startsWith("resource_pack/textures/") || !path.toLowerCase().endsWith(".tga")) continue;
		const stem = path.slice("resource_pack/".length).replace(/\.tga$/i, "");
		if (stem.toLowerCase().endsWith("_mers")) continue;
		tga.push(stem);
	}
	tga.sort();
	return tga;
}

/**
 * @param {Set<string>} committed
 * @param {string[]} upstream
 */
export function sameStemList(committed, upstream) {
	if (!(committed instanceof Set) || committed.size !== upstream.length) return false;
	for (const stem of upstream) {
		if (!committed.has(stem)) return false;
	}
	return true;
}

/**
 * Issue body. Empty when nothing is behind.
 * @param {{ samplesTag: string, samplesUpstream: string, blockTag: string, blockUpstream: string, itemTag: string, itemUpstream: string, tgaMatches: boolean }} report
 */
export function pinDriftLines(report) {
	const lines = [];
	if (report.samplesTag !== report.samplesUpstream) {
		lines.push(`VANILLA_SAMPLES_TAG ${report.samplesTag} upstream ${report.samplesUpstream}`);
	}
	if (report.blockTag !== report.blockUpstream) {
		lines.push(`BLOCK_UPGRADE_TAG ${report.blockTag} upstream ${report.blockUpstream}`);
	}
	if (report.itemTag !== report.itemUpstream) {
		lines.push(`ITEM_UPGRADE_TAG ${report.itemTag} upstream ${report.itemUpstream}`);
	}
	if (!report.tgaMatches) {
		lines.push(`TGA list differs from upstream ${report.samplesUpstream}`);
	}
	if (!lines.length) return "";
	lines.push("npm run bump:pins");
	return `${lines.join("\n")}\n`;
}

export async function checkPinFreshness() {
	const samplesTag = readPackPin("VANILLA_SAMPLES_TAG");
	const blockTag = readPackPin("BLOCK_UPGRADE_TAG");
	const itemTag = readPackPin("ITEM_UPGRADE_TAG");
	const [samplesUpstream, blockUpstream, itemUpstream] = await Promise.all([
		latestStableReleaseTag("Mojang", "bedrock-samples"),
		latestStableReleaseTag("opencollab-incubator", "BedrockBlockUpgradeSchema"),
		latestStableReleaseTag("opencollab-incubator", "BedrockItemUpgradeSchema")
	]);
	const tree = await githubTree("Mojang", "bedrock-samples", samplesUpstream);
	const tgaMatches = sameStemList(VANILLA_TGA_PATHS, tgaStemsFromTree(tree));
	return pinDriftLines({
		samplesTag,
		samplesUpstream,
		blockTag,
		blockUpstream,
		itemTag,
		itemUpstream,
		tgaMatches
	});
}

if (isDirectRun(import.meta.url)) {
	const lines = await checkPinFreshness();
	if (lines) {
		process.stdout.write(lines);
		process.exitCode = 2;
	}
}
