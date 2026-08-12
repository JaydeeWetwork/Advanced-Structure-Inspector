/**
 * Abort helpers for long-running preview / import work.
 */

/**
 * @param {AbortSignal|null|undefined} signal
 * @param {string} [message]
 */
export function throwIfAborted(signal, message = "Aborted") {
	if (signal?.aborted) {
		const err = new DOMException(message, "AbortError");
		throw err;
	}
}

/**
 * @param {unknown} e
 * @returns {boolean}
 */
export function isAbortError(e) {
	return (
		(typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError")
		|| (e && typeof e === "object" && "name" in e && /** @type {{name:string}} */ (e).name === "AbortError")
	);
}
