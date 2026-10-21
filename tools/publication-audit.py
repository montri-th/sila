#!/usr/bin/env python3
"""Publication audit for the public Sila repository (everything on main is served by GitHub Pages).

Scans text files for personal-data patterns and credential-like strings, scans JSON/GeoJSON keys for forbidden
field names, and runs data checks on the published layers (house-number notes, survey fields, small-cell suppression
of the population grid, juristic-only businesses, random owner codes, no salted keys, no internal roll record ids).

Usage (repository root):
    python3 tools/publication-audit.py --since <published commit> --out qa/revision-X-publication-audit.json
    python3 tools/publication-audit.py --files docs/handoff AGENTS.md          # files or folders
    python3 tools/publication-audit.py --all
    python3 tools/publication-audit.py --files /path/to/candidate --data-dir /path/to/candidate   # before copying into data/

Files it cannot read as text are listed under notScanned: binary files (images, fonts, PDFs, archives) unless a
reviewed binary rule covers them, and text that is not UTF-8. Any notScanned file makes the result "review", because
nothing was checked inside it. A path given to --files that does not exist is an error (exit 2).

Reviewed false positives and known binary files live in tools/publication-audit-allowlist.json (each rule says why).
Exit status 0 when the result is "pass"; 1 when anything needs review; 2 for usage errors. A pass is evidence for the
scanned files only; it does not replace a human review of new data, wording or screenshots.
"""
import argparse
import collections
import datetime
import fnmatch
import hashlib
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BINARY = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".woff", ".woff2", ".ttf", ".otf", ".ico", ".pdf", ".zip", ".pbf", ".mp4", ".webm")
PATTERNS = {
    "thirteen_digit_number": re.compile(r"(?<![\d.])\d{13}(?![\d.])"),
    "id_card_dashed": re.compile(r"\b\d-\d{4}-\d{5}-\d{2}-\d\b"),
    "mobile_phone": re.compile(r"(?<!\d)0[689]\d{8}(?!\d)|(?<!\d)0[689]\d-\d{3}-\d{4}(?!\d)"),
    "eleven_digit_house_code": re.compile(r"(?<![\d.])\d{11}(?![\d.])"),
    "thai_person_title_with_name": re.compile(r"(?:นางสาว|นาย|นาง|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.)\s?[ก-๙]{2,}\s+[ก-๙]{2,}"),
    "raw_linkage_prefix": re.compile(r"SILA-(?:PROP|WORK)-|record_id|land_record_id|taxpayer_key"),
    "survey_visit_note": re.compile(r"ไม่ให้สำรวจ|ไม่อนุญาตให้สำรวจ|ไม่พบเจ้าบ้าน|บ้านร้าง|ให้ข้อมูลไม่ครบ"),
    "credential_like": re.compile(r"AIza[0-9A-Za-z_\-]{35}|ghp_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{40,}|sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[abpr]-[0-9A-Za-z-]{10,}"),
}
FORBIDDEN_KEYS = {"owner", "ownername", "name_owner", "deed", "deed_no", "deed_number", "title_no", "pres_id", "pres_id1", "hs_house", "member", "image",
                  "remark", "b_usename", "taxpayer_code", "taxpayer_key", "record_id", "citizenid", "national_id", "phone", "tel", "firstname", "lastname",
                  "surname", "apikey", "api_key", "secret", "password", "token"}
SELF_KEYS_OK = {"build-manifest.json"}  # file lists and hashes only


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split("\n")


def expand(path):
    """A file, or every tracked and untracked (not ignored) file under a folder."""
    full = path if os.path.isabs(path) else os.path.join(ROOT, path)
    if not os.path.exists(full):
        print(f"publication-audit: {path} does not exist", file=sys.stderr)
        sys.exit(2)
    if os.path.isfile(full):
        return [path]
    try:
        inside = [f for f in git("ls-files", "--cached", "--others", "--exclude-standard", "--", os.path.relpath(full, ROOT)) if f]
    except (subprocess.CalledProcessError, ValueError):
        inside = []
    if not inside:  # outside the repository or nothing tracked: walk the folder
        for dirpath, dirnames, filenames in os.walk(full):
            dirnames[:] = [d for d in dirnames if d not in ("__pycache__", "node_modules", ".git")]
            inside += [os.path.join(dirpath, n) for n in filenames]
    return inside


