/**
 * The app installs a reporter so a failed catalog write can reach the status line.
 * Unit tests leave the default, which does nothing.
 */

/** @type {(message: string) => void} */
let report = () => {};

/** @param {(message: string) => void} fn */
export function setPersistFailureReporter(fn) {
	report = typeof fn === "function" ? fn : () => {};
}

/** @param {string} message */
export function reportPersistFailure(message) {
	if (message) report(message);
}
