#!/usr/bin/env python3
"""Build data/flood-sites.geojson from the owner's flood study (Markdown, v7 dated 17 Oct 2569).

The study is not in this repository; pass its path. Text is quoted from the study: the 16-site summary table
(section "16 จุด: เห็นสาเหตุและทางเลือกในหน้าเดียว") and the first appendix block of per-site sections
("## NN · name"), which hold the first action, options, reference coordinate, survey-route length, area note,
coordination note and source line. Village, election-district and municipality membership is added by
point-in-polygon against data/villages.geojson, data/election.geojson and data/municipality.geojson.

Usage (repository root):
    python3 tools/flood/build_flood_sites.py --study <path to the study .md> [--out data/flood-sites.geojson]

Coordinate status is not machine-readable in the study, so it is set here from the study's own coordinate table
(v7): sites 2, 5, 12 and 16 are representative of the area, site 4 was pinned by the coordinator, the other 11 were
matched approximately from the plan's figure, none is field-surveyed. Update STATUS and RADIUS_M when the study
changes. Publishing scenario extents (10-50 cm) is a separate owner decision; this script writes points only.
"""
import argparse
import json
import os
import re
import sys

from shapely.geometry import Point, shape

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

STATUS = {2: "representative", 5: "representative", 12: "representative", 16: "representative", 4: "coordinator"}
RADIUS_M = {2: 300, 5: 600, 12: 250, 16: 260}
TABLE_HEADING = "## 16 จุด: เห็นสาเหตุและทางเลือกในหน้าเดียว"
SOURCE = {"document": "คำแนะนำการป้องกันและแก้ปัญหาน้ำท่วม เทศบาลเมืองศิลา (CityChat study v7, 17 Oct 2569)",
          "coordinateStatus": {"approximate": "จับคู่ภาพเอกสารโดยประมาณ 11 จุด บอกบริเวณลงพื้นที่ ไม่ใช่จุดน้ำลึกสุดหรือปากท่อ",
                               "representative": "ตัวแทนบริเวณชื่อพื้นที่ 4 จุด (2, 5, 12, 16) ต้องให้เจ้าหน้าที่ชี้หมุดจริง",
                               "coordinator": "หมุดจากผู้ประสานงาน จุด 4", "surveyed": "รับรองจากรังวัดภาคสนาม 0 จุด"},
          "scenario": "ฉากหลัก 20 ซม. และห้าระดับ 10–50 ซม. บนข้อมูลระดับ 30 ม. เป็นภาพทดลอง ไม่ใช่ขอบน้ำท่วมที่วัดแล้ว"}


def summary_rows(lines):
    start = lines.index(TABLE_HEADING)
    rows = {}
    for ln in lines[start + 1:]:
        if ln.startswith("## "):
            break
        m = re.match(r"^\| (\d\d) (.+?) \| (.+?) \| (.+?) \| (.+?) \| (.+?) \|$", ln)
        if m:
            rows[int(m.group(1))] = {"name": m.group(2).strip(), "cause": m.group(3).strip(), "option1": m.group(4).strip(),
                                     "option2": m.group(5).strip(), "receiver": m.group(6).strip()}
    return rows


def site_sections(lines):
    """First block of '## NN · name' sections; a section ends at the next '## ' heading."""
    sections, i = {}, 0
    while i < len(lines):
        m = re.match(r"^## (\d\d) · (.+)$", lines[i])
        if m and int(m.group(1)) not in sections:
            sid, j = int(m.group(1)), i + 1
            while j < len(lines) and not lines[j].startswith("## "):
                j += 1
            sections[sid] = lines[i + 1:j]
            i = j
            if len(sections) == 16:
                break
        else:
            i += 1
    return sections


def feature(sid, row, sec):
    txt = [x.strip() for x in sec if x.strip() and not x.startswith("![") and not x.startswith("<a ")]
    first = ""
    for k, x in enumerate(txt):
        if x.startswith("สิ่งที่ควรทำก่อน"):
            first = txt[k + 1] if k + 1 < len(txt) else ""
            break
    options = []
    for x in txt:
        m = re.match(r"^\| (.+?) \| (.+?) \|$", x)
        if m and m.group(1) not in ("ทางเลือก", "---"):
            options.append({"option": m.group(1).strip(), "when": m.group(2).strip()})
    coord = route = None
    for x in txt:
        m = re.search(r"จุดอ้างอิง (\d+\.\d+), (\d+\.\d+)", x)
        if m:
            coord = (float(m.group(1)), float(m.group(2)))
        m2 = re.search(r"แนวสำรวจตามถนนประมาณ ([\d,]+) เมตร", x)
        if m2:
            route = int(m2.group(1).replace(",", ""))
    if not coord:
        sys.exit(f"site {sid}: no reference coordinate found")
    note = next((x for x in txt if x.startswith("ยังไม่แสดงพื้นที่น้ำ")), "")
    team = next((x for x in txt if x.startswith(("เลือก", "ทำร่วม", "ตรวจ", "ใช้"))), "")
    src = next((x for x in txt if x.startswith("ที่มา:")), "")
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [coord[1], coord[0]]}, "properties": {
        "id": f"floodsite-{sid:02d}", "datasetId": "floodsites", "site": sid, "label": f"{sid:02d} · {row['name']}", "name": row["name"],
        "coordStatus": STATUS.get(sid, "approximate"), "searchRadiusM": RADIUS_M.get(sid),
        "cause": row["cause"], "option1": row["option1"], "option2": row["option2"], "receiver": row["receiver"],
        "firstAction": first, "options": options, "surveyRouteM": route, "areaNote": note, "coordination": team,
        "sourceNote": src.replace("ที่มา: ", "")}}


def add_scope(features):
    """villageIds, electionIds and insideMunicipality by point-in-polygon against the published boundaries."""
    def load(name):
        with open(os.path.join(ROOT, "data", name), encoding="utf-8") as f:
            return [(ft["properties"]["id"], shape(ft["geometry"])) for ft in json.load(f)["features"]]
    villages, elections, town = load("villages.geojson"), load("election.geojson"), load("municipality.geojson")
    for ft in features:
        pt = Point(ft["geometry"]["coordinates"])
        p = ft["properties"]
        p["villageIds"] = [i for i, g in villages if g.covers(pt)]
        p["electionIds"] = [i for i, g in elections if g.covers(pt)]
        p["insideMunicipality"] = any(g.covers(pt) for _, g in town)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--study", required=True)
    ap.add_argument("--out", default="data/flood-sites.geojson")
    args = ap.parse_args()
    lines = open(args.study, encoding="utf-8").read().split("\n")
    rows, sections = summary_rows(lines), site_sections(lines)
    if len(rows) != 16 or len(sections) != 16:
        sys.exit(f"expected 16 table rows and 16 site sections, found {len(rows)} and {len(sections)}")
    features = [feature(s, rows[s], sections[s]) for s in range(1, 17)]
    add_scope(features)
    fc = {"type": "FeatureCollection", "name": "sila-flood-study-sites-v7", "features": features, "source": SOURCE}
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False, indent=1)
    for ft in fc["features"]:
        p = ft["properties"]
        print(p["site"], p["name"], p["coordStatus"], p["surveyRouteM"], len(p["options"]))


if __name__ == "__main__":
    main()
