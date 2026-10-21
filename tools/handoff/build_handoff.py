#!/usr/bin/env python3
"""Build the Sila developer handoff package (human + machine readable) from one data source.

Sources: tools/handoff/handoff_data.py, plan_data.py and brief_data.py, plus facts measured from the repository
(missions.js through Node, index.html, data files, qa/expected-figures.json, receipts, contract hashes).

Outputs (every .md embeds the same JSON as its paired .json, character for character):
    docs/handoff/README.md, PRODUCT_BRIEF.md + product-brief.json, HANDOFF.md + handoff.json,
    IMPLEMENTATION_PLAN.md + implementation-plan.json, FACTS.md + facts.json (snapshot), SOURCES.md, CHANGELOG.md,
    and AGENTS.md at the repository root (the TEAM-NOTES block is kept).

Usage (repository root):
    python3 tools/handoff/build_handoff.py            # write everything
    python3 tools/handoff/build_handoff.py --check    # exit 1 on drift, broken plan rules, missing paths or lint errors

--check rebuilds in memory and compares every generated file byte for byte, except FACTS.md and facts.json, which are
snapshots (sizes, line counts, cache keys) and are only checked for internal consistency. Both modes also run
node qa/compute-figures.cjs --check, so documents are never built from stale city figures.
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import brief_data as B  # noqa: E402
import handoff_data as H  # noqa: E402
import plan_data as P  # noqa: E402

OUT = "docs/handoff"
BEGIN, END = "<!-- SILA_MACHINE_BEGIN -->", "<!-- SILA_MACHINE_END -->"
TEAM_BEGIN, TEAM_END = "<!-- TEAM-NOTES:BEGIN -->", "<!-- TEAM-NOTES:END -->"
VOLATILE = {f"{OUT}/FACTS.md", f"{OUT}/facts.json"}
LOCKED = [
    ("reference/tax-map-method.md", "tax method, baseline rule, what is not published, requests to the municipality"),
    ("reference/tax-calculator-rules.md", "one-parcel calculator rules and legal sources"),
    ("reference/public-summary-contract.md", "municipality-level summaries and the public versus officer boundary"),
    ("reference/public-summary-contract.json", "machine form of the public summary contract"),
    ("reference/drilldown-contract.json", "scope drilldown behaviour (municipality, village or election, record)"),
    ("reference/context-actions-contract.json", "search and AI-question actions without personal data"),
    ("reference/terrain-contract.json", "terrain 2D/3D and closed-low-ground contract"),
    ("reference/terrain-contract.md", "terrain contract (Thai)"),
    ("reference/lds-analytical-subset.json", "LDS 0.9.7 analytical scales used by the site"),
    ("reference/design-tokens.json", "LDS 0.9.7 and CityChat Add-on 0.9.2 values used by the site"),
    ("reference/ui-icons.manifest.json", "interface icon subset, sources, hashes and approvals"),
    ("reference/satellite-basemap-contract.json", "satellite basemap providers and licence status"),
    ("assets/brand/manifest.json", "official brand asset bytes and approved roles"),
    ("data/terrain-source.json", "FABDEM service, licence and attribution"),
]


# ---------------------------------------------------------------- helpers
def path(p):
    return os.path.join(ROOT, p)


def read(p):
    with open(path(p), encoding="utf-8") as f:
        return f.read()


def sha256_file(p):
    with open(path(p), "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def jtext(obj):
    return json.dumps(obj, ensure_ascii=False, indent=1) + "\n"


def embed(obj):
    return f"{BEGIN}\n```json\n{jtext(obj)}```\n{END}\n"


def cell(v):
    if v is None:
        return "—"
    if isinstance(v, (list, tuple)):
        v = ", ".join(str(x) for x in v) if v else "—"
    return str(v).replace("|", "/").replace("\n", " ").strip() or "—"


def table(headers, rows):
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    out += ["| " + " | ".join(cell(c) for c in r) + " |" for r in rows]
    return "\n".join(out) + "\n"


def bullets(items):
    return "\n".join(f"- {cell(i)}" for i in items) + "\n"


def numbered(items):
    return "\n".join(f"{n}. {cell(i)}" for n, i in enumerate(items, 1)) + "\n"


def code(lines, lang="sh"):
    body = "\n".join(lines) if isinstance(lines, (list, tuple)) else lines
    return f"```{lang}\n{body}\n```\n"


def md_section(rel, heading):
    """Text under a Markdown heading (exclusive) up to the next heading of the same or a higher level."""
    lines = read(rel).split("\n")
    level = len(heading) - len(heading.lstrip("#"))
    start = lines.index(heading) + 1
    end = len(lines)
    for i in range(start, len(lines)):
        m = re.match(r"^(#+) ", lines[i])
        if m and len(m.group(1)) <= level:
            end = i
            break
    return "\n".join(lines[start:end]).strip("\n")


def strip_v(src):
    return re.sub(r"\?v=[^\"']*$", "", src)


def fmt_int(n):
    return f"{n:,}"


def fmt_money(x):
    return f"{x:,.2f}"


# ---------------------------------------------------------------- facts
NODE_MISSIONS = r"""
global.window = undefined;
require(process.argv[1]);
const M = globalThis.SilaMissions;
process.stdout.write(JSON.stringify({
  missions: M.missions.map(m => ({id: m.id, icon: m.icon, label: m.label, short: m.short, layers: m.layers})),
  layers: Object.entries(M.layers).map(([id, l]) => ({id, label: l.label, kind: l.kind, supplements: l.supplements || [], tools: l.tools || []}))
}));
"""


def load_missions():
    r = subprocess.run(["node", "-e", NODE_MISSIONS, path("missions.js")], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def latest_receipts():
    found = {}
    for f in sorted(os.listdir(path("qa"))):
        m = re.match(r"revision-(\d+(?:\.\d+)*)-(browser-checks|accessibility-checks|publication-audit|phone-overflow)\.json$", f)
        if not m:
            continue
        ver = tuple(int(x) for x in m.group(1).split("."))
        kind = m.group(2)
        if kind not in found or ver > found[kind][0]:
            found[kind] = (ver, f"qa/{f}")
    out = {}
    for kind, (_, rel) in sorted(found.items()):
        d = json.loads(read(rel))
        s = d.get("summary", {})
        if kind == "browser-checks":
            fl = s.get("flowsPassed", {})
            out[kind] = {"file": rel, "cases": s.get("cases"), "notReadyCases": s.get("notReadyCases"), "pageErrors": s.get("pageErrors"), "horizontalOverflowCases": s.get("horizontalOverflowCases"),
                         "legendOverMapCases": s.get("legendOverMapCases"), "flowsPassed": f"{sum(1 for v in fl.values() if v)} of {len(fl)}", "browser": d.get("browser")}
        elif kind == "accessibility-checks":
            out[kind] = {"file": rel, "views": s.get("views"), "notReadyViews": s.get("notReadyViews"), "violations": s.get("violations"), "tool": d.get("tool")}
        elif kind == "phone-overflow":
            out[kind] = {"file": rel, "runs": s.get("runs"), "bad": s.get("bad")}
        else:
            out[kind] = {"file": rel, "result": d.get("result"), "filesScanned": len(d.get("filesScanned", [])), "notScanned": len(d.get("notScanned", {}))}
    return out


def line_count(text):
    """Lines as wc -l counts them, plus a last line without a final newline."""
    return text.count("\n") + (1 if text and not text.endswith("\n") else 0)


def measure():
    tracked = [t for t in git("ls-files").split("\n") if t]
    on_disk = set(tracked) | {t for t in git("ls-files", "--others", "--exclude-standard").split("\n") if t}
    html = read("index.html")
    scripts = re.findall(r"<script[^>]*src=\"([^\"]+)\"", html)
    styles = re.findall(r"<link rel=\"stylesheet\" href=\"([^\"]+)\"", html)
    modules = []
    for f in sorted(t for t in on_disk if re.fullmatch(r"[^/]+\.js", t)):
        src = read(f)
        globs = sorted(set(re.findall(r"(?:root|window|self|globalThis)\.(Sila\w+)\s*=", src)))
        modules.append({"file": f, "bytes": os.path.getsize(path(f)), "lines": line_count(src), "globals": globs})
    css = [{"file": f, "bytes": os.path.getsize(path(f)), "lines": line_count(read(f))} for f in sorted(t for t in on_disk if re.fullmatch(r"[^/]+\.css", t))]
    data = []
    for f in sorted(t for t in on_disk if re.fullmatch(r"data/[^/]+\.(json|geojson)", t)):
        d = {"path": f, "bytes": os.path.getsize(path(f))}
        j = json.loads(read(f))
        if isinstance(j, dict) and j.get("type") == "FeatureCollection":
            d["features"] = len(j["features"])
        data.append(d)
    head = git("rev-parse", "HEAD").strip()
    dirty = bool(git("status", "--porcelain").strip())
    return {"tracked": tracked, "onDisk": on_disk, "head": head, "dirty": dirty, "scripts": scripts, "styles": styles,
            "modules": modules, "css": css, "data": data}


# ---------------------------------------------------------------- documents
def document(doc_id, title, kind):
    return {"id": f"{H.PACKAGE['id']}/{doc_id}", "title": title, "kind": kind, "version": H.PACKAGE["version"], "date": H.PACKAGE["date"],
            "status": "current", "supersedes": H.PACKAGE["supersedes"], "siteRevision": H.PACKAGE["siteRevision"],
            "baseCommit": H.PACKAGE["baseCommit"], "language": "th (human prose), en (agent fields)",
            "generator": "tools/handoff/build_handoff.py", "evidenceLabels": [e["label"] for e in H.EVIDENCE_LABELS], "quoteLabels": H.QUOTE_LABELS}


def key_figures(fig):
    t, n, a, o, mv = fig["totals"], fig["negotiate"], fig["agriWatch"], fig["owners"], fig["municipalityView"]
    note = "ผลคำนวณ (modelled) ของ tax-engine " + str(fig.get("engine")) + " จาก data/parcel-tax.json · เป็นตัวเลขประมาณเพื่อวางแผน ไม่ใช่ยอดประเมินทางการ"
    return [
        {"figure": "ยอดเรียกเก็บปีภาษี 2569 บนแผนที่", "value": fmt_money(t["billed69"]) + " บาท", "label": "Observed fact", "note": "รวมจาก ภ.ด.ส.7 ของโฉนดที่จับคู่ได้"},
        {"figure": "ภาษีตามกฎหมายจากข้อมูลเดียวกัน ไม่ใช้ข้อเสนอ", "value": fmt_money(t["law69"]) + " บาท", "label": "Inference", "note": note},
        {"figure": "ภาษีปี 2570 เมื่อใช้ข้อเสนอทั้งหมด ราคาประเมินเท่าเดิม", "value": fmt_money(t["new70"]) + " บาท", "label": "Inference", "note": note},
        {"figure": "ส่วนเพิ่มที่นำมานับ", "value": f"{fmt_money(n['gainMaterial'])} บาท จาก {fmt_int(n['parcelsMaterial'])} โฉนด", "label": "Inference",
         "note": note + f" · นับทุกโฉนดใน data/parcel-tax.json รวม {fmt_int(mv['titlesOutsideBoundary'])} โฉนดนอกเขตเทศบาล ({fmt_int(mv['outsideTitlesWithGain'])} โฉนดมีส่วนเพิ่ม) หน้าเว็บขอบเขตเทศบาลจึงแสดง {fmt_int(mv['parcelsMaterialInside'])} แปลง {fmt_money(mv['gainMaterialInside'])} บาท"},
        {"figure": "บัญชีสูงกว่าที่คำนวณ (แสดงแยก ไม่หัก)", "value": f"{fmt_money(t['rollAbove69'])} บาท · {fmt_int(t['parcelsRollAbove'])} โฉนด", "label": "Inference",
         "note": "ส่วนที่ยอดเรียกเก็บ (Observed fact) สูงกว่าภาษีที่ tax-engine " + str(fig.get("engine")) + " คำนวณ (modelled) · ใช้วางแผน ไม่ใช่ยอดประเมินทางการ"},
        {"figure": "เกษตรบนที่ดินราคาสูง (ที่ดินตั้งแต่ 5 ล้านบาท)", "value": f"{fmt_int(a['titles'])} โฉนด · ถ้าตรวจพบว่าทุกโฉนดไม่ได้ทำประโยชน์ ภาษีเพิ่มได้สูงสุด {fmt_int(a['potential'])} บาทต่อปี", "label": "Hypothesis",
         "note": "จำนวนโฉนดเลือกตามกติกาจากบัญชี (ใช้เป็นเกษตร ที่ดินตั้งแต่ 5 ล้านบาท) ส่วนจำนวนเงินเป็นเพดานถ้าตรวจพบครบทุกโฉนด ไม่ใช่ข้อสรุป การตรวจในพื้นที่เท่านั้นที่ตัดสินได้"
                 + (f" · {fmt_int(a['potentialUnknown'])} โฉนดคำนวณส่วนเพิ่มไม่ได้และไม่ได้นับ" if a.get("potentialUnknown") else "")},
        {"figure": "เจ้าของในบัญชีปี 2563", "value": f"{fmt_int(o['count'])} ราย · มูลค่าประเมินรวม {fmt_int(round(o['totalValueMTHB']))} ล้านบาท · 10 อันดับแรกถือ {o['top10Share']}%", "label": "Inference",
         "note": "นับจากบัญชีปี 2563 ที่ผูกกับแปลงปัจจุบัน สมมติว่าเจ้าของยังไม่เปลี่ยน · ไม่มีชื่อ ใช้รหัสสุ่ม"},
    ]


def product_brief_doc(miss, fig):
    layers = {l["id"]: l for l in miss["layers"]}
    missions = [{"id": m["id"], "label": m["label"], "layers": [{"id": i, "label": layers[i]["label"]} for i in m["layers"] if i in layers]} for m in miss["missions"]]
    brief = dict(B.BRIEF)
    brief["keyFigures"] = key_figures(fig)
    return {"schema": "sila-product-brief/1", "document": document("product-brief", B.BRIEF["title"], "site-level product brief"),
            "authorities": H.AUTHORITIES, "evidenceLabels": H.EVIDENCE_LABELS, "brief": brief, "missions": missions,
            "dataRequests": H.DATA_REQUESTS, "glossary": H.GLOSSARY}


def handoff_doc(facts, miss, fig, receipts):
    globs = {m["file"]: m["globals"] for m in facts["modules"]}
    modules = [{"file": f, "globals": globs.get(f, []), "role": role} for f, role in H.MODULE_ROLES.items()]
    catalog = {d["id"]: d for d in json.loads(read("data/catalog.json"))["datasets"]}
    files = []
    for p_, meta in H.DATA_FILES.items():
        status = sorted({d["status"] for d in catalog.values() if d.get("geojson") == p_})
        files.append({"path": p_, "meaning": meta["meaning"], "privacy": meta["privacy"], "catalogStatus": status})
    extra = {"caregroups": ["data/municipal-summary.json"], "animals": ["data/municipal-summary.json"], "terrain": ["data/terrain-source.json", "data/terrain-coverage.geojson", "external FABDEM tiles"],
             "overview": ["data/municipality.geojson", "data/villages.geojson", "data/election.geojson"]}
    tax_layers = {"taxmap", "negotiate", "agriwatch", "portfolio", "properties", "appraisal"}
    layers = []
    for l in miss["layers"]:
        src = []
        if catalog.get(l["id"], {}).get("geojson"):
            src.append(catalog[l["id"]]["geojson"])
        src += extra.get(l["id"], [])
        if l["id"] in tax_layers:
            src.append("data/parcel-tax.json")
        layers.append({**l, "dataFiles": src, "catalogStatus": catalog.get(l["id"], {}).get("status")})
    baseline_heading = "## รุ่น 2.0: ฐานเปรียบเทียบคือยอดที่เรียกเก็บปี 2569 และการจัดสรรส่วนเพิ่มให้ข้อเสนอ"
    baseline = md_section("reference/tax-map-method.md", baseline_heading)
    baseline = baseline.split("\n### ")[0].strip()
    not_published = md_section("reference/tax-map-method.md", "## สิ่งที่ไม่เผยแพร่")
    summary_contract = md_section("reference/public-summary-contract.md", "## สัญญาข้อมูล")
    flood_status = json.loads(read("data/flood-sites.geojson"))["source"]["coordinateStatus"]
    method_sha = sha256_file("reference/tax-map-method.md")
    return {
        "schema": "sila-handoff/1", "document": document("handoff", "Handoff: แผนที่งานเจ้าหน้าที่ศิลา", "developer handoff"),
        "state": {"liveUrl": H.PACKAGE["liveUrl"], "repo": H.PACKAGE["repo"], "branch": H.PACKAGE["branch"], "baseRevision": H.PACKAGE["baseRevision"],
                  "baseCommit": H.PACKAGE["baseCommit"], "baseCommitLiveCheck": H.PACKAGE["baseCommitLiveCheck"], "siteRevision": H.PACKAGE["siteRevision"],
                  "production": {"authentication": False, "municipalWrites": False, "productionDataConnected": False, "source": "README.md front matter"},
                  "latestReceipts": receipts,
                  "publicationStateOfThisRevision": "read build-manifest.json and the latest tools/verify-live.py output; this document does not claim it"},
        "quickStart": QUICK_START,
        "architecture": {"modules": modules, "loadOrder": {"styles": [strip_v(s) for s in facts["styles"]], "scripts": [strip_v(s) for s in facts["scripts"]]},
                         "urlParams": H.URL_PARAMS,
                         "testHook": "window.SilaExplorer: getState(), setDataset(id), setMission(id), selectScope(id), setTerrainMode(mode), closeRecord()",
                         "startup": "start() fetches catalog, metadata, document catalog, design tokens, municipal summary, terrain source and coverage, analytical scales, parcel-tax.json, population structure and the optional Street View coverage in parallel; prepares the tax model; loads boundaries; reads the URL; then binds events, creates the map, renders the panel and draws."},
        "missions": miss["missions"], "layers": layers,
        "dataContracts": {
            "files": files, "parcelTaxFields": H.PARCEL_TAX_FIELDS,
            "taxBaseline": {"source": "reference/tax-map-method.md", "sha256": method_sha, "heading": baseline_heading, "quoteLabel": "VERBATIM", "text": baseline},
            "notPublished": {"source": "reference/tax-map-method.md", "sha256": method_sha, "heading": "## สิ่งที่ไม่เผยแพร่", "quoteLabel": "VERBATIM", "text": not_published},
            "publicSummary": {"source": "reference/public-summary-contract.md", "sha256": sha256_file("reference/public-summary-contract.md"), "heading": "## สัญญาข้อมูล", "quoteLabel": "VERBATIM", "text": summary_contract},
            "floodCoordinateStatus": {"source": "data/flood-sites.geojson", "values": flood_status},
            "cityFigures": {"source": "qa/expected-figures.json (node qa/compute-figures.cjs)", "engine": fig.get("engine"), "totals": fig["totals"], "negotiate": fig["negotiate"],
                            "municipalityView": fig["municipalityView"], "agriWatch": fig["agriWatch"], "owners": fig["owners"]},
        },
        "surfaces": H.SURFACES, "invariants": H.INVARIANTS,
        "qa": {"commands": QA_COMMANDS, "receipts": receipts, "notCovered": ["real GPU rendering (3D uses software WebGL in tests)", "screen readers", "real phones", "street basemap tiles", "text contrast over map tiles", "200% zoom"]},
        "release": H.RELEASE_STEPS, "decisionsRef": "implementation-plan.json#/decision/ownerDecisions", "problemsRef": "implementation-plan.json#/problems",
        "dataRequests": H.DATA_REQUESTS, "outsideRepo": H.OUTSIDE_REPO, "gotchas": H.GOTCHAS, "recipes": H.RECIPES,
    }


SERVER_START = "python3 server.py --port 8768 > /dev/null 2>&1 &   # loopback preview in the background: http://127.0.0.1:8768/"
SERVER_WAIT = "until curl -sf -o /dev/null http://127.0.0.1:8768/; do sleep 0.5; done   # wait until the preview answers"
QUICK_START = ["git clone https://github.com/montri-th/sila.git && cd sila", SERVER_START, SERVER_WAIT,
               "sh qa/run-unit-checks.sh", "python3 -m pip install playwright==1.56.0 && python3 -m playwright install chromium",
               "npm install --prefix qa/browser axe-core@4.10.2",
               "python3 qa/browser/run_matrix.py --base http://127.0.0.1:8768/ --out release-evidence/matrix.json",
               "python3 tools/handoff/build_handoff.py --check"]
QA_COMMANDS = [
    {"check": "Node unit checks (tax engine, calculator, terrain, aggregates, map pick, house points, FABDEM) and expected city figures current", "command": "sh qa/run-unit-checks.sh"},
    {"check": "Browser matrix and flows", "command": "python3 qa/browser/run_matrix.py --base http://127.0.0.1:8768/ --out RECEIPT.json"},
    {"check": "Accessibility (axe-core)", "command": "python3 qa/browser/run_a11y.py --base http://127.0.0.1:8768/ --out RECEIPT.json"},
    {"check": "Phone overflow", "command": "python3 qa/browser/run_overflow.py --base http://127.0.0.1:8768/ --out RECEIPT.json"},
    {"check": "Publication audit", "command": "python3 tools/publication-audit.py --since PUBLISHED_COMMIT --out RECEIPT.json"},
    {"check": "Expected city figures current (write them with --out after a change to data/parcel-tax.json or tax-engine.js)", "command": "node qa/compute-figures.cjs --check"},
    {"check": "Manifest current", "command": "python3 tools/gen-manifest.py --check"},
    {"check": "Handoff documents current", "command": "python3 tools/handoff/build_handoff.py --check"},
    {"check": "Published bytes (after merge)", "command": "python3 tools/verify-live.py --base-url https://montri-th.github.io/sila/ --output OUTPUT.json"},
]


def plan_doc():
    locked = [{"path": p_, "sha256": sha256_file(p_), "governs": g} for p_, g in LOCKED]
    must_always = [f"{i['id']}: {i['rule']}" for i in H.INVARIANTS if i["id"].split("-")[0] in ("DATA", "LDS", "REL", "SAFE")]
    must_never = [f"{i['id']}: {i['rule']}" for i in H.INVARIANTS if i["id"].split("-")[0] in ("PRIV", "KEY", "GIT", "BRAND", "LIC", "CLAIM")]
    lds = next(a for a in H.AUTHORITIES if a["name"].startswith("Landometer Design System"))
    addon = next(a for a in H.AUTHORITIES if a["name"].startswith("CityChat Add-on"))
    return {
        "schema": "sila-implementation-plan/1",
        "document": {**document("implementation-plan", "แผนลงมือสำหรับนักพัฒนาและ AI coding agent", "agent-ready implementation plan"),
                     "changeLog": H.CHANGELOG,
                     "sources": [{"ref": f"{H.PACKAGE['repo']}@{H.PACKAGE['branch']}", "commit": H.PACKAGE["baseCommit"], "observedAt": H.PACKAGE["date"]},
                                 {"ref": "Landometer Master Brand Brief v0.5.3", "sha256": H.AUTHORITIES[1]["sha256"], "observedAt": H.PACKAGE["date"]},
                                 {"ref": "CityChat Product Brief v4", "sha256": H.AUTHORITIES[2]["sha256"], "observedAt": H.PACKAGE["date"]},
                                 {"ref": lds["documentId"], "sha256": lds["sha256"], "observedAt": H.PACKAGE["date"]},
                                 {"ref": addon["documentId"], "sha256": addon["sha256"], "observedAt": H.PACKAGE["date"]}]},
        "decision": {"ownerDecisions": P.DECISIONS},
        "repo": {"name": H.PACKAGE["repo"], "baseCommit": H.PACKAGE["baseCommit"], "branch": H.PACKAGE["branch"],
                 "reviewChannel": "GitHub pull request to main; the owner reviews and merges; never force-push main",
                 "qualityGates": [q["command"] for q in QA_COMMANDS], "agentGuide": "AGENTS.md (CLAUDE.md imports it)"},
        "surfaces": H.SURFACES,
        "dataContracts": {"ref": "handoff.json#/dataContracts", "locked": locked},
        "problems": H.PROBLEMS, "phases": P.PHASES, "gates": P.GATES, "tasks": P.TASKS,
        "aiContext": {"oneLine": ONE_LINE, "mustAlways": must_always, "mustNever": must_never,
                      "designSystem": {"lds": {"documentId": lds["documentId"], "release": lds["release"], "colorSet": lds["colorSet"], "sha256": lds["sha256"], "url": lds["location"]},
                                       "addon": {"documentId": addon["documentId"], "sha256": addon["sha256"]}},
                      "evidenceLabels": H.EVIDENCE_LABELS},
    }


ONE_LINE = ("Public, static, no-login officer map for Sila Municipality (CityChat · CityMETER for Organization): five work missions, map layers for tax planning "
            "estimates, flood study points, aggregated care data, public works and area basics; vanilla JS IIFE modules with window globals, Leaflet plus MapLibre "
            "for 3D, no build step, served by GitHub Pages from main.")


def facts_doc(facts, receipts):
    return {"schema": "sila-handoff-facts/1", "observedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
            "observedCommit": facts["head"], "workingTreeDirty": facts["dirty"], "trackedFiles": len(facts["tracked"]),
            "modules": facts["modules"], "css": facts["css"], "styles": facts["styles"], "scripts": facts["scripts"], "data": facts["data"], "receipts": receipts,
            "note": "Snapshot taken when the handoff was built; --check does not compare it byte for byte."}


# ---------------------------------------------------------------- validation
def validate(plan, facts, generated=()):
    errors = []
    tasks = plan["tasks"]
    ids = [t["id"] for t in tasks]
    if len(ids) != len(set(ids)):
        errors.append("duplicate task ids")
    problems = {p_["id"] for p_ in plan["problems"]}
    decisions = {d["id"]: d for d in plan["decision"]["ownerDecisions"]}
    if len(decisions) != len(plan["decision"]["ownerDecisions"]):
        errors.append("duplicate decision ids")
    phases = {ph["id"] for ph in plan["phases"]}
    for t in tasks:
        for k in ("steps", "acceptance", "verify", "prompt", "repoPaths", "title", "short", "doNot", "readFirst"):
            if not t.get(k):
                errors.append(f"{t['id']}: empty {k}")
        if not (t["title"].get("th") and t["title"].get("en")):
            errors.append(f"{t['id']}: title needs th and en")
        if t["phase"] not in phases:
            errors.append(f"{t['id']}: unknown phase {t['phase']}")
        if t["status"] not in ("todo", "blocked", "in-progress", "done"):
            errors.append(f"{t['id']}: bad status {t['status']}")
        for d in t["dependsOn"]:
            if d not in ids:
                errors.append(f"{t['id']}: dependsOn unknown {d}")
        for p_ in t["problemRefs"]:
            if p_ not in problems:
                errors.append(f"{t['id']}: problemRefs unknown {p_}")
        if t["ownerDecision"] and t["ownerDecision"] not in decisions:
            errors.append(f"{t['id']}: unknown owner decision {t['ownerDecision']}")
        for w in t.get("waitsFor", []):
            if w not in {r["id"] for r in H.DATA_REQUESTS} | set(decisions):
                errors.append(f"{t['id']}: waitsFor unknown {w}")
            elif t["status"] != "blocked":
                errors.append(f"{t['id']}: waits for {w} but status is {t['status']}")
        if t["ownerDecision"] and decisions.get(t["ownerDecision"], {}).get("status") == "open" and t["status"] not in ("blocked",):
            errors.append(f"{t['id']}: waits for open decision {t['ownerDecision']} but status is {t['status']}")
        for s in t["surfaces"]:
            if s not in {x["id"] for x in plan["surfaces"]}:
                errors.append(f"{t['id']}: unknown surface {s}")
        for rp in t["repoPaths"] + [r.split(" ")[0] for r in t["readFirst"]]:
            if rp.startswith(("montri-th/", "theshifters/")):
                continue
            if not os.path.exists(path(rp)) and rp not in generated:
                errors.append(f"{t['id']}: path does not exist: {rp}")
        for c in t.get("creates", []):
            exists = os.path.exists(path(c))
            if t["status"] == "done" and not exists:
                errors.append(f"{t['id']}: done but {c} missing")
    # no cycles (Kahn)
    indeg = {i: 0 for i in ids}
    for t in tasks:
        for d in t["dependsOn"]:
            indeg[t["id"]] += 1
    queue = [i for i, n in indeg.items() if n == 0]
    seen = 0
    children = {i: [t["id"] for t in tasks if i in t["dependsOn"]] for i in ids}
    while queue:
        i = queue.pop()
        seen += 1
        for c in children[i]:
            indeg[c] -= 1
            if indeg[c] == 0:
                queue.append(c)
    if seen != len(ids):
        errors.append("dependency cycle among tasks")
    # gates cover their phase
    for g in plan["gates"]:
        for r in g["requires"] + g["nonBlockingInPhase"]:
            if r not in ids:
                errors.append(f"{g['id']}: unknown task {r}")
        in_phase = {t["id"] for t in tasks if t["phase"] == g["phase"]}
        covered = set(g["requires"]) | set(g["nonBlockingInPhase"])
        if in_phase - covered:
            errors.append(f"{g['id']}: tasks not covered: {sorted(in_phase - covered)}")
    for d in decisions.values():
        for b in d["blocks"]:
            if b not in ids:
                errors.append(f"{d['id']}: blocks unknown task {b}")
        if d["status"] == "decided":
            if d["quoteLabel"] not in H.QUOTE_LABELS:
                errors.append(f"{d['id']}: decided needs a quote label")
            if d["quoteLabel"] == "VERBATIM" and not d["ownerWords"]:
                errors.append(f"{d['id']}: VERBATIM without owner words")
            if not d["decidedAt"] or not d["decision"]:
                errors.append(f"{d['id']}: decided needs decision and decidedAt")
        elif d["status"] == "open":
            if d["ownerWords"] or d["decision"]:
                errors.append(f"{d['id']}: open decision must not carry owner words or a decision")
        else:
            errors.append(f"{d['id']}: bad status")
    inv = [i["id"] for i in H.INVARIANTS]
    if len(inv) != len(set(inv)):
        errors.append("duplicate invariant ids")
    # AGENTS.md lists every root script: a new or moved file needs its role recorded (tasks R-10 to R-12)
    roles = set(H.MODULE_ROLES)
    for m in facts["modules"]:
        if m["file"] not in roles:
            errors.append(f"{m['file']}: root JS file without a role in MODULE_ROLES (tools/handoff/handoff_data.py)")
    for f in sorted(roles):
        if not os.path.exists(path(f)):
            errors.append(f"MODULE_ROLES lists {f}, which does not exist")
    return errors


def figures_current():
    """The city figures in the documents come from qa/expected-figures.json; fail when it no longer matches the engine and data."""
    try:
        r = subprocess.run(["node", "qa/compute-figures.cjs", "--check"], cwd=ROOT, capture_output=True, text=True)
    except FileNotFoundError:
        return ["node not found: the expected-figures check needs Node 20 or later"]
    return [] if r.returncode == 0 else ["qa/expected-figures.json: " + (r.stdout.strip() or r.stderr.strip())]


def lint(name, text):
    errs = []
    if text.startswith("﻿"):
        errs.append(f"{name}: BOM")
    if not text.endswith("\n"):
        errs.append(f"{name}: no final newline")
    for n, line in enumerate(text.split("\n"), 1):
        if line != line.rstrip():
            errs.append(f"{name}:{n}: trailing whitespace")
            break
        if "\t" in line:
            errs.append(f"{name}:{n}: tab")
            break
    return errs


# ---------------------------------------------------------------- rendering (Thai prose, English agent fields)
def header_note(extra=""):
    return (f"\n> ฉบับ {H.PACKAGE['version']} · {H.PACKAGE['date']} · ไซต์ revision {H.PACKAGE['siteRevision']} (ฐาน {H.PACKAGE['baseRevision']} commit `{H.PACKAGE['baseCommit'][:7]}`)"
            f" · สร้างจาก `tools/handoff/` ห้ามแก้ไฟล์นี้ด้วยมือ{extra}\n")


def field_table(rows):
    return "JSON ด้านล่างสำหรับโปรแกรมอ่าน ตรงกับไฟล์ .json ชื่อเดียวกันทุกตัวอักษร\n\n" + table(["Field", "ความหมาย"], rows)


def render_brief(doc):
    b = doc["brief"]
    o = [f"# {b['title']}\n", f"\n{b['subtitle']}\n", header_note(), f"\n{b['scopeNote']}\n", "\n## ไซต์นี้คืออะไร\n", f"\n{b['oneLine']}\n\n"]
    o.append(table(["ข้อเท็จจริง", "ป้าย", "ที่มา"], [[c["text"], c["label"], c["source"]] for c in b["context"]]))
    o.append("\n## ผู้ใช้และงานที่ต้องทำ\n\n")
    o.append(f"ความต้องการของเจ้าหน้าที่ตาม Product Brief: \"{b['officerNeed']['quote']}\" ({b['officerNeed']['label']}, {b['officerNeed']['source']})\n\n")
    o.append(table(["กลุ่มผู้ใช้", "งานที่ต้องทำ", "สิ่งที่ไซต์ให้ตอนนี้"], [[u["group"], u["jobs"], u["today"]] for u in b["users"]]))
    o.append(f"\nข้อสังเกตหลัก: \"{b['insight']['quote']}\" ({b['insight']['label']}, {b['insight']['source']})\n")
    o.append(f"\n## สิ่งที่มีแล้วในรุ่น {H.PACKAGE['siteRevision']}\n\n")
    o.append(table(["งาน", "ชั้นข้อมูล"], [[f"{m['label'][0]} ({m['id']})", " · ".join(f"{l['label'][0]}" for l in m["layers"])] for m in doc["missions"]]))
    o.append("\n## ตัวเลขหลักจากข้อมูลที่เผยแพร่\n\n")
    o.append(table(["ตัวเลข", "ค่า", "ป้าย", "หมายเหตุ"], [[k["figure"], k["value"], k["label"], k["note"]] for k in b["keyFigures"]]))
    o.append("\n## นอกขอบเขต\n\n" + bullets(b["nonGoals"]))
    o.append("\n## หลักการออกแบบ\n\n" + numbered(b["principles"]))
    o.append("\n## ความขัดกับเอกสารต้นทาง (รายงาน ไม่ตัดสินเอง)\n\n")
    o.append(table(["ID", "เรื่อง", "เอกสารต้นทางว่า", "ไซต์ทำอยู่", "ผู้ตัดสิน"], [[c["id"], c["topic"], c["sourceSays"], c["siteDoes"], c["decision"]] for c in b["conflicts"]]))
    o.append("\n## สมมติฐานที่จะทดสอบ (Hypothesis)\n\nรายการนี้ไม่ใช่ผลลัพธ์หรือ traction แต่ใช้ตัดสินว่ารอบถัดไปจะทดสอบอะไร\n\n")
    o.append(table(["ID", "สมมติฐาน", "วัดอย่างไร"], [[h["id"], h["text"], h["measure"]] for h in b["hypotheses"]]))
    o.append("\n## ความเสี่ยง\n\n" + table(["ความเสี่ยง", "ทางจัดการ", "อ้างอิง"], [[r["risk"], r["mitigation"], r["ref"]] for r in b["risks"]]))
    o.append("\n## ข้อมูลที่ยังต้องขอ\n\n" + table(["ID", "ถึง", "สถานะ", "ข้อความ", "ป้าย", "ที่มา"], [[r["id"], r["to"], r["status"], r["text"], r["quote"], r["source"]] for r in doc["dataRequests"]]))
    o.append("\n## ลำดับอำนาจและแหล่งอ้างอิง\n\n" + table(["ลำดับ", "เอกสาร", "กำกับ", "สถานะ", "SHA-256"], [[a["rank"], a["name"], a["governs"], a["status"], a.get("sha256")] for a in doc["authorities"]]))
    o.append("\n## ป้ายหลักฐาน (MBB v0.5.3 section 3.7, VERBATIM)\n\n" + table(["ป้าย", "ความหมาย"], [[e["label"], e["meaning"]] for e in doc["evidenceLabels"]]))
    o.append("\n## คำศัพท์\n\n" + table(["คำ", "ความหมาย"], [[g["term"], g["meaning"]] for g in doc["glossary"]]))
    o.append("\n## ส่วนที่เครื่องอ่าน\n\n" + field_table([["document", "รุ่น วันที่ สถานะ ฐาน commit"], ["authorities", "ลำดับอำนาจพร้อม SHA-256 และสถานะ"], ["evidenceLabels", "ป้ายหลักฐาน VERBATIM"],
                                                       ["brief", "เนื้อหา brief ทั้งหมด รวม keyFigures ที่คำนวณจาก qa/expected-figures.json"], ["missions", "งาน 5 ด้านและชั้นข้อมูลจาก missions.js"],
                                                       ["dataRequests", "ข้อมูลที่ต้องขอ"], ["glossary", "คำศัพท์"]]) + "\n" + embed(doc))
    return "".join(o)


def render_handoff(doc, plan):
    s = doc["state"]
    o = ["# Handoff: แผนที่งานเจ้าหน้าที่ศิลา\n", header_note(" · ขนาดไฟล์และจำนวนบรรทัดอยู่ใน [FACTS.md](FACTS.md)"),
         "\nเอกสารนี้บอกว่าตอนนี้มีอะไร อยู่ที่ไหน ทำงานอย่างไร ตรวจอย่างไร และออก release อย่างไร งานที่ต้องทำต่ออยู่ใน [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) "
         "และกติกาสำหรับ agent อยู่ใน [AGENTS.md](../../AGENTS.md)\n", "\n## สถานะ\n\n"]
    lc = s["baseCommitLiveCheck"]
    rows = [["เว็บ", s["liveUrl"], "Observed fact"], ["Repository", f"{s['repo']} · branch {s['branch']} · GitHub Pages จาก main", "Observed fact"],
            ["รุ่นที่ตรวจบนเว็บจริงล่าสุด", f"{s['baseRevision']} · commit {s['baseCommit'][:7]} · ไฟล์ตรง manifest {lc['passed']}/{lc['checked']} เมื่อ {lc['verifiedAtUtc']}", "Observed fact"],
            ["รุ่นของชุดนี้", f"{s['siteRevision']}: เอกสาร เครื่องมือ และแก้ข้อความหนึ่งจุดใน data/parcel-tax.json · สถานะเผยแพร่ดูจาก build-manifest.json และผล verify-live ล่าสุด", "Observed fact"],
            ["ระบบจริง", "ไม่มีการเข้าสู่ระบบ ไม่เขียนข้อมูลกลับ ไม่เชื่อมข้อมูล production", "Observed fact (README front matter)"]]
    for kind, r in s["latestReceipts"].items():
        rows.append([f"ผลตรวจ {kind}", ", ".join(f"{k} {v}" for k, v in r.items() if k != "file") + f" · {r['file']}", "Observed fact"])
    o.append(table(["หัวข้อ", "ค่า", "ป้าย"], rows))
    o.append("\n## เริ่มงานใน 15 นาที\n\n" + code(doc["quickStart"]))
    a = doc["architecture"]
    o.append("\n## สถาปัตยกรรม\n\nหน้าเว็บ static ไม่มีขั้น build สคริปต์แต่ละไฟล์เป็น IIFE ที่ประกาศ global ของตัวเอง โหลดตามลำดับใน index.html และ app.js ต้องอยู่ท้ายสุด\n\n")
    o.append(code(MERMAID_ARCH, "mermaid"))
    o.append("\n" + table(["ไฟล์", "Global", "หน้าที่"], [[m["file"], m["globals"], m["role"]] for m in a["modules"]]))
    o.append("\nลำดับโหลด (ค่า ?v= อยู่ใน FACTS.md)\n\n" + table(["ชนิด", "ลำดับ"], [["styles", " → ".join(a["loadOrder"]["styles"])], ["scripts", " → ".join(a["loadOrder"]["scripts"])]]))
    o.append(f"\nการเริ่มระบบ: {a['startup']}\n\n")
    o.append("พารามิเตอร์ใน URL (สถานะทั้งหมดอยู่ใน URL จึงเปิดมุมมองเดิมซ้ำได้)\n\n" + table(["พารามิเตอร์", "ค่า"], [[u["param"], u["values"]] for u in a["urlParams"]]))
    o.append(f"\nจุดต่อสำหรับทดสอบ: `{a['testHook']}`\n")
    o.append("\n## งานและชั้นข้อมูล\n\n" + table(["งาน", "ชั้นข้อมูลตามลำดับ"], [[f"{m['label'][0]} / {m['label'][1]} ({m['id']})", m["layers"]] for m in doc["missions"]]))
    o.append("\n" + table(["ชั้น", "ชื่อ", "ชนิด", "ไฟล์ข้อมูล", "ข้อมูลประกอบ", "เครื่องมือ", "สถานะในบัญชี"],
                          [[l["id"], l["label"][0], l["kind"], l["dataFiles"], l["supplements"], l["tools"], l["catalogStatus"]] for l in doc["layers"]]))
    dc = doc["dataContracts"]
    o.append("\n## สัญญาข้อมูล\n\n" + table(["ไฟล์", "ความหมาย", "ความเป็นส่วนตัว", "สถานะในบัญชี"], [[f["path"], f["meaning"], f["privacy"], f["catalogStatus"]] for f in dc["files"]]))
    o.append("\nฟิลด์ใน `data/parcel-tax.json` (แถวละหนึ่งโฉนด เรียงตาม `fields`)\n\n" + table(["Field", "ความหมาย"], [[k, v] for k, v in dc["parcelTaxFields"].items()]))
    tb = dc["taxBaseline"]
    o.append(f"\n### กติกาฐานภาษีรุ่น 2.0 (VERBATIM จาก {tb['source']}, SHA-256 `{tb['sha256'][:16]}…`)\n\n" + quote_block(tb["text"]))
    npb = dc["notPublished"]
    o.append(f"\n### สิ่งที่ไม่เผยแพร่ (VERBATIM จาก {npb['source']})\n\n" + quote_block(npb["text"]))
    ps = dc["publicSummary"]
    o.append(f"\n### สัญญาข้อมูลสรุประดับเทศบาล (VERBATIM จาก {ps['source']})\n\n" + quote_block(ps["text"]))
    o.append("\n### สถานะพิกัดจุดศึกษาน้ำท่วม\n\n" + table(["สถานะ", "ความหมาย"], [[k, v] for k, v in dc["floodCoordinateStatus"]["values"].items()]))
    cf = dc["cityFigures"]
    o.append(f"\n### ตัวเลขทั้งเมือง (คำนวณโดย tax-engine {cf['engine']} · `qa/expected-figures.json`)\n\n")
    o.append(table(["รายการ", "ค่า"], [["ยอดเรียกเก็บ 2569", fmt_money(cf["totals"]["billed69"])], ["ภาษีตามกฎหมาย ไม่ใช้ข้อเสนอ", fmt_money(cf["totals"]["law69"])],
                                       ["2570 ตามข้อเสนอ", fmt_money(cf["totals"]["new70"])], ["ส่วนเพิ่มที่นับ", f"{fmt_money(cf['negotiate']['gainMaterial'])} ({fmt_int(cf['negotiate']['parcelsMaterial'])} โฉนด)"],
                                       ["ส่วนเพิ่มบนหน้าเว็บขอบเขตเทศบาล (ไม่รวมโฉนดนอกเขต)", f"{fmt_money(cf['municipalityView']['gainMaterialInside'])} ({fmt_int(cf['municipalityView']['parcelsMaterialInside'])} แปลง; นอกเขต {fmt_int(cf['municipalityView']['titlesOutsideBoundary'])} โฉนด)"]]
                   + [[f"กลุ่ม {k}", f"{fmt_int(v[0])} บาท · {fmt_int(v[1])} โฉนด"] for k, v in sorted(cf["negotiate"]["byInitiative"].items(), key=lambda kv: -kv[1][0])]
                   + [["บัญชีต่ำกว่าที่คำนวณ ต่ำกว่า 100 บาท (ไม่นับ)", f"{fmt_money(cf['negotiate']['rollBelowSmallSum'])} · {fmt_int(cf['negotiate']['rollBelowSmallTitles'])} โฉนด"],
                      ["บัญชีสูงกว่าที่คำนวณ (แสดงแยก)", f"{fmt_money(cf['totals']['rollAbove69'])} · {fmt_int(cf['totals']['parcelsRollAbove'])} โฉนด"],
                      ["เกษตรราคาสูง", f"{fmt_int(cf['agriWatch']['titles'])} โฉนด · ถ้าตรวจพบว่าทุกโฉนดไม่ได้ทำประโยชน์ เพิ่มได้สูงสุด +{fmt_int(cf['agriWatch']['potential'])} บาทต่อปี"],
                      ["เจ้าของ", f"{fmt_int(cf['owners']['count'])} ราย · {fmt_int(round(cf['owners']['totalValueMTHB']))} ล้านบาท · 10 อันดับแรก {cf['owners']['top10Share']}% · ตั้งแต่ 50 ล้านบาท {cf['owners']['over50M']} ราย"]]))
    o.append("\n## ช่องทางใช้งานและกติกาของแต่ละช่องทาง\n\n" + table(["ID", "ช่องทาง", "การยืนยันตัวตน", "การเขียน", "ข้อมูล", "แคช", "Analytics"],
                                                        [[x["id"], x["name"], x["auth"], x["writes"], x["data"], x["cache"], x["analytics"]] for x in doc["surfaces"]]))
    o.append("\nคำขอออกนอกเว็บจากหน้าเว็บสาธารณะ: " + "; ".join(doc["surfaces"][0]["externalRequests"]) + "\n")
    o.append("\n## กติกาที่ห้ามละเมิด\n\n" + table(["ID", "กติกา", "ตรวจด้วย"], [[i["id"], i["rule"], i["check"]] for i in doc["invariants"]]))
    o.append("\n## การตรวจและหลักฐาน\n\n" + table(["การตรวจ", "คำสั่ง"], [[q["check"], f"`{q['command']}`"] for q in doc["qa"]["commands"]]))
    o.append("\nยังไม่ครอบคลุม: " + "; ".join(doc["qa"]["notCovered"]) + "\n")
    o.append("\n## ขั้นตอนออก release\n\n" + table(["ขั้น", "ทำอะไร", "คำสั่ง"], [[n, r["step"], f"`{r['command']}`"] for n, r in enumerate(doc["release"], 1)]))
    o.append("\n## คำตัดสิน (รายละเอียดใน IMPLEMENTATION_PLAN.md)\n\n" + table(["ID", "สถานะ", "เรื่อง", "ผล หรือข้อเสนอแนะ", "ขวางงาน"],
                                                                          [[d["id"], d["status"], d["question"], d["decision"] or d["recommendation"], d["blocks"]] for d in plan["decision"]["ownerDecisions"]]))
    o.append("\n## ปัญหาที่รู้แล้ว\n\n" + table(["ID", "สถานะ", "ป้าย", "สรุป"], [[p_["id"], p_["status"], p_["label"], p_["summary"]] for p_ in plan["problems"]]))
    o.append("\n## ข้อมูลที่ต้องขอ\n\n" + table(["ID", "ถึง", "สถานะ", "ข้อความ", "ป้าย"], [[r["id"], r["to"], r["status"], r["text"], r["quote"]] for r in doc["dataRequests"]]))
    o.append("\n## สิ่งที่อยู่นอก repository\n\n" + table(["อะไร", "อยู่ที่ไหน", "ทำไม"], [[x["item"], x["where"], x["why"]] for x in doc["outsideRepo"]]))
    o.append("\n## ข้อควรระวัง\n\n" + bullets(doc["gotchas"]))
    o.append("\n## สูตรงานที่ทำบ่อย\n\n" + "".join(f"### {r['title']}\n\n" + numbered(r["steps"]) + "\n" for r in doc["recipes"]))
    o.append("## ส่วนที่เครื่องอ่าน\n\n" + field_table([["state", "เว็บ รุ่น commit ผลตรวจล่าสุด"], ["quickStart", "คำสั่งเริ่มงาน"], ["architecture", "ไฟล์ global หน้าที่ ลำดับโหลด URL"],
                                                      ["missions / layers", "งานและชั้นข้อมูลจาก missions.js พร้อมไฟล์ข้อมูล"], ["dataContracts", "ไฟล์ข้อมูล ฟิลด์ กติกาที่ฝัง VERBATIM พร้อม SHA-256 ตัวเลขทั้งเมือง"],
                                                      ["surfaces / invariants", "ช่องทางใช้งานและกติกา"], ["qa / release", "คำสั่งตรวจ receipt และขั้นตอนออก release"],
                                                      ["decisionsRef / problemsRef", "ชี้ไปที่ implementation-plan.json"], ["dataRequests / outsideRepo / gotchas / recipes", "ข้อมูลที่ต้องขอ สิ่งนอก repo ข้อควรระวัง สูตรงาน"]]) + "\n" + embed(doc))
    return "".join(o)


def quote_block(text):
    return "\n".join(("> " + line) if line.strip() else ">" for line in text.split("\n")) + "\n"


MERMAID_ARCH = """flowchart LR
  subgraph page[index.html]
    libs[Leaflet · MapLibre · amCharts 5] --> mods[basemap · house-points · map-pick · context-actions · ui-icons · public-aggregate · fabdem-layer · terrain-3d · choropleth · missions · tax-calculator · tax-engine · sila-charts]
    mods --> app[app.js · SilaExplorer]
  end
  data[(data/*.json · *.geojson)] -- fetchJSON + ?v=DATA_VERSION --> app
  ref[(reference/*.json)] --> app
  tiles[[FABDEM tiles · landometer.com]] --> worker[terrain-dem-worker.js] --> mods
  base[[OpenFreeMap · satellite tiles]] --> mods
  app -- CSV and outbound links --> user((officer))"""


def gantt(plan):
    """Phase 0-1 tasks that are not blocked, one developer, phase by phase, dependencies and priority within a phase."""
    prio = {"high": 0, "medium": 1, "low": 2}
    names = {ph["id"]: ph["name"]["th"] for ph in plan["phases"]}
    lines = ['%%{init: {"gantt": {"leftPadding": 170, "rightPadding": 230}}}%%', "gantt", "  title ลำดับงานระยะ 0-1 (Hypothesis · คนเดียว · ปัดเป็นวันเต็ม)",
             "  dateFormat YYYY-MM-DD", "  axisFormat %d %b", "  excludes weekends"]
    prev, done = None, set()
    for phase in ("phase-0", "phase-1"):
        tasks = {t["id"]: t for t in plan["tasks"] if t["phase"] == phase and t["status"] != "blocked"}
        if not tasks:
            continue
        lines.append(f"  section {names[phase]}")
        while tasks:
            ready = [t for t in tasks.values() if all(d in done or d not in tasks for d in t["dependsOn"])]
            t = sorted(ready, key=lambda x: (prio[x["priority"]], x["id"]))[0]
            del tasks[t["id"]]
            done.add(t["id"])
            title = re.sub(r"[:;#]", " ", t["short"])
            days = max(1, int(-(-t["estimateDays"] // 1)))
            start = f"after {prev}" if prev else "2026-10-26"
            key = t["id"].replace("-", "")
            lines.append(f"  {t['id']} {title} :{key}, {start}, {days}d")
            prev = key
    return "\n".join(lines)


def render_plan(doc):
    tasks = doc["tasks"]
    o = ["# แผนลงมือ: ศิลาสำหรับนักพัฒนาและ AI coding agent\n", header_note(" · วันประมาณทั้งหมดเป็น Hypothesis"), "\n## หลักการทำงาน\n\n"]
    o.append(bullets(["หนึ่งงานเท่ากับหนึ่ง branch และหนึ่ง pull request ไม่รวมงานอื่นเข้ามา",
                      "เริ่มทุกงานด้วยการอ่าน AGENTS.md และไฟล์ใน readFirst ของงาน แล้ววางพรอมป์ของงานให้ agent",
                      "รันคำสั่งใน verify ก่อนและหลังแก้ แนบสรุปผลใน pull request ไม่เรียกว่าเสร็จจนกว่าเกณฑ์รับงานผ่านทุกข้อ",
                      "งานที่ผูกกับคำตัดสินของเจ้าของ (ownerDecision) เริ่มได้เมื่อคำตัดสินบันทึกแล้วเท่านั้น",
                      "งานที่แตะหน้าตาต้องพิสูจน์ด้วยการเทียบภาพหน้าจอ (S-03) ว่าเปลี่ยนเฉพาะที่ตั้งใจ",
                      "เมื่อสถานะงานหรือคำตัดสินเปลี่ยน ให้แก้ tools/handoff/plan_data.py แล้ว build ใหม่ ไม่แก้ JSON หรือ Markdown ที่สร้างแล้วด้วยมือ"]))
    o.append("\n## ลำดับงาน\n\n" + code(gantt(doc), "mermaid"))
    gated = [t for t in tasks if t["status"] == "blocked"]
    open_ids = {d["id"] for d in doc["decision"]["ownerDecisions"] if d["status"] == "open"}
    waits = lambda t: ([t["ownerDecision"]] if t["ownerDecision"] in open_ids else []) + t.get("waitsFor", [])
    o.append("\nงานที่รอคำตัดสินหรือข้อมูลไม่มีวันที่ในแผนภาพ เพราะเริ่มเมื่อสิ่งที่รอมาถึง\n\n" + table(["ID", "งาน", "รอ", "ขึ้นกับ"], [[t["id"], t["title"]["th"], waits(t), t["dependsOn"]] for t in gated]))
    o.append("\n## เกณฑ์ผ่านแต่ละระยะ\n\n" + table(["Gate", "ระยะ", "ต้องเสร็จ", "ไม่ต้องรอให้เสร็จ", "เกณฑ์", "ผู้รับรอง"],
                                       [[g["id"], g["phase"], g["requires"], g["nonBlockingInPhase"], "; ".join(g["criteria"]), g["signoff"]] for g in doc["gates"]]))
    o.append("\n## งานทั้งหมด\n\n" + table(["ID", "งาน", "ระยะ", "สำคัญ", "วัน (Hyp.)", "ขึ้นกับ", "แก้ปัญหา", "คำตัดสิน", "สถานะ"],
                                         [[t["id"], t["title"]["th"], t["phase"], t["priority"], t["estimateDays"], t["dependsOn"], t["problemRefs"], t["ownerDecision"], t["status"]] for t in tasks]))
    o.append("\n## วิธีใช้กับ vibe coding\n\n" + numbered([
        "เลือกงานที่สถานะ todo และงานที่ขึ้นกับเสร็จแล้ว: `python3 tools/handoff/task.py` แสดงรายการ และ `python3 tools/handoff/task.py R-10` พิมพ์ brief ของงานนั้นพร้อมวางให้ agent",
        "สร้าง branch ชื่อ ID-คำสั้น (เช่น S-03-compare-shots) แล้วเปิด agent ในโฟลเดอร์ repository (Claude Code อ่าน CLAUDE.md ซึ่งนำเข้า AGENTS.md; Codex และ Cursor อ่าน AGENTS.md)",
        "วางพรอมป์ของงาน (ช่อง prompt) ให้ agent ทั้งก้อน ถ้า agent ถามเรื่องนอกขอบเขต ให้ตอบว่าทำเฉพาะงานนี้",
        "ให้ agent รันคำสั่งใน verify และเทียบกับ acceptance ทีละข้อ อ่านผลเองก่อนเชื่อสรุปของ agent",
        "เปิด pull request แนบผลตรวจ เจ้าของงานตรวจและ merge แล้วตามขั้นตอนออก release ใน HANDOFF.md",
        "อัปเดตสถานะงานใน tools/handoff/plan_data.py แล้วรัน python3 tools/handoff/build_handoff.py และ --check"]))
    o.append("\n## คำตัดสินของเจ้าของ\n\n" + table(["ID", "สถานะ", "คำถาม", "ทางเลือก", "ข้อเสนอแนะ", "ขวางงาน"],
                                                [[d["id"], d["status"], d["question"], " / ".join(d["options"]), d["recommendation"], d["blocks"]] for d in doc["decision"]["ownerDecisions"]]))
    o.append("\n### บันทึกคำตัดสินที่มีแล้ว\n\n")
    for d in doc["decision"]["ownerDecisions"]:
        if d["status"] != "decided":
            continue
        o.append(f"**{d['id']} · {d['question']}**\n\n")
        words = f"\"{d['ownerWords']}\"" if d["ownerWords"] else "ไม่มีถ้อยคำตรงในเอกสารนี้ (ดูที่มา)"
        o.append(bullets([f"คำของเจ้าของ ({d['quoteLabel']}): {words}", f"เมื่อ: {d['decidedAt']} · ผู้ตัดสิน: {d['decidedBy']} · มอบให้ผู้เขียนเลือก: {'ใช่' if d['delegatedToAuthor'] else 'ไม่'}",
                          f"สิ่งที่เปลี่ยน: {d['decision']}", f"ผลในโค้ดหรือเอกสาร: {d['meaning']}", f"ทางเลือกที่ไม่ใช้: {'; '.join(d['rejectedAlternatives']) or '—'}",
                          f"ความเสี่ยงที่เหลือ: {d['openRisk']}", f"ที่มา: {d['source']}"]) + "\n")
    o.append("## ปัญหาที่งานในแผนแก้\n\n" + table(["ID", "สถานะ", "สรุป"], [[p_["id"], p_["status"], p_["summary"]] for p_ in doc["problems"]]))
    o.append("\n## รายละเอียดงาน\n\n")
    for t in tasks:
        o.append(f"### {t['id']} · {t['title']['th']}\n\n{t['title']['en']}\n\n")
        o.append(table(["ระยะ", "สำคัญ", "ประมาณ (Hypothesis)", "คำตัดสิน", "สถานะ", "ขึ้นกับ", "แก้ปัญหา", "ช่องทาง"],
                       [[t["phase"], t["priority"], f"{t['estimateDays']} วัน", t["ownerDecision"], t["status"], t["dependsOn"], t["problemRefs"], t["surfaces"]]]))
        o.append("\n" + bullets([f"อ่านก่อน: {', '.join(t['readFirst'])}", f"ไฟล์ที่เกี่ยวข้อง: {', '.join(t['repoPaths'])}"] + ([f"ไฟล์ที่จะสร้าง: {', '.join(t['creates'])}"] if t["creates"] else [])))
        o.append("\nขั้นตอน\n\n" + numbered(t["steps"]) + "\nเกณฑ์รับงาน\n\n" + bullets(t["acceptance"]) + "\nคำสั่งตรวจ\n\n" + code(t["verify"]) + "\nห้าม\n\n" + bullets(t["doNot"]))
        o.append("\nพรอมป์สำหรับ agent\n\n" + code(t["prompt"], "text") + "\n")
    o.append("## ส่วนที่เครื่องอ่าน\n\n" + field_table([
        ["document", "id, supersedes, changeLog, status, sources (ref, commit หรือ sha256, observedAt)"],
        ["decision.ownerDecisions[]", "id, question, options, recommendation, blocks, status, decision, ownerWords, quoteLabel, decidedBy, decidedAt, delegatedToAuthor, rejectedAlternatives, meaning, openRisk, source"],
        ["repo", "ชื่อ repo, commit ฐาน, branch, ช่องทาง review, คำสั่ง quality gate"], ["surfaces[]", "ช่องทางใช้งานและกติกา auth, writes, cache, analytics"],
        ["dataContracts", "ชี้ไปที่ handoff.json และรายการสัญญาที่ล็อกพร้อม SHA-256"], ["problems[]", "ปัญหาที่รู้แล้ว พร้อมสถานะและป้ายหลักฐาน"],
        ["phases[] / gates[]", "ระยะงาน และเกณฑ์ผ่านแต่ละระยะ (requires, nonBlockingInPhase, criteria, signoff)"],
        ["tasks[]", "id, short, phase, priority, estimateDays (Hypothesis), ownerDecision, status, waitsFor (data requests, optional), title {th, en}, problemRefs, dependsOn, surfaces, readFirst, repoPaths, creates, steps, acceptance, verify, doNot, prompt"],
        ["aiContext", "oneLine, mustAlways, mustNever, designSystem พร้อม hash, evidenceLabels"]]) + "\n" + embed(doc))
    return "".join(o)


def render_facts(doc):
    o = ["# ข้อเท็จจริงจาก repository ณ เวลาที่ build\n",
         f"\n> ภาพ snapshot · commit `{doc['observedCommit'][:7]}`{' + การแก้ที่ยังไม่ commit' if doc['workingTreeDirty'] else ''} · {doc['observedAtUtc']} · ไฟล์ที่ track {doc['trackedFiles']} ไฟล์ · `--check` ไม่เทียบไฟล์นี้แบบไบต์\n\n"]
    o.append(table(["ไฟล์ JS", "ไบต์", "บรรทัด", "Global"], [[m["file"], fmt_int(m["bytes"]), fmt_int(m["lines"]), m["globals"]] for m in doc["modules"]]))
    o.append("\n" + table(["ไฟล์ CSS", "ไบต์", "บรรทัด"], [[c["file"], fmt_int(c["bytes"]), fmt_int(c["lines"])] for c in doc["css"]]))
    o.append("\n" + table(["ลำดับใน index.html", "ไฟล์พร้อม cache key"], [["styles", " → ".join(doc["styles"])], ["scripts", " → ".join(doc["scripts"])]]))
    o.append("\n" + table(["ไฟล์ข้อมูล", "ไบต์", "จำนวน feature"], [[d["path"], fmt_int(d["bytes"]), fmt_int(d["features"]) if "features" in d else "—"] for d in doc["data"]]))
    o.append("\n" + table(["Receipt", "สรุป"], [[k, ", ".join(f"{a} {b}" for a, b in v.items())] for k, v in doc["receipts"].items()]))
    o.append("\n## ส่วนที่เครื่องอ่าน\n\n" + embed(doc))
    return "".join(o)


def render_sources(plan):
    o = ["# แหล่งอ้างอิงและสัญญาที่ล็อก\n", header_note(), "\n## ลำดับอำนาจ\n\nเอกสารระดับล่างไม่ทับระดับบน ขัดกันให้รายงานความต่าง ห้ามเลือกข้างเงียบ ๆ\n\n"]
    o.append(table(["ลำดับ", "เอกสาร", "กำกับ", "ที่อยู่", "สถานะ", "SHA-256"], [[a["rank"], a["name"], a["governs"], a["location"], a["status"], a.get("sha256")] for a in H.AUTHORITIES]))
    o.append("\n## สัญญาใน repository ที่แผนนี้อ้าง\n\nถ้าค่า SHA-256 เปลี่ยน `build_handoff.py --check` จะล้มจนกว่าจะ build ใหม่ เพื่อให้คนอ่านสัญญาฉบับใหม่ก่อน\n\n")
    o.append(table(["ไฟล์", "SHA-256", "กำกับ"], [[x["path"], f"`{x['sha256']}`", x["governs"]] for x in plan["dataContracts"]["locked"]]))
    o.append("\n## ข้อความที่ฝังตามตัวอักษร\n\n" + bullets([
        "handoff.json#/dataContracts/taxBaseline: reference/tax-map-method.md หัวข้อ 'รุ่น 2.0: ฐานเปรียบเทียบคือยอดที่เรียกเก็บปี 2569 และการจัดสรรส่วนเพิ่มให้ข้อเสนอ' (ไม่รวมหัวข้อย่อย)",
        "handoff.json#/dataContracts/notPublished: reference/tax-map-method.md หัวข้อ 'สิ่งที่ไม่เผยแพร่'",
        "handoff.json#/dataContracts/publicSummary: reference/public-summary-contract.md หัวข้อ 'สัญญาข้อมูล'",
        "product-brief.json#/evidenceLabels และ implementation-plan.json#/aiContext/evidenceLabels: MBB v0.5.3 section 3.7",
        "product-brief.json#/brief: คำพูดจาก CityChat Product Brief v4 section 1.2.1 และ Appendix C, MBB v0.5.3 sections 0.3 และ 5.1",
        "implementation-plan.json#/decision: คำของเจ้าของงานตามป้าย VERBATIM, PARTIAL หรือ RECONSTRUCTED"]))
    return "".join(o)


def render_changelog():
    o = ["# บันทึกการเปลี่ยนแปลงของชุดส่งต่องาน\n", header_note(), "\n"]
    for c in H.CHANGELOG:
        o.append(f"## ฉบับ {c['version']} · {c['date']}\n\n" + bullets(c["changes"]) + "\n")
    return "".join(o).rstrip("\n") + "\n"


def render_readme(generated):
    o = ["# ชุดส่งต่องานสำหรับนักพัฒนา · แผนที่งานเจ้าหน้าที่ศิลา\n", header_note(),
         "\nชุดนี้ให้นักพัฒนาและ AI coding agent ทำงานต่อบน `montri-th/sila` ได้ทันที เอกสารหลักทุกฉบับมีส่วนที่คนอ่านและ JSON ที่เครื่องอ่าน โดย JSON ที่ฝังใน .md ตรงกับไฟล์ .json คู่กันทุกตัวอักษร\n",
         "\n## อ่านอะไรก่อน\n\n"]
    o.append(table(["ผู้อ่าน", "ลำดับ"], [["นักพัฒนา", "PRODUCT_BRIEF.md → HANDOFF.md → IMPLEMENTATION_PLAN.md → AGENTS.md"],
                                         ["AI coding agent", "AGENTS.md (โหลดเองจาก CLAUDE.md หรือ AGENTS.md) → implementation-plan.json งานที่ได้รับ → readFirst ของงาน"],
                                         ["เจ้าของงาน", "PRODUCT_BRIEF.md หัวข้อความขัดกับเอกสารต้นทาง → IMPLEMENTATION_PLAN.md ตารางคำตัดสิน"]]))
    o.append("\n## ไฟล์\n\n" + table(["ไฟล์", "คืออะไร", "SHA-256"], [[f"[{n}]({n})", what, f"`{h}`"] for n, what, h in generated]))
    o.append("\nFACTS.md และ facts.json เป็นภาพ ณ เวลาที่ build (ขนาดไฟล์ จำนวนบรรทัด cache key) จึงไม่มี hash ในตารางนี้\n")
    o.append("\n## แก้และตรวจ\n\n" + bullets(["แก้เนื้อหาที่ tools/handoff/handoff_data.py, plan_data.py และ brief_data.py แล้วรัน `python3 tools/handoff/build_handoff.py`",
                                            "ก่อนเปิด pull request รัน `python3 tools/handoff/build_handoff.py --check` (ล้มเมื่อไฟล์ไม่ตรงกับ builder แผนผิดกติกา path ไม่มีจริง หรือมี trailing space/BOM)",
                                            "เอกสารนี้อยู่ใน repository สาธารณะ: ห้ามใส่ข้อมูลส่วนบุคคล ราคา สัญญา pipeline การขาย หรือ credential"]))
    return "".join(o)


def render_agents(team_notes):
    o = ["# AGENTS.md · Sila officer site\n", "\n<!-- Generated by tools/handoff/build_handoff.py from tools/handoff/*_data.py. Edit those files and rebuild; only the TEAM-NOTES block below is kept by hand. -->\n",
         f"\n{ONE_LINE}\n", f"\nLive: {H.PACKAGE['liveUrl']} · Repository: {H.PACKAGE['repo']} (GitHub Pages from `{H.PACKAGE['branch']}`) · Owner reviews and merges every pull request.\n",
         "\n## Start here\n\n"]
    o.append(numbered(["Read this file, then docs/handoff/HANDOFF.md (state, architecture, data contracts) and docs/handoff/IMPLEMENTATION_PLAN.md (tasks with ready prompts).",
                       "Take one task from docs/handoff/implementation-plan.json (`python3 tools/handoff/task.py` lists them; `python3 tools/handoff/task.py ID` prints one brief): one task, one branch, one pull request. Read the task's readFirst files before editing.",
                       "Run the checks below before and after the change and paste their summaries into the pull request. Never call work done, published or live without the checks.",
                       "If a rule below blocks the task, stop and ask the owner; do not work around it."]))
    o.append("\n## Rules\n\n" + table(["ID", "Rule", "Checked by"], [[i["id"], i["rule"], i["check"]] for i in H.INVARIANTS]))
    o.append("\n## Commands\n\n" + code([SERVER_START, SERVER_WAIT,
                                         "sh qa/run-unit-checks.sh                            # Node checks (tax engine, calculator, terrain, aggregates, map pick, house points, FABDEM) + figures --check",
                                         "node qa/compute-figures.cjs --out qa/expected-figures.json   # after any change to data/parcel-tax.json or tax-engine.js",
                                         "python3 qa/browser/run_matrix.py --base http://127.0.0.1:8768/ --out release-evidence/matrix.json --shots release-evidence/shots",
                                         "python3 qa/browser/run_a11y.py --base http://127.0.0.1:8768/ --out release-evidence/a11y.json",
                                         "python3 qa/browser/run_overflow.py --base http://127.0.0.1:8768/ --out release-evidence/overflow.json",
                                         "python3 tools/publication-audit.py --since origin/main      # personal data, credentials, forbidden keys, data checks",
                                         "python3 tools/gen-manifest.py --check                       # release pull requests only",
                                         "python3 tools/handoff/build_handoff.py --check",
                                         "python3 tools/verify-live.py --base-url https://montri-th.github.io/sila/ --output release-evidence/live.json   # after merge and Pages build"]))
    o.append("\nSet-up for the browser checks: `python3 -m pip install playwright==1.56.0`, `python3 -m playwright install chromium`, `npm install --prefix qa/browser axe-core@4.10.2`. release-evidence/ is git-ignored.\n")
    o.append("\n## Architecture\n\nStatic site, no build step. Each script is an IIFE that sets one window global; index.html loads them in order and app.js last. "
             "start() in app.js fetches catalog, metadata, tokens, summaries, scales and data/parcel-tax.json, prepares the tax model with SilaTaxEngine, reads the URL, then draws. "
             "Layers load their GeoJSON on demand through fetchJSON (adds ?v=DATA_VERSION). All view state lives in the URL.\n\n")
    o.append(table(["File", "Role"], [[f, r] for f, r in H.MODULE_ROLES.items()]))
    o.append("\nOther folders: data/ published data · reference/ contracts, design tokens, icon manifest · assets/ fonts, brand files, icons · vendor/ third-party libraries with licences · qa/ checks and receipts · tools/ release, audit, flood and handoff tools · docs/handoff/ this package.\n")
    o.append("\nTest hook: `window.SilaExplorer.getState()` (dataset, mission, scope, record, ready, camera ...), plus setDataset, setMission, selectScope, setTerrainMode, closeRecord.\n")
    o.append("\n## Recipes\n\n" + "".join(f"### {r['title']}\n\n" + numbered(r["steps"]) + "\n" for r in H.RECIPES))
    o.append("## Gotchas\n\n" + bullets(H.GOTCHAS))
    o.append("\n## Evidence words\n\nLabel claims in docs, pull requests and copy: " + ", ".join(e["label"] for e in H.EVIDENCE_LABELS) +
             ". Quote people as VERBATIM, PARTIAL or RECONSTRUCTED. Modelled is not observed; planned is not available; a prototype is not a final result.\n")
    o.append("\n## Team notes\n\n" + TEAM_BEGIN + "\n" + team_notes + TEAM_END + "\n")
    return "".join(o)


def existing_team_notes():
    p_ = path("AGENTS.md")
    if os.path.exists(p_):
        t = open(p_, encoding="utf-8").read()
        if TEAM_BEGIN in t and TEAM_END in t:
            return t.split(TEAM_BEGIN, 1)[1].split(TEAM_END, 1)[0].lstrip("\n")
    return "- (Short notes the team and agents should know. The builder keeps this block.)\n"


# ---------------------------------------------------------------- main
def build():
    facts = measure()
    miss = load_missions()
    fig = json.loads(read("qa/expected-figures.json"))
    receipts = latest_receipts()
    brief = product_brief_doc(miss, fig)
    plan = plan_doc()
    handoff = handoff_doc(facts, miss, fig, receipts)
    fdoc = facts_doc(facts, receipts)
    files = {
        f"{OUT}/product-brief.json": jtext(brief), f"{OUT}/PRODUCT_BRIEF.md": render_brief(brief),
        f"{OUT}/handoff.json": jtext(handoff), f"{OUT}/HANDOFF.md": render_handoff(handoff, plan),
        f"{OUT}/implementation-plan.json": jtext(plan), f"{OUT}/IMPLEMENTATION_PLAN.md": render_plan(plan),
        f"{OUT}/facts.json": jtext(fdoc), f"{OUT}/FACTS.md": render_facts(fdoc),
        f"{OUT}/SOURCES.md": render_sources(plan), f"{OUT}/CHANGELOG.md": render_changelog(),
        "AGENTS.md": render_agents(existing_team_notes()),
    }
    described = [("PRODUCT_BRIEF.md", "brief ระดับไซต์ (ไทย) + JSON"), ("product-brief.json", "brief สำหรับเครื่อง"), ("HANDOFF.md", "สถานะ สถาปัตยกรรม สัญญาข้อมูล การตรวจ release"),
                 ("handoff.json", "handoff สำหรับเครื่อง"), ("IMPLEMENTATION_PLAN.md", "แผนลงมือ งาน เกณฑ์ผ่าน คำตัดสิน พรอมป์"), ("implementation-plan.json", "แผนสำหรับเครื่อง"),
                 ("SOURCES.md", "ลำดับอำนาจและ SHA-256 ของสัญญา"), ("CHANGELOG.md", "บันทึกการเปลี่ยนแปลงของชุดนี้")]
    generated = [(n, w, hashlib.sha256(files[f"{OUT}/{n}"].encode("utf-8")).hexdigest()) for n, w in described]
    files[f"{OUT}/README.md"] = render_readme(generated)
    errors = validate(plan, facts, set(files)) + figures_current()
    for name, text in files.items():
        errors += lint(name, text)
    return files, errors


def check_embeds(files):
    errs = []
    for md, js in (("PRODUCT_BRIEF.md", "product-brief.json"), ("HANDOFF.md", "handoff.json"), ("IMPLEMENTATION_PLAN.md", "implementation-plan.json"), ("FACTS.md", "facts.json")):
        m = files[f"{OUT}/{md}"]
        inner = m.split(BEGIN + "\n```json\n", 1)[1].split("```\n" + END, 1)[0]
        if inner != files[f"{OUT}/{js}"]:
            errs.append(f"{md}: embedded JSON differs from {js}")
    return errs


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    files, errors = build()
    errors += check_embeds(files)
    if args.check:
        on_disk = {}
        for name in files:
            p_ = path(name)
            on_disk[name] = open(p_, encoding="utf-8").read() if os.path.exists(p_) else None
        for name, text in files.items():
            if on_disk[name] is None:
                errors.append(f"{name}: missing (run the builder)")
            elif name in VOLATILE:
                continue
            elif on_disk[name] != text:
                errors.append(f"{name}: differs from the builder output (edit tools/handoff/*_data.py and rebuild)")
        disk_files = {k: v for k, v in on_disk.items() if v is not None}
        if all(f"{OUT}/{x}" in disk_files for x in ("FACTS.md", "facts.json")):
            errors += [e + " (on disk)" for e in check_embeds({**files, **disk_files})]
        for e in errors:
            print("FAIL", e)
        print("handoff check:", "PASS" if not errors else f"FAIL ({len(errors)})")
        sys.exit(1 if errors else 0)
    if errors:
        for e in errors:
            print("FAIL", e)
        sys.exit("not written: fix the errors above")
    os.makedirs(path(OUT), exist_ok=True)
    for name, text in files.items():
        with open(path(name), "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    print("wrote", len(files), "files:", ", ".join(sorted(files)))


if __name__ == "__main__":
    main()