def pick_files(args):
    if args.files:
        picked = []
        for f in args.files:
            picked += expand(f)
        return sorted(set(picked))
    untracked = [f for f in git("ls-files", "--others", "--exclude-standard") if f]
    if args.all:
        return sorted(set([f for f in git("ls-files") if f] + untracked))
    changed = [f for f in git("diff", "--name-only", args.since) if f]
    return sorted(set(f for f in changed + untracked if os.path.exists(os.path.join(ROOT, f))))  # deleted files drop out


def binary_rule(path, rules):
    """Id of the reviewed binary rule that covers this file, or None."""
    digest = None
    for r in rules:
        if r.get("fileGlob") and not fnmatch.fnmatch(path, r["fileGlob"]):
            continue
        if r.get("sha256In"):
            if digest is None:
                with open(os.path.join(ROOT, path), "rb") as fh:
                    digest = hashlib.sha256(fh.read()).hexdigest()
            if digest not in r["sha256In"]:
                continue
        return r["id"]
    return None


def hex_run(text, start, end):
    a, b = start, end
    while a > 0 and text[a - 1] in "0123456789abcdefABCDEF":
        a -= 1
    while b < len(text) and text[b] in "0123456789abcdefABCDEF":
        b += 1
    return b - a


def allowed(hit, path, rules):
    for r in rules:
        if hit["pattern"] not in r.get("patterns", []):
            continue
        if r.get("fileGlob") and not fnmatch.fnmatch(path, r["fileGlob"]):
            continue
        if r.get("minHexRun") and hit["hexRun"] < r["minHexRun"]:
            continue
        if r.get("matchIn") and hit["match"] not in r["matchIn"]:
            continue
        if r.get("contextContains") and r["contextContains"] not in hit["context"]:
            continue
        return r["id"]
    return None


def walk_keys(o, path, out):
    if isinstance(o, dict):
        for k, v in o.items():
            kl = k.lower()
            if kl in FORBIDDEN_KEYS or kl.startswith("member_") or kl.startswith("pres_id"):
                out.append(path + "/" + k)
            walk_keys(v, path + "/" + k, out)
    elif isinstance(o, list):
        for x in o[:200000]:
            walk_keys(x, path, out)


DATA_DIR = os.path.join(ROOT, "data")
DATA_FILES = ("houses.geojson", "buildings.geojson", "population-grid.geojson", "population-structure.json", "businesses.geojson", "parcel-tax.json")


def load(rel):
    """rel is data/NAME; NAME is read from the data folder in use (--data-dir, default ROOT/data)."""
    with open(os.path.join(DATA_DIR, os.path.basename(rel)), encoding="utf-8") as f:
        return json.load(f)


def interval_violations(t, rows):
    bad = 0
    for i, (_, lo, hi, v) in enumerate(rows):
        so_hi = sum(r[2] for j, r in enumerate(rows) if j != i)
        so_lo = sum(r[1] for j, r in enumerate(rows) if j != i)
        a, b = max(lo, t - so_hi), min(hi, t - so_lo)
        if v == "<5" and (a, b) != (1, 4):
            bad += 1
        if v is None and not (b >= 5 or (a == 0 and b == 0)):
            bad += 1
    return bad


def bounds(v, t):
    return (0, t) if v is None else (1, 4) if v == "<5" else (v, v)


