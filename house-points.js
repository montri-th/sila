/* House point display adapter: immutable source membership, stable world grid,
 * viewport-only drawing, original singleton coordinates, accessible clusters.
 * Add house-points.css. Create(options).addTo(the existing Leaflet map).
 * Cluster callbacks ALWAYS receive every source member, including coincident
 * records and maximum zoom. Host owns the member list and any explicit fit.
 */
(function (root) {
  'use strict';
  const MAX_LAT = 85.05112878;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const gridSize = (zoom) => zoom <= 13 ? 64 : zoom === 14 ? 56 : zoom === 15 ? 44 : zoom === 16 ? 32 : zoom === 17 ? 24 : 20;
  function project(lng, lat, zoom) {
    const scale = 256 * 2 ** zoom;
    const sin = Math.sin(Math.min(MAX_LAT, Math.max(-MAX_LAT, lat)) * Math.PI / 180);
    return {x:(lng + 180) / 360 * scale, y:(0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale};
  }
  function unproject(x, y, zoom) {
    const scale = 256 * 2 ** zoom;
    return {lng:x / scale * 360 - 180, lat:Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale))) * 180 / Math.PI};
  }
  function validPoint(feature) {
    const xy = feature?.geometry?.type === 'Point' ? feature.geometry.coordinates : null;
    return xy && Number.isFinite(xy[0]) && Number.isFinite(xy[1]) && Math.abs(xy[0]) <= 180 && Math.abs(xy[1]) <= MAX_LAT;
  }
  function groupAtZoom(features, zoom) {
    const bucket = Math.max(0, Math.floor(zoom)), cell = gridSize(bucket), groups = new Map();
    let usable = 0;
    for (const feature of features || []) {
      if (!validPoint(feature)) continue;
      const [lng,lat] = feature.geometry.coordinates, p = project(lng,lat,bucket);
      const key = `${bucket}:${cell}:${Math.floor(p.x / cell)}:${Math.floor(p.y / cell)}`;
      let group = groups.get(key);
      if (!group) {
        group = {key, zoom:bucket, cellSize:cell, count:0, members:[], sumX:0, sumY:0,
          minLng:lng, maxLng:lng, minLat:lat, maxLat:lat};
        groups.set(key, group);
      }
      group.members.push(feature); group.count++; usable++;
      group.sumX += p.x; group.sumY += p.y;
      group.minLng = Math.min(group.minLng,lng); group.maxLng = Math.max(group.maxLng,lng);
      group.minLat = Math.min(group.minLat,lat); group.maxLat = Math.max(group.maxLat,lat);
    }
    const rows = [...groups.values()].map((g) => {
      const x = g.sumX / g.count, y = g.sumY / g.count;
      return Object.freeze({key:g.key, zoom:bucket, cellSize:cell, count:g.count,
        members:Object.freeze(g.members), x,y, latlng:Object.freeze(unproject(x,y,bucket)),
        bounds:Object.freeze([[g.minLat,g.minLng],[g.maxLat,g.maxLng]].map(Object.freeze)),
        coincident:g.minLng === g.maxLng && g.minLat === g.maxLat});
    });
    return Object.freeze({zoom:bucket, cellSize:cell, inputCount:(features || []).length,
      usableCount:usable, unavailableGeometryCount:(features || []).length - usable,
      groups:Object.freeze(rows)});
  }
  let HouseLayer;
  function create(options = {}) {
    const L = root.L;
    if (!L?.Layer) throw new Error('House points require the existing Leaflet runtime');
    if (!Array.isArray(options.features)) throw new Error('Pass the complete immutable scoped point-feature array');
    if (!/^#[0-9a-f]{6}$/i.test(options.color || '') || !/^#[0-9a-f]{6}$/i.test(options.strokeColor || '')) throw new Error('Pass exact categorical fill and neutral stroke HEX colors');
    if (!HouseLayer) HouseLayer = L.Layer.extend({
      initialize(options) {
        L.setOptions(this, {language:'th', pane:'features', interactive:true, ...options});
        this._features = options.features.slice();
        this._groupCache = new Map(); this._frame = null; this._hostMap = null;
        this._displayGroup = null; this._state = null; this._removed = false;
      },
      onAdd(map) {
        this._hostMap = map; this._removed = false;
        this._renderer = L.canvas({pane:this.options.pane, padding:0.5});
        this._displayGroup = L.layerGroup().addTo(map);
        map.on('zoomend moveend', this._queue, this);
        this._draw();
      },
      onRemove(map) {
        this._removed = true;
        map.off('zoomend moveend', this._queue, this);
        if (this._frame != null) cancelAnimationFrame(this._frame);
        this._frame = null;
        if (this._displayGroup) map.removeLayer(this._displayGroup);
        if (this._renderer && map.hasLayer(this._renderer)) map.removeLayer(this._renderer);
        this._displayGroup = null; this._renderer = null; this._hostMap = null;
      },
      _queue() {
        if (this._frame != null || this._removed) return;
        this._frame = requestAnimationFrame(() => {this._frame = null; if (!this._removed) this._draw();});
      },
      _grouping(zoom) {
        const bucket = Math.max(0,Math.floor(zoom));
        if (!this._groupCache.has(bucket)) {
          this._groupCache.set(bucket,groupAtZoom(this._features,bucket));
          // Retain current and nearby cached views, not unbounded navigation history.
          for (const key of this._groupCache.keys()) if (Math.abs(key - bucket) > 2) this._groupCache.delete(key);
        }
        return this._groupCache.get(bucket);
      },
      _draw() {
        const map = this._hostMap;
        if (!map || !this._displayGroup) return;
        const zoom = map.getZoom(), grouping = this._grouping(zoom), bounds = map.getBounds();
        const nw = project(bounds.getWest(),bounds.getNorth(),grouping.zoom), se = project(bounds.getEast(),bounds.getSouth(),grouping.zoom);
        const padding = 80 / (2 ** (zoom - grouping.zoom));
        const visible = grouping.groups.filter((g) => g.x >= nw.x-padding && g.x <= se.x+padding && g.y >= nw.y-padding && g.y <= se.y+padding);
        this._displayGroup.clearLayers();
        const language = this.options.language === 'en' ? 'en' : 'th';
        const format = (n) => n.toLocaleString(language === 'th' ? 'th-TH' : 'en-US');
        let clusterCount = 0, singletonCount = 0, representedCount = 0;
        const radius = Math.min(6,Math.max(4.5,4.5 + (zoom - 13) * 0.3));
        for (const group of visible) {
          representedCount += group.count;
          if (group.count === 1) {
            singletonCount++;
            const feature = group.members[0], [lng,lat] = feature.geometry.coordinates;
            const point = L.circleMarker([lat,lng], {pane:this.options.pane, renderer:this._renderer,
              radius, fillColor:this.options.color, color:this.options.strokeColor, weight:1.5,
              fillOpacity:1, opacity:1, interactive:this.options.interactive});
            if (this.options.interactive) {
              const number = feature.properties?.houseNumber;
              const label = zoom >= 16 && number ? (language === 'th' ? `บ้านเลขที่ ${number}` : `House number ${number}`) : (feature.properties?.label || feature.properties?.id || (language === 'th' ? 'หมุดบ้านจากต้นทาง' : 'Source house point'));
              point.bindTooltip(esc(label),{sticky:true,direction:'top'});
              point.on('click',(event) => {if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent); this.options.onSelectRecord?.(feature); this.fire('recordselect',{feature});});
            }
            point.addTo(this._displayGroup);
          } else {
            clusterCount++;
            const count = format(group.count);
            const action = this.options.clusterActionLabel || (language === 'th' ? 'เปิดรายการทั้งหมด' : 'open all members');
            const caption = `${count} ${language === 'th' ? 'รายการหมุดบนแผนที่' : 'map point records'} · ${action}`;
            const size = group.count >= 100 ? 38 : group.count >= 10 ? 32 : 26;
            const html = `<button type="button" class="sila-house-cluster-button" aria-label="${esc(caption)}" title="${esc(caption)}"><span class="sila-house-cluster-badge" style="--house-cluster-size:${size}px"><span class="sila-house-cluster-cue" style="background:${this.options.color}" aria-hidden="true"></span><span class="sila-house-cluster-count">${esc(count)}</span></span></button>`;
            const marker = L.marker(group.latlng,{pane:this.options.pane, interactive:this.options.interactive,
              keyboard:false, bubblingMouseEvents:false, icon:L.divIcon({className:'sila-house-cluster',html,iconSize:[44,44],iconAnchor:[22,22]})});
            marker.on('add',() => {
              const button = marker.getElement()?.querySelector('button');
              if (!button) return;
              if (!this.options.interactive) {button.disabled=true; button.tabIndex=-1; return;}
              L.DomEvent.disableClickPropagation(button);
              button.addEventListener('click',(event) => {
                event.preventDefault(); event.stopPropagation();
                const context = {latlng:L.latLng(group.latlng), bounds:L.latLngBounds(group.bounds),
                  zoom:map.getZoom(), bucketZoom:grouping.zoom, groupId:group.key,
                  coincident:group.coincident, count:group.count, pointRecordMeaning:true};
                this.options.onCluster?.(group.members,context);
                this.fire('clusterselect',{members:group.members,context});
              });
            });
            marker.addTo(this._displayGroup);
          }
        }
        this._state = {scopeInputRecordCount:grouping.inputCount, usablePointRecordCount:grouping.usableCount,
          unavailableGeometryCount:grouping.unavailableGeometryCount, bucketZoom:grouping.zoom,
          mapZoom:zoom, gridCellPixelsAtBucket:grouping.cellSize, displayedClusterCount:clusterCount,
          displayedSingletonCount:singletonCount, displayedPointRecordCount:representedCount,
          allScopeGroupCount:grouping.groups.length, viewportOnlyRendering:true,
          sourceCoordinatesChanged:false, scopeMembershipChanged:false,
          clusterMeaning:'map point records, not verified unique households',
          examples:visible.slice(0,12).map((g) => ({groupId:g.key,count:g.count,coincident:g.coincident,
            lat:g.latlng.lat,lng:g.latlng.lng, sourceIds:g.members.slice(0,5).map((f) => f.properties?.id || f.id || null)}))};
        this.fire('displaychange',{display:this.getDisplayState()});
      },
      setLanguage(language) {this.options.language=language === 'en' ? 'en' : 'th'; this._queue(); return this;},
      getDisplayState() {return this._state ? JSON.parse(JSON.stringify(this._state)) : {status:this._removed ? 'removed' : 'not_mounted',scopeInputRecordCount:this._features.length};},
      getBounds() {const points=this._features.filter(validPoint).map((f) => [f.geometry.coordinates[1],f.geometry.coordinates[0]]); return L.latLngBounds(points);},
    });
    return new HouseLayer(options);
  }
  root.SilaHousePoints = Object.freeze({create,version:'1.0.0',internals:Object.freeze({groupAtZoom,project,gridSize})});
})(typeof window === 'undefined' ? globalThis : window);
