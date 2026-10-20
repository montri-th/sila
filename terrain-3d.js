/* True-elevation FABDEM terrain in MapLibre (revision 1.9, module 2.0.0), after the CityMETER terrain viewer.
 * MapLibre draws the surface itself: raster-dem terrain with its own level-of-detail mesh, color-relief height
 * colour, contour lines and relief shading, with the base map draped onto the surface. Tiles come from a Web Worker
 * (terrain-dem-worker.js) through custom protocols, so decoding, the Catmull-Rom overzoom (zoom 12 -> 14), shading
 * and contouring stay off the main thread.
 * Revision 1.8 drew its own mesh (257 x 257 vertices per tile, about 1.1 million triangles in the default view),
 * copied the whole frame into a texture on every frame and decoded tiles on the main thread; that made it stutter.
 * Height colour, contours and relief statistics remain FABDEM-only and inside the district coverage; outside it
 * they are absent, never zero. No DEM is rehosted or persisted.
 */
(function (root) {
  'use strict';
  const VERSION = '2.0.0';
  const NATIVE_ZOOM = 12, DEM_MAX_ZOOM = 14, SENTINEL = -9999;
  const scriptBase = root.document ? new URL('.', document.currentScript?.src || location.href) : null;
  const helpers = () => root.SilaFabdem?._test || (typeof require === 'function' ? require('./fabdem-layer.js')._test : null);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mercator = ([lng, lat]) => [(lng + 180) / 360, (1 - Math.asinh(Math.tan(clamp(lat, -85.0511287798066, 85.0511287798066) * Math.PI / 180)) / Math.PI) / 2];
  const lonlat = ([x, y]) => [x * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI];
  /* Vertical exaggeration follows the CityMETER terrain viewer: 0.5x to 50x on a logarithmic slider,
     values under 10 kept to one decimal, and an automatic mode that makes the in-view relief
     (1st to 99th percentile of sampled heights) a set share of the view width (default 15%). */
  const EX_MIN = 0.5, EX_MAX = 50, EX_LOG = Math.log(EX_MAX / EX_MIN);
  const roundEx = v => v < 10 ? Math.round(10 * v) / 10 : Math.round(v);
  const sliderToEx = v => roundEx(EX_MIN * Math.exp(EX_LOG * clamp(Number(v) || 0, 0, 1000) / 1000));
  const exToSlider = ex => Math.round(1000 * Math.log(clamp(Number(ex) || 1, EX_MIN, EX_MAX) / EX_MIN) / EX_LOG);
  const autoValue = (relief, widthM, target = .15, lo = 1, hi = EX_MAX) => relief != null && relief >= .5 && widthM > 0 ? roundEx(clamp(target * widthM / relief, lo, hi)) : null;
  const haversine = (a, b) => { const o = Math.PI / 180; return 12742017.6 * Math.asin(Math.min(1, Math.sqrt(Math.sin((b[1] - a[1]) * o / 2) ** 2 + Math.cos(a[1] * o) * Math.cos(b[1] * o) * Math.sin((b[0] - a[0]) * o / 2) ** 2))); };
  /* North up, always (owner decision 20 Oct 2026): any stored bearing is ignored; tilt is kept. */
  function cameraIn(camera = {}) {
    const c = camera.center || [102.83, 16.49];
    return {center:Array.isArray(c) ? c : [c.lng, c.lat], zoom:clamp(Number(camera.zoom ?? 12) - 1, 7, 21), pitch:clamp(Number(camera.pitch ?? 55), 0, 75), bearing:0};
  }
  function cameraOut(map) { const c = map.getCenter(); return {center:[c.lng, c.lat], zoom:map.getZoom() + 1, pitch:map.getPitch(), bearing:map.getBearing()}; }
  function features(value) {
    if (!value) return [];
    if (value.type === 'FeatureCollection') return value.features || [];
    return [value.type === 'Feature' ? value : {type:'Feature', properties:{}, geometry:value}];
  }
  function polygons(value) { return features(value).flatMap(f => f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : []); }
  /* Dim everything outside the municipality: a world polygon with the municipality as holes (plus its own holes). */
  function maskFeatures(municipality) {
    const ps = polygons(municipality); if (!ps.length) return {type:'FeatureCollection', features:[]};
    const orient = (ring, ccw) => { let a = 0; for (let i = 1; i < ring.length; i++) a += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1]; return (a > 0) === ccw ? ring : [...ring].reverse(); };
    const world = [[-179, -84], [179, -84], [179, 84], [-179, 84], [-179, -84]];
    const fs = [{type:'Feature', properties:{}, geometry:{type:'Polygon', coordinates:[world, ...ps.map(p => orient(p[0], false))]}}];
    for (const p of ps) for (const hole of p.slice(1)) fs.push({type:'Feature', properties:{}, geometry:{type:'Polygon', coordinates:[orient(hole, true)]}});
    return {type:'FeatureCollection', features:fs};
  }
  const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  /* Colour at position t along the palette: the same piecewise-linear rule as SilaFabdem.rampLUT (2D map). */
  function paletteAt(colors, t) {
    const st = colors.map(hexRGB), x = clamp(t, 0, 1) * (st.length - 1), k = Math.min(st.length - 2, Math.floor(x)), f = x - k;
    return `rgb(${[0, 1, 2].map(c => Math.round(st[k][c] + (st[k + 1][c] - st[k][c]) * f)).join(',')})`;
  }
  /* Height -> colour position, as in the 2D renderer: linear in metres between lo and hi, or equal area through the
     101 in-view percentiles. */
  function tOf(s, h) {
    const q = s.mapping === 'equalize' && Array.isArray(s.quantiles) && s.quantiles.length === 101 ? s.quantiles : null;
    if (!q) return clamp((h - s.lo) / Math.max(1e-9, s.hi - s.lo), 0, 1);
    if (h <= q[0]) return 0; if (h >= q[100]) return 1;
    let a = 0, b = 100;
    while (b - a > 1) { const m = (a + b) >> 1; if (q[m] <= h) a = m; else b = m; }
    return (a + (q[b] > q[a] ? (h - q[a]) / (q[b] - q[a]) : 0)) / 100;
  }
  /* MapLibre color-relief expression. The strict DEM writes -9999 where a height is absent (outside the district or
     no data): that stays transparent. Bands use one colour per contour band (taken at the band's middle height). */
  function reliefColorExpression(s) {
    if (!s || !Array.isArray(s.colors) || s.colors.length < 2 || !(s.hi > s.lo)) return null;
    const T = 'rgba(0,0,0,0)', expr = ['interpolate', ['linear'], ['elevation'], SENTINEL, T, SENTINEL + 1, T];
    const stops = [], q = s.mapping === 'equalize' && Array.isArray(s.quantiles) && s.quantiles.length === 101 ? s.quantiles : null;
    if (s.bands > 0 && (s.hi - s.lo) / s.bands <= 240) {
      const band = s.bands, eps = Math.min(0.01, band / 100);
      for (let b = Math.floor(s.lo / band) * band; b < s.hi; b += band) { const c = paletteAt(s.colors, tOf(s, b + band / 2)); stops.push([b, c], [b + band - eps, c]); }
    } else if (q) for (let k = 0; k <= 100; k++) stops.push([q[k], paletteAt(s.colors, k / 100)]);
    else { const n = (s.colors.length - 1) * 4; for (let i = 0; i <= n; i++) stops.push([s.lo + i / n * (s.hi - s.lo), paletteAt(s.colors, i / n)]); }
    if (!stops.length) return null;
    let last = SENTINEL + 2; expr.push(last, stops[0][1]);
    for (const [h, c] of stops) if (Number.isFinite(h) && h > last) { expr.push(h, c); last = h; }
    return expr;
  }
  const stepKey = v => String(Math.round(v * 10000) / 10000);
  const contourUrl = s => `silacontour://{z}/{x}/{y}?minor=${stepKey(s.interval > 0 ? s.interval : 1)}&ratio=${Math.max(1, Math.round(s.major || 5))}`;
  /* Shading slope factor: a power of two near the vertical exaggeration, so shading follows the exaggerated shape
     (the 1.8 mesh lit its exaggerated geometry). Few distinct values, so the slider rarely rebuilds shading tiles. */
  const shadeK = ex => clamp(2 ** Math.round(Math.log2(Math.max(1, Number(ex) || 1))), 1, 64);
  const demUrl = kind => `siladem://${kind}/{z}/{x}/{y}`;
  const hillUrl = (k, theme) => `siladem://hill/{z}/{x}/{y}?k=${k}&t=${theme === 'light' ? 'light' : 'dark'}`;

  let runtimePromise, activeClient = null;
  async function runtime() {
    if (!runtimePromise) runtimePromise = import(new URL('vendor/maplibre-gl/maplibre-gl.mjs', scriptBase).href).then(m => {
      m.setWorkerUrl(new URL('vendor/maplibre-gl/maplibre-gl-worker.mjs', scriptBase).href);
      // Protocols are page-global; they route to the terrain instance that is alive.
      m.addProtocol('siladem', (params, abort) => activeClient ? activeClient.dem(params.url, abort) : Promise.reject(new Error('3D terrain is not active')));
      m.addProtocol('silacontour', (params, abort) => activeClient ? activeClient.contour(params.url, abort) : Promise.reject(new Error('3D terrain is not active')));
      return m;
    }).catch(e => { runtimePromise = null; throw e; });
    return runtimePromise;
  }
  function makeClient(url, init) {
    const worker = new Worker(url);
    const jobs = new Map(), stats = {inflight:0, requested:0, servedSurface:0, servedColour:0, servedContours:0, errors:0};
    let seq = 0, onChange = () => {};
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The terrain worker did not start')), 15000);
      worker.onmessage = (event) => {
        const d = event.data;
        if (d.type === 'init') { clearTimeout(timer); if (d.ok) resolve(); else reject(new Error(d.reason || 'The terrain worker is unavailable')); return; }
        const job = jobs.get(d.id); if (!job) return;
        jobs.delete(d.id); stats.inflight--;
        if (d.error) { stats.errors++; job.reject(new Error(d.error)); }
        else { if (job.kind === 'geom') stats.servedSurface++; else if (job.kind === 'strict') stats.servedColour++; else if (job.kind === 'contour') stats.servedContours++; job.resolve(d); }
        onChange();
      };
      worker.onerror = (event) => { clearTimeout(timer); reject(new Error(event.message || 'The terrain worker failed')); };
    });
    ready.catch(() => {});
    worker.postMessage({type:'init', ...init});
    function call(msg, kind, abort) {
      return new Promise((resolve, reject) => {
        const id = ++seq;
        jobs.set(id, {resolve, reject, kind}); stats.inflight++; stats.requested++; onChange();
        abort?.signal?.addEventListener('abort', () => {
          if (!jobs.delete(id)) return;
          stats.inflight--; worker.postMessage({type:'abort', id}); onChange();
          reject(new DOMException('Aborted', 'AbortError'));
        }, {once:true});
        worker.postMessage({...msg, id});
      });
    }
    return {
      ready, stats,
      set onChange(fn) { onChange = typeof fn === 'function' ? fn : () => {}; },
      dem(u, abort) {
        const m = /^siladem:\/\/(geom|strict|hill)\/(\d+)\/(\d+)\/(\d+)(?:\?k=(\d+)&t=(light|dark))?/.exec(u);
        if (!m) return Promise.reject(new Error('Unknown terrain tile'));
        return call({type:'tile', kind:m[1], z:+m[2], x:+m[3], y:+m[4], k:+(m[5] || 1), theme:m[6] || 'dark'}, m[1], abort).then(d => ({data:d.bitmap}));
      },
      contour(u, abort) {
        const m = /^silacontour:\/\/(\d+)\/(\d+)\/(\d+)\?minor=([\d.]+)&ratio=(\d+)/.exec(u);
        if (!m) return Promise.reject(new Error('Unknown contour tile'));
        return call({type:'contour', z:+m[1], x:+m[2], y:+m[3], minor:+m[4], ratio:+m[5]}, 'contour', abort).then(d => ({data:d.buffer}));
      },
      sample(points) { return call({type:'sample', points}, 'sample').then(d => d.stats); },
      terminate() { worker.terminate(); for (const j of jobs.values()) j.reject(new Error('3D terrain was removed')); jobs.clear(); stats.inflight = 0; }
    };
  }

  async function create(options) {
    if (!options?.container || !options.source || !options.coverage) throw new Error('3D terrain requires container, source and actual district coverage');
    const h = helpers(); if (!h) throw new Error('Load fabdem-layer.js before terrain-3d.js');
    if (options.coverage.properties?.district_code !== '4001') throw new Error('Only district4001 FABDEM coverage is allowed');
    const source = options.source, district = h.polygonsOf(options.coverage), bbox = h.bboxOf(district);
    if (source.maxNativeZoom !== 12 || source.encoding !== 'terrarium' || !/^https:\/\/landometer\.com\/api\/v2\/public\/dem\/z12-20261007\/fabdem\//.test(source.tileUrl || source.tiles || '')) throw new Error('Unexpected external FABDEM source contract');
    if (typeof Worker !== 'function') throw new Error('This browser cannot run the terrain worker');
    const ml = await runtime();
    const client = makeClient(new URL('terrain-dem-worker.js?v=' + VERSION, scriptBase), {template:source.tileUrl || source.tiles, polygons:district, bbox});
    try { await client.ready; } catch (error) { client.terminate(); throw error; }
    activeClient = client;
    let theme = options.theme === 'light' ? 'light' : 'dark', mode = options.basemap || 'street', destroyed = false, hidden = false, readyDone = false;
    let exaggeration = clamp(Number(options.exaggeration) || 1, EX_MIN, EX_MAX), currentK = shadeK(exaggeration);
    let boundary = options.boundary, municipality = options.municipality, tokens = options.tokens;
    let boundaryKey = JSON.stringify([boundary, municipality]);
    if (!tokens) try { tokens = await fetch(new URL('reference/design-tokens.json', scriptBase)).then(r => r.json()); } catch (_) { tokens = {}; }
    const token = (key, fallback) => tokens?.foundation?.[key]?.[theme] || fallback;
    const canvasColour = () => token('surface.canvas', theme === 'light' ? '#F6F7F3' : '#11191D');
    const strokeColour = () => tokens?.map?.activeLayer?.[theme] || (theme === 'light' ? '#347DA8' : '#65B6DB');
    // Height colour and contours (revision 1.8 rules). Colours arrive as a palette from the host; nothing is invented here.
    let surface = {colorOn:false, colors:null, lo:0, hi:1, opacity:.85, interval:0, major:5, bands:0, mapping:'linear', quantiles:null};
    const colourShown = () => !!(surface.colorOn && reliefColorExpression(surface));
    // Over the height colours (same HEX in both themes) contours use one dark ink in both themes; with shading only they follow the theme.
    const inkLines = () => colourShown() || theme === 'light';
    const streetStyles = {}, streetFailed = {};
    const statuses = {demErrors:0, basemapErrors:0};
    let resolveReady, rejectReady; const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; }); ready.catch(() => {});
    let lastStatus = '', lastEmission = null, lastRelief = null, reliefSeq = 0, reliefTimer = 0, statusFrame = 0, exFrame = 0, map;

    const streetUrl = () => root.SilaBasemap?.styles?.[theme] || (theme === 'light' ? 'https://tiles.openfreemap.org/styles/liberty' : 'https://tiles.openfreemap.org/styles/dark');
    async function fetchStreetStyle(forTheme) {
      if (streetStyles[forTheme]) return streetStyles[forTheme];
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 10000);
      try {
        const response = await fetch(streetUrl(), {signal:abort.signal, mode:'cors'});
        if (!response.ok) throw new Error('Street style HTTP' + response.status);
        const json = await response.json();
        if (!json || json.version !== 8 || !Array.isArray(json.layers)) throw new Error('Street style is not a MapLibre style');
        streetStyles[forTheme] = json; delete streetFailed[forTheme];
        return json;
      } catch (_) { streetFailed[forTheme] = true; return null; }
      finally { clearTimeout(timer); }
    }
    function baseStyle() {
      const background = {id:'background', type:'background', paint:{'background-color':canvasColour()}};
      if (mode === 'street') return streetStyles[theme] || {version:8, sources:{}, layers:[background]};
      const p = root.SilaBasemap?.satelliteProviders?.[mode === 'satellite-archive' ? 'eox2016' : 'googleCitychat'];
      if (mode === 'none' || !p) return {version:8, sources:{}, layers:[background]};
      return {version:8, sources:{imagery:{type:'raster', tiles:[p.tileUrl], tileSize:256, minzoom:p.minNativeZoom, maxzoom:p.maxNativeZoom, attribution:p.attribution}}, layers:[background, {id:'imagery', type:'raster', source:'imagery', paint:{'raster-fade-duration':0}}]};
    }
    const dem = kind => ({type:'raster-dem', tiles:[demUrl(kind)], tileSize:256, encoding:'terrarium', minzoom:0, maxzoom:DEM_MAX_ZOOM});
    const visible = on => on ? 'visible' : 'none';
    function linePaint(major) {
      const ink = inkLines(), alpha = ink ? 1 : .7;
      return {'line-color':ink ? '#182327' : '#F1F4EF', 'line-opacity':(major ? .85 : .5) * alpha,
        'line-width':major ? ['interpolate', ['linear'], ['zoom'], 10, .9, 16, 1.8] : ['interpolate', ['linear'], ['zoom'], 10, .5, 16, 1.1]};
    }
    function ourLayers() {
      const expr = reliefColorExpression(surface) || ['interpolate', ['linear'], ['elevation'], SENTINEL, 'rgba(0,0,0,0)', SENTINEL + 1, 'rgba(0,0,0,0)'];
      return [
        {id:'sila-colour', type:'color-relief', source:'sila-dem-colour', layout:{visibility:visible(colourShown())}, paint:{'color-relief-color':expr, 'color-relief-opacity':Number.isFinite(surface.opacity) ? surface.opacity : .85, resampling:'nearest'}},
        // Neutral relief light from the north-west (azimuth 315, altitude 45), the 2D hillshade rule, drawn by the worker.
        {id:'sila-shade', type:'raster', source:'sila-shade', paint:{'raster-opacity':1, 'raster-fade-duration':0, 'raster-resampling':'linear'}},
        {id:'sila-contour-minor', type:'line', source:'sila-contours', 'source-layer':'contours', filter:['==', ['get', 'level'], 0], layout:{visibility:visible(surface.interval > 0), 'line-join':'round', 'line-cap':'round'}, paint:linePaint(false)},
        {id:'sila-contour-major', type:'line', source:'sila-contours', 'source-layer':'contours', filter:['>=', ['get', 'level'], 1], layout:{visibility:visible(surface.interval > 0), 'line-join':'round', 'line-cap':'round'}, paint:linePaint(true)},
        {id:'sila-outside', type:'fill', source:'sila-outside', paint:{'fill-color':theme === 'light' ? '#FFFFFF' : '#11191D', 'fill-opacity':.72}},
        {id:'sila-boundary-line', type:'line', source:'sila-boundary', layout:{'line-join':'round'}, paint:{'line-color':strokeColour(), 'line-width':2}}
      ];
    }
    function composeStyle() {
      const base = baseStyle(), layers = (base.layers || []).filter(l => !String(l.id).startsWith('sila-'));
      const firstSymbol = layers.findIndex(l => l.type === 'symbol');
      layers.splice(firstSymbol < 0 ? layers.length : firstSymbol, 0, ...ourLayers());
      const canvas = canvasColour();
      return {...base, projection:{type:'mercator'},
        sources:{...base.sources, 'sila-dem-terrain':dem('geom'), 'sila-dem-colour':dem('strict'),
          'sila-shade':{type:'raster', tiles:[hillUrl(currentK, theme)], tileSize:256, minzoom:0, maxzoom:DEM_MAX_ZOOM},
          'sila-contours':{type:'vector', tiles:[contourUrl(surface)], minzoom:10, maxzoom:DEM_MAX_ZOOM},
          'sila-outside':{type:'geojson', data:maskFeatures(municipality)}, 'sila-boundary':{type:'geojson', data:{type:'FeatureCollection', features:features(boundary || municipality)}}},
        layers, terrain:{source:'sila-dem-terrain', exaggeration},
        // Sky and horizon take the canvas colour; fog starts only at the horizon so height colours keep their HEX.
        sky:{'sky-color':canvas, 'horizon-color':canvas, 'fog-color':canvas, 'fog-ground-blend':1, 'horizon-fog-blend':.5, 'sky-horizon-blend':.5, 'atmosphere-blend':0}};
    }
    function basemapTilesLoaded() { try { return !!(map && map.isStyleLoaded() && map.areTilesLoaded()); } catch (_) { return false; } }
    function emit(state, extra = {}) {
      if (destroyed && state !== 'removed') return;
      const loaded = basemapTilesLoaded();
      const basemapState = mode === 'none' ? 'not_requested' : mode === 'street' && streetFailed[theme] && !streetStyles[theme] ? 'unavailable' : statuses.basemapErrors ? 'partial' : loaded ? 'ready' : 'loading';
      const s = client.stats;
      const result = {state, fatal:false, requested:s.requested, errors:statuses.demErrors, basemapErrors:statuses.basemapErrors, basemapTilesLoaded:loaded, basemapReady:loaded, basemapState,
        pending:s.inflight, rendered:s.servedSurface, colourTiles:s.servedColour, contourTiles:s.servedContours, nativeZoom:NATIVE_ZOOM, demMaxZoom:DEM_MAX_ZOOM, exaggeration,
        renderer:'maplibre-native-terrain', boundaryCellOmission:true, rawDEMRehosted:false, ...extra};
      lastEmission = result;
      const key = JSON.stringify(result); if (key !== lastStatus) { lastStatus = key; options.onStatus?.(result); }
    }
    function currentState() { return client.stats.inflight ? 'loading' : statuses.demErrors && !client.stats.servedSurface ? 'partial' : statuses.demErrors ? 'partial' : 'ready'; }
    client.onChange = () => { if (statusFrame || destroyed) return; statusFrame = requestAnimationFrame(() => { statusFrame = 0; if (!destroyed && readyDone) emit(currentState()); }); };
    function applyStyle() { if (!destroyed) map.setStyle(composeStyle()); }
    function upgradeStreet() {
      const wantTheme = theme;
      fetchStreetStyle(wantTheme).then(json => {
        if (destroyed || mode !== 'street' || theme !== wantTheme) return;
        if (!json) { statuses.basemapErrors++; emit(lastEmission?.state === 'error' ? 'error' : (lastEmission?.state || 'loading'), {message:'The street basemap could not load; the terrain surface stays visible'}); return; }
        applyStyle();
      });
    }
    function applySurface() {
      if (destroyed || !map.getLayer('sila-colour')) return;
      try {
        const expr = reliefColorExpression(surface);
        if (expr) map.setPaintProperty('sila-colour', 'color-relief-color', expr);
        map.setPaintProperty('sila-colour', 'color-relief-opacity', Number.isFinite(surface.opacity) ? surface.opacity : .85);
        map.setLayoutProperty('sila-colour', 'visibility', visible(colourShown()));
        for (const id of ['sila-contour-minor', 'sila-contour-major']) {
          map.setLayoutProperty(id, 'visibility', visible(surface.interval > 0));
          for (const [k, v] of Object.entries(linePaint(id.endsWith('major')))) map.setPaintProperty(id, k, v);
        }
        const src = map.getSource('sila-contours'), url = contourUrl(surface);
        if (surface.interval > 0 && src && src.tiles?.[0] !== url) src.setTiles([url]);
      } catch (_) { /* the style is being replaced; composeStyle carries the same surface */ }
    }
    /* Relief in the current view from a 24 x 24 grid of measured heights (strict FABDEM inside the district); unknown
       samples are skipped, never zero. Measured in the worker; the host reads the last result and hears about new ones. */
    function viewWidthM() {
      const box = map.getContainer(), w = box.clientWidth, hgt = box.clientHeight; if (!w || !hgt) return null;
      const a = map.unproject([0, hgt / 2]), b = map.unproject([w, hgt / 2]);
      return a && b ? haversine([a.lng, a.lat], [b.lng, b.lat]) : null;
    }
    async function refreshRelief() {
      if (destroyed || hidden) return;
      const box = map.getContainer(), w = box.clientWidth, hgt = box.clientHeight; if (!w || !hgt) return;
      const points = new Float64Array(24 * 24 * 2).fill(NaN); let k = 0;
      for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++, k += 2) { const p = map.unproject([(i + .5) / 24 * w, (j + .5) / 24 * hgt]); if (p) { points[k] = p.lng; points[k + 1] = p.lat; } }
      const widthM = viewWidthM(), seq = ++reliefSeq;
      let stats; try { stats = await client.sample(points); } catch (_) { return; }
      if (destroyed || seq !== reliefSeq) return;
      const next = {...stats, widthM}, prev = lastRelief, near = (a, b, e) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= e);
      lastRelief = next;
      if (!prev || !near(prev.relief, next.relief, .05) || !near(prev.lo, next.lo, .05) || !near(prev.hi, next.hi, .05) || !near(prev.widthM, next.widthM, 5)) options.onRelief?.(next);
    }
    const scheduleRelief = (delay = 180) => { clearTimeout(reliefTimer); reliefTimer = setTimeout(refreshRelief, delay); };
    function measureRelief() { return lastRelief ? {...lastRelief, quantiles:lastRelief.quantiles?.slice()} : {relief:null, widthM:map ? viewWidthM() : null, samples:0}; }

    map = new ml.Map({container:options.container, style:composeStyle(), ...cameraIn(options.camera), minZoom:7, maxZoom:21, maxPitch:75, renderWorldCopies:false, attributionControl:false,
      // Phones: at most 2 device pixels per CSS pixel; MSAA only on low-density screens. Both keep frames light.
      pixelRatio:Math.min(root.devicePixelRatio || 1, 2), canvasContextAttributes:{antialias:(root.devicePixelRatio || 1) < 2, preserveDrawingBuffer:false},
      maxBounds:[[bbox[0] - .15, bbox[1] - .15], [bbox[2] + .15, bbox[3] + .15]]});
    // North up, always: no compass (it would turn the map); tilt stays on right-drag, ctrl-drag, two fingers up/down, Shift+Up/Down.
    map.addControl(new ml.NavigationControl({showCompass:false}), 'top-right');
    try { map.dragRotate._mouseRotate?.disable?.(); } catch (_) { map.dragRotate.disable(); }
    map.touchZoomRotate.disableRotation();
    map.getContainer().addEventListener('keydown', e => { if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) e.stopImmediatePropagation(); }, {capture:true});
    map.on('rotateend', () => { if (!destroyed && Math.abs(map.getBearing()) > 1e-6) map.easeTo({bearing:0, duration:200}); });
    map.addControl(new ml.AttributionControl({compact:true, customAttribution:source.attribution}), 'bottom-right');
    const rejectTimer = setTimeout(() => { if (!readyDone && !destroyed) { const e = new Error('No valid 3D terrain surface became available'); emit('error', {fatal:true, message:e.message}); rejectReady(e); } }, 35000);
    if (mode === 'street' && !streetStyles[theme]) upgradeStreet();
    // Trackpad: a two-finger swipe that starts mostly sideways pans the view; an up/down swipe, a mouse wheel or a
    // pinch (ctrl+wheel) keeps MapLibre's zoom. The choice is held for the whole gesture so it never flips midway.
    { const el = map.getCanvasContainer(); let gesture = null, last = 0, dx = 0, dy = 0, raf = 0;
      el.addEventListener('wheel', e => {
        if (e.ctrlKey || e.deltaMode !== 0) { gesture = null; return; }
        const now = performance.now();
        if (!gesture || now - last > 220) gesture = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? 'pan' : 'zoom';
        last = now;
        if (gesture !== 'pan') return;
        e.preventDefault(); e.stopImmediatePropagation();
        dx += e.deltaX; dy += e.deltaY;
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (!destroyed && (dx || dy)) map.panBy([dx, dy], {duration:0}); dx = dy = 0; });
      }, {capture:true, passive:false}); }
    map.on('idle', () => {
      if (destroyed || hidden) return;
      if (!readyDone && client.stats.servedSurface > 0 && map.getTerrain()) { readyDone = true; clearTimeout(rejectTimer); emit(currentState(), {renderedFrame:true}); resolveReady(controller); scheduleRelief(0); return; }
      if (readyDone) emit(currentState(), {renderedFrame:true});
    });
    map.on('moveend', () => { if (destroyed) return; options.onCameraChange?.(cameraOut(map)); scheduleRelief(); });
    map.on('sourcedata', e => { if (!destroyed && e.sourceId === 'sila-dem-colour' && e.tile) scheduleRelief(400); });
    map.on('webglcontextlost', () => { const error = new Error('WebGL context lost'); emit('error', {fatal:true, message:error.message}); if (!readyDone) rejectReady(error); });
    map.on('error', event => {
      if (destroyed) return;
      const msg = event.error?.message || '';
      if (event.error?.name === 'AbortError' || /aborted/i.test(msg)) return;
      if (/^sila-(dem|contours|shade)/.test(event.sourceId || '')) statuses.demErrors++; else statuses.basemapErrors++;
      if (lastEmission?.state !== 'error') emit(lastEmission?.state || 'loading', {message:msg || 'A map resource did not load'});
    });
    const controller = {
      ready,
      getCamera:() => cameraOut(map),
      setCamera(camera) { if (!destroyed) map.jumpTo(cameraIn({...cameraOut(map), ...camera})); return controller; },
      setTheme(value) { const next = value === 'light' ? 'light' : 'dark'; if (next !== theme) { theme = next; applyStyle(); if (mode === 'street' && !streetStyles[theme]) upgradeStreet(); } return controller; },
      setBasemap(value, force = false) { const next = ['street','satellite','satellite-archive','none'].includes(value) ? value : 'street'; if (next !== mode || force) { mode = next; statuses.basemapErrors = 0; applyStyle(); if (mode === 'street' && !streetStyles[theme]) upgradeStreet(); } return controller; },
      setBoundaries(value = {}) {
        const nextKey = JSON.stringify([value.boundary, value.municipality]); if (nextKey === boundaryKey) return controller;
        boundaryKey = nextKey; boundary = value.boundary; municipality = value.municipality;
        try { map.getSource('sila-outside')?.setData(maskFeatures(municipality)); map.getSource('sila-boundary')?.setData({type:'FeatureCollection', features:features(boundary || municipality)}); } catch (_) {}
        return controller;
      },
      setExaggeration(value) {
        exaggeration = clamp(Number(value) || 1, EX_MIN, EX_MAX);
        if (!exFrame) exFrame = requestAnimationFrame(() => {
          exFrame = 0; if (destroyed) return;
          try {
            if (map.getTerrain()) map.setTerrain({source:'sila-dem-terrain', exaggeration});
            const k = shadeK(exaggeration);
            if (k !== currentK) { currentK = k; map.getSource('sila-shade')?.setTiles([hillUrl(k, theme)]); }
          } catch (_) { /* style reload in progress; composeStyle carries the new value */ }
          emit(readyDone ? currentState() : 'loading');
        });
        return controller;
      },
      measureRelief,
      setSurface(next = {}) { surface = {...surface, ...next}; applySurface(); return controller; },
      getState:() => ({version:VERSION, renderer:'maplibre-native-terrain', camera:cameraOut(map), basemapTilesLoaded:basemapTilesLoaded(), basemapState:lastEmission?.basemapState || 'loading', exaggeration, shadeFactor:currentK,
        nativeZoom:NATIVE_ZOOM, demMaxZoom:DEM_MAX_ZOOM, overzoom:'clamped_catmull_rom_in_worker', pending:client.stats.inflight, requested:client.stats.requested, surfaceTiles:client.stats.servedSurface,
        colourTiles:client.stats.servedColour, contourTiles:client.stats.servedContours, source:source.version, districtCode:'4001',
        noData:'colour_contours_relief_absent_outside_district_or_without_data; surface_gap_filled_from_nearest_measured_neighbours_only', edgePolicy:'strict_layers_omit_every_boundary_touched_pixel',
        basemapDrape:'maplibre_render_to_texture', rawDEMRehosted:false}),
      resize() { if (!destroyed) map.resize(); return controller; },
      show() { const wasHidden = hidden; hidden = false; options.container.hidden = false; if (wasHidden) { map.resize(); scheduleRelief(); } return controller; },
      hide() { hidden = true; options.container.hidden = true; return controller; },
      destroy() {
        if (destroyed) return;
        const camera = cameraOut(map); destroyed = true;
        clearTimeout(rejectTimer); clearTimeout(reliefTimer); if (statusFrame) cancelAnimationFrame(statusFrame); if (exFrame) cancelAnimationFrame(exFrame);
        map.remove(); if (activeClient === client) activeClient = null; client.terminate();
        emit('removed'); if (!readyDone) rejectReady(new Error('3D terrain was removed'));
        return camera;
      }
    };
    emit('loading');
    return controller;
  }
  const api = Object.freeze({version:VERSION, create, exaggeration:Object.freeze({min:EX_MIN, max:EX_MAX, defaultTarget:.15, roundEx, sliderToEx, exToSlider, autoValue}),
    _test:{haversine, autoValue, sliderToEx, exToSlider, mercator, lonlat, cameraIn, cameraOut, paletteAt, tOf, reliefColorExpression, contourUrl, shadeK, demUrl, hillUrl, maskFeatures, SENTINEL}});
  root.SilaTerrain3D = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
