/* City figures computed by the tax engine from the published per-parcel data (data/parcel-tax.json).
   Same rule as the site: gain per title = law-based 2570 tax with all fixes minus the 2569 bill; roll-below gaps
   under 100 THB per title are noise; bills above the law-based figure are listed, not deducted.
   Usage (repository root):
     node qa/compute-figures.cjs --out qa/expected-figures.json   # write after a change to data/parcel-tax.json or tax-engine.js
     node qa/compute-figures.cjs --check                          # exit 1 when qa/expected-figures.json is stale
     node qa/compute-figures.cjs                                  # print to stdout
   The output feeds qa/browser/run_matrix.py (expected strings) and the handoff documents. It holds city totals and
   counts only: no owner or parcel lists (the site shows those under D-03; one public copy is enough). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const env = {}; vm.createContext(env);
for (const f of ['tax-calculator.js', 'tax-engine.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), env);
const E = env.SilaTaxEngine;
const model = E.prepare(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/parcel-tax.json'), 'utf8')));
const ALL = new Set(['mixedUse', 'combine', 'rented', 'newBuildings', 'mainHomeOnce', 'juristic', 'agriShare', 'combineBuilding']);
const r = E.run(model, { strategies: ALL, appraisalAdjPct: 0, buildingAdjPct: 0 });
const AUDIT_MIN = 100;   // same constant as app.js
let gain = 0, parcels = 0, small = 0, nSmall = 0, above = 0, nAbove = 0;
const by = {}, byN = {}, vac = {};
for (const row of r.byParcel.values()) {
  if (row.assessed69 == null) continue;
  if (row.rollAbove >= 0.5) { above += row.rollAbove; nAbove++; }
  let g = 0;
  for (const [id, a] of row.alloc) {
    if (id === 'rollBelow' && a < AUDIT_MIN) { small += a; nSmall++; continue; }
    if (a < 0.5) continue;
    g += a; by[id] = (by[id] || 0) + a; byN[id] = (byN[id] || 0) + 1;
  }
  if (g >= 0.5) { gain += g; parcels++; }
  if (row.vacancy) { const k = row.vacancy.steps; vac[k] = (vac[k] || 0) + 1; }
}
/* The site's municipality view draws only parcels inside the boundary (data/parcels.geojson insideMunicipality);
   the totals above count every title in data/parcel-tax.json, so record the difference for readers. */
const inside = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/parcels.geojson'), 'utf8')).features.map((f) => [f.properties.id, f.properties.insideMunicipality !== false]));
let outTitles = 0, outGain = 0, inGain = 0, inParcels = 0;
for (const [id, row] of r.byParcel) {
  if (row.assessed69 == null) continue;
  let g = 0;
  for (const [k, a] of row.alloc) { if ((k === 'rollBelow' && a < AUDIT_MIN) || a < 0.5) continue; g += a; }
  if (inside.get(id) === false) { outTitles++; if (g >= 0.5) outGain++; }
  else if (g >= 0.5) { inGain += g; inParcels++; }
}
const agri = E.agriWatch(model, r, 5e6), owners = E.ownerRanking(model, r);
const t = r.totals;
const ownerTotal = owners.reduce((a, o) => a + o.value, 0);
const out = {
  schema: 'sila-expected-figures/1',
  engine: E.version || null,
  source: 'data/parcel-tax.json',
  totals: { billed69: +t.assessed69.toFixed(2), law69: +t.law69.toFixed(2), old70: +t.old70.toFixed(2), new70: +t.new70.toFixed(2), gainAll: +t.gain.toFixed(2),
    parcels69: t.parcels69, parcelsGainAny: t.parcelsGain, rollAbove69: +t.rollAbove69.toFixed(2), parcelsRollAbove: t.parcelsRollAbove },
  negotiate: { gainMaterial: +gain.toFixed(2), parcelsMaterial: parcels, rollBelowSmallSum: +small.toFixed(2), rollBelowSmallTitles: nSmall,
    byInitiative: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, [Math.round(v), byN[k]]])), rollAboveSum: +above.toFixed(2), rollAboveTitles: nAbove, vacancySteps: vac },
  municipalityView: { note: 'the site draws parcels inside the municipal boundary only; the totals above include titles outside it',
    titlesOutsideBoundary: outTitles, outsideTitlesWithGain: outGain, parcelsMaterialInside: inParcels, gainMaterialInside: +inGain.toFixed(2) },
  /* Missing is not zero (DATA-01): sum known values only and count the unknown ones. */
  agriWatch: { titles: agri.length, potential: Math.round(agri.reduce((a, w) => a + (w.potential ?? 0), 0)), potentialUnknown: agri.filter((w) => w.potential == null).length,
    billed: Math.round(agri.reduce((a, w) => a + (w.billed69 ?? 0), 0)), billedUnknown: agri.filter((w) => w.billed69 == null).length,
    landValue: Math.round(agri.reduce((a, w) => a + w.landValue, 0)),
    withBuilding: agri.filter((w) => w.buildingsOnTitle || w.surveyBuilding).length, juristic: agri.filter((w) => w.ownerType === 'juristic').length },
  owners: { count: owners.length, totalValueMTHB: +(ownerTotal / 1e6).toFixed(2), top10Share: +(owners.slice(0, 10).reduce((a, o) => a + o.value, 0) / ownerTotal * 100).toFixed(1),
    over50M: owners.filter((o) => o.value >= 50e6).length },
};
/* Strings the browser flows look for: the city gain in millions with two decimals and the mixed-use gain in thousands;
   the first code of the owner ranking (the site lists it publicly) for owner-card checks. */
out.uiExpect = {
  cityGainMillions: '+' + (out.negotiate.gainMaterial / 1e6).toFixed(2),
  mixedUseThousands: String(Math.round((out.negotiate.byInitiative.mixedUse || [0])[0] / 1000)),
  topOwnerCode: (owners[0] || {}).code || null,
};
const text = JSON.stringify(out, null, 1) + '\n';
const argv = process.argv.slice(2);
const argAfter = (flag) => { const k = argv.indexOf(flag); return k >= 0 && argv[k + 1] && !argv[k + 1].startsWith('--') ? argv[k + 1] : null; };
if (argv.includes('--check')) {
  const rel = argAfter('--check') || 'qa/expected-figures.json';
  const file = path.isAbsolute(rel) ? rel : (argAfter('--check') ? path.join(process.cwd(), rel) : path.join(ROOT, rel));
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (cur === text) { console.log(`expected figures: current (${rel}, engine ${out.engine})`); process.exit(0); }
  let changed = ['file missing'];
  if (cur) { const old = JSON.parse(cur); changed = Object.keys(out).filter((k) => JSON.stringify(old[k]) !== JSON.stringify(out[k])); }
  console.log(`expected figures: STALE (${rel}); changed: ${changed.join(', ') || 'formatting'}. Run: node qa/compute-figures.cjs --out qa/expected-figures.json, then rebuild the handoff.`);
  process.exit(1);
} else if (argAfter('--out')) {
  fs.writeFileSync(path.join(process.cwd(), argAfter('--out')), text); console.log('wrote', argAfter('--out'));
} else process.stdout.write(text);
