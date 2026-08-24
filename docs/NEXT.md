# Next steps — decide before code

Stay on **`dev`**. Do not `staging` → `main` until you say so.

**Picked 2026-08-23 (not committed — D left):** A1, B1, B2, B3, C1, C2 (spike only), C3.

Research this round is in [README.md](./README.md). Last local backup: sibling folder `structure-db-viewer-backups/` (run `scripts/backup-local.ps1`).

---

## North star (agreed in research, not fully built)

- ASI = renderer + viewer + inspector for Bedrock structures.
- Renderer engine as **independent** as possible ([renderer-engine.md](./renderer-engine.md)).
- **Official** samples for current look; **pmmp** schemas for old palettes ([sources-official-vs-community.md](./sources-official-vs-community.md)).
- HoloPrint = optional **in-game pack export** ([holoprint-deps.md](./holoprint-deps.md)).
- Never fail closed: unmapped block still draws (color cube + diagnostic).

---

## Decision A — HoloPrint

| Option | Move |
|--------|------|
| **A1 Keep export (recommended if you still want holograms)** | Path B: move pack-only components into `src/holoprint/`, fix diagram `WebGL2QuadRenderer` import, add **Export hologram pack** from ASI later, strip supabase from **inspector** importmap only |
| **A2 Drop pack from this repo** | Path A: delete `src/holoprint/`, pack tests/goldens, pipeline pack entry, tracker, pack-only `src/` files. Attribution stays |
| **A3 Defer** | Leave folder isolated; no more isolation work until A1/A2 |

---

## Decision B — renderer robustness (engine)

| Option | Move |
|--------|------|
| **B1 Unmapped-block fallback (smallest product win)** | Appearance miss → unit cube + diagnostic (BedrockMap lesson, reimplemented). Stairs/known shapes unchanged |
| **B2 Pin hygiene** | `fetchers`: samples **stable** tag; upgrade schemas from **pmmp** not SuperLlama; drop `holoprint-repository-tracker`; document packed vs game version |
| **B3 Flatten fixtures** | Tests: 1.21.110-style forgot-to-bump palette + `concrete`/`stonebrick` flatten through `BlockUpdater` ([pmmp-schema-vs-blockupdater.md](./pmmp-schema-vs-blockupdater.md)) |
| **B4 LOD cubes** | Face-culled unit cubes for huge structures (optional, later) |

B1 + B2 are the natural first engine cuts. B3 is test-only. B4 wait.

---

## Decision C — codecs (NBT / LevelDB)

| Option | Move |
|--------|------|
| **C1 Keep** | nbtify + `mcbe-leveldb-reader` (already MCT-lineage LevelDB). Fine |
| **C2 Evaluate MCT** | Spike `@minecraft/creator-tools` `NbtBinary` in browser (tree-shake, EULA on `res/`). No swap until proven |
| **C3 Item upgrade** | Wire `BedrockItemUpgradeSchema` for inspect inventories (separate from blocks) |

Do not block B1/B2 on C2.

---

## Decision D — git / backup

Uncommitted on `dev`: Bedrock ASI rebrand, holoprint isolation, inspect first-hit, judo strip, research docs. **Not committed** (you have not asked).

| Option | Move |
|--------|------|
| **D1 Commit research docs only** | `docs:` commit |
| **D2 Commit engine+isolation+docs** | one or more `feat`/`docs` commits on `dev` |
| **D3 Leave working tree** | backup zip is the snapshot |

---

## Suggested order if you want a default (you can ignore)

1. **D2 or D1** so the tree is named.  
2. **A1 or A3** (do not delete pack unless you say A2).  
3. **B1** never-fail cube.  
4. **B2** pins to official + pmmp.  
5. **B3** when upgrade bugs show up.  
6. **C2/C3/B4** later.

What not to do next: rewrite `BlockGeoMaker` “to not be HoloPrint”; invert `makePack` onto `viewer/api`; copy BedrockMap AGPL source.
