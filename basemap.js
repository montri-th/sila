/* OpenFreeMap vector basemap, adapting the existing Leaflet map.
 * Include basemap.css and this classic script before app.js.
 * const layer = SilaBasemap.create({theme:'dark', fallback:true}).addTo(existingMap);
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
        root.L.setOptions(this, {theme:'dark', language:'th', fallback:true, startupTimeoutMs:15000, ...options});
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
        this._mount();
      },
      onRemove() {
        this._attempt++;
        this._clear();
        this._hostMap = null;
        this._status = 'removed';
      },
      _statusEvent(status, detail = {}) {
        this._status = status;
        const data = {status, renderer:this._renderer, theme:this.options.theme, ...detail};
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
        if (child && this._hostMap?.hasLayer(child)) this._hostMap.removeLayer(child);
      },
      async _mount() {
        const attempt = ++this._attempt;
        const map = this._hostMap;
        this._clear();
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
        if (this._hostMap) this._mount();
        return this;
      },
      setLanguage(language) {
        this.options.language = language === 'en' ? 'en' : 'th';
        // Source-native name:nonlatin labels are retained, including Thai where present.
        return this;
      },
      getMaplibreMap() { return this._gl; },
      getBasemapState() {
        return {status:this._status, renderer:this._renderer, theme:this.options.theme,
          styleUrl:styles[this.options.theme === 'light' ? 'light' : 'dark'],
          lastError:this._lastError, requiresWebGL:true, languagePolicy:'native bilingual / nonlatin source names'};
      },
    });
    return new BasemapLayer(options);
  }
  root.SilaBasemap = Object.freeze({create, styles, attribution, preload:runtime, version:'1.0.0'});
})(window);
