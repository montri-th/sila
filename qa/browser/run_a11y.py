"""Accessibility check with axe-core on 34 views and states of the Sila officer site.

Usage (repository root, preview running):
    npm install --prefix qa/browser axe-core@4.10.2      # once; node_modules stays out of git
    python3 qa/browser/run_a11y.py --base http://127.0.0.1:8768/ --out qa/revision-X-accessibility-checks.json [--only phone]

The axe file is taken from --axe, then $AXE_PATH, then qa/browser/node_modules/axe-core/axe.min.js.
Exit status 0 when every view reached ready and no view has a violation (a page that never starts has
little to check, so it fails). Contrast of text on map tiles, screen readers and 200% zoom are manual.
"""
import argparse
import asyncio
import datetime
import json
import os
import sys

from playwright.async_api import async_playwright

from common import DESKTOP as D, PHONE as M, GL_ARGS, HERE, READY, base_url, die, fill, load_fixtures, selected, write_json

VIEWS = [
    ("negotiate-dark-th", "?dataset=negotiate&mission=tax&basemap=none", D, None),
    ("negotiate-light-en", "?dataset=negotiate&mission=tax&basemap=none&theme=light&lang=en", D, None),
    ("negotiate-init-list", "?dataset=negotiate&mission=tax&basemap=none&init=mixedUse", D, "list"),
    ("negotiate-record", "?dataset=negotiate&mission=tax&basemap=none&record={negotiateRecord}", D, None),
    ("negotiate-explain-open", "?dataset=negotiate&mission=tax&basemap=none", D, "explain"),
    ("agriwatch-light", "?dataset=agriwatch&mission=tax&basemap=none&theme=light", D, None),
    ("agriwatch-list-en", "?dataset=agriwatch&mission=tax&basemap=none&lang=en", D, "list"),
    ("portfolio-dark", "?dataset=portfolio&mission=tax&basemap=none", D, None),
    ("portfolio-owner-light-en", "?dataset=portfolio&mission=tax&basemap=none&owner={ownerCode}&theme=light&lang=en", D, None),
    ("portfolio-list", "?dataset=portfolio&mission=tax&basemap=none", D, "list"),
    ("taxmap-dark-th", "?dataset=taxmap&mission=tax&basemap=none", D, None),
    ("taxmap-record-calc", "?dataset=taxmap&mission=tax&basemap=none&record={taxmapRecord}", D, "calc"),
    ("taxmap-colour-table-open", "?dataset=taxmap&mission=tax&basemap=none&scenario=new70&adj=10&badj=10", D, "luttable"),
    ("properties-list-light-en", "?dataset=properties&mission=tax&basemap=none&theme=light&lang=en", D, "list"),
    ("properties-card", "?dataset=properties&mission=tax&basemap=none", D, "pcard"),
    ("businesses-card-en", "?dataset=businesses&mission=tax&basemap=none&lang=en", D, "bcard"),
    ("buildings-tax-card", "?dataset=buildings&mission=tax&basemap=none&view=tax&scope=v15&record={buildingTaxRecord}", D, None),
    ("houses-sources-en", "?dataset=houses&mission=tax&basemap=none&scope=v12&lang=en", D, "source"),
    ("floodsites-dark", "?dataset=floodsites&mission=flood&basemap=none", D, None),
    ("floodsites-record-light-en", "?dataset=floodsites&mission=flood&basemap=none&record={floodRecord}&theme=light&lang=en", D, None),
    ("terrain-2d-light-en", "?dataset=terrain&mission=flood&mode=2d&basemap=none&theme=light&lang=en", D, None),
    ("terrain-3d-dark", "?dataset=terrain&mission=flood&mode=3d&basemap=none", D, None),
    ("popgrid-light", "?dataset=popgrid&mission=care&basemap=none&theme=light", D, None),
    ("caregroups-definitions", "?dataset=caregroups&mission=care&basemap=none", D, None),
    ("animals-en", "?dataset=animals&mission=care&basemap=none&lang=en", D, None),
    ("roads", "?dataset=roads&mission=works&basemap=none", D, None),
    ("overview-en", "?dataset=overview&mission=area&basemap=none&lang=en", D, None),
    ("map-settings-open", "?dataset=negotiate&mission=tax&basemap=none", D, "settings"),
    ("phone-negotiate-peek", "?dataset=negotiate&mission=tax&basemap=none", M, None),
    ("phone-negotiate-full", "?dataset=negotiate&mission=tax&basemap=none", M, "sheetfull"),
    ("phone-record", "?dataset=negotiate&mission=tax&basemap=none&record={negotiateRecord}", M, None),
    ("phone-portfolio-owner", "?dataset=portfolio&mission=tax&basemap=none&owner={ownerCode}", M, None),
    ("phone-floodsites-light", "?dataset=floodsites&mission=flood&basemap=none&theme=light", M, None),
    ("phone-animals", "?dataset=animals&mission=care&basemap=none", M, None),
]


