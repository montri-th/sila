# Tools

| Tool | Use |
|---|---|
| `verify-live.py` + `validation-config.json` | after a push: compare every published file with `build-manifest.json` (bytes, SHA-256, MIME) |
| `gen-manifest.py` | before a push: regenerate `build-manifest.json` (`--revision X --date YYYY-MM-DD`), or `--check` that it is current |
| `publication-audit.py` + `publication-audit-allowlist.json` | before a push: scan changed files for personal data, credentials and forbidden keys, and run the data checks (`--since <published commit>`, `--files` with files or folders, or `--all`; `--data-dir` audits a candidate data folder). Files it cannot read (binary without a reviewed rule, or not UTF-8) are listed as notScanned and make the result review |
| `flood/` | offline flood scripts: study points, FABDEM grid, closed low ground (see [flood/README.md](flood/README.md)) |
| `streetview-coverage.py` | offline: which records have Google Street View imagery within 50 m (needs a key in `GOOGLE_MAPS_KEY`; the key is never stored) |
| `repair-crs.py` | reproduce the 1.2 coordinate repair from the authorised raw GIS folders (see below) |
| `handoff/build_handoff.py` | rebuild the developer handoff documents in `docs/handoff/` and `AGENTS.md` from `handoff/*_data.py`, or `--check` that they are current |
| `handoff/task.py` | list the plan's tasks, or print one task as a brief to paste into an AI coding agent (`python3 tools/handoff/task.py R-10`) |

The browser checks live in [`qa/browser/`](../qa/browser/README.md) and the Node checks run with `sh qa/run-unit-checks.sh`.

# Published-file verification

After the exact deployment URL is available, run from the repository root:

```sh
python3 tools/verify-live.py --base-url "$DEPLOYED_SITE_URL" --output qa/live-byte-verification.json
```

The default input is `build-manifest.json`; use `--manifest` or `--config` to select another explicit file. Manifest entries use `{"path":"app.js","sha256":"<64 hex characters>","bytes":123,"mimeTypes":["application/javascript","text/javascript"]}`. If an entry omits `mimeTypes`, the extension policy in `validation-config.json` applies.

The verifier fetches every listed runtime file, excluding the manifest itself. It records 2xx status, final URL after redirects, MIME, nonempty response, exact SHA-256 and byte length. It uses four concurrent workers and retries transient HTTP/transport errors at most twice. Integrity/MIME failures are reported without silent retries. Optional gzip transport is decoded before comparing entity bytes. Missing or failed files produce a failed evidence report and a nonzero exit status.

This proves published source/data byte delivery for that manifest. It does not replace browser interaction, accessibility, visual, or municipal data-accuracy checks. No credentials, Git state, repository settings or deployment settings are changed.

## Reproduce the source-control CRS repair

Install `pyproj`, `pyshp`, `shapely` and `numpy` in a separate GIS environment. Supply the actual authorized raw source folders as explicit inputs; keep them out of this public repository. From the repository root, before generating a new release manifest:

```sh
python3 tools/repair-crs.py --source-root "$PRIMARY_GIS_ROOT" --extra-root "$SUPPLEMENTAL_GIS_ROOT" --dependency-dir "$GIS_DEPENDENCY_DIR" --data-dir data --evidence-output qa/crs-repair-evidence.json
```

Omit `--dependency-dir` when the four libraries are already available to the selected Python interpreter. Primary inputs are the supplied `หมุดโรงเรือน`, `เชฟโรงเรือน`, `ขอบเขตทม.ศิลา` and `แปลงที่ดิน(แผนที่ภาษี)` packages; supplemental input is `สาธารณูปการ`. Existing public data are used as the allowlisted attribute baseline. Raw files remain unchanged.

The tool tests 28,594 numeric house coordinate controls and 38,847 supplied WGS84 footprint reference points, with 12,949 held out. It selects the registered Indian1975 → WGS84 operation (2), corrects three existing source layers that previously used operation (4), generates parcel geometry with source ordinals only, and recomputes all municipality/village/election counts by actual geometry intersections. It does not read parcel DBF attributes or infer ownership/tax status.

Parcel source PRJ remains `UNKNOWN`; the displayed CRS is marked `inferred_control_validated`. Source ordinal 38,721 is a degenerate near-zero-area ring and remains quarantined: 40,368 source records yield 40,367 mapped polygons. Forty-eight mapped geometries receive display-only topology repair. This does not confirm legal boundaries or field accuracy. Review the changed datasets and `qa/crs-repair-evidence.json`, regenerate the release manifest, and then run the separate published-file verifier.
