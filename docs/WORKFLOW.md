# Local workflow habits (1–6)

Local-only repo: no `origin` / HoloPrint `upstream` required. Branches: **dev** → **staging** → **main**. See [BRANCHING.md](./BRANCHING.md).

## 1. Commit often on `dev`

- Prefer small commits with clear subjects: `feat:`, `fix:`, `perf:`, `docs:`, `test:`.
- Commit before long breaks or risky experiments.
- Default branch for all coding: `git checkout dev`.

## 2. Use `staging` for your QA

- When a change set is ready for *you* to click through: merge `dev` → `staging`.
- Run the smoke checklist in BRANCHING.md (boot, small/large structure, camera, chests, icons, unit tests).
- Only merge `staging` → `main` after that review.

## 3. Keep product APIs under `src/viewer/api/`

- App shell (`src/app/`, `src/ui/`) should import from `viewer/api/*` (or thin app modules), not deep into `systems/` or HoloPrint entry points.
- Growing surface today: `icons`, `inventory`, `catalog`, `previewSession`, `build`, `ingest`.
- Map of APIs, classes, and data structures: [API.md](./API.md).
- Future appearance work: see [APPEARANCE_ARCHITECTURE.md](./APPEARANCE_ARCHITECTURE.md) — implement under `viewer/api` + `viewer/appearance` when started.
- Old palette → current ids: [pmmp schema vs BlockUpdater](./pmmp-schema-vs-blockupdater.md) (research).
- Independent renderer (all versions, never-fail draw): [renderer-engine.md](./renderer-engine.md).
- Official vs community sources: [sources-official-vs-community.md](./sources-official-vs-community.md).
- HoloPrint leftover deps: [holoprint-deps.md](./holoprint-deps.md).
- Decide next: [NEXT.md](./NEXT.md). Index: [README.md](./README.md). MCT NBT spike: [spike-mct-nbt.md](./spike-mct-nbt.md).
- Authoring core (editors + official-shaped documents): [AUTHORING_CORE.md](./AUTHORING_CORE.md). File-type vs jargon vs `.brarchive`: [BEDROCK_ARCHIVES.md](./BEDROCK_ARCHIVES.md). nbtify gates: [NBT_VALIDATION.md](./NBT_VALIDATION.md). Findings / plan: [sec_nbt_findings.md](./sec_nbt_findings.md), [sec_nbt_plan.md](./sec_nbt_plan.md).

## 4. Cache-bust browser modules

- Bump `?v=…` on `src/index.html` (script + CSS) when shipping user-visible JS/CSS.
- Prefer also busting deep imports that browsers cache aggressively (e.g. `itemIconLoader.js?v=…`, `systems/index.js?v=…`).
- Pattern in tree: `judoN` (increment on user-facing drops).

## 5. Backup without a remote

- This machine may be the only copy. Occasionally run:

```powershell
powershell -File scripts/backup-local.ps1
```

- Creates a timestamped zip under `../structure-db-viewer-backups/` (sibling of the repo).
- Optional: Windows File History / cloud folder on the parent directory.

## 6. Risky experiments on throwaway branches

```powershell
git checkout dev
git checkout -b experiment/short-name
# try stuff; commit if useful
git checkout dev
git merge experiment/short-name   # if good
# or:
git branch -D experiment/short-name  # if abandoned
```

Never land half-broken experiments on `main`.
