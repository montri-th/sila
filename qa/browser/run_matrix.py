"""Browser matrix and user flows for the Sila officer site: 36 cases at fixed viewports (desktop 1440, tablet 1024,
phone 390, small phone 320) plus 8 user flows; revision 2.0 baseline.

Usage (repository root, preview running):
    python3 qa/browser/run_matrix.py --base http://127.0.0.1:8768/ --out qa/revision-X-browser-checks.json \
        [--shots <dir outside the repo>] [--only negotiate,phone] [--no-flows]

Every case opens with basemap=none (street tiles are external; terrain cases still load the external FABDEM tiles,
so their screenshots can differ between runs). Exit status 0 when every case reached ready, has no
page errors (uncaught errors, console errors, same-origin responses with status 400 or more), no horizontal overflow
and no legend over the map, and every flow passes; 1 otherwise. --only and --no-flows skip the flows. Screenshots are
written only when --shots is given; keep them out of git (a folder outside the repository, or the git-ignored
release-evidence/).
"""
import argparse
import asyncio
import datetime
import json
import sys
from urllib.parse import urlsplit

from playwright.async_api import async_playwright

from common import (DESKTOP as D, TABLET as T, PHONE as M, SMALL_PHONE as S, GL_ARGS, TRUE_OVERFLOW,
                    base_url, fill, load_fixtures, new_page, selected, wait_ready, write_json)

CASES = [
    ("landing-dark-th", "?basemap=none", D),
    ("negotiate-light-en", "?dataset=negotiate&mission=tax&basemap=none&theme=light&lang=en", D),
    ("negotiate-init-mixeduse", "?dataset=negotiate&mission=tax&basemap=none&init=mixedUse", D),
    ("negotiate-v12", "?dataset=negotiate&mission=tax&basemap=none&scope=v12", D),
    ("agriwatch", "?dataset=agriwatch&mission=tax&basemap=none", D),
    ("agriwatch-light-en", "?dataset=agriwatch&mission=tax&basemap=none&theme=light&lang=en", D),
    ("portfolio", "?dataset=portfolio&mission=tax&basemap=none", D),
    ("portfolio-owner", "?dataset=portfolio&mission=tax&basemap=none&owner={ownerCode}", D),
    ("taxmap-light-en", "?dataset=taxmap&mission=tax&basemap=none&theme=light&lang=en", D),
    ("taxmap-new70-adj10", "?dataset=taxmap&mission=tax&basemap=none&scenario=new70&adj=10", D),
    ("properties-gain", "?dataset=properties&mission=tax&basemap=none", D),
    ("appraisal-light", "?dataset=appraisal&mission=tax&basemap=none&theme=light", D),
    ("businesses", "?dataset=businesses&mission=tax&basemap=none", D),
    ("buildings-roll-v12", "?dataset=buildings&mission=tax&basemap=none&view=roll&scope=v12", D),
    ("houses-en", "?dataset=houses&mission=tax&basemap=none&lang=en&scope=v12", D),
    ("floodsites", "?dataset=floodsites&mission=flood&basemap=none", D),
    ("floodsites-record-en-light", "?dataset=floodsites&mission=flood&basemap=none&lang=en&theme=light&record={floodRecord}", D),
    ("terrain-2d-light", "?dataset=terrain&mission=flood&mode=2d&theme=light&basemap=none", D),
    ("terrain-3d-dark", "?dataset=terrain&mission=flood&mode=3d&basemap=none", D),
    ("popgrid", "?dataset=popgrid&mission=care&basemap=none", D),
    ("caregroups", "?dataset=caregroups&mission=care&basemap=none", D),
    ("animals-light", "?dataset=animals&mission=care&basemap=none&theme=light", D),
    ("roads", "?dataset=roads&mission=works&basemap=none", D),
    ("overview", "?dataset=overview&mission=area&basemap=none", D),
    ("tablet-negotiate", "?dataset=negotiate&mission=tax&basemap=none", T),
    ("tablet-portfolio-owner", "?dataset=portfolio&mission=tax&basemap=none&owner={ownerCode}", T),
    ("phone-landing", "?basemap=none", M),
    ("phone-negotiate-record", "?dataset=negotiate&mission=tax&basemap=none&record={negotiateRecord}", M),
    ("phone-portfolio-owner", "?dataset=portfolio&mission=tax&basemap=none&owner={ownerCode}", M),
    ("phone-agriwatch-light", "?dataset=agriwatch&mission=tax&basemap=none&theme=light", M),
    ("phone-floodsites", "?dataset=floodsites&mission=flood&basemap=none", M),
    ("phone-terrain-3d", "?dataset=terrain&mission=flood&mode=3d&basemap=none", M),
    ("phone-animals", "?dataset=animals&mission=care&basemap=none", M),
    ("phone-businesses-en", "?dataset=businesses&mission=tax&basemap=none&lang=en", M),
    ("small-phone-negotiate-light", "?dataset=negotiate&mission=tax&basemap=none&theme=light", S),
    ("small-phone-caregroups-en", "?dataset=caregroups&mission=care&basemap=none&lang=en", S),
]

