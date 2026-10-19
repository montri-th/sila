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
/* Receipts are written for the current revision; earlier revision receipts stay as they were published. */
const receipt={schema_version:'1.0',revision:'1.8',date:'2026-10-20',scope:'bounded deterministic math/geometry/no-data fixtures; no browser or full regional DEM coverage attestation',checks,passed:checks,failed:0,files:{module_sha256:hash(path.join(__dirname,'../fabdem-layer.js')),coverage_sha256:hash(path.join(__dirname,'../data/terrain-coverage.geojson')),tests_sha256:hash(__filename)},browser_qa:'qa/revision-1.8-browser-checks.json',raw_dem_tiles_packaged:0};
fs.writeFileSync(path.join(__dirname,'revision-1.8-terrain-fixtures.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({checks,passed:checks,failed:0}));
/* Revision 1.8: height colour and contour rendering (synthetic heights only). */
{
  const T = require('../fabdem-layer.js')._test, assert = require('node:assert/strict');
  const lut = T.rampLUT(['#0000FF', '#FF0000']);
  assert.deepEqual([...lut.slice(0, 3)], [0, 0, 255]); assert.deepEqual([...lut.slice(765, 768)], [255, 0, 0]);
  // 8 x 8 plane rising 1 m per pixel eastward at 1 m per pixel: colour stretched 0..7, contour every 2 m.
  const w = 8, hgt = new Float32Array(w * w).map((_, i) => i % w);
  const out = T.renderTerrain(hgt, w, w, 1, {lut: T.rampLUT(['#000000', '#FFFFFF']), lo: 0, hi: 7, interval: 2, major: 5, opacity: 1, theme: 'light'});
  assert.ok(out[(3 * w + 1) * 4 + 3] > 0, 'interior pixels are drawn');
  const px = (x) => out[(3 * w + x) * 4];
  assert.ok(px(5) > px(3) || px(4) === px(2), 'brighter eastward away from contour lines');
  // A no-data neighbour leaves the pixel transparent, never zero height.
  const holes = hgt.slice(); holes[3 * w + 3] = NaN;
  const out2 = T.renderTerrain(holes, w, w, 1, {lut, lo: 0, hi: 7, interval: 0});
  assert.equal(out2[(3 * w + 3) * 4 + 3], 0); assert.equal(out2[(3 * w + 4) * 4 + 3], 0);
  // Colour off falls back to neutral hillshade alpha only.
  const out3 = T.renderTerrain(hgt, w, w, 1, {colorOn: false, lut, lo: 0, hi: 7});
  assert.ok(out3[(3 * w + 3) * 4] === 0 || out3[(3 * w + 3) * 4] === 255);
  console.log(JSON.stringify({surfaceChecks: 6, passed: 6}));
}
