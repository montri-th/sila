#!/usr/bin/env python3
"""Fetch FABDEM terrarium tiles around the Sila municipality and decode them into one elevation grid.

Inputs come from the repository: the tile URL template from data/terrain-source.json and the bounding box of
data/municipality.geojson, widened by --buffer-m so that water can drain out across the edge of the study area.
Output: an .npz file (elev float32 metres with NaN for no data, plus the tile georeference) for closed_low_ground.py.

Usage (repository root; needs numpy and pillow):
    python3 tools/flood/fetch_fabdem_tiles.py --cache-dir <dir outside the repo> --out <dir>/grid.npz

FABDEM is CC BY-NC-SA 4.0 (non-commercial). Keep the attribution in data/terrain-source.json with any output.
Tiles already in --cache-dir are reused, so a second run needs no network. Requests carry a User-Agent naming this
tool: the tile server answers 403 to urllib's default one. If any tile fails, or every cell is no data, no grid is
written and the exit status is 1, so closed_low_ground.py never runs on an empty grid.
"""
import argparse
import json
import math
import os
import sys
import urllib.request

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
USER_AGENT = "sila-flood-tools/1.0 (+https://github.com/montri-th/sila)"


def municipality_bbox():
    with open(os.path.join(ROOT, "data", "municipality.geojson"), encoding="utf-8") as f:
        fc = json.load(f)
    xs, ys = [], []

    def walk(c):
        if isinstance(c[0], (int, float)):
            xs.append(c[0]); ys.append(c[1])
        else:
            for x in c:
                walk(x)
    for ft in fc["features"]:
        walk(ft["geometry"]["coordinates"])
    return [min(xs), min(ys), max(xs), max(ys)]


def tile_xy(lon, lat, z):
    n = 2 ** z
    lr = math.radians(lat)
    return (lon + 180) / 360 * n, (1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * n


def main():
    with open(os.path.join(ROOT, "data", "terrain-source.json"), encoding="utf-8") as f:
        src = json.load(f)
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zoom", type=int, default=12)
    ap.add_argument("--buffer-m", type=float, default=3000)
    ap.add_argument("--tile-url", default=src["tileUrl"])
    ap.add_argument("--cache-dir", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    bbox = municipality_bbox()
    lat_c = (bbox[1] + bbox[3]) / 2
    dlat = args.buffer_m / 111320.0
    dlon = dlat / math.cos(math.radians(lat_c))
    bx0, by0, bx1, by1 = bbox[0] - dlon, bbox[1] - dlat, bbox[2] + dlon, bbox[3] + dlat
    z = args.zoom
    x0, y1 = tile_xy(bx0, by0, z)
    x1, y0 = tile_xy(bx1, by1, z)
    tx0, tx1, ty0, ty1 = int(math.floor(x0)), int(math.floor(x1)), int(math.floor(y0)), int(math.floor(y1))
    print("tiles x", tx0, tx1, "y", ty0, ty1, "count", (tx1 - tx0 + 1) * (ty1 - ty0 + 1))
    os.makedirs(args.cache_dir, exist_ok=True)
    grid = np.full(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), np.nan, dtype=np.float32)
    missing = 0
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            fn = os.path.join(args.cache_dir, f"{z}_{tx}_{ty}.png")
            if not os.path.exists(fn):
                url = args.tile_url.replace("{z}", str(z)).replace("{x}", str(tx)).replace("{y}", str(ty))
                try:
                    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=30) as r:
                        data = r.read()
                    with open(fn, "wb") as fh:
                        fh.write(data)
                except Exception as e:  # report every failed tile, then stop before writing a grid
                    print("tile", tx, ty, "failed:", str(e)[:80], file=sys.stderr)
                    missing += 1
                    continue
            im = np.asarray(Image.open(fn).convert("RGBA")).astype(np.float32)
            elev = im[..., 0] * 256 + im[..., 1] + im[..., 2] / 256 - 32768
            elev[im[..., 3] == 0] = np.nan
            grid[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = elev
    if missing:
        sys.exit(f"{missing} tile(s) failed; no grid written. Fix the network or --tile-url and run again (cached tiles are kept).")
    share = float(np.isnan(grid).mean())
    if share == 1.0:
        sys.exit("every cell is no data; no grid written. Check the tiles in --cache-dir.")
    print("grid", grid.shape, "no-data share", round(share, 4), "min", float(np.nanmin(grid)), "max", float(np.nanmax(grid)))
    np.savez_compressed(args.out, elev=grid, z=z, tx0=tx0, ty0=ty0, tx1=tx1, ty1=ty1)
    print("wrote", args.out)


if __name__ == "__main__":
    main()
