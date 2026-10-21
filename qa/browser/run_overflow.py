"""Phone overflow check: 14 states x Thai and English x 320/360/390/412 px (112 runs, revision 2.0 bottom sheet).

For each run: true overflow with the CSS safety net disabled (document scrollWidth - clientWidth and the widest
offending elements outside scroll regions), the same with the net, and a real touch swipe (window scroll and the
visual viewport must stay at 0).

Usage (repository root, preview running):
    python3 qa/browser/run_overflow.py --base http://127.0.0.1:8768/ --out <file> [--only negotiate,taxmap-card]
Exit status 0 when no run overflows, scrolls sideways or fails to open.
"""
import argparse
import asyncio
import datetime
import json
import sys

from playwright.async_api import async_playwright

from common import GL_ARGS, READY, base_url, fill, load_fixtures, selected, write_json

STATES = [
    ("negotiate", "?dataset=negotiate&mission=tax&basemap=none", None),
    ("negotiate-list", "?dataset=negotiate&mission=tax&basemap=none&init=mixedUse", "list"),
    ("negotiate-card", "?dataset=negotiate&mission=tax&basemap=none", "card"),
    ("agriwatch", "?dataset=agriwatch&mission=tax&basemap=none", None),
    ("portfolio-owner", "?dataset=portfolio&mission=tax&basemap=none&owner={ownerCode}", None),
    ("taxmap", "?dataset=taxmap&mission=tax&basemap=none", None),
    ("taxmap-card", "?dataset=taxmap&mission=tax&basemap=none&record={taxmapRecord}", None),
    ("properties-card", "?dataset=properties&mission=tax&basemap=none", "pcard"),
    ("businesses-card", "?dataset=businesses&mission=tax&basemap=none", "bcard"),
    ("floodsites-card", "?dataset=floodsites&mission=flood&basemap=none&record={floodRecord}", None),
    ("terrain-2d", "?dataset=terrain&mission=flood&mode=2d&basemap=none", None),
    ("caregroups", "?dataset=caregroups&mission=care&basemap=none", None),
    ("animals", "?dataset=animals&mission=care&basemap=none", None),
    ("popgrid-list", "?dataset=popgrid&mission=care&basemap=none", "list"),
]
WIDTHS = (320, 360, 390, 412)

PROBE = r"""() => {
  const de = document.documentElement, W = de.clientWidth, out = [];
  const path = (el) => { const p = []; let n = el; while (n && n.nodeType === 1 && p.length < 5) { let s = n.tagName.toLowerCase();
    if (n.id) { p.unshift(s + '#' + n.id); break; } const c = [...n.classList].slice(0, 2); if (c.length) s += '.' + c.join('.'); p.unshift(s); n = n.parentElement; } return p.join(' > '); };
  const clipped = (el) => { for (let n = el.parentElement; n && n !== de && n !== document.body; n = n.parentElement) { const s = getComputedStyle(n);
    if (s.overflowX !== 'visible') return true; if (n.classList.contains('leaflet-container') || n.classList.contains('maplibregl-map')) return true; } return false; };
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.position === 'fixed') continue;
    if (el.closest('details:not([open]) > :not(summary)')) continue;
    const r = el.getBoundingClientRect(); if (!r.width || r.right <= W + 0.5) continue;
    if (clipped(el)) continue;
    out.push({ sel: path(el), right: Math.round(r.right), w: Math.round(r.width) });
  }
  out.sort((a, b) => b.right - a.right);
  return { W, doc: de.scrollWidth - de.clientWidth, over: out.slice(0, 4), regions: [...document.querySelectorAll('.table-scroll[data-scrollable="true"]')].length };
}"""


async def one(browser, base, url, action, lang, w):
    ctx = await browser.new_context(viewport={"width": w, "height": 780}, is_mobile=True, has_touch=True, device_scale_factor=2)
    pg = await ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    try:
        await pg.goto(base + url + f"&lang={lang}", wait_until="domcontentloaded")
        await pg.wait_for_function(READY, timeout=45000)
        await pg.wait_for_timeout(1500)
        if action in ("list", "card", "pcard", "bcard"):
            await pg.locator("#tab-list").scroll_into_view_if_needed(); await pg.locator("#tab-list").tap(); await pg.wait_for_timeout(900)
        if action == "card":
            await pg.locator(".area-row").first.tap(); await pg.wait_for_timeout(1500)
        if action == "pcard":
            await pg.locator("[data-property]").first.tap(); await pg.wait_for_timeout(1500)
        if action == "bcard":
            await pg.locator("[data-record]").first.tap(); await pg.wait_for_timeout(1500)
        await pg.add_style_tag(content="html,body{overflow-x:visible!important}"); await pg.wait_for_timeout(300)
        raw = await pg.evaluate(PROBE)
        await pg.evaluate("() => document.querySelectorAll('style').forEach(s => { if (s.textContent.includes('overflow-x:visible!important')) s.remove(); })")
        await pg.wait_for_timeout(300)
        net = await pg.evaluate(PROBE)
        cdp = await ctx.new_cdp_session(pg)
        x0, y0 = w - 30, 60
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y0, "id": 1}]})
        for i in range(1, 13):
            await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x0 - 22 * i, "y": y0, "id": 1}]})
            await asyncio.sleep(0.016)
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        await pg.wait_for_timeout(600)
        sw = await pg.evaluate("() => ({scrollX: window.scrollX, vv: window.visualViewport ? Math.round(window.visualViewport.offsetLeft) : null})")
        return {"rawDoc": raw["doc"], "rawOver": raw["over"][:2], "netDoc": net["doc"], "swipe": sw, "regions": net["regions"], "errors": errs[:2]}
    except Exception as e:  # report the failure as a bad run
        return {"error": str(e)[:160]}
    finally:
        await ctx.close()


async def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    base, fx = base_url(args.base), load_fixtures()
    only = [x for x in args.only.split(",") if x]
    res = []
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    async with async_playwright() as p:
        b = await p.chromium.launch(args=GL_ARGS)
        browser = "Chromium " + b.version
        for name, url, action in STATES:
            if not selected(name, only):
                continue
            for lang in ("th", "en"):
                for w in WIDTHS:
                    r = {"state": name, "lang": lang, "w": w}
                    r.update(await one(b, base, fill(url, fx), action, lang, w))
                    res.append(r)
                    print(json.dumps(r, ensure_ascii=False), flush=True)
        await b.close()
    bad = [r for r in res if r.get("error") or r.get("rawDoc", 0) > 0 or r.get("netDoc", 0) > 0
           or (r.get("swipe") or {}).get("scrollX") or (r.get("swipe") or {}).get("vv")]
    write_json(args.out, {"schema": "sila-phone-overflow/2.0", "checkedAtUtc": started, "base": base, "browser": browser,
                          "widths": list(WIDTHS), "languages": ["th", "en"], "runs": res, "summary": {"runs": len(res), "bad": len(bad)}})
    print("BAD", len(bad), "of", len(res))
    sys.exit(0 if not bad else 1)


if __name__ == "__main__":
    asyncio.run(main())
