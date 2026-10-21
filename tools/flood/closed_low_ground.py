#!/usr/bin/env python3
"""Closed low ground from FABDEM by priority-flood depression filling (Barnes et al. 2014).

depth = filled surface - ground. A cell with depth >= --min-depth is low ground closed in by higher ground on every
side: water reaching it would stand until it rises to the spill level. FABDEM has about 30 m cells and about 1 m
vertical error, and it ignores drains, culverts and built channels, so this is a screening picture of where water can
stand, never a flood forecast or a flood-risk map.

Usage (repository root; needs numpy, scipy and shapely):
    python3 tools/flood/closed_low_ground.py --grid <dir>/grid.npz --out <dir>/flood-lowground.geojson

Publishing rule (SAFE-01 in AGENTS.md): the output stays outside data/ until the owner has reviewed it. The site draws
data/flood-lowground.geojson in the terrain layer only when the file exists. Properties match app.js: depthMaxM,
depthMeanM, spillLevelM, floorM, cells, areaSqm, class (the same five depth classes as the app legend).

No-data cells (NaN) are never filled; water can leave through them like through the grid edge. Exit status 1 when the
grid has no data or no closed low ground is found, so an empty file is never handed on for review.
"""
import argparse
import heapq
import json
import math
import sys

import numpy as np
from scipy import ndimage
from shapely.geometry import box, mapping
from shapely.ops import unary_union

NEIGHBOURS = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]
# Same thresholds and labels as LOWGROUND_CLASSES in app.js (metres of depth at the deepest cell).
CLASSES = [(0.3, "0.3–0.5"), (0.5, "0.5–1"), (1, "1–2"), (2, "2–4"), (4, "≥ 4")]


def depth_class(dmax):
    label = CLASSES[0][1]
    for lo, name in CLASSES:
        if dmax >= lo:
            label = name
    return label


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--grid", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--min-depth", type=float, default=0.3, help="metres")
    ap.add_argument("--min-cells", type=int, default=3)
    ap.add_argument("--simplify", type=float, default=0.00005, help="degrees")
    args = ap.parse_args()
    d = np.load(args.grid)
    elev = d["elev"]
    z, tx0, ty0 = int(d["z"]), int(d["tx0"]), int(d["ty0"])
    h, w = elev.shape
    n = 2 ** z

    def px_to_lonlat(px, py):
        x, y = tx0 + px / 256.0, ty0 + py / 256.0
        return x / n * 360.0 - 180.0, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))

    nodata = np.isnan(elev)
    if nodata.all():
        sys.exit("the grid has no data; run fetch_fabdem_tiles.py again")
    print("no-data share", round(float(nodata.mean()), 4))
    # Priority flood: seed from the outlets (valid cells on the grid edge or next to no data), raise every cell to at
    # least the spill level of its path out. No-data cells start as visited so they are never filled or queued.
    filled = elev.copy()
    visited = nodata.copy()
    heap = []
    near_nodata = ndimage.binary_dilation(nodata, structure=np.ones((3, 3))) & ~nodata
    edge = np.zeros_like(nodata)
    edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
    for i, j in np.argwhere((edge | near_nodata) & ~nodata):
        heapq.heappush(heap, (float(elev[i, j]), int(i), int(j))); visited[i, j] = True
    while heap:
        zz, i, j = heapq.heappop(heap)
        for di, dj in NEIGHBOURS:
            a, b = i + di, j + dj
            if a < 0 or b < 0 or a >= h or b >= w or visited[a, b]:
                continue
            visited[a, b] = True
            level = max(zz, float(elev[a, b]))
            filled[a, b] = level
            heapq.heappush(heap, (level, a, b))
    depth = np.where(nodata, 0.0, filled - elev)
    lat_c = px_to_lonlat(w / 2, h / 2)[1]
    px_m = 40075016.686 * math.cos(math.radians(lat_c)) / (256 * n)
    mask = depth >= args.min_depth
    lab, nlab = ndimage.label(mask, structure=np.ones((3, 3)))
    sizes = ndimage.sum(mask, lab, range(1, nlab + 1))
    print("pixel ~", round(px_m, 1), "m; components", nlab, "kept", int((sizes >= args.min_cells).sum()))
    feats = []
    for k in range(1, nlab + 1):
        if sizes[k - 1] < args.min_cells:
            continue
        sel = lab == k
        dmax, dmean = float(depth[sel].max()), float(depth[sel].mean())
        spill, floor = float(filled[sel].max()), float(elev[sel].min())
        polys = []
        for (i, j) in np.argwhere(sel):
            lon0, lat0 = px_to_lonlat(j, i + 1)
            lon1, lat1 = px_to_lonlat(j + 1, i)
            polys.append(box(lon0, lat0, lon1, lat1))
        geom = unary_union(polys).simplify(args.simplify, preserve_topology=True)
        cls = depth_class(dmax)
        feats.append({"type": "Feature", "properties": {"id": f"low-{k:05d}", "depthMaxM": round(dmax, 2), "depthMeanM": round(dmean, 2),
                                                        "spillLevelM": round(spill, 2), "floorM": round(floor, 2), "cells": int(sizes[k - 1]),
                                                        "areaSqm": int(sizes[k - 1] * px_m * px_m), "class": cls}, "geometry": mapping(geom)})
    feats.sort(key=lambda f: -f["properties"]["areaSqm"])
    fc = {"type": "FeatureCollection", "name": "sila-enclosed-low-ground-fabdem-draft", "features": feats,
          "source": {"dem": f"FABDEM V1-2 z{z} terrarium tiles, ~{px_m:.1f} m pixels at this latitude, 1/256 m decode step",
                     "method": f"priority-flood depression filling (Barnes 2014), 8-connected, depth = filled - ground, cells >= {args.min_depth} m, components >= {args.min_cells} cells",
                     "extent": "municipality bbox plus buffer; edge cells are outlets",
                     "caveat": "FABDEM vertical error ~1 m: screening picture of closed low ground, not a flood-risk map; not reviewed; draft for owner approval before publishing"}}
    if not feats:
        sys.exit("no closed low ground found; check the grid and --min-depth before handing anything on")
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False)
    print("features", len(feats), "->", args.out)


if __name__ == "__main__":
    main()
