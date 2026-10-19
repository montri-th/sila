/* Inline, true-elevation FABDEM mesh. No DEM is rehosted or persisted.
 * Native MapLibre DEM ignores image alpha. This custom mesh therefore omits
 * every no-data cell and every cell touched by the actual district boundary.
 * A conservative transparent edge band is intentional, not measured flat land.
 */
(function (root) {
  'use strict';
  const CIRCUMFERENCE = 40075016.68557849;
  const NATIVE_ZOOM = 12;
  const VERSION = '1.0.0';
  const scriptBase = root.document ? new URL('.', document.currentScript?.src || location.href) : null;
  const helpers = () => root.SilaFabdem?._test || (typeof require === 'function' ? require('./fabdem-layer.js')._test : null);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mercator = ([lng, lat]) => [(lng + 180) / 360, (1 - Math.asinh(Math.tan(clamp(lat, -85.0511287798066, 85.0511287798066) * Math.PI / 180)) / Math.PI) / 2];
  const lonlat = ([x, y]) => [x * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI];
  const unitsPerMetre = lat => 1 / (CIRCUMFERENCE * Math.cos(lat * Math.PI / 180));
  const decode = (r, g, b, a) => a === 0 ? NaN : r * 256 + g + b / 256 - 32768;
  function translatedMatrix(matrix, origin) {
    const out = new Float32Array(matrix);
    for (let i = 0; i < 4; i++) out[12 + i] = matrix[i] * origin[0] + matrix[4 + i] * origin[1] + matrix[12 + i];
    return out;
  }
  function segmentsInTile(polygons, coords, grid, nativeSize) {
    const n = 2 ** coords.z, edges = [];
    for (const polygon of polygons) for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = mercator(ring[i]), b = mercator(ring[i + 1]);
        const p = [(a[0] * n - coords.x) * nativeSize - .5, (a[1] * n - coords.y) * nativeSize - .5];
        const q = [(b[0] * n - coords.x) * nativeSize - .5, (b[1] * n - coords.y) * nativeSize - .5];
        if (Math.max(p[0], q[0]) < 0 || Math.min(p[0], q[0]) > grid || Math.max(p[1], q[1]) < 0 || Math.min(p[1], q[1]) > grid) continue;
        edges.push([p, q]);
      }
    }
    return edges;
  }
  // Boundary-free connected cells have a constant polygon membership. Classify
  // one representative per component, rather than 65k point-in-polygon calls.
  function safeCells(polygons, coords, grid, h = helpers(), nativeSize = grid + 1) {
    const boundary = new Uint8Array(grid * grid), inside = new Uint8Array(grid * grid);
    for (const [a, b] of segmentsInTile(polygons, coords, grid, nativeSize)) {
      const x0 = clamp(Math.floor(Math.min(a[0], b[0]) - 1e-9), 0, grid - 1);
      const x1 = clamp(Math.floor(Math.max(a[0], b[0]) + 1e-9), 0, grid - 1);
      const y0 = clamp(Math.floor(Math.min(a[1], b[1]) - 1e-9), 0, grid - 1);
      const y1 = clamp(Math.floor(Math.max(a[1], b[1]) + 1e-9), 0, grid - 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        // Inclusive Liang–Barsky: cells merely touched by an edge are omitted.
        let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
        for (const [p, q] of [[-dx, a[0] - x], [dx, x + 1 - a[0]], [-dy, a[1] - y], [dy, y + 1 - a[1]]]) {
          if (p === 0) { if (q < 0) { t0 = 2; break; } continue; }
          const t = q / p; if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
          if (t0 > t1) break;
        }
        if (t0 <= t1) boundary[y * grid + x] = 1;
      }
    }
    const visited = new Uint8Array(grid * grid), queue = new Uint32Array(grid * grid), n = 2 ** coords.z;
    for (let seed = 0; seed < inside.length; seed++) {
      if (boundary[seed] || visited[seed]) continue;
      const x = seed % grid, y = Math.floor(seed / grid);
      const point = lonlat([(coords.x + (x + 1) / nativeSize) / n, (coords.y + (y + 1) / nativeSize) / n]);
      const included = h.pointInCoverage(point, polygons) ? 1 : 0;
      let head = 0, tail = 0; queue[tail++] = seed; visited[seed] = 1;
      while (head < tail) {
        const i = queue[head++], ix = i % grid, iy = Math.floor(i / grid); inside[i] = included;
        const next = []; if (ix) next.push(i - 1); if (ix + 1 < grid) next.push(i + 1); if (iy) next.push(i - grid); if (iy + 1 < grid) next.push(i + grid);
        for (const j of next) if (!boundary[j] && !visited[j]) { visited[j] = 1; queue[tail++] = j; }
      }
    }
    return {inside, boundary};
  }
  function buildMesh(rgba, width, height, coords, polygons, h = helpers(), nativeSize = width) {
    if (width !== height || width < 2 || rgba.length !== width * height * 4) throw new Error('Expected a square native DEM image');
    const grid = width - 1, cells = safeCells(polygons, coords, grid, h, nativeSize), n = 2 ** coords.z;
    const positions = new Float32Array(width * height * 3), heights = new Float64Array(width * height), validCells = new Uint8Array(grid * grid);
    let min = Infinity, max = -Infinity, validSamples = 0;
    for (let y = 0; y < height; y++) {
      const lat = lonlat([0, (coords.y + (y + .5) / nativeSize) / n])[1], scale = unitsPerMetre(lat);
      for (let x = 0; x < width; x++) {
        const i = y * width + x, k = i * 4, z = decode(rgba[k], rgba[k + 1], rgba[k + 2], rgba[k + 3]);
        heights[i] = z; positions[i * 3] = (x + .5) / nativeSize / n; positions[i * 3 + 1] = (y + .5) / nativeSize / n; positions[i * 3 + 2] = z * scale;
      }
    }
    const index = []; let omittedBoundaryCells = 0, omittedNoDataCells = 0;
    for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
      const cell = y * grid + x; if (cells.boundary[cell]) { omittedBoundaryCells++; continue; } if (!cells.inside[cell]) continue;
      const a = y * width + x, b = a + 1, c = a + width, d = c + 1;
      if (![a, b, c, d].every(i => Number.isFinite(heights[i]))) { omittedNoDataCells++; continue; }
      validCells[cell] = 1; index.push(a, c, b, b, c, d);
      for (const i of [a, b, c, d]) { min = Math.min(min, heights[i]); max = Math.max(max, heights[i]); validSamples++; }
    }
    return {positions, indices: new Uint32Array(index), heights, validCells, width, height, nativeSize, coords, origin:[coords.x / n, coords.y / n], triangles:index.length / 3, minHeight:min === Infinity ? null : min, maxHeight:max === -Infinity ? null : max, validSamples, omittedBoundaryCells, omittedNoDataCells};
  }
  function wantedTiles(bounds, polygons, h = helpers()) {
    const box = h.bboxOf(polygons), west = Math.max(box[0], bounds[0]), south = Math.max(box[1], bounds[1]), east = Math.min(box[2], bounds[2]), north = Math.min(box[3], bounds[3]);
    if (west > east || south > north) return [];
    const n = 2 ** NATIVE_ZOOM, lo = mercator([west, north]), hi = mercator([east, south]), out = [];
    for (let y = Math.floor(lo[1] * n); y <= Math.floor(hi[1] * n); y++) for (let x = Math.floor(lo[0] * n); x <= Math.floor(hi[0] * n); x++) {
      const c = {z:NATIVE_ZOOM, x, y}; if (h.intersectsBounds(h.tileBounds(c), polygons)) out.push(c);
    }
    return out;
  }
  function features(value) {
    if (!value) return [];
    if (value.type === 'FeatureCollection') return value.features || [];
    return [value.type === 'Feature' ? value : {type:'Feature', properties:{}, geometry:value}];
  }
  function polygons(value) { return features(value).flatMap(f => f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : []); }
  function cameraIn(camera = {}) {
    const c = camera.center || [102.83, 16.49];
    return {center:Array.isArray(c) ? c : [c.lng, c.lat], zoom:clamp(Number(camera.zoom ?? 12) - 1, 7, 21), pitch:clamp(Number(camera.pitch ?? 55), 0, 75), bearing:Number(camera.bearing || 0)};
  }
  function cameraOut(map) { const c = map.getCenter(); return {center:[c.lng, c.lat], zoom:map.getZoom() + 1, pitch:map.getPitch(), bearing:map.getBearing()}; }
  let runtimePromise;
  async function runtime() {
    if (!runtimePromise) runtimePromise = import(new URL('vendor/maplibre-gl/maplibre-gl.mjs', scriptBase).href).then(m => { m.setWorkerUrl(new URL('vendor/maplibre-gl/maplibre-gl-worker.mjs', scriptBase).href); return m; }).catch(e => { runtimePromise = null; throw e; });
    return runtimePromise;
  }
  const VS = `#version 300 es
    precision highp float;
    in vec3 a_pos; uniform mat4 u_matrix; uniform float u_exaggeration;
    out vec3 v_local; out vec4 v_base;
    void main(){ v_local=vec3(a_pos.xy,a_pos.z*u_exaggeration); v_base=u_matrix*vec4(a_pos.xy,0.0,1.0); gl_Position=u_matrix*vec4(v_local,1.0); }`;
  const FS = `#version 300 es
    precision highp float;
    in vec3 v_local; in vec4 v_base; uniform sampler2D u_base; uniform bool u_hasBase; uniform bool u_line; uniform vec3 u_neutral; uniform vec3 u_stroke;
    out vec4 outColor;
    void main(){ if(u_line){outColor=vec4(u_stroke,1.0);return;}
      vec3 n=normalize(cross(dFdx(v_local),dFdy(v_local))); if(n.z<0.0)n=-n;
      float illumination=0.73+0.27*max(0.0,dot(n,normalize(vec3(-0.5,-0.5,1.0))));
      vec2 uv=v_base.xy/v_base.w*0.5+0.5; vec3 base=u_neutral;
      if(u_hasBase && v_base.w>0.0 && all(greaterThanEqual(uv,vec2(0.0))) && all(lessThanEqual(uv,vec2(1.0))))base=texture(u_base,uv).rgb;
      outColor=vec4(base*illumination,1.0); }`;
  function shader(gl, type, source) { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const message = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(message || 'Terrain shader failed'); } return s; }
  function colour(hex) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); }
  async function create(options) {
    if (!options?.container || !options.source || !options.coverage) throw new Error('Inline3D requires container, source and actual district coverage');
    const h = helpers(); if (!h) throw new Error('Load fabdem-layer.js before terrain-3d.js');
    if (options.coverage.properties?.district_code !== '4001') throw new Error('Only district4001 FABDEM coverage is allowed');
    const source = options.source, district = h.polygonsOf(options.coverage), bbox = h.bboxOf(district);
    if (source.maxNativeZoom !== 12 || source.encoding !== 'terrarium' || !/^https:\/\/landometer\.com\/api\/v2\/public\/dem\/z12-20261007\/fabdem\//.test(source.tileUrl || source.tiles || '')) throw new Error('Unexpected external FABDEM source contract');
    const ml = await runtime();
    let theme = options.theme === 'light' ? 'light' : 'dark', mode = options.basemap || 'street', destroyed = false, hidden = false, exaggeration = 1, readyDone = false, styleReady = false, styleGeneration = 0;
    let boundary = options.boundary, municipality = options.municipality, tokens = options.tokens;
    let boundaryKey = JSON.stringify([boundary,municipality]), styleTimer;
    if (!tokens) try { tokens = await fetch(new URL('reference/design-tokens.json', scriptBase)).then(r => r.json()); } catch (_) { tokens = {}; }
    const token = (key, fallback) => tokens?.foundation?.[key]?.[theme] || fallback;
    const neutral = () => colour(token('surface.alt', theme === 'light' ? '#EEF1EE' : '#172126'));
    const stroke = () => colour(tokens?.map?.activeLayer?.[theme] || (theme === 'light' ? '#347DA8' : '#65B6DB'));
    const statuses = {requested:0, errors:0, basemapErrors:0};
    const cache = new Map(), active = new Map(), queue = []; let wanted = new Set(), layer = null, lineDirty = true, map;
    let resolveReady, rejectReady; const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; }); ready.catch(() => {});
    let lastStatus = '', lastEmission = null;
    function emit(state, extra = {}) {
      if (destroyed && state !== 'removed') return;
      const visible = [...cache].filter(([k]) => wanted.has(k));
      const basemapTilesLoaded = !!(map && styleReady && map.isStyleLoaded() && map.areTilesLoaded());
      const basemapState = mode === 'none' ? 'not_requested' : statuses.basemapErrors ? 'partial' : basemapTilesLoaded ? 'ready' : 'loading';
      const result = {state, fatal:false, ...statuses, basemapTilesLoaded, basemapReady:basemapTilesLoaded, basemapState, pending:active.size + queue.length, rendered:visible.filter(([, v]) => v.mesh.triangles).length, triangles:visible.reduce((sum, [, v]) => sum + v.mesh.triangles, 0), nativeZoom:12, exaggeration, boundaryCellOmission:true, rawDEMRehosted:false, ...extra};
      lastEmission = result;
      const key = JSON.stringify(result); if (key !== lastStatus) { lastStatus = key; options.onStatus?.(result); }
    }
    function style() {
      const background = {id:'background', type:'background', paint:{'background-color':token('surface.canvas', theme === 'light' ? '#F6F7F3' : '#11191D')}};
      if (mode === 'street') return root.SilaBasemap?.styles?.[theme] || (theme === 'light' ? 'https://tiles.openfreemap.org/styles/liberty' : 'https://tiles.openfreemap.org/styles/dark');
      const p = root.SilaBasemap?.satelliteProviders?.[mode === 'satellite-archive' ? 'eox2016' : 'googleCitychat'];
      if (mode === 'none' || !p) return {version:8, sources:{}, layers:[background]};
      return {version:8, sources:{imagery:{type:'raster', tiles:[p.tileUrl], tileSize:256, minzoom:p.minNativeZoom, maxzoom:p.maxNativeZoom, attribution:p.attribution}}, layers:[background, {id:'imagery', type:'raster', source:'imagery', paint:{'raster-fade-duration':0}}]};
    }
    map = new ml.Map({container:options.container, style:style(), ...cameraIn(options.camera), minZoom:7, maxZoom:21, maxPitch:75, centerClampedToGround:false, renderWorldCopies:false, attributionControl:false, antialias:true, preserveDrawingBuffer:false, canvasContextAttributes:{antialias:true}, maxBounds:[[bbox[0] - .15, bbox[1] - .15], [bbox[2] + .15, bbox[3] + .15]]});
    map.addControl(new ml.NavigationControl({visualizePitch:true}), 'top-right');
    map.addControl(new ml.AttributionControl({compact:true, customAttribution:source.attribution}), 'bottom-right');
    let rejectTimer = setTimeout(() => { if (!readyDone && !destroyed) { const e = new Error('No valid 3D terrain surface became available'); emit('error', {fatal:true, message:e.message}); rejectReady(e); } }, 35000);
    const keyOf = c => `${c.z}/${c.x}/${c.y}`;
    function sample(lng, lat) {
      if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) return null;
      // validCells already certifies the entire source-polygon cell.
      const [mx,my] = mercator([lng,lat]), n = 2 ** NATIVE_ZOOM, gx = mx*n*256-.5, gy = my*n*256-.5;
      const ix = Math.floor(gx), iy = Math.floor(gy), tx = Math.floor(ix/256), ty = Math.floor(iy/256), item = cache.get(`${NATIVE_ZOOM}/${tx}/${ty}`);
      if (!item) return null;
      const mesh = item.mesh, cx = ix-tx*256, cy = iy-ty*256, grid = mesh.width-1;
      if (!mesh.validCells[cy*grid+cx]) return null;
      const i=cy*mesh.width+cx, a=mesh.heights[i], b=mesh.heights[i+1], c=mesh.heights[i+mesh.width], d=mesh.heights[i+mesh.width+1], u=gx-ix, v=gy-iy;
      return u+v<=1 ? a+(b-a)*u+(c-a)*v : d+(c-d)*(1-u)+(b-d)*(1-v);
    }
    function elevateCamera() {
      const c = map.getCenter(), z = sample(c.lng, c.lat);
      if (z !== null && Math.abs(map.getCenterElevation() - z * exaggeration) > .1) map.setCenterElevation(z * exaggeration);
      // An unknown centre retains its last camera target; it is never assigned
      // a fabricated measured zero. Unknown cells themselves remain absent.
    }
    function lineGeometry() {
      const origin = mercator([bbox[0], bbox[3]]), out = [];
      for (const value of (boundary ? [boundary] : [municipality])) for (const poly of polygons(value)) for (const ring of poly) {
        for (let i = 1; i < ring.length; i++) {
          const a = ring[i - 1], b = ring[i], distance = Math.hypot((b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), b[1] - a[1]) * 111320, steps = Math.max(1, Math.ceil(distance / 80));
          let previous = null;
          for (let j = 0; j <= steps; j++) {
            const t = j / steps, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], z = sample(...p), m = mercator(p), current = z === null ? null : [m[0] - origin[0], m[1] - origin[1], (z * exaggeration + 2) * unitsPerMetre(p[1])];
            if (previous && current) out.push(...previous, ...current); previous = current;
          }
        }
      }
      return {origin, positions:new Float32Array(out)};
    }
    function dropGPU(item, gl) { if (item.gpu) { gl.deleteBuffer(item.gpu.vertices); gl.deleteBuffer(item.gpu.indices); item.gpu = null; } }
    function makeLayer() {
      return {id:'sila-valid-fabdem-mesh', type:'custom', renderingMode:'3d',
        onAdd(_map, gl) {
          if (!gl.createVertexArray) throw new Error('WebGL2 is required for the true3D terrain mesh');
          this.gl = gl; this.program = gl.createProgram();
          const vs = shader(gl, gl.VERTEX_SHADER, VS), fs = shader(gl, gl.FRAGMENT_SHADER, FS); gl.attachShader(this.program, vs); gl.attachShader(this.program, fs); gl.linkProgram(this.program); gl.deleteShader(vs); gl.deleteShader(fs);
          if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
          this.vao = gl.createVertexArray(); this.texture = gl.createTexture(); this.lineBuffer = gl.createBuffer();
          this.pos = gl.getAttribLocation(this.program, 'a_pos'); this.uniforms = {}; for (const name of ['matrix','exaggeration','base','hasBase','line','neutral','stroke']) this.uniforms[name] = gl.getUniformLocation(this.program, 'u_' + name);
        },
        render(gl, args) {
          if (destroyed || hidden) return;
          const matrix = args?.defaultProjectionData?.mainMatrix || args;
          if (!matrix || matrix.length !== 16) return;
          const saved = {program:gl.getParameter(gl.CURRENT_PROGRAM), vao:gl.getParameter(gl.VERTEX_ARRAY_BINDING), buffer:gl.getParameter(gl.ARRAY_BUFFER_BINDING), active:gl.getParameter(gl.ACTIVE_TEXTURE), depth:gl.isEnabled(gl.DEPTH_TEST), stencil:gl.isEnabled(gl.STENCIL_TEST), blend:gl.isEnabled(gl.BLEND), cull:gl.isEnabled(gl.CULL_FACE), depthMask:gl.getParameter(gl.DEPTH_WRITEMASK), depthFunc:gl.getParameter(gl.DEPTH_FUNC), depthRange:gl.getParameter(gl.DEPTH_RANGE), lineWidth:gl.getParameter(gl.LINE_WIDTH)};
          gl.activeTexture(gl.TEXTURE0); const oldTexture = gl.getParameter(gl.TEXTURE_BINDING_2D); let copied = false;
          try {
            gl.bindTexture(gl.TEXTURE_2D, this.texture); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            // Copy this frame's base map BEFORE drawing any terrain. Projection
            // is a vec4 varying, divided in the fragment shader (no double
            // perspective interpolation). Offscreen UV uses neutral shading.
            if (mode !== 'none') { gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, 0); copied = gl.getError() === gl.NO_ERROR; }
            gl.useProgram(this.program); gl.bindVertexArray(this.vao); gl.enableVertexAttribArray(this.pos); gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LEQUAL); gl.depthRange(0, 1);
            gl.uniform1i(this.uniforms.base, 0); gl.uniform1i(this.uniforms.hasBase, copied ? 1 : 0); gl.uniform1i(this.uniforms.line, 0); gl.uniform1f(this.uniforms.exaggeration, exaggeration); gl.uniform3fv(this.uniforms.neutral, neutral()); gl.uniform3fv(this.uniforms.stroke, stroke());
            let triangles = 0;
            for (const [key, item] of cache) {
              if (!wanted.has(key) || !item.mesh.triangles) continue;
              if (!item.gpu) { const vertices = gl.createBuffer(), indices = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vertices); gl.bufferData(gl.ARRAY_BUFFER, item.mesh.positions, gl.STATIC_DRAW); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, item.mesh.indices, gl.STATIC_DRAW); item.gpu = {vertices, indices}; }
              gl.bindBuffer(gl.ARRAY_BUFFER, item.gpu.vertices); gl.vertexAttribPointer(this.pos, 3, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, item.gpu.indices); gl.uniformMatrix4fv(this.uniforms.matrix, false, translatedMatrix(matrix, item.mesh.origin)); gl.drawElements(gl.TRIANGLES, item.mesh.indices.length, gl.UNSIGNED_INT, 0); triangles += item.mesh.triangles;
            }
            if (lineDirty) { this.lines = lineGeometry(); gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer); gl.bufferData(gl.ARRAY_BUFFER, this.lines.positions, gl.STATIC_DRAW); lineDirty = false; }
            if (this.lines?.positions.length) { gl.uniform1i(this.uniforms.line, 1); gl.uniform1f(this.uniforms.exaggeration, 1); gl.uniformMatrix4fv(this.uniforms.matrix, false, translatedMatrix(matrix, this.lines.origin)); gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer); gl.vertexAttribPointer(this.pos, 3, gl.FLOAT, false, 0, 0); gl.lineWidth(1.5); gl.drawArrays(gl.LINES, 0, this.lines.positions.length / 3); }
            if (triangles) { const state = active.size || queue.length ? 'loading' : statuses.errors ? 'partial' : 'ready'; emit(state, {basemapReprojection:copied ? 'projected_current_frame_or_neutral_offscreen' : 'neutral_surface', renderedFrame:true}); if (!readyDone) { readyDone = true; clearTimeout(rejectTimer); resolveReady(controller); } }
          } catch (error) { emit('error', {fatal:true, message:error.message}); if (!readyDone) rejectReady(error); }
          finally { gl.bindTexture(gl.TEXTURE_2D, oldTexture); gl.activeTexture(saved.active); gl.bindVertexArray(saved.vao); gl.bindBuffer(gl.ARRAY_BUFFER, saved.buffer); gl.useProgram(saved.program); gl.depthMask(saved.depthMask); gl.depthFunc(saved.depthFunc); gl.depthRange(...saved.depthRange); gl.lineWidth(saved.lineWidth); for (const [name, enabled] of [['DEPTH_TEST',saved.depth],['STENCIL_TEST',saved.stencil],['BLEND',saved.blend],['CULL_FACE',saved.cull]]) enabled ? gl.enable(gl[name]) : gl.disable(gl[name]); }
        },
        onRemove(_map, gl) { for (const item of cache.values()) dropGPU(item, gl); gl.deleteTexture(this.texture); gl.deleteBuffer(this.lineBuffer); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program); }
      };
    }
    async function fetchTile(coords, signal) {
      const url = (source.tileUrl || source.tiles).replace('{z}', coords.z).replace('{x}', coords.x).replace('{y}', coords.y), response = await fetch(url, {signal, mode:'cors'});
      if (!response.ok) throw new Error('FABDEM tile HTTP' + response.status);
      const blob = await response.blob(), image = await createImageBitmap(blob, {colorSpaceConversion:'none', premultiplyAlpha:'none'}), canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height; const ctx = canvas.getContext('2d', {willReadFrequently:true}); ctx.drawImage(image, 0, 0); image.close();
      if (canvas.width !== 256 || canvas.height !== 256) throw new Error('Unexpected native DEM tile dimensions');
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      return {pixels:rgba, coords, mesh:null, gpu:null};
    }
    // A257-node grid preserves all256 cell-centred native samples. Its extra
    // east/south nodes come ONLY from already loaded valid neighbour pixels.
    // Missing neighbours retain alpha0: no extrapolated seam or zero wall.
    function rebuildNeighbours(coords) {
      for (const dx of [0,-1]) for (const dy of [0,-1]) {
        const c={z:NATIVE_ZOOM,x:coords.x+dx,y:coords.y+dy}, item=cache.get(keyOf(c)); if(!item)continue;
        const padded=new Uint8ClampedArray(257*257*4);
        for(let y=0;y<256;y++)padded.set(item.pixels.subarray(y*1024,(y+1)*1024),y*257*4);
        const east=cache.get(`${NATIVE_ZOOM}/${c.x+1}/${c.y}`), south=cache.get(`${NATIVE_ZOOM}/${c.x}/${c.y+1}`), diagonal=cache.get(`${NATIVE_ZOOM}/${c.x+1}/${c.y+1}`);
        if(east)for(let y=0;y<256;y++)padded.set(east.pixels.subarray(y*1024,y*1024+4),(y*257+256)*4);
        if(south)padded.set(south.pixels.subarray(0,1024),256*257*4);
        if(diagonal)padded.set(diagonal.pixels.subarray(0,4),(257*257-1)*4);
        if(layer?.gl)dropGPU(item,layer.gl);
        item.mesh=buildMesh(padded,257,257,c,district,h,256);
      }
    }
    function pump() {
      if (hidden || destroyed || !styleReady) return;
      while (active.size < 4 && queue.length) {
        const coords = queue.shift(), key = keyOf(coords); if (!wanted.has(key) || cache.has(key) || active.has(key)) continue;
        const abort = new AbortController(); active.set(key, abort); statuses.requested++;
        fetchTile(coords, abort.signal).then(item => { if (destroyed || abort.signal.aborted) return; cache.set(key, item); rebuildNeighbours(coords); lineDirty = true; elevateCamera(); map.triggerRepaint(); }).catch(error => { if (error.name !== 'AbortError' && !destroyed) statuses.errors++; }).finally(() => { if (active.get(key) === abort) active.delete(key); if (destroyed) return; pump(); map.triggerRepaint(); if (!active.size && !queue.length && ![...cache].some(([k,v]) => wanted.has(k) && v.mesh.triangles)) emit('partial', {message:'No valid DEM surface in the current district view'}); });
      }
      if (active.size || queue.length) emit('loading');
    }
    function syncVisible() {
      if (hidden || destroyed || !styleReady) return;
      const b = map.getBounds(), coords = wantedTiles([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], district, h);
      // Native12 district coverage is bounded, irrespective of global viewport.
      if (coords.length > 64) { emit('error', {fatal:true, message:'District tile budget exceeded'}); return; }
      wanted = new Set(coords.map(keyOf));
      for (const [key, abort] of active) if (!wanted.has(key)) { abort.abort(); active.delete(key); }
      queue.splice(0, queue.length, ...coords.filter(c => !cache.has(keyOf(c)) && !active.has(keyOf(c))));
      for (const [key, item] of cache) if (!wanted.has(key)) { if (layer?.gl) dropGPU(item, layer.gl); cache.delete(key); }
      pump(); elevateCamera(); map.triggerRepaint();
    }
    function addMask() {
      const ps = polygons(municipality); if (!ps.length) return;
      const orient = (ring, ccw) => { let a=0; for(let i=1;i<ring.length;i++)a+=ring[i-1][0]*ring[i][1]-ring[i][0]*ring[i-1][1]; return (a>0)===ccw ? ring : [...ring].reverse(); };
      const world = [[-179,-84],[179,-84],[179,84],[-179,84],[-179,-84]], fs = [{type:'Feature', properties:{}, geometry:{type:'Polygon', coordinates:[world, ...ps.map(p => orient(p[0],false))]}}];
      for (const p of ps) for (const hole of p.slice(1)) fs.push({type:'Feature', properties:{}, geometry:{type:'Polygon', coordinates:[orient(hole,true)]}});
      if (map.getLayer('sila-3d-outside-mask')) map.removeLayer('sila-3d-outside-mask'); if (map.getSource('sila-3d-outside-mask')) map.removeSource('sila-3d-outside-mask');
      map.addSource('sila-3d-outside-mask', {type:'geojson', data:{type:'FeatureCollection',features:fs}}); map.addLayer({id:'sila-3d-outside-mask', type:'fill', source:'sila-3d-outside-mask', paint:{'fill-color':theme === 'light' ? '#FFFFFF' : '#11191D','fill-opacity':.72}});
    }
    function install() { if (destroyed) return; clearTimeout(styleTimer); styleReady = true; addMask(); layer = makeLayer(); map.addLayer(layer); syncVisible(); }
    map.on('style.load', install);
    // DEM and base-map requests have separate lifecycles. First valid mesh
    // remains usable while street/satellite tiles finish; idle reports their
    // settled public MapLibre readiness without changing DEM readiness.
    map.on('idle', () => { if (!destroyed && !hidden && lastEmission && lastEmission.state !== 'error') emit(lastEmission.state, {basemapReprojection:lastEmission.basemapReprojection, renderedFrame:lastEmission.renderedFrame}); });
    map.on('moveend', () => { if (destroyed) return; syncVisible(); options.onCameraChange?.(cameraOut(map)); });
    map.on('webglcontextlost', () => { const error = new Error('WebGL context lost'); emit('error', {fatal:true, message:error.message}); if (!readyDone) rejectReady(error); });
    map.on('error', event => { if (!destroyed) { statuses.basemapErrors++; if (lastEmission?.state !== 'error') emit(lastEmission?.state || 'loading', {message:event.error?.message || 'A basemap resource did not load'}); } });
    const controller = {
      ready,
      getCamera:() => cameraOut(map),
      setCamera(camera) { if (!destroyed) { map.jumpTo(cameraIn({...cameraOut(map), ...camera})); syncVisible(); } return controller; },
      setTheme(value) { const next = value === 'light' ? 'light' : 'dark'; if (next !== theme) { theme = next; controller.setBasemap(mode, true); } return controller; },
      setBasemap(value, force = false) { const next = ['street','satellite','satellite-archive','none'].includes(value) ? value : 'street'; if (next !== mode || force) { mode = next; styleReady = false; const generation = ++styleGeneration; statuses.basemapErrors = 0; map.setStyle(style()); clearTimeout(styleTimer); styleTimer = setTimeout(() => { if (!destroyed && !styleReady && generation === styleGeneration) emit('error', {fatal:true,message:'The3D basemap style could not load'}); },20000); } return controller; },
      setBoundaries(value = {}) { const nextKey = JSON.stringify([value.boundary,value.municipality]); if(nextKey === boundaryKey)return controller; boundaryKey = nextKey; boundary = value.boundary; municipality = value.municipality; lineDirty = true; if (styleReady) { if (layer && map.getLayer(layer.id)) map.removeLayer(layer.id); addMask(); layer = makeLayer(); map.addLayer(layer); } map.triggerRepaint(); return controller; },
      setExaggeration(value) { exaggeration = clamp(Number(value) || 1, 1, 8); lineDirty = true; elevateCamera(); map.triggerRepaint(); emit(active.size ? 'loading' : 'ready'); return controller; },
      getState:() => ({version:VERSION, camera:cameraOut(map), basemapTilesLoaded:!!(styleReady && map.isStyleLoaded() && map.areTilesLoaded()), basemapState:lastEmission?.basemapState || 'loading', exaggeration, nativeZoom:12, loadedTiles:cache.size, pending:active.size + queue.length, triangles:[...cache.values()].reduce((sum,v) => sum + v.mesh.triangles, 0), source:source.version, districtCode:'4001', noData:'geometry_absent', edgePolicy:'omit_every_boundary_touched_native_cell',pixelRegistration:'native_cell_centres_with_valid_loaded_neighbour_stitch',missingNeighbourEdge:'transparent_not_extrapolated', basemapDrape:'current_frame_projective_reprojection_with_neutral_offscreen_fallback', styleGeneration, rawDEMRehosted:false}),
      resize() { if (!destroyed) { map.resize(); syncVisible(); } return controller; },
      show() { const wasHidden = hidden; hidden = false; options.container.hidden = false; if(wasHidden){map.resize();syncVisible();} return controller; },
      hide() { hidden = true; for (const a of active.values()) a.abort(); active.clear(); queue.length = 0; options.container.hidden = true; return controller; },
      destroy() { if (destroyed) return; const camera = cameraOut(map); destroyed = true; clearTimeout(rejectTimer); clearTimeout(styleTimer); for (const a of active.values()) a.abort(); active.clear(); queue.length = 0; map.remove(); cache.clear(); emit('removed'); if (!readyDone) rejectReady(new Error('3D terrain was removed')); return camera; }
    };
    emit('loading'); return controller;
  }
  const api = Object.freeze({version:VERSION, create, _test:{mercator,lonlat,unitsPerMetre,decode,translatedMatrix,safeCells,buildMesh,wantedTiles,cameraIn,cameraOut}});
  root.SilaTerrain3D = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
