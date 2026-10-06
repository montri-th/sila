/* OpenFreeMap street / CityChat-compatible satellite / licensed archive basemap.
 * Include basemap.css and this classic script before app.js.
 * const layer = SilaBasemap.create({mode:'street',theme:'dark',fallback:true}).addTo(existingMap);
 * layer.on('tileerror', handler); layer.on('basemapstatus', ({status}) => ...);
 * Remove with existingMap.removeLayer(layer). Analytics/geometry/camera are untouched.
 */
(function (root) {
  'use strict';
  const scriptBase = new URL('.', document.currentScript?.src || location.href);
  const asset = (path) => new URL(path, scriptBase).href;
  const styles = Object.freeze({
    dark: 'https://tiles.openfreemap.org/styles/dark',
    light: 'https://tiles.openfreemap.org/styles/liberty',
  });
  const attribution = '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>';
  const satelliteProviders = Object.freeze({googleCitychat:Object.freeze({
    id:'googleCitychat', name:'Google Hybrid',
    tileUrl:'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    minNativeZoom:0, maxNativeZoom:19, imageryDate:null, nominalResolutionM:null,
    crossOrigin:'anonymous', licenseConfirmed:false, licenseStatus:'not_verified',
    sourceCompatibility:'existing_citychat_google_hybrid_xyz', officialGoogleAPI:false,
    selfHosted:false,
    attribution:'<a href="https://maps.google.com/" target="_blank" rel="noopener">Google Maps</a>',
  }),eox2016:Object.freeze({
    id:'eox2016', name:'EOX Sentinel-2 cloudless',
    tileUrl:asset('vendor/satellite-eox-2016/') + '{z}/{x}/{y}.jpg',
    minNativeZoom:8, maxNativeZoom:14, imageryDate:'2016/2017', nominalResolutionM:10,
    coverageBounds:[[16.40865806002118,102.74739041101322],[16.569621432680514,102.95219335992162]],
    licenseConfirmed:true, licenseStatus:'cc_by_4.0', license:'CC BY 4.0', selfHosted:true,
    attribution:'<a href="https://s2maps.eu/" target="_blank" rel="noopener">Sentinel-2 cloudless</a> by <a href="https://eox.at/" target="_blank" rel="noopener">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2016 &amp; 2017) · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>',
  })});
  const modeOf = (mode) => mode === 'satellite' || mode === 'satellite-archive' ? mode : mode === 'none' ? 'none' : 'street';
  function satelliteProvider(value) {
    if (!value) return satelliteProviders.googleCitychat;
    if (typeof value === 'string' && satelliteProviders[value]) return satelliteProviders[value];
    if (typeof value !== 'object' || value.licenseConfirmed !== true || !value.id || !value.name ||
        !value.attribution || !/^https:\/\//.test(value.tileUrl || '') ||
        !Number.isInteger(value.maxNativeZoom) || value.maxNativeZoom < 0 || value.maxNativeZoom > 23)
      throw new Error('A custom imagery provider requires a confirmed licence, HTTPS tile URL, attribution and native zoom cap');
    return Object.freeze({...value});
  }
  let runtimePromise;
  function runtime() {
    if (runtimePromise) return runtimePromise;
    runtimePromise = import(asset('vendor/maplibre-gl/maplibre-gl.mjs')).then(async (module) => {
      module.setWorkerUrl(asset('vendor/maplibre-gl/maplibre-gl-worker.mjs'));
      root.maplibregl = module;
      if (!root.MaplibreGLLeaflet?.maplibreGL) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = asset('vendor/maplibre-gl-leaflet/leaflet-maplibre-gl.js');
          s.onload = resolve;
          s.onerror = () => reject(new Error('The local MapLibre Leaflet adapter could not load'));
          document.head.appendChild(s);
        });
      }
      if (!root.MaplibreGLLeaflet?.maplibreGL) throw new Error('The Leaflet vector adapter is unavailable');
      return root.MaplibreGLLeaflet;
    }).catch((error) => {
      runtimePromise = null;
      throw error;
    });
    return runtimePromise;
  }
  let BasemapLayer;
  function create(options = {}) {
    if (!root.L?.Layer) throw new Error('Load Leaflet before basemap.js');
    if (!BasemapLayer) BasemapLayer = root.L.Layer.extend({
      initialize(options) {
        root.L.setOptions(this, {mode:'street', theme:'dark', language:'th', fallback:true, startupTimeoutMs:15000, ...options});
        this.options.mode = modeOf(this.options.mode);
        this._satelliteProvider = satelliteProvider(this.options.satelliteProvider);
        this._attempt = 0;
        this._status = 'idle';
        this._renderer = null;
        this._child = null;
        this._gl = null;
        this._lastError = null;
      },
      onAdd(map) {
        this._hostMap = map;
        // Credits belong to Leaflet's controls, above the noninteractive outside mask.
        // Keep their links clickable even though the GL canvas itself ignores pointers.
        const credits = map.attributionControl?.getContainer?.();
        if (credits) {
          credits.style.pointerEvents = 'auto';
          credits.style.zIndex = '1001';
        }
        map.on('zoomend', this._zoomEvent, this);
        this._mount();
      },
      onRemove() {
        this._attempt++;
        this._hostMap?.off('zoomend', this._zoomEvent, this);
        this._clear();
        this._hostMap = null;
        this._status = 'removed';
      },
      _statusEvent(status, detail = {}) {
        this._status = status;
        const data = {...this.getBasemapState(), ...detail};
        this.fire('basemapstatus', data);
        this.options.onStatus?.(data);
      },
      _clear() {
        clearTimeout(this._timeout);
        this._timeout = null;
        if (this._gl) {
          this._gl.off('load', this._loadHandler);
          this._gl.off('error', this._errorHandler);
          this._gl.off('webglcontextlost', this._contextLostHandler);
        }
        const child = this._child;
        this._child = null;
        this._gl = null;
        // Leaflet installs once('remove') listeners for attribution and renderer
        // map-event cleanup. Let them fire before clearing remaining handlers.
        if (child && this._hostMap?.hasLayer(child)) this._hostMap.removeLayer(child);
        if (child) child.off();
      },
      async _mount() {
        const attempt = ++this._attempt;
        const map = this._hostMap;
        this._clear();
        if (this.options.mode === 'none') {
          this._renderer = null;
          this._statusEvent('none');
          return;
        }
        if (this.options.mode === 'satellite' || this.options.mode === 'satellite-archive') {
          this._mountSatellite(attempt, map);
          return;
        }
        this._renderer = 'openfreemap-vector';
        this._lastError = null;
        this._statusEvent('loading');
        try {
          const bridge = await runtime();
          if (attempt !== this._attempt || map !== this._hostMap) return;
          this._child = bridge.maplibreGL({
            style: styles[this.options.theme === 'light' ? 'light' : 'dark'],
            pane:'tilePane',
            interactive:false,
            attributionControl:{customAttribution:attribution},
            renderWorldCopies:false,
            fadeDuration:0,
          });
          // The official adapter assumes GL construction succeeded in onRemove.
          // Guard its cleanup after unsupported-WebGL constructor failures.
          const bridgeRemove = this._child.onRemove;
          this._child.onRemove = function (host) {
            if (this.getMaplibreMap()) return bridgeRemove.call(this, host);
            this._container?.remove();
          };
          this._child.addTo(map);
          this._gl = this._child.getMaplibreMap();
          this._gl.getCanvas().style.pointerEvents = 'none';
          this._loadHandler = () => {
            if (attempt !== this._attempt) return;
            clearTimeout(this._timeout);
            this._timeout = null;
            this._statusEvent('ready', {nativeTheme:true, styleUrl:styles[this.options.theme === 'light' ? 'light' : 'dark']});
            this.fire('load', {renderer:this._renderer});
          };
          this._errorHandler = (event) => {
            if (attempt !== this._attempt) return;
            this._lastError = event.error?.message || 'A vector basemap resource failed';
            // Isolated tile/glyph errors do not silently replace an otherwise usable map.
            this.fire('tileerror', {error:event.error || new Error(this._lastError), renderer:this._renderer, fallback:false});
          };
          this._contextLostHandler = () => {
            if (attempt === this._attempt) this._fallback(new Error('WebGL context was lost'), attempt);
          };
          this._gl.on('load', this._loadHandler);
          this._gl.on('error', this._errorHandler);
          this._gl.on('webglcontextlost', this._contextLostHandler);
          this._timeout = setTimeout(() => {
            if (attempt === this._attempt && this._status !== 'ready') this._fallback(new Error(this._lastError || 'Vector basemap startup timed out'), attempt);
          }, this.options.startupTimeoutMs);
        } catch (error) {
          if (attempt === this._attempt) this._fallback(error, attempt);
        }
      },
      _mountSatellite(attempt, map) {
        const mode = this.options.mode;
        const provider = mode === 'satellite-archive' ? satelliteProviders.eox2016 : this._satelliteProvider;
        this._renderer = 'satellite-raster';
        this._lastError = null;
        this._rasterLoaded = 0;
        this._rasterErrors = 0;
        this._statusEvent('loading', {nativeTheme:false});
        this._child = root.L.tileLayer(provider.tileUrl, {
          pane:'tilePane', minZoom:0,
          maxZoom:Number.isFinite(map.getMaxZoom()) ? map.getMaxZoom() : 20,
          minNativeZoom:provider.minNativeZoom ?? 0, maxNativeZoom:provider.maxNativeZoom,
          bounds:provider.coverageBounds, noWrap:true, detectRetina:false,
          crossOrigin:provider.crossOrigin ?? false,
          keepBuffer:1, updateWhenIdle:true, attribution:provider.attribution,
        });
        this._child.on('loading', () => {
          if (attempt !== this._attempt) return;
          this._rasterLoaded = 0;
          this._rasterErrors = 0;
        });
        this._child.on('tileload', () => {
          if (attempt !== this._attempt) return;
          this._rasterLoaded++;
          clearTimeout(this._timeout);
          this._timeout = null;
        });
        this._child.on('tileerror', (event) => {
          if (attempt !== this._attempt) return;
          this._rasterErrors++;
          this._lastError = event.error?.message || 'An imagery tile failed';
          this.fire('tileerror', {error:event.error || new Error(this._lastError),renderer:this._renderer,fallback:false,mode});
        });
        this._child.on('load', () => {
          if (attempt !== this._attempt) return;
          clearTimeout(this._timeout);
          this._timeout = null;
          this._statusEvent(this._rasterLoaded ? this._rasterErrors ? 'degraded' : 'ready' : 'unavailable', {
            nativeTheme:false, tileFailures:this._rasterErrors,
            ...(this._rasterLoaded ? {} : {reason:provider.selfHosted ? 'Imagery is unavailable at this view or outside the cached Sila coverage' : 'The selected imagery provider is unavailable at this view'}),
          });
          if (this._rasterLoaded) this.fire('load', {renderer:this._renderer,mode});
        });
        this._timeout = setTimeout(() => {
          if (attempt !== this._attempt || this._rasterLoaded) return;
          this._lastError = 'Imagery startup timed out';
          this._statusEvent('unavailable', {reason:this._lastError,nativeTheme:false});
          this.fire('tileerror',{error:new Error(this._lastError),renderer:this._renderer,fallback:false,mode});
        }, this.options.startupTimeoutMs);
        this._child.addTo(map);
        this._zoomEvent();
      },
      _zoomEvent() {
        if (this._hostMap) this.fire('basemapzoom', this.getBasemapState());
      },
      _fallback(error, attempt) {
        if (attempt !== this._attempt || !this._hostMap) return;
        this._clear();
        this._lastError = error?.message || String(error);
        if (!this.options.fallback) {
          this._renderer = null;
          this._statusEvent('unavailable', {reason:this._lastError});
          this.fire('tileerror', {error, renderer:null, fallback:false});
          return;
        }
        this._renderer = 'osm-raster-fallback';
        this._child = root.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          pane:'tilePane', maxZoom:20, maxNativeZoom:19, noWrap:true,
          keepBuffer:1, updateWhenIdle:true,
          attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · raster fallback',
        });
        this._child.on('tileerror', (e) => {
          if (attempt === this._attempt) this.fire('tileerror', {error:e.error || new Error('Raster fallback tile failed'), renderer:this._renderer, fallback:true});
        });
        this._child.addTo(this._hostMap);
        this._statusEvent('fallback', {reason:this._lastError, nativeTheme:false, label:'OpenStreetMap raster fallback'});
        this.fire('basemapfallback', {error, renderer:this._renderer, nativeTheme:false});
      },
      setTheme(theme) {
        const next = theme === 'light' ? 'light' : 'dark';
        if (this.options.theme === next) return this;
        this.options.theme = next;
        if (this._hostMap && this.options.mode === 'street') this._mount();
        else this._zoomEvent();
        return this;
      },
      setMode(mode) {
        const next = modeOf(mode);
        if (this.options.mode === next) return this;
        this.options.mode = next;
        if (this._hostMap) this._mount();
        return this;
      },
      setLanguage(language) {
        this.options.language = language === 'en' ? 'en' : 'th';
        // Source-native name:nonlatin labels are retained, including Thai where present.
        this._zoomEvent();
        return this;
      },
      getMaplibreMap() { return this._gl; },
      getBasemapState() {
        const mode = this.options.mode, imagery = mode === 'satellite' || mode === 'satellite-archive';
        const provider = mode === 'satellite-archive' ? satelliteProviders.eox2016 : this._satelliteProvider;
        const rawZoom = this._hostMap?.getZoom(), zoom = Number.isFinite(rawZoom) ? rawZoom : null;
        const tileZoom = imagery && zoom !== null ? Math.max(provider.minNativeZoom ?? 0,Math.min(provider.maxNativeZoom,Math.round(zoom))) : null;
        const overzoom = imagery && zoom !== null && zoom > provider.maxNativeZoom;
        const z = zoom === null ? '—' : Number(zoom.toFixed(2)).toString();
        const sourceTh = imagery ? `${provider.name} · ${provider.imageryDate || 'ไม่ทราบวันที่ถ่ายภาพ'}${provider.nominalResolutionM ? ` · ประมาณ ${provider.nominalResolutionM} ม./พิกเซล` : ' · ความละเอียดขึ้นกับพื้นที่'}` : '';
        const sourceEn = imagery ? `${provider.name} · ${provider.imageryDate || 'capture date unknown'}${provider.nominalResolutionM ? ` · approximately ${provider.nominalResolutionM} m/pixel` : ' · resolution varies by area'}` : '';
        const noticeTh = imagery ? `${sourceTh} · ${overzoom ? `ซูม ${z}: ขยายภาพระดับ ${provider.maxNativeZoom} ไม่เพิ่มรายละเอียด` : provider.imageryDate ? 'ภาพประกอบพื้นที่ ไม่ใช่ภาพปัจจุบัน' : 'ภาพประกอบพื้นที่ ยังไม่ยืนยันสภาพปัจจุบัน'}` : '';
        const noticeEn = imagery ? `${sourceEn} · ${overzoom ? `zoom ${z}: enlarging level ${provider.maxNativeZoom}, no added imagery detail` : provider.imageryDate ? 'context imagery, not current conditions' : 'context imagery, current conditions unverified'}` : '';
        return {status:this._status, mode, renderer:this._renderer, theme:this.options.theme,
          styleUrl:mode === 'street' ? styles[this.options.theme === 'light' ? 'light' : 'dark'] : null,
          lastError:this._lastError, requiresWebGL:mode === 'street',
          nativeTheme:mode === 'street' && this._renderer === 'openfreemap-vector',
          languagePolicy:imagery ? provider.id === 'googleCitychat' ? 'existing source hybrid labels; no new locale parameter appended' : 'imagery has no label overlay' : 'native bilingual / nonlatin source names',
          provider:imagery ? provider.id : mode === 'street' ? 'openfreemap' : null,
          imageryDate:imagery ? provider.imageryDate || null : null,
          nominalResolutionM:imagery ? provider.nominalResolutionM || null : null,
          nativeZoom:imagery ? provider.maxNativeZoom : null,
          sourceTileZoom:tileZoom, zoom, overzoom,
          scaleFactor:tileZoom !== null ? 2 ** (zoom - tileZoom) : 1,
          coverageBounds:imagery ? provider.coverageBounds || null : null,
          selfHosted:imagery ? !!provider.selfHosted : false,
          licenseStatus:imagery ? provider.licenseStatus || (provider.licenseConfirmed ? 'confirmed' : 'not_verified') : null,
          sourceCompatibility:imagery ? provider.sourceCompatibility || null : null,
          officialGoogleAPI:imagery ? !!provider.officialGoogleAPI : false,
          zoomNotice:this.options.language === 'en' ? noticeEn : noticeTh,
          zoomNoticeTh:noticeTh, zoomNoticeEn:noticeEn};
      },
    });
    return new BasemapLayer(options);
  }
  root.SilaBasemap = Object.freeze({create, styles, attribution, satelliteProviders, preload:runtime, version:'1.2.0'});
})(window);
