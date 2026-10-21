# ข้อเท็จจริงจาก repository ณ เวลาที่ build

> ภาพ snapshot · commit `4b32208` + การแก้ที่ยังไม่ commit · 2026-10-21T01:41:39+00:00 · ไฟล์ที่ track 447 ไฟล์ · `--check` ไม่เทียบไฟล์นี้แบบไบต์

| ไฟล์ JS | ไบต์ | บรรทัด | Global |
|---|---|---|---|
| app.js | 486,510 | 4,801 | SilaExplorer |
| basemap.js | 18,176 | 318 | SilaBasemap |
| choropleth.js | 3,880 | 67 | SilaScales |
| context-actions.js | 23,291 | 183 | SilaContextActions |
| fabdem-layer.js | 24,785 | 378 | SilaFabdem |
| house-points.js | 7,724 | 142 | SilaHousePoints |
| map-pick.js | 7,190 | 111 | SilaMapPick |
| missions.js | 19,442 | 159 | SilaMissions |
| public-aggregate.js | 12,660 | 75 | SilaPublicAggregates |
| sila-charts.js | 9,379 | 106 | SilaCharts |
| tax-calculator.js | 46,184 | 395 | SilaTaxCalculator |
| tax-engine.js | 35,799 | 359 | SilaTaxEngine |
| terrain-3d.js | 32,122 | 385 | SilaTerrain3D |
| terrain-dem-worker.js | 22,538 | 371 | — |
| ui-icons.js | 58,492 | 22 | SilaIcons |

| ไฟล์ CSS | ไบต์ | บรรทัด |
|---|---|---|
| basemap.css | 787 | 20 |
| context-actions.css | 2,876 | 27 |
| house-points.css | 413 | 3 |
| map-layers.css | 19,289 | 196 |
| missions.css | 4,125 | 42 |
| platform-shell.css | 8,289 | 44 |
| shell.css | 18,608 | 219 |
| styles.css | 31,328 | 1,523 |
| tax-calculator.css | 4,319 | 48 |

| ลำดับใน index.html | ไฟล์พร้อม cache key |
|---|---|
| styles | assets/fonts.css → vendor/leaflet/leaflet.css → vendor/maplibre-gl/maplibre-gl.css → basemap.css?v=1.8.2 → styles.css?v=2.0.0 → house-points.css → context-actions.css → platform-shell.css → missions.css?v=2.0.0 → tax-calculator.css?v=1.8.1 → map-layers.css?v=2.0.0 → shell.css?v=2.0.0 → assets/brand/citychat-motif-motion.css → assets/brand/citychat-header-logo.css |
| scripts | assets/brand/citychat-header-logo.js → vendor/leaflet/leaflet.js → basemap.js → house-points.js → map-pick.js → context-actions.js → ui-icons.js?v=2.0.0 → public-aggregate.js?v=2.0.0 → fabdem-layer.js?v=1.8.2 → terrain-3d.js?v=1.9.0 → choropleth.js?v=1.8 → missions.js?v=2.0.0 → tax-calculator.js?v=1.8 → tax-engine.js?v=2.0.0 → sila-charts.js?v=2.0.1 → vendor/amcharts5/amcharts5-sila.min.js?v=2.0.0 → app.js?v=2.0.1 |

| ไฟล์ข้อมูล | ไบต์ | จำนวน feature |
|---|---|---|
| data/buildings.geojson | 33,435,967 | 38,749 |
| data/businesses.geojson | 375,333 | 661 |
| data/catalog.json | 102,569 | — |
| data/cctv.geojson | 21,188 | 50 |
| data/data-validation.json | 2,401 | — |
| data/education.geojson | 10,198 | 20 |
| data/election-source-lines.geojson | 46,540 | 4 |
| data/election.geojson | 46,671 | 3 |
| data/flood-evidence.json | 23,147 | — |
| data/flood-sites.geojson | 41,498 | 16 |
| data/health.geojson | 2,133 | 4 |
| data/houses.geojson | 16,686,721 | 28,456 |
| data/metadata.json | 46,771 | — |
| data/municipal-summary.json | 61,086 | — |
| data/municipality.geojson | 36,585 | 1 |
| data/parcel-tax.json | 5,077,993 | — |
| data/parcels.geojson | 20,654,770 | 40,920 |
| data/population-grid.geojson | 452,338 | 855 |
| data/population-structure.json | 3,575 | — |
| data/publicfacilities.geojson | 88,645 | 100 |
| data/religion.geojson | 11,526 | 24 |
| data/roads.geojson | 608,803 | 713 |
| data/source-manifest.json | 48,576 | — |
| data/terrain-coverage.geojson | 31,928 | — |
| data/terrain-source.json | 2,877 | — |
| data/villages.geojson | 164,944 | 28 |
| data/waterways.geojson | 416,511 | 110 |