PROBE = """() => ({legend: !!document.getElementById('map-legend')?.innerText.trim(),
  ready: (() => { try { return window.SilaExplorer?.getState?.()?.ready ?? null } catch (e) { return null } })(),
  gl: !!document.querySelector('.maplibregl-canvas'), t3: document.getElementById('map')?.dataset.terrain3dState || null,
  ex: document.getElementById('terrain-3d')?.dataset.exaggeration || null, bearing: document.getElementById('terrain-3d')?.dataset.bearing || null,
  legendOnMap: (() => { const l = document.getElementById('map-legend'), m = document.getElementById('map'); if (!l || !m) return null;
    const a = l.getBoundingClientRect(), bb = m.getBoundingClientRect();
    return a.width > 0 && a.left < bb.right && a.right > bb.left && a.top < bb.bottom && a.bottom > bb.top && !document.getElementById('inspector').contains(l); })(),
  mapShare: (() => { const m = document.getElementById('map').getBoundingClientRect(), i = document.getElementById('inspector').getBoundingClientRect();
    const sheet = getComputedStyle(document.getElementById('inspector')).position === 'absolute'; const visible = sheet ? Math.max(0, i.top - m.top) : m.height;
    return +(visible * m.width / (window.innerWidth * (window.innerHeight - 56))).toFixed(2); })(),
  sheet: document.body.dataset.sheet || null,
  charts: [...document.querySelectorAll('[data-chart-id]')].map(e => ({id: e.dataset.chartId, canvas: !!e.querySelector('canvas'), h: Math.round(e.getBoundingClientRect().height)})),
  summary: [...document.querySelectorAll('#summary-metrics > div')].map(d => d.innerText.replace(/\\n/g, ' ')),
  popup: (() => { const p = document.querySelector('.leaflet-popup'); if (!p) return null; const r = p.getBoundingClientRect(), m = document.getElementById('map').getBoundingClientRect();
    return {w: Math.round(r.width), h: Math.round(r.height), mapShare: +(r.width * r.height / (m.width * m.height)).toFixed(2)} })(),
  smallTargets: [...document.querySelectorAll('button, select, input[type=range], input[type=checkbox], a.mini-action, a.popup-link')]
    .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 24; }).length})"""


async def run_cases(browser, base, fx, only, shots, out, origin):
    for name, url, vp in CASES:
        if not selected(name, only):
            continue
        ctx, pg, errs = await new_page(browser, vp, origin=origin)
        await pg.goto(base + fill(url, fx), wait_until="domcontentloaded")
        await wait_ready(pg, "terrain-3d" in name)
        r = await pg.evaluate(PROBE)
        over = await pg.evaluate(TRUE_OVERFLOW)
        if shots:
            await pg.screenshot(path=f"{shots}/{name}.png")
        out["matrix"].append({"case": name, "viewport": f"{vp['width']}x{vp['height']}", "pageErrors": errs[:5], "horizontalOverflowPx": over,
                              "legendShown": r["legend"], "legendOverMap": r["legendOnMap"], "mapShareOfViewport": r["mapShare"], "sheet": r["sheet"],
                              "ready": r["ready"], "charts": r["charts"], "summaryMetrics": r["summary"], "popup": r["popup"], "smallTargets": r["smallTargets"],
                              "terrain3D": {"state": r["t3"], "webglCanvas": r["gl"], "exaggeration": r["ex"], "bearing": r["bearing"]} if "terrain-3d" in name else None})
        print(name, errs[:2], over, r["mapShare"], flush=True)
        await ctx.close()


async def csv_download(pg, selector):
    try:
        async with pg.expect_download(timeout=15000) as dl:
            await pg.locator(selector).first.click()
        d = await dl.value
        return (d.suggested_filename or "").endswith(".csv")
    except Exception as e:  # report, do not hide
        return "no-download: " + str(e)[:80]