async def act(pg, action):
    if action == "calc":
        await pg.locator('#record-detail [data-tool="tax-calculator"]').first.click(); await pg.wait_for_timeout(1200)
    elif action == "list":
        await pg.click("#tab-list"); await pg.wait_for_timeout(1200)
    elif action == "luttable":
        await pg.locator(".lut-table > summary").first.click(); await pg.wait_for_timeout(600)
    elif action == "explain":
        await pg.locator(".explain > summary").first.click(); await pg.wait_for_timeout(600)
    elif action == "settings":
        await pg.locator("#map-settings > summary").first.click(); await pg.wait_for_timeout(600)
    elif action == "sheetfull":
        await pg.locator("#sheet-handle").tap(); await pg.wait_for_timeout(400)
        await pg.locator("#sheet-handle").tap(); await pg.wait_for_timeout(600)
    elif action == "source":
        await pg.locator('[data-tab="source"]').first.click(); await pg.wait_for_timeout(1200)
    elif action in ("pcard", "bcard"):
        await pg.click("#tab-list"); await pg.wait_for_timeout(1200)
        await pg.locator("[data-property]" if action == "pcard" else "[data-record]").first.click(); await pg.wait_for_timeout(2000)


async def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--axe", default=os.environ.get("AXE_PATH") or os.path.join(HERE, "node_modules", "axe-core", "axe.min.js"))
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    if not os.path.exists(args.axe):
        die(f"axe-core not found at {args.axe}. Run: npm install --prefix qa/browser axe-core@4.10.2  (or set AXE_PATH)")
    axe = open(args.axe, encoding="utf-8").read()
    base, fx = base_url(args.base), load_fixtures()
    only = [x for x in args.only.split(",") if x]
    out = {"schema": "sila-accessibility-checks/2.0", "checkedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "base": base,
           "tool": None, "rules": "axe-core default rule set (WCAG 2.0/2.1 A and AA plus best practices)", "views": [],
           "notCovered": ["screen readers on real devices", "real phones", "zoom to 200% on desktop browsers", "text contrast over map tiles (manual)"]}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=GL_ARGS)
        out["browser"] = "Chromium " + b.version
        for name, url, vp, action in VIEWS:
            if not selected(name, only):
                continue
            ctx = await b.new_context(viewport=vp, is_mobile=vp["width"] < 600, has_touch=vp["width"] < 600)
            pg = await ctx.new_page()
            await pg.goto(base + fill(url, fx), wait_until="domcontentloaded")
            await pg.wait_for_timeout(16000 if ("terrain-3d" in name or "buildings-tax" in name) else 10000)
            ready = await pg.evaluate(READY)
            await act(pg, action)
            await pg.add_script_tag(content=axe)
            r = await pg.evaluate("""async () => { const r = await axe.run(document, {resultTypes: ['violations']});
              return {version: axe.version, passes: r.passes.length, violations: r.violations.map(v => ({id: v.id, impact: v.impact, nodes: v.nodes.length}))}; }""")
            out["tool"] = "axe-core " + r["version"]
            out["views"].append({"view": name, "viewport": f"{vp['width']}x{vp['height']}", "ready": ready, "rulesPassed": r["passes"], "violations": r["violations"]})
            print(name, r["passes"], r["violations"], flush=True)
            await ctx.close()
        await b.close()
    out["summary"] = {"views": len(out["views"]), "notReadyViews": sum(1 for v in out["views"] if v["ready"] is not True),
                      "violations": sum(len(v["violations"]) for v in out["views"])}
    write_json(args.out, out)
    s = out["summary"]
    print(json.dumps(s))
    sys.exit(0 if s["views"] > 0 and s["notReadyViews"] == 0 and s["violations"] == 0 else 1)


if __name__ == "__main__":
    asyncio.run(main())