| Receipt | สรุป |
|---|---|
| accessibility-checks | file qa/revision-2.0.2-accessibility-checks.json, views 34, notReadyViews 0, violations 0, tool axe-core 4.10.2 |
| browser-checks | file qa/revision-2.0.2-browser-checks.json, cases 36, notReadyCases 0, pageErrors 0, horizontalOverflowCases 0, legendOverMapCases 0, flowsPassed 8 of 8, browser Chromium 141.0.7390.37 |
| phone-overflow | file qa/revision-2.0.2-phone-overflow.json, runs 112, bad 0 |
| publication-audit | file qa/revision-2.0.2-publication-audit.json, result pass, filesScanned 45, notScanned 0 |

## ส่วนที่เครื่องอ่าน

<!-- SILA_MACHINE_BEGIN -->
```json
{
 "schema": "sila-handoff-facts/1",
 "observedAtUtc": "2026-10-21T01:41:39+00:00",
 "observedCommit": "4b322081ef7677b0deb424727acb38d63408a37a",
 "workingTreeDirty": true,
 "trackedFiles": 447,
 "modules": [
  {
   "file": "app.js",
   "bytes": 486510,
   "lines": 4801,
   "globals": [
    "SilaExplorer"
   ]
  },
  {
   "file": "basemap.js",
   "bytes": 18176,
   "lines": 318,
   "globals": [
    "SilaBasemap"
   ]
  },
  {
   "file": "choropleth.js",
   "bytes": 3880,
   "lines": 67,
   "globals": [
    "SilaScales"
   ]
  },
  {
   "file": "context-actions.js",
   "bytes": 23291,
   "lines": 183,
   "globals": [
    "SilaContextActions"
   ]
  },
  {
   "file": "fabdem-layer.js",
   "bytes": 24785,
   "lines": 378,
   "globals": [
    "SilaFabdem"
   ]
  },
  {
   "file": "house-points.js",
   "bytes": 7724,
   "lines": 142,
   "globals": [
    "SilaHousePoints"
   ]
  },
  {
   "file": "map-pick.js",
   "bytes": 7190,
   "lines": 111,
   "globals": [
    "SilaMapPick"
   ]
  },
  {
   "file": "missions.js",
   "bytes": 19442,
   "lines": 159,
   "globals": [
    "SilaMissions"
   ]
  },
  {
   "file": "public-aggregate.js",
   "bytes": 12660,
   "lines": 75,
   "globals": [
    "SilaPublicAggregates"
   ]
  },
  {
   "file": "sila-charts.js",
   "bytes": 9379,
   "lines": 106,
   "globals": [
    "SilaCharts"
   ]
  },
  {
   "file": "tax-calculator.js",
   "bytes": 46184,
   "lines": 395,
   "globals": [
    "SilaTaxCalculator"
   ]
  },
  {
   "file": "tax-engine.js",
   "bytes": 35799,
   "lines": 359,
   "globals": [
    "SilaTaxEngine"
   ]
  },
  {
   "file": "terrain-3d.js",
   "bytes": 32122,
   "lines": 385,
   "globals": [
    "SilaTerrain3D"
   ]
  },
  {
   "file": "terrain-dem-worker.js",
   "bytes": 22538,
   "lines": 371,
   "globals": []
  },
  {
   "file": "ui-icons.js",
   "bytes": 58492,
   "lines": 22,
   "globals": [
    "SilaIcons"
   ]
  }
 ],
 "css": [
  {
   "file": "basemap.css",
   "bytes": 787,
   "lines": 20
  },
  {
   "file": "context-actions.css",
   "bytes": 2876,
   "lines": 27
  },
  {
   "file": "house-points.css",
   "bytes": 413,
   "lines": 3
  },
  {
   "file": "map-layers.css",
   "bytes": 19289,
   "lines": 196
  },
  {
   "file": "missions.css",
   "bytes": 4125,
   "lines": 42
  },
  {
   "file": "platform-shell.css",
   "bytes": 8289,
   "lines": 44
  },
  {
   "file": "shell.css",
   "bytes": 18608,
   "lines": 219
  },
  {
   "file": "styles.css",
   "bytes": 31328,
   "lines": 1523
  },
  {
   "file": "tax-calculator.css",
   "bytes": 4319,
   "lines": 48
  }
 ],
 "styles": [
  "assets/fonts.css",
  "vendor/leaflet/leaflet.css",
  "vendor/maplibre-gl/maplibre-gl.css",
  "basemap.css?v=1.8.2",
  "styles.css?v=2.0.0",
  "house-points.css",
  "context-actions.css",
  "platform-shell.css",
  "missions.css?v=2.0.0",
  "tax-calculator.css?v=1.8.1",
  "map-layers.css?v=2.0.0",
  "shell.css?v=2.0.0",
  "assets/brand/citychat-motif-motion.css",
  "assets/brand/citychat-header-logo.css"
 ],
 "scripts": [
  "assets/brand/citychat-header-logo.js",
  "vendor/leaflet/leaflet.js",
  "basemap.js",
  "house-points.js",
  "map-pick.js",
  "context-actions.js",
  "ui-icons.js?v=2.0.0",
  "public-aggregate.js?v=2.0.0",
  "fabdem-layer.js?v=1.8.2",
  "terrain-3d.js?v=1.9.0",
  "choropleth.js?v=1.8",
  "missions.js?v=2.0.0",
  "tax-calculator.js?v=1.8",
  "tax-engine.js?v=2.0.0",
  "sila-charts.js?v=2.0.1",
  "vendor/amcharts5/amcharts5-sila.min.js?v=2.0.0",
  "app.js?v=2.0.1"
 ],
 "data": [
  {
   "path": "data/buildings.geojson",
   "bytes": 33435967,
   "features": 38749
  },
  {
   "path": "data/businesses.geojson",
   "bytes": 375333,
   "features": 661
  },
  {
   "path": "data/catalog.json",
   "bytes": 102569
  },
  {
   "path": "data/cctv.geojson",
   "bytes": 21188,
   "features": 50
  },
  {
   "path": "data/data-validation.json",
   "bytes": 2401
  },
  {
   "path": "data/education.geojson",
   "bytes": 10198,
   "features": 20
  },
  {
   "path": "data/election-source-lines.geojson",
   "bytes": 46540,
   "features": 4
  },
  {
   "path": "data/election.geojson",
   "bytes": 46671,
   "features": 3
  },
  {
   "path": "data/flood-evidence.json",
   "bytes": 23147
  },
  {
   "path": "data/flood-sites.geojson",
   "bytes": 41498,
   "features": 16
  },
  {
   "path": "data/health.geojson",
   "bytes": 2133,
   "features": 4
  },
  {
   "path": "data/houses.geojson",
   "bytes": 16686721,
   "features": 28456
  },
  {
   "path": "data/metadata.json",
   "bytes": 46771
  },
  {
   "path": "data/municipal-summary.json",
   "bytes": 61086
  },
  {
   "path": "data/municipality.geojson",
   "bytes": 36585,
   "features": 1
  },
  {
   "path": "data/parcel-tax.json",
   "bytes": 5077993
  },
  {
   "path": "data/parcels.geojson",
   "bytes": 20654770,
   "features": 40920
  },
  {
   "path": "data/population-grid.geojson",
   "bytes": 452338,
   "features": 855
  },
  {
   "path": "data/population-structure.json",
   "bytes": 3575
  },
  {
   "path": "data/publicfacilities.geojson",
   "bytes": 88645,
   "features": 100
  },
  {
   "path": "data/religion.geojson",
   "bytes": 11526,
   "features": 24
  },
  {
   "path": "data/roads.geojson",
   "bytes": 608803,
   "features": 713
  },
  {
   "path": "data/source-manifest.json",
   "bytes": 48576
  },
  {
   "path": "data/terrain-coverage.geojson",
   "bytes": 31928
  },
  {
   "path": "data/terrain-source.json",
   "bytes": 2877
  },
  {
   "path": "data/villages.geojson",
   "bytes": 164944,
   "features": 28
  },
  {
   "path": "data/waterways.geojson",
   "bytes": 416511,
   "features": 110
  }
 ],
 "receipts": {
  "accessibility-checks": {
   "file": "qa/revision-2.0.2-accessibility-checks.json",
   "views": 34,
   "notReadyViews": 0,
   "violations": 0,
   "tool": "axe-core 4.10.2"
  },
  "browser-checks": {
   "file": "qa/revision-2.0.2-browser-checks.json",
   "cases": 36,
   "notReadyCases": 0,
   "pageErrors": 0,
   "horizontalOverflowCases": 0,
   "legendOverMapCases": 0,
   "flowsPassed": "8 of 8",
   "browser": "Chromium 141.0.7390.37"
  },
  "phone-overflow": {
   "file": "qa/revision-2.0.2-phone-overflow.json",
   "runs": 112,
   "bad": 0
  },
  "publication-audit": {
   "file": "qa/revision-2.0.2-publication-audit.json",
   "result": "pass",
   "filesScanned": 45,
   "notScanned": 0
  }
 },
 "note": "Snapshot taken when the handoff was built; --check does not compare it byte for byte."
}
```
<!-- SILA_MACHINE_END -->
