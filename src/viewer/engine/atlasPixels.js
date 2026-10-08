/**
 * Pixel ops for one atlas image. TextureAtlas owns the packed result.
 */

import { fnv1a, getPixelBytesInSquare, max } from "../../utils.js";

/**
 * Finds the coordinates of the most extreme outer pixels of an image.
 * @param {ImageData} imageData
 * @param {number} [startX] The x-position to start looking at
 * @param {number} [startY] The y-position to start looking at
 * @param {number} [imageW] The width of the portion of the image to look at
 * @param {number} [imageH] The height of the portion of the image to look at
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
 */
export function findMostExtremePixels(imageData, startX = 0, startY = 0, imageW = imageData.width, imageH = imageData.height) {
	let minX = imageData.width, minY = imageData.height, maxX = 0, maxY = 0;
	for(let y = startY; y < startY + imageH; y++) {
		for(let x = startX; x < startX + imageW; x++) {
			let i = (y * imageData.width + x) * 4;
			if(imageData.data[i + 3] > 0) {
				if(x < minX) minX = x;
				if(x > maxX) maxX = x;
				if(y < minY) minY = y;
				if(y > maxY) maxY = y;
			}
		}
	}
	return { minX, minY, maxX, maxY };
}
/**
 * Calculates the FNV-1a hash of all pixels in an image fragment.
 * @param {ImageFragment} imageFragment
 * @returns {number}
 */
export function hashPixels({ imageData, sourceX, sourceY, w, h }) {
	return fnv1a(getPixelBytesInSquare(imageData, sourceX, sourceY, w, h));
}
/**
 * Checks if fragments from two `ImageData`s are exactly the same.
 * @param {ImageData} id1
 * @param {ImageData} id2
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {number} w
 * @param {number} h
 */
export function checkImageDataEquivalence(id1, id2, x1, y1, x2, y2, w, h) {
	for(let y = 0; y < h; y++) {
		for(let x = 0; x < w; x++) {
			let i1 = ((y1 + y) * id1.width + x1 + x) * 4;
			let i2 = ((y2 + y) * id2.width + x2 + x) * 4;
			for(let ch = 0; ch < 4; ch++) {
				if(id1.data[i1 + ch] != id2.data[i2 + ch]) {
					return false;
				}
			}
		}
	}
	return true;
}
/** Add an outline around each texture.
 * @param {OffscreenCanvas} ogCan
 * @param {Rectangle[]} imagePositions
 * @param {bedrockLayersPreviewConfig} config
 * @param {ImageData} [imageData]
 * @returns {OffscreenCanvas}
 */
