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
  function createLayer({coverage, source = DEFAULT_SOURCE, theme = 'light', pane = 'overlayPane', onStatus = () => {}} = {}) {
    if (!root.L) throw new Error('Leaflet must be loaded first');
    if (!coverage || !coverage.properties || coverage.properties.district_code !== '4001') throw new Error('Only verified district 4001 is supported');
    source = {...DEFAULT_SOURCE, ...source, tiles: source.tileUrl || source.tiles || DEFAULT_SOURCE.tiles};
    if (source.tiles !== DEFAULT_SOURCE.tiles || source.maxNativeZoom !== 12) throw new Error('Unverified terrain source contract');
    const polygons = polygonsOf(coverage), bounds = bboxOf(polygons), active = new Map();
    const stats = {requested: 0, rendered: 0, skipped: 0, errors: 0, pending: 0};
    let generation = 0;
    const emit = (state, detail = {}) => { try { onStatus({state, ...stats, source: source.dataset, maxNativeZoom: 12, ...detail}); } catch (_) {} };
    const Layer = root.L.GridLayer.extend({
      createTile(coords, done) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const tileKey = `${coords.z}/${coords.x}/${coords.y}`, seq = generation;
        const rect = tileBounds(coords);
        if (coords.z > 12 || coords.z < 0 || !intersectsBounds(rect, polygons)) {
          stats.skipped++; queueMicrotask(() => done(null, canvas)); return canvas;
        }
        const controller = new AbortController(); active.set(canvas, controller);
        stats.requested++; stats.pending++; emit('loading');
        const url = source.tiles.replace('{z}', coords.z).replace('{x}', coords.x).replace('{y}', coords.y);
        (async () => {
          let bitmap;
          try {
            const response = await fetch(url, {mode: 'cors', credentials: 'omit', signal: controller.signal, cache: 'no-store'});
            if (!response.ok) throw new Error(`Terrain tile HTTP ${response.status}`);
            const blob = await response.blob();
            bitmap = await createImageBitmap(blob, {premultiplyAlpha: 'none', colorSpaceConversion: 'none'});
            if (bitmap.width !== 256 || bitmap.height !== 256) throw new Error('Unexpected DEM tile dimensions');
            if (seq !== generation || controller.signal.aborted) return;
            ctx.drawImage(bitmap, 0, 0); bitmap.close(); bitmap = null;
            const input = ctx.getImageData(0, 0, 256, 256);
            const midLat = (rect[1] + rect[3]) / 2;
            const metres = 40075016.686 * Math.cos(midLat * Math.PI / 180) / (2 ** coords.z * 256);
            const output = new ImageData(renderHillshade(input.data, 256, 256, metres, theme), 256, 256);
            const scratch = document.createElement('canvas'); scratch.width = scratch.height = 256;
            scratch.getContext('2d').putImageData(output, 0, 0);
            ctx.clearRect(0, 0, 256, 256); ctx.save(); clipCoverage(ctx, polygons, coords, 256); ctx.drawImage(scratch, 0, 0); ctx.restore();
            stats.rendered++; done(null, canvas);
          } catch (error) {
            ctx.clearRect(0, 0, 256, 256);
            if (error.name !== 'AbortError' && seq === generation) { stats.errors++; emit('error', {message: error.message, tile: tileKey}); }
            done(null, canvas);
          } finally {
            if (bitmap) bitmap.close(); active.delete(canvas); stats.pending = Math.max(0, stats.pending - 1);
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
    const layer = new Layer({pane, tileSize: 256, maxNativeZoom: 12, minNativeZoom: 0, minZoom: 0, maxZoom: 22,
      bounds: [[bounds[1], bounds[0]], [bounds[3], bounds[2]]], noWrap: true, updateWhenIdle: true,
      keepBuffer: 0, opacity: 1, attribution: source.attribution});
    layer.on('tileunload', event => { const c = active.get(event.tile); if (c) c.abort(); });
    layer.getSourceContract = () => ({...source, districtCode: '4001', noData: 'transparent', quantitativeFloodModel: false});
    layer.setTheme = value => { theme = value === 'dark' ? 'dark' : 'light'; generation++; for (const c of active.values()) c.abort(); return layer.redraw(); };
    return layer;
  }
  const api = Object.freeze({createLayer, decodeHeight, defaultSource: DEFAULT_SOURCE,
    _test: {polygonsOf, bboxOf, pointInCoverage, intersectsBounds, tileBounds, projectToTile, clipCoverage, renderHillshade}});
  root.SilaFabdem = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
