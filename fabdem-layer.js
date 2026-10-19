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
    const interval = o.contourOn === false ? 0 : (o.interval > 0 ? o.interval : 0), major = interval * (o.major || 5), band = o.bands > 0 ? o.bands : 0;
    // Over the height colours, lines use the same dark ink in both themes, as the colours themselves do; with shading only they follow the theme.
    const ink = colour || !dark;
    const line = o.lineRGB || (ink ? [24, 35, 39] : [241, 244, 239]), opacity = Number.isFinite(o.opacity) ? o.opacity : 0.85;
    const alt = Math.PI / 4, az = 315 * Math.PI / 180, flat = Math.sin(alt);
    const light = [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)], shadeAlpha = dark ? 180 : 160;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x, h = heights[i];
      const l = heights[y * width + Math.max(0, x - 1)], r = heights[y * width + Math.min(width - 1, x + 1)];
      const t = heights[Math.max(0, y - 1) * width + x], b = heights[Math.min(height - 1, y + 1) * width + x];
      if (!(Number.isFinite(h) && Number.isFinite(l) && Number.isFinite(r) && Number.isFinite(t) && Number.isFinite(b))) continue;
      const dx = (r - l) / ((x === 0 || x === width - 1 ? 1 : 2) * mpp), dy = (t - b) / ((y === 0 || y === height - 1 ? 1 : 2) * mpp);
      const norm = Math.hypot(dx, dy, 1), illumination = Math.max(0, (-dx * light[0] - dy * light[1] + light[2]) / norm), delta = illumination - flat;
      const k = i * 4;
      let R, G, B, A;
      if (colour) {
        const hv = band ? (Math.floor(h / band) + 0.5) * band : h;   // banded: one colour per band, sampled at its middle
        const li = Math.round(tOf(hv) * 255) * 3, s2 = Math.min(1.2, Math.max(0.45, 1 + 1.4 * delta));
        R = lut[li] * s2; G = lut[li + 1] * s2; B = lut[li + 2] * s2; A = 255 * opacity;
      } else {
        R = G = B = delta >= 0 ? 255 : 0; A = Math.min(shadeAlpha, Math.abs(delta) * shadeAlpha * 1.6);
      }
      if (interval) {
        // Distance to the nearest contour in pixels: |h - nearest level| / |grad h| (both in metres per pixel).
        const g = Math.max(Math.hypot(dx, dy) * mpp, 1e-9), dMinor = Math.abs(h / interval - Math.round(h / interval)) * interval / g;
        const dMajor = Math.abs(h / major - Math.round(h / major)) * major / g;
        // Fade lines that would sit closer than about 2-5 px apart (steep banks), so dense steps never merge into a band.
        // Lines fade out where they would crowd: minor lines need about 10 px between them, major lines 8 px.
        const fadeMinor = Math.min(1, Math.max(0, (interval / g - 4) / 6)), fadeMajor = Math.min(1, Math.max(0, (major / g - 3) / 5));
        const a = Math.max(Math.min(1, Math.max(0, 1.0 - dMinor)) * 0.5 * fadeMinor, Math.min(1, Math.max(0, 1.5 - dMajor)) * 0.85 * fadeMajor) * (ink ? 1 : 0.7);
        if (a > 0) {
          const base = A / 255, la = a, outA = la + base * (1 - la);
          R = (line[0] * la + R * base * (1 - la)) / outA; G = (line[1] * la + G * base * (1 - la)) / outA; B = (line[2] * la + B * base * (1 - la)) / outA; A = outA * 255;
        }
      }
      out[k] = R; out[k + 1] = G; out[k + 2] = B; out[k + 3] = A;
    }
    return out;
  }
  function decodeImage(rgba) {
    const heights = new Float32Array(rgba.length / 4);
    for (let i = 0; i < heights.length; i++) { const k = i * 4, v = decodeHeight(rgba[k], rgba[k + 1], rgba[k + 2], rgba[k + 3]); heights[i] = v === null ? NaN : v; }
    return heights;
  }
  function percentile(sorted, q) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))] : null; }
  function createLayer({coverage, source = DEFAULT_SOURCE, theme = 'light', pane = 'overlayPane', style = {}, onStatus = () => {}} = {}) {
    if (!root.L) throw new Error('Leaflet must be loaded first');
    if (!coverage || !coverage.properties || coverage.properties.district_code !== '4001') throw new Error('Only verified district 4001 is supported');
    source = {...DEFAULT_SOURCE, ...source, tiles: source.tileUrl || source.tiles || DEFAULT_SOURCE.tiles};
    if (source.tiles !== DEFAULT_SOURCE.tiles || source.maxNativeZoom !== 12) throw new Error('Unverified terrain source contract');
    const polygons = polygonsOf(coverage), bounds = bboxOf(polygons), active = new Map(), natives = new Map();
    const stats = {requested: 0, rendered: 0, skipped: 0, errors: 0, pending: 0};
    let generation = 0, current = {...style};
    if (current.colors && !current.lut) current.lut = rampLUT(current.colors);
    const scratch = document.createElement('canvas'); scratch.width = scratch.height = 256;
    const emit = (state, detail = {}) => { try { onStatus({state, ...stats, source: source.dataset, maxNativeZoom: 12, ...detail}); } catch (_) {} };
    const tileUrl = c => source.tiles.replace('{z}', c.z).replace('{x}', c.x).replace('{y}', c.y);
    async function fetchHeights(c, signal) {
      const response = await fetch(tileUrl(c), {mode: 'cors', credentials: 'omit', signal, cache: 'no-store'});
      if (!response.ok) throw new Error(`Terrain tile HTTP ${response.status}`);
      const bitmap = await createImageBitmap(await response.blob(), {premultiplyAlpha: 'none', colorSpaceConversion: 'none'});
      try {
        if (bitmap.width !== 256 || bitmap.height !== 256) throw new Error('Unexpected DEM tile dimensions');
        const c2 = document.createElement('canvas'); c2.width = c2.height = 256;
        const ctx = c2.getContext('2d', {willReadFrequently: true}); ctx.drawImage(bitmap, 0, 0);
        return decodeImage(ctx.getImageData(0, 0, 256, 256).data);
      } finally { bitmap.close(); }
    }
    function nativeTile(x, y) {
      const key = x + '/' + y;
      if (natives.has(key)) { const e = natives.get(key); natives.delete(key); natives.set(key, e); return e; }
      const c = {z: 12, x, y};
      const e = intersectsBounds(tileBounds(c), polygons) ? fetchHeights(c).catch(() => null) : Promise.resolve(null);
      natives.set(key, e);
      while (natives.size > 64) natives.delete(natives.keys().next().value);
      return e;
    }
    async function resampled(c) {
      const s = 2 ** (c.z - 12), nx = Math.floor(c.x / s), ny = Math.floor(c.y / s), ox = (c.x - nx * s) * 256 / s, oy = (c.y - ny * s) * 256 / s;
      const span = 256 / s, needL = ox < 1, needR = ox + span > 255, needT = oy < 1, needB = oy + span > 255;
      const keys = [[0, 0]];
      if (needL) keys.push([-1, 0]); if (needR) keys.push([1, 0]); if (needT) keys.push([0, -1]); if (needB) keys.push([0, 1]);
      if (needL && needT) keys.push([-1, -1]); if (needR && needT) keys.push([1, -1]); if (needL && needB) keys.push([-1, 1]); if (needR && needB) keys.push([1, 1]);
      const tiles = new Map(await Promise.all(keys.map(async ([dx, dy]) => [dx + ',' + dy, await nativeTile(nx + dx, ny + dy)])));
      if (!tiles.get('0,0')) throw new Error('Native terrain tile unavailable');
      const H = (gi, gj) => { const tx = Math.floor(gi / 256), ty = Math.floor(gj / 256), t = tiles.get(tx + ',' + ty); return t ? t[(gj - ty * 256) * 256 + (gi - tx * 256)] : NaN; };
      const out = new Float32Array(256 * 256);
      for (let py = 0; py < 256; py++) {
        const fy = oy + (py + 0.5) / s - 0.5, j0 = Math.floor(fy), ty = fy - j0;
        for (let px = 0; px < 256; px++) {
          const fx = ox + (px + 0.5) / s - 0.5, i0 = Math.floor(fx), tx = fx - i0;
          const a = H(i0, j0), b = H(i0 + 1, j0), cc = H(i0, j0 + 1), d = H(i0 + 1, j0 + 1);
          out[py * 256 + px] = a + (b - a) * tx + (cc - a) * ty + (a - b - cc + d) * tx * ty;
        }
      }
      return out;
    }
    function paint(canvas) {
      const t = canvas._terrain; if (!t) return;
      const ctx = canvas.getContext('2d');
      scratch.getContext('2d').putImageData(new ImageData(renderTerrain(t.heights, 256, 256, t.mpp, {...current, theme}), 256, 256), 0, 0);
      ctx.clearRect(0, 0, 256, 256); ctx.save(); clipCoverage(ctx, polygons, t.coords, 256); ctx.drawImage(scratch, 0, 0); ctx.restore();
    }
    const Layer = root.L.GridLayer.extend({
      createTile(coords, done) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
        const tileKey = `${coords.z}/${coords.x}/${coords.y}`, seq = generation;
        const rect = tileBounds(coords);
        if (coords.z > 22 || coords.z < 0 || !intersectsBounds(rect, polygons)) {
          stats.skipped++; queueMicrotask(() => done(null, canvas)); return canvas;
        }
        const controller = new AbortController(); active.set(canvas, controller);
        stats.requested++; stats.pending++; emit('loading');
        (async () => {
          try {
            const heights = coords.z <= 12 ? await fetchHeights(coords, controller.signal) : await resampled(coords);
            if (seq !== generation || controller.signal.aborted) { done(null, canvas); return; }
            const midLat = (rect[1] + rect[3]) / 2;
            canvas._terrain = {heights, coords, mpp: 40075016.686 * Math.cos(midLat * Math.PI / 180) / (2 ** coords.z * 256), bounds: rect};
            paint(canvas);
            stats.rendered++; done(null, canvas);
          } catch (error) {
            canvas.getContext('2d').clearRect(0, 0, 256, 256);
            if (error.name !== 'AbortError' && seq === generation) { stats.errors++; emit('error', {message: error.message, tile: tileKey}); }
            done(null, canvas);
          } finally {
            active.delete(canvas); stats.pending = Math.max(0, stats.pending - 1);
            if (seq === generation) emit(stats.pending ? 'loading' : stats.errors ? 'partial' : 'ready');
          }
        })();
        return canvas;
      },
      onRemove(map) {
        generation++; for (const controller of active.values()) controller.abort(); active.clear();
        root.L.GridLayer.prototype.onRemove.call(this, map); emit('removed');
      },
      onAdd(map) {
        emit('loading', {scope: 'district:4001', overzoomIsVisualOnly: true});
        root.L.GridLayer.prototype.onAdd.call(this, map);
      }
    });
    const layer = new Layer({pane, tileSize: 256, maxNativeZoom: 22, minNativeZoom: 0, minZoom: 0, maxZoom: 22,
      bounds: [[bounds[1], bounds[0]], [bounds[3], bounds[2]]], noWrap: true, updateWhenIdle: true,
      keepBuffer: 0, opacity: 1, attribution: source.attribution});
    layer.on('tileunload', event => { const c = active.get(event.tile); if (c) c.abort(); });
    const tilesNow = () => Object.values(layer._tiles || {}).map(t => t.el).filter(el => el && el._terrain);
    layer.refresh = () => { for (const el of tilesNow()) paint(el); return layer; };
    layer.setStyle = next => { current = {...current, ...next}; if (next.colors) current.lut = rampLUT(next.colors); return layer.refresh(); };
    layer.getStyle = () => ({...current, lut: undefined});
    /* Heights actually drawn in the given view: 0.5/99.5 percentiles for colour, 1/99 for relief (as in CityMETER). */
    layer.measureRange = viewBounds => {
      const [w, s, e, n] = viewBounds, values = [];
      for (const el of tilesNow()) {
        const t = el._terrain, b = t.bounds;
        if (b[0] > e || b[2] < w || b[1] > n || b[3] < s) continue;
        const nz = 2 ** t.coords.z;
        for (let py = 2; py < 256; py += 4) {
          const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (t.coords.y + py / 256) / nz))) * 180 / Math.PI;
          if (lat < s || lat > n) continue;
          for (let px = 2; px < 256; px += 4) {
            const lon = (t.coords.x + px / 256) / nz * 360 - 180;
            if (lon < w || lon > e) continue;
            const v = t.heights[py * 256 + px];
            if (Number.isFinite(v) && pointInCoverage([lon, lat], polygons)) values.push(v);
          }
        }
      }
      if (values.length < 16) return null;
      values.sort((a, b) => a - b);
      const quantiles = Array.from({length: 101}, (_, k) => percentile(values, 0.005 + 0.99 * k / 100));
      return {lo: percentile(values, 0.005), hi: percentile(values, 0.995), q01: percentile(values, 0.01), q99: percentile(values, 0.99), quantiles, samples: values.length};
    };
    layer.getSourceContract = () => ({...source, districtCode: '4001', noData: 'transparent', quantitativeFloodModel: false});
    layer.setTheme = value => { theme = value === 'dark' ? 'dark' : 'light'; return layer.refresh(); };
    return layer;
  }
  const api = Object.freeze({createLayer, decodeHeight, defaultSource: DEFAULT_SOURCE, rampLUT,
    _test: {polygonsOf, bboxOf, pointInCoverage, intersectsBounds, tileBounds, projectToTile, clipCoverage, renderHillshade, renderTerrain, rampLUT, decodeImage}});
  root.SilaFabdem = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
