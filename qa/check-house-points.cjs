/* Source-preservation and Canvas integration checks, including the actual house
 * package. Browser contrast, touch and frame timing are checked separately. */
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
let checks=0;
function ok(value,message){assert.ok(value,message);checks++;}
const handlers=new Map();
let canvasCount=0,pointCount=0;
const L={
  Layer:{extend(methods){class Layer{constructor(options){this.events=[];methods.initialize.call(this,options);}fire(type,payload){this.events.push({type,payload});return this;}}Object.assign(Layer.prototype,methods);return Layer;}},
  setOptions(layer,options){layer.options=options;},
  canvas(options){canvasCount++;return {options,_container:{attributes:{},setAttribute(name,value){this.attributes[name]=value;}}};},
  layerGroup(){return {markers:[],addTo(map){map.layers.add(this);return this;}};},
  circleMarker(latlng,options){pointCount++;return {latlng,options,listeners:{},bindTooltip(content,config){this.tooltip=content;this.tooltipConfig=config;return this;},on(type,fn){this.listeners[type]=fn;return this;},addTo(group){group.markers.push(this);return this;},setRadius(radius){this.options.radius=radius;return this;},setStyle(style){Object.assign(this.options,style);return this;},getLatLng(){return {lat:this.latlng[0],lng:this.latlng[1]};}};},
  latLngBounds(points){return {points};},
  DomEvent:{stopPropagation(event){event.stopped=true;}},
  marker(){throw new Error('DOM markers must not replace source points');},
  divIcon(){throw new Error('Count badges must not replace source points');},
};
const context={L};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../house-points.js'),'utf8'),context);
const api=context.SilaHousePoints;
const f=(id,lng,lat)=>Object.freeze({type:'Feature',properties:Object.freeze({id,houseNumber:id}),geometry:Object.freeze({type:'Point',coordinates:Object.freeze([lng,lat])})});
const fixtures=Object.freeze([f('a',102.855,16.485),f('b',102.855,16.485),f('c',102.855,16.485),f('d',102.856,16.485),f('e',102.86,16.49)]);
const before=JSON.stringify(fixtures);
const plan=api.internals.preparePoints(fixtures);
ok(plan.inputCount===5&&plan.usableCount===5&&plan.unavailableGeometryCount===0,'all source rows retained');
ok(plan.features[0]===fixtures[0]&&plan.features[2]===fixtures[2],'coincident sources stay separate and retain identity');
const invalid=api.internals.preparePoints([f('bad',NaN,16.4),fixtures[0],{geometry:null},f('bad-lat',102,90)]);
ok(invalid.inputCount===4&&invalid.usableCount===1&&invalid.unavailableGeometryCount===3,'unusable geometry reported separately');
for(const zoom of [0,8,10,13,15,17,20,24]){const a=api.internals.pointAppearance(zoom);ok(a.radius>=1.8&&a.radius<=5.5&&a.weight>=1&&a.weight<=1.5,'bounded visible radius/rim at every zoom');}
function map(zoom){return {zoom,layers:new Set(),getZoom(){return this.zoom;},on(type,fn,self){handlers.set(this,{type,fn,self});},off(type,fn,self){const h=handlers.get(this);assert.deepEqual(h,{type,fn,self});handlers.delete(this);},hasLayer(layer){return this.layers.has(layer);},removeLayer(layer){this.layers.delete(layer);}};}
let picked=null,fallback=null;
const layer=api.create({features:fixtures,color:'#7BD0A3',strokeColor:'#182327',onPickPoint:p=>{picked=p;},onSelectRecord:f=>{fallback=f;}});
const host=map(8);layer.onAdd(host);
ok(layer._markers.length===5&&pointCount===5&&canvasCount===1,'one Canvas marker per input point');
ok(layer._renderer._container.attributes['data-house-point-count']==='5'&&layer._renderer._container.attributes['data-house-display']==='all-points','owned Canvas exposes bounded source-point count');
ok(layer._markers.every(m=>m.options.renderer===layer._renderer&&m.options.fillColor==='#7BD0A3'&&m.options.color==='#182327'&&m.options.fillOpacity===1&&m.options.opacity===1),'same Canvas and exact source colors/opacity');
ok(layer._markers.every(m=>m.options.bubblingMouseEvents===false),'point event cannot dispatch a second Leaflet map click that overrides the chooser');
ok(JSON.stringify(layer._markers.map(m=>m.latlng))===JSON.stringify(fixtures.map(f=>[f.geometry.coordinates[1],f.geometry.coordinates[0]])),'every original coordinate preserved');
const originalEvent={};const clickedAt={lat:16.48501,lng:102.85502};layer._markers[0].listeners.click({latlng:clickedAt,originalEvent});
ok(originalEvent.stopped&&picked.latlng===clickedAt&&picked.originalEvent===originalEvent&&!fallback,'host chooser receives actual click location before single-record fallback');
const sourceMarkers=layer._markers.slice();host.zoom=20;handlers.get(host).fn.call(layer);
ok(layer._markers.every((m,i)=>m===sourceMarkers[i])&&pointCount===5,'zoom retains every point, no recomputation or hidden display cap');
ok(layer._renderer._container.attributes['data-house-zoom']==='20'&&Number(layer._renderer._container.attributes['data-house-radius'])===api.internals.pointAppearance(20).radius,'Canvas observability follows zoom/radius');
const state=layer.getDisplayState();
ok(state.renderedPointCount===5&&state.usablePointRecordCount===5&&state.displayedClusterCount===0&&state.aggregationEnabled===false&&state.displayLimit===null,'counts explicitly report individual points');
ok(state.viewportOnlyRendering===false&&state.rendererClipsToViewport===true,'all sources materialized; only Canvas clipping limits visible pixels');
layer.setLanguage('en');ok(layer._markers[0].tooltip().includes('House number a'),'tooltip label follows current language');
ok(layer.getBounds().points.length===5,'full source bounds');layer.onRemove(host);
ok(layer.getDisplayState().status==='removed'&&layer.getDisplayState().renderedPointCount===0&&!handlers.has(host),'renderer/layer/listener cleanup');
ok(JSON.stringify(fixtures)===before,'input feature array never mutated');
const fallbackLayer=api.create({features:[fixtures[0]],color:'#7BD0A3',strokeColor:'#182327',onSelectRecord:f=>{fallback=f;}});const fallbackMap=map(13);fallbackLayer.onAdd(fallbackMap);fallbackLayer._markers[0].listeners.click({originalEvent:{}});ok(fallback===fixtures[0],'original onSelectRecord fallback remains compatible');fallbackLayer.onRemove(fallbackMap);
const actual=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/houses.geojson'),'utf8')).features;
const actualBefore=JSON.stringify(actual);
const full=api.create({features:actual,color:'#7BD0A3',strokeColor:'#182327',interactive:false});const actualMap=map(8);full.onAdd(actualMap);
ok(actual.length===28783&&full.getDisplayState().renderedPointCount===28783,'all 28,783 source points materialized at overview zoom');
ok(full._renderer._container.attributes['data-house-point-count']==='28783','actual full package count exposed on owned Canvas');
ok(full._markers.every((m,i)=>m.latlng[0]===actual[i].geometry.coordinates[1]&&m.latlng[1]===actual[i].geometry.coordinates[0]),'full actual source coordinate parity');
const refs=full._markers.slice();actualMap.zoom=20;handlers.get(actualMap).fn.call(full);
ok(full.getDisplayState().renderedPointCount===28783&&full._markers.every((m,i)=>m===refs[i]),'actual full count persists at detailed zoom');
ok(JSON.stringify(actual)===actualBefore,'actual source package remains unchanged');full.onRemove(actualMap);
console.log(JSON.stringify({status:'passed',checks,sourceRecords:actual.length,displayMode:'individual_source_points',aggregationEnabled:false,scope:'source coordinate/count preservation and Canvas API integration with test doubles; not browser contrast/touch/performance'},null,2));
