/* Hand-worked checks for the portfolio tax engine (tax-engine.js).
   Cases follow the Land and Building Tax Act 2562 s.38, 40, 41, 42 para 2 and the Royal Decree 2564 rates.
   Synthetic inputs only; no municipal records. Usage: node qa/check-tax-engine.cjs */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('node:assert/strict');
const env = {}; vm.createContext(env);
for (const f of ['tax-calculator.js', 'tax-engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), env);
const E = env.SilaTaxEngine;
let checks = 0;
const eq = (a, b, msg) => { assert.equal(Math.round(a * 100) / 100, Math.round(b * 100) / 100, msg); checks++; };
const fields = ['id', 'v', 'price', 'sqwa', 'landValue', 'use', 'shares', 'mainHome', 'bldValue', 'tp', 'tax69', 'grp', 'rented', 'comShare', 'surveyBld'];
const row = (o) => fields.map((k) => o[k] ?? null);
function model(parcels, taxpayers) {
  return E.prepare({schema: 'sila-parcel-tax-1', asOf: '2026-10-19', taxYear: 2569, fields, parcels: parcels.map(row), taxpayers});
}
const law = (m, key, set, factor = 1) => {
  const rows = m.parcels.filter((p) => p.tp === key);
  const opts = {landFactor: factor, combine: set.has('combine'), agriShare: set.has('agriShare'), mainHome: (p) => !(set.has('rented') && p.rented),
    commercialShare: set.has('mixedUse') ? (p) => p.comShare || 0 : null,
    building: set.has('newBuildings') ? (p) => (p.bldValue == null || p.bldValue <= 0) && p.surveyBld > 0 ? p.surveyBld : (p.bldValue || 0) : null};
  const out = E._test.portfolioTax(rows, m.taxpayers.get(key), opts);
  return [...out.values()].reduce((a, b) => a + b, 0);
};

// 1 Two adjoining commercial parcels of one owner: land 30M + 30M, buildings 6M + 4M.
const m1 = model([
  {id: 'a', landValue: 30e6, bldValue: 6e6, use: 'other', tp: 'T1', grp: 1, tax69: 108000},
  {id: 'b', landValue: 30e6, bldValue: 4e6, use: 'other', tp: 'T1', grp: 1, tax69: 102000},
], {T1: {type: 'individual', assessed69: 210000, paid69: 210000}});
eq(law(m1, 'T1', new Set()), 210000, 'separate bases 36M + 34M at 0.3%');
eq(law(m1, 'T1', new Set(['combine'])), 230000, 'combined base 70M: 50M x 0.3% + 20M x 0.4%');
// 2 Same parcels without a shared group stay separate even with the fix on.
const m2 = model([
  {id: 'a', landValue: 30e6, bldValue: 6e6, use: 'other', tp: 'T1', tax69: 108000},
  {id: 'b', landValue: 30e6, bldValue: 4e6, use: 'other', tp: 'T1', tax69: 102000},
], {T1: {type: 'individual', assessed69: 210000, paid69: 0}});
eq(law(m2, 'T1', new Set(['combine'])), 210000, 'non-adjoining parcels are not combined');
// 3 Farm parcels of one individual, not adjoining: 30M + 30M.
const m3 = model([
  {id: 'f1', landValue: 30e6, use: 'agri', tp: 'T2', tax69: 0},
  {id: 'f2', landValue: 30e6, use: 'agri', tp: 'T2', tax69: 0},
], {T2: {type: 'individual', assessed69: 0, paid69: 0}});
eq(law(m3, 'T2', new Set()), 0, '50M allowance wrongly given to each parcel');
eq(law(m3, 'T2', new Set(['agriShare'])), 1000, 'one 50M allowance: 10M x 0.01%');
// 4 Juristic farm owner gets no allowance: 60M x 0.01%.
const m4 = model([{id: 'j', landValue: 60e6, use: 'agri', tp: 'T3', tax69: 6000}], {T3: {type: 'juristic', assessed69: 6000, paid69: 6000}});
eq(law(m4, 'T3', new Set(['agriShare'])), 6000, 'juristic farm 60M');
// 5 Main home 60M: (60 - 50)M x 0.03%.
const m5 = model([{id: 'h', landValue: 50e6, bldValue: 10e6, use: 'res', mainHome: 1, tp: 'T4', tax69: 3000, rented: 1}], {T4: {type: 'individual', assessed69: 3000, paid69: 1500}});
eq(law(m5, 'T4', new Set()), 3000, 'main home 60M');
// 6 The same house rented out: other residence 50M x 0.02% + 10M x 0.03%.
eq(law(m5, 'T4', new Set(['rented'])), 13000, 'rented house loses main-home relief');
// 7 Main home 5M with 40% commercial floors: home part 3M exempt, shop 2M x 0.3%.
const m7 = model([{id: 's', landValue: 3e6, bldValue: 2e6, use: 'res', mainHome: 1, tp: 'T5', tax69: 0, comShare: 0.4}], {T5: {type: 'individual', assessed69: 0, paid69: 0}});
eq(law(m7, 'T5', new Set(['mixedUse'])), 6000, 'mixed use split');
// 8 Surveyed building missing from the roll: land 1M + building 2M, other use.
const m8 = model([{id: 'n', landValue: 1e6, bldValue: null, surveyBld: 2e6, use: 'other', tp: 'T6', tax69: 3000}], {T6: {type: 'juristic', assessed69: 3000, paid69: 3000}});
eq(law(m8, 'T6', new Set()), 3000, 'roll without the building');
eq(law(m8, 'T6', new Set(['newBuildings'])), 9000, 'building added: 3M x 0.3%');
// 9 run(): with no fixes and unchanged prices, 2570 equals 2569; the fix gap equals the law effect.
const r0 = E.run(m1, {strategies: new Set(), appraisalAdjPct: 0});
eq(r0.totals.old70, 210000, 'current method keeps 2569 when prices are unchanged');
eq(r0.totals.new70, r0.totals.old70, 'no fixes means no gap');
const r1 = E.run(m1, {strategies: new Set(['combine']), appraisalAdjPct: 0});
eq(r1.totals.new70 - r1.totals.old70, 20000, 'combine adds exactly 20,000');
assert.equal(r1.byStrategy[0].parcels, 2); checks++;
// 10 Prices +20%: 2570 current method scales each parcel by its own law-based change.
const r2 = E.run(m1, {strategies: new Set(), appraisalAdjPct: 20});
eq(r2.byParcel.get('a').old70, 108000 * ((36e6 + 0.2 * 30e6) * 0.003) / (36e6 * 0.003), 'parcel a scaled by its own law change');
// 11 Payment allocation: half paid means each parcel collected at half.
const r3 = E.run(m5, {strategies: new Set(), appraisalAdjPct: 0});
eq(r3.byParcel.get('h').collected69, 1500, 'collected allocated by payment ratio');
assert.equal(r3.byParcel.get('h').status69, 'partial'); checks++;
// 12 Missing 2569 tax stays missing (never zero).
const m12 = model([{id: 'x', landValue: 1e6, use: 'other', tp: 'T7', tax69: null}], {T7: {type: 'individual', assessed69: null, paid69: null}});
const r4 = E.run(m12, {strategies: new Set(['combine']), appraisalAdjPct: 0});
assert.equal(r4.byParcel.get('x').old70, null); assert.equal(r4.byParcel.get('x').collected69, null); checks += 2;
// 13 Titles without a taxpayer stand alone; owner-based fixes are unavailable when most titles lack a taxpayer.
const m13 = model([
  {id: 'u1', landValue: 30e6, bldValue: 6e6, use: 'other', tax69: 108000, grp: 1},
  {id: 'u2', landValue: 30e6, bldValue: 4e6, use: 'other', tax69: 102000, grp: 1},
], {});
assert.equal(m13.availability.combine, false); assert.equal(m13.availability.agriShare, false); assert.equal(m13.availability.newBuildings, true); checks += 3;
const r13 = E.run(m13, {strategies: new Set(['combine', 'agriShare']), appraisalAdjPct: 0});
eq(r13.totals.old70, 210000, 'standalone titles keep their own 2569 tax');
eq(r13.totals.new70, r13.totals.old70, 'unavailable fixes change nothing');
assert.equal(r13.byParcel.get('u1').collected69, null); assert.equal(r13.byParcel.get('u1').status69, 'unknown'); checks += 2;
// 14 A surveyed building missing from the roll adds to the buildings already on the roll: land 1M + roll 1M + missing 2M.
const m14 = model([{id: 'b', landValue: 1e6, bldValue: 1e6, surveyBld: 2e6, use: 'other', tax69: 6000}], {});
const r14 = E.run(m14, {strategies: new Set(['newBuildings']), appraisalAdjPct: 0});
eq(r14.byParcel.get('b').new70 - r14.byParcel.get('b').old70, 6000, 'missing 2M at 0.3% adds 6,000');
console.log(JSON.stringify({status: 'passed', checks, scope: 'Synthetic portfolio cases for s.38, 40, 41, 42 para 2 and the 2570 anchoring rule; not an assessment'}));
// 15 A title the roll already splits into residential and other use is not split again by the survey share.
{
  const m15 = model([{id: 'z', landValue: 3e6, bldValue: 2e6, use: 'mixed', shares: {res: 0.6, other: 0.4}, mainHome: 1, tp: 'T9', tax69: 6000, comShare: 0.5}], {T9: {type: 'individual', assessed69: 6000, paid69: 6000}});
  eq(law(m15, 'T9', new Set(['mixedUse'])), law(m15, 'T9', new Set()), 'existing other-use share is not split twice');
  console.log(JSON.stringify({status: 'passed', extraChecks: 1}));
}
// 16 Payment status comes from the debtor list when the paid amount is unknown: debt equal to the assessment = unpaid.
{
  const m16 = model([{id: 'd1', landValue: 1e6, use: 'other', tp: 'TD', tax69: 3000}, {id: 'd2', landValue: 1e6, use: 'other', tp: 'TP', tax69: 3000}],
    {TD: {type: 'individual', assessed69: 3000, paid69: null, debt69: 3000}, TP: {type: 'individual', assessed69: 3000, paid69: null, debt69: 1000}});
  const r16 = E.run(m16, {strategies: new Set(), appraisalAdjPct: 0});
  assert.equal(r16.byParcel.get('d1').status69, 'unpaid'); assert.equal(r16.byParcel.get('d2').status69, 'partial');
  eq(r16.byParcel.get('d1').collected69, 0, 'full debt means nothing collected'); eq(r16.byParcel.get('d2').collected69, 2000, 'debt 1,000 of 3,000 means 2,000 collected');
  console.log(JSON.stringify({status: 'passed', debtorStatusChecks: 4}));
}
// 17 Revision 1.8.1: building price change and titles joined by one building (s.42 para 2 proxy).
{
  const bfields = [...fields, 'bgrp'];
  const bmodel = (parcels, groups) => E.prepare({schema: 'sila-parcel-tax-1', asOf: '2026-10-19', taxYear: 2569, fields: bfields,
    parcels: parcels.map((p) => [...row(p), p.bgrp ?? null]), taxpayers: {}, buildingGroups: groups});
  // Two commercial titles under one building, 30M + 30M land and 6M + 4M buildings: separately 0.3% each; combined, 70M crosses the 50M tier.
  const m17 = bmodel([{id: 'j1', landValue: 30e6, bldValue: 6e6, use: 'other', tax69: 108000, bgrp: 1}, {id: 'j2', landValue: 30e6, bldValue: 4e6, use: 'other', tax69: 102000, bgrp: 1}], [['j1', 'j2', 'offroll']]);
  assert.equal(m17.availability.combineBuilding, true); assert.deepEqual(m17.buildingGroups.get(1), ['j1', 'j2', 'offroll']); checks += 2;
  const off = E.run(m17, {strategies: new Set(), appraisalAdjPct: 0}), on = E.run(m17, {strategies: new Set(['combineBuilding']), appraisalAdjPct: 0});
  eq(off.totals.new70, 210000, 'fix off: each title keeps its own tax');
  // Combined base 70M: 50M at 0.3% + 20M at 0.4% = 230,000 law-based, vs 210,000 separately.
  eq(on.totals.new70 - off.totals.new70, 20000, 'combined 70M adds the 0.4% tier on 20M');
  eq(off.byParcel.get('j1').combineEffect + off.byParcel.get('j2').combineEffect, 20000, 'potential effect reported even when the fix is off');
  eq(off.byGroup.get(1).combined70, 230000, 'group total if combined'); eq(off.byGroup.get(1).assessed69, 210000, 'group 2569 total');
  assert.equal(off.byGroup.get(1).onRoll, 2); checks++;
  // Building prices +10% (land unchanged): j1 law tax 36M -> 36.6M at 0.3%, so 2570 current method scales 108,000 by 36.6/36.
  const b10 = E.run(m17, {strategies: new Set(), appraisalAdjPct: 0, buildingAdjPct: 10});
  eq(b10.byParcel.get('j1').old70, 108000 * 36.6 / 36, 'building price change scales the title by its own law change');
  eq(b10.buildingFactor, 1.1, 'factor reported');
  console.log(JSON.stringify({status: 'passed', buildingGroupChecks: 9}));
}
