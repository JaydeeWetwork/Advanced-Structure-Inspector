# Branch workflow — local only (main / staging / dev)

This project is developed **locally**. There is no required `origin` or HoloPrint `upstream` remote. ASI is moving off HoloPrint public APIs toward its own `viewer/api/*` and future `appearance` layer.

## Branches

| Branch | Role |
|--------|------|
| **`main`** | Stable “good build.” Only update after you’ve reviewed **and** smoke-tested on staging. |
| **`staging`** | Integration / review. Merge finished work from `dev` here for human testing. |
| **`dev`** | Active development. Day-to-day commits and experiments. |

```
  work & commit
       │
       ▼
     dev  ──(you’re happy with the set)──►  staging  ──(you tested it)──►  main
```

## Rules

1. Default checkout for coding: **`dev`**.
2. Don’t put half-broken experiments on **`main`**.
3. Promote **`dev` → `staging`** when a coherent change set is ready for you to review in the browser.
4. Promote **`staging` → `main`** only after *you* have tested (load structures, camera, icons, big packs, etc.).
5. Remotes are optional. If you add one later, it should be *your* ASI repo — not HoloPrint.

## Daily development (local)

```powershell
cd D:\source\repos\structure-db-viewer
git checkout dev

# edit, run app: npm run serve  (or your usual serve src -p 5173)
# tests: node --test tests/viewerUnit/index.js

git add -A
git commit -m "Short description of what changed"
```

Stay on `dev` between sessions.

## Promote to staging (ready for your review)

```powershell
git checkout staging
git merge dev
# fix conflicts if any, then:
# git add -A ; git commit   # only if merge created a commit needed
git checkout dev
```

Then run the app and exercise the features you care about. Note bugs on `dev` with new commits.

If staging is messy and you want to reset it to match dev:

```powershell
git checkout staging
git reset --hard dev
git checkout dev
```

(Only do hard reset if you don’t need unique commits that lived only on staging.)

## Promote to main (after you tested staging)

```powershell
git checkout main
git merge staging
git checkout dev
```

Optional: tag releases when main advances:

```powershell
git checkout main
git tag -a v0.2.0 -m "Double chest, preview systems, local branch flow"
git checkout dev
```

## Hotfix when main is “the good one”

```powershell
git checkout main
git checkout -b hotfix/short-name
# fix + commit
git checkout main
git merge hotfix/short-name
git checkout staging
git merge main
git checkout dev
git merge main
git branch -d hotfix/short-name
```

## Suggested working habits

### Commits on `dev`

- Prefer **small, named commits** over one giant “wip” when possible:
  - `fix: lil-gui guard so preview still loads`
  - `feat: sparse inspect index for large structures`
  - `perf: skip redundant layer rebuild after init`
- Bump `?v=judoN` (or similar) in `index.html` when shipping user-visible module changes so the browser doesn’t keep stale ES modules.

### What to test before `staging` → `main`

Smoke checklist (adjust as the app grows):

- [ ] Boot → catalog loads from IndexedDB  
- [ ] Import / select a small structure → canvas appears  
- [ ] Large structure → progress text, finishes, canvas stays mounted  
- [ ] Camera bar + layer ↑↓  
- [ ] Double chests, item frames, minecart if present  
- [ ] Dbl-click chest → inventory UI + icons (or clear labels)  
- [ ] `node --test tests/viewerUnit/index.js` passes  

### Don’t fight the tree

- Keep uncommitted work on **`dev`** only when short-lived; commit before long breaks or experimental branches.
- For risky experiments: `git checkout -b experiment/foo dev`, then merge or delete.

### Optional later: your own remote

When you want backup or multi-machine (still not HoloPrint):

```powershell
git remote add origin https://github.com/<you>/structure-db-viewer.git
git push -u origin main staging dev
```

Until then, **local branches + occasional tags** are enough. Consider zip/backup of the repo folder or Windows File History if the machine is the only copy.

## Current repo state (setup)

After initial branch setup:

- `main`, `staging`, `dev` exist as long-lived lines.
- Active work happens on **`dev`**.
- No `upstream` / HoloPrint remote is required for this workflow.
