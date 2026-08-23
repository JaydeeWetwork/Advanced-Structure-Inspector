/**
 * Draggable, collapsible overlay window (inspect / sign preview).
 */

/**
 * @param {object} opts
 * @param {HTMLElement} opts.win
 * @param {HTMLElement} opts.bar
 * @param {HTMLElement} [opts.body]
 * @param {HTMLButtonElement|HTMLElement|null} [opts.collapseBtn]
 * @param {HTMLButtonElement|HTMLElement|null} [opts.closeBtn]
 * @param {string} [opts.storageKey]
 * @param {() => void} [opts.onClose]
 */
export function bindFloatingWindow(opts) {
	const win = opts.win;
	const bar = opts.bar;
	if (!win || !bar) return;

	const storageKey = opts.storageKey || "";
	let dragging = false;
	let moved = false;
	let startX = 0;
	let startY = 0;
	let origL = 0;
	let origT = 0;
	let pointerId = null;

	const persist = () => {
		if (!storageKey) return;
		try {
			sessionStorage.setItem(storageKey, JSON.stringify({
				left: win.style.left,
				top: win.style.top,
				collapsed: win.classList.contains("sdb-win-collapsed")
			}));
		} catch {
			/* ignore */
		}
	};

	const restore = () => {
		if (!storageKey) return false;
		try {
			const raw = sessionStorage.getItem(storageKey);
			if (!raw) return false;
			const o = JSON.parse(raw);
			if (o.left && o.top) {
				win.style.left = o.left;
				win.style.top = o.top;
				win.style.right = "auto";
				win.style.bottom = "auto";
				win.style.transform = "none";
				win.classList.add("sdb-win-moved");
			}
			setCollapsed(!!o.collapsed, false);
			return !!(o.left && o.top);
		} catch {
			return false;
		}
	};

	function parentBox() {
		const p = win.offsetParent || win.parentElement;
		return p ? p.getBoundingClientRect() : win.parentElement.getBoundingClientRect();
	}

	function clamp() {
		const pr = parentBox();
		const w = win.offsetWidth;
		const h = win.offsetHeight;
		let left = parseFloat(win.style.left);
		let top = parseFloat(win.style.top);
		if (!Number.isFinite(left) || !Number.isFinite(top)) return;
		const maxL = Math.max(0, pr.width - w);
		const maxT = Math.max(0, pr.height - h);
		left = Math.min(Math.max(0, left), maxL);
		top = Math.min(Math.max(0, top), maxT);
		win.style.left = `${left}px`;
		win.style.top = `${top}px`;
	}

	function placeDefault() {
		if (win.classList.contains("sdb-win-moved") && win.style.left && win.style.top) {
			clamp();
			return;
		}
		const pr = parentBox();
		const w = win.offsetWidth || 320;
		const h = win.offsetHeight || 120;
		win.style.transform = "none";
		win.style.right = "auto";
		win.style.bottom = "auto";
		win.style.left = `${Math.max(8, (pr.width - w) / 2)}px`;
		win.style.top = `${Math.max(8, pr.height - h - 12)}px`;
		clamp();
	}

	function setCollapsed(collapsed, save = true) {
		win.classList.toggle("sdb-win-collapsed", collapsed);
		const btn = opts.collapseBtn;
		if (btn) {
			btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
			btn.textContent = collapsed ? "▸" : "▾";
			btn.title = collapsed ? "Expand" : "Collapse";
		}
		if (save) persist();
	}

	function onPointerDown(e) {
		if (!(e instanceof PointerEvent)) return;
		if (e.button != null && e.button !== 0) return;
		const t = e.target;
		if (t instanceof Element && t.closest("button, a, input, select, textarea")) return;
		dragging = true;
		moved = false;
		pointerId = e.pointerId;
		startX = e.clientX;
		startY = e.clientY;
		const pr = parentBox();
		const r = win.getBoundingClientRect();
		origL = r.left - pr.left;
		origT = r.top - pr.top;
		win.style.left = `${origL}px`;
		win.style.top = `${origT}px`;
		win.style.right = "auto";
		win.style.bottom = "auto";
		win.style.transform = "none";
		win.classList.add("sdb-win-dragging");
		bar.classList.add("is-dragging");
		try {
			bar.setPointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
		e.preventDefault();
		e.stopPropagation();
	}

	function onPointerMove(e) {
		if (!dragging) return;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		if (Math.hypot(dx, dy) > 3) moved = true;
		win.style.left = `${origL + dx}px`;
		win.style.top = `${origT + dy}px`;
		win.classList.add("sdb-win-moved");
		clamp();
	}

	function onPointerUp(e) {
		if (!dragging) return;
		dragging = false;
		win.classList.remove("sdb-win-dragging");
		bar.classList.remove("is-dragging");
		try {
			if (pointerId != null) bar.releasePointerCapture(pointerId);
		} catch {
			/* ignore */
		}
		pointerId = null;
		clamp();
		persist();
		if (moved) e.preventDefault();
	}

	bar.addEventListener("pointerdown", onPointerDown);
	bar.addEventListener("pointermove", onPointerMove);
	bar.addEventListener("pointerup", onPointerUp);
	bar.addEventListener("pointercancel", onPointerUp);
	bar.addEventListener("dblclick", e => {
		if (e.target instanceof Element && e.target.closest("button")) return;
		setCollapsed(!win.classList.contains("sdb-win-collapsed"));
	});

	opts.collapseBtn?.addEventListener("click", e => {
		e.stopPropagation();
		setCollapsed(!win.classList.contains("sdb-win-collapsed"));
	});
	opts.closeBtn?.addEventListener("click", e => {
		e.stopPropagation();
		opts.onClose?.();
	});

	restore();

	return {
		placeDefault,
		clamp,
		setCollapsed,
		persist,
		isCollapsed: () => win.classList.contains("sdb-win-collapsed")
	};
}
