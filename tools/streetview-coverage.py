#!/usr/bin/env python3
"""Offline Street View coverage check for the Sila officer site (revision 2.0).

Why: the site's "Street View facing this place" link stands the camera on the road in front of a parcel. Many estate
roads in Sila have no Google imagery, so the link opens a blank (black) panorama. With a Google Maps Platform key the
municipality can run this script offline to learn, per record, whether a panorama exists within 50 m of the viewpoint,
and the site then hides the Street View link where there is none (data/streetview-coverage.json).

Rules:
- The key comes only from the environment (GOOGLE_MAPS_KEY) and is never written to the repository, the output file or
  the web page. The output holds record ids, a boolean and the panorama date only.
- The Street View metadata endpoint is free of charge (no image is fetched); check the current terms before running.
- Run from the repository root:  GOOGLE_MAPS_KEY=... python3 tools/streetview-coverage.py data/parcels.geojson [more.geojson]
- Resume-safe: an existing output file is reused and only missing records are queried.

Output: data/streetview-coverage.json
  {"schema": "sila-streetview-coverage-1", "checkedAt": "...", "radiusM": 50, "source": "outdoor",
   "byRecord": {"<record id>": true|false, ...}, "dates": {"<record id>": "YYYY-MM", ...}, "counts": {...}}
"""
import json, os, sys, time, math, urllib.parse, urllib.request
from datetime import datetime, timezone

OUT = "data/streetview-coverage.json"
ENDPOINT = "https://maps.googleapis.com/maps/api/streetview/metadata"
RADIUS_M = 50


def centroid(geom):
    """Representative point of a feature: the first (outer) ring's bbox centre for polygons, the point itself otherwise."""
    t = geom.get("type")
    if t == "Point":
        return geom["coordinates"]
    ring = geom["coordinates"][0] if t == "Polygon" else max((p[0] for p in geom["coordinates"]), key=len) if t == "MultiPolygon" else None
    if not ring:
        return None
    xs = [c[0] for c in ring]; ys = [c[1] for c in ring]
    return [(min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2]


def query(key, lon, lat):
    params = {"location": f"{lat:.6f},{lon:.6f}", "radius": str(RADIUS_M), "source": "outdoor", "key": key}
    with urllib.request.urlopen(ENDPOINT + "?" + urllib.parse.urlencode(params), timeout=20) as r:
        d = json.loads(r.read().decode("utf-8"))
    return d


def main(paths):
    key = os.environ.get("GOOGLE_MAPS_KEY")
    if not key:
        sys.exit("Set GOOGLE_MAPS_KEY in the environment (the key is never stored in the repository).")
    out = {"schema": "sila-streetview-coverage-1", "radiusM": RADIUS_M, "source": "outdoor", "byRecord": {}, "dates": {}}
    if os.path.exists(OUT):
        out = json.load(open(OUT, encoding="utf-8"))
    done = out["byRecord"]
    n_new = 0
    for path in paths:
        fc = json.load(open(path, encoding="utf-8"))
        for f in fc["features"]:
            rid = f["properties"].get("id")
            if not rid or rid in done:
                continue
            c = centroid(f.get("geometry") or {})
            if not c:
                continue
            try:
                d = query(key, c[0], c[1])
            except Exception as e:  # network or quota: stop and keep what we have
                print("stopped at", rid, e); break
            status = d.get("status")
            if status == "OK":
                done[rid] = True
                if d.get("date"):
                    out["dates"][rid] = d["date"]
            elif status == "ZERO_RESULTS":
                done[rid] = False
            else:
                print("skip", rid, status, d.get("error_message", ""))
                if status in ("OVER_QUERY_LIMIT", "REQUEST_DENIED"):
                    break
                continue
            n_new += 1
            if n_new % 200 == 0:
                out["checkedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
                json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
            time.sleep(0.02)
    out["checkedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out["counts"] = {"checked": len(done), "withImagery": sum(1 for v in done.values() if v), "withoutImagery": sum(1 for v in done.values() if v is False)}
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print(out["counts"], "new", n_new, "->", OUT)


if __name__ == "__main__":
    main(sys.argv[1:] or ["data/parcels.geojson"])
