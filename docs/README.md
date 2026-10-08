# Docs — Bedrock Layers

Product documentation for the Bedrock structure inspector. Bedrock Layers is co-authored and co-developed by JaydeeWetwork and Grok Build (xAI).

| Doc | Contents |
|-----|----------|
| [USAGE.md](./USAGE.md) | Hotkeys, catalog, preview, inspect, iPad Safari / touch, common issues |
| [SETUP.md](./SETUP.md) | Install, run, build, tests, troubleshooting |
| [RELEASE.md](./RELEASE.md) | 0.1.157 release notes and summary |
| [apis/README.md](./apis/README.md) | Viewer APIs: catalog, ingest, NBT, inspect, preview, caches |
| [official-resources.md](./official-resources.md) | Mojang/Microsoft sources Bedrock Layers fetches or follows |

License and attribution: [`../NOTICE.md`](../NOTICE.md), [`../LICENSE`](../LICENSE).

The current version is **0.1.157**, from `src/buildId.js`. The title and the `bedrockLayers` field in `package.json` use that number. The first two parts move when Jaydee says so. The last part moves on a user-facing drop.

## Layout

```
src/
  index.html, index.js, buildId.js
  app/            shell: state, import/export, preview lifecycle, PreviewSessionManager
  ui/             docks, camera bar, inspect chrome, editor, touch gestures
  viewer/
    api/          public barrels (app and UI import from here)
    engine/       BlockGeoMaker, polyMeshTemplateFaces, TextureAtlas, EntityGeoMaker,
                  PreviewRenderer, ResourcePackStack, LocalResourcePack, BlockUpdater,
                  fetchers, geoToEngineCubes. Cube math and face UV layout sit beside
                  BlockGeoMaker. Atlas pixel ops sit beside TextureAtlas. Terrain keys
                  and the stitch live in atlasComposer.js. The loading message and
                  options panel live in previewLoadingChrome.js
    systems/      preview systems constructed by PreviewRenderer
    core/nbt/     mcstructureCodec.js re-exports read, write, limits, validate, and inflate.
                  Tag typing stays in mcstructureTyped.js
    screens/      chrome, catalog, detail, stage, camera, inspect, canvas (viewer.css import order)
    appearance/   PackAssetStore, VersionContext
  vendor/         nbtify-readonly-typeless 1.1.2, the product reader
  material/       compileMaterial.js — shared block-to-item counts for the viewer list and the pack
  pack/           hologram pack generator (not the inspector API)
  data/           packPins.js (render tag), schemaPins.js (upgrade schemas),
                  shape tables, schema lists, item icons, taxonomy
  styles/, translations/, types.js, utils/, components/LilGui.js
  holoprint/      redirects to the pack page only
```

`src/types.js` holds the shared JSDoc types, including `MCStructure`. The inspector does not import `src/pack/`.

`src/viewer/viewer.css` imports the sheets in `src/viewer/screens/` in cascade order. Catalog, inspect, container UI, ingest, recipes, item icons, and the codec keep their previous module paths and re-export the split files.

`src/viewer/catalog.js` still owns the maps. Structure rows are `CatalogEntryBook` in `catalogEntries.js`. Categories, function-entries, and features stay in `catalogTaxonomy.js`. Those two read one store on the catalog. `AtlasComposer` returns the stitched size, fill, pixels, and UVs. `TextureAtlas` assigns those fields and still owns image load, the cache, and pack export. `PreviewLoadingChrome` builds the loading message and the options panel. `PreviewRenderer` still owns the scene.

## Preview behavior

Preview blocks are full size. Volume glass, stained glass, water, and ice use front faces and write depth. A face with zero thickness is a double-sided card. Water and lava on the waterlog layer are drawn just inside the cell so stairs and slabs do not flicker. Fence posts that share an edge inside the structure grow rails. Glass panes are a thin center post, plus an arm toward another pane, iron bars, or a solid block, including glass. Leaves, barriers, and fences stay unconnected, and iron bars stay a full sheet. Floor coral fans are a low four-blade cross. Wall coral fans are two sheets hinged on the supporting face. Minecarts and cushions more than one block outside the structure box are not drawn. Uncompressed `.mcstructure` format 1 and 2 are accepted. Format 2 may omit an empty waterlog layer. A version 2 root with `compression` 1 stores the `structure` compound as a zlib byte array. That payload is read up to 64 MiB, the checksum must match, and bytes after the stream are rejected. There is no compression-ratio cap. If that array inflates and is not NBT, the file is rejected. Gzip, a zlib wrapper around the whole file, format version 3, any other `compression` value, and NBT nested past 64 levels or past 2,000,000 nodes are rejected. Blocks newer than the upgrade data keep their saved states. The status line says how many, and names the ones with no shape in that same sentence. A world or template database is counted while it inflates, under the same 64 MiB and 1000:1 caps. Sign and book JSON nested past 100 levels is left blank, and a flattened line stops at 8,192 characters.

## Pack generator

The hologram pack generator is `src/pack/`. `HoloPrint.js` re-exports `makePack` and `readStructureNBT`. The build itself is five stages in `makePackStages.js`, with loaders, config, pages, retexture, and hologram motion in the neighboring modules. It is left out of `npm run build`. `npm run build:pack` includes it. The page is `http://localhost:5173/pack/holoprintPack.html`. `/holoprintPack.html` and `/holoprint/holoprintPack.html` redirect there. Generated packs keep the `holoprint:` namespace. See [src/pack/README.md](../src/pack/README.md).

Pins and the pin-bump command are in [SETUP.md](./SETUP.md) and [apis/version.md](./apis/version.md).
