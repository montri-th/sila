/* Sila officer missions v2: every selectable item is a map layer.
 * Data that cannot be drawn on the map is folded into a layer of the same mission
 * as supplementary information. Load before app.js. No data, no personal records.
 */
(function (root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pick = (pair, lang) => Array.isArray(pair) ? (lang === 'en' ? pair[1] : pair[0]) : String(pair ?? '');

  /* Map layers an officer can choose. `supplements` are non-map summaries shown with the layer. */
  const LAYERS = Object.freeze({
    taxmap: {label: ['ภาษีที่ดินรายแปลง', 'Land tax by parcel'], kind: 'parcel-choropleth',
      benefit: ['ดูภาษีที่ประเมินปี 2569 ของแต่ละแปลง เทียบกับภาษีปี 2570 ที่คาดไว้ ทั้งวิธีเดิมและตามข้อเสนอ', 'Compare each parcel’s 2569 assessed tax with 2570 estimates under the current method and with proposed fixes'],
      supplements: ['tax'], tools: ['tax-calculator']},
    properties: {label: ['ทรัพย์สินรายเจ้าของ: ภาษีที่เพิ่มได้', 'Properties by owner: tax that can be added'], kind: 'parcel-choropleth',
      benefit: ['แผนที่ทำงาน: ทรัพย์สินคือแปลงที่ติดกันของเจ้าของเดียวกันพร้อมอาคาร ดูว่าภาษีปี 2570 ตามข้อเสนอเพิ่มจากวิธีเดิมกี่บาท กี่เปอร์เซ็นต์ และควรจัดการรายใดก่อน', 'Work map: a property is the adjoining parcels of one owner with their buildings; see how much the 2570 tax with fixes adds over the current method, in baht and percent, and which to handle first'],
      supplements: ['tax'], tools: ['tax-calculator']},
    businesses: {label: ['ธุรกิจนิติบุคคลที่จดทะเบียน VAT', 'VAT-registered companies'], kind: 'points',
      benefit: ['ดูบริษัทและห้างหุ้นส่วนที่จดทะเบียนภาษีมูลค่าเพิ่มในตำบลศิลา ตั้งอยู่บนทรัพย์สินใด และค้นข้อมูลกิจการต่อด้วย Google AI Mode', 'See companies and partnerships registered for VAT in Sila, which property they sit on, and look them up further with Google AI Mode']},
    appraisal: {label: ['ราคาประเมินที่ดินรายแปลง', 'Land appraisal by parcel'], kind: 'parcel-choropleth',
      benefit: ['ดูราคาประเมินที่ดิน บาทต่อตารางวา ทีละแปลงตามขอบโฉนด', 'See the land appraisal price in baht per square wah for each parcel']},
    buildings: {label: ['อาคาร บ้านเลขที่ และบัญชีภาษี', 'Buildings, house numbers and the tax roll'], kind: 'polygons',
      benefit: ['ดูอาคารทุกหลัง บ้านเลขที่ในอาคาร อยู่ในบัญชีภาษีหรือยัง และอาคารที่คร่อมหลายแปลง', 'See every building with its house numbers, whether it is on the tax roll, and buildings that span several parcels'],
      supplements: ['business']},
    houses: {label: ['หมุดบ้านที่สำรวจ', 'Surveyed house points'], kind: 'points',
      benefit: ['หาบ้านเลขที่ ดูผลสำรวจอาคาร แล้วไปยังรูปอาคารที่ผูกได้', 'Find a house number, see its building survey and go to its footprint']},
    terrain: {label: ['ที่สูงที่ต่ำ 2D และ 3D', 'High and low ground in 2D and 3D'], kind: 'terrain',
      benefit: ['ดูรูปทรงที่สูงที่ต่ำ ช่วยคิดเรื่องทางน้ำและจุดที่น้ำอาจขัง', 'See the shape of high and low ground to think about water paths and pooling'],
      supplements: ['flood']},
    waterways: {label: ['ลำห้วยและแหล่งน้ำ', 'Streams and water bodies'], kind: 'polygons',
      benefit: ['ดูทางน้ำบนแผนที่ พร้อมแผนแก้น้ำท่วมเดิม 16 จุด', 'See waterways on the map with the past 16-site flood plan'],
      supplements: ['flood']},
    popgrid: {label: ['คนในพื้นที่ แยกเพศและอายุ', 'People by sex and age'], kind: 'grid-choropleth',
      benefit: ['ดูว่าเด็ก คนอายุประมาณ 15–42 ปี และ 42 ปีขึ้นไป กระจุกตรงไหน เป็นช่องละ 250 เมตร นับจากบ้านที่มีรายชื่อในแบบสำรวจเท่านั้น', 'See where children and people aged about 15–42 and 42+ cluster, in 250 m cells, counted only from houses with survey member lists'],
      supplements: ['caregroups', 'healthservices', 'animals']},
    population: {label: ['ประชากรรายหมู่บ้าน', 'Population by village'], kind: 'village-choropleth',
      benefit: ['ดูจำนวนประชากรแต่ละหมู่บ้าน ปี 2569', 'See each village’s population for 2569 (2026)'],
      supplements: ['caregroups']},
    health: {label: ['สถานพยาบาล', 'Health facilities'], kind: 'points',
      benefit: ['ดูตำแหน่งสถานพยาบาล พร้อมความพร้อมข้อมูลงานดูแล', 'See health facilities with the readiness of care data'],
      supplements: ['healthservices', 'caregroups']},
    education: {label: ['สถานศึกษา', 'Schools'], kind: 'points', benefit: ['ดูตำแหน่งสถานศึกษา', 'See school locations']},
    roads: {label: ['ถนนขึ้นทะเบียน', 'Registered roads'], kind: 'lines', benefit: ['ดูถนนที่ขึ้นทะเบียนทางหลวงในเทศบาล', 'See registered road segments']},
    cctv: {label: ['กล้อง CCTV', 'CCTV cameras'], kind: 'points', benefit: ['ดูตำแหน่งกล้อง CCTV ที่ได้รับ', 'See supplied CCTV locations']},
    publicfacilities: {label: ['สาธารณูปการ', 'Public facilities'], kind: 'polygons', benefit: ['ดูพื้นที่สาธารณูปการบนแผนที่', 'See public facility areas']},
    religion: {label: ['ศาสนสถาน', 'Religious places'], kind: 'points', benefit: ['ดูตำแหน่งศาสนสถาน', 'See religious places']},
    overview: {label: ['ขอบเขตและภาพรวมพื้นที่', 'Boundaries and area overview'], kind: 'boundaries',
      benefit: ['ดูขอบเขตเทศบาล 28 หมู่บ้าน หรือ 3 เขตเลือกตั้ง แล้วเลือกพื้นที่เพื่อดูตัวเลข', 'See the municipality, 28 villages or 3 electoral areas, then choose an area']},
  });

  const MISSIONS = Object.freeze([
    {id: 'tax', icon: 'parcels', label: ['ภาษีและรายได้', 'Tax and revenue'], layers: ['taxmap', 'properties', 'appraisal', 'buildings', 'houses', 'businesses']},
    {id: 'flood', icon: 'flood', label: ['น้ำท่วมและภัยพิบัติ', 'Flood and disaster'], layers: ['terrain', 'waterways', 'popgrid', 'roads', 'cctv']},
    {id: 'care', icon: 'population', label: ['ดูแลคนและสาธารณสุข', 'Care and public health'], layers: ['popgrid', 'population', 'health', 'education']},
    {id: 'works', icon: 'roads', label: ['โยธาและบริการสาธารณะ', 'Public works and services'], layers: ['roads', 'publicfacilities', 'cctv', 'education', 'religion', 'buildings']},
    {id: 'area', icon: 'boundaries', label: ['ข้อมูลพื้นฐานพื้นที่', 'Area basics'], layers: ['overview', 'population', 'houses', 'buildings', 'appraisal']},
  ]);

  /* Earlier dataset ids (bookmarks) and where they now live. */
  const LEGACY = Object.freeze({
    tax: {layer: 'taxmap', mission: 'tax'}, parcels: {layer: 'appraisal'}, business: {layer: 'buildings', mission: 'tax'},
    flood: {layer: 'waterways', mission: 'flood'}, caregroups: {layer: 'popgrid', mission: 'care'},
    healthservices: {layer: 'health', mission: 'care'}, animals: {layer: 'popgrid', mission: 'care'},
    villages: {layer: 'overview', boundary: 'village'}, election: {layer: 'overview', boundary: 'election'},
    municipality: {layer: 'overview', boundary: 'municipality'},
  });

  /* Plain titles for folded, non-map summaries. */
  const SUPPLEMENT_TITLES = Object.freeze({
    tax: ['ภาพรวมไฟล์ภาษีปี 2569 ทั้งเทศบาล', 'Tax files for 2569, whole municipality'],
    business: ['กิจการที่ได้รับข้อมูล (ยอดรวม)', 'Businesses on file (totals)'],
    flood: ['แผนแก้น้ำท่วมเดิม 16 จุด', 'Past flood-fix plan, 16 sites'],
    caregroups: ['กลุ่มผู้รับการดูแลตามบัญชี (ยอดรวม)', 'Care recipients on the lists (totals)'],
    healthservices: ['ความพร้อมข้อมูลงานดูแล', 'Care data readiness'],
    animals: ['สุนัขและแมว (ยอดรวม)', 'Dogs and cats (totals)'],
  });

  const UNIT = Object.freeze({
    taxmap: ['แปลง', 'parcels'], properties: ['ทรัพย์สิน', 'properties'], businesses: ['ราย', 'businesses'], appraisal: ['แปลง', 'parcels'], overview: ['หมู่บ้าน', 'villages'], houses: ['จุด', 'points'],
    buildings: ['อาคาร', 'buildings'], parcels: ['แปลง', 'parcels'], roads: ['ช่วงถนน', 'segments'], cctv: ['กล้อง', 'cameras'],
    education: ['แห่ง', 'places'], health: ['แห่ง', 'places'], religion: ['แห่ง', 'places'], publicfacilities: ['พื้นที่', 'areas'],
    waterways: ['แหล่งน้ำ', 'features'], population: ['หมู่บ้าน', 'villages'], popgrid: ['ช่อง', 'cells'], terrain: ['ภาพ', 'view'],
  });

  const PURPOSE = Object.freeze(Object.fromEntries(Object.entries(LAYERS).map(([id, l]) => [id, l.benefit])));

  const STATUS = Object.freeze({
    needs_reconciliation: ['มีตัวเลขรอตรวจ', 'Figures to check'],
    derived_display: ['ขอบเขตทดลอง', 'Trial boundary'],
    ready_external_dem: ['ข้อมูลภายนอก', 'External data'],
  });

  const byId = id => MISSIONS.find(m => m.id === id) || null;
  const layersOf = id => (byId(id) || MISSIONS[0]).layers;
  const layer = id => LAYERS[id] || null;
  function resolve(datasetId) {
    if (LAYERS[datasetId]) return {layer: datasetId};
    if (LEGACY[datasetId]) return {...LEGACY[datasetId]};
    return null;
  }
  function missionFor(layerId, preferred) {
    const pref = byId(preferred);
    if (pref && pref.layers.includes(layerId)) return pref.id;
    const first = MISSIONS.find(m => m.layers.includes(layerId));
    return first ? first.id : (pref ? pref.id : MISSIONS[0].id);
  }

  /* Two compact native selects: work, then the map layer within that work. */
  function renderSelectors(state, opts) {
    const lang = opts.language;
    const mission = byId(state.mission) || MISSIONS[0];
    const missionOptions = MISSIONS.map(m => `<option value="${esc(m.id)}"${m.id === mission.id ? ' selected' : ''}>${esc(pick(m.label, lang))}</option>`).join('');
    const layerOptions = mission.layers.filter(id => opts.available ? opts.available(id) : true).map(id => {
      const count = opts.count ? opts.count(id) : '';
      return `<option value="${esc(id)}"${id === state.layer ? ' selected' : ''}>${esc(pick(LAYERS[id].label, lang))}${count ? ` · ${esc(count)}` : ''}</option>`;
    }).join('');
    const current = LAYERS[state.layer];
    return `<div class="selector-row">`
      + `<label class="selector"><span>${esc(lang === 'en' ? 'Work' : 'งาน')}</span><select id="mission-select">${missionOptions}</select></label>`
      + `<label class="selector selector-wide"><span>${esc(lang === 'en' ? 'Map' : 'แผนที่')}</span><select id="layer-select">${layerOptions}</select></label>`
      + `</div>${current ? `<p class="selector-benefit">${esc(pick(current.benefit, lang))}</p>` : ''}`;
  }

  root.SilaMissions = Object.freeze({missions: MISSIONS, layers: LAYERS, legacy: LEGACY, supplementTitles: SUPPLEMENT_TITLES,
    purpose: PURPOSE, unit: UNIT, status: STATUS, byId, layersOf, layer, resolve, missionFor, renderSelectors, pick});
})(typeof window === 'undefined' ? globalThis : window);
