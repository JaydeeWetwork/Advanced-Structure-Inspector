/**
 * Walk uncompressed little-endian NBT and reject INT/LONG/LIST lengths
 * that would allocate before remaining-bytes (nbtify F2).
 *
 * Must stay a strict subset of nbtify-readonly-typeless little-endian rules:
 * a payload this walker accepts, nbtify must also be able to reject-or-parse
 * without a huge allocation. Non-empty LIST of TAG_END is invalid (nbtify
 * throws UnexpectedEndTagError); empty LIST of TAG_END is the empty-list form.
 */

const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_SHORT = 2;
const TAG_INT = 3;
const TAG_LONG = 4;
const TAG_FLOAT = 5;
const TAG_DOUBLE = 6;
const TAG_BYTE_ARRAY = 7;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;
const TAG_INT_ARRAY = 11;
const TAG_LONG_ARRAY = 12;

const NUMERIC_LIST_BYTES = {
	[TAG_BYTE]: 1,
	[TAG_SHORT]: 2,
	[TAG_INT]: 4,
	[TAG_LONG]: 8,
	[TAG_FLOAT]: 4,
	[TAG_DOUBLE]: 8
};

/** Minimum encoded size of one list element; used to bound non-numeric LIST loops. */
const LIST_MIN_BYTES = {
	[TAG_BYTE]: 1,
	[TAG_SHORT]: 2,
	[TAG_INT]: 4,
	[TAG_LONG]: 8,
	[TAG_FLOAT]: 4,
	[TAG_DOUBLE]: 8,
	[TAG_BYTE_ARRAY]: 4,
	[TAG_STRING]: 2,
	[TAG_LIST]: 5,
	[TAG_COMPOUND]: 1,
	[TAG_INT_ARRAY]: 4,
	[TAG_LONG_ARRAY]: 4
};

/**
 * @param {ArrayBuffer|ArrayBufferView} buffer
 * @param {(code: string, message: string) => never} fail
 */
export function assertNbtArrayLengths(buffer, fail) {
	const view = buffer instanceof ArrayBuffer
		? new DataView(buffer)
		: new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	let off = 0;
	const remaining = () => view.byteLength - off;
	const need = n => {
		if (n < 0 || remaining() < n) fail("STRUCTURE_NBT_REJECTED", "NBT payload truncated");
	};
	const u8 = () => {
		need(1);
		return view.getUint8(off++);
	};
	const i32 = () => {
		need(4);
		const v = view.getInt32(off, true);
		off += 4;
		return v;
	};
	const u16 = () => {
		need(2);
		const v = view.getUint16(off, true);
		off += 2;
		return v;
	};
	const skip = n => {
		need(n);
		off += n;
	};
	const skipName = () => skip(u16());

	const checkLen = (len, elemBytes, kind) => {
		if (len < 0) fail("STRUCTURE_NBT_REJECTED", `negative ${kind} length`);
		const bytes = len * elemBytes;
		if (!Number.isSafeInteger(bytes) || bytes > remaining()) {
			fail("STRUCTURE_NBT_REJECTED", `${kind} length ${len} exceeds remaining bytes`);
		}
	};

	const skipPayload = type => {
		switch (type) {
			case TAG_END:
				return;
			case TAG_BYTE:
				skip(1);
				return;
			case TAG_SHORT:
				skip(2);
				return;
			case TAG_INT:
			case TAG_FLOAT:
				skip(4);
				return;
			case TAG_LONG:
			case TAG_DOUBLE:
				skip(8);
				return;
			case TAG_BYTE_ARRAY: {
				const len = i32();
				checkLen(len, 1, "BYTE_ARRAY");
				skip(len);
				return;
			}
			case TAG_STRING:
				skip(u16());
				return;
			case TAG_LIST: {
				const et = u8();
				const len = i32();
				if (len < 0) fail("STRUCTURE_NBT_REJECTED", "negative LIST length");
				if (et === TAG_END) {
					if (len !== 0) {
						fail("STRUCTURE_NBT_REJECTED", "non-empty LIST of TAG_END");
					}
					return;
				}
				const min = LIST_MIN_BYTES[et];
				if (min == null) fail("STRUCTURE_NBT_REJECTED", `unknown NBT list type ${et}`);
				checkLen(len, min, "LIST");
				const numeric = NUMERIC_LIST_BYTES[et];
				if (numeric) {
					skip(len * numeric);
					return;
				}
				for (let i = 0; i < len; i++) skipPayload(et);
				return;
			}
			case TAG_COMPOUND:
				while (true) {
					const t = u8();
					if (t === TAG_END) return;
					skipName();
					skipPayload(t);
				}
			case TAG_INT_ARRAY: {
				const len = i32();
				checkLen(len, 4, "INT_ARRAY");
				skip(len * 4);
				return;
			}
			case TAG_LONG_ARRAY: {
				const len = i32();
				checkLen(len, 8, "LONG_ARRAY");
				skip(len * 8);
				return;
			}
			default:
				fail("STRUCTURE_NBT_REJECTED", `unknown NBT tag ${type}`);
		}
	};

	const rootType = u8();
	skipName();
	skipPayload(rootType);
}
