/* Read-only FABDEM consumer. No elevation tiles are packaged or persisted.
 * Coverage: verified Mueang Khon Kaen district 4001 only.
 * FABDEM V1-2, CC BY-NC-SA 4.0; this notice does not grant commercial rights.
 */
(function (root) {
  'use strict';
  const TILE_PREFIX = 'https://landometer.com/api/v2/public/dem/z12-20261007/fabdem/';
  const DEFAULT_SOURCE = Object.freeze({
    tiles: TILE_PREFIX + '{z}/{x}/{y}.png', tileUrl: TILE_PREFIX + '{z}/{x}/{y}.png', minZoom: 0,
    dataset: 'FABDEM V1-2', version: 'z12-20261007', baked: '2026-10-07',
    maxNativeZoom: 12, tileSize: 256, encoding: 'terrarium',
    resolution: '1 arc-second (~30 m at equator)', verticalDatum: null,
    attribution: 'FABDEM V1-2 (Hawker et al. 2022, University of Bristol), CC BY-NC-SA 4.0',
    sourceUrl: 'https://landometer.com/api/v2/public/dem/z12-20261007/fabdem/manifest.json',
    licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    external3DUrl: 'https://landometer.com/v3/citymeter-3d/KKN/D/4001?d=terrain'
  });
  const decodeHeight = (r, g, b, a = 255) => a === 0 ? null : r * 256 + g + b / 256 - 32768;
  function polygonsOf(coverage) {
    const g = coverage && coverage.type === 'Feature' ? coverage.geometry : coverage;
    if (!g) throw new Error('District coverage is required');
    if (g.type === 'Polygon') return [g.coordinates];
    if (g.type === 'MultiPolygon') return g.coordinates;
    throw new Error('Coverage must be Polygon or MultiPolygon');
  }
  function bboxOf(polygons) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of polygons) for (const ring of p) for (const c of ring) {
      b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]);
      b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]);
    }
    return b;
  }
  function inRing(point, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > point[1]) !== (b[1] > point[1]) &&
          point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  const inPolygon = (point, polygon) => inRing(point, polygon[0]) && !polygon.slice(1).some(r => inRing(point, r));
  function pointInCoverage(point, polygons) { return polygons.some(p => inPolygon(point, p)); }
  function tileBounds(c) {
    const n = 2 ** c.z;
    const lat = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
    return [c.x / n * 360 - 180, lat(c.y + 1), (c.x + 1) / n * 360 - 180, lat(c.y)];
  }
  const overlap = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
  function segmentCrossesRect(a, b, r) {
    let t0 = 0, t1 = 1;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    for (const [p, q] of [[-dx, a[0] - r[0]], [dx, r[2] - a[0]], [-dy, a[1] - r[1]], [dy, r[3] - a[1]]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
    return true;
  }
  function intersectsBounds(rect, polygons) {
    if (!overlap(rect, bboxOf(polygons))) return false;
    const corners = [[rect[0], rect[1]], [rect[0], rect[3]], [rect[2], rect[1]], [rect[2], rect[3]]];
    if (corners.some(p => pointInCoverage(p, polygons))) return true;
    for (const polygon of polygons) for (const ring of polygon) {
      for (let i = 0; i < ring.length; i++) {
        if (segmentCrossesRect(ring[i], ring[(i + 1) % ring.length], rect)) return true;
      }
    }
    return false;
  }
  function projectToTile(point, c, size = 256) {
    const n = 2 ** c.z;
    const lat = Math.max(-85.05112878, Math.min(85.05112878, point[1])) * Math.PI / 180;
    return [((point[0] + 180) / 360 * n - c.x) * size,
      ((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * n - c.y) * size];
  }
  function clipCoverage(ctx, polygons, coords, size) {
    ctx.beginPath();
    for (const polygon of polygons) for (const ring of polygon) {
      ring.forEach((p, i) => { const q = projectToTile(p, coords, size); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
      ctx.closePath();
    }
    ctx.clip('evenodd');
  }
  function renderHillshade(rgba, width, height, metresPerPixel, theme = 'light') {
    const heights = new Float64Array(width * height);
    for (let i = 0; i < heights.length; i++) {
      const k = i * 4; const h = decodeHeight(rgba[k], rgba[k + 1], rgba[k + 2], rgba[k + 3]);
      heights[i] = h === null ? NaN : h;
    }
    const out = new Uint8ClampedArray(rgba.length);
    const alt = Math.PI / 4, az = 315 * Math.PI / 180, flat = Math.sin(alt);
    const light = [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)];
    const maxAlpha = theme === 'dark' ? 180 : 160;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const l = heights[y * width + Math.max(0, x - 1)], r = heights[y * width + Math.min(width - 1, x + 1)];
      const t = heights[Math.max(0, y - 1) * width + x], b = heights[Math.min(height - 1, y + 1) * width + x];
      if (![heights[i], l, r, t, b].every(Number.isFinite)) continue;
      const dx = (r - l) / ((x === 0 || x === width - 1 ? 1 : 2) * metresPerPixel);
      const dy = (t - b) / ((y === 0 || y === height - 1 ? 1 : 2) * metresPerPixel);
      const norm = Math.hypot(dx, dy, 1);
      const illumination = Math.max(0, (-dx * light[0] - dy * light[1] + light[2]) / norm);
      const delta = illumination - flat, k = i * 4;
      const color = delta >= 0 ? 255 : 0;
      out[k] = out[k + 1] = out[k + 2] = color;
      out[k + 3] = Math.min(maxAlpha, Math.round(Math.abs(delta) * maxAlpha * 1.6));
    }
    return out;
  }
  /* Revision 1.8: hypsometric colour stretched to a height range (OH3-style) and contour lines, drawn at
     display resolution. Above native zoom 12 heights are interpolated bilinearly between native cell centres;
     a cell next to missing or no-data samples stays transparent (no extrapolation, never zero). */
  const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  function rampLUT(colors, n = 256) {
    const stops = colors.map(hexRGB), lut = new Uint8ClampedArray(n * 3);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1) * (stops.length - 1), k = Math.min(stops.length - 2, Math.floor(t)), f = t - k;
      for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f);
    }
    return lut;
  }
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  function renderTerrain(heights, width, height, mpp, o = {}) {
    const out = new Uint8ClampedArray(width * height * 4), dark = o.theme === 'dark';
    const lut = o.colorOn === false ? null : o.lut, lo = o.lo, hi = o.hi, span = hi - lo;
    // Equal-area mapping: o.quantiles holds 101 heights (in-view percentiles 0.5..99.5); t = position in that list.
    const q = o.mapping === 'equalize' && o.quantiles && o.quantiles.length === 101 ? o.quantiles : null;
    const tOf = h => {
      if (!q) return Math.min(1, Math.max(0, (h - lo) / span));
      if (h <= q[0]) return 0; if (h >= q[100]) return 1;
      let a = 0, b = 100;
      while (b - a > 1) { const m = (a + b) >> 1; if (q[m] <= h) a = m; else b = m; }
      return (a + (q[b] > q[a] ? (h - q[a]) / (q[b] - q[a]) : 0)) / 100;
    };
    const colour = !!(lut && Number.isFinite(lo) && Number.isFinite(hi) && span > 0);
    // Height -> colour index, tabulated from tOf (4096 steps across the colour range) so each pixel is one lookup.
    let tBase = 0, tInv = 0, tTab = null; const tN = 4096;
    if (colour) {
      const a = q ? q[0] : lo, b = q ? q[100] : hi, step = (b - a) / tN;
      tBase = a; tInv = step > 0 ? 1 / step : 0; tTab = new Uint8Array(tN + 1);
      for (let i = 0; i <= tN; i++) tTab[i] = Math.round(tOf(a + i * step) * 255);
    }
    // Canvas pixels per CSS pixel: line widths and fading are measured in CSS pixels, so a sharper canvas keeps the same look.
    const ls = o.lineScale > 0 ? o.lineScale : 1;
    const interval = o.contourOn === false ? 0 : (o.interval > 0 ? o.interval : 0), major = interval * (o.major || 5), band = o.bands > 0 ? o.bands : 0;
    // Over the height colours, lines use the same dark ink in both themes, as the colours themselves do; with shading only they follow the theme.
    const ink = colour || !dark;
    const line = o.lineRGB || (ink ? [24, 35, 39] : [241, 244, 239]), opacity = Number.isFinite(o.opacity) ? o.opacity : 0.85;
    const alt = Math.PI / 4, az = 315 * Math.PI / 180, flat = Math.sin(alt);
    const L0 = Math.sin(az) * Math.cos(alt), L1 = Math.cos(az) * Math.cos(alt), L2 = Math.sin(alt), shadeAlpha = dark ? 180 : 160;
    const lineA = ink ? 1 : 0.7, A0 = 255 * opacity;
    for (let y = 0; y < height; y++) {
      const row = y * width, up = (y > 0 ? y - 1 : 0) * width, dn = (y < height - 1 ? y + 1 : height - 1) * width;
      const dyDiv = (y === 0 || y === height - 1 ? 1 : 2) * mpp;
      for (let x = 0; x < width; x++) {
        const i = row + x, h = heights[i];
        if (h !== h) continue;
        const l = heights[row + (x > 0 ? x - 1 : 0)], r = heights[row + (x < width - 1 ? x + 1 : width - 1)], t = heights[up + x], b = heights[dn + x];
        if (l !== l || r !== r || t !== t || b !== b) continue;
        const dx = (r - l) / ((x === 0 || x === width - 1 ? 1 : 2) * mpp), dy = (t - b) / dyDiv;
        const g2 = dx * dx + dy * dy;
        let illumination = (-dx * L0 - dy * L1 + L2) / Math.sqrt(g2 + 1); if (illumination < 0) illumination = 0;
        const delta = illumination - flat, k = i * 4;
        let R, G, B, A;
        if (colour) {
          const hv = band ? (Math.floor(h / band) + 0.5) * band : h;   // banded: one colour per band, sampled at its middle
          let ti = (hv - tBase) * tInv; ti = ti <= 0 ? 0 : ti >= tN ? tN : ti | 0;
          const li = tTab[ti] * 3; let s2 = 1 + 1.4 * delta; s2 = s2 < 0.45 ? 0.45 : s2 > 1.2 ? 1.2 : s2;
          R = lut[li] * s2; G = lut[li + 1] * s2; B = lut[li + 2] * s2; A = A0;
        } else {
          R = G = B = delta >= 0 ? 255 : 0; A = Math.min(shadeAlpha, Math.abs(delta) * shadeAlpha * 1.6);
        }
        if (interval) {
          // Distance to the nearest contour in CSS pixels: |h - nearest level| / |grad h| (height metres per CSS pixel).
          const g = Math.max(Math.sqrt(g2) * mpp * ls, 1e-9), fm = h / interval, fM = h / major;
          const dMinor = Math.abs(fm - Math.round(fm)) * interval / g, dMajor = Math.abs(fM - Math.round(fM)) * major / g;
          // Lines fade out where they would crowd: minor lines need about 10 px between them, major lines 8 px.
          const fadeMinor = clamp01((interval / g - 4) / 6), fadeMajor = clamp01((major / g - 3) / 5);
          const a = Math.max(clamp01(1.0 - dMinor) * 0.5 * fadeMinor, clamp01(1.5 - dMajor) * 0.85 * fadeMajor) * lineA;
          if (a > 0) {
            const base = A / 255, outA = a + base * (1 - a);
            R = (line[0] * a + R * base * (1 - a)) / outA; G = (line[1] * a + G * base * (1 - a)) / outA; B = (line[2] * a + B * base * (1 - a)) / outA; A = outA * 255;
          }
        }
        out[k] = R; out[k + 1] = G; out[k + 2] = B; out[k + 3] = A;
      }
    }
    return out;
  }
  function decodeImage(rgba) {
    const heights = new Float32Array(rgba.length / 4);
    for (let i = 0; i < heights.length; i++) { const k = i * 4, v = decodeHeight(rgba[k], rgba[k + 1], rgba[k + 2], rgba[k + 3]); heights[i] = v === null ? NaN : v; }
    return heights;
  }
  function percentile(sorted, q) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))] : null; }
  /* Revision 1.8.1: one canvas for the whole view instead of one canvas per tile. Heights are resampled from the
     source tiles into a single grid, so hillshade and contour lines are continuous across tile edges, and the picture
     is written with putImageData into a CPU-backed canvas (no canvas-to-canvas copies, no per-tile GPU textures). */
  const MAX_LAT = 85.0511287798;
  function createLayer({coverage, source = DEFAULT_SOURCE, theme = 'light', pane = 'overlayPane', style = {}, onStatus = () => {}} = {}) {
    if (!root.L) throw new Error('Leaflet must be loaded first');
    if (!coverage || !coverage.properties || coverage.properties.district_code !== '4001') throw new Error('Only verified district 4001 is supported');
    source = {...DEFAULT_SOURCE, ...source, tiles: source.tileUrl || source.tiles || DEFAULT_SOURCE.tiles};
    if (source.tiles !== DEFAULT_SOURCE.tiles || source.maxNativeZoom !== 12) throw new Error('Unverified terrain source contract');
    const polygons = polygonsOf(coverage), cache = new Map(), resolved = new Set(), failed = new Set();
    const stats = {requested: 0, rendered: 0, skipped: 0, errors: 0, pending: 0};
    let current = {...style}, frame = null, seq = 0, timer = null, map = null, canvas = null, ctx = null, maskCanvas = null;
    if (current.colors && !current.lut) current.lut = rampLUT(current.colors);
    const emit = (state, detail = {}) => { try { onStatus({state, ...stats, source: source.dataset, maxNativeZoom: 12, ...detail}); } catch (_) {} };
    const tileUrl = c => source.tiles.replace('{z}', c.z).replace('{x}', c.x).replace('{y}', c.y);
    async function fetchHeights(c) {
      const response = await fetch(tileUrl(c), {mode: 'cors', credentials: 'omit'});
      if (!response.ok) throw new Error(`Terrain tile HTTP ${response.status}`);
      const bitmap = await createImageBitmap(await response.blob(), {premultiplyAlpha: 'none', colorSpaceConversion: 'none'});
      try {
        if (bitmap.width !== 256 || bitmap.height !== 256) throw new Error('Unexpected DEM tile dimensions');
        const c2 = document.createElement('canvas'); c2.width = c2.height = 256;
        const ctx2 = c2.getContext('2d', {willReadFrequently: true}); ctx2.drawImage(bitmap, 0, 0);
        return decodeImage(ctx2.getImageData(0, 0, 256, 256).data);
      } finally { bitmap.close(); }
    }
    // Source tiles (z <= 12) keyed z/x/y; tiles outside district 4001 are never requested. A failed tile is retried on the next view.
    function sourceTile(z, x, y) {
      const key = z + '/' + x + '/' + y;
      if (cache.has(key)) { const e = cache.get(key); cache.delete(key); cache.set(key, e); return e; }
      let e;
      if (!intersectsBounds(tileBounds({z, x, y}), polygons)) { stats.skipped++; e = Promise.resolve(null); resolved.add(key); }
      else {
        stats.requested++; stats.pending++;
        e = fetchHeights({z, x, y}).then(v => { failed.delete(key); return v; }, error => {
          stats.errors++; failed.add(key); cache.delete(key); emit('error', {message: error.message, tile: key}); return null;
        }).finally(() => { stats.pending = Math.max(0, stats.pending - 1); resolved.add(key); });
      }
      cache.set(key, e);
      while (cache.size > 96) { const old = cache.keys().next().value; cache.delete(old); resolved.delete(old); }
      return e;
    }
    const projectX = (lon, scale) => (lon + 180) / 360 * scale;
    const projectY = (lat, scale) => { const r = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI / 180; return (1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * scale; };
    function coverageMask(Wr, Hr, zoom, gx0, gy0, r) {
      if (!maskCanvas) maskCanvas = document.createElement('canvas');
      if (maskCanvas.width !== Wr || maskCanvas.height !== Hr) { maskCanvas.width = Wr; maskCanvas.height = Hr; }
      const mc = maskCanvas.getContext('2d', {willReadFrequently: true}), scale = 256 * 2 ** zoom;
      mc.clearRect(0, 0, Wr, Hr); mc.beginPath();
      for (const polygon of polygons) for (const ring of polygon) {
        ring.forEach((p, i) => { const X = (projectX(p[0], scale) - gx0) * r, Y = (projectY(p[1], scale) - gy0) * r; i ? mc.lineTo(X, Y) : mc.moveTo(X, Y); });
        mc.closePath();
      }
      mc.fillStyle = '#ffffff'; mc.fill('evenodd');
      const data = mc.getImageData(0, 0, Wr, Hr).data, mask = new Uint8Array(Wr * Hr);
      for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3];
      return mask;
    }
    const PAD = 0.2, PIXEL_BUDGET = 2.4e6;
    function resolutionFor(W, H) {
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      return Math.max(1, Math.min(2, dpr, Math.sqrt(PIXEL_BUDGET / (W * H))));
    }
    function schedule(delay = 30) { clearTimeout(timer); timer = setTimeout(update, delay); }
    async function update() {
      timer = null;
      if (!map) return;
      const my = ++seq, size = map.getSize();
      if (size.x < 2 || size.y < 2) return;
      const zoom = map.getZoom(), center = map.getCenter();
      const min = map.containerPointToLayerPoint([-size.x * PAD, -size.y * PAD]).round();
      const W = Math.round(size.x * (1 + 2 * PAD)), H = Math.round(size.y * (1 + 2 * PAD));
      const origin = map.getPixelOrigin(), gx0 = min.x + origin.x, gy0 = min.y + origin.y;   // global display pixels at this zoom
      const sz = Math.max(0, Math.min(12, Math.round(zoom))), k = 2 ** (sz - zoom), n = 2 ** sz;   // source zoom and source px per display px
      const tx0 = Math.max(0, Math.floor(gx0 * k / 256)), tx1 = Math.min(n - 1, Math.floor((gx0 + W) * k / 256));
      const ty0 = Math.max(0, Math.floor(gy0 * k / 256)), ty1 = Math.min(n - 1, Math.floor((gy0 + H) * k / 256));
      if (tx1 < tx0 || ty1 < ty0 || (tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 1024) { emit('error', {message: 'Terrain view outside the tile budget'}); return; }
      const need = [];
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (intersectsBounds(tileBounds({z: sz, x: tx, y: ty}), polygons)) need.push([tx, ty]);
      if (need.length > 80) { emit('error', {message: 'District tile budget exceeded'}); return; }
      if (need.some(([x, y]) => !resolved.has(sz + '/' + x + '/' + y))) emit('loading', {scope: 'district:4001', overzoomIsVisualOnly: true});
      const tiles = await Promise.all(need.map(([x, y]) => sourceTile(sz, x, y)));
      if (my !== seq || !map) return;
      // Source mosaic around the frame (one spare cell each side); missing tiles stay NaN, never zero.
      const mx0 = Math.floor(gx0 * k) - 1, my0 = Math.floor(gy0 * k) - 1;
      const mw = Math.ceil((gx0 + W) * k) - mx0 + 2, mh = Math.ceil((gy0 + H) * k) - my0 + 2;
      const mosaic = new Float32Array(mw * mh).fill(NaN);
      need.forEach(([tx, ty], index) => {
        const t = tiles[index]; if (!t) return;
        const ox = tx * 256 - mx0, oy = ty * 256 - my0;
        const x0 = Math.max(0, ox), x1 = Math.min(mw, ox + 256), y0 = Math.max(0, oy), y1 = Math.min(mh, oy + 256);
        for (let y = y0; y < y1; y++) mosaic.set(t.subarray((y - oy) * 256 + (x0 - ox), (y - oy) * 256 + (x1 - ox)), y * mw + x0);
      });
      // Bilinear between source cell centres; a sample touching a missing cell is NaN (transparent, no extrapolation).
      const r = resolutionFor(W, H), Wr = Math.round(W * r), Hr = Math.round(H * r), heights = new Float32Array(Wr * Hr);
      const xs = new Float64Array(Wr);
      for (let px = 0; px < Wr; px++) xs[px] = (gx0 + (px + 0.5) * W / Wr) * k - 0.5 - mx0;
      for (let py = 0; py < Hr; py++) {
        const sy = (gy0 + (py + 0.5) * H / Hr) * k - 0.5 - my0, j0 = Math.floor(sy), fy = sy - j0, row0 = j0 * mw, row1 = row0 + mw, out = py * Wr;
        for (let px = 0; px < Wr; px++) {
          const sx = xs[px], i0 = Math.floor(sx), fx = sx - i0;
          const a = mosaic[row0 + i0], b = mosaic[row0 + i0 + 1], c = mosaic[row1 + i0], d = mosaic[row1 + i0 + 1];
          heights[out + px] = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
        }
      }
      const mask = coverageMask(Wr, Hr, zoom, gx0, gy0, Wr / W);
      const mpp = 40075016.686 * Math.cos(center.lat * Math.PI / 180) / (256 * 2 ** zoom) * W / Wr;
      frame = {heights, mask, W, H, Wr, Hr, r: Wr / W, zoom, gx0, gy0, mpp, sourceZoom: sz, tiles: need.length};
      paint(); place();
      stats.rendered++;
      const missing = need.some(([x, y]) => failed.has(sz + '/' + x + '/' + y));
      emit(missing ? 'partial' : 'ready', {renderer: 'single-canvas', width: Wr, height: Hr});
    }
    function paint() {
      if (!frame || !canvas) return;
      const f = frame, rgba = renderTerrain(f.heights, f.Wr, f.Hr, f.mpp, {...current, theme, lineScale: f.r});
      const m = f.mask;
      for (let i = 0, a = 3; i < m.length; i++, a += 4) { const v = m[i]; if (v !== 255) rgba[a] = v ? rgba[a] * v / 255 : 0; }
      if (canvas.width !== f.Wr || canvas.height !== f.Hr) { canvas.width = f.Wr; canvas.height = f.Hr; }
      ctx.putImageData(new ImageData(rgba, f.Wr, f.Hr), 0, 0);
      canvas.style.width = f.W + 'px'; canvas.style.height = f.H + 'px';
    }
    // Keeps the last picture under the same ground while the map moves or zooms, until the next frame is ready.
    function place() {
      if (!frame || !canvas || !map) return;
      const s = 2 ** (map.getZoom() - frame.zoom), origin = map.getPixelOrigin();
      root.L.DomUtil.setTransform(canvas, root.L.point(frame.gx0 * s - origin.x, frame.gy0 * s - origin.y), s === 1 ? undefined : s);
    }
    const onMoveEnd = () => schedule(30);
    const Layer = root.L.Layer.extend({
      initialize(options) { root.L.setOptions(this, options); },
      onAdd(m) {
        map = m;
        canvas = document.createElement('canvas'); canvas.className = 'sila-terrain-surface';
        canvas.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none';
        canvas.setAttribute('aria-hidden', 'true');
        ctx = canvas.getContext('2d', {willReadFrequently: true});
        m.getPane(this.options.pane).appendChild(canvas);
        m.on('moveend resize', onMoveEnd); m.on('zoom viewreset', place);
        emit('loading', {scope: 'district:4001', overzoomIsVisualOnly: true});
        if (frame) { paint(); place(); }
        schedule(0);
      },
      onRemove(m) {
        seq++; clearTimeout(timer); timer = null;
        m.off('moveend resize', onMoveEnd); m.off('zoom viewreset', place);
        if (canvas) canvas.remove();
        canvas = ctx = null; map = null; emit('removed');
      }
    });
    const layer = new Layer({pane, attribution: source.attribution});
    layer.refresh = () => { paint(); return layer; };
    layer.setStyle = next => { current = {...current, ...next}; if (next.colors) current.lut = rampLUT(next.colors); return layer.refresh(); };
    layer.getStyle = () => ({...current, lut: undefined});
    /* Heights actually drawn in the given view: 0.5/99.5 percentiles for colour, 1/99 for relief (as in CityMETER). */
    layer.measureRange = viewBounds => {
      if (!frame) return null;
      const [w, s, e, n] = viewBounds, f = frame, scale = 256 * 2 ** f.zoom;
      const x0 = Math.max(0, Math.floor((projectX(w, scale) - f.gx0) * f.r)), x1 = Math.min(f.Wr - 1, Math.ceil((projectX(e, scale) - f.gx0) * f.r));
      const y0 = Math.max(0, Math.floor((projectY(n, scale) - f.gy0) * f.r)), y1 = Math.min(f.Hr - 1, Math.ceil((projectY(s, scale) - f.gy0) * f.r));
      const step = Math.max(1, Math.round(4 * f.r)), values = [];
      for (let y = y0 + (step >> 1); y <= y1; y += step) for (let x = x0 + (step >> 1); x <= x1; x += step) {
        const i = y * f.Wr + x; if (f.mask[i] < 128) continue;
        const v = f.heights[i]; if (v === v) values.push(v);
      }
      if (values.length < 16) return null;
      values.sort((a, b) => a - b);
      const quantiles = Array.from({length: 101}, (_, k) => percentile(values, 0.005 + 0.99 * k / 100));
      return {lo: percentile(values, 0.005), hi: percentile(values, 0.995), q01: percentile(values, 0.01), q99: percentile(values, 0.99), quantiles, samples: values.length};
    };
    layer.getSourceContract = () => ({...source, districtCode: '4001', noData: 'transparent', quantitativeFloodModel: false});
    layer.setTheme = value => { theme = value === 'dark' ? 'dark' : 'light'; return layer.refresh(); };
    layer.getFrameInfo = () => frame && {width: frame.Wr, height: frame.Hr, cssWidth: frame.W, cssHeight: frame.H, zoom: frame.zoom, sourceZoom: frame.sourceZoom, tiles: frame.tiles};
    return layer;
  }
  const api = Object.freeze({createLayer, decodeHeight, defaultSource: DEFAULT_SOURCE, rampLUT,
    _test: {polygonsOf, bboxOf, pointInCoverage, intersectsBounds, tileBounds, projectToTile, clipCoverage, renderHillshade, renderTerrain, rampLUT, decodeImage}});
  root.SilaFabdem = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
