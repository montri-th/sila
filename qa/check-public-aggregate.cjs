/* Bounded public-exposure and financial-state checks. No private source input. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const dataPath=process.argv[2] || path.join(root,'data/municipal-summary.json');
const env={};vm.createContext(env);vm.runInContext(fs.readFileSync(path.join(root,'public-aggregate.js'),'utf8'),env);
const api=env.SilaPublicAggregates,payload=JSON.parse(fs.readFileSync(dataPath,'utf8'));
assert(api.valid(payload));assert.equal(api.entries(payload).length,4);
assert.equal(api.entries(payload).map(d=>d.id).join(','),'tax,business,animals,healthservices');
const forbiddenKeys=new Set(['owner','ownerName','patientId','citizenId','houseNumber','deed_number','survey_number','land_no','assessmentId','receiptId','catalog_row_index0','latitude','longitude','geometry','coordinates','rows','records','individuals','source_record_1based']);
function scan(v){if(Array.isArray(v))return v.forEach(scan);if(v&&typeof v==='object'){for(const [k,x]of Object.entries(v)){assert(!forbiddenKeys.has(k),'Individual/location/locator field in public payload: '+k);scan(x);}}else if(typeof v==='string'){assert(!/SILA-(?:PROP|WORK)-|https?:\/\/|file:\/\/|\/Users\//.test(v),'Raw linkage/URL/private path in public summary');}}
scan(payload);
for(const id of api.ids)for(const language of ['th','en'])for(const tab of ['overview','list','source']){
 const html=api.render(payload,id,{language,tab,scopeLabel:'Village 26'});
 assert(html.includes('aggregate-view'));assert(html.includes('Village 26'));
 assert(!html.includes('data-export'));assert(!html.includes('href='));assert(!html.includes('data-record'));
}
assert.equal(api.valueLabel({value:0},'en').number,'0');assert.equal(api.valueLabel({value:null},'en').number,'—');
assert.notEqual(api.valueLabel({value:null,state:'suppressed'},'en').state,api.valueLabel({value:null},'en').state);
const amount=payload.datasets.find(d=>d.id==='tax').metrics.find(m=>m.id==='source_received_amount_thb');
assert.equal(api.valueLabel(amount,'en').number,'23,074,139.17');
const gain=payload.datasets.find(d=>d.id==='tax').metrics.find(m=>m.id==='actual_uplift_thb');assert.equal(gain.value,null);
const bad=structuredClone(payload);bad.recordDetailsAvailable=true;assert(!api.valid(bad));assert.equal(api.entries(bad).length,0);
const badDownload=structuredClone(payload);badDownload.datasets[0].sources[0].publicDownload=true;assert(!api.valid(badDownload));
const escaped=structuredClone(payload);escaped.datasets[0].metrics[0].note.th='<script>alert(1)</script>';assert(!api.render(escaped,'tax',{language:'th'}).includes('<script>'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'),'utf8'));
assert.equal(catalog.datasets.length,16);assert.equal(catalog.datasets.find(d=>d.id==='health').count,4);
assert.equal(catalog.datasets.filter(d=>api.ids.includes(d.id)).length,0);
console.log(JSON.stringify({status:'passed',viewLanguageTabCombinations:24,originalGISDatasets:16,additionalMunicipalViews:4,unknownGainIsNull:true,zeroUnknownWithheldDistinct:true,individualSourceExport:false,rawLinkageKeysExcluded:true,scopeMeaning:'municipality-wide independent of selected map context'}));
