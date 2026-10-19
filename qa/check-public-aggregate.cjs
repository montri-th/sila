/* Bounded public-exposure and financial-state checks. No private source input. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const dataPath=process.argv[2] || path.join(root,'data/municipal-summary.json');
const env={};vm.createContext(env);vm.runInContext(fs.readFileSync(path.join(root,'public-aggregate.js'),'utf8'),env);
const api=env.SilaPublicAggregates,payload=JSON.parse(fs.readFileSync(dataPath,'utf8'));
assert(api.valid(payload));assert.equal(api.entries(payload).length,payload.datasets.length);
assert.equal(api.requiredIds.join(','),'tax,business,animals,healthservices');
assert(payload.datasets.length===4||payload.datasets.length===5);
const forbiddenKeys=new Set(['owner','ownerName','patientId','citizenId','houseNumber','deed_number','survey_number','land_no','assessmentId','receiptId','catalog_row_index0','latitude','longitude','geometry','coordinates','rows','records','individuals','source_record_1based']);
function scan(v,at=''){if(Array.isArray(v))return v.forEach((x,i)=>scan(x,at+'/'+i));if(v&&typeof v==='object'){for(const [k,x]of Object.entries(v)){const breakdownRows=k==='rows'&&/^\/datasets\/\d+\/breakdowns\/\d+$/.test(at);assert(!forbiddenKeys.has(k)||breakdownRows,'Individual/location/locator field in public payload: '+k);scan(x,at+'/'+k);}}else if(typeof v==='string'){assert(!/SILA-(?:PROP|WORK)-|https?:\/\/|file:\/\/|\/Users\//.test(v),'Raw linkage/URL/private path in public summary');}}
scan(payload);
for(const id of payload.datasets.map(d=>d.id))for(const language of ['th','en'])for(const tab of ['overview','list','source']){
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
const missingRequired=structuredClone(payload);missingRequired.datasets=missingRequired.datasets.filter(d=>d.id!=='tax');assert(!api.valid(missingRequired));
const duplicate=structuredClone(payload);duplicate.datasets.push(structuredClone(duplicate.datasets[0]));assert(!api.valid(duplicate));
const unknown=structuredClone(payload);unknown.datasets.push({...structuredClone(unknown.datasets[0]),id:'person_records'});assert(!api.valid(unknown));
// Optional cohort compatibility is checked independently of whether the current approved batch contains it.
const withCare=structuredClone(payload);
if(!withCare.datasets.some(d=>d.id==='caregroups'))withCare.datasets.push({...structuredClone(withCare.datasets.find(d=>d.id==='healthservices')),id:'caregroups',coverage:'supplied_service_cohort_only',label:{th:'กลุ่มทดสอบ',en:'Test cohort'}});
const care=withCare.datasets.find(d=>d.id==='caregroups');care.breakdowns=[{id:'fixture',label:{th:'ตารางทดสอบ',en:'Test table'},note:{th:'ข้อมูลทดสอบ',en:'Fixture only'},rows:[{id:'fixture-count',value:10,label:{th:'ประเภททดสอบ',en:'Test category'},unit:{th:'รายการ',en:'records'},note:{th:'ทดสอบเฉพาะตัวแสดงผล',en:'Renderer fixture only'},sourceIds:[]}]}];
assert(api.valid(withCare));assert.equal(api.entries(withCare).length,5);scan(withCare);
for(const language of ['th','en']){const html=api.render(withCare,'caregroups',{language});assert(html.includes('<table>'));assert(html.includes('scope="row"'));assert(html.includes('10'));assert(!html.includes('href='));}
const brokenCoverage=structuredClone(withCare);brokenCoverage.datasets.find(d=>d.id==='caregroups').coverage='all_patients';assert(!api.valid(brokenCoverage));
const brokenBreakdown=structuredClone(withCare);brokenBreakdown.datasets.find(d=>d.id==='caregroups').breakdowns[0].rows[0].value='not a number';assert(!api.valid(brokenBreakdown));
const escapedBreakdown=structuredClone(withCare);escapedBreakdown.datasets.find(d=>d.id==='caregroups').breakdowns[0].rows[0].label.th='<script>bad</script>';assert(!api.render(escapedBreakdown,'caregroups',{language:'th'}).includes('<script>'));
const escaped=structuredClone(payload);escaped.datasets[0].metrics[0].note.th='<script>alert(1)</script>';assert(!api.render(escaped,'tax',{language:'th'}).includes('<script>'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'),'utf8'));
assert.equal(catalog.datasets.length,16);assert.equal(catalog.datasets.find(d=>d.id==='health').count,4);
assert.equal(catalog.datasets.filter(d=>api.ids.includes(d.id)).length,0);
const actualCare=payload.datasets.find(d=>d.id==='caregroups');
if(actualCare){assert.equal(actualCare.metrics.find(m=>m.id==='current_patient_census').value,null);const flags=actualCare.breakdowns.find(b=>b.id==='condition-source-terms');const allowed=new Set(['recorded-HT','recorded-DM','recorded-STROKE','recorded-DLP','recorded-CVA','recorded-CKD']);assert.equal(flags.rows.length,6);assert(flags.rows.every(m=>allowed.has(m.id)&&m.value>=10));assert.deepEqual(Array.from(actualCare.breakdowns.find(b=>b.id==='care-group-counts').rows,m=>m.value),[70,55,23,46]);}
console.log(JSON.stringify({status:'passed',viewLanguageTabCombinations:payload.datasets.length*6,originalGISDatasets:16,additionalMunicipalViews:payload.datasets.length,optionalCareCohortAndBreakdownCompatibility:true,unknownGainIsNull:true,zeroUnknownWithheldDistinct:true,individualSourceExport:false,rawLinkageKeysExcluded:true,scopeMeaning:'Source aggregates independent of selected map context; care cohort is not all municipal patients'}));
