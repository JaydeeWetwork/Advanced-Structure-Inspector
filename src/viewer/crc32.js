/**
 * IEEE CRC-32 (ISO 3309 / PNG / ZIP). Hex lowercase, 8 chars.
 */

const TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
	let c = i;
	for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	TABLE[i] = c >>> 0;
}

/**
 * @param {ArrayBuffer|ArrayBufferView|Uint8Array} data
 * @returns {string}
 */
export function crc32Hex(data) {
	const u8 = data instanceof Uint8Array
		? data
		: data instanceof ArrayBuffer
			? new Uint8Array(data)
			: new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	let crc = 0xffffffff;
	for (let i = 0; i < u8.length; i++) {
		crc = TABLE[(crc ^ u8[i]) & 0xff] ^ (crc >>> 8);
	}
	return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}