async def run_flows(browser, base, fx, out, origin):
    exp = fx["expect"]
    # 1 Negotiation plan: initiative focus, list, record card, CSV, summary follows the initiative
    ctx, pg, errs = await new_page(browser, D, downloads=True, origin=origin)
    await pg.goto(base + "?dataset=negotiate&mission=tax&basemap=none", wait_until="domcontentloaded"); await wait_ready(pg)
    s0 = await pg.evaluate("() => document.getElementById('summary-metrics').innerText")
    await pg.click('.init-row[data-initiative="mixedUse"]'); await pg.wait_for_timeout(1500)
    s1 = await pg.evaluate("() => ({summary: document.getElementById('summary-metrics').innerText, focus: !!document.querySelector('.focus-card'), url: location.search})")
    await pg.click('[data-show-list="initiative"]'); await pg.wait_for_timeout(1200)
    rows = await pg.locator(".area-row").count()
    first = (await pg.locator(".area-row").first.inner_text())[:140] if rows else ""
    await pg.locator(".area-row").first.click(); await pg.wait_for_timeout(2000)
    card = await pg.evaluate("() => document.querySelector('#record-detail')?.innerText || ''")
    links = await pg.evaluate("() => [...document.querySelectorAll('#record-detail a[target=_blank]')].map(a => a.href)")
    try:
        await pg.click("[data-close-record]"); await pg.wait_for_timeout(500)
    except Exception:
        pass
    csv_ok = await csv_download(pg, "#tab-content [data-export]")
    out["flows"]["negotiationPlan"] = {
        "cityGainShown": bool(exp.get("cityGainMillions")) and exp["cityGainMillions"] in s0,
        "initiativeSummary": bool(exp.get("mixedUseThousands")) and exp["mixedUseThousands"] in s1["summary"] and "แยกชั้นค้าขาย" in s1["summary"],
        "focusCard": s1["focus"], "urlCarriesInit": "init=mixedUse" in s1["url"], "listRows": rows, "firstRow": first,
        "cardLeadsWithGain": "เก็บเพิ่มได้ต่อปี" in card[:400], "cardHasRollTitle": "โฉนดของแปลงนี้" in card,
        "pinLinkFirst": bool(links) and "google.com/maps/search" in links[0], "panoLinkSecond": len(links) > 1 and "map_action=pano" in links[1],
        "csvDownload": csv_ok, "pageErrors": errs[:5]}
    await ctx.close()
    # 2 Owners: a top-10 row opens the owner card and outlines the parcels; owner CSV; back to the list
    ctx, pg, errs = await new_page(browser, D, downloads=True, origin=origin)
    await pg.goto(base + "?dataset=portfolio&mission=tax&basemap=none", wait_until="domcontentloaded"); await wait_ready(pg)
    top = await pg.locator(".area-list [data-owner]").count()
    await pg.locator(".area-list [data-owner]").first.click(); await pg.wait_for_timeout(2500)
    oc = await pg.evaluate("""() => ({url: location.search, card: document.querySelector('.owner-card')?.innerText.slice(0, 300) || '',
      highlight: !!document.querySelector('.leaflet-selected-pane path, .leaflet-selected-pane canvas'),
      names: /[ก-๙]{2,}\\s(จำกัด|บริษัท)/.test(document.querySelector('.owner-card')?.innerText || '')})""")
    csv_ok = await csv_download(pg, "#tab-content [data-export]")
    await pg.click('.owner-card [data-owner=""]'); await pg.wait_for_timeout(1200)
    back = await pg.evaluate("() => ({url: location.search, list: !!document.querySelector('.area-list [data-owner]')})")
    out["flows"]["ownerPortfolio"] = {"topRows": top, "urlCarriesOwner": "owner=T-" in oc["url"], "cardOpens": "รหัส T-" in oc["card"],
                                      "parcelsOutlined": oc["highlight"], "noOwnerNames": not oc["names"], "csvDownload": csv_ok,
                                      "backToList": "owner=" not in back["url"] and back["list"], "pageErrors": errs[:5]}
    await ctx.close()
    # 3 Farmland watch: list and record
    ctx, pg, errs = await new_page(browser, D, origin=origin)
    await pg.goto(base + "?dataset=agriwatch&mission=tax&basemap=none", wait_until="domcontentloaded"); await wait_ready(pg)
    await pg.click('[data-show-list="agri"]'); await pg.wait_for_timeout(1200)
    n = await pg.locator(".area-row").count()
    first = (await pg.locator(".area-row").first.inner_text())[:140] if n else ""
    await pg.locator(".area-row").first.click(); await pg.wait_for_timeout(2000)
    card = await pg.evaluate("() => document.querySelector('#record-detail')?.innerText || ''")
    out["flows"]["farmlandWatch"] = {"listRows": n, "firstRow": first, "cardLeadsWithIfVacant": "ถ้าพบว่าไม่ได้ทำประโยชน์" in card[:300], "pageErrors": errs[:5]}
    await ctx.close()
    # 4 Flood sites: study content in the card, site numbers only when zoomed in
    ctx, pg, errs = await new_page(browser, D, origin=origin)
    await pg.goto(base + "?dataset=floodsites&mission=flood&basemap=none", wait_until="domcontentloaded"); await wait_ready(pg)
    nums0 = await pg.evaluate("() => document.querySelectorAll('.site-number').length")
    await pg.click("#tab-list"); await pg.wait_for_timeout(800); await pg.locator(".area-row").nth(10).click(); await pg.wait_for_timeout(1500)
    await pg.locator("[data-focus-record]").first.click(); await pg.wait_for_timeout(1500)
    nums = await pg.evaluate("() => document.querySelectorAll('.site-number').length")
    zoom = await pg.evaluate("() => Number(document.getElementById('map').dataset.zoom)")
    card = await pg.evaluate("() => document.querySelector('#record-detail')?.innerText || ''")
    out["flows"]["floodSites"] = {"siteNumbersHiddenAtCityZoom": nums0 == 0, "siteNumbersWhenZoomedIn": nums == 16 and zoom >= 14,
                                  "cardHasCause": "สาเหตุตามข้อมูลเดิม" in card, "cardHasFirstAction": "สิ่งที่ควรทำก่อน" in card,
                                  "cardHasStatus": "สถานะพิกัด" in card, "cardHasRoute": "แนวสำรวจตามถนน" in card, "pageErrors": errs[:5]}
    await ctx.close()
    # 5 Phone sheet: peek/half/full, map controls above the sheet, a list record lifts the sheet
    ctx, pg, errs = await new_page(browser, M, origin=origin)
    await pg.goto(base + "?dataset=negotiate&mission=tax&basemap=none", wait_until="domcontentloaded"); await wait_ready(pg)
    state = "() => ({sheet: document.body.dataset.sheet, h: Math.round(document.getElementById('inspector').getBoundingClientRect().height)})"
    a = await pg.evaluate(state)
    ctrl = await pg.evaluate("""() => { const i = document.getElementById('inspector').getBoundingClientRect();
      return [...document.querySelectorAll('.leaflet-control-zoom a, .map-control')].every(e => e.getBoundingClientRect().bottom <= i.top); }""")
    cycle = []
    for _ in range(3):
        await pg.locator("#sheet-handle").tap(); await pg.wait_for_timeout(500); cycle.append(await pg.evaluate(state))
    await pg.click('[data-tab="list"]'); await pg.wait_for_timeout(800); await pg.locator(".area-row").first.click(); await pg.wait_for_timeout(1500)
    e = await pg.evaluate(state)
    recd = await pg.evaluate("() => ({card: !!document.querySelector('.record-card'), popup: !!document.querySelector('.leaflet-popup')})")
    out["flows"]["phoneSheet"] = {"startsPeek": a["sheet"] == "peek", "mapControlsAboveSheet": ctrl, "cycles": [c["sheet"] for c in cycle] == ["half", "full", "peek"],
                                  "heightsGrow": a["h"] < cycle[0]["h"] < cycle[1]["h"], "listRecordLiftsToHalf": e["sheet"] == "half" and recd["card"],
                                  "popupOpen": recd["popup"], "pageErrors": errs[:5]}
    await ctx.close()
    # 6 Care mission: pets and the care register are separate maps
    ctx, pg, errs = await new_page(browser, D, origin=origin)
    await pg.goto(base + "?dataset=animals&mission=care&basemap=none", wait_until="domcontentloaded"); await wait_ready(pg)
    opts = await pg.evaluate("() => [...document.getElementById('layer-select').options].map(o => o.textContent)")
    pets = await pg.evaluate("() => document.getElementById('tab-content').innerText")
    out["flows"]["petsSeparate"] = {"petsOption": any("สัตว์เลี้ยง" in o for o in opts), "careOption": any("กลุ่มเปราะบาง" in o for o in opts),
                                    "petsPanelHasNoCareGroups": "กลุ่มเปราะบาง" not in pets, "dogsCats": "สุนัข" in pets and "แมว" in pets, "pageErrors": errs[:5]}
    await ctx.close()
    # 7 Keyboard: mission tabs and explanation details keep a visible focus
    ctx, pg, errs = await new_page(browser, D, origin=origin)
    await pg.goto(base + "?dataset=negotiate&mission=tax&basemap=none", wait_until="domcontentloaded"); await wait_ready(pg)
    await pg.locator('[data-mission="flood"]').focus(); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(2500)
    f1 = await pg.evaluate("""() => { const e = document.activeElement; const s = getComputedStyle(e);
      return {mission: e?.dataset?.mission || null, selected: e?.getAttribute('aria-selected'), outline: s.outlineStyle + ' ' + s.outlineWidth} }""")
    await pg.goto(base + "?dataset=negotiate&mission=tax&basemap=none", wait_until="domcontentloaded"); await wait_ready(pg)
    await pg.locator(".explain > summary").first.focus(); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(300)
    f2 = await pg.evaluate("""() => { const e = document.activeElement; const s = getComputedStyle(e);
      return {isSummary: e?.tagName === 'SUMMARY', open: e?.parentElement?.open, outline: s.outlineStyle + ' ' + s.outlineWidth} }""")
    out["flows"]["keyboard"] = {"missionTabFocusKept": f1["mission"] == "flood" and f1["selected"] == "true", "missionFocusOutline": f1["outline"],
                                "explainOpensByKeyboard": f2["isSummary"] and bool(f2["open"]), "explainFocusOutline": f2["outline"], "pageErrors": errs[:5]}
    await ctx.close()
    # 8 3D terrain: north up, default exaggeration 2
    ctx, pg, errs = await new_page(browser, D, origin=origin)
    await pg.goto(base + "?dataset=terrain&mission=flood&mode=3d&basemap=none", wait_until="domcontentloaded"); await wait_ready(pg, True)
    d0 = await pg.evaluate("() => ({...document.getElementById('terrain-3d').dataset})")
    out["flows"]["terrain3D"] = {"defaultExaggeration2": d0.get("exaggeration") == "2", "bearing0": d0.get("bearing") in ("0", "-0", None),
                                 "state": d0.get("terrain3dState") or None, "pageErrors": errs[:5]}
    await ctx.close()


