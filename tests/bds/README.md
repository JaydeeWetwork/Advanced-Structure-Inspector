# Local Bedrock Dedicated Server (optional)

Download from [Minecraft Bedrock Dedicated Server](https://www.minecraft.net/en-us/download/server/bedrock) (Minecraft EULA). Example extract used locally: `bedrock-server-1.26.51.1`.

**Do not commit** the `.exe`, worlds, or unpacked packs. This folder is gitignored except this README.

This tree is **not** used for ASI preview meshes or textures. Vanilla look comes from `Mojang/bedrock-samples` (runtime CDN, `src/data/packPins.js`) plus ASI `blockShapes.json` / `blockShapeGeos.json`. BDS has no block `.geo.json`; its `shapes.brarchive` files are culling AABBs, not models.

Local uses only: save `.mcstructure` goldens, Pack Optimizer experiments, in-game checks of custom packs.
