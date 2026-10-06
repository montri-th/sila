/* Every valid source house record is one Canvas point at every zoom.
 * Source coordinates and supplied scope membership are retained; no aggregation,
 * viewport filtering, display limit, relocation or count badges.
 * The host owns coincident/nearby record choice and keyboard access through records.
 */
(function (root) {
  'use strict';
  const MAX_LAT = 85.05112878;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function validPoint(feature) {
    const xy = feature?.geometry?.type === 'Point' ? feature.geometry.coordinates : null;
    return !!(xy && Number.isFinite(xy[0]) && Number.isFinite(xy[1]) && Math.abs(xy[0]) <= 180 && Math.abs(xy[1]) <= MAX_LAT);
  }
  function preparePoints(features) {
    if (!Array.isArray(features)) throw new Error('Pass the complete scoped source point array');
    const points = Object.freeze(features.filter(validPoint));
    return Object.freeze({inputCount:features.length, usableCount:points.length,
      unavailableGeometryCount:features.length-points.length, features:points});
  }
  function pointAppearance(zoom) {
    const z = Number.isFinite(Number(zoom)) ? Number(zoom) : 10;
    return Object.freeze({radius:Math.min(5.5,Math.max(1.8,1.8+(z-10)*0.35)),
      weight:Math.min(1.5,Math.max(1,1+(z-10)*0.07))});
  }
  let HouseLayer;
  function create(options = {}) {
    const L = root.L;
    if (!L?.Layer) throw new Error('House points require the existing Leaflet runtime');
    if (!Array.isArray(options.features)) throw new Error('Pass the complete immutable scoped point-feature array');
    if (!/^#[0-9a-f]{6}$/i.test(options.color || '') || !/^#[0-9a-f]{6}$/i.test(options.strokeColor || '')) throw new Error('Pass exact categorical fill and neutral stroke HEX colors');
    if (!HouseLayer) HouseLayer = L.Layer.extend({
      initialize(options) {
        L.setOptions(this,{language:'th',pane:'features',interactive:true,...options});
        this._features = options.features.slice();
        this._points = preparePoints(this._features);
        this._markers = [];
        this._hostMap = null;
        this._renderer = null;
        this._displayGroup = null;
        this._removed = false;
      },
      onAdd(map) {
        this._hostMap = map;
        this._removed = false;
        this._renderer = L.canvas({pane:this.options.pane,padding:0.5});
        this._displayGroup = L.layerGroup().addTo(map);
        const appearance = pointAppearance(map.getZoom());
        for (const feature of this._points.features) {
          const [lng,lat] = feature.geometry.coordinates;
          const point = L.circleMarker([lat,lng],{pane:this.options.pane,renderer:this._renderer,
            radius:appearance.radius,weight:appearance.weight,
            color:this.options.strokeColor,fillColor:this.options.color,
            opacity:1,fillOpacity:1,interactive:this.options.interactive,bubblingMouseEvents:false});
          if (this.options.interactive) {
            point.bindTooltip(() => this._label(feature),{sticky:true,direction:'top',className:'sila-house-point-tooltip'});
            point.on('click',(event) => {
              if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
              const pick = {latlng:event.latlng || point.getLatLng(),originalEvent:event.originalEvent};
              if (typeof this.options.onPickPoint === 'function') {
                this.options.onPickPoint(pick);
                this.fire('pointpick',pick);
              } else {
                this.options.onSelectRecord?.(feature);
                this.fire('recordselect',{feature});
              }
            });
          }
          point.addTo(this._displayGroup);
          this._markers.push(point);
        }
        map.on('zoomend',this._updateAppearance,this);
        this._reportDisplay();
      },
      onRemove(map) {
        map.off('zoomend',this._updateAppearance,this);
        if (this._displayGroup) map.removeLayer(this._displayGroup);
        if (this._renderer && map.hasLayer(this._renderer)) map.removeLayer(this._renderer);
        this._markers = [];
        this._renderer = null;
        this._displayGroup = null;
        this._hostMap = null;
        this._removed = true;
      },
      _label(feature) {
        const en = this.options.language === 'en';
        const number = feature.properties?.houseNumber;
        const value = number ? ((en ? 'House number ' : 'บ้านเลขที่ ')+number) :
          (feature.properties?.label || feature.properties?.id || (en ? 'Source house point' : 'หมุดบ้านจากต้นทาง'));
        return esc(value);
      },
      _updateAppearance() {
        if (!this._hostMap) return;
        const appearance = pointAppearance(this._hostMap.getZoom());
        for (const point of this._markers) {
          point.setRadius(appearance.radius);
          point.setStyle({weight:appearance.weight});
        }
        this._reportDisplay();
      },
      _reportDisplay() {
        // Bounded observability on this layer's own Leaflet Canvas, without badges
        // or access to host internals. Leaflet 1.9's renderer creates this element.
        const canvas = this._renderer?._container;
        if (canvas?.setAttribute && this._hostMap) {
          const appearance = pointAppearance(this._hostMap.getZoom());
          canvas.setAttribute('data-house-display','all-points');
          canvas.setAttribute('data-house-point-count',String(this._markers.length));
          canvas.setAttribute('data-house-scope-input-count',String(this._points.inputCount));
          canvas.setAttribute('data-house-zoom',String(this._hostMap.getZoom()));
          canvas.setAttribute('data-house-radius',String(appearance.radius));
          canvas.setAttribute('data-house-rim',String(appearance.weight));
        }
        this.fire('displaychange',{display:this.getDisplayState()});
      },
      setLanguage(language) {
        this.options.language = language === 'en' ? 'en' : 'th';
        return this;
      },
      getDisplayState() {
        const mounted = !!this._hostMap;
        return {status:mounted ? 'ready' : this._removed ? 'removed' : 'not_mounted',
          displayMode:'individual_source_points',scopeInputRecordCount:this._points.inputCount,
          usablePointRecordCount:this._points.usableCount,unavailableGeometryCount:this._points.unavailableGeometryCount,
          renderedPointCount:mounted ? this._markers.length : 0,
          displayedPointRecordCount:mounted ? this._markers.length : 0,
          displayedSingletonCount:mounted ? this._markers.length : 0,displayedClusterCount:0,
          mapZoom:mounted ? this._hostMap.getZoom() : null,
          pointAppearance:mounted ? pointAppearance(this._hostMap.getZoom()) : null,
          renderer:'Leaflet Canvas',rendererClipsToViewport:true,viewportOnlyRendering:false,
          aggregationEnabled:false,displayLimit:null,
          sourceCoordinatesChanged:false,scopeMembershipChanged:false,
          countMeaning:'source point records, not verified unique households',
          coincidentPointPolicy:'retain every source point at its original coordinate; host record chooser and records list select overlapping entries'};
      },
      getBounds() {
        return L.latLngBounds(this._points.features.map((f) => [f.geometry.coordinates[1],f.geometry.coordinates[0]]));
      },
    });
    return new HouseLayer(options);
  }
  root.SilaHousePoints = Object.freeze({create,version:'2.0.0',internals:Object.freeze({preparePoints,pointAppearance,validPoint})});
})(typeof window === 'undefined' ? globalThis : window);