async def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", required=True, help="site root, e.g. http://127.0.0.1:8768/")
    ap.add_argument("--out", required=True, help="receipt JSON path")
    ap.add_argument("--shots", help="directory for screenshots (keep out of git: outside the repository or under release-evidence/)")
    ap.add_argument("--only", default="", help="comma-separated substrings of case names")
    ap.add_argument("--no-flows", action="store_true")
    args = ap.parse_args()
    base, fx = base_url(args.base), load_fixtures()
    origin = urlsplit(base).netloc
    only = [x for x in args.only.split(",") if x]
    out = {"schema": "sila-browser-checks/2.0", "checkedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "base": base,
           "browser": None, "webgl": "Chromium SwiftShader (software WebGL); real-GPU rendering is checked separately on the live site",
           "basemap": "none (data only; external street tiles are not part of this check)", "fixtures": fx["records"], "matrix": [], "flows": {}}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=GL_ARGS)
        out["browser"] = "Chromium " + b.version
        await run_cases(b, base, fx, only, args.shots, out, origin)
        if not args.no_flows and not only:
            await run_flows(b, base, fx, out, origin)
        await b.close()
    soft = ("pageErrors", "listRows", "firstRow", "topRows", "missionFocusOutline", "explainFocusOutline", "state", "popupOpen")
    phone = [c["mapShareOfViewport"] for c in out["matrix"] if c["viewport"].startswith(("390", "320"))]
    out["summary"] = {"cases": len(out["matrix"]), "notReadyCases": sum(1 for c in out["matrix"] if c["ready"] is not True),
                      "pageErrors": sum(len(c["pageErrors"]) for c in out["matrix"]),
                      "horizontalOverflowCases": sum(1 for c in out["matrix"] if c["horizontalOverflowPx"] > 0),
                      "legendOverMapCases": sum(1 for c in out["matrix"] if c["legendOverMap"]),
                      "phoneMapShareMin": min(phone) if phone else None,
                      "flowsPassed": {k: all((v is True) for kk, v in f.items() if kk not in soft) and not f["pageErrors"] for k, f in out["flows"].items()}}
    out["notCovered"] = ["real GPU rendering", "screen readers", "real phones", "street basemap tiles"]
    out["smallTargetsNote"] = "Controls counted in smallTargets are 18 px checkboxes inside their own label; the label (at least 44 px tall, full panel width) is the click and tap target."
    write_json(args.out, out)
    s = out["summary"]
    ok = (s["cases"] > 0 and s["notReadyCases"] == 0 and s["pageErrors"] == 0 and s["horizontalOverflowCases"] == 0
          and s["legendOverMapCases"] == 0 and all(s["flowsPassed"].values()))
    print(json.dumps(s, ensure_ascii=False))
    print("PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    asyncio.run(main())
