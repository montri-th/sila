'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const api = require('../fabdem-layer.js');
const t = api._test;
let checks = 0;
const check = (name, fn) => { fn(); checks++; };
check('Terrarium zero is measured zero', () => assert.equal(api.decodeHeight(128, 0, 0, 255), 0));
check('negative elevation', () => assert.equal(api.decodeHeight(127, 255, 0, 255), -1));
check('fractional elevation', () => assert.equal(api.decodeHeight(128, 163, 178, 255), 163.6953125));
check('transparent pixel is unavailable, not zero', () => assert.equal(api.decodeHeight(128, 0, 0, 0), null));
const ring = [[0,0],[10,0],[10,10],[0,10],[0,0]], hole = [[3,3],[7,3],[7,7],[3,7],[3,3]];
const polygon = [[ring, hole]];
check('inside outer ring', () => assert.equal(t.pointInCoverage([2,2], polygon), true));
check('hole excluded', () => assert.equal(t.pointInCoverage([5,5], polygon), false));
check('outside tile skipped', () => assert.equal(t.intersectsBounds([11,11,12,12], polygon), false));
check('tile wholly inside hole skipped', () => assert.equal(t.intersectsBounds([4,4,6,6], polygon), false));
check('tile crossing hole edge fetched then clipped', () => assert.equal(t.intersectsBounds([2,4,4,6], polygon), true));
check('tile enclosing polygon intersects', () => assert.equal(t.intersectsBounds([-1,-1,11,11], polygon), true));
check('thin boundary crossing tile detected', () => assert.equal(t.intersectsBounds([4,-1,6,1], polygon), true));
const multi = t.polygonsOf({type:'MultiPolygon',coordinates:[[[[0,0],[1,0],[1,1],[0,1],[0,0]]],[[[20,20],[21,20],[21,21],[20,21],[20,20]]]]});
check('multipolygon disjoint member', () => assert.equal(t.pointInCoverage([20.5,20.5], multi), true));
check('multipolygon empty gap skipped', () => assert.equal(t.intersectsBounds([5,5,6,6], multi), false));
check('world XYZ bounds', () => { const b=t.tileBounds({z:0,x:0,y:0}); assert.equal(b[0],-180); assert.equal(b[2],180); assert.ok(Math.abs(b[3]-85.05112878)<1e-7); });
check('evenodd ring clipping used', () => {
  const calls=[]; const ctx={beginPath(){},moveTo(){},lineTo(){},closePath(){calls.push('ring')},clip(x){calls.push(x)}};
  t.clipCoverage(ctx, polygon, {z:0,x:0,y:0},256); assert.deepEqual(calls,['ring','ring','evenodd']);
});
check('all unavailable remains transparent', () => { const a=t.renderHillshade(new Uint8ClampedArray(3*3*4),3,3,30); assert.ok(a.every(v=>v===0)); });
check('valid flat zero remains distinct from no-data before rendering', () => {
  const a=new Uint8ClampedArray(3*3*4); for(let i=0;i<9;i++){a[i*4]=128;a[i*4+3]=255;}
  assert.equal(api.decodeHeight(...a.slice(0,4)),0); assert.ok(t.renderHillshade(a,3,3,30).filter((_,i)=>i%4===3).every(v=>v===0));
});
check('nodata is not bridged by neighboring height slope', () => {
 const a=new Uint8ClampedArray(3*3*4); for(let i=0;i<9;i++){a[i*4]=128;a[i*4+1]=100;a[i*4+3]=255;}
 a[4*4+3]=0; const o=t.renderHillshade(a,3,3,30); assert.equal(o[4*4+3],0);
});
check('source fixed native zoom and verified tile URL', () => { assert.equal(api.defaultSource.maxNativeZoom,12);assert.ok(api.defaultSource.tileUrl.includes('/z12-20261007/fabdem/'));assert.equal(api.defaultSource.verticalDatum,null); });
const coverage=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/terrain-coverage.geojson'),'utf8'));
check('district 4001 only',()=>assert.equal(coverage.properties.district_code,'4001'));
check('real district covers probe tile centre',()=>assert.ok(t.pointInCoverage([102.83,16.45],t.polygonsOf(coverage))));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const receipt={schema_version:'1.0',date:'2026-10-19',scope:'bounded deterministic math/geometry/no-data fixtures; no browser or full regional DEM coverage attestation',checks,passed:checks,failed:0,files:{module_sha256:hash(path.join(__dirname,'../fabdem-layer.js')),coverage_sha256:hash(path.join(__dirname,'../data/terrain-coverage.geojson')),tests_sha256:hash(__filename)},browser_qa:'qa/revision-1.5-browser-checks.json',raw_dem_tiles_packaged:0};
fs.writeFileSync(path.join(__dirname,'revision-1.5-terrain-fixtures.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({checks,passed:checks,failed:0}));
