/* Sila terrain worker (revision 1.9, used by terrain-3d.js 2.x). No DEM is rehosted or stored beyond small
 * in-memory caches.
 *
 * It fetches the external FABDEM terrarium tiles (native zoom 12; the tile service covers all of Thailand),
 * decodes them off the main thread and serves MapLibre, through custom protocols, three products:
 *   geom    surface shape and shading. FABDEM heights; above zoom 12 a clamped Catmull-Rom overzoom (as in the
 *           CityMETER terrain viewer) so the surface is smooth instead of faceted. A sample with no data (alpha 0)
 *           takes the mean of its nearest measured neighbours only so the mesh has no zero wall; such a sample is
 *           never coloured, contoured or measured.
 *   hill    relief shading as an image (white light, black shadow, light from the north-west at 45 degrees, as the 2D
 *           hillshade), computed from the geom heights with real neighbours across tile edges, slopes multiplied by k
 *           (a power of two near the vertical exaggeration) so shading follows the exaggerated shape as the 1.8 mesh
 *           lighting did. Computing it here avoids MapLibre hillshade seams at tile and level-of-detail edges.
 *   strict  height colour, contour lines and relief statistics. FABDEM only, and only for pixels wholly inside
 *           the Mueang Khon Kaen district coverage: a pixel crossed by the boundary or without data is absent
 *           (encoded -9999, drawn transparent).
 *   contour Mapbox vector tiles of contour lines from the strict heights (maplibre-contour, BSD-3). A cell with a
 *           missing corner produces no line.
 */
(function (scope) {
  'use strict';
  const S = 256, NATIVE = 12, MAXZ = 14, SENTINEL = -9999;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ---------- pure helpers (also exercised by qa/check-terrain-3d.cjs in Node) ---------- */
  const mercX = (lng) => (lng + 180) / 360;
  const mercY = (lat) => (1 - Math.asinh(Math.tan(clamp(lat, -85.0511287798066, 85.0511287798066) * Math.PI / 180)) / Math.PI) / 2;
  function decodeTerrarium(rgba) {
    const h = new Float32Array(rgba.length / 4);
    for (let i = 0, k = 0; i < h.length; i++, k += 4) h[i] = rgba[k + 3] === 0 ? NaN : rgba[k] * 256 + rgba[k + 1] + rgba[k + 2] / 256 - 32768;
    return h;
  }
  /* NaN (absent) is written as the -9999 sentinel; alpha is always 255 because MapLibre ignores DEM alpha. */
  function encodeTerrarium(h) {
    const rgba = new Uint8ClampedArray(h.length * 4);
    for (let i = 0, k = 0; i < h.length; i++, k += 4) {
      let v = h[i];
      if (v !== v) v = SENTINEL;
      v = clamp(v + 32768, 0, 65535.99609375);
      const fl = Math.floor(v);
      rgba[k] = fl >> 8; rgba[k + 1] = fl & 255; rgba[k + 2] = Math.floor((v - fl) * 256); rgba[k + 3] = 255;
    }
    return rgba;
  }
  /* Fill absent samples from the mean of measured 4-neighbours, ring by ring outwards. A tile with no measured
     sample at all is not filled from nothing: the caller supplies a measured fallback (or the tile is refused). */
  function fillGaps(h, width, fallback) {
    let missing = 0;
    for (let i = 0; i < h.length; i++) if (h[i] !== h[i]) missing++;
    if (!missing) return h;
    const out = Float32Array.from(h);
    if (missing === h.length) {
      if (!Number.isFinite(fallback)) return null;
      out.fill(fallback);
      return out;
    }
    const height = h.length / width;
    let frontier = [];
    for (let i = 0; i < out.length; i++) if (out[i] !== out[i]) frontier.push(i);
    while (frontier.length) {
      const next = [], updates = [];
      for (const i of frontier) {
        const x = i % width, y = (i - x) / width;
        let s = 0, n = 0, v;
        if (x > 0 && (v = out[i - 1]) === v) { s += v; n++; }
        if (x + 1 < width && (v = out[i + 1]) === v) { s += v; n++; }
        if (y > 0 && (v = out[i - width]) === v) { s += v; n++; }
        if (y + 1 < height && (v = out[i + width]) === v) { s += v; n++; }
        if (n) updates.push(i, s / n); else next.push(i);
      }
      if (!updates.length) break;
      for (let k = 0; k < updates.length; k += 2) out[updates[k]] = updates[k + 1];
      frontier = next;
    }
    return out;
  }
  const cr = (t) => { const t2 = t * t, t3 = t2 * t; return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2]; };
  /* Window of native samples needed to overzoom tile (z,x,y) with pad extra output pixels on each side, in global
     native pixel indices (inclusive). */
  function overzoomWindow(z, x, y, pad = 0) {
    const k = 2 ** (z - NATIVE);
    const u0 = (x * S - pad + 0.5) / k - 0.5, v0 = (y * S - pad + 0.5) / k - 0.5;
    const u1 = (x * S + S - 1 + pad + 0.5) / k - 0.5, v1 = (y * S + S - 1 + pad + 0.5) / k - 0.5;
    return { k, pad, ix0: Math.floor(u0) - 1, iy0: Math.floor(v0) - 1, ix1: Math.floor(u1) + 2, iy1: Math.floor(v1) + 2 };
  }
  /* Clamped Catmull-Rom (C1, no overshoot beyond the 2x2 neighbourhood); any missing tap falls back to bilinear on
     the 2x2 cell, which stays absent (NaN) when one of its corners is absent. win is row-major W x H from (ix0, iy0). */
  function overzoom(win, W, H, wnd, x, y) {
    const { k, ix0, iy0 } = wnd, pad = wnd.pad || 0, N = S + 2 * pad, out = new Float32Array(N * N);
    const cols = new Int32Array(N), wx = new Float64Array(4 * N), fxs = new Float64Array(N);
    for (let px = 0; px < N; px++) { const u = (x * S + px - pad + 0.5) / k - 0.5, i = Math.floor(u); cols[px] = i - ix0; fxs[px] = u - i; wx.set(cr(u - i), 4 * px); }
    for (let py = 0; py < N; py++) {
      const v = (y * S + py - pad + 0.5) / k - 0.5, j = Math.floor(v), fy = v - j, wy = cr(fy), r = j - iy0;
      for (let px = 0; px < N; px++) {
        const c = cols[px], o = 4 * px;
        let acc = 0, ok = true;
        for (let a = 0; a < 4 && ok; a++) {
          const row = (r - 1 + a) * W + c;
          let s = 0;
          for (let b = 0; b < 4; b++) { const val = win[row - 1 + b]; if (val !== val) { ok = false; break; } s += wx[o + b] * val; }
          acc += wy[a] * s;
        }
        const p00 = win[r * W + c], p10 = win[r * W + c + 1], p01 = win[(r + 1) * W + c], p11 = win[(r + 1) * W + c + 1];
        if (ok) { const lo = Math.min(p00, p10, p01, p11), hi = Math.max(p00, p10, p01, p11); out[py * N + px] = acc < lo ? lo : acc > hi ? hi : acc; }
        else { const fx = fxs[px]; out[py * N + px] = p00 + (p10 - p00) * fx + (p01 - p00) * fy + (p00 - p10 - p01 + p11) * fx * fy; }
      }
    }
    return out;
  }
  function pointInRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const pointInPolygons = (lng, lat, polys) => polys.some((p) => pointInRing(lng, lat, p[0]) && !p.slice(1).some((hole) => pointInRing(lng, lat, hole)));
  /* Coverage mask for tile (z,x,y): 1 where the pixel centre is inside the coverage AND no boundary edge touches
     the pixel square (scanline fill + supercover edge walk). Conservative: the edge band stays absent. */
  function coverageMask(polys, z, x, y) {
    const n = 2 ** z, mask = new Uint8Array(S * S), rings = [];
    for (const p of polys) for (const ring of p) rings.push(ring.map(([lng, lat]) => [(mercX(lng) * n - x) * S, (mercY(lat) * n - y) * S]));
    for (let row = 0; row < S; row++) {
      const cy = row + 0.5, xs = [];
      for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const a = r[j], b = r[i];
        if ((a[1] > cy) !== (b[1] > cy)) xs.push(a[0] + (cy - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.max(0, Math.ceil(xs[k] - 0.5)), to = Math.min(S - 1, Math.floor(xs[k + 1] - 0.5));
        for (let c = from; c <= to; c++) mask[row * S + c] = 1;
      }
    }
    for (const r of rings) for (let i = 1; i < r.length; i++) {
      const a = r[i - 1], b = r[i];
      if (Math.max(a[0], b[0]) < -1 || Math.min(a[0], b[0]) > S + 1 || Math.max(a[1], b[1]) < -1 || Math.min(a[1], b[1]) > S + 1) continue;
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
        const cx = Math.floor(px), cyy = Math.floor(py);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const gx = cx + dx, gy = cyy + dy;
          if (gx < 0 || gy < 0 || gx >= S || gy >= S) continue;
          // the segment point lies within (or on the edge of) this pixel square, widened by a hair for rounding
          if (px >= gx - 1e-6 && px <= gx + 1 + 1e-6 && py >= gy - 1e-6 && py <= gy + 1 + 1e-6) mask[gy * S + gx] = 0;
        }
      }
    }
    return mask;
  }
  /* Relief shading from a padded (S+2) x (S+2) height window: the 2D hillshade rule (light azimuth 315, altitude 45;
     white where a slope faces the light more than flat ground, black where less, alpha by the difference), with slopes
     multiplied by k. A pixel next to an absent height stays transparent. */
  function shadeImage(win, z, y, k, theme) {
    const N = S + 2, out = new Uint8ClampedArray(S * S * 4);
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / 2 ** z))) * 180 / Math.PI;
    const mpp = 40075016.68557849 * Math.cos(lat * Math.PI / 180) / (S * 2 ** z);
    const alt = Math.PI / 4, az = 315 * Math.PI / 180, flat = Math.sin(alt);
    const L0 = Math.sin(az) * Math.cos(alt), L1 = Math.cos(az) * Math.cos(alt), L2 = Math.sin(alt);
    const maxAlpha = theme === 'dark' ? 180 : 160, f = k / (2 * mpp);
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const c = (py + 1) * N + px + 1, l = win[c - 1], r = win[c + 1], t = win[c - N], b = win[c + N];
      if (l !== l || r !== r || t !== t || b !== b || win[c] !== win[c]) continue;
      const dx = (r - l) * f, dy = (t - b) * f, norm = Math.sqrt(dx * dx + dy * dy + 1);
      const ill = Math.max(0, (-dx * L0 - dy * L1 + L2) / norm), delta = ill - flat, o = (py * S + px) * 4;
      const v = delta >= 0 ? 255 : 0;
      out[o] = out[o + 1] = out[o + 2] = v;
      out[o + 3] = Math.min(maxAlpha, Math.round(Math.abs(delta) * maxAlpha * 1.6));
    }
    return out;
  }
  /* Relief statistics from measured samples (unknown samples are skipped, never zero), as in the 1.8 viewer. */
  function reliefStats(values) {
    if (values.length < 8) return { relief: null, samples: values.length };
    const v = Float64Array.from(values).sort();
    const q = (t) => v[Math.round(t * (v.length - 1))];
    return { relief: q(0.99) - q(0.01), low: q(0.01), high: q(0.99), lo: q(0.005), hi: q(0.995), quantiles: Array.from({ length: 101 }, (_, k) => q(0.005 + 0.99 * k / 100)), samples: v.length };
  }
  const api = { S, NATIVE, MAXZ, SENTINEL, decodeTerrarium, encodeTerrarium, fillGaps, overzoomWindow, overzoom, coverageMask, pointInPolygons, shadeImage, reliefStats, mercX, mercY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof importScripts !== 'function') return;

  /* ---------- worker runtime ---------- */
  importScripts('vendor/maplibre-contour/maplibre-contour.min.js');
  let TEMPLATE = '', POLYS = [], BBOX = null, meanSum = 0, meanN = 0;
  class LRU {
    constructor(n) { this.n = n; this.m = new Map(); }
    get(k) { const v = this.m.get(k); if (v !== undefined) { this.m.delete(k); this.m.set(k, v); } return v; }
    set(k, v) { this.m.delete(k); this.m.set(k, v); while (this.m.size > this.n) this.m.delete(this.m.keys().next().value); return v; }
    delete(k) { this.m.delete(k); }
  }
  const rawP = new LRU(72), rawDone = new LRU(72), filled = new LRU(48), masks = new LRU(48), derived = new LRU(48);
  const aborted = new Set();
  const keyOf = (z, x, y) => z + '/' + x + '/' + y;
  function raw(z, x, y) {
    const n = 2 ** z;
    if (y < 0 || y >= n) return Promise.resolve(null);
    x = ((x % n) + n) % n;
    const key = keyOf(z, x, y), hit = rawP.get(key);
    if (hit) return hit;
    const p = (async () => {
      const response = await fetch(TEMPLATE.replace('{z}', z).replace('{x}', x).replace('{y}', y), { mode: 'cors', credentials: 'omit' });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('FABDEM tile HTTP ' + response.status);
      const bmp = await createImageBitmap(await response.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      if (bmp.width !== S || bmp.height !== S) { bmp.close(); throw new Error('Unexpected FABDEM tile size'); }
      const canvas = new OffscreenCanvas(S, S), g = canvas.getContext('2d', { willReadFrequently: true });
      g.drawImage(bmp, 0, 0); bmp.close();
      const h = decodeTerrarium(g.getImageData(0, 0, S, S).data);
      let s = 0, c = 0;
      for (let i = 0; i < h.length; i += 7) if (h[i] === h[i]) { s += h[i]; c++; }
      if (c) { meanSum += s / c; meanN++; }
      rawDone.set(key, h);
      return h;
    })();
    p.catch(() => { if (rawP.get(key) === p) rawP.delete(key); });
    return rawP.set(key, p);
  }
  /* Surface heights for one tile: measured FABDEM with gaps filled from measured neighbours. Beyond the FABDEM
     service (outside Thailand, only ever near the horizon) the surface is held at the mean measured height so the
     horizon shows no wall; such tiles are never coloured, contoured or measured. */
  async function filledNative(z, x, y) {
    const key = keyOf(z, x, y), hit = filled.get(key);
    if (hit) return hit;
    const h = await raw(z, x, y), fallback = meanN ? meanSum / meanN : NaN;
    const out = h ? fillGaps(h, S, fallback) : Number.isFinite(fallback) ? new Float32Array(S * S).fill(fallback) : null;
    if (!out) throw new Error('No measured height to fill from');
    return filled.set(key, out);
  }
  function maskOf(z, x, y) {
    const key = keyOf(z, x, y);
    return masks.get(key) || masks.set(key, coverageMask(POLYS, z, x, y));
  }
  function tileOutsideBbox(z, x, y) {
    if (!BBOX) return false;
    const n = 2 ** z, west = x / n * 360 - 180, east = (x + 1) / n * 360 - 180;
    const north = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI, south = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;
    return east < BBOX[0] || west > BBOX[2] || north < BBOX[1] || south > BBOX[3];
  }
  async function overzoomFrom(getNative, z, x, y, pad = 0) {
    const wnd = overzoomWindow(z, x, y, pad), W = wnd.ix1 - wnd.ix0 + 1, H = wnd.iy1 - wnd.iy0 + 1, n = 2 ** NATIVE;
    const win = new Float32Array(W * H).fill(NaN), jobs = [];
    for (let ty = Math.floor(wnd.iy0 / S); ty <= Math.floor(wnd.iy1 / S); ty++) for (let tx = Math.floor(wnd.ix0 / S); tx <= Math.floor(wnd.ix1 / S); tx++) {
      if (ty < 0 || ty >= n) continue;
      jobs.push(getNative(NATIVE, (tx + n) % n, ty).then((t) => {
        if (!t) return;
        for (let wy = Math.max(0, ty * S - wnd.iy0); wy < Math.min(H, ty * S + S - wnd.iy0); wy++) {
          const srcRow = (wy + wnd.iy0 - ty * S) * S - tx * S;
          for (let wx = Math.max(0, tx * S - wnd.ix0); wx < Math.min(W, tx * S + S - wnd.ix0); wx++) win[wy * W + wx] = t[srcRow + wx + wnd.ix0];
        }
      }));
    }
    await Promise.all(jobs);
    return overzoom(win, W, H, wnd, x, y);
  }
  /* (S+2) x (S+2) geom window at zoom z <= 12: the tile plus a one-pixel ring from its real neighbours. A neighbour
     is used only if it is already loaded or on its way (MapLibre asks for the visible tiles together); otherwise the
     tile's own edge is repeated rather than fetching a whole tile for one pixel row (only at the edge of the view). */
  async function nativeRing(z, x, y) {
    const N = S + 2, win = new Float32Array(N * N).fill(NaN), n = 2 ** z;
    const centre = await filledNative(z, x, y);
    if (!centre) return win;
    const jobs = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const ny = y + dy, nx = (((x + dx) % n) + n) % n;
      const t0 = dx === 0 && dy === 0 ? Promise.resolve(centre) : ny >= 0 && ny < n && rawP.get(keyOf(z, nx, ny)) ? filledNative(z, nx, ny) : Promise.resolve(null);
      jobs.push(t0.then((t) => {
        if (!t) return;
        for (let wy = 0; wy < N; wy++) {
          const sy = wy - 1 - dy * S; if (sy < 0 || sy >= S) continue;
          for (let wx = 0; wx < N; wx++) { const sx = wx - 1 - dx * S; if (sx >= 0 && sx < S) win[wy * N + wx] = t[sy * S + sx]; }
        }
      }).catch(() => {}));
    }
    await Promise.all(jobs);
    for (let i = 0; i < N; i++) {   // repeat the tile edge where no neighbour is loaded
      if (win[i] !== win[i]) win[i] = win[N + Math.min(N - 2, Math.max(1, i))];
      if (win[(N - 1) * N + i] !== win[(N - 1) * N + i]) win[(N - 1) * N + i] = win[(N - 2) * N + Math.min(N - 2, Math.max(1, i))];
      if (win[i * N] !== win[i * N]) win[i * N] = win[Math.min(N - 2, Math.max(1, i)) * N + 1];
      if (win[i * N + N - 1] !== win[i * N + N - 1]) win[i * N + N - 1] = win[Math.min(N - 2, Math.max(1, i)) * N + N - 2];
    }
    return win;
  }
  async function heights(kind, z, x, y) {
    const key = kind + ':' + keyOf(z, x, y), hit = derived.get(key);
    if (hit) return hit;
    let h;
    if (kind === 'ring') h = z <= NATIVE ? await nativeRing(z, x, y) : await overzoomFrom(filledNative, z, x, y, 1);
    else if (kind === 'geom') {
      if (z <= NATIVE) h = await filledNative(z, x, y);
      else {
        h = await overzoomFrom(filledNative, z, x, y);
        for (let i = 0; i < h.length; i++) if (h[i] !== h[i]) { h = fillGaps(h, S, meanN ? meanSum / meanN : NaN); break; }
      }
      if (!h) throw new Error('No FABDEM tile here');
    } else {
      if (tileOutsideBbox(z, x, y)) h = new Float32Array(S * S).fill(NaN);
      else {
        const base = z <= NATIVE ? await raw(z, x, y) : await overzoomFrom(raw, z, x, y);
        h = base ? Float32Array.from(base) : new Float32Array(S * S).fill(NaN);
        const m = maskOf(z, x, y);
        for (let i = 0; i < h.length; i++) if (!m[i]) h[i] = NaN;
      }
    }
    return derived.set(key, h);
  }
  const contours = new scope.mlcontour.LocalDemManager({
    demUrlPattern: 'strict/{z}/{x}/{y}', cacheSize: 24, encoding: 'terrarium', maxzoom: MAXZ, timeoutMs: 20000,
    getTile: async (url) => { const m = /(\d+)\/(\d+)\/(\d+)$/.exec(url), h = await heights('strict', +m[1], +m[2], +m[3]); return { data: new Blob([h]) }; },
    decodeImage: async (blob) => ({ width: S, height: S, data: new Float32Array(await blob.arrayBuffer()) }),
  });
  /* Relief from strict samples: the finest cached tile (zoom 12 down to 8) that holds each point; no new fetches. */
  function sampleAt(lng, lat) {
    if (!pointInPolygons(lng, lat, POLYS)) return NaN;
    for (let z = NATIVE; z >= 8; z--) {
      const n = 2 ** z, gx = mercX(lng) * n * S - 0.5, gy = mercY(lat) * n * S - 0.5, ix = Math.floor(gx), iy = Math.floor(gy);
      const corner = (cx, cy) => { const t = rawDone.get(keyOf(z, Math.floor(cx / S), Math.floor(cy / S))); return t ? t[(cy - Math.floor(cy / S) * S) * S + (cx - Math.floor(cx / S) * S)] : undefined; };
      const a = corner(ix, iy), b = corner(ix + 1, iy), c = corner(ix, iy + 1), d = corner(ix + 1, iy + 1);
      if (a === undefined || b === undefined || c === undefined || d === undefined) continue;
      const u = gx - ix, v = gy - iy;
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;   // NaN if a corner has no data
    }
    return NaN;
  }
  async function bitmapOf(h) {
    return createImageBitmap(new ImageData(encodeTerrarium(h), S, S), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  }
  scope.onmessage = async (event) => {
    const m = event.data;
    if (m.type === 'init') {
      TEMPLATE = m.template; POLYS = m.polygons || []; BBOX = m.bbox || null;
      const ok = typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function' && !!scope.mlcontour;
      scope.postMessage({ type: 'init', ok, reason: ok ? null : 'This browser cannot decode terrain tiles in a worker' });
      return;
    }
    if (m.type === 'abort') { if (aborted.size > 4096) aborted.clear(); aborted.add(m.id); return; }
    try {
      if (m.type === 'tile') {
        let bitmap;
        if (m.kind === 'hill') {
          const win = await heights('ring', m.z, m.x, m.y);
          if (aborted.delete(m.id)) return;
          bitmap = await createImageBitmap(new ImageData(shadeImage(win, m.z, m.y, clamp(Math.round(Number(m.k) || 1), 1, 64), m.theme === 'light' ? 'light' : 'dark'), S, S), { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });   // raster layers blend premultiplied colour
        } else {
          const h = await heights(m.kind === 'strict' ? 'strict' : 'geom', m.z, m.x, m.y);
          if (aborted.delete(m.id)) return;
          bitmap = await bitmapOf(h);
        }
        scope.postMessage({ id: m.id, bitmap }, [bitmap]);
      } else if (m.type === 'contour') {
        const controller = new AbortController();
        // Heights are scaled to whole contour steps (multiplier 1/minor) so thresholds are integers and every fifth
        // line is tagged major exactly, even for 0.05 m or 0.1 m steps.
        const minor = Number(m.minor), ratio = Math.max(1, Math.round(Number(m.ratio) || 5));
        if (!(minor > 0)) throw new Error('Bad contour step');
        const tile = await contours.fetchContourTile(m.z, m.x, m.y, { levels: [1, ratio], multiplier: 1 / minor, contourLayer: 'contours', elevationKey: 'ele', levelKey: 'level', extent: 4096, buffer: 1 }, controller);
        if (aborted.delete(m.id)) return;
        const buffer = tile.arrayBuffer.slice(0);
        scope.postMessage({ id: m.id, buffer }, [buffer]);
      } else if (m.type === 'sample') {
        const p = m.points, values = [];
        for (let i = 0; i + 1 < p.length; i += 2) { const v = sampleAt(p[i], p[i + 1]); if (v === v) values.push(v); }
        scope.postMessage({ id: m.id, stats: reliefStats(values) });
      }
    } catch (error) {
      if (!aborted.delete(m.id)) scope.postMessage({ id: m.id, error: String((error && error.message) || error) });
    }
  };
})(typeof self !== 'undefined' ? self : globalThis);
