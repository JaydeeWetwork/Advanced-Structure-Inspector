import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	nextReleasesUrl,
	pinDriftLines,
	sameStemList,
	stableTagFromReleaseList,
	tgaStemsFromTree
} from "../../scripts/check-pin-freshness.mjs";

describe("pin freshness", () => {
	it("prints only the pins that differ and the bump command", () => {
		const body = pinDriftLines({
			samplesTag: "v1.26.50.4",
			samplesUpstream: "v1.26.51.0",
			blockTag: "5.3.0",
			blockUpstream: "5.3.0",
			itemTag: "1.18.0",
			itemUpstream: "1.19.0",
			tgaMatches: false
		});
		assert.equal(body, [
			"VANILLA_SAMPLES_TAG v1.26.50.4 upstream v1.26.51.0",
			"ITEM_UPGRADE_TAG 1.18.0 upstream 1.19.0",
			"TGA list differs from upstream v1.26.51.0",
			"npm run bump:pins",
			""
		].join("\n"));
		assert.equal(pinDriftLines({
			samplesTag: "v1.26.50.4",
			samplesUpstream: "v1.26.50.4",
			blockTag: "5.3.0",
			blockUpstream: "5.3.0",
			itemTag: "1.18.0",
			itemUpstream: "1.18.0",
			tgaMatches: true
		}), "");
	});

	it("skips a page of previews and keeps the next-page link on the GitHub API", () => {
		assert.equal(stableTagFromReleaseList([
			{ tag_name: "v1.26.51.1-preview", prerelease: true, draft: false },
			{ tag_name: "v1.26.51.0", prerelease: false, draft: false }
		]), "v1.26.51.0");
		assert.equal(stableTagFromReleaseList([
			{ tag_name: "v1.26.51.1-preview", prerelease: true }
		]), null);
		const link = '<https://api.github.com/repos/Mojang/bedrock-samples/releases?per_page=30&page=2>; rel="next", <https://example.com/releases?page=2>; rel="next"';
		assert.equal(
			nextReleasesUrl(link),
			"https://api.github.com/repos/Mojang/bedrock-samples/releases?per_page=30&page=2"
		);
		assert.equal(nextReleasesUrl(null), null);
	});

	it("compares TGA stems the same way the list is built", () => {
		const stems = tgaStemsFromTree([
			{ path: "resource_pack/textures/blocks/kelp_a.tga" },
			{ path: "resource_pack/textures/blocks/kelp_a_mers.tga" },
			{ path: "resource_pack/texts/en_US.lang" },
			{ path: "resource_pack/textures/blocks/cactus_side.TGA" }
		]);
		assert.deepEqual(stems, [
			"textures/blocks/cactus_side",
			"textures/blocks/kelp_a"
		]);
		assert.equal(sameStemList(new Set(stems), stems), true);
		assert.equal(sameStemList(new Set(["textures/blocks/kelp_a"]), stems), false);
	});
});