# Spike: Mojang creator-tools NBT (C2)

Status: **evaluate only — no runtime swap.** ASI still reads with `nbtify-readonly-typeless` and worlds with `mcbe-leveldb-reader` (C1).

## What we looked at

- npm `@minecraft/creator-tools` (MIT, Mojang). Docs: `NbtBinary.fromBinary(bytes, littleEndian, isVarint, skipBytes)`.
- GitHub [Mojang/minecraft-creator-tools](https://github.com/Mojang/minecraft-creator-tools) — they do not take community PRs. Bundled `res/` vanilla is **EULA**, not MIT.
- Package is a full creator-tools CLI/web app, not a tiny NBT module. Browser tree-shake of `NbtBinary` + `LevelDb` is unproven.

## Result (this spike)

Do **not** replace nbtify in `parseStructure` / preview until:

1. A named ESM import of `NbtBinary` works from esm.sh or a vendored slice **without** pulling the whole CLI.
2. Little-endian, no-gzip `.mcstructure` round-trip matches `nbtify-readonly-typeless` goldens (Int32Array `size` / `structure_world_origin`).
3. License review of any vendored files (MIT vs EULA assets).

Keep C1. Revisit after a dedicated spike PR with a fixture: `tests/sampleStructures/hoppers.mcstructure`.

Script: `scripts/spike-mct-nbt.mjs` (tries dynamic import; failure is expected).
