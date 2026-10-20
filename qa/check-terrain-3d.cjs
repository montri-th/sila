'use strict';
/* Revision 1.9: native MapLibre terrain (terrain-3d.js 2.x) and its worker (terrain-dem-worker.js).
 * Deterministic checks of decoding, gap policy, overzoom, coverage clip, shading, relief statistics, colour
 * expressions and camera/exaggeration helpers. Synthetic DEM values only; browser rendering has its own receipt. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const api = require('../terrain-3d.js');
const W = require('../terrain-dem-worker.js');
const t = api._test, h = require('../fabdem-layer.js')._test;
let checks = 0;
const check = (name, fn) => { try { fn(); } catch (e) { e.message = `${name}: ${e.message}`; throw e; } checks++; };
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const S = W.S;
const rgba = (vals, alpha = 255) => { const a = new Uint8ClampedArray(vals.length * 4); vals.forEach((v, i) => { const x = v + 32768, fl = Math.floor(x); a[i * 4] = fl >> 8; a[i * 4 + 1] = fl & 255; a[i * 4 + 2] = Math.round((x - fl) * 256); a[i * 4 + 3] = alpha; }); return a; };

/* Decoding and the absent-value policy */
check('measured zero remains a true elevation', () => near(W.decodeTerrarium(rgba([0]))[0], 0));
check('alpha 0 is absent regardless of RGB', () => assert.ok(Number.isNaN(W.decodeTerrarium(rgba([150], 0))[0])));
check('negative elevation is retained', () => near(W.decodeTerrarium(rgba([-1]))[0], -1));
check('fractional terrarium bytes decode exactly', () => near(W.decodeTerrarium(new Uint8ClampedArray([128, 163, 178, 255]))[0], 163.6953125));
check('encode/decode round trip keeps fractions to 1/256 m', () => { const v = [149.7, 0, -3.25, 211.99]; const back = W.decodeTerrarium(W.encodeTerrarium(Float32Array.from(v))); v.forEach((x, i) => near(back[i], x, 1 / 256 + 1e-4)); });
check('absent heights encode as the -9999 sentinel, never 0', () => { const back = W.decodeTerrarium(W.encodeTerrarium(Float32Array.from([NaN, 0]))); assert.equal(back[0], W.SENTINEL); assert.equal(back[1], 0); });
check('surface gap is filled from measured neighbours, not zero', () => { const a = new Float32Array(9).fill(150); a[4] = NaN; const f = W.fillGaps(a, 3, NaN); near(f[4], 150); assert.ok(Number.isNaN(a[4]), 'input untouched'); });
check('a wider gap fills ring by ring from its edge', () => { const a = new Float32Array(25).fill(NaN); for (let i = 0; i < 5; i++) a[i] = 100 + i; const f = W.fillGaps(a, 5, NaN); assert.ok([...f].every(Number.isFinite)); near(f[20], 100, 1e-6); near(f[24], 104, 1e-6); });
check('a tile with no measured sample is refused without a measured fallback', () => assert.equal(W.fillGaps(new Float32Array(16).fill(NaN), 4, NaN), null));
check('an all-absent tile takes only a supplied measured mean', () => { const f = W.fillGaps(new Float32Array(4).fill(NaN), 2, 161.5); assert.deepEqual([...f], [161.5, 161.5, 161.5, 161.5]); });

