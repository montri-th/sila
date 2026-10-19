/* Municipal public summaries only. No individual records, identity resolver, auth or source export. */
(function (root) {
  'use strict';
  const REQUIRED_IDS = Object.freeze(['tax', 'business', 'animals', 'healthservices']);
  const IDS = Object.freeze([...REQUIRED_IDS, 'caregroups']);
  const GROUPS = Object.freeze({tax:'Land', business:'Location', animals:'Living', healthservices:'Living', caregroups:'Living'});
  const ICONS = Object.freeze({tax:'parcels', business:'buildings', animals:'datasets', healthservices:'health', caregroups:'health'});
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tr = (value, lang) => typeof value === 'object' && value !== null ? (value[lang] || value.th || value.en || '') : String(value ?? '');
  const word = (th, en, lang) => lang === 'en' ? en : th;
  function valid(payload) {
    if (!payload || payload.schema !== 'sila-municipal-public-summary/1.0' || payload.exposure !== 'municipality_aggregate_only' || payload.recordDetailsAvailable !== false || payload.sourceRowExportAvailable !== false || !Array.isArray(payload.datasets)) return false;
    const metric = m => m && typeof m === 'object' && (m.value === null || typeof m.value === 'number' && Number.isFinite(m.value));
    const ids = payload.datasets.map(d => d?.id);
    return new Set(ids).size === ids.length && REQUIRED_IDS.every(id => ids.includes(id)) && payload.datasets.every(d => d && IDS.includes(d.id) && d.scope === 'municipality' && (d.id !== 'caregroups' || d.coverage === 'supplied_service_cohort_only') && Array.isArray(d.metrics) && d.metrics.every(metric) && Array.isArray(d.sources) && d.sources.every(s => s?.publicDownload === false) && Array.isArray(d.nextSteps) && (d.breakdowns === undefined || Array.isArray(d.breakdowns) && d.breakdowns.every(b => b && Array.isArray(b.rows) && b.rows.every(metric))));
  }
  function get(payload, id) { return valid(payload) ? payload.datasets.find(d => d.id === id) || null : null; }
  function entries(payload) {
    if (!valid(payload)) return [];
    return payload.datasets.map(d => ({id:d.id,label:tr(d.label,'th'),group:GROUPS[d.id],status:'municipal_public_summary',count:d.metrics.find(m => m.id === 'source_files')?.value ?? null,mappedCount:null,geojson:null,sourceFolders:[],searchTerms:Array.isArray(d.searchTerms) ? d.searchTerms : [],publicAggregate:true,receivedAt:payload.sourceReceivedAt}));
  }
  function valueLabel(metric, lang) {
    if (metric.value === null) {
      const withheld = ['withheld','suppressed','restricted','not_published'].includes(metric.state || metric.status);
      return {number:'—',state:withheld ? word('ไม่เผยข้อมูลส่วนนี้','Not published',lang) : word('ยังไม่ยืนยัน','Not yet verified',lang)};
    }
    const digits = Number.isInteger(metric.decimals) ? Math.min(2,Math.max(0,metric.decimals)) : tr(metric.unit,'en') === 'THB' ? 2 : Number.isInteger(metric.value) ? 0 : 2;
    return {number:metric.value.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}),state:''};
  }
  function statusLabel(status, lang) {
    return ({'content-inspected':word('อ่านเนื้อหาแล้ว · ยังต้องสอบทานการใช้งาน','Content inspected · operational reconciliation remains',lang),'parsing':word('กำลังตรวจโครงสร้าง','Structure review in progress',lang),'metadata-only':word('พบไฟล์ · รออ่านเนื้อหา','File identified · content review pending',lang),'validated-aggregate':word('ตรวจยอดสรุปแล้ว','Aggregate checked',lang)})[status] || word('กำลังสอบทาน','Review in progress',lang);
  }
  function scopeNote(dataset, lang, selectedScope) {
    const title = dataset.id === 'caregroups' ? word('ยอดรวมจากบัญชีดูแลที่ได้รับ','Totals from the supplied care lists',lang) : word('ยอดรวมทั้งเทศบาล','City-wide totals',lang);
    return `<p class="inline-note aggregate-scope"><strong>${esc(title)}</strong> · ${esc(word('ไม่แยกตามพื้นที่ที่เลือกบนแผนที่','not split by the area selected on the map',lang))}${selectedScope ? ` (${esc(selectedScope)})` : ''}</p>`;
  }
  function scopeDetail(dataset, lang, selectedScope) {
    const title = dataset.id === 'caregroups' ? word('กลุ่มในบัญชีดูแลที่ได้รับ','Received care cohort',lang) : word('สรุประดับเทศบาล','Municipality-wide summary',lang);
    return `<div class="notice aggregate-scope"><strong>${esc(title)}</strong><p>${esc(tr(dataset.limitations,lang))}</p>${selectedScope ? `<p>${esc(word('ขอบเขตแผนที่ที่เลือกเป็นเพียงบริบท: ','Selected map is context only: ',lang)+selectedScope)}</p>` : ''}</div>`;
  }
  function unitLabel(metric, lang) {
    const unit = tr(metric.unit,lang);
    return lang === 'en' && metric.value === 1 ? ({files:'file',rows:'row',groups:'group',records:'record',animals:'animal'})[unit] || unit : unit;
  }
  function metrics(dataset, lang) {
    return `<section class="panel-section aggregate-facts" aria-label="${esc(word('ข้อเท็จจริงจากข้อมูลสรุป','Facts from the public summary',lang))}"><div class="facts-grid">${dataset.metrics.map(m => {const v=valueLabel(m,lang);return `<article class="fact aggregate-fact"><h2>${esc(tr(m.label,lang))}</h2><strong>${esc(v.number)} <span class="aggregate-unit">${esc(unitLabel(m,lang))}</span></strong>${v.state ? `<p class="aggregate-state">${esc(v.state)}</p>`:''}${tr(m.note,lang) ? `<details class="fact-note"><summary>${esc(word('ตัวเลขนี้หมายถึง','What this figure means',lang))}</summary><p>${esc(tr(m.note,lang))}</p></details>` : ''}</article>`;}).join('')}</div></section>`;
  }
  function breakdowns(dataset, lang) {
    return (dataset.breakdowns || []).map(b => `<section class="panel-section aggregate-breakdown"><h2>${esc(tr(b.label,lang))}</h2><p class="inline-note">${esc(tr(b.note,lang))}</p><table><thead><tr><th scope="col">${esc(word('ประเภทตามต้นทาง','Source category',lang))}</th><th scope="col">${esc(word('จำนวนตามบัญชี','Source count',lang))}</th></tr></thead><tbody>${b.rows.map(m => {const v=valueLabel(m,lang);return `<tr><th scope="row"><span>${esc(tr(m.label,lang))}</span>${m.note ? `<small>${esc(tr(m.note,lang))}</small>` : ''}</th><td><strong>${esc(v.number)}</strong><span class="aggregate-table-unit">${esc(unitLabel(m,lang))}</span>${v.state ? `<small class="aggregate-state">${esc(v.state)}</small>` : ''}</td></tr>`;}).join('')}</tbody></table></section>`).join('');
  }
  function steps(dataset, lang) {
    return `<section class="panel-section aggregate-next"><div class="section-title"><h2>${esc(word('ทำอะไรต่อได้บ้าง','What to do next',lang))}</h2></div><ol>${dataset.nextSteps.map(v=>`<li>${esc(tr(v,lang))}</li>`).join('')}</ol><p class="inline-note">${esc(word('การตรวจรายบุคคลและการแก้ไขระบบงานต้องใช้ช่องทางเจ้าหน้าที่ที่ได้รับสิทธิ','Individual review and operational changes require the authorized Officer workflow',lang))}</p></section>`;
  }
  function packages(dataset, lang) {
    if (!dataset.sources.length) return `<p class="inline-note">${esc(word('กำลังตรวจข้อมูลประกอบก่อนเผยแพร่คำอธิบายต้นทาง','Supporting source descriptions are being reviewed before publication',lang))}</p>`;
    return `<section class="panel-section aggregate-packages"><div class="section-title"><h2>${esc(word('ชุดต้นทางและความพร้อม','Source packages and readiness',lang))}</h2><span>${esc(word('คำอธิบายสรุป','Summary descriptions',lang))}</span></div>${dataset.sources.map(s=>`<article class="document-card"><h3>${esc(tr(s.label,lang))}</h3><p>${esc(statusLabel(s.status,lang))}</p><div class="document-meta">${esc(word('ช่วงอ้างอิงตามต้นทาง: ','Source reference period: ',lang))}${esc(tr(s.periodLabel,lang))}</div></article>`).join('')}</section>`;
  }
  function privacy(dataset, lang) { return `<p class="inline-note aggregate-privacy">${esc(tr(dataset.privacy,lang))} ${esc(word('หน้านี้ไม่มีรายการรายบุคคลหรือไฟล์ต้นฉบับให้ดาวน์โหลด','This view offers no individual rows or raw source downloads',lang))}</p>`; }
  function render(payload, id, options) {
    options=options || {};const d=get(payload,id);if(!d)return '';const lang=options.language==='en'?'en':'th';
    const scope=scopeNote(d,lang,options.scopeLabel);
    if(options.tab==='list')return `<div class="aggregate-view">${scope}${packages(d,lang)}${steps(d,lang)}</div>`;
    if(options.tab==='source')return `<div class="aggregate-view">${scopeDetail(d,lang,options.scopeLabel)}<dl class="source-dl"><dt>${esc(word('ความหมายของมุมมอง','View meaning',lang))}</dt><dd>${esc(d.id === 'caregroups' ? word('สรุปรหัสในบัญชีดูแลที่ได้รับ ไม่ใช่จำนวนผู้ป่วยทั้งหมดหรือข้อมูลรายบุคคล','Source care-cohort key aggregates, not all patients or individual records',lang) : word('ข้อมูลสรุปทั้งเทศบาล ไม่ใช่รายแปลง รายครัวเรือน หรือรายผู้ป่วย','Municipal aggregates, not title, household or patient records',lang))}</dd><dt>${esc(word('วันรับข้อมูล','Sources received',lang))}</dt><dd>${esc(payload.sourceReceivedAt)} · ${esc(word('ไม่ใช่วันสำรวจหรือวันตัดยอดของทุกไฟล์','not every file’s survey or accounting cutoff date',lang))}</dd><dt>${esc(word('การจับคู่พื้นที่','Spatial allocation',lang))}</dt><dd>${esc(word('ยังไม่แจกแจงตามหมู่บ้านหรือเขตเลือกตั้ง การเลือกพื้นที่ไม่เปลี่ยนยอดจากไฟล์','Not allocated to villages or electoral areas; selecting a map area does not change source totals',lang))}</dd></dl>${packages(d,lang)}${privacy(d,lang)}</div>`;
    return `<div class="aggregate-view">${scope}${metrics(d,lang)}${breakdowns(d,lang)}${steps(d,lang)}</div>`;
  }
  root.SilaPublicAggregates=Object.freeze({ids:IDS,requiredIds:REQUIRED_IDS,icons:ICONS,valid,get,entries,valueLabel,statusLabel,render,localized:tr});
})(typeof window==='undefined'?globalThis:window);
