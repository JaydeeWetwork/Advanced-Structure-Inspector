# Build / cache API

`src/viewer/api/build.js`

Abort helpers and in-memory caches for preview builds. Safe to import from Node tests (no DOM). The product version is `0.1.157` in `src/buildId.js`, not this module.

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
| `throwIfAborted(signal)` | No-op if `signal` is missing. Throws `AbortError` if aborted |
| `isAbortError(err)` | `err.name === "AbortError"` |

Preview jobs use `PreviewSessionManager.beginPreviewJob()`, which creates an `AbortController`. `cancelWork()` aborts that controller and does not dispose parked canvases.

## Caches

| Export | Role |
|--------|------|
| `getCachedFileBuild(file, cacheKey, builder)` | Memoize one promise per `File` while `cacheKey` matches. A rejected promise is dropped |
| `getCachedDataFile(name, loader)` | Memoize a pack or JSON loader by string name (for example `"blockShapes"`). A rejected promise is dropped |
| `clearFileBuildCache(file)` | Drop the build memo for that `File` |
| `clearDataFileCache()` | Drop the name → loader map |
| `clearAllPreviewCaches()` | Clears the data-file map only. File builds stay until `clearFileBuildCache(file)` or until the `File` object is released |

`readMcstructure` has its own `File` WeakMap (see [structure.md](./structure.md)). Icon object URLs are cleared via `resetItemIconCache()` ([icons.md](./icons.md)). `disposeParked(entryId, file)` calls `clearFileBuildCache` when a `File` is passed.
