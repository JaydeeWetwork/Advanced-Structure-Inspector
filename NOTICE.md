# NOTICE

## Adapted Material

This project is **Adapted Material** based on **HoloPrint**:

- Upstream: https://github.com/SuperLlama88888/holoprint  
- Author: SuperLlama88888 and contributors  
- License: [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-nc-sa/4.0/) (CC BY-NC-SA 4.0)

## Modifications

Relative to upstream HoloPrint, this fork:

- Repositions the product as a **structure database viewer** (browse / search / preview)
- Adds a viewer shell under `src/viewer/` and a new primary `src/index.html` / `src/index.js`
- Preserves the original pack-generation UI as `src/holoprintPack.html` + `src/holoprintPack.js`
- Disables upstream Supabase analytics from the viewer entry (viewer does not call Supabase)
- Retains HoloPrint core modules (NBT parse, world/pack extract, geometry, preview, materials)

## License obligations

When you share this project (modified or not):

1. **Attribution** — retain credits to HoloPrint / SuperLlama88888 and this NOTICE  
2. **NonCommercial** — do not use primarily for commercial advantage or monetary compensation  
3. **ShareAlike** — distribute adaptations under CC BY-NC-SA 4.0 (or a compatible license)  
4. Indicate that changes were made  

Full legal text: see `LICENSE`.

Upstream pack terms (HoloPrint `TERMS_OF_USE.md`) apply to packs generated with the pack-generation path; they are not additional mandates for viewer-only features, but still apply if you produce HoloPrint-style packs.
