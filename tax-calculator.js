/* Sila officer tax calculator: tax due for ONE parcel under the Land and Building Tax Act B.E. 2562.
 * Load before app.js. Inputs stay in this browser tab: nothing is sent, stored or logged.
 * Rules checked on 2026-10-19 (see RULES.sources). Building prices: Khon Kaen schedule 2566–2569.
 * window.SilaTaxCalculator = {open({language, returnFocus}), compute(input), RULES, PRICES}
 */
(function (root) {
  'use strict';
  const RULES = Object.freeze({
    checkedOn: '2026-10-19',
    // Royal Decree on land and building tax rates B.E. 2564 (tax year 2565 onward). Marginal (stepped) tiers.
    // [upper bound of the tier in THB, rate]. Main-residence and individual-agriculture tiers apply AFTER the exemption (s.42).
    tiers: {
      agriculture: [[75e6, 0.0001], [100e6, 0.0003], [500e6, 0.0005], [1000e6, 0.0007], [Infinity, 0.001]],
      mainLandAndHouse: [[25e6, 0.0003], [50e6, 0.0005], [Infinity, 0.001]],
      mainBuildingOnly: [[40e6, 0.0002], [65e6, 0.0003], [90e6, 0.0005], [Infinity, 0.001]],
      residentialOther: [[50e6, 0.0002], [75e6, 0.0003], [100e6, 0.0005], [Infinity, 0.001]],
      other: [[50e6, 0.003], [200e6, 0.004], [1000e6, 0.005], [5000e6, 0.006], [Infinity, 0.007]],
    },
    exemption: {agricultureIndividual: 50e6, mainLandAndHouse: 50e6, mainBuildingOnly: 10e6}, // s.40, s.41 para 1–2
    vacantStepRate: 0.003, vacantStepYears: 3, vacantRateCap: 0.03, // s.43
    installmentMinTax: 3000, installments: 3,
    penalty: {beforeReminder: 0.10, withinReminder: 0.20, after: 0.40}, // s.68, s.69
    surchargePerMonth: 0.01, // s.70: fraction of a month counts as a month; capped at the tax (penalty excluded); no compounding
    schedule: {
      2569: {th: 'ปี 2569 มีประกาศขยายเวลา 2 รอบ: ชำระภายในกรกฎาคม 2569 · ผ่อน 3 งวด ก.ค. ส.ค. ก.ย. 2569', en: 'Tax year 2569 was extended twice: pay by July 2026 · 3 installments Jul, Aug, Sep 2026', months: ['ก.ค. 2569', 'ส.ค. 2569', 'ก.ย. 2569'], monthsEn: ['Jul 2026', 'Aug 2026', 'Sep 2026']},
      2570: {th: 'ปี 2570 ตามกฎหมายปกติ: แจ้งประเมินในกุมภาพันธ์ ชำระภายในเมษายน 2570 · ผ่อน 3 งวด เม.ย. พ.ค. มิ.ย. 2570 (ถ้ามีประกาศขยายเวลา ให้ใช้ตามประกาศ)', en: 'Tax year 2570 under the normal schedule: notices in February, pay by April 2027 · 3 installments Apr, May, Jun 2027 (follow any extension notice)', months: ['เม.ย. 2570', 'พ.ค. 2570', 'มิ.ย. 2570'], monthsEn: ['Apr 2027', 'May 2027', 'Jun 2027']},
    },
    sources: [
      {th: 'พ.ร.บ.ภาษีที่ดินและสิ่งปลูกสร้าง พ.ศ. 2562 ม.35–43 (ฐานภาษี อัตรา ยกเว้น ทิ้งว่าง)', url: 'https://legardy.com/thai-law/land-building-tax-act/land-building-tax-act-tax-base-rates-calculation-section-35-43'},
      {th: 'พ.ร.บ.ฯ ม.68–72 (เบี้ยปรับ เงินเพิ่ม)', url: 'https://www.drthawip.com/book/export/html/8206'},
      {th: 'อัตราตาม พ.ร.ฎ.กำหนดอัตราภาษี พ.ศ. 2564 (ตารางขั้นบันได)', url: 'https://www.pptvhd36.com/wealth/economic/204645'},
      {th: 'ปี 2569 ไม่มี พ.ร.ฎ.ลดภาษีทั่วไป (ณ ม.ค. 2569)', url: 'https://lexbangkok.com/land-building-tax-thailand-2026/'},
      {th: 'ขยายเวลาปี 2569 รอบแรก (ประกาศ มท. ธ.ค. 2568)', url: 'https://www.thansettakij.com/economy/647070'},
      {th: 'ขยายเวลาปี 2569 รอบสอง (24 เม.ย. 2569)', url: 'https://www.thaipost.net/general-news/985001/'},
      {th: 'ผ่อน 3 งวดเมื่อภาษีตั้งแต่ 3,000 บาท', url: 'https://www.thansettakij.com/real-estate/620016'},
      {th: 'บัญชีราคาประเมินรอบใหม่ 2570–2573 ประกาศ 1 ธ.ค. 2569', url: 'https://www.infoquest.co.th/?p=567390'},
    ],
  });

  /* Khon Kaen building price schedule 2566–2569 (THB per m²), verified against the provincial schedule.
     Roads, yards and fences are exempt (Ministerial Regulation on exempt property 2562) and are left out. */
  const PRICES = Object.freeze([
    ['101', 'บ้านพักอาศัยไม้ชั้นเดียว', 8600, 'wood'], ['102', 'บ้านพักอาศัยไม้ชั้นเดียวใต้ถุนสูง', 8600, 'wood'],
    ['103', 'บ้านพักอาศัยตึกชั้นเดียว', 8450, 'brick'], ['104', 'บ้านพักอาศัยไม้สองชั้น', 8250, 'wood'],
    ['105', 'บ้านพักอาศัยตึกสองชั้น', 8350, 'brick'], ['106', 'บ้านพักอาศัยครึ่งตึกครึ่งไม้สองชั้น', 8450, 'mixed'],
    ['107', 'บ้านพักอาศัยตึกสามชั้น', 8150, 'brick'], ['108', 'บ้านพักอาศัยแฝดตึกสองชั้น', 8000, 'brick'],
    ['109', 'บ้านพักอาศัยแฝดตึกสามชั้น', 7800, 'brick'], ['110', 'บ้านทรงไทยไม้ชั้นเดียวใต้ถุนสูง', 9550, 'wood'],
    ['111', 'บ้านทรงไทยครึ่งตึกครึ่งไม้สองชั้น', 9300, 'mixed'], ['112', 'บ้านพักอาศัยแฝดตึกชั้นเดียว', 8700, 'brick'],
    ['201', 'ทาวน์เฮ้าส์ชั้นเดียว', 7700, 'brick'], ['202', 'ทาวน์เฮ้าส์สองชั้น', 7500, 'brick'],
    ['203', 'ทาวน์เฮ้าส์สามชั้น', 7550, 'brick'], ['204', 'ทาวน์เฮ้าส์สี่ชั้น', 7500, 'brick'],
    ['301', 'ห้องแถวไม้ชั้นเดียว', 7650, 'wood'], ['302', 'ห้องแถวไม้สองชั้น', 8200, 'wood'],
    ['303', 'ห้องแถวครึ่งตึกครึ่งไม้สองชั้น', 8050, 'mixed'],
    ['401', 'ตึกแถวชั้นเดียว', 7450, 'brick'], ['402', 'ตึกแถวสองชั้น', 8050, 'brick'], ['403', 'ตึกแถวสองชั้นครึ่ง', 8000, 'brick'],
    ['404', 'ตึกแถวสามชั้น', 8100, 'brick'], ['405', 'ตึกแถวสามชั้นครึ่ง', 8100, 'brick'], ['406', 'ตึกแถวสี่ชั้น', 8350, 'brick'],
    ['407', 'ตึกแถวสี่ชั้นครึ่ง', 8350, 'brick'], ['408', 'ตึกแถวห้าชั้น', 8350, 'brick'], ['409', 'ตึกแถวหกชั้น', 8400, 'brick'],
    ['501', 'คลังสินค้า ไม่เกิน 300 ตร.ม.', 5650, 'brick'], ['502', 'คลังสินค้า เกิน 300 ตร.ม.', 3500, 'brick'],
    ['503', 'เรือนคนใช้/ครัว', 6600, 'brick'], ['504', 'โรงจอดรถ', 2550, 'brick'], ['505', 'สถานศึกษา', 7400, 'brick'],
    ['506/1', 'โรงแรม ไม่เกิน 5 ชั้น', 9550, 'brick'], ['506/2', 'โรงแรม เกิน 5 ชั้น', 9600, 'brick'], ['507', 'โรงมหรสพ', 7500, 'brick'],
    ['508', 'สถานพยาบาล', 9300, 'brick'], ['509/1', 'สำนักงาน ไม่เกิน 5 ชั้น', 7450, 'brick'], ['509/2', 'สำนักงาน เกิน 5 ชั้น', 8800, 'brick'],
    ['510', 'ภัตตาคาร', 6850, 'brick'], ['511/1', 'ห้างสรรพสินค้า', 8900, 'brick'], ['511/2', 'อาคารค้าปลีกค้าส่ง', 7350, 'brick'],
    ['512', 'สถานีบริการน้ำมัน', 5350, 'brick'], ['513', 'โรงงาน', 5900, 'brick'], ['514', 'ตลาด ไม่เกิน 1,000 ตร.ม.', 3600, 'brick'],
    ['515', 'ตลาด เกิน 1,000 ตร.ม.', 3700, 'brick'], ['516', 'โฮมออฟฟิศ', 8800, 'brick'], ['517', 'โรงเลี้ยงสัตว์', 2000, 'brick'],
    ['518', 'โรงงานซ่อมรถยนต์', 5600, 'brick'], ['519', 'อาคารจอดรถ', 5300, 'brick'], ['520/1', 'อาคารอยู่อาศัยรวม ไม่เกิน 5 ชั้น', 7900, 'brick'],
    ['520/2', 'อาคารอยู่อาศัยรวม เกิน 5 ชั้น', 8700, 'brick'], ['521', 'ป้อมยาม', 5900, 'brick'], ['522', 'โชว์รูมรถยนต์', 5200, 'brick'],
    ['523', 'ห้องน้ำรวม', 6100, 'brick'], ['608', 'สระว่ายน้ำ', 7500, 'brick'], ['613', 'ป้ายโฆษณา', 8550, 'brick'],
  ].map(([code, name, price, material]) => Object.freeze({code, name, price, material})));

  /* Cumulative depreciation % by age (Khon Kaen schedule page 6; adopted in Sila's 2569 notice). */
  const DEPRECIATION = Object.freeze({
    brick: {cap: 76, capFrom: 43, table: [1,2,3,4,5,6,7,8,9,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40,42,44,46,48,50,52,54,56,58,60,62,64,66,68,70,72,74]},
    mixed: {cap: 85, capFrom: 22, table: [2,4,6,8,10,14,18,22,26,30,34,38,42,46,50,55,60,65,70,75,80]},
    wood: {cap: 93, capFrom: 19, table: [3,6,9,12,15,20,25,30,35,40,45,50,55,60,65,72,79,86]},
  });
  function depreciationPct(material, age) {
    const d = DEPRECIATION[material] || DEPRECIATION.brick;
    if (!(age > 0)) return 0;
    const year = Math.ceil(age); // a part of a year counts as one year
    return year >= d.capFrom ? d.cap : d.table[year - 1];
  }

  const round2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
  function tiered(base, tiers, addRate = 0, cap = Infinity) {
    const rows = [];
    let lower = 0, tax = 0;
    for (const [upper, rate0] of tiers) {
      if (base <= lower) break;
      const rate = Math.min(rate0 + addRate, cap);
      const amount = Math.min(base, upper) - lower;
      const t = amount * rate;
      rows.push({from: lower, to: Math.min(base, upper), rate, tax: t});
      tax += t;
      lower = upper;
    }
    return {tax, rows};
  }

  const USES = ['mainLandAndHouse', 'mainBuildingOnly', 'residentialOther', 'agriculture', 'other', 'vacant'];
  const INDIVIDUAL_ONLY = new Set(['mainLandAndHouse', 'mainBuildingOnly']);

  /* Pure calculation. Missing values stay missing: they are reported, never treated as zero. */
  function compute(input) {
    const out = {errors: [], missing: [], parts: [], notes: []};
    const use = input.use;
    const owner = input.owner === 'juristic' ? 'juristic' : 'individual';
    if (!USES.includes(use)) { out.errors.push('use'); return out; }
    if (owner === 'juristic' && INDIVIDUAL_ONLY.has(use)) { out.errors.push('mainHomeJuristic'); return out; }
    // land
    let land = null;
    if (use !== 'mainBuildingOnly') {
      const area = (Number(input.rai) || 0) * 400 + (Number(input.ngan) || 0) * 100 + (Number(input.wah) || 0);
      const price = input.landPricePerWah;
      if (price === null || price === undefined || price === '' || !Number.isFinite(Number(price))) out.missing.push('landPrice');
      else if (Number(price) < 0 || area < 0) out.errors.push('negative');
      else if (area === 0) out.missing.push('landArea');
      else land = {areaWah: area, pricePerWah: Number(price), value: area * Number(price)};
    }
    // buildings
    const buildings = [];
    for (const b of input.buildings || []) {
      const p = PRICES.find(x => x.code === b.code);
      const area = Number(b.area);
      if (!p || !(area > 0)) continue;
      const price = Number.isFinite(Number(b.priceOverride)) && Number(b.priceOverride) > 0 ? Number(b.priceOverride) : p.price;
      const material = DEPRECIATION[b.material] ? b.material : p.material;
      const age = Number(b.age);
      const dep = depreciationPct(material, Number.isFinite(age) ? age : 0);
      const gross = area * price;
      buildings.push({code: p.code, name: p.name, area, price, material, age: Number.isFinite(age) ? age : 0, depreciationPct: dep, gross, value: gross * (1 - dep / 100)});
    }
    if (use === 'mainBuildingOnly' && !buildings.length) out.missing.push('building');
    if (out.errors.length) return out;
    const landValue = land ? land.value : 0;
    const buildingValue = buildings.reduce((a, b) => a + b.value, 0);
    if (!land && !buildings.length) { out.missing.push('anyValue'); return out; }
    const base = landValue + buildingValue;
    out.land = land; out.buildings = buildings; out.base = base; out.landValue = landValue; out.buildingValue = buildingValue;
    // mixed use (s.38): the commercial share is taxed at the "other" rate; rest at the chosen residential use
    const mixable = ['mainLandAndHouse', 'mainBuildingOnly', 'residentialOther'].includes(use);
    const share = mixable ? Math.min(100, Math.max(0, Number(input.otherSharePct) || 0)) / 100 : 0;
    const mainBase = base * (1 - share), otherBase = base * share;
    let tax = 0;
    const addPart = (kind, partBase, exemption, tiers, addRate, cap, share) => {
      const taxable = Math.max(0, partBase - exemption);
      const r = tiered(taxable, tiers, addRate, cap);
      out.parts.push({kind, base: partBase, exemption: Math.min(exemption, partBase), taxable, rows: r.rows, tax: r.tax, share});
      tax += r.tax;
    };
    if (use === 'agriculture') {
      const others = owner === 'individual' ? Math.max(0, Number(input.otherAgriValue) || 0) : 0;
      const exemption = owner === 'individual' ? RULES.exemption.agricultureIndividual : 0;
      const total = base + others;
      const taxable = Math.max(0, total - exemption);
      const r = tiered(taxable, RULES.tiers.agriculture);
      const ratio = total > 0 ? base / total : 1;
      out.parts.push({kind: 'agriculture', base, ownerTotal: total, exemption: Math.min(exemption, total), taxable, rows: r.rows, ownerTax: r.tax, tax: r.tax * ratio, share: ratio});
      tax += r.tax * ratio;
      if (others > 0) out.notes.push('agriShare');
      if (taxable > RULES.tiers.agriculture[0][0]) out.notes.push('agriAllocation');
    } else if (use === 'vacant') {
      const years = Math.max(0, Math.floor(Number(input.vacantYears) || 0));
      const steps = years > RULES.vacantStepYears ? Math.floor((years - 1) / RULES.vacantStepYears) : 0;
      const addRate = steps * RULES.vacantStepRate;
      addPart('vacant', base, 0, RULES.tiers.other, addRate, RULES.vacantRateCap, 1);
      out.vacant = {years, steps, addRate};
      if (!input.vacantYears && input.vacantYears !== 0) out.missing.push('vacantYears');
    } else if (use === 'other') {
      addPart('other', base, 0, RULES.tiers.other, 0, Infinity, 1);
    } else {
      const exemption = use === 'mainLandAndHouse' ? RULES.exemption.mainLandAndHouse : use === 'mainBuildingOnly' ? RULES.exemption.mainBuildingOnly : 0;
      if (mainBase > 0 || share === 0) addPart(use, mainBase, exemption, RULES.tiers[use], 0, Infinity, 1 - share);
      if (otherBase > 0) { addPart('other', otherBase, 0, RULES.tiers.other, 0, Infinity, share); out.notes.push('mixedUse'); }
    }
    const reduction = [0, 50, 90].includes(Number(input.reductionPct)) ? Number(input.reductionPct) : 0;
    const beforeReduction = tax;
    tax = tax * (1 - reduction / 100);
    out.beforeReduction = round2(beforeReduction);
    out.reductionPct = reduction;
    out.tax = round2(tax);
    out.installments = out.tax >= RULES.installmentMinTax ? Array.from({length: RULES.installments}, (_, i) => i < RULES.installments - 1 ? Math.floor(out.tax / RULES.installments * 100) / 100 : round2(out.tax - 2 * Math.floor(out.tax / RULES.installments * 100) / 100)) : null;
    out.late = {
      penaltyBeforeReminder: round2(out.tax * RULES.penalty.beforeReminder),
      penaltyWithinReminder: round2(out.tax * RULES.penalty.withinReminder),
      penaltyAfter: round2(out.tax * RULES.penalty.after),
      surchargePerMonth: round2(out.tax * RULES.surchargePerMonth),
      surchargeCap: out.tax,
    };
    const prev = input.previousTax;
    if (prev !== null && prev !== undefined && prev !== '' && Number.isFinite(Number(prev))) out.difference = round2(out.tax - Number(prev));
    return out;
  }

  /* ---------------- UI ---------------- */
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const baht = (v, lang) => v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + (lang === 'en' ? ' THB' : ' บาท');
  const whole = v => Number(v).toLocaleString('en-US', {maximumFractionDigits: 0});
  const pct = r => (r * 100).toLocaleString('en-US', {maximumFractionDigits: 2}) + '%';
  let state = {lang: 'th', returnFocus: null};
  const T = (th, en) => state.lang === 'en' ? en : th;

  const USE_LABEL = {
    mainLandAndHouse: ['บ้านหลังหลัก · เจ้าของทั้งที่ดินและบ้าน มีชื่อในทะเบียนบ้านนี้ ณ 1 ม.ค.', 'Main home · owns land and house, named in this house registration on 1 Jan'],
    mainBuildingOnly: ['บ้านหลังหลัก · เป็นเจ้าของเฉพาะบ้าน ปลูกบนที่ดินคนอื่น', 'Main home · owns the house only, on someone else’s land'],
    residentialOther: ['ที่อยู่อาศัยอื่น · บ้านหลังที่สอง หรือให้เช่าอยู่อาศัย', 'Other residence · second home or rented out as a home'],
    agriculture: ['ทำเกษตร', 'Agriculture'],
    other: ['ค้าขาย สำนักงาน โรงงาน หรือใช้อย่างอื่น', 'Shop, office, factory or other use'],
    vacant: ['ทิ้งว่าง หรือไม่ได้ทำประโยชน์ตามควร', 'Left vacant or not used appropriately'],
  };
  const PART_LABEL = {
    mainLandAndHouse: ['ส่วนที่เป็นบ้านหลังหลัก', 'Main-home part'], mainBuildingOnly: ['ส่วนที่เป็นบ้านหลังหลัก (เฉพาะบ้าน)', 'Main-home part (house only)'],
    residentialOther: ['ส่วนที่อยู่อาศัยอื่น', 'Other residential part'], agriculture: ['เกษตร', 'Agriculture'], other: ['ส่วนที่ใช้ค้าขายหรืออย่างอื่น', 'Commercial or other part'], vacant: ['ทิ้งว่าง', 'Vacant'],
  };
  const MATERIAL_LABEL = {brick: ['ตึก', 'Masonry'], mixed: ['ครึ่งตึกครึ่งไม้', 'Half masonry'], wood: ['ไม้', 'Wood']};

  function buildingRow(i, b) {
    const options = PRICES.map(p => `<option value="${p.code}"${p.code === (b?.code || '105') ? ' selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('');
    const mats = Object.keys(MATERIAL_LABEL).map(m => `<option value="${m}"${b?.material === m ? ' selected' : ''}>${esc(T(...MATERIAL_LABEL[m]))}</option>`).join('');
    return `<fieldset class="tc-building" data-building="${i}"><legend>${T('อาคารหลังที่', 'Building')} ${i + 1}</legend>`
      + `<label class="tc-field tc-wide"><span>${T('ประเภทตามบัญชีราคากรมธนารักษ์', 'Type in the Treasury price schedule')}</span><select name="code">${options}</select></label>`
      + `<label class="tc-field"><span>${T('พื้นที่ใช้สอย (ตร.ม.)', 'Floor area (m²)')}</span><input name="area" type="number" inputmode="decimal" min="0" step="any" value="${esc(b?.area ?? '')}"></label>`
      + `<label class="tc-field"><span>${T('อายุอาคาร (ปี)', 'Building age (years)')}</span><input name="age" type="number" inputmode="decimal" min="0" step="any" value="${esc(b?.age ?? '')}"></label>`
      + `<label class="tc-field"><span>${T('วัสดุ (ใช้หาค่าเสื่อม)', 'Material (for depreciation)')}</span><select name="material"><option value="">${T('ตามประเภทอาคาร', 'From building type')}</option>${mats}</select></label>`
      + `<label class="tc-field"><span>${T('ราคาต่อ ตร.ม. ถ้าใช้บัญชีใหม่ (ไม่บังคับ)', 'Price per m² from a newer schedule (optional)')}</span><input name="priceOverride" type="number" inputmode="decimal" min="0" step="any" value="${esc(b?.priceOverride ?? '')}"></label>`
      + (i > 0 ? `<button type="button" class="tc-remove" data-remove-building="${i}">${T('ลบอาคารนี้', 'Remove this building')}</button>` : '')
      + `</fieldset>`;
  }

  function formHTML() {
    const useOptions = Object.keys(USE_LABEL).map((u, i) => `<label class="tc-choice"><input type="radio" name="use" value="${u}"${i === 0 ? ' checked' : ''}><span>${esc(T(...USE_LABEL[u]))}</span></label>`).join('');
    return `<div class="tc-head"><div><small>${T('สำหรับเจ้าหน้าที่ · ตรวจทีละแปลง', 'For officers · one parcel at a time')}</small><h2 id="tc-title">${T('คิดภาษีที่ควรเก็บ', 'Work out the tax due')}</h2></div><button type="button" class="quiet" data-tc-close>${T('ปิด', 'Close')}</button></div>`
      + `<p class="tc-intro">${T('ใส่ข้อมูลจากบัญชีรายการ (ภ.ด.ส.3) หรือที่ตรวจพบจริง ตัวเลขอยู่ในหน้านี้เท่านั้น ไม่ถูกส่งหรือบันทึกไว้ที่ไหน', 'Enter details from the property list (PDS 3) or what you found on site. Figures stay on this page and are not sent or saved.')}</p>`
      + `<form id="tc-form" novalidate>`
      + `<div class="tc-row"><label class="tc-field"><span>${T('ปีภาษี', 'Tax year')}</span><select name="year"><option value="2570">2570</option><option value="2569">2569</option></select></label>`
      + `<label class="tc-field"><span>${T('เจ้าของเป็น', 'Owner is')}</span><select name="owner"><option value="individual">${T('บุคคลธรรมดา', 'An individual')}</option><option value="juristic">${T('นิติบุคคล เช่น บริษัท ห้างร้าน', 'A juristic person, e.g. a company')}</option></select></label></div>`
      + `<fieldset class="tc-uses"><legend>${T('แปลงนี้ใช้ทำอะไร', 'How is this parcel used?')}</legend>${useOptions}</fieldset>`
      + `<div class="tc-row" data-show="mixable"><label class="tc-field tc-wide"><span>${T('ถ้ามีบางส่วนใช้ค้าขายหรืออย่างอื่น ใส่สัดส่วนพื้นที่ (%)', 'If part is used for business or other use, enter its share of floor area (%)')}</span><input name="otherSharePct" type="number" inputmode="decimal" min="0" max="100" step="any" placeholder="0"></label></div>`
      + `<div class="tc-row" data-show="vacant"><label class="tc-field tc-wide"><span>${T('ทิ้งว่างติดต่อกันมาแล้วกี่ปี (นับปีภาษีนี้ด้วย)', 'Years left vacant in a row, counting this tax year')}</span><input name="vacantYears" type="number" inputmode="numeric" min="0" step="1"></label></div>`
      + `<div class="tc-row" data-show="agriculture"><label class="tc-field tc-wide"><span>${T('มูลค่าที่ดินเกษตรแปลงอื่นของเจ้าของคนนี้ในเทศบาล (บาท) · ใช้หักยกเว้น 50 ล้านรวมทุกแปลง', 'Value of this owner’s other farm parcels in the municipality (THB) · the 50M exemption covers all parcels together')}</span><input name="otherAgriValue" type="number" inputmode="decimal" min="0" step="any" placeholder="0"></label></div>`
      + `<fieldset class="tc-land" data-show="land"><legend>${T('ที่ดิน', 'Land')}</legend><div class="tc-row">`
      + `<label class="tc-field"><span>${T('ราคาประเมิน (บาท ต่อ ตร.วา)', 'Appraised price (THB per sq. wah)')}</span><input name="landPricePerWah" type="number" inputmode="decimal" min="0" step="any"></label>`
      + `<label class="tc-field tc-small"><span>${T('ไร่', 'Rai')}</span><input name="rai" type="number" inputmode="numeric" min="0" step="1" placeholder="0"></label>`
      + `<label class="tc-field tc-small"><span>${T('งาน', 'Ngan')}</span><input name="ngan" type="number" inputmode="numeric" min="0" step="1" placeholder="0"></label>`
      + `<label class="tc-field tc-small"><span>${T('ตร.วา', 'Sq. wah')}</span><input name="wah" type="number" inputmode="decimal" min="0" step="any" placeholder="0"></label>`
      + `</div><p class="tc-hint">${T('ถ้ามีแปลงติดกันของเจ้าของคนเดียวกัน ให้รวมเนื้อที่และมูลค่าเป็นแปลงเดียว (ม.42)', 'Combine adjoining parcels of the same owner into one (s.42)')}</p></fieldset>`
      + `<div id="tc-buildings">${buildingRow(0)}</div><button type="button" class="tc-add" data-add-building>${T('เพิ่มอาคาร', 'Add a building')}</button>`
      + `<p class="tc-hint">${T('รั้ว ถนน และลาน ได้รับยกเว้น ไม่ต้องใส่', 'Fences, roads and yards are exempt; leave them out')}</p>`
      + `<details class="tc-more"><summary>${T('เพิ่มเติม: ลดภาษีเฉพาะกรณี และเทียบกับยอดเดิม', 'More: special reductions and comparing with the current bill')}</summary>`
      + `<div class="tc-row"><label class="tc-field tc-wide"><span>${T('ลดภาษีตามพระราชกฤษฎีกาเฉพาะกรณี', 'Reduction under a specific royal decree')}</span><select name="reductionPct"><option value="0">${T('ไม่มี', 'None')}</option><option value="50">${T('ลด 50% เช่น บ้านที่ได้รับมรดกก่อน 13 มี.ค. 2562 และอยู่อาศัยจริง', '50%, e.g. a home inherited before 13 Mar 2019 and lived in')}</option><option value="90">${T('ลด 90% เช่น ทรัพย์สินรอขายของผู้จัดสรร ตามเงื่อนไข', '90%, e.g. a developer’s unsold stock, subject to conditions')}</option></select></label></div>`
      + `<div class="tc-row"><label class="tc-field tc-wide"><span>${T('ภาษีที่ประเมินไว้เดิม (บาท) ถ้าต้องการเทียบ', 'Tax currently assessed (THB), to compare')}</span><input name="previousTax" type="number" inputmode="decimal" min="0" step="any"></label></div></details>`
      + `</form><section id="tc-result" class="tc-result" aria-live="polite"></section>`
      + `<details class="tc-law"><summary>${T('อ้างอิงกฎหมาย (ตรวจเมื่อ 19 ต.ค. 2569)', 'Legal references (checked 19 Oct 2026)')}</summary><ul>${RULES.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.th)}</a></li>`).join('')}</ul><p>${T('ราคาอาคาร: บัญชีราคาประเมินสิ่งปลูกสร้างจังหวัดขอนแก่น รอบ 2566–2569 และตารางค่าเสื่อมที่แนบในประกาศเทศบาลเมืองศิลา ปี 2569 · รอบ 2570–2573 กรมธนารักษ์มีกำหนดประกาศ 1 ธ.ค. 2569 ให้ใส่ราคาใหม่ในช่อง "ราคาต่อ ตร.ม."', 'Building prices: Khon Kaen schedule 2023–2026 with the depreciation table in Sila’s 2026 notice · the 2027–2030 schedule is due on 1 Dec 2026; enter new prices in the price-per-m² box')}</p></details>`;
  }

  function readInput(form) {
    const f = new FormData(form);
    const val = k => { const v = f.get(k); return v === null || v === '' ? null : v; };
    const buildings = [...form.querySelectorAll('.tc-building')].map(fs => ({
      code: fs.querySelector('[name=code]').value, area: fs.querySelector('[name=area]').value,
      age: fs.querySelector('[name=age]').value, material: fs.querySelector('[name=material]').value || null,
      priceOverride: fs.querySelector('[name=priceOverride]').value || null,
    }));
    return {year: val('year') || '2570', owner: val('owner'), use: val('use'), otherSharePct: val('otherSharePct'), vacantYears: val('vacantYears'),
      otherAgriValue: val('otherAgriValue'), landPricePerWah: val('landPricePerWah'), rai: val('rai'), ngan: val('ngan'), wah: val('wah'),
      buildings, reductionPct: val('reductionPct'), previousTax: val('previousTax')};
  }

  function syncVisibility(form) {
    const use = form.querySelector('[name=use]:checked')?.value;
    const juristic = form.querySelector('[name=owner]').value === 'juristic';
    form.querySelectorAll('[name=use]').forEach(r => { const off = juristic && INDIVIDUAL_ONLY.has(r.value); r.disabled = off; r.closest('.tc-choice').classList.toggle('tc-off', off); });
    if (juristic && INDIVIDUAL_ONLY.has(use)) form.querySelector('[name=use][value=other]').checked = true;
    const u = form.querySelector('[name=use]:checked')?.value;
    const show = {mixable: ['mainLandAndHouse', 'mainBuildingOnly', 'residentialOther'].includes(u), vacant: u === 'vacant', agriculture: u === 'agriculture' && !juristic, land: u !== 'mainBuildingOnly'};
    form.querySelectorAll('[data-show]').forEach(el => { el.hidden = !show[el.dataset.show]; });
  }

  function resultHTML(input, r) {
    const MISSING = {landPrice: T('ราคาประเมินที่ดิน', 'land appraised price'), landArea: T('เนื้อที่ดิน', 'land area'), building: T('ข้อมูลอาคาร', 'building details'), anyValue: T('ราคาที่ดินหรือข้อมูลอาคาร', 'land price or building details'), vacantYears: T('จำนวนปีที่ทิ้งว่าง', 'years vacant')};
    if (r.errors.includes('mainHomeJuristic')) return `<p class="tc-error">${T('สิทธิบ้านหลังหลักใช้ได้เฉพาะบุคคลธรรมดา นิติบุคคลให้เลือก "ที่อยู่อาศัยอื่น" หรือ "ค้าขาย"', 'Main-home relief is for individuals only. For a juristic person choose "other residence" or "business".')}</p>`;
    if (r.errors.includes('negative')) return `<p class="tc-error">${T('ใส่ตัวเลขตั้งแต่ 0 ขึ้นไป', 'Enter numbers of 0 or more')}</p>`;
    if (r.tax === undefined) return `<p class="tc-hint">${T('ยังไม่ได้ใส่', 'Still needed:')} ${r.missing.map(m => MISSING[m]).join(T(' และ ', ' and '))}</p>`;
    const sched = RULES.schedule[input.year] || RULES.schedule[2570];
    const parts = r.parts.map(p => {
      const rows = p.rows.map(x => `<tr><td>${whole(x.from)}–${whole(x.to)}</td><td>${pct(x.rate)}</td><td>${baht(x.tax, state.lang)}</td></tr>`).join('');
      const head = PART_LABEL[p.kind] ? T(...PART_LABEL[p.kind]) : p.kind;
      const shareTxt = p.share !== undefined && p.share < 1 && p.kind !== 'agriculture' ? ` · ${T('สัดส่วน', 'share')} ${pct(p.share)}` : '';
      const agri = p.kind === 'agriculture' && p.ownerTotal > p.base ? `<p class="tc-hint">${T('รวมทุกแปลงเกษตรของเจ้าของ', 'All this owner’s farm parcels')} ${baht(p.ownerTotal, state.lang)} · ${T('ภาษีรวม', 'total tax')} ${baht(p.ownerTax, state.lang)} · ${T('ส่วนของแปลงนี้ตามสัดส่วนมูลค่า', 'this parcel’s share by value')} ${pct(p.share)}</p>` : '';
      return `<h4>${esc(head)}${shareTxt}</h4><p class="tc-line">${T('ฐานภาษี', 'Tax base')} ${baht(p.base, state.lang)}${p.exemption ? ` · ${T('ยกเว้น', 'exempt')} ${baht(p.exemption, state.lang)}` : ''} · ${T('ส่วนที่ต้องเสียภาษี', 'taxable')} ${baht(p.taxable, state.lang)}</p>`
        + (rows ? `<table class="tc-table"><thead><tr><th scope="col">${T('ช่วงมูลค่า (บาท)', 'Value band (THB)')}</th><th scope="col">${T('อัตรา', 'Rate')}</th><th scope="col">${T('ภาษี', 'Tax')}</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="tc-line">${T('อยู่ในส่วนที่ได้รับยกเว้นทั้งหมด', 'Fully within the exemption')}</p>`) + agri;
    }).join('');
    const bld = r.buildings.map(b => `<li>${esc(b.code)} ${esc(b.name)} · ${whole(b.area)} ${T('ตร.ม.', 'm²')} × ${whole(b.price)} = ${baht(b.gross, state.lang)} · ${T('หักค่าเสื่อม', 'less depreciation')} ${b.depreciationPct}% (${esc(T(...MATERIAL_LABEL[b.material]))} ${whole(b.age)} ${T('ปี', 'yrs')}) = <strong>${baht(b.value, state.lang)}</strong></li>`).join('');
    const vac = r.vacant ? `<p class="tc-line">${T('ทิ้งว่าง', 'Vacant')} ${r.vacant.years} ${T('ปี', 'years')} · ${r.vacant.steps ? `${T('เพิ่มอัตรา', 'rate raised by')} ${pct(r.vacant.addRate)} ${T('ทุกช่วง (ม.43 สูงสุด 3%)', 'in every band (s.43, max 3%)')}` : T('ยังไม่ถึงปีที่ 4 จึงยังไม่เพิ่มอัตรา (ม.43)', 'not yet in year 4, so no increase (s.43)')}</p>` : '';
    const inst = r.installments ? `<p class="tc-line">${T('ผ่อนได้ 3 งวด', '3 installments allowed')}: ${r.installments.map((v, i) => `${esc(state.lang === 'en' ? sched.monthsEn[i] : sched.months[i])} ${baht(v, state.lang)}`).join(' · ')}</p>` : `<p class="tc-line">${T('ภาษีต่ำกว่า 3,000 บาท ชำระครั้งเดียว', 'Under 3,000 THB: pay in one go')}</p>`;
    const diff = r.difference !== undefined ? `<p class="tc-diff">${r.difference > 0 ? T('ควรเก็บเพิ่มจากยอดเดิม', 'More than the current bill by') : r.difference < 0 ? T('น้อยกว่ายอดเดิม', 'Less than the current bill by') : T('เท่ากับยอดเดิม', 'Same as the current bill')} ${r.difference ? baht(Math.abs(r.difference), state.lang) : ''}</p>` : '';
    const missing = r.missing.length ? `<p class="tc-hint">${T('ยังไม่ได้ใส่', 'Not entered:')} ${r.missing.map(m => MISSING[m]).join(T(' และ ', ' and '))} · ${T('ผลด้านล่างคิดจากส่วนที่ใส่แล้วเท่านั้น', 'the result counts only what has been entered')}</p>` : '';
    return `<h3>${T('ผลการคำนวณ', 'Result')}</h3>${missing}`
      + `<div class="tc-total"><span>${T('ภาษีที่ควรเก็บ', 'Tax due')} · ${T('ปี', 'year')} ${esc(input.year)}</span><strong>${baht(r.tax, state.lang)}</strong>${r.reductionPct ? `<small>${T('ก่อนลด', 'before reduction')} ${baht(r.beforeReduction, state.lang)} · ${T('ลด', 'reduced')} ${r.reductionPct}%</small>` : ''}</div>${diff}`
      + `<h4>${T('มูลค่าทรัพย์สิน', 'Property value')}</h4><ul class="tc-list">${r.land ? `<li>${T('ที่ดิน', 'Land')} ${whole(r.land.areaWah)} ${T('ตร.วา', 'sq. wah')} × ${whole(r.land.pricePerWah)} = <strong>${baht(r.land.value, state.lang)}</strong></li>` : ''}${bld}</ul><p class="tc-line">${T('รวมเป็นฐานภาษี', 'Total tax base')} <strong>${baht(r.base, state.lang)}</strong></p>`
      + vac + parts + notesHTML(r)
      + `<h4>${T('กำหนดชำระ', 'When to pay')}</h4><p class="tc-line">${esc(state.lang === 'en' ? sched.en : sched.th)}</p>${inst}`
      + `<h4>${T('ถ้าชำระช้า', 'If paid late')}</h4><ul class="tc-list"><li>${T('เบี้ยปรับ 10% ถ้าชำระก่อนได้รับหนังสือแจ้งเตือน', '10% penalty if paid before the reminder notice')} = ${baht(r.late.penaltyBeforeReminder, state.lang)}</li><li>${T('เบี้ยปรับ 20% ถ้าชำระภายในเวลาที่หนังสือแจ้งเตือนกำหนด', '20% if paid within the reminder deadline')} = ${baht(r.late.penaltyWithinReminder, state.lang)}</li><li>${T('เบี้ยปรับ 40% ถ้าเลยเวลาในหนังสือแจ้งเตือน', '40% after the reminder deadline')} = ${baht(r.late.penaltyAfter, state.lang)}</li><li>${T('เงินเพิ่ม 1% ต่อเดือน เศษของเดือนนับเป็นหนึ่งเดือน ไม่คิดทบต้น และรวมแล้วไม่เกินค่าภาษี', 'Surcharge 1% a month, part months count as whole, no compounding, capped at the tax')} = ${baht(r.late.surchargePerMonth, state.lang)} ${T('ต่อเดือน', 'a month')}</li></ul>`
      + `<p class="tc-hint">${T('ผลนี้ช่วยตรวจงานเท่านั้น ใบแจ้งประเมินจริงต้องออกตามขั้นตอนของเทศบาล', 'This helps check work only; official assessments follow the municipality’s procedure.')}</p>`
      + `<button type="button" class="tc-copy" data-tc-copy>${T('คัดลอกสรุปผล', 'Copy summary')}</button>`;
  }

  function notesHTML(r) {
    const N = {
      mixedUse: T('แบ่งตามสัดส่วนพื้นที่ใช้สอยที่ใส่ (ม.38) · วิธีแบ่งละเอียดให้ตรวจตามประกาศกระทรวงการคลังและกระทรวงมหาดไทยเรื่องการใช้ประโยชน์หลายประเภท', 'Split by the floor-area share entered (s.38) · check detailed apportionment against the joint Finance–Interior announcement on mixed use'),
      agriShare: T('ยกเว้น 50 ล้านบาทคิดรวมทุกแปลงเกษตรของเจ้าของคนเดียวกันในเทศบาล (ม.40) ภาษีของแปลงนี้แบ่งตามสัดส่วนมูลค่า', 'The 50M exemption covers all of the owner’s farm parcels in the municipality together (s.40); this parcel’s tax is shared by value'),
      agriAllocation: T('ส่วนที่ต้องเสียภาษีเกิน 75 ล้านบาท ให้ตรวจวิธีแบ่งส่วนยกเว้นรายแปลงตามประกาศร่วมเรื่องยกเว้นฐานภาษีเกษตรของบุคคลธรรมดา', 'Taxable value is above 75M; check how the exemption is split between parcels under the joint announcement on farm exemptions'),
    };
    const list = r.notes.filter(n => N[n]).map(n => `<li>${esc(N[n])}</li>`).join('');
    return list ? `<ul class="tc-list tc-notes">${list}</ul>` : '';
  }
  function summaryText(input, r) {
    if (r.tax === undefined) return '';
    const lines = [T('สรุปการคำนวณภาษีที่ดินและสิ่งปลูกสร้าง', 'Land and building tax calculation'), `${T('ปีภาษี', 'Tax year')}: ${input.year}`, `${T('การใช้ประโยชน์', 'Use')}: ${T(...USE_LABEL[input.use])}`];
    if (r.land) lines.push(`${T('ที่ดิน', 'Land')}: ${whole(r.land.areaWah)} ${T('ตร.วา', 'sq. wah')} × ${whole(r.land.pricePerWah)} = ${baht(r.land.value, state.lang)}`);
    for (const b of r.buildings) lines.push(`${T('อาคาร', 'Building')} ${b.code}: ${whole(b.area)} ${T('ตร.ม.', 'm²')} × ${whole(b.price)} − ${b.depreciationPct}% = ${baht(b.value, state.lang)}`);
    lines.push(`${T('ฐานภาษี', 'Tax base')}: ${baht(r.base, state.lang)}`, `${T('ภาษีที่ควรเก็บ', 'Tax due')}: ${baht(r.tax, state.lang)}`);
    lines.push(T('คำนวณด้วยเครื่องมือของต้นแบบ CityChat ศิลา (ตรวจกฎหมาย 19 ต.ค. 2569) ใช้ช่วยตรวจงาน ไม่ใช่ใบแจ้งประเมิน', 'Calculated with the CityChat Sila prototype (law checked 19 Oct 2026); a working aid, not an assessment notice'));
    return lines.join('\n');
  }

  function ensureDialog() {
    let d = document.getElementById('tax-calc-dialog');
    if (d) return d;
    d = document.createElement('dialog');
    d.id = 'tax-calc-dialog'; d.className = 'tax-calc-dialog'; d.setAttribute('aria-labelledby', 'tc-title');
    document.body.appendChild(d);
    d.addEventListener('close', () => { try { state.returnFocus?.focus(); } catch (_) {} });
    d.addEventListener('click', e => {
      if (e.target === d || e.target.closest('[data-tc-close]')) { d.close(); return; }
      if (e.target.closest('[data-add-building]')) {
        const box = d.querySelector('#tc-buildings');
        const n = box.querySelectorAll('.tc-building').length;
        if (n >= 6) return;
        box.insertAdjacentHTML('beforeend', buildingRow(n));
        box.lastElementChild.querySelector('select')?.focus();
        d._update?.(); return;
      }
      const rm = e.target.closest('[data-remove-building]');
      if (rm) {
        rm.closest('.tc-building').remove();
        d.querySelectorAll('.tc-building').forEach((fs, i) => {
          fs.dataset.building = String(i);
          fs.querySelector('legend').textContent = `${T('อาคารหลังที่', 'Building')} ${i + 1}`;
          const b = fs.querySelector('[data-remove-building]'); if (b) b.dataset.removeBuilding = String(i);
        });
        d._update?.(); d.querySelector('[data-add-building]').focus(); return;
      }
      const copy = e.target.closest('[data-tc-copy]');
      if (copy && d._last) {
        const txt = summaryText(d._last.input, d._last.r);
        const done = () => { copy.textContent = T('คัดลอกแล้ว', 'Copied'); setTimeout(() => { copy.textContent = T('คัดลอกสรุปผล', 'Copy summary'); }, 2000); };
        const fail = () => { copy.textContent = T('คัดลอกไม่สำเร็จ ลองเลือกข้อความเอง', 'Copy failed; select the text yourself'); };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(done).catch(fail); else fail();
      }
    });
    return d;
  }

  function render(d) {
    d.innerHTML = formHTML();
    const form = d.querySelector('#tc-form');
    const update = () => { syncVisibility(form); const input = readInput(form); const r = compute(input); d.querySelector('#tc-result').innerHTML = resultHTML(input, r); d._last = {input, r}; };
    d._update = update;
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.addEventListener('submit', e => e.preventDefault());
    update();
  }

  function open(options = {}) {
    state = {lang: options.language === 'en' ? 'en' : 'th', returnFocus: options.returnFocus || document.activeElement};
    const d = ensureDialog();
    d.lang = state.lang;
    render(d);
    if (!d.open) d.showModal();
    d.querySelector('select, input')?.focus();
  }

  root.SilaTaxCalculator = Object.freeze({open, compute, RULES, PRICES, depreciationPct});
})(typeof window === 'undefined' ? globalThis : window);