/* Catmull-Rom overzoom (z12 -> z13/z14) */
function nativeWindow(fn, z, x, y, pad = 0) {
  const wnd = W.overzoomWindow(z, x, y, pad), Wd = wnd.ix1 - wnd.ix0 + 1, Hd = wnd.iy1 - wnd.iy0 + 1, win = new Float32Array(Wd * Hd);
  for (let j = 0; j < Hd; j++) for (let i = 0; i < Wd; i++) win[j * Wd + i] = fn(wnd.ix0 + i, wnd.iy0 + j);
  return W.overzoom(win, Wd, Hd, wnd, x, y);
}
const X12 = 3216 * S, Y12 = 1858 * S;
check('constant ground stays exactly constant', () => { const o = nativeWindow(() => 155.5, 13, 6433, 3716); assert.ok(o.every(v => v === 155.5)); });
check('a linear slope is reproduced exactly (no wobble)', () => { const o = nativeWindow((i) => 150 + 0.5 * (i - X12), 13, 6432, 3716); for (let px = 0; px < S; px++) { const u = (6432 * S + px + 0.5) / 2 - 0.5; near(o[px], 150 + 0.5 * (u - X12), 1e-3); } });
check('a step does not overshoot its neighbours (clamped)', () => { const o = nativeWindow((i) => (i < X12 + 64 ? 150 : 160), 13, 6432, 3716); assert.ok(o.every(v => v >= 150 - 1e-4 && v <= 160 + 1e-4)); });
check('adjacent overzoomed tiles meet without a seam', () => { const f = (i, j) => 150 + 0.01 * (i - X12) ** 2 / 50 + 0.3 * (j - Y12); const a = nativeWindow(f, 14, 12866, 7432), b = nativeWindow(f, 14, 12867, 7432); for (let py = 0; py < S; py += 17) { const d1 = b[py * S] - a[py * S + S - 1], d0 = a[py * S + S - 1] - a[py * S + S - 2]; assert.ok(Math.abs(d1 - d0) < 0.02, `jump ${d1} vs ${d0}`); } });
check('a missing tap falls back to bilinear; a missing corner stays absent', () => { const o = nativeWindow((i, j) => (i === X12 + 10 && j === Y12 + 10 ? NaN : 150), 13, 6432, 3716); assert.ok(o.some(Number.isNaN)); assert.ok(o.filter(Number.isFinite).every(v => near(v, 150, 1e-4) === undefined)); });
check('padded output adds one ring and agrees with the unpadded tile', () => { const f = (i, j) => 150 + 0.2 * (i - X12) - 0.1 * (j - Y12); const a = nativeWindow(f, 13, 6432, 3716), p = nativeWindow(f, 13, 6432, 3716, 1); assert.equal(p.length, (S + 2) ** 2); for (let py = 0; py < S; py += 31) for (let px = 0; px < S; px += 29) near(p[(py + 1) * (S + 2) + px + 1], a[py * S + px], 1e-4); });

/* Coverage clip for colour, contours and relief (strict) */
const ll = (x, y) => t.lonlat([x, y]);
const ringOf = (x0, y0, x1, y1) => [ll(x0, y0), ll(x1, y0), ll(x1, y1), ll(x0, y1), ll(x0, y0)];
check('pixels well inside the coverage are kept', () => { const m = W.coverageMask([[ringOf(0.1, 0.1, 0.9, 0.9)]], 0, 0, 0); assert.equal(m[128 * S + 128], 1); });
check('pixels outside the coverage are absent', () => { const m = W.coverageMask([[ringOf(0.3, 0.3, 0.7, 0.7)]], 0, 0, 0); assert.equal(m[5 * S + 5], 0); assert.equal(m[250 * S + 250], 0); });
check('every pixel touched by the boundary is absent (conservative edge band)', () => { const m = W.coverageMask([[ringOf(0.3, 0.3, 0.7, 0.7)]], 0, 0, 0); const edge = Math.floor(0.3 * S); assert.equal(m[128 * S + edge], 0); assert.equal(m[128 * S + edge + 2], 1); });
check('a hole in the coverage is absent', () => { const m = W.coverageMask([[ringOf(0.1, 0.1, 0.9, 0.9), ringOf(0.4, 0.4, 0.6, 0.6)]], 0, 0, 0); assert.equal(m[128 * S + 128], 0); assert.equal(m[60 * S + 60], 1); });
check('point-in-polygon honours holes', () => { const p = [[ringOf(0.1, 0.1, 0.9, 0.9), ringOf(0.4, 0.4, 0.6, 0.6)]]; const a = ll(0.5, 0.5), b = ll(0.2, 0.2); assert.equal(W.pointInPolygons(a[0], a[1], p), false); assert.equal(W.pointInPolygons(b[0], b[1], p), true); });
const coverage = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/terrain-coverage.geojson'), 'utf8'));
check('real district clip: Sila centre is inside, a point 40 km away is not', () => { const ps = h.polygonsOf(coverage); assert.equal(W.pointInPolygons(102.85, 16.49, ps), true); assert.equal(W.pointInPolygons(103.3, 16.9, ps), false); });