def data_checks():
    """Invariants of the published layers; every value must be 0. Returns (checks, skipped sections).
    A section runs only when its files are in the data folder; skipped sections are listed by the caller."""
    out, skipped = {}, []
    have = lambda *names: all(os.path.exists(os.path.join(DATA_DIR, n)) for n in names)
    if have("houses.geojson", "buildings.geojson"):
        for rel, key in (("data/houses.geojson", "houseNumber"), ("data/buildings.geojson", "houseNumbers")):
            n = 0
            for ft in load(rel)["features"]:
                v = ft["properties"].get(key)
                for x in (v if isinstance(v, list) else [v]):
                    if isinstance(x, str) and not re.search(r"\d", x):
                        n += 1
            out[f"houseNumberValuesWithoutDigit:{rel}"] = n
        hp = [ft["properties"] for ft in load("data/houses.geojson")["features"]]
        bp = [ft["properties"] for ft in load("data/buildings.geojson")["features"]]
        allowed_use = {None, "ให้เช่าหรือผู้อื่นใช้", "จอดรถหรือเก็บของ", "เกษตรหรือเลี้ยงสัตว์"}
        out["surveyStatusKeyPresent"] = sum("status" in p for p in hp)
        out["surveyUseOutsideGroups"] = sum(p.get("use") not in allowed_use for p in hp + bp)
        out["houseNumberWithAddressOrNote"] = sum(1 for p in hp for x in [p.get("houseNumber")]
                                                  if isinstance(x, str) and re.search(r"(ม\.|ต\.|ซ\.|ถน|บ้าน|\([^)]*[ก-๙][^)]*\))", x) and "เดิม" not in x)
    else:
        skipped.append("houses and buildings")
    if have("population-grid.geojson", "population-structure.json"):
        bad = 0
        for ft in load("data/population-grid.geojson")["features"]:
            q = ft["properties"]
            if q.get("suppressed"):
                continue
            t = q["t"]
            bad += interval_violations(t, [(k,) + bounds(q.get(k), t) + (q.get(k),) for k in ("c", "a", "o", "u")])
            bad += interval_violations(t, [(k,) + bounds(q.get(k), t) + (q.get(k),) for k in ("m", "f")] + [("*", 0, t, None)])
        ps = load("data/population-structure.json")
        for row in list(ps["villages"].values()) + [ps["totals"]]:
            t = row["t"]
            bad += interval_violations(t, [(k,) + bounds(row.get(k), t) + (row.get(k),) for k in ("c", "a", "o", "u") if k in row])
            bad += interval_violations(t, [(k,) + bounds(row.get(k), t) + (row.get(k),) for k in ("m", "f", "su") if k in row])
        out["populationIntervalViolations"] = bad
    else:
        skipped.append("population grid and structure")
    if have("businesses.geojson"):
        jur = re.compile(r"บริษัท|ห้างหุ้นส่วน|หจก|บจก|บมจ|มูลนิธิ|สมาคม|สหกรณ์|ธนาคาร|วัด|จำกัด|LIMITED|LTD|PUBLIC|กองทุน|โรงพยาบาล|มหาวิทยาลัย|โรงเรียน|สำนักงาน|องค์การ", re.I)
        bz = [ft["properties"] for ft in load("data/businesses.geojson")["features"]]
        out["businessLabelsWithoutJuristicMarker"] = sum(1 for p in bz if not jur.search(p["label"]))
        out["businessWebsitesNotHttps"] = sum(1 for p in bz if p.get("website") and not str(p["website"]).startswith("https://"))
        allow = {"id", "datasetId", "sourceRecord", "label", "site", "kind", "branch", "vatSince", "placedBy", "parcelId", "buildingId", "commercialObserved",
                 "villageId", "villageIds", "electionId", "electionIds", "insideMunicipality", "website"}
        out["businessKeysOutsideAllowList"] = len(set(k for p in bz for k in p) - allow)
    else:
        skipped.append("businesses")
    if have("parcel-tax.json"):
        pt = load("data/parcel-tax.json")
        fx = {k: i for i, k in enumerate(pt["fields"])}
        codes = [r[fx["tp"]] for r in pt["parcels"] if r[fx["tp"]]]
        out["ownerCodesNotRandomFormat"] = sum(1 for c in codes if not re.fullmatch(r"T-[2-9A-HJ-NP-Z]{6}", str(c)))
        out["hexKeysInParcelTax"] = len(re.findall(r"\b[0-9a-f]{32,}\b", json.dumps(pt)))
        summary_text = json.dumps(pt.get("summary", {}), ensure_ascii=False)
        out["internalRollIdsInParcelTaxSummary"] = len(re.findall(r"(?<![A-Z0-9-])L\d{5}\b", summary_text))
    else:
        skipped.append("parcel tax")
    return out, skipped


