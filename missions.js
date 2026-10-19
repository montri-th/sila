/* Sila officer missions: datasets grouped by municipal work, in plain language.
 * Load before app.js. No data, no personal records: labels, purposes and routing only.
 * A dataset may serve several missions. Caveats stay in each dataset's "ที่มาและข้อควรรู้" tab.
 */
(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pick = (pair, lang) => Array.isArray(pair) ? (lang === 'en' ? pair[1] : pair[0]) : String(pair ?? '');

  const MISSIONS = Object.freeze([
    {
      id: 'tax', icon: 'parcels',
      short: ['ภาษี', 'Tax'],
      label: ['งานภาษีและรายได้', 'Tax and revenue'],
      unit: ['กองคลัง · งานจัดเก็บรายได้', 'Finance division · revenue'],
      benefit: ['ดูว่าข้อมูลภาษีมีอะไรแล้ว ตรวจแปลงและอาคารบนแผนที่ และคิดภาษีที่ควรเก็บทีละแปลง',
                'See which tax records exist, check parcels and buildings on the map, and work out the tax due for one parcel'],
      tasks: [
        {dataset: 'tax', label: ['ดูยอดรับชำระและแบบภาษีที่มี', 'See receipts and tax forms on file']},
        {dataset: 'parcels', label: ['ดูแปลงที่ดินบนแผนที่', 'See parcels on the map']},
        {dataset: 'buildings', label: ['ดูอาคารบนแผนที่', 'See buildings on the map']},
        {tool: 'tax-calculator', label: ['คิดภาษีที่ควรเก็บของหนึ่งแปลง', 'Work out the tax due for one parcel']},
        {dataset: 'business', label: ['ดูกิจการที่ขอใบอนุญาตไว้', 'See licensed businesses']},
        {dataset: 'houses', label: ['หาบ้านเลขที่บนแผนที่', 'Find a house number on the map']},
      ],
    },
    {
      id: 'flood', icon: 'flood',
      short: ['น้ำท่วม', 'Flood'],
      label: ['งานน้ำท่วมและภัยพิบัติ', 'Flood and disaster'],
      unit: ['งานป้องกันและบรรเทาสาธารณภัย', 'Disaster prevention and relief'],
      benefit: ['ดูจุดที่เคยวางแผนแก้น้ำท่วม ทางน้ำ ที่สูงที่ต่ำ และถนนที่ใช้เข้าพื้นที่',
                'See past flood-fix sites, waterways, high and low ground, and access roads'],
      tasks: [
        {dataset: 'flood', label: ['ดูแผนแก้น้ำท่วม 16 จุด', 'See the 16 flood-fix sites']},
        {dataset: 'waterways', label: ['ดูลำห้วยและแหล่งน้ำ', 'See streams and water bodies']},
        {dataset: 'terrain', label: ['ดูที่สูงที่ต่ำแบบ 3D', 'See high and low ground in 3D']},
        {dataset: 'roads', label: ['ดูถนนที่ใช้เข้าพื้นที่', 'See access roads']},
        {dataset: 'caregroups', label: ['ดูจำนวนผู้รับการดูแล (ยอดรวม)', 'See care recipients (totals only)']},
        {dataset: 'cctv', label: ['ดูตำแหน่งกล้อง CCTV', 'See CCTV locations']},
      ],
    },
    {
      id: 'care', icon: 'population',
      short: ['ดูแลคน', 'Care'],
      label: ['งานดูแลกลุ่มเปราะบางและสาธารณสุข', 'Care and public health'],
      unit: ['กองสาธารณสุข · กองสวัสดิการสังคม', 'Public health · social welfare'],
      benefit: ['ดูจำนวนผู้รับการดูแลแยกกลุ่ม สถานพยาบาล และงานบริการสัตว์ เพื่อวางรอบเยี่ยมบ้านและบริการ',
                'See care recipients by group, health facilities and animal services to plan home visits and services'],
      tasks: [
        {dataset: 'caregroups', label: ['ดูจำนวนผู้รับการดูแลแยกกลุ่ม', 'See care recipients by group']},
        {dataset: 'healthservices', label: ['ดูความพร้อมข้อมูลงานดูแล', 'See care data readiness']},
        {dataset: 'health', label: ['ดูสถานพยาบาลบนแผนที่', 'See health facilities on the map']},
        {dataset: 'animals', label: ['ดูจำนวนสุนัขแมวเพื่อวางรอบวัคซีน', 'See dog and cat counts for vaccination rounds']},
        {dataset: 'population', label: ['ดูประชากรแต่ละหมู่บ้าน', 'See population by village']},
      ],
    },
    {
      id: 'works', icon: 'roads',
      short: ['โยธา', 'Works'],
      label: ['งานโยธาและบริการสาธารณะ', 'Public works and services'],
      unit: ['กองช่าง', 'Engineering division'],
      benefit: ['ดูถนน กล้อง และสถานที่สาธารณะ เพื่อวางแผนซ่อม ติดตั้ง และดูแลพื้นที่',
                'See roads, cameras and public places to plan repairs, installation and upkeep'],
      tasks: [
        {dataset: 'roads', label: ['ดูถนนที่ขึ้นทะเบียน', 'See registered roads']},
        {dataset: 'publicfacilities', label: ['ดูพื้นที่สาธารณูปการ', 'See public facility areas']},
        {dataset: 'cctv', label: ['ดูตำแหน่งกล้อง CCTV', 'See CCTV locations']},
        {dataset: 'education', label: ['ดูสถานศึกษา', 'See schools']},
        {dataset: 'religion', label: ['ดูศาสนสถาน', 'See religious places']},
        {dataset: 'buildings', label: ['ดูอาคารบนแผนที่', 'See buildings on the map']},
      ],
    },
    {
      id: 'area', icon: 'boundaries',
      short: ['พื้นที่', 'Area'],
      label: ['ข้อมูลพื้นฐานพื้นที่', 'Area basics'],
      unit: ['สำนักปลัด · ใช้ได้ทุกกอง', 'Clerk’s office · all divisions'],
      benefit: ['ดูขอบเขตเทศบาล หมู่บ้าน เขตเลือกตั้ง และประชากรแต่ละหมู่บ้าน',
                'See the municipal boundary, villages, electoral areas and population by village'],
      tasks: [
        {dataset: 'overview', label: ['ดูภาพรวม 28 หมู่บ้าน', 'See all 28 villages']},
        {dataset: 'population', label: ['ดูประชากรแต่ละหมู่บ้าน', 'See population by village']},
        {dataset: 'villages', label: ['ดูขอบเขตหมู่บ้าน', 'See village boundaries']},
        {dataset: 'election', label: ['ดูเขตเลือกตั้ง 3 เขต', 'See the 3 electoral areas']},
        {dataset: 'municipality', label: ['ดูขอบเขตเทศบาล', 'See the municipal boundary']},
        {dataset: 'houses', label: ['หาบ้านเลขที่บนแผนที่', 'Find a house number on the map']},
      ],
    },
  ]);

  /* What each dataset helps an officer do (shown instead of caveats in menus). */
  const PURPOSE = Object.freeze({
    overview: ['ภาพรวมจำนวนบ้าน อาคาร และถนน ของทั้ง 28 หมู่บ้าน', 'Houses, buildings and roads across all 28 villages'],
    houses: ['หาบ้านเลขที่และดูตำแหน่งบนแผนที่', 'Find a house number and see where it is'],
    buildings: ['ดูรูปอาคารทุกหลังบนแผนที่', 'See every building outline on the map'],
    parcels: ['ดูแปลงบนแผนที่ภาษี และเปิดรายการแปลงในพื้นที่', 'See parcels on the tax map and list them by area'],
    tax: ['ดูยอดรับชำระ ลูกหนี้ และแบบภาษีที่เทศบาลมีอยู่', 'See receipts, arrears and the tax forms on file'],
    business: ['ดูกิจการที่ขอใบอนุญาต แยกตามประเภท', 'See licensed businesses by type'],
    flood: ['อ่านปัญหาและแนวทางแก้ของ 16 จุดในแผนเดิม', 'Read the problem and proposed fix for 16 planned sites'],
    waterways: ['ดูลำห้วยและแหล่งน้ำบนแผนที่', 'See streams and water bodies on the map'],
    terrain: ['ดูที่สูงที่ต่ำของพื้นที่ แบบ 2D และ 3D', 'See high and low ground in 2D and 3D'],
    roads: ['ดูถนนที่ขึ้นทะเบียนทางหลวงในเทศบาล', 'See registered road segments'],
    cctv: ['ดูตำแหน่งกล้อง CCTV ที่ได้รับ', 'See supplied CCTV locations'],
    caregroups: ['ดูจำนวนผู้รับการดูแลแยกตามกลุ่ม ไม่มีรายชื่อ', 'See care recipients by group, without names'],
    healthservices: ['ดูว่าข้อมูลงานดูแลระยะยาวพร้อมใช้แค่ไหน', 'See how ready the long-term care data is'],
    health: ['ดูตำแหน่งสถานพยาบาล', 'See health facility locations'],
    animals: ['ดูจำนวนสุนัขและแมวเพื่อวางรอบวัคซีน', 'See dog and cat counts for vaccination rounds'],
    population: ['ดูจำนวนประชากรแต่ละหมู่บ้าน', 'See population by village'],
    publicfacilities: ['ดูพื้นที่สาธารณูปการบนแผนที่', 'See public facility areas'],
    education: ['ดูตำแหน่งสถานศึกษา', 'See school locations'],
    religion: ['ดูตำแหน่งศาสนสถาน', 'See religious places'],
    villages: ['ดูขอบเขตและเลือกดูทีละหมู่บ้าน', 'See and choose village boundaries'],
    municipality: ['ดูขอบเขตเทศบาลที่ได้รับ', 'See the supplied municipal boundary'],
    election: ['ดูเขตเลือกตั้ง 3 เขต (ขอบเขตทดลอง)', 'See the 3 electoral areas (trial boundary)'],
  });

  /* Plain unit for the main count of each dataset. */
  const UNIT = Object.freeze({
    overview: ['หมู่บ้าน', 'villages'], houses: ['จุด', 'points'], buildings: ['อาคาร', 'buildings'], parcels: ['แปลง', 'parcels'],
    roads: ['ช่วงถนน', 'segments'], cctv: ['กล้อง', 'cameras'], education: ['แห่ง', 'places'], health: ['แห่ง', 'places'],
    religion: ['แห่ง', 'places'], publicfacilities: ['พื้นที่', 'areas'], waterways: ['แหล่งน้ำ', 'features'],
    population: ['หมู่บ้าน', 'villages'], villages: ['หมู่บ้าน', 'villages'], municipality: ['เขต', 'boundary'],
    election: ['เขต', 'areas'], flood: ['จุด', 'sites'],
  });

  /* Only states an officer must notice; ordinary source data shows no chip. */
  const STATUS = Object.freeze({
    needs_reconciliation: ['มีตัวเลขรอตรวจ', 'Figures to check'],
    derived_display: ['ขอบเขตทดลอง', 'Trial boundary'],
    document_evidence_only: ['จากเอกสารแผนเดิม', 'From past plan documents'],
    municipal_public_summary: ['ยอดรวมทั้งเทศบาล', 'City-wide totals'],
    ready_external_dem: ['ข้อมูลภายนอก', 'External data'],
    external_team_pending: ['กำลังจัดทำ', 'In preparation'],
  });

  const byId = id => MISSIONS.find(m => m.id === id) || null;
  const datasetsOf = mission => mission.tasks.filter(t => t.dataset).map(t => t.dataset);
  function missionFor(datasetId, preferred) {
    const pref = byId(preferred);
    if (pref && (datasetsOf(pref).includes(datasetId))) return pref.id;
    const first = MISSIONS.find(m => datasetsOf(m).includes(datasetId));
    return first ? first.id : (pref ? pref.id : MISSIONS[0].id);
  }

  /* Segmented selector: changes the panel view; never submits anything. */
  function renderNav(current, opts) {
    const lang = opts.language, icon = opts.icon;
    return MISSIONS.map((m, i) => {
      const on = m.id === current;
      return `<button type="button" class="mission-tab" data-mission="${esc(m.id)}" aria-pressed="${on}" tabindex="${on ? 0 : -1}" aria-label="${esc(pick(m.label, lang))}">`
        + `${icon(m.icon, {size: 20})}<span>${esc(pick(m.short, lang))}</span>${on ? `<span class="mission-check" aria-hidden="true">${icon('done', {size: 16})}</span>` : ''}</button>`;
    }).join('');
  }

  function renderCard(missionId, opts) {
    const m = byId(missionId) || MISSIONS[0];
    const lang = opts.language, icon = opts.icon, available = opts.available || (() => true);
    const rows = m.tasks.filter(t => t.tool || available(t.dataset)).map(t => {
      const current = t.dataset && t.dataset === opts.dataset;
      const attr = t.tool ? `data-tool="${esc(t.tool)}"` : `data-dataset="${esc(t.dataset)}"`;
      const glyph = t.tool ? icon('plan', {size: 20}) : opts.datasetIcon(t.dataset, 20);
      return `<li><button type="button" class="mission-task" ${attr}${current ? ' aria-current="true"' : ''}>`
        + `<span class="mission-task-icon" aria-hidden="true">${glyph}</span><span class="mission-task-label">${esc(pick(t.label, lang))}</span>`
        + `${current ? `<span class="mission-task-state">${esc(lang === 'en' ? 'Showing' : 'กำลังดู')}</span>` : `<span class="mission-task-go" aria-hidden="true">${icon('next', {size: 18})}</span>`}`
        + `</button></li>`;
    }).join('');
    return `<h2 id="mission-title">${esc(pick(m.label, lang))}</h2><p class="mission-unit">${esc(pick(m.unit, lang))}</p>`
      + `<p class="mission-benefit">${esc(pick(m.benefit, lang))}</p><ul class="mission-tasks" aria-labelledby="mission-title">${rows}</ul>`;
  }

  /* Dataset menu grouped by mission; the current mission comes first. */
  function renderCatalog(opts) {
    const lang = opts.language, rows = opts.rows, current = opts.mission, q = (opts.query || '').trim();
    const row = d => {
      const chip = STATUS[d.status] ? `<span class="dataset-chip">${esc(pick(STATUS[d.status], lang))}</span>` : '';
      const count = opts.count(d);
      return `<button class="dataset-row" data-dataset="${esc(d.id)}" aria-current="${d.id === opts.dataset}">`
        + `<span class="dataset-type-icon">${opts.datasetIcon(d.id, 28)}</span>`
        + `<span><strong>${esc(opts.label(d.id))}</strong><small>${esc(pick(PURPOSE[d.id] || ['ข้อมูลจากเทศบาล', 'Municipal data'], lang))}</small>${chip}</span>`
        + `<span class="number">${count.value}<small>${esc(count.unit)}</small></span></button>`;
    };
    if (q) {
      const list = rows.filter(d => opts.matches(d, q));
      return list.length ? `<h3 class="dataset-group-title">${esc(lang === 'en' ? 'Search results' : 'ผลการค้นหา')}</h3>${list.map(row).join('')}` : '';
    }
    const order = [byId(current), ...MISSIONS.filter(m => m.id !== current)].filter(Boolean);
    return order.map(m => {
      const list = datasetsOf(m).map(id => rows.find(d => d.id === id)).filter(Boolean);
      if (!list.length) return '';
      return `<section class="dataset-mission"><h3 class="dataset-group-title">${opts.icon(m.icon, {size: 20})}<span>${esc(pick(m.label, lang))}</span></h3>${list.map(row).join('')}</section>`;
    }).join('');
  }

  root.SilaMissions = Object.freeze({missions: MISSIONS, purpose: PURPOSE, unit: UNIT, status: STATUS, byId, missionFor, renderNav, renderCard, renderCatalog, pick});
})(typeof window === 'undefined' ? globalThis : window);
