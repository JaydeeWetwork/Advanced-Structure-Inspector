import { awaitAllEntries, conditionallyCacheUnaryFunc, getFileExtension, jsonc, toImage } from "../utils.js";
import fetchers from "../viewer/engine/fetchers.js";

/** @typedef {import("../viewer/engine/ResourcePackStack.js").default} ResourcePackStack */

export const fetchPackTemplateFile = conditionallyCacheUnaryFunc(
	/** @param {string} path @returns {Promise<Response>} */
	function(path) { // typescript doesn't detect the template parameter correctly if it's an arrow function
		return fetch(new URL(`/pack/packTemplate/${path}`, location.origin).href);
	},
	path => path.startsWith("textures/holoprint/icons"), // only cache icon textures. they're fetched in two different places and I couldn't beb bothered to store them in variables somewhere.
	resPromise => resPromise.then(res => res.clone()) // response bodies can only be consumed once, so they must be cloned
);
/**
 * @template {string} F
 * @template {string} [N = ""]
 * @typedef {N extends `_${string}`? Blob : F extends `${string}.json` | `${string}.material`? object : F extends `${string}.lang`? string : F extends `${string}.png`? HTMLImageElement : never} GetFileType
 */
/**
 * @template {Record<string, string>} T
 * @param {{ [K in keyof T]: T[K] }} packTemplateFiles
 */
export function loadPackTemplate(packTemplateFiles) {
	return multiload(packTemplateFiles, fetchPackTemplateFile);
}
/**
 * @template {Record<string, string>} T
 * @param {{ [K in keyof T]: T[K] }} resourceFiles
 * @param {ResourcePackStack} resourcePackStack
 */
export function loadResources(resourceFiles, resourcePackStack) {
	return multiload(resourceFiles, path => resourcePackStack.fetchResource(path));
}

/**
 * @template {Record<string, string>} T
 * @param {{ [K in keyof T]: T[K] }} fileNamesAndPaths
 * @param {(filePath: string) => Promise<Response>} fetchFunc
 * @returns {{ [K in keyof T]: Promise<GetFileType<T[K], K>> } & { allValues: Promise<{ [K in keyof T]: GetFileType<T[K], K> }>, allEntries: Promise<{ [K in keyof T as T[K]]: GetFileType<T[K], K> }> }}
 */
function multiload(fileNamesAndPaths, fetchFunc) {
	let entries = Object.entries(fileNamesAndPaths).filter(([, path]) => path);
	let contents = Object.fromEntries(entries.map(([name, path]) => [name, getResponseContents(fetchFunc(path), path, name.startsWith("_"))]));
	// @ts-ignore
	return {
		...contents,
		allValues: awaitAllEntries(contents),
		allEntries: Promise.all(entries.map(async ([name, path]) => [path, await contents[name]])).then(res => Object.fromEntries(res))
	};
}
/**
 * Loads `/data/<name>.json` for each bare file name.
 * @param {string[]} fileNames
 * @returns {Record<string, Promise<any>> & { all: Promise<Record<string, any>> }}
 */
export function loadDataFiles(fileNames) {
	const res = Object.fromEntries(fileNames.map(fileName => [fileName, fetch(new URL(`/data/${fileName}.json`, location.origin).href).then(body => jsonc(body))]));
	res.all = awaitAllEntries(res);
	return /** @type {Record<string, Promise<any>> & { all: Promise<Record<string, any>> }} */ (res);
}
/**
 * @template T
 * @param {T} files
 * @returns {Promise<Record<keyof T, object>>}
 */
export async function loadBedrockMetadataFiles(files) {
	let fileNamesAndContents = await Promise.all(Object.entries(files).map(async ([shortName, fileName]) => [shortName, await fetchers.vanillaData(`metadata/${fileName}`).then(res => jsonc(res))]));
	return Object.fromEntries(fileNamesAndContents);
}
/**
 * Gets the contents of a response based on the requested file extension (e.g. object from .json, image from .png, etc.).
 * @template {string} T
 * @template {boolean} B
 * @param {Promise<Response>} resPromise
 * @param {T} filePath
 * @param {B} [rawBlob] Whether to return a Blob instead of converting to a more usable object.
 * @returns {Promise<B extends true? Blob : GetFileType<T>>}
 */
async function getResponseContents(resPromise, filePath, rawBlob) {
	let res = await resPromise;
	if(res.status >= 400) {
		throw new Error(`HTTP error ${res.status} for ${res.url}`);
	}
	if(rawBlob) {
		// @ts-expect-error
		return await res.blob();
	}
	let fileExtension = getFileExtension(filePath);
	switch(fileExtension) {
		case "json":
		case "material": return await jsonc(res);
		// @ts-ignore
		case "lang": return await res.text();
		// @ts-ignore
		case "png": return await toImage(res);
	}
}
