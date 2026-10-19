/* Deterministic checks for the officer tax calculator against hand-worked examples.
   Rates: Royal Decree on land and building tax rates B.E. 2564; exemptions s.40/41; formula s.42; vacant s.43; s.68–70.
   No private data. Usage: node qa/check-tax-calculator.cjs */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('node:assert/strict');
const env = {}; vm.createContext(env);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../tax-calculator.js'), 'utf8'), env);
const C = env.SilaTaxCalculator;
let checks = 0;
const eq = (a, b, msg) => { assert.equal(Math.round(a * 100) / 100, Math.round(b * 100) / 100, msg); checks++; };
// land value helper: price per wah x area; one rai = 400 sq. wah
const land = (value) => ({landPricePerWah: value / 400, rai: 1, ngan: 0, wah: 0});
const run = (o) => C.compute(Object.assign({owner: 'individual', buildings: []}, o));

// 1 main home land+house under 50M: exempt
eq(run({use: 'mainLandAndHouse', ...land(5e6)}).tax, 0, 'main home 5M exempt');
// 2 main home 80M: 25M x 0.03% + 5M x 0.05% = 7,500 + 2,500
eq(run({use: 'mainLandAndHouse', ...land(80e6)}).tax, 10000, 'main home 80M');
// 3 main home 130M: 25M x .03% + 25M x .05% + 30M x .1% = 7,500 + 12,500 + 30,000
eq(run({use: 'mainLandAndHouse', ...land(130e6)}).tax, 50000, 'main home 130M');
// 4 building-only main home 30M: (30-10)M x 0.02% = 4,000 (building value via price override)
eq(run({use: 'mainBuildingOnly', buildings: [{code: '105', area: 1000, age: 0, priceOverride: 30000}]}).tax, 4000, 'house-only main home 30M');
// 5 other residential 2M: 0.02%
eq(run({use: 'residentialOther', ...land(2e6)}).tax, 400, 'second home 2M');
// 6 other residential 60M: 50M x .02% + 10M x .03% = 10,000 + 3,000
eq(run({use: 'residentialOther', ...land(60e6)}).tax, 13000, 'second home 60M');
// 7 commercial 100M: 50M x 0.3% + 50M x 0.4% = 350,000
eq(run({use: 'other', ...land(100e6)}).tax, 350000, 'commercial 100M');
// 8 vacant 100M year 3: no increase
eq(run({use: 'vacant', vacantYears: 3, ...land(100e6)}).tax, 350000, 'vacant year 3');
// 9 vacant 100M year 4: each band +0.3 => 50M x .6% + 50M x .7% = 650,000
eq(run({use: 'vacant', vacantYears: 4, ...land(100e6)}).tax, 650000, 'vacant year 4');
// 10 vacant 10M year 7: +0.6 => 0.9%
eq(run({use: 'vacant', vacantYears: 7, ...land(10e6)}).tax, 90000, 'vacant year 7');
// 11 vacant 10M year 40: capped at 3%
eq(run({use: 'vacant', vacantYears: 40, ...land(10e6)}).tax, 300000, 'vacant cap 3%');
// 12 agriculture individual 60M: (60-50)M x 0.01%
eq(run({use: 'agriculture', ...land(60e6)}).tax, 1000, 'farm individual 60M');
// 13 agriculture juristic 60M: no exemption
eq(run({use: 'agriculture', owner: 'juristic', ...land(60e6)}).tax, 6000, 'farm juristic 60M');
// 14 agriculture individual: other parcels 40M + this 30M => (70-50)M x .01% = 2,000; share 30/70
eq(run({use: 'agriculture', otherAgriValue: 40e6, ...land(30e6)}).tax, 2000 * 30 / 70, 'farm combined exemption share');
// 15 juristic owner cannot take main-home relief
assert(run({use: 'mainLandAndHouse', owner: 'juristic', ...land(5e6)}).errors.includes('mainHomeJuristic')); checks++;
// 16 building value: code 103, 100 m2, age 10 => 845,000 x (1-10%) = 760,500 (Khon Kaen fixture)
const b = run({use: 'other', buildings: [{code: '103', area: 100, age: 10}]});
eq(b.buildingValue, 760500, 'building 103 100m2 age 10');
eq(b.tax, 760500 * 0.003, 'commercial building only');
// 17 depreciation table: masonry 20 => 30, half 20 => 75, wood 20 => 93, masonry 50 => 76 cap, part year counts as one
eq(C.depreciationPct('brick', 20), 30, 'brick 20'); eq(C.depreciationPct('mixed', 20), 75, 'mixed 20');
eq(C.depreciationPct('wood', 20), 93, 'wood 20'); eq(C.depreciationPct('brick', 50), 76, 'brick cap');
eq(C.depreciationPct('brick', 0.5), 1, 'part year counts as one'); eq(C.depreciationPct('brick', 0), 0, 'new building');
// 18 mixed use: main home 5M with 40% shop => home part 3M exempt; shop 2M x 0.3% = 6,000
eq(run({use: 'mainLandAndHouse', otherSharePct: 40, ...land(5e6)}).tax, 6000, 'mixed use main home + shop');
// 19 installments: 6,000 => 3 x 2,000; 2,999.99 => none
const i1 = run({use: 'mainLandAndHouse', otherSharePct: 40, ...land(5e6)}).installments;
eq(i1.length, 3, 'three installments'); eq(i1[0] + i1[1] + i1[2], 6000, 'installments sum');
assert.equal(run({use: 'residentialOther', ...land(14999950)}).installments, null); checks++;
// 20 late payment: penalties 10/20/40%, surcharge 1% a month
const late = run({use: 'other', ...land(1e6)}).late;
eq(late.penaltyBeforeReminder, 300, '10%'); eq(late.penaltyWithinReminder, 600, '20%'); eq(late.penaltyAfter, 1200, '40%'); eq(late.surchargePerMonth, 30, '1% a month');
// 21 missing values are reported, never treated as zero
const m = run({use: 'other'});
assert(m.tax === undefined && m.missing.includes('landPrice')); checks++;
// 22 reduction decree option: 50% of 6,000
eq(run({use: 'mainLandAndHouse', otherSharePct: 40, reductionPct: 50, ...land(5e6)}).tax, 3000, '50% reduction');
// 23 difference with previous bill
eq(run({use: 'other', previousTax: 1000, ...land(1e6)}).difference, 2000, 'difference');
// 24 exempt structures are not offered: fences, roads, yards
assert(!C.PRICES.some(p => ['601', '602', '603', '604', '605', '606', '607', '609', '610', '611', '612'].includes(p.code))); checks++;
console.log(JSON.stringify({status: 'passed', checks, scope: 'Hand-worked rate, exemption, vacant, depreciation, mixed-use, installment and late-payment fixtures; not an official assessment', rulesCheckedOn: C.RULES.checkedOn}));
