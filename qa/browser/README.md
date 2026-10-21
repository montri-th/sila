# Browser checks

Playwright for Python with Chromium. These scripts are the regression net for any change to the interface: run them before and after, and keep the receipts in `qa/`.

## Set up once

```sh
python3 -m pip install playwright==1.56.0
python3 -m playwright install chromium
npm install --prefix qa/browser axe-core@4.10.2   # for run_a11y.py; node_modules is not committed
```

## Run

Start the loopback preview in another terminal (`python3 server.py --port 8768`), or in the background and wait until it answers:

```sh
python3 server.py --port 8768 > /dev/null 2>&1 &
until curl -sf -o /dev/null http://127.0.0.1:8768/; do sleep 0.5; done
```

Then, from the repository root:

| Script | Covers | Pass rule |
|---|---|---|
| `run_matrix.py` | 36 cases at 1440, 1024, 390 and 320 px, Thai and English, dark and light, plus 8 flows: negotiation plan, owners, farmland watch, flood sites, phone sheet, pets separate from care, keyboard focus, 3D defaults | every case reaches ready; no page errors (uncaught errors, console errors, or a same-origin response of 400 or more, such as a file missing from server.py FILES); no sideways scroll; legend never over the map; every flow passes |
| `run_a11y.py` | axe-core on 34 views and opened states (lists, cards, calculator, colour table, settings, phone sheet) | every view reaches ready; zero violations |
| `run_overflow.py` | 14 phone states x Thai and English x 320, 360, 390 and 412 px = 112 runs, with a real touch swipe | nothing wider than the screen, no sideways scroll |

```sh
python3 qa/browser/run_matrix.py --base http://127.0.0.1:8768/ --out qa/revision-X-browser-checks.json --shots /tmp/sila-shots
python3 qa/browser/run_a11y.py --base http://127.0.0.1:8768/ --out qa/revision-X-accessibility-checks.json
python3 qa/browser/run_overflow.py --base http://127.0.0.1:8768/ --out /tmp/sila-overflow.json
```

Use `--only negotiate,phone` to run the cases whose names contain those words (flows run only on a full matrix run). Each script exits 1 when something fails. Receipts are written even when the folder does not exist yet. Every case uses `basemap=none`; the terrain cases still load external FABDEM tiles, so their screenshots can differ between runs.

## Inputs that change with the data

- `fixtures.json`: the sample record ids the checks open (public map ids, no personal data). If a data refresh removes one, pick another id of the same layer.
- `../expected-figures.json`: the city figures and the strings the flows look for. Regenerate after any change to `data/parcel-tax.json` or `tax-engine.js`: `node qa/compute-figures.cjs --out qa/expected-figures.json` (`--check` tells you when it is stale; `sh qa/run-unit-checks.sh` runs that check).

## What these checks do not cover

Real GPU rendering (3D uses software WebGL here), screen readers, real phones, street basemap tiles (tests use `basemap=none`), text contrast over map tiles, and 200% zoom. Check those by hand on the live site and say so in the release notes. Screenshots stay out of the repository.

On 21 Oct 2026 these scripts reproduced the revision 2.0 results on the 2.0.1 tree: 36 cases with no page errors, no sideways scroll and no legend over the map, and all 8 flows passing. The receipts of the 2.0.2 tree are `qa/revision-2.0.2-*.json`.
