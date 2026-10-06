/* Meaningful invariant fixtures: immutable source records, identical-coordinate
 * reachability at max zoom, grid edge behavior, and stable pan-independent groups. */
const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');
const context={console};vm.createContext(context);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../house-points.js'),'utf8'),context);
const {groupAtZoom,project,gridSize}=context.SilaHousePoints.internals;
const f=(id,lng,lat)=>Object.freeze({type:'Feature',properties:Object.freeze({id}),geometry:Object.freeze({type:'Point',coordinates:Object.freeze([lng,lat])})});
const fixtures=Object.freeze([f('a',102.855,16.485),f('b',102.855,16.485),f('c',102.855,16.485),f('d',102.856,16.485),f('e',102.86,16.49)]);
const before=JSON.stringify(fixtures);let checks=0;function ok(test){assert.ok(test);checks++;}
for(const z of [8,13,15,17,20]){const result=groupAtZoom(fixtures,z);ok(result.usableCount===5);ok(result.groups.reduce((s,g)=>s+g.count,0)===5);ok(new Set(result.groups.flatMap(g=>g.members.map(x=>x.properties.id))).size===5);const again=groupAtZoom(fixtures,z);ok(JSON.stringify(result.groups.map(g=>[g.key,g.members.map(x=>x.properties.id)]))===JSON.stringify(again.groups.map(g=>[g.key,g.members.map(x=>x.properties.id)])));}
const coincident=groupAtZoom(fixtures.slice(0,3),20);ok(coincident.groups.length===1&&coincident.groups[0].count===3&&coincident.groups[0].coincident);ok(coincident.groups[0].members[2]===fixtures[2]);ok(JSON.stringify(fixtures)===before);
const z=13,cell=gridSize(z),world=256*2**z;const edgeX=Math.floor(project(102.855,16.485,z).x/cell)*cell;const lng=(x)=>x/world*360-180;const edge=groupAtZoom([f('left',lng(edgeX-0.01),16.485),f('right',lng(edgeX+0.01),16.485)],z);ok(edge.groups.length===2);ok(edge.groups.reduce((s,g)=>s+g.count,0)===2);
const invalid=groupAtZoom([f('bad',NaN,16.4),fixtures[0]],13);ok(invalid.inputCount===2&&invalid.usableCount===1&&invalid.unavailableGeometryCount===1);
console.log(JSON.stringify({status:'passed',checks,scope:'pure grouping invariants, not browser rendering/touch/performance'},null,2));
