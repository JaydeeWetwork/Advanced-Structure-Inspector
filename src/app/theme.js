/**
 * Light / dark Paper theme. Persists explicit choice; otherwise follows OS.
 */

const THEME_KEY = "basi.theme.v1";

/**
 * @returns {"light"|"dark"|null}
 */
export function getSavedTheme() {
	try {
		const t = localStorage.getItem(THEME_KEY);
		if (t === "light" || t === "dark") return t;
	} catch {
		/* ignore */
	}
	return null;
}

/**
 * @returns {"light"|"dark"}
 */
export function resolvedTheme() {
	const saved = getSavedTheme();
	if (saved) return saved;
	try {
		return globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
	} catch {
		return "light";
	}
}

/**
 * @param {"light"|"dark"} theme
 */
export function applyTheme(theme) {
	const root = document.documentElement;
	root.dataset.theme = theme;
	root.style.colorScheme = theme;
	syncThemeButton(theme);
}

/**
 * @param {"light"|"dark"} theme
 */
function syncThemeButton(theme) {
	const btn = document.getElementById("themeBtn");
	if (!btn) return;
	const next = theme === "dark" ? "light" : "dark";
	btn.dataset.theme = theme;
	btn.setAttribute("aria-label", `Switch to ${next} mode`);
	btn.title = `Switch to ${next} mode`;
	btn.textContent = theme === "dark" ? "Light" : "Dark";
}

export function initTheme() {
	applyTheme(resolvedTheme());
	document.getElementById("themeBtn")?.addEventListener("click", () => {
		const next = resolvedTheme() === "dark" ? "light" : "dark";
		try {
			localStorage.setItem(THEME_KEY, next);
		} catch {
			/* ignore */
		}
		applyTheme(next);
	});
	const mq = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
	mq?.addEventListener?.("change", () => {
		if (getSavedTheme()) return;
		applyTheme(resolvedTheme());
	});
}