/* Relief shading (worker image, 2D rule) */
const shadeOf = (fn, k = 1) => { const N = S + 2, win = new Float32Array(N * N); for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) win[j * N + i] = fn(i, j); return W.shadeImage(win, 12, 1858, k, 'dark'); };
check('flat ground has no shading', () => { const o = shadeOf(() => 160); for (let i = 3; i < o.length; i += 4 * 97) assert.equal(o[i], 0); });
check('a slope facing the north-west light is lit (white)', () => { const o = shadeOf((i, j) => 160 + 2 * i + 2 * j); assert.equal(o[0], 255); assert.ok(o[3] > 0); });   // ground falls towards the north-west
check('a slope facing away is shadowed (black)', () => { const o = shadeOf((i, j) => 160 - 2 * i - 2 * j); assert.equal(o[0], 0); assert.ok(o[3] > 0); });
check('shading strength follows the exaggeration factor k', () => { const a = shadeOf((i) => 160 + 0.2 * i, 1), b = shadeOf((i) => 160 + 0.2 * i, 32); assert.ok(b[3] > a[3]); });
check('a pixel next to an absent height is not shaded', () => { const N = S + 2; const o = shadeOf((i, j) => (i === 10 && j === 10 ? NaN : 160 + 2 * i)); assert.equal(o[((10 - 1) * S + (10 - 1)) * 4 + 3], 0); assert.equal(N, 258); });

/* Relief statistics */
check('fewer than 8 measured samples give no relief (unknown, not zero)', () => assert.equal(W.reliefStats([150, 151, 152]).relief, null));
check('relief uses trimmed percentiles and 101 quantiles', () => { const v = Array.from({length: 1001}, (_, i) => 150 + i * 0.06); const r = W.reliefStats(v); near(r.relief, r.high - r.low); assert.equal(r.quantiles.length, 101); assert.ok(r.quantiles.every((q, i) => i === 0 || q >= r.quantiles[i - 1])); });

/* Colour expression, contour and shading tile URLs */
const pal = ['#1D6B3C', '#4E9A4A', '#98C46C', '#E3DD98', '#DCB36F', '#BB7F4B', '#8E5B3D'];
check('palette position matches the 2D LUT rule', () => { const lut = h.rampLUT(pal); for (const k of [0, 64, 128, 200, 255]) { const c = t.paletteAt(pal, k / 255).match(/\d+/g).map(Number); for (let i = 0; i < 3; i++) assert.ok(Math.abs(c[i] - lut[k * 3 + i]) <= 1); } });
check('no palette or no range gives no colour expression', () => { assert.equal(t.reliefColorExpression({colors: null, lo: 0, hi: 1}), null); assert.equal(t.reliefColorExpression({colors: pal, lo: 5, hi: 5}), null); });
const exprStops = (e) => { const out = []; for (let i = 3; i < e.length; i += 2) out.push([e[i], e[i + 1]]); return out; };
check('absent heights (sentinel) stay transparent', () => { const e = t.reliefColorExpression({colors: pal, lo: 150, hi: 210, mapping: 'linear'}); const s = exprStops(e); assert.equal(s[0][0], t.SENTINEL); assert.equal(s[0][1], 'rgba(0,0,0,0)'); assert.equal(s[1][1], 'rgba(0,0,0,0)'); assert.ok(s[2][1].startsWith('rgb(')); });
check('stop heights increase strictly (valid MapLibre expression)', () => { for (const sfc of [{colors: pal, lo: 150, hi: 210, mapping: 'linear'}, {colors: pal, lo: 150, hi: 210, bands: 1}, {colors: pal, lo: 150, hi: 210, mapping: 'equalize', quantiles: Array.from({length: 101}, (_, k) => 150 + Math.floor(k / 3))}]) { const s = exprStops(t.reliefColorExpression(sfc)); for (let i = 1; i < s.length; i++) assert.ok(s[i][0] > s[i - 1][0]); } });
check('bands give one colour per contour band', () => { const s = exprStops(t.reliefColorExpression({colors: pal, lo: 150, hi: 153, bands: 1, mapping: 'linear'})).slice(3); assert.equal(s[0][1], s[1][1]); assert.notEqual(s[1][1], s[2][1]); near(s[1][0] - s[0][0], 0.99, 1e-9); });
check('equal-area colours sit at the in-view quantiles', () => { const q = Array.from({length: 101}, (_, k) => 150 + k * 0.5); const s = exprStops(t.reliefColorExpression({colors: pal, lo: 150, hi: 200, mapping: 'equalize', quantiles: q})); const at = s.find(([hh]) => hh === q[50]); assert.ok(at); assert.equal(at[1], t.paletteAt(pal, 0.5)); });
check('contour tiles carry the minor step and the major ratio', () => { assert.equal(t.contourUrl({interval: 0.05, major: 5}), 'silacontour://{z}/{x}/{y}?minor=0.05&ratio=5'); assert.equal(t.contourUrl({interval: 2, major: 5}), 'silacontour://{z}/{x}/{y}?minor=2&ratio=5'); });
check('shading factor is a power of two near the exaggeration (few tile rebuilds)', () => { assert.equal(t.shadeK(1), 1); assert.equal(t.shadeK(34), 32); assert.equal(t.shadeK(50), 64); assert.equal(t.shadeK(0.5), 1); });
check('tile URLs name the product and carry no personal data', () => { assert.equal(t.demUrl('strict'), 'siladem://strict/{z}/{x}/{y}'); assert.equal(t.hillUrl(32, 'light'), 'siladem://hill/{z}/{x}/{y}?k=32&t=light'); });
check('outside mask keeps the municipality open (holes)', () => { const fc = t.maskFeatures({type: 'Feature', geometry: {type: 'Polygon', coordinates: [ringOf(0.4, 0.4, 0.6, 0.6)]}}); assert.equal(fc.features.length, 1); assert.equal(fc.features[0].geometry.coordinates.length, 2); });

