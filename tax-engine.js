/* Portfolio land-tax engine for the Sila officer site (revision 1.8).
 * Input: data/parcel-tax.json (no names, no ID numbers; taxpayer keys are random codes).
 * 2569 figures come from the municipal roll. 2570 "current method" scales each parcel's 2569 tax by the
 * change in its own law-based tax when land prices move. 2570 "with fixes" adds, on top of that, only the
 * difference the selected fixes make to the law-based tax of each taxpayer's whole portfolio, so the
 * gap between the two 2570 figures is exactly the effect of the fixes and is never counted twice.
 * Law: Land and Building Tax Act 2562 s.35, 37, 38, 40, 41, 42 para 2; rates: Royal Decree 2564.
 * Revision 1.8.1: a building price change for the new appraisal round (buildingAdjPct, like appraisalAdjPct for land), and
 * titles joined by one building (bgrp) as a s.42 para 2 proxy: its effect is reported per title even when the fix is off.
 */
(function (root) {
  'use strict';
  const RULES = () => (root.SilaTaxCalculator && root.SilaTaxCalculator.RULES) || null;
  /* `needsOwner` strategies need a taxpayer code on (most) titles; prepare() marks them unavailable otherwise. */
  const STRATEGIES = Object.freeze([
    {id: 'combine', needsOwner: true, label: ['รวมแปลงที่ติดกันของเจ้าของเดียวกันเป็นฐานเดียว', 'Combine adjoining parcels of one owner'],
      basis: ['ม.42 วรรคสอง · แปลงที่มีอาณาเขตติดต่อกันและเป็นของเจ้าของเดียวกัน รวมมูลค่าเป็นฐานเดียว (เครื่องนี้รวมภายในประเภทการใช้เดียวกัน เพราะอัตราแยกตามประเภท)', 's.42 para 2 · adjoining parcels of the same owner form one base (combined here within each use type, since rates differ by use)']},
    {id: 'combineBuilding', label: ['รวมโฉนดที่อาคารหลังเดียวกันคร่อมเป็นฐานเดียว', 'Combine titles joined by one building'],
      basis: ['ม.42 วรรคสอง · โฉนดที่อาคารหลังเดียวกันคร่อม (หลังคาบนโฉนดที่สองอย่างน้อย 25% และ 20 ตร.ม. อาคารมีบ้านเลขที่ไม่เกินหนึ่งเลข และโฉนดที่สองไม่มีอาคารหลังอื่นตั้งอยู่) น่าจะเป็นที่ดินผืนเดียวกันที่ใช้ร่วมกัน เครื่องนี้สมมติว่าเป็นเจ้าของเดียวกันและรวมภายในประเภทการใช้เดียวกัน ต้องตรวจชื่อในโฉนดก่อนใช้', 's.42 para 2 · titles joined by one building (at least 25% and 20 m² of the roof on the second title, one house number at most, and no other building on the second title) are likely one plot used together; this assumes one owner and combines within each use type. Check the owner on the titles before use']},
    {id: 'agriShare', needsOwner: true, label: ['ยกเว้นเกษตร 50 ล้านบาทครั้งเดียวต่อคน', 'One 50 million farm allowance per person'],
      basis: ['ม.40 · ยกเว้นรวมไม่เกิน 50 ล้านบาทต่อบุคคลใน อปท. เดียว ลำดับการหักระหว่างแปลงยังไม่มีเกณฑ์ เครื่องนี้หักแปลงมูลค่าสูงก่อนเป็นสมมติฐาน', 's.40 · at most 50 million per individual in one local authority; no rule yet on the order between parcels, so highest value first is assumed']},
    {id: 'mixedUse', label: ['แยกชั้นที่ค้าขายออกจากที่อยู่อาศัย', 'Split commercial floors from homes'],
      basis: ['ม.38 · สัดส่วนชั้นที่ใช้ค้าขายจากแบบสำรวจอาคาร เฉพาะโฉนดที่บัญชีบันทึกเป็นอยู่อาศัยโดยไม่มีส่วนใช้ประโยชน์อื่น', 's.38 · commercial floor share from the building survey, only for titles the roll records as residential with no other-use part']},
    {id: 'rented', label: ['บ้านที่ให้เช่าหรือผู้อื่นใช้ ไม่ได้สิทธิบ้านหลังหลัก', 'Rented houses lose main-home relief'],
      basis: ['ม.41 · แปลงที่ได้สิทธิบ้านหลังหลัก แต่หมุดสำรวจในแปลงระบุว่าให้เช่าหรือผู้อื่นทำประโยชน์ คิดว่าทั้งโฉนดเสียสิทธิ จึงเป็นค่าสูงสุด ถ้าให้เช่าบางส่วนภาษีจริงจะน้อยกว่า', 's.41 · main-home parcels where a survey point says rented or used by others; the whole title is assumed to lose relief, an upper bound if only part is rented']},
    {id: 'newBuildings', label: ['เพิ่มอาคารที่สำรวจพบแต่ยังไม่อยู่ในบัญชี', 'Add surveyed buildings missing from the roll'],
      basis: ['ม.35 · อาคารที่มีบ้านเลขที่จากหมุดสำรวจ แต่เลขนั้นไม่มีในบัญชีสิ่งปลูกสร้าง ใช้มูลค่าประมาณจากรูปหลังคา', 's.35 · buildings whose surveyed house number is absent from the building roll, valued from the roof outline']},
  ]);
  const OWNER_REASON = ['ยังคำนวณไม่ได้: ไฟล์ ภ.ด.ส. ที่ได้รับไม่มีชื่อหรือรหัสผู้เสียภาษีต่อโฉนด', 'Not computable yet: the PDS files received carry no owner name or taxpayer code per title'];
  const USE_LABEL = {agri: ['เกษตร', 'Agriculture'], res: ['อยู่อาศัย', 'Residential'], other: ['อื่น ๆ (เช่น ค้าขาย)', 'Other (e.g. commercial)'], vacant: ['ว่างเปล่า', 'Vacant'], mixed: ['ใช้หลายประเภท', 'Mixed use']};

  function tiered(base, tiers) {
    let lower = 0, tax = 0;
    for (const [upper, rate] of tiers) {
      if (base <= lower) break;
      tax += (Math.min(base, upper) - lower) * rate;
      lower = upper;
    }
    return tax;
  }

  /* Expand a row into category parts {cat, value} where cat ∈ agri|main|resOther|other|vacant. */
  function parts(p, opts) {
    const value = (p.landValue == null ? 0 : p.landValue * opts.landFactor) + (opts.building ? (opts.building(p) || 0) : (p.bldValue || 0)) * (opts.bldFactor || 1);
    if (!(value > 0)) return [];
    let shares = p.shares ? {...p.shares} : {[p.use || 'other']: 1};
    // Only titles the roll records as residential with no 'other' part: an existing 'other' share already covers trade.
    if (opts.commercialShare && opts.commercialShare(p) > 0 && (shares.res || 0) > 0 && !((shares.other || 0) > 0)) {
      const s = Math.min(1, opts.commercialShare(p)) * shares.res;
      shares.res -= s; shares.other = (shares.other || 0) + s;
    }
    const main = p.mainHome && opts.mainHome(p);
    const out = [];
    for (const [cat, share] of Object.entries(shares)) {
      if (!(share > 0)) continue;
      const k = cat === 'res' ? (main ? 'main' : 'resOther') : cat;
      out.push({cat: k, value: value * share, parcel: p.id});
    }
    return out;
  }

  /* Law-based tax of one taxpayer's portfolio. Returns Map(parcelId -> tax). */
  function portfolioTax(rows, tp, opts) {
    const R = RULES();
    const T = R.tiers, EX = R.exemption, out = new Map();
    const individual = tp.type !== 'juristic';
    const add = (id, v) => out.set(id, (out.get(id) || 0) + v);
    const allParts = rows.flatMap(p => parts(p, opts));
    for (const p of rows) out.set(p.id, 0);
    // Groups: with "combine", adjoining same-owner parcels form one base per category; otherwise each parcel stands alone.
    const groupOf = new Map();
    for (const p of rows) groupOf.set(p.id, opts.combine && p.grp != null ? 'g' + p.grp : opts.combineBuilding && p.bgrp != null ? 'b' + p.bgrp : 'p' + p.id);
    const buckets = new Map();
    for (const part of allParts) {
      const key = groupOf.get(part.parcel) + '|' + part.cat;
      if (!buckets.has(key)) buckets.set(key, {cat: part.cat, parts: [], total: 0});
      const b = buckets.get(key); b.parts.push(part); b.total += part.value;
    }
    // Farm allowance: one 50M per individual across the portfolio (highest-value base first) or, without the fix, 50M per base.
    const agri = [...buckets.values()].filter(b => b.cat === 'agri').sort((a, b) => b.total - a.total);
    let allowance = individual ? EX.agricultureIndividual : 0;
    for (const b of agri) {
      let ex;
      if (!individual) ex = 0;
      else if (opts.agriShare) { ex = Math.min(allowance, b.total); allowance -= ex; }
      else ex = Math.min(EX.agricultureIndividual, b.total);
      b.taxable = Math.max(0, b.total - ex);
    }
    for (const b of buckets.values()) {
      let tax = 0;
      if (b.cat === 'agri') tax = tiered(b.taxable, T.agriculture);
      else if (b.cat === 'main') tax = individual ? tiered(Math.max(0, b.total - EX.mainLandAndHouse), T.mainLandAndHouse) : tiered(b.total, T.residentialOther);
      else if (b.cat === 'resOther') tax = tiered(b.total, T.residentialOther);
      else tax = tiered(b.total, T.other);  // other and vacant use the same tiers (no vacancy escalation without proof of years)
      for (const part of b.parts) add(part.parcel, b.total > 0 ? tax * part.value / b.total : 0);
    }
    return out;
  }

  function prepare(json) {
    if (!json || json.schema !== 'sila-parcel-tax-1' || !Array.isArray(json.parcels)) throw new Error('Unexpected parcel tax file');
    const f = json.fields, idx = Object.fromEntries(f.map((k, i) => [k, i]));
    const parcels = json.parcels.map(r => ({
      id: r[idx.id], v: r[idx.v] ?? null, price: r[idx.price] ?? null, sqwa: r[idx.sqwa] ?? null, landValue: r[idx.landValue] ?? null,
      use: r[idx.use] ?? null, shares: r[idx.shares] ?? null, mainHome: !!r[idx.mainHome], bldValue: r[idx.bldValue] ?? null,
      tp: r[idx.tp] ?? null, tax69: r[idx.tax69] ?? null, grp: r[idx.grp] ?? null,
      rented: !!r[idx.rented], comShare: r[idx.comShare] ?? 0, surveyBld: r[idx.surveyBld] ?? null,
      link: idx.link != null ? r[idx.link] ?? null : null, rollBld: idx.rollBld != null ? r[idx.rollBld] ?? null : null, missBld: idx.missBld != null ? r[idx.missBld] ?? 0 : 0,
      bgrp: idx.bgrp != null ? r[idx.bgrp] ?? null : null, code: idx.code != null ? r[idx.code] ?? null : null,
    }));
    // Titles joined by one building (index + 1 = bgrp); lists also titles that are not on the roll, with their map codes.
    const buildingGroups = new Map((json.buildingGroups || []).map((ids, i) => [i + 1, ids]));
    const codes = new Map(parcels.filter(p => p.code).map(p => [p.id, p.code]));
    (json.buildingGroupCodes || []).forEach((list, i) => (json.buildingGroups?.[i] || []).forEach((id, k) => { if (list?.[k] && !codes.has(id)) codes.set(id, list[k]); }));
    for (const p of parcels) p.useLabel = p.use ? USE_LABEL[p.use] : null;
    const byId = new Map(parcels.map(p => [p.id, p]));
    const taxpayers = new Map();
    for (const [key, t] of Object.entries(json.taxpayers || {})) {
      // Payment status: from the amount paid when known, otherwise from the debtor list (debt equal to the assessment = unpaid).
      let status = 'unknown';
      if (t.assessed69 != null && t.assessed69 <= 0) status = 'none';
      else if (t.assessed69 != null && t.paid69 != null) status = t.paid69 >= t.assessed69 - 1 ? 'paid' : t.paid69 > 0 ? 'partial' : 'unpaid';
      else if (t.assessed69 != null && t.debt69 != null && t.debt69 > 0) status = t.debt69 >= t.assessed69 - 1 ? 'unpaid' : 'partial';
      taxpayers.set(key, {key, type: t.type || null, assessed69: t.assessed69 ?? null, paid69: t.paid69 ?? null, debt69: t.debt69 ?? null, status69: status, parcels: [],
        roll: {land: t.land ?? null, bld: t.bld ?? null, condo: t.condo ?? null, condoValue: t.condoValue ?? null}});
    }
    for (const p of parcels) if (p.tp && taxpayers.has(p.tp)) taxpayers.get(p.tp).parcels.push(p.id);
    const priced = parcels.filter(p => p.price != null).map(p => p.price).sort((a, b) => a - b);
    const summary = {...(json.summary || {}), pricedParcels: priced.length, medianPrice: priced.length ? priced[Math.floor(priced.length / 2)] : null};
    const keyedShare = parcels.length ? parcels.filter(p => p.tp && taxpayers.has(p.tp)).length / parcels.length : 0;
    const availability = Object.fromEntries(STRATEGIES.map(st => [st.id, !st.needsOwner || keyedShare >= 0.5]));
    if (!buildingGroups.size) availability.combineBuilding = false;
    return {parcels, byId, taxpayers, summary, keyedShare, availability, buildingGroups, codes, meta: {asOf: json.asOf, taxYear: json.taxYear}};
  }

  function run(model, options = {}) {
    if (!RULES()) throw new Error('Load tax-calculator.js before tax-engine.js');
    const asked = options.strategies instanceof Set ? options.strategies : new Set(options.strategies || []);
    const strategies = new Set([...asked].filter(id => model.availability ? model.availability[id] !== false : true));
    const f = 1 + (Number(options.appraisalAdjPct) || 0) / 100, bf = 1 + (Number(options.buildingAdjPct) || 0) / 100;
    const baseOpts = (factor, set, bfactor = 1) => ({
      landFactor: factor, bldFactor: bfactor,
      combineBuilding: set.has('combineBuilding'),
      combine: set.has('combine'),
      agriShare: set.has('agriShare'),
      mainHome: p => !(set.has('rented') && p.rented),
      commercialShare: set.has('mixedUse') ? (p => p.comShare || 0) : null,
      building: set.has('newBuildings') ? (p => (p.bldValue || 0) + (p.surveyBld > 0 ? p.surveyBld : 0)) : null,
    });
    const byParcel = new Map(), byTaxpayer = new Map(), byVillage = new Map(), byGroup = new Map();
    const totals = {assessed69: 0, collected69: 0, old70: 0, new70: 0, parcels69: 0};
    const stratDelta = new Map(STRATEGIES.map(s => [s.id, {delta: 0, parcels: 0}]));
    // Parcels without a taxpayer stand alone (their own one-title portfolio, type unknown -> treated as individual).
    const groups = new Map(), solo = {type: null, assessed69: null, paid69: null, debt69: null, status69: 'unknown'};
    // Titles joined by one building share a portfolio (it only matters when that fix is on; each title still stands alone otherwise).
    for (const p of model.parcels) {
      const key = p.tp && model.taxpayers.has(p.tp) ? p.tp : p.bgrp != null ? 'bgrp:' + p.bgrp : 'parcel:' + p.id;
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p);
    }
    const potentialCombine = model.availability?.combineBuilding !== false;
    for (const [key, rows] of groups) {
      const tp = model.taxpayers.get(key) || solo;
      const law69 = portfolioTax(rows, tp, baseOpts(1, new Set()));
      const law70 = portfolioTax(rows, tp, baseOpts(f, new Set(), bf));
      const fixed70 = portfolioTax(rows, tp, baseOpts(f, strategies, bf));
      const single = new Map();
      for (const s of STRATEGIES) if (strategies.has(s.id)) single.set(s.id, portfolioTax(rows, tp, baseOpts(f, new Set([s.id]), bf)));
      // What combining titles joined by one building would change, shown on building and parcel cards even when the fix is off.
      const joined = potentialCombine && rows.length > 1 && rows.some(p => p.bgrp != null);
      const combine = joined ? (single.get('combineBuilding') || portfolioTax(rows, tp, baseOpts(f, new Set(['combineBuilding']), bf))) : null;
      const ratioPaid = !(tp.assessed69 > 0) ? null : tp.paid69 != null ? Math.min(1, tp.paid69 / tp.assessed69)
        : tp.debt69 != null && tp.debt69 > 0 ? Math.max(0, Math.min(1, (tp.assessed69 - tp.debt69) / tp.assessed69)) : null;
      const agg = {assessed69: 0, collected69: 0, old70: 0, new70: 0};
      for (const p of rows) {
        const assessed = p.tax69;
        const base69 = law69.get(p.id) || 0, base70 = law70.get(p.id) || 0;
        let old70 = null;
        if (assessed != null) old70 = base69 > 0 ? assessed * base70 / base69 : assessed + Math.max(0, base70 - base69);
        const effect = (fixed70.get(p.id) || 0) - base70;
        const new70 = old70 == null ? null : Math.max(0, old70 + effect);
        const collected = assessed == null ? null : ratioPaid == null ? (tp.status69 === 'none' ? 0 : null) : assessed * ratioPaid;
        const reasons = [];
        for (const s of STRATEGIES) {
          if (!single.has(s.id)) continue;
          const d = (single.get(s.id).get(p.id) || 0) - base70;
          // Rows count only parcels that enter the totals (2569 tax known), so rows and totals use the same parcels.
          if (Math.abs(d) >= 0.5 && assessed != null) { reasons.push(s.label); const sd = stratDelta.get(s.id); sd.delta += d; sd.parcels++; }
        }
        // A title with no 2569 tax has nothing due of its own, even when its owner is on the debtor list for other items.
        const status69 = assessed === 0 && (tp.status69 === 'unpaid' || tp.status69 === 'partial') ? 'none' : tp.status69;
        const combineEffect = combine ? (combine.get(p.id) || 0) - base70 : 0;
        const row = {assessed69: assessed, collected69: collected, status69, old70, new70, delta: new70 == null || assessed == null ? null : new70 - assessed, reasons, combineEffect};
        byParcel.set(p.id, row);
        if (p.bgrp != null) {
          if (!byGroup.has(p.bgrp)) byGroup.set(p.bgrp, {assessed69: 0, old70: 0, new70: 0, combined70: 0, onRoll: 0, taxed: 0});
          const g = byGroup.get(p.bgrp); g.onRoll++;
          if (assessed != null) { g.taxed++; g.assessed69 += assessed; }
          if (old70 != null) { g.old70 += old70; g.combined70 += Math.max(0, old70 + combineEffect); }
          if (new70 != null) g.new70 += new70;
        }
        if (assessed != null) { agg.assessed69 += assessed; totals.assessed69 += assessed; totals.parcels69++; }
        if (collected != null) { agg.collected69 += collected; totals.collected69 += collected; }
        if (old70 != null) { agg.old70 += old70; totals.old70 += old70; }
        if (new70 != null) { agg.new70 += new70; totals.new70 += new70; }
        if (p.v) {
          if (!byVillage.has(p.v)) byVillage.set(p.v, {assessed69: 0, old70: 0, new70: 0});
          const vv = byVillage.get(p.v);
          vv.assessed69 += assessed || 0; vv.old70 += old70 || 0; vv.new70 += new70 || 0;
        }
      }
      if (model.taxpayers.has(key)) byTaxpayer.set(key, agg);
    }
    const byStrategy = STRATEGIES.filter(s => strategies.has(s.id)).map(s => ({id: s.id, label: s.label, ...stratDelta.get(s.id)}));
    return {byParcel, byTaxpayer, byVillage, byGroup, byStrategy, totals, factor: f, buildingFactor: bf};
  }

  const api = Object.freeze({STRATEGIES, OWNER_REASON, USE_LABEL, prepare, run, _test: {tiered, portfolioTax, parts}, version: '1.2.0'});
  root.SilaTaxEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