export function addTextureOutlines(ogCan, imagePositions, config, imageData) {
	let scale = max(1 / config.TEXTURE_OUTLINE_WIDTH, 1);
	let can = new OffscreenCanvas(ogCan.width * scale, ogCan.height * scale);
	
	let ctx = can.getContext("2d");
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(ogCan, 0, 0, can.width, can.height);
	
	imageData ??= ogCan.getContext("2d").getImageData(0, 0, ogCan.width, ogCan.height);
	
	ctx.fillStyle = config.TEXTURE_OUTLINE_COLOR;
	ctx.globalAlpha = config.TEXTURE_OUTLINE_OPACITY;
	
	/** difference: will compare alpha channel difference; threshold: will only look at the second pixel @type {("threshold" | "difference")} */
	const TEXTURE_OUTLINE_ALPHA_DIFFERENCE_MODE = "threshold";
	/** If using difference mode, will draw outline between pixels with at least this much alpha difference; if using threshold mode, will draw outline on pixels next to pixels with an alpha less than or equal to this @type {number} */
	const TEXTURE_OUTLINE_ALPHA_THRESHOLD = 0;
	// @ts-expect-error
	const compareAlpha = (currentPixel, otherPixel) => TEXTURE_OUTLINE_ALPHA_DIFFERENCE_MODE == "difference"? currentPixel - otherPixel >= TEXTURE_OUTLINE_ALPHA_THRESHOLD : otherPixel <= TEXTURE_OUTLINE_ALPHA_THRESHOLD;
	
	imagePositions.forEach(({ x: startX, y: startY, w, h }) => {
		let endX = startX + w;
		let endY = startY + h;
		for(let x = startX; x < endX; x++) {
			for(let y = startY; y < endY; y++) {
				let i = (y * ogCan.width + x) * 4;
				let alpha = imageData.data[i + 3];
				if(alpha == 0) {
					continue;
				}
				let left = x == startX || compareAlpha(alpha, imageData.data[i - 4 + 3]);
				let right = x == endX - 1 || compareAlpha(alpha, imageData.data[i + 4 + 3]);
				let top = y == startY || compareAlpha(alpha, imageData.data[i - ogCan.width * 4 + 3]);
				let bottom = y == endY - 1 || compareAlpha(alpha, imageData.data[i + ogCan.width * 4 + 3]);
				let topLeft = x == startX && y == startY || compareAlpha(alpha, imageData.data[i - 4 - ogCan.width * 4 + 3]);
				let topRight = x == endX - 1 && y == startY || compareAlpha(alpha, imageData.data[i + 4 - ogCan.width * 4 + 3]);
				let bottomLeft = x == startX && y == endY - 1 || compareAlpha(alpha, imageData.data[i - 4 + ogCan.width * 4 + 3]);
				let bottomRight = x == endX - 1 && y == endY - 1 || compareAlpha(alpha, imageData.data[i + 4 + ogCan.width * 4 + 3]);
				if(left) {
					ctx.fillRect(x * scale, y * scale + 1, 1, scale - 2);
				}
				if(right) {
					ctx.fillRect(x * scale + scale - 1, y * scale + 1, 1, scale - 2);
				}
				if(top) {
					ctx.fillRect(x * scale + 1, y * scale, scale - 2, 1);
				}
				if(bottom) {
					ctx.fillRect(x * scale + 1, y * scale + scale - 1, scale - 2, 1);
				}
				if(top || left || topLeft) {
					ctx.fillRect(x * scale, y * scale, 1, 1);
				}
				if(top || right || topRight) {
					ctx.fillRect(x * scale + scale - 1, y * scale, 1, 1);
				}
				if(bottom || left || bottomLeft) {
					ctx.fillRect(x * scale, y * scale + scale - 1, 1, 1);
				}
				if(bottom || right || bottomRight) {
					ctx.fillRect(x * scale + scale - 1, y * scale + scale - 1, 1, 1);
				}
			}
		}
	});
	
	return can;
}
/**
 * Calculates the transparencies of each image fragment.
 * @param {ImageData} imageData
 * @param {Rectangle[]} imageFragments
 * @returns {number[]}
 */
export function getImageFragmentTransparencies(imageData, imageFragments) {
	return imageFragments.map(({ x: startX, y: startY, w, h }) => {
		let totalTransparency = 0;
		for(let x = startX; x < startX + w; x++) {
			for(let y = startY; y < startY + h; y++) {
				let i = (y * imageData.width + x) * 4;
				totalTransparency += 255 - imageData.data[i + 3];
			}
		}
		return totalTransparency / (w * h);
	});
}
export function setCanvasOpacity(can, alpha) {
	let newCan = new OffscreenCanvas(can.width, can.height);
	let ctx = newCan.getContext("2d", {
		willReadFrequently: true
	});
	ctx.globalAlpha = alpha;
	ctx.drawImage(can, 0, 0);
	return newCan;
}
/**
 * Tints some image data.
 * @param {ImageData} imageData
 * @param {Vec3} tint
 * @param {boolean} onlyAlpha If only full opacity pixels should be tinted and transparent pixels made opaque, or not
 * @returns {ImageData}
 */
export function tintImageData(imageData, tint, onlyAlpha = false) {
	let newImageData = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
	let data = newImageData.data;
	for(let i = 0; i < data.length; i += 4) {
		if(!onlyAlpha || data[i + 3] == 255) { // only tint pixels with full opacity. this happens with grass block side, where the top has full opacity and the bottom has 0 opacity.
			data[i] *= tint[0];
			data[i + 1] *= tint[1];
			data[i + 2] *= tint[2];
		}
		if(onlyAlpha) {
			data[i + 3] = 255;
		}
	}
	return newImageData;
}
/**
 * Sets the opacity of pixels in some image data.
 * @param {ImageData} imageData
 * @param {number} opacity 0-1
 * @returns {ImageData}
 */
export function setImageDataOpacity(imageData, opacity) {
	let newImageData = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
	let data = newImageData.data;
	for(let i = 0; i < data.length; i += 4) {
		data[i + 3] *= opacity;
	}
	return newImageData;
}