/* Camera handoff (Leaflet zoom = MapLibre zoom + 1) */
check('Leaflet camera zoom converts to standalone MapLibre zoom; north stays up', () => { const q = t.cameraIn({center: [102.8, 16.5], zoom: 14, pitch: 60, bearing: 25}); assert.equal(q.zoom, 13); assert.equal(q.pitch, 60); assert.equal(q.bearing, 0); });
check('camera return converts MapLibre zoom back to Leaflet', () => { const q = t.cameraOut({getCenter: () => ({lng: 102.8, lat: 16.5}), getZoom: () => 13, getPitch: () => 60, getBearing: () => 25}); assert.equal(q.zoom, 14); assert.deepEqual(q.center, [102.8, 16.5]); });
check('camera bounds retain display 22 and pitch limits', () => { const q = t.cameraIn({zoom: 30, pitch: 90}); assert.equal(q.zoom, 21); assert.equal(q.pitch, 75); });
check('Mercator coordinate round trip', () => { const p = [102.83, 16.49], q = t.lonlat(t.mercator(p)); near(q[0], p[0]); near(q[1], p[1]); });

/* CityMETER-style vertical exaggeration helpers (unchanged from 1.8) */
{
  const T = api.exaggeration;
  check('exaggeration range and slider mapping', () => { assert.equal(T.min, 0.5); assert.equal(T.max, 50); assert.equal(T.defaultTarget, 0.15); assert.equal(T.sliderToEx(0), 0.5); assert.equal(T.sliderToEx(1000), 50); assert.equal(T.sliderToEx(500), 5); assert.equal(T.sliderToEx(T.exToSlider(34)), 34); assert.equal(T.roundEx(3.14159), 3.1); assert.equal(T.roundEx(12.6), 13); });
  check('automatic exaggeration for the Sila view and its limits', () => { assert.equal(T.autoValue(59.4, 13310, 0.15), 34); assert.equal(T.autoValue(9.9, 3860, 0.15), 50); assert.equal(T.autoValue(2000, 10000, 0.15), 1); assert.equal(T.autoValue(0.2, 1000, 0.15), null); assert.equal(T.autoValue(null, 1000, 0.15), null); });
}
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
/* Receipts are written for the current revision; earlier revision receipts stay as they were published. */
const receipt = {schema: 'sila-inline-terrain3d-fixtures/2.0', revision: '1.9', checkedOn: '2026-10-20', checks, passed: checks, failed: 0,
  scope: 'Deterministic terrarium decoding, absent-value policy (sentinel, gap fill, refusal), clamped Catmull-Rom overzoom (constancy, linear exactness, no overshoot, tile continuity, padding), conservative coverage clip with holes, worker relief shading, relief statistics, color-relief expressions, contour/shading tile URLs, camera handoff and exaggeration helpers. Synthetic DEM values only; no browser/framebuffer attestation.',
  moduleSHA256: sha(path.join(__dirname, '../terrain-3d.js')), workerSHA256: sha(path.join(__dirname, '../terrain-dem-worker.js')), testsSHA256: sha(__filename),
  coverageSHA256: sha(path.join(__dirname, '../data/terrain-coverage.geojson')), separateBrowserReceipt: 'revision-1.9-browser-checks.json',
  browserAttestation: 'This receipt does not attest browser rendering; read the separate browser receipt.', rawDEMRehosted: false};
fs.writeFileSync(path.join(__dirname, 'revision-1.9-terrain3d-fixtures.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({checks, passed: checks, failed: 0}));