def main():
    global DATA_DIR
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--since", help="scan files changed since this commit plus untracked files")
    g.add_argument("--all", action="store_true", help="scan every tracked and untracked (not ignored) file")
    g.add_argument("--files", nargs="+", help="scan these files or folders (a missing path is an error)")
    ap.add_argument("--out", help="write the receipt JSON here")
    ap.add_argument("--allowlist", default=os.path.join(ROOT, "tools", "publication-audit-allowlist.json"))
    ap.add_argument("--data-dir", default=DATA_DIR, help="folder with the data files the data checks read (default: data/, which must hold all six); "
                    "sections whose files are missing from another folder are skipped and listed")
    ap.add_argument("--skip-data-checks", action="store_true")
    args = ap.parse_args()
    DATA_DIR = os.path.abspath(args.data_dir)
    allow = json.load(open(args.allowlist, encoding="utf-8")) if os.path.exists(args.allowlist) else {}
    rules = allow.get("rules", [])
    bin_rules = allow.get("binaryRules", [])
    key_ok = {(r["file"], r["keyPath"]): r["id"] for r in allow.get("keyRules", [])}
    out_rel = os.path.relpath(args.out, ROOT) if args.out else None
    files = [f for f in pick_files(args) if f != out_rel]
    hits, reviewed, key_hits, scanned, not_scanned = collections.defaultdict(list), collections.defaultdict(list), {}, [], {}
    binaries_ok = {}
    for f in files:
        if f.lower().endswith(BINARY):
            rule = binary_rule(f, bin_rules)
            if rule:
                binaries_ok.setdefault(rule, 0)
                binaries_ok[rule] += 1
            else:
                not_scanned[f] = "binary file; no reviewed binary rule covers it (look at it, then add a narrow rule)"
            continue
        try:
            txt = open(os.path.join(ROOT, f), encoding="utf-8").read()
        except UnicodeDecodeError:
            not_scanned[f] = "not UTF-8 text; convert it or check it by hand"
            continue
        scanned.append(f)
        for name, rx in PATTERNS.items():
            for m in rx.finditer(txt):
                hit = {"pattern": name, "match": m.group(0)[:40], "context": txt[max(0, m.start() - 30): m.end() + 30].replace("\n", " ")[:100],
                       "hexRun": hex_run(txt, m.start(), m.end())}
                rule = allowed(hit, f, rules)
                if rule:
                    reviewed[f].append(f"{name}: {rule}")
                else:
                    hits[f].append({k: hit[k] for k in ("pattern", "match", "context")})
        if f.endswith((".json", ".geojson")) and os.path.basename(f) not in SELF_KEYS_OK:
            found = []
            try:
                walk_keys(json.loads(txt), "", found)
            except ValueError as e:
                found.append("parse error " + str(e)[:60])
            for k in sorted(set(found)):
                if (f, k) in key_ok:
                    reviewed[f].append(f"key {k}: {key_ok[(f, k)]}")
                else:
                    key_hits.setdefault(f, []).append(k)
    checks, missing, skipped = {}, [], []
    if not args.skip_data_checks:
        missing = [n for n in DATA_FILES if not os.path.exists(os.path.join(DATA_DIR, n))]
        checks, skipped = data_checks()
        if missing and DATA_DIR == os.path.join(ROOT, "data"):
            checks["publishedDataFilesMissing"] = len(missing)  # the repository's own data/ must hold all six
    result = "pass" if files and not hits and not key_hits and not not_scanned and not any(checks.values()) else "review"
    receipt = {"schema": "sila-publication-audit/4", "checkedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
               "selection": {"since": args.since, "all": bool(args.all), "files": bool(args.files)},
               "dataDir": os.path.relpath(DATA_DIR, ROOT) if DATA_DIR.startswith(ROOT) else "outside the repository",
               "filesScanned": scanned, "notScanned": not_scanned, "binaryFilesCoveredByRules": binaries_ok,
               "patterns": sorted(PATTERNS), "forbiddenKeys": sorted(FORBIDDEN_KEYS), "personalDataPatternHits": dict(hits),
               "reviewedFalsePositives": {k: sorted(set(v)) for k, v in reviewed.items()}, "forbiddenKeyHits": key_hits,
               "dataChecks": checks, "dataFilesMissing": missing, "dataChecksSkipped": skipped, "result": result}
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(receipt, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
    print(json.dumps({"files": len(scanned), "notScanned": not_scanned, "hits": {k: len(v) for k, v in hits.items()}, "keyHits": key_hits,
                      "dataChecksNonZero": {k: v for k, v in checks.items() if v}, "dataChecksSkipped": skipped, "result": result},
                     ensure_ascii=False, indent=1))
    if not files:
        print("publication-audit: nothing selected, so nothing was checked", file=sys.stderr)
    sys.exit(0 if result == "pass" else 1)


if __name__ == "__main__":
    main()
