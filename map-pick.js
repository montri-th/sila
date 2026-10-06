/* Source-geometry picking for the existing Leaflet map. No rendered z-order,
 * coordinate offset, canvas hit radius, bounding-box substitute or data mutation.
 * Exact interiors/boundaries first; otherwise nearby source edges/points/lines
 * in actual container pixels. Host owns overlapping-hit choice and drill priority.
 */
(function (root) {
  'use strict';
  const EDGE_EPSILON = 1e-10;
  function squaredSegmentDistance(p,a,b) {
    const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy;
    const t=d ? Math.min(1,Math.max(0,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)) : 0;
    const x=p[0]-a[0]-t*dx,y=p[1]-a[1]-t*dy;
    return x*x+y*y;
  }
  function ringRelation(ring,p) {
    if (!Array.isArray(ring) || ring.length<3) return 0;
    let inside=false;
    for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const a=ring[j],b=ring[i];
      if (!a||!b||!Number.isFinite(a[0])||!Number.isFinite(a[1])||!Number.isFinite(b[0])||!Number.isFinite(b[1])) continue;
      if (squaredSegmentDistance(p,a,b)<=EDGE_EPSILON*EDGE_EPSILON) return 2;
      if ((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
    }
    return inside?1:0;
  }
  function polygonContains(rings,p) {
    if (!Array.isArray(rings)||!rings.length) return false;
    const outer=ringRelation(rings[0],p);
    if (outer===2) return true;
    if (!outer) return false;
    for (let i=1;i<rings.length;i++) {
      const hole=ringRelation(rings[i],p);
      if (hole===2) return true; // The hole edge is part of the polygon boundary.
      if (hole===1) return false;
    }
    return true;
  }
  function containsPoint(geometry,p) {
    if (!geometry||!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])) return false;
    const c=geometry.coordinates;
    if (geometry.type==='Polygon') return polygonContains(c,p);
    if (geometry.type==='MultiPolygon') return Array.isArray(c)&&c.some((rings)=>polygonContains(rings,p));
    if (geometry.type==='Point') return Array.isArray(c)&&Math.abs(c[0]-p[0])<=EDGE_EPSILON&&Math.abs(c[1]-p[1])<=EDGE_EPSILON;
    if (geometry.type==='MultiPoint') return Array.isArray(c)&&c.some((q)=>containsPoint({type:'Point',coordinates:q},p));
    if (geometry.type==='LineString') return Array.isArray(c)&&c.some((q,i)=>i>0&&squaredSegmentDistance(p,c[i-1],q)<=EDGE_EPSILON*EDGE_EPSILON);
    if (geometry.type==='MultiLineString') return Array.isArray(c)&&c.some((line)=>containsPoint({type:'LineString',coordinates:line},p));
    if (geometry.type==='GeometryCollection') return (geometry.geometries||[]).some((g)=>containsPoint(g,p));
    return false;
  }
  function geometryBounds(geometry) {
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    function visit(c) {
      if (!Array.isArray(c)) return;
      if (typeof c[0]==='number') {
        if (Number.isFinite(c[0])&&Number.isFinite(c[1])) {minX=Math.min(minX,c[0]);minY=Math.min(minY,c[1]);maxX=Math.max(maxX,c[0]);maxY=Math.max(maxY,c[1]);}
      } else for (const child of c) visit(child);
    }
    if (geometry?.type==='GeometryCollection') {
      for (const g of geometry.geometries||[]) {const b=geometryBounds(g);if(b){minX=Math.min(minX,b[0]);minY=Math.min(minY,b[1]);maxX=Math.max(maxX,b[2]);maxY=Math.max(maxY,b[3]);}}
    } else visit(geometry?.coordinates);
    return Number.isFinite(minX)?Object.freeze([minX,minY,maxX,maxY]):null;
  }
  function pixelDistance(geometry,p,project) {
    let best=Infinity;
    function point(c) {if(!c||!Number.isFinite(c[0])||!Number.isFinite(c[1]))return null;const q=project(c);return [q.x,q.y];}
    function line(c,closed=false) {
      if(!Array.isArray(c)||!c.length)return;
      let prev=point(c[0]);if(prev)best=Math.min(best,(p[0]-prev[0])**2+(p[1]-prev[1])**2);
      for(let i=1;i<c.length;i++){const next=point(c[i]);if(prev&&next)best=Math.min(best,squaredSegmentDistance(p,prev,next));prev=next;}
      if(closed&&prev){const first=point(c[0]);if(first)best=Math.min(best,squaredSegmentDistance(p,prev,first));}
    }
    const c=geometry?.coordinates;
    switch(geometry?.type) {
      case'Point':{const q=point(c);if(q)best=(p[0]-q[0])**2+(p[1]-q[1])**2;break;}
      case'MultiPoint':for(const q of c||[])line([q]);break;
      case'LineString':line(c);break;
      case'MultiLineString':for(const l of c||[])line(l);break;
      case'Polygon':for(const ring of c||[])line(ring,true);break;
      case'MultiPolygon':for(const rings of c||[])for(const ring of rings)line(ring,true);break;
      case'GeometryCollection':for(const g of geometry.geometries||[]){const d=pixelDistance(g,p,project);best=Math.min(best,d*d);}break;
    }
    return Math.sqrt(best);
  }
  function createIndex(features) {
    if (!Array.isArray(features)) throw new TypeError('Pass source features as an array');
    const rows=features.map((feature,ordinal)=>({feature,ordinal,
      id:String(feature.properties?.id??feature.id??feature.properties?.sourceRecord??ordinal),
      bbox:geometryBounds(feature.geometry)})).filter((row)=>row.bbox);
    const compare=(a,b)=>a.distance-b.distance||(a.id<b.id?-1:a.id>b.id?1:0)||a.ordinal-b.ordinal;
    function pick({map,latlng,tolerancePx=12,limit=60}) {
      const lng=Number(latlng?.lng),lat=Number(latlng?.lat);
      if (!map?.latLngToContainerPoint||!map?.containerPointToLatLng||!Number.isFinite(lng)||!Number.isFinite(lat)) return {features:[],total:0,exact:false,nearby:false,hits:[]};
      const tolerance=Math.max(0,Number.isFinite(tolerancePx)?tolerancePx:12);
      const centre=map.latLngToContainerPoint([lat,lng]);
      const corners=[map.containerPointToLatLng([centre.x-tolerance,centre.y-tolerance]),map.containerPointToLatLng([centre.x+tolerance,centre.y+tolerance])];
      const query=[Math.min(...corners.map(p=>p.lng),lng),Math.min(...corners.map(p=>p.lat),lat),Math.max(...corners.map(p=>p.lng),lng),Math.max(...corners.map(p=>p.lat),lat)];
      const candidates=rows.filter(({bbox:b})=>b[0]<=query[2]&&b[2]>=query[0]&&b[1]<=query[3]&&b[3]>=query[1]);
      let matches=candidates.filter(({feature})=>containsPoint(feature.geometry,[lng,lat])).map((row)=>({...row,distance:0}));
      const exact=matches.length>0;
      if(!exact){const project=(xy)=>map.latLngToContainerPoint([xy[1],xy[0]]);matches=candidates.map(row=>({...row,distance:pixelDistance(row.feature.geometry,[centre.x,centre.y],project)})).filter(row=>row.distance<=tolerance+1e-8);}
      matches.sort(compare);
      const count=Number.isFinite(limit)?Math.max(0,Math.floor(limit)):matches.length;
      const selected=matches.slice(0,count);
      return {features:selected.map(row=>row.feature),total:matches.length,exact,nearby:!exact&&matches.length>0,
        hits:selected.map(row=>({id:row.id,distancePx:row.distance,exact})),tolerancePx:tolerance,
        returnedCount:selected.length,sourceInputCount:features.length,indexedGeometryCount:rows.length};
    }
    return Object.freeze({pick,getInfo:()=>Object.freeze({sourceInputCount:features.length,indexedGeometryCount:rows.length,originalGeometryRetained:true})});
  }
  root.SilaMapPick=Object.freeze({containsPoint,createIndex,version:'1.0.0'});
})(typeof window==='undefined'?globalThis:window);
