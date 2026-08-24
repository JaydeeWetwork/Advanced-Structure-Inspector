/**
 * C2 spike: try to load Mojang creator-tools NBT. Not used by the app.
 * Run: node scripts/spike-mct-nbt.mjs
 */
const candidates = [
	"@minecraft/creator-tools",
	"@minecraft/creator-tools/app/src/minecraft/NbtBinary.js"
];

let loaded = false;
for (const spec of candidates) {
	try {
		const mod = await import(spec);
		const keys = Object.keys(mod).slice(0, 20);
		console.log("loaded", spec, "exports:", keys.join(", ") || "(none)");
		loaded = true;
		break;
	} catch (e) {
		console.log("skip", spec, "—", e?.message ?? e);
	}
}

if (!loaded) {
	console.log("No creator-tools NBT in this environment. Keep nbtify-readonly-typeless (C1). See docs/spike-mct-nbt.md");
	process.exit(0);
}
