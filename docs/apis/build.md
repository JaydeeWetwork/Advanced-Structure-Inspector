# Build / cache API

`src/viewer/api/build.js`

Abort helpers and in-memory caches for preview builds. Safe to import from Node tests (no DOM).

```js
import {
  isAbortError,
  throwIfAborted,
  getCachedFileBuild,
  getCachedDataFile,
  clearFileBuildCache,
  clearDataFileCache,
  clearAllPreviewCaches
} from "./viewer/api/build.js";
```

## Abort

| Export | Role |
|--------|------|
| `throwIfAborted(signal)` | No-op if `signal` is missing; throws `AbortError` if aborted |
| `isAbortError(err)` | `err.name === "AbortError"` |

Preview jobs use `PreviewSessionManager.beginPreviewJob()` which creates an `AbortController`.

## Caches

| Export | Role |
|--------|------|
| `getCachedFileBuild(file, key, loader)` | Memoize work keyed by `File` + string |
| `getCachedDataFile(url, loader)` | Memoize pack/JSON loaders |
| `clearFileBuildCache()` | Drop per-file builds |
| `clearDataFileCache()` | Drop data-file memo |
| `clearAllPreviewCaches()` | Both |

`readMcstructure` has its own `File` WeakMap (see [structure.md](./structure.md)). Icon object URLs are cleared via `resetItemIconCache()` ([icons.md](./icons.md)).
