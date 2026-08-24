# Docs index — Bedrock ASI research

Local-only. Product: **Bedrock ASI** is the Bedrock structure **renderer / viewer / inspector**. **HoloPrint** is an optional **gameplay hologram-pack export**, not required to see a structure.

## Product & engine (this round of research)

| Doc | What it is |
|-----|------------|
| [renderer-engine.md](./renderer-engine.md) | Independent renderer pipeline; never-fail draw; [BedrockMap](https://github.com/bedrock-dev/BedrockMap) as AGPL **example** (do not copy) |
| [sources-official-vs-community.md](./sources-official-vs-community.md) | Current look = Mojang/Microsoft; back-compat = community (pmmp, etc.) |
| [pmmp-schema-vs-blockupdater.md](./pmmp-schema-vs-blockupdater.md) | pmmp upgrade JSON vs our `BlockUpdater.js` |
| [holoprint-deps.md](./holoprint-deps.md) | What still touches HoloPrint; Path A (drop pack) vs Path B (keep as export) |
| [NEXT.md](./NEXT.md) | Decision menu — next moves, not started until you pick |

## Already in tree (older)

| Doc | What it is |
|-----|------------|
| [APPEARANCE_ARCHITECTURE.md](./APPEARANCE_ARCHITECTURE.md) | Geometry / textures / version context (design, not fully built) |
| [AUTHORING_CORE.md](./AUTHORING_CORE.md) | Editors + official-shaped documents (future) |
| [BEDROCK_ARCHIVES.md](./BEDROCK_ARCHIVES.md) | File types vs `.brarchive` |
| [NBT_VALIDATION.md](./NBT_VALIDATION.md) / [sec_nbt_findings.md](./sec_nbt_findings.md) / [sec_nbt_plan.md](./sec_nbt_plan.md) | nbtify gates |
| [API.md](./API.md) | `viewer/api/*` map |
| [SETUP.md](./SETUP.md) / [WORKFLOW.md](./WORKFLOW.md) / [BRANCHING.md](./BRANCHING.md) | Run, habits, `dev` → `staging` → `main` |

Repo map: [`../FORK.md`](../FORK.md). License: [`../NOTICE.md`](../NOTICE.md).
