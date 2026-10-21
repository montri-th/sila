"""Shared helpers for the Sila browser checks (Playwright for Python, Chromium).

Run from the repository root while the loopback preview is running:
    python3 server.py --port 8768        # in another terminal
    python3 qa/browser/run_matrix.py --base http://127.0.0.1:8768/

Software WebGL (SwiftShader) is used so the 3D terrain renders on machines without a GPU; real-GPU rendering is a
separate manual check on the live site. Tests open the site with basemap=none because street tiles are external.
"""
import json
import os
import sys
from urllib.parse import urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

DESKTOP = {"width": 1440, "height": 900}
TABLET = {"width": 1024, "height": 768}
PHONE = {"width": 390, "height": 844}
SMALL_PHONE = {"width": 320, "height": 640}
GL_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

READY = "() => { try { return !!window.SilaExplorer?.getState?.().ready } catch (e) { return false } }"
# Same-origin files the app may request and treat as absent on purpose (a 404 is the expected answer):
# the closed-low-ground layer is published only after the owner's review (SAFE-01, task F-30), and the Street View
# coverage file exists only after decision D-10 and task F-33 (app.js treats a 404 as "coverage unknown").
OPTIONAL_FILES = {"data/flood-lowground.geojson", "data/streetview-coverage.json"}
TRUE_OVERFLOW = """() => { const s = document.createElement('style'); s.textContent = 'html,body{overflow-x:visible!important}';
  document.head.appendChild(s); const de = document.documentElement, over = de.scrollWidth - de.clientWidth; s.remove(); return over; }"""


def load_fixtures():
    """Sample record ids and expected strings. Ids live in fixtures.json; expected figures come from
    qa/expected-figures.json (node qa/compute-figures.cjs --out qa/expected-figures.json)."""
    with open(os.path.join(HERE, "fixtures.json"), encoding="utf-8") as f:
        fx = json.load(f)
    exp_path = os.path.join(ROOT, "qa", "expected-figures.json")
    if os.path.exists(exp_path):
        with open(exp_path, encoding="utf-8") as f:
            fx["expect"] = json.load(f).get("uiExpect", {})
    else:
        fx["expect"] = {}
    return fx


def fill(url, fx):
    """Replace {owner}, {negotiateRecord} ... in a URL template with the fixture values."""
    return url.format(**fx["records"])


def base_url(value):
    return value if value.endswith("/") else value + "/"


def selected(name, only):
    return not only or any(o in name for o in only)


def http_error(resp, origin):
    """'http:404 app.js' for a same-origin response with status 400 or more, else None.
    A local 404 is how a file missing from server.py FILES shows up, so it counts as a page error."""
    if resp.status < 400:
        return None
    u = urlsplit(resp.url)
    if u.netloc != origin:
        return None  # outside tiles and services are not part of this check
    path = u.path.lstrip("/")
    if path in OPTIONAL_FILES:
        return None
    return f"http:{resp.status} {path or '/'}"


async def new_page(browser, viewport, downloads=False, origin=None):
    """A fresh context and page. Errors collected: uncaught page errors, console errors other than the browser's
    own 'Failed to load resource' line, and same-origin responses with status 400 or more (see http_error)."""
    narrow = viewport["width"] < 600
    ctx = await browser.new_context(viewport=viewport, device_scale_factor=2 if narrow else 1, is_mobile=narrow,
                                    has_touch=viewport["width"] < 900, accept_downloads=downloads)
    page = await ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)[:200]))
    page.on("console", lambda m: errors.append("console:" + m.text[:160])
            if m.type == "error" and "Failed to load resource" not in m.text else None)
    if origin:
        def on_response(resp):
            err = http_error(resp, origin)
            if err:
                errors.append(err)
        page.on("response", on_response)
    return ctx, page, errors


async def wait_ready(page, terrain=False, settle_ms=3000):
    try:
        await page.wait_for_function(READY, timeout=60000)
    except Exception:
        pass
    if terrain:
        try:
            await page.wait_for_function("() => ['ready','partial','error'].includes(document.getElementById('map')?.dataset.terrain3dState)", timeout=90000)
        except Exception:
            pass
    await page.wait_for_timeout(settle_ms)
    if terrain:
        try:
            await page.wait_for_function("() => document.getElementById('map')?.dataset.terrain3dState !== 'loading'", timeout=45000)
        except Exception:
            pass


def write_json(path, data):
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")


def die(msg):
    print(msg, file=sys.stderr)
    sys.exit(2)
