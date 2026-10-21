# Flood tools

Three offline scripts. Run them from the repository root. None of them publishes anything: outputs go where you point them, and a file reaches `data/` only after the owner has reviewed it (rule SAFE-01 in [AGENTS.md](../../AGENTS.md)).

| Script | What it makes | Needs |
|---|---|---|
| `build_flood_sites.py` | `data/flood-sites.geojson`: 16 study points with cause, options, receiving waterway and start order (field `receiver`), first action, coordinate status and survey-route length, quoted from the owner's flood study (v7, 17 Oct 2569) | the study Markdown (not in this repository), `shapely` |
| `fetch_fabdem_tiles.py` | one elevation grid (`.npz`) from FABDEM terrarium tiles around the municipality, using the tile URL in `data/terrain-source.json`; sends its own User-Agent (the tile server refuses urllib's default) and writes no grid if any tile fails | network on the first run, `numpy`, `pillow` |
| `closed_low_ground.py` | closed low ground (depressions filled to their spill level) as GeoJSON with `depthMaxM`, `depthMeanM`, `spillLevelM`, `areaSqm` and the app's five depth classes for the terrain layer; exits 1 on an empty grid or when nothing is found | `numpy`, `scipy`, `shapely` |

```sh
python3 -m pip install numpy scipy shapely pillow   # once
python3 tools/flood/build_flood_sites.py --study "<path to the study .md>" --out data/flood-sites.geojson
python3 tools/flood/fetch_fabdem_tiles.py --cache-dir "$HOME/.cache/sila-fabdem" --out /tmp/sila-grid.npz
python3 tools/flood/closed_low_ground.py --grid /tmp/sila-grid.npz --out /tmp/flood-lowground.geojson
```

Checked on 21 Oct 2026: `build_flood_sites.py` rebuilt the published `data/flood-sites.geojson` byte for byte from the study, and the two FABDEM scripts rebuilt the 2.0 draft (9 tiles at z12, 417 closed areas of at least 3 cells and 0.3 m: 79 at 0.3–0.5 m, 132 at 0.5–1 m, 113 at 1–2 m, 70 at 2–4 m, 23 at 4 m or more). The draft is not in this repository.

## Limits

- FABDEM has about 30 m cells and about 1 m vertical error. It ignores drains, culverts and built channels. The low-ground layer shows where water can stand before it spills; it is not a flood forecast or a flood-risk map.
- FABDEM is licensed CC BY-NC-SA 4.0 (non-commercial). Commercial permission has not been verified (`commercialPermissionVerified: false` in `data/terrain-source.json`). Keep the attribution with any output.
- Flood-site coordinates are mostly approximate (11 matched from the plan's figure, 4 representative of the area, 1 pinned by the coordinator, 0 surveyed). Show the status with every point.
- The study's 10–50 cm scenario pictures are not published. Publishing them, or the low-ground layer, needs the owner's review first.
