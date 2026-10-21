#!/usr/bin/env python3
"""Regenerate or check build-manifest.json from the tracked tree.

The manifest lists every tracked file except .gitignore, .nojekyll and the manifest itself, with byte length,
SHA-256 and accepted MIME types; tools/verify-live.py compares the published site against it.

Usage (repository root):
    python3 tools/gen-manifest.py --check                       # exit 1 if the file list or any hash is stale
    python3 tools/gen-manifest.py --revision 2.0.2 --date 2026-10-21 [--notes release-notes.json]

New files must be added to git (git add) before they count as tracked. --notes takes a JSON object whose keys are
merged into the top level (for example "patches" or a revision block); existing keys not in it are kept.
"""
import argparse
import datetime
import hashlib
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "build-manifest.json")
EXCLUDE = {".gitignore", ".nojekyll", "build-manifest.json"}
DEFAULT_MIME = {".md": ["text/markdown"], ".py": ["text/x-python"], ".geojson": ["application/geo+json"], ".sh": ["application/x-sh"],
                ".cjs": ["application/javascript", "text/javascript"], ".json": ["application/json"]}


def tracked():
    out = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split("\n")
    return sorted(p for p in out if p and p not in EXCLUDE)


def untracked():
    out = subprocess.run(["git", "ls-files", "--others", "--exclude-standard"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split("\n")
    return [p for p in out if p]


def entries(old):
    by_path = {f["path"]: f.get("mimeTypes") for f in old.get("files", [])}
    by_ext = dict(DEFAULT_MIME)
    for f in old.get("files", []):
        ext = os.path.splitext(f["path"])[1].lower()
        if f.get("mimeTypes") and ext not in by_ext:
            by_ext[ext] = f["mimeTypes"]
    files = []
    for path in tracked():
        with open(os.path.join(ROOT, path), "rb") as fh:
            data = fh.read()
        e = {"path": path, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        mt = by_path.get(path) or by_ext.get(os.path.splitext(path)[1].lower())
        if mt:
            e["mimeTypes"] = mt
        files.append(e)
    return files


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--revision")
    ap.add_argument("--date", help="release date in Bangkok, YYYY-MM-DD")
    ap.add_argument("--notes", help="JSON object merged into the top level")
    args = ap.parse_args()
    with open(MANIFEST, encoding="utf-8") as fh:
        old = json.load(fh)
    files = entries(old)
    loose = untracked()
    if loose:
        more = f" ... and {len(loose) - 10} more" if len(loose) > 10 else ""
        print(f"note: {len(loose)} untracked file(s) are not in the manifest until added to git:", ", ".join(loose[:10]) + more, file=sys.stderr)
    if args.check:
        want = {f["path"]: (f["bytes"], f["sha256"]) for f in files}
        have = {f["path"]: (f.get("bytes"), f.get("sha256")) for f in old.get("files", [])}
        missing = sorted(set(want) - set(have))
        extra = sorted(set(have) - set(want))
        changed = sorted(p for p in set(want) & set(have) if want[p] != have[p])
        ok = not (missing or extra or changed)
        print(json.dumps({"manifestRevision": old.get("revision"), "files": len(want), "notInManifest": missing[:20], "notInTree": extra[:20],
                          "hashChanged": changed[:20], "result": "current" if ok else "stale"}, indent=1))
        sys.exit(0 if ok else 1)
    if not args.revision or not args.date:
        ap.error("--revision and --date are required unless --check is given")
    m = dict(old)
    if args.notes:
        with open(args.notes, encoding="utf-8") as fh:
            m.update(json.load(fh))
    m.update({"revision": args.revision, "releaseDateBangkok": args.date,
              "builtAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "files": files})
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(m, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    no_mime = [f["path"] for f in files if "mimeTypes" not in f]
    print(len(files), "files; without MIME:", no_mime[:10], f"... and {len(no_mime) - 10} more" if len(no_mime) > 10 else "")


if __name__ == "__main__":
    main()
