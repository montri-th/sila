/* Sila public preview. Source GIS and approved municipal aggregates; no production writes. */
(() => {
  "use strict";
  const PublicAggregates = window.SilaPublicAggregates || {ids:[],icons:{},valid:()=>false,get:()=>null,entries:()=>[],render:()=>"",localized:v=>String(v ?? ""),valueLabel:m=>({number:m?.value ?? "—",state:""})};
  const Missions = window.SilaMissions;
  const TAX_STRATEGIES = window.SilaTaxEngine?.STRATEGIES || [];
  const TAX_AUDIT = window.SilaTaxEngine?.AUDIT || null;   // revision 2.0: the roll-below-law check item, allocated like a fix
  const DEFAULT_STRATEGIES = ["combine", "combineBuilding", "agriShare", "mainHomeOnce", "juristic", "mixedUse", "rented", "newBuildings"];
  // Links saved before revision 1.9 carry the old default set; they open with the new default instead.
  const OLD_DEFAULT_FIX = "agriShare.combine.combineBuilding.mixedUse.newBuildings.rented";
  const TEX = window.SilaTerrain3D?.exaggeration || null;
  /* Height colours for the terrain layer only. LDS 0.9.7 has no land-elevation scale, so these OH3 Dynamic Elevation
     Map palettes (as used in the CityMETER terrain viewer) are used at the owner’s request as an exception for ground height only, same HEX on both themes.
     Provenance: reference/terrain-palettes.json. */
  const TERRAIN_PALETTES = Object.freeze({
    "oh3-relief-lowland": { label: ["ธรรมชาติ ที่ราบ (แนะนำ)", "Natural, lowland (recommended)"], note: ["เขียวที่ต่ำ เหลืองถึงน้ำตาลที่สูง แบบแผนที่ภูมิประเทศ ใช้ 7 สีแรกของ OH3 relief ไม่มีสีเทาขาวของยอดเขา เหมาะกับพื้นที่ราบอย่างศิลา", "Green low, yellow to brown high, like a physical map. The first 7 OH3 relief colours, without the grey and white peak tints; suits flat areas like Sila"], colors: ["#1D6B3C", "#4E9A4A", "#98C46C", "#E3DD98", "#DCB36F", "#BB7F4B", "#8E5B3D"] },
    "oh3-relief": { label: ["ธรรมชาติ เต็มช่วง (OH3 relief)", "Natural, full range (OH3 relief)"], note: ["แบบเดียวกันแต่ยอดสุดเป็นเทาและขาวแบบภูเขา", "The same tints with grey and white for the highest ground"], colors: ["#1D6B3C", "#4E9A4A", "#98C46C", "#E3DD98", "#DCB36F", "#BB7F4B", "#8E5B3D", "#A89285", "#F5F2EF"] },
    "oh3-shc": { label: ["ธรรมชาติ สีชัด (OH3 shc)", "Natural, vivid (OH3 shc)"], note: ["เขียว เหลือง ส้ม น้ำตาลแดง สีอิ่มกว่า แยกระดับกลางได้ชัดขึ้น", "Green, yellow, orange, red-brown; stronger colours that separate the middle range"], colors: ["#207A5C", "#46A54E", "#96C652", "#E4D86C", "#EAAA50", "#D87648", "#B07282", "#F2F0EE"] },
    "oh3-rainbow": { label: ["สายรุ้ง (OH3 rainbow)", "Rainbow (OH3 rainbow)"], note: ["แยกระดับเล็ก ๆ ได้ละเอียดที่สุด แต่ไม่เป็นธรรมชาติและคนตาบอดสีอ่านยาก", "Separates small steps best, but looks unnatural and is hard with colour-vision deficiency"], colors: ["#0000FF", "#0058FF", "#00A5FF", "#00D9FF", "#33F4A5", "#88FE0F", "#CBFF00", "#FFF100", "#FFAE00", "#FF7700", "#FF4F00"] },
    "oh3-viridis": { label: ["คนตาบอดสีอ่านได้ (OH3 viridis)", "Colour-blind safe (OH3 viridis)"], note: ["ความสว่างไล่ตามความสูง ม่วงที่ต่ำ เหลืองที่สูง", "Lightness follows height: purple low, yellow high"], colors: ["#440154", "#482878", "#3E4A89", "#31688E", "#26828E", "#1F9E89", "#35B779", "#6ECE58", "#B5DE2B", "#FDE725"] },
    "oh3-gray": { label: ["ขาวดำ (OH3 gray)", "Greyscale (OH3 gray)"], note: ["เข้มที่ต่ำ สว่างที่สูง พิมพ์ขาวดำได้", "Dark low, light high; prints in black and white"], colors: ["#202020", "#F4F4F4"] },
  });
  const TERRAIN_DEFAULT_PALETTE = "oh3-relief-lowland";
  const TERRAIN_DEFAULT_EX = 2;
  const CONTOUR_STEPS = Object.freeze([0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10]);
  const CONTOUR_SOFT = 100, CONTOUR_HARD = 200;
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const num = (v, digits = 0) =>
    v == null || !Number.isFinite(Number(v))
      ? "—"
      : Number(v).toLocaleString("en-US", { maximumFractionDigits: digits });
  const S = {
    sheet: "peek",
    lang: "th",
    theme: "dark",
    dataset: "buildings",
    mission: "tax",
    mode: "2d",
    boundary: "municipality",
    scope: { type: "municipality", id: "sila" },
    tab: "overview",
    record: null,
    choice: null,
    pickIndex: null,
    search: "",
    page: 60,
    catalog: null,
    metadata: null,
    docs: null,
    tokens: null,
    publicSummary: null,
    publicSummaryStatus: "pending",
    terrainSource: null,
    terrainCoverage: null,
    terrainLayer: null,
    terrainStatus: { state: "not_loaded" },
    terrain3D: null,
    terrain3DInit: null,
    terrain3DStatus: { state: "not_loaded" },
    terrain3DCamera: null,
    terrain3DVisible: false,
    terrain3DError: false,
    terrain3DGeneration: 0,
    cache: new Map(),
    inflight: new Map(),
    map: null,
    tile: null,
    boundaryLayer: null,
    contextLayer: null,
    outsideMask: null,
    featureLayer: null,
    selectedLayer: null,
    overlayLayers: new Map(),
    overlays: new Set(),
    ticket: 0,
    ready: false,
    basemap: "street",
    basemapRevision: 0,
    tileFailed: false,
    interactionRevision: 0,
    /* Revision 1.8 layer state */
    taxScenario: "assessed69",
    taxStrategies: new Set(DEFAULT_STRATEGIES),
    appraisalAdj: 0,
    bldAdj: 0,
    propMetric: "thb",
    propSort: "thb",
    initiative: null,      // revision 2.0: negotiation map filter (one initiative id) or null for all
    owner: null,           // revision 2.0: owner code focused on the owner-ranking map
    agriMin: 5e6,          // revision 2.0: farmland watch threshold on land value (THB)
    lutRefs: {},
    popMetric: "t",
    buildingView: "type",
    terrainExaggeration: 2,     // owner decision 20 Oct 2026: default 2 times, manual; automatic stays available
    terrainAuto: false,
    terrainAutoTarget: 0.15,
    terrainRelief: null,
    terrainPalette: "oh3-relief-lowland",
    terrainBands: true,
    terrainMapping: "equalize",
    terrainQuantiles: null,
    terrainRangeLock: false,
    terrainRange: { lo: 150, hi: 210 },
    terrainContours: true,
    terrainLowground: true,
    lowgroundStatus: "unknown",   // unknown | ready | missing (the file is published only after the owner's review)
    terrainStepChoice: "auto",
    terrainStep: 1,
    terrainStepNote: null,
    parcelTax: null,
    parcelTaxStatus: "pending",
    taxResult: null,
    popStructure: null,
    hoverLayer: null,
    hoverTooltip: null,
    hoverFrame: 0,
    popup: null,
    highlightLayer: null,
    highlightTaxpayer: null,
  };
  const text = (th, en) => (S.lang === "en" ? en : th);
  const I18N = {
    municipality: ["เทศบาลเมืองศิลา", "Sila Municipality"],
    preview: ["ต้นแบบสำหรับเจ้าหน้าที่", "Officer preview"],
    lightTheme: ["พื้นสว่าง", "Light theme"],
    darkTheme: ["พื้นมืด", "Dark theme"],
    dataset: ["กำลังดู", "Showing"],
    allDatasets: ["ชุดข้อมูลทั้งหมด", "All datasets"],
    missionPrompt: ["วันนี้ทำงานด้านไหน", "What are you working on today?"],
    boundaries: ["ขอบเขตพื้นที่", "Area boundaries"],
    layers: ["ซ้อนชั้นข้อมูล", "Layers"],
    contextLayers: ["ข้อมูลประกอบแผนที่", "Context layers"],
    waterways: ["ลำห้วยและแหล่งน้ำ", "Streams & water bodies"],
    roads: ["ถนนขึ้นทะเบียน", "Registered roads"],
    buildings: ["รูปอาคาร", "Building footprints"],
    basemap: ["พื้นหลัง", "Basemap"],
    settings: ["ตัวเลือก", "Options"],
    mapSettings: ["ตั้งค่าแผนที่", "Map settings"],
    back: ["ย้อนกลับ", "Back"],
    fit: ["ดูเต็มพื้นที่", "Fit area"],
    overview: ["ภาพรวม", "Overview"],
    list: ["รายการ", "Records"],
    sources: ["ที่มาและข้อควรรู้", "Sources & notes"],
    localPreview: [
      "ดูข้อมูลในต้นแบบนี้ · ยังไม่ได้เชื่อมระบบงานเทศบาล",
      "Local preview · municipal operations are not connected",
    ],
    readGuide: ["คำอธิบาย", "Read guide"],
    cityData: ["ข้อมูลเมือง", "CITY DATA"],
    chooseDataset: ["เลือกชุดข้อมูล", "Choose a dataset"],
    close: ["ปิด", "Close"],
    searchDataset: ["ค้นหาชุดข้อมูล", "Search datasets"],
    datasetFootnote: [
      "ชุดเดียวกันอาจอยู่ในหลายงาน · ข้อควรรู้ของแต่ละชุดอยู่ในแท็บ ที่มาและข้อควรรู้",
      "One dataset can serve several kinds of work · each dataset’s notes are in the Sources & notes tab",
    ],
  };
  const labels = {
    overview: ["ขอบเขตและภาพรวมพื้นที่", "Boundaries and area overview"],
    taxmap: ["ภาษีที่ดินรายแปลง", "Land tax by parcel"],
    properties: ["ทรัพย์สินรายเจ้าของ: ภาษีที่เพิ่มได้", "Properties by owner: tax that can be added"],
    businesses: ["ธุรกิจนิติบุคคลที่จดทะเบียน VAT", "VAT-registered companies"],
    appraisal: ["ราคาประเมินที่ดินรายแปลง", "Land appraisal by parcel"],
    popgrid: ["คนในพื้นที่ แยกเพศและอายุ", "People by sex and age"],
    houses: ["หมุดบ้านที่สำรวจ", "Surveyed house points"],
    buildings: ["อาคาร บ้านเลขที่ และบัญชีภาษี", "Buildings, house numbers and the tax roll"],
    roads: ["ถนนขึ้นทะเบียนทางหลวง", "Registered road segments"],
    cctv: ["กล้อง CCTV", "CCTV locations"],
    education: ["สถานศึกษา", "Education"],
    health: ["สถานพยาบาล", "Healthcare"],
    religion: ["ศาสนสถาน", "Religious places"],
    publicfacilities: ["สาธารณูปการ", "Public facilities"],
    waterways: ["ลำห้วยและแหล่งน้ำ", "Streams & water bodies"],
    population: ["ประชากรรายหมู่บ้าน", "Village population"],
    villages: ["ขอบเขต 28 หมู่บ้าน", "28 village boundaries"],
    municipality: ["ขอบเขตเทศบาล", "Municipal boundary"],
    election: ["เขตเลือกตั้ง 3 เขต", "3 electoral areas"],
    parcels: ["แปลงที่ดิน (แผนที่ภาษี)", "Parcels (tax map)"],
    flood: ["แผนแก้น้ำท่วม 16 จุด", "Flood-fix plan · 16 sites"],
    floodsites: ["จุดศึกษาน้ำท่วม 16 จุด", "16 flood study sites"],
    negotiate: ["แผนการเจรจา: เก็บเพิ่มได้ตามกลุ่มข้อเสนอ", "Negotiation plan: gains by initiative"],
    agriwatch: ["เกษตรบนที่ดินราคาสูง ควรเพ่งเล็ง", "High-value farmland to watch"],
    portfolio: ["เจ้าของรายใหญ่ เรียงตามราคาประเมินรวม", "Largest owners by appraised value"],
    caregroups: ["กลุ่มเปราะบางและผู้รับการดูแล (ยอดรวม)", "Vulnerable groups and care recipients (totals)"],
    animals: ["สัตว์เลี้ยง: สุนัขและแมว (ยอดรวม)", "Pets: dogs and cats (totals)"],
    terrain: ["ที่สูงที่ต่ำ 2D และ 3D", "High and low ground in 2D and 3D"],
  };
  const colors = {
    taxmap: "slate",
    properties: "slate",
    businesses: "coral",
    appraisal: "slate",
    popgrid: "slate",
    overview: "slate",
    houses: "mint",
    buildings: "yellow",
    roads: "apricot",
    floodsites: "blue",
    cctv: "sky",
    education: "lime",
    health: "coral",
    religion: "blue",
    publicfacilities: "green",
    waterways: "teal",
    population: "slate",
    villages: "slate",
    municipality: "slate",
    election: "yellow",
    parcels: "yellow",
    flood: "teal",
    terrain: "slate",
    tax: "slate",
    business: "blue",
    animals: "slate",
    healthservices: "coral",
  };

  const hints = {
    houses: [
      "หมุดจากแบบสำรวจอาคาร 1 หมุดต่อ 1 บ้านเลขที่ที่สำรวจ ไม่ใช่จำนวนครัวเรือนที่ยืนยันแล้ว",
      "Building-survey points, one per surveyed house number; not verified households",
    ],
    buildings: [
      "รูปอาคาร 1 รูปต่อ 1 หลังคา ประเภท ชั้น และการใช้มาจากหมุดสำรวจที่ผูกได้ อาคารที่ไม่มีหมุดจึงไม่มีข้อมูลส่วนนี้",
      "One footprint per roof; type, floors and use come from the joined survey points, so buildings without a point lack them",
    ],
    taxmap: [
      "แปลงที่ดินจากแผนที่แปลง กับภาษีต่อโฉนดจาก ภ.ด.ส.7 ปี 2569 ที่จับคู่ได้ ไม่ใช่จำนวนผู้เสียภาษี",
      "Parcels from the parcel map with 2569 tax per title from PDS 7 where matched; not a count of taxpayers",
    ],
    properties: [
      "ทรัพย์สิน 1 รายการ = แปลงที่ติดกันของเจ้าของเดียวกันในบัญชี ภ.ด.ส.3 ปี 2563 หรือแปลงเดียวที่มีเจ้าของ ไม่ใช่จำนวนเจ้าของ",
      "One property = the adjoining parcels of one owner in the 2563 PDS 3 list, or a single owned parcel; not a count of owners",
    ],
    businesses: [
      "นิติบุคคลที่จดทะเบียนภาษีมูลค่าเพิ่ม 1 จุดต่อสถานประกอบการ (สำนักงานใหญ่หรือสาขา) ที่หาตำแหน่งได้ ไม่ใช่ธุรกิจทั้งหมดในพื้นที่",
      "VAT-registered juristic persons, one point per establishment (head office or branch) that could be placed; not every business in the area",
    ],
    appraisal: [
      "แปลงที่ดินที่จับคู่กับบัญชีปี 2569 ได้ พร้อมราคาประเมินบาทต่อตารางวา",
      "Parcels matched to the 2569 roll, with the appraisal price per square wah",
    ],
    popgrid: [
      "คนในรายชื่อของแบบสำรวจอาคาร นับรวมเป็นช่อง 250 ม. ไม่ใช่ประชากรทั้งหมด",
      "People in building-survey member lists, totalled in 250 m cells; not the full population",
    ],
    roads: [
      "เฉพาะเส้นถนนที่ได้รับ ไม่ใช่ถนนทั้งหมดในพื้นที่",
      "Received road segments, not every road",
    ],
    cctv: [
      "ตำแหน่งกล้อง ไม่ได้ยืนยันสถานะออนไลน์",
      "Camera locations; online status is unknown",
    ],
    waterways: [
      "พื้นที่น้ำจาก KML ไม่ใช่ขอบเขตน้ำท่วม",
      "Water polygons from KML, not a flood footprint",
    ],
    population: [
      "ตัวเลขตามหมู่บ้าน ปี 2569 · มีรายการรอสอบทาน",
      "Village figures for 2026 · reconciliation pending",
    ],
    parcels: [
      "ได้รับทะเบียนภาษีใหม่แล้ว · รอเชื่อมและรับรองพิกัด",
      "New tax files received · linkage and formal CRS review pending",
    ],
    flood: [
      "แผน พ.ศ. 2564–2567 ไม่ใช่สถานการณ์ปัจจุบัน",
      "2021–2024 plan, not current flood conditions",
    ],
    terrain: [
      "FABDEM อำเภอเมืองขอนแก่น · เงาช่วยเห็นรูปทรงพื้นที่",
      "Mueang Khon Kaen FABDEM · terrain-form hillshade",
    ],
    election: [
      "ขอบเขตแสดงผลที่ต่อจากเส้นต้นทาง",
      "Display boundaries derived from source lines",
    ],
  };
  Object.assign(hints, {
    tax: ["สรุปทั้งเทศบาล · รอกระทบยอดประเมินกับใบเสร็จ", "Citywide summary · assessment and receipt reconciliation pending"],
    business: ["ข้อมูลกิจการที่ได้รับ · ไม่ยืนยันใบอนุญาตปัจจุบัน", "Received business records · current permit status is unverified"],
    animals: ["สรุปตามไฟล์สัตว์ · ไม่เผยเจ้าของหรือตำแหน่งบ้าน", "Animal-source summary · no owners or home locations"],
    healthservices: ["ความพร้อมข้อมูลดูแลระยะยาว · ไม่มีรายการผู้ป่วย", "Long-term care data readiness · no patient records"],
    caregroups: ["กลุ่มตามบัญชีดูแลที่ได้รับ · ไม่ใช่ผู้ป่วยทั้งหมด", "Received care-cohort groups · not all municipal patients"],
  });

  const dataset = (id = S.dataset) =>
    id === "overview"
      ? {
          id: "overview",
          label: labels.overview[0],
          group: "Boundaries",
          status: "ready_with_caveats",
          count: 28,
          mappedCount: 28,
          sourceFolders: ["ขอบเขต28หมู่บ้าน", "ขอบเขตทม.ศิลา"],
          sourceUrl: S.metadata?.sourceFolder,
        }
      : S.catalog.datasets.find((d) => d.id === id) || aggregateDataset(id);
  /* Municipality-wide totals with no geography (care register, animal workbook) are layers of their own in 2.0. */
  const AGGREGATE_LAYERS = new Set(["caregroups", "animals"]);
  const aggregateDataset = (id) => AGGREGATE_LAYERS.has(id) && PublicAggregates.get(S.publicSummary, id)
    ? { id, label: PublicAggregates.localized(PublicAggregates.get(S.publicSummary, id).label, S.lang), group: "Living", status: "ready_with_caveats", count: null, geojson: null, aggregate: true }
    : undefined;
  const publicAggregate = (id = S.dataset) => PublicAggregates.get(S.publicSummary, id);
  const publicAggregateView = (tab) => PublicAggregates.render(S.publicSummary, S.dataset, { language: S.lang, tab, scopeLabel: scopeLabel() });
  const datasetIcon = (id, size) => window.SilaIcons.dataset(PublicAggregates.icons[id] || id, { size });
  const label = (id) =>
    labels[id] ? text(...labels[id]) : publicAggregate(id) ? PublicAggregates.localized(publicAggregate(id).label, S.lang) : dataset(id)?.label || id;
  const categoryColor = (id) =>
    S.tokens?.categoricalSeries.values.find((v) => v.name === colors[id])?.[
      S.theme
    ]?.fill || "#BFD4E7";
  const mapToken = (key) => S.tokens?.map[key]?.[S.theme] || "#68C4E2";
  const scopeData = () =>
    S.scope.type === "municipality"
      ? S.metadata.municipality
      : (S.scope.type === "village"
          ? S.metadata.villages
          : S.metadata.elections
        ).find((p) => p.id === S.scope.id);
  const scopeLabel = () =>
    S.scope.type === "municipality"
      ? text("เทศบาลเมืองศิลา", "Sila Municipality")
      : S.lang === "en"
        ? S.scope.type === "village"
          ? `Village ${scopeData().number} · ${scopeData().name}`
          : `Electoral area ${scopeData().number}`
        : scopeData().label;
  const BOUNDARY_TYPES = {
    municipality: {
      file: "data/municipality.geojson",
      th: "ขอบเขตเทศบาล",
      en: "Municipal boundary",
    },
    village: {
      file: "data/villages.geojson",
      th: "28 หมู่บ้าน",
      en: "28 villages",
    },
    election: {
      file: "data/election.geojson",
      th: "3 เขตเลือกตั้ง · ขอบเขตทดลอง",
      en: "3 electoral areas · derived display",
    },
  };
  const boundaryLabel = () =>
    text(BOUNDARY_TYPES[S.boundary].th, BOUNDARY_TYPES[S.boundary].en);
  const boundaries = () =>
    S.boundary === "municipality"
      ? [S.metadata.municipality]
      : S.boundary === "village"
        ? S.metadata.villages
        : S.metadata.elections;
  /* Village rows in tables are villages whatever boundary is selected. */
  const villageLabel = (v) => (S.lang === "th" ? v.label : `Village ${v.number} · ${v.name}`);
  const areaLabel = (area) =>
    S.lang === "th"
      ? area.label
      : area.id === "sila"
        ? "Sila Municipality"
        : S.boundary === "village"
          ? `Village ${area.number} · ${area.name}`
          : `Electoral area ${area.number}`;
  function countFor(id, area = S.scope) {
    if (id === "overview")
      return area.type === "municipality" ? boundaries().length : 1;
    const c = S.metadata.datasetCountsByScope[id];
    if (!c) return null;
    return area.type === "municipality"
      ? c.municipality
      : (c[area.type === "village" ? "villages" : "elections"]?.[area.id] ??
          null);
  }
  function populationFor(area = S.scope) {
    if (area.type === "municipality")
      return S.metadata.villages.reduce(
        (a, v) => a + (v.populationReported ?? 0),
        0,
      );
    if (area.type === "election") return null;
    return (
      S.metadata.villages.find((v) => v.id === area.id)?.populationReported ??
      null
    );
  }
  /* Data files carry the release version so a new app never reads the previous release's data from a cache. */
  const DATA_VERSION = "1.9.0";
  function fetchJSON(path) {
    if (S.cache.has(path)) return Promise.resolve(S.cache.get(path));
    if (S.inflight.has(path)) return S.inflight.get(path);
    const p = fetch(/^data\//.test(path) ? `${path}?v=${DATA_VERSION}` : path)
      .then((r) => {
        if (!r.ok) throw new Error(`Cannot load ${path}`);
        return r.json();
      })
      .then((d) => {
        S.cache.set(path, d);
        S.inflight.delete(path);
        return d;
      })
      .catch((e) => {
        S.inflight.delete(path);
        throw e;
      });
    S.inflight.set(path, p);
    return p;
  }
  function filterFeatures(fc) {
    if (!fc) return [];
    return fc.features.filter((f) =>
      S.scope.type === "municipality"
        ? f.properties.insideMunicipality !== false
        : (
            f.properties[
              S.scope.type === "village" ? "villageIds" : "electionIds"
            ] || []
          ).includes(S.scope.id),
    );
  }
  function currentFeatures() {
    const d = dataset();
    return d.geojson ? filterFeatures(S.cache.get(d.geojson)) : [];
  }
  function toast(message) {
    $("toast").textContent = message;
    $("toast").hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      $("toast").hidden = true;
    }, 3500);
  }
  function syncURL(replace = false) {
    if (!S.ready) return;
    const u = new URL(location.href);
    const params = {
      mission: S.mission,
      dataset: S.dataset,
      boundary: S.boundary,
      scope: S.scope.type === "municipality" ? "sila" : S.scope.id,
      lang: S.lang,
      theme: S.theme,
      basemap: S.basemap,
      mode: S.dataset === "terrain" ? S.mode : "2d",
    };
    if (S.dataset === "taxmap" || (S.dataset === "buildings" && S.buildingView === "tax")) { params.scenario = S.taxScenario; params.adj = String(S.appraisalAdj); params.badj = String(S.bldAdj); params.fix = [...S.taxStrategies].sort().join("."); }
    if (S.dataset === "properties") { params.adj = String(S.appraisalAdj); params.badj = String(S.bldAdj); params.fix = [...S.taxStrategies].sort().join("."); if (S.propMetric === "pct") params.pm = "pct"; }
    if (["negotiate", "agriwatch", "portfolio"].includes(S.dataset)) { params.adj = String(S.appraisalAdj); params.badj = String(S.bldAdj); params.fix = [...S.taxStrategies].sort().join("."); }
    if (S.dataset === "negotiate" && S.initiative) params.init = S.initiative;
    if (S.dataset === "portfolio" && S.owner) params.owner = S.owner;
    if (S.dataset === "appraisal" && S.appraisalAdj) params.adj = String(S.appraisalAdj);
    if (S.dataset === "popgrid") params.metric = S.popMetric;
    if (S.dataset === "buildings" && S.buildingView !== "type") params.view = S.buildingView;
    if (S.dataset === "terrain") {
      if (S.terrainPalette !== TERRAIN_DEFAULT_PALETTE) params.pal = S.terrainPalette;
      if (!S.terrainBands) params.bands = "0";
      if (S.terrainMapping !== "equalize") params.map = S.terrainMapping;
      if (S.terrainRangeLock && S.terrainRange) params.lock = `${Math.round(S.terrainRange.lo * 10) / 10}~${Math.round(S.terrainRange.hi * 10) / 10}`;
      if (!S.terrainContours) params.ct = "0";
      if (!S.terrainLowground) params.low = "0";
      if (S.terrainStepChoice !== "auto") params.step = String(S.terrainStepChoice);
    }
    if (S.dataset === "terrain" && S.mode === "3d") {
      if (S.terrainAuto) { params.ex = "auto"; if (Math.round(S.terrainAutoTarget * 100) !== 15) params.ext = String(Math.round(S.terrainAutoTarget * 100)); }
      else if (S.terrainExaggeration !== TERRAIN_DEFAULT_EX) params.ex = String(S.terrainExaggeration);
    }
    u.search = new URLSearchParams(params);
    if (S.record)
      u.searchParams.set("record", S.record.properties?.id || S.record.id);
    history[replace ? "replaceState" : "pushState"]({}, "", u);
  }
  function fromURL() {
    S.pickIndex = null;
    const q = new URLSearchParams(location.search);
    const resolved = Missions.resolve(q.get("dataset") || "") || {};
    S.dataset = resolved.layer && (resolved.layer === "overview" || dataset(resolved.layer)) ? resolved.layer : defaultLayer();
    S.mission = Missions.missionFor(S.dataset, q.get("mission") || resolved.mission);
    S.mode = S.dataset === "terrain" && q.get("mode") === "3d" ? "3d" : "2d";
    S.boundary = BOUNDARY_TYPES[resolved.boundary || q.get("boundary")]
      ? resolved.boundary || q.get("boundary")
      : "municipality";
    S.taxScenario = ["assessed69", "old70", "new70", "delta"].includes(q.get("scenario")) ? q.get("scenario") : "assessed69";
    const adj = Number(q.get("adj"));
    S.appraisalAdj = Number.isFinite(adj) ? Math.max(-30, Math.min(100, Math.round(adj))) : 0;
    const badj = Number(q.get("badj"));
    S.bldAdj = Number.isFinite(badj) ? Math.max(-30, Math.min(100, Math.round(badj))) : 0;
    if (q.has("fix")) S.taxStrategies = q.get("fix") === OLD_DEFAULT_FIX ? new Set(DEFAULT_STRATEGIES) : new Set(String(q.get("fix")).split(".").filter(k => TAX_STRATEGIES.some(s => s.id === k)));
    S.propMetric = q.get("pm") === "pct" ? "pct" : "thb";
    S.initiative = INITIATIVE_ORDER.includes(q.get("init")) ? q.get("init") : null;
    S.owner = /^T-[A-Z0-9]{6}$/.test(q.get("owner") || "") ? q.get("owner") : null;
    S.popMetric = ["t", "c", "a", "o", "m", "f"].includes(q.get("metric")) ? q.get("metric") : "t";
    S.buildingView = ["type", "tax", "registry", "roll", "straddle", "use"].includes(q.get("view")) ? q.get("view") : "type";
    S.listFilter = null;
    // Height: default 2 times (manual). ex=auto (or an old link with ext=) selects automatic; ex=<number> a fixed value.
    const ex = Number(q.get("ex")), ext = Number(q.get("ext"));
    S.terrainAuto = q.get("ex") === "auto" || (!q.has("ex") && q.has("ext"));
    S.terrainExaggeration = !S.terrainAuto && q.has("ex") && Number.isFinite(ex) && ex > 0 ? (TEX ? TEX.roundEx(Math.max(TEX.min, Math.min(TEX.max, ex))) : ex) : TERRAIN_DEFAULT_EX;
    S.terrainAutoTarget = q.has("ext") && Number.isFinite(ext) && ext >= 5 && ext <= 30 ? ext / 100 : 0.15;
    S.terrainPalette = TERRAIN_PALETTES[q.get("pal")] || q.get("pal") === "off" ? q.get("pal") : TERRAIN_DEFAULT_PALETTE;
    S.terrainBands = q.get("bands") !== "0";
    S.terrainMapping = q.get("map") === "linear" ? "linear" : "equalize";
    S.terrainContours = q.get("ct") !== "0";
    S.terrainLowground = q.get("low") !== "0";
    const step = Number(q.get("step"));
    S.terrainStepChoice = CONTOUR_STEPS.includes(step) ? step : "auto";
    const lock = String(q.get("lock") || "").split("~").map(Number);
    S.terrainRangeLock = lock.length === 2 && lock.every(Number.isFinite) && lock[1] > lock[0];
    if (S.terrainRangeLock) S.terrainRange = { lo: lock[0], hi: lock[1] };
    const id = q.get("scope");
    const v = S.metadata.villages.find((x) => x.id === id);
    const e = S.metadata.elections.find((x) => x.id === id);
    S.scope = v
      ? { type: "village", id }
      : e
        ? { type: "election", id }
        : { type: "municipality", id: "sila" };
    if (v) S.boundary = "village";
    if (e) S.boundary = "election";
    S.lang = q.get("lang") === "en" ? "en" : "th";
    S.theme = q.get("theme") === "light" ? "light" : "dark";
    S.basemap = ["street", "satellite", "satellite-archive", "none"].includes(q.get("basemap")) ? q.get("basemap") : "street";
    S.record = null;
    S.choice = null;
    S.search = "";
    S.page = 60;
    S.tab = "overview";
    S.restoreRecord = q.get("record");
  }
  function applyLocale() {
    document.documentElement.lang = S.lang;
    document.documentElement.dataset.theme = S.theme;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (I18N[key]) el.textContent = text(...I18N[key]);
    });
    $("theme").textContent = text(
      ...I18N[S.theme === "dark" ? "lightTheme" : "darkTheme"],
    );
    $("language").textContent = S.lang === "th" ? "EN" : "ไทย";
    $("language").setAttribute(
      "aria-label",
      S.lang === "th" ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย",
    );
    [...$("boundary-mode").options].forEach((option) => {
      const type = BOUNDARY_TYPES[option.value];
      option.textContent = text(type.th, type.en);
    });
    $("layer-picker").setAttribute("aria-label", text("เลือกงานและแผนที่", "Choose work and map"));
    $("terrain-exaggeration-label").textContent = text("ขยายความสูง", "Height");
    $("terrain-exaggeration-input").setAttribute("aria-label", text("ขยายความสูงภูมิประเทศ เพื่อให้เห็นรูปทรง ไม่ใช่ความสูงจริง", "Vertical exaggeration to show terrain form; not true height"));
    for (const option of $("basemap").options) option.textContent = text(...({street:["แผนที่ถนน", "Street map"],satellite:["ภาพดาวเทียม · CityChat", "Satellite · CityChat"],"satellite-archive":["ภาพเก่า 2016/2017 · EOX", "Archive 2016/2017 · EOX"],none:["เฉพาะข้อมูลพื้นที่", "Data only"]}[option.value]));
    $("basemap").value = S.basemap;
    document.querySelector(".header-settings > summary").setAttribute("aria-label",text("ตัวเลือกภาษาและธีม", "Language and theme options"));
    $("basemap").setAttribute("aria-label", text("พื้นหลังแผนที่", "Map background"));
    $("terrain-mode-group").setAttribute("aria-label", text("มุมมองภูมิประเทศ", "Terrain view"));
    $("terrain-3d").setAttribute("aria-label", text("ภูมิประเทศสามมิติ · อำเภอเมืองขอนแก่น", "3D terrain · Mueang Khon Kaen district"));
    $("panel-splitter").setAttribute("aria-label", text("ปรับขนาดแผนที่และข้อมูล", "Resize map and data panels"));
    renderInterfaceIcons();
    $("map").setAttribute(
      "aria-label",
      text(
        "แผนที่โต้ตอบ เลือกพื้นที่เพื่อลงรายละเอียด",
        "Interactive map. Select an area to drill down.",
      ),
    );
    document.querySelector(".skip").textContent = text(
      "ข้ามไปข้อมูลพื้นที่",
      "Skip to area data",
    );
    document
      .querySelector(".brand")
      .setAttribute(
        "aria-label",
        text("CityChat หน้าภาพรวมศิลา", "CityChat Sila overview"),
      );
    $("boundary-mode").setAttribute(
      "aria-label",
      text("ขอบเขตพื้นที่", "Area boundaries"),
    );
    $("breadcrumbs").setAttribute(
      "aria-label",
      text("ลำดับพื้นที่", "Area hierarchy"),
    );
    $("inspector").setAttribute(
      "aria-label",
      text("ข้อมูลพื้นที่ที่เลือก", "Selected area data"),
    );
    document
      .querySelector(".inspector-tabs")
      .setAttribute("aria-label", text("มุมมองข้อมูล", "Data views"));
    document.querySelector(".map-workspace").setAttribute("aria-label",text("แผนที่ศิลา", "Sila map"));
    document.querySelector(".map-summary").setAttribute("aria-label",text("สรุปจากขอบเขตที่เลือก", "Summary of selected boundary"));
    /* Date the files behind this layer were received: 19 Oct 2569 for the rebuilt land, building, survey and tax layers, 5 Oct for the rest. */
    document.querySelector(".snapshot-label").textContent = NEW_LAYERS_19OCT.has(S.dataset) || S.dataset === "overview" ? text("19 ต.ค. 2569", "19 Oct 2026") : text("5 ต.ค. 2569", "5 Oct 2026");
    document.title = `${scopeLabel()} · ${label(S.dataset)} | CityChat CityMETER`;
  }
  function renderInterfaceIcons() {
    const icon = window.SilaIcons.icon;
    document.querySelectorAll("[data-icon-role]").forEach(el => {
      const glyph = icon(el.dataset.iconRole, {size:20});
      if (el.matches("button")) el.innerHTML = glyph + `<span>${el.textContent}</span>`;
      else el.innerHTML = glyph;
    });
    const controls = {"layers-open":"layers", back:"back", fit:"fit", theme:S.theme === "dark" ? "light" : "dark"};
    for (const [id,role] of Object.entries(controls)) { const el=$(id); el.innerHTML=icon(role,{size:20})+`<span>${el.textContent}</span>`; }
  }
  /* Compact count shown next to each map option, in the unit an officer counts. */
  function layerCount(id) {
    if (id === "terrain") return "2D/3D";
    if (id === "overview") return `${num(S.metadata.villages.length)} ${text("หมู่บ้าน", "villages")}`;
    if (id === "popgrid" || AGGREGATE_LAYERS.has(id)) return null;
    if (id === "population") return `${num(populationFor())} ${text("คน", "people")}`;
    const d = dataset(id);
    if (!d) return null;
    const n = countFor(id, S.scope) ?? (S.scope.type === "municipality" ? d.insideMunicipalityCount ?? d.count : null);
    return n == null ? null : `${num(n)} ${text(...(Missions.unit[id] || ["รายการ", "records"]))}`;
  }
  function defaultLayer() {
    return dataset("negotiate") ? "negotiate" : dataset("taxmap") ? "taxmap" : dataset("appraisal") ? "appraisal" : "buildings";
  }
  function renderPicker() {
    const mount = $("layer-picker");
    if (!mount) return;
    const active = document.activeElement, focused = active?.id, onTab = !!active?.closest?.(".mission-tab");
    mount.innerHTML = Missions.renderTabs({ mission: S.mission, layer: S.dataset }, {
      language: S.lang,
      available: (id) => id === "overview" || Boolean(dataset(id)),
      count: layerCount,
      icon: (role) => window.SilaIcons.icon(role, { size: 22 }),
    });
    /* Keyboard users keep their place: a re-render after Enter on a mission tab focuses the selected tab. */
    if (focused === "layer-select") $(focused)?.focus();
    else if (onTab) mount.querySelector(`[data-mission="${S.mission}"]`)?.focus();
  }
  function setMission(id, push = true) {
    if (!Missions.byId(id) || id === S.mission) return;
    S.mission = id;
    const layers = Missions.layersOf(id).filter((l) => l === "overview" || dataset(l));
    const next = layers.includes(S.dataset) ? S.dataset : layers[0];
    if (next && next !== S.dataset) setDataset(next, push);
    else { renderPicker(); renderLayerControls(); if (push) syncURL(); }
  }
  function renderHeader() {
    const aggregateMode = String(Boolean(publicAggregate()));
    const aggregateModeChanged = document.body.dataset.publicAggregate !== aggregateMode;
    document.body.dataset.publicAggregate = aggregateMode;
    if (aggregateModeChanged && S.map) requestAnimationFrame(() => S.map.invalidateSize({pan:false}));
    applyLocale();
    renderTerrainControls();

    $("tab-list").textContent = publicAggregate() ? text("ความพร้อม", "Readiness") : text(...I18N.list);
    $("boundary-mode").value = S.boundary;
    $("place-eyebrow").textContent =
      S.scope.type === "municipality"
        ? text("ขอนแก่น · ข้อมูลเทศบาล", "Khon Kaen · municipal data")
        : text(
            "เทศบาลเมืองศิลา · ขอบเขตที่เลือก",
            "Sila Municipality · selected area",
          );
    $("place-title").textContent = scopeLabel();
    $("place-description").textContent =
      S.scope.type === "municipality"
        ? text(
            "เลือกงานและแผนที่ แล้วชี้หรือคลิกบนแผนที่เพื่อดูข้อมูล",
            "Choose your work and a map, then point or click on the map to read the data.",
          )
        : text(
            "ตัวเลขด้านล่างนับเฉพาะพื้นที่นี้ · กดชื่อเทศบาลด้านบนเพื่อกลับไปดูทั้งเมือง",
            "Figures below count this area only · select the municipality above to see the whole city",
          );
    if (publicAggregate()) {
      $("place-description").textContent = S.dataset === "caregroups" ? text("ยอดรวมจากบัญชีดูแลที่เทศบาลส่งมา ไม่มีรายชื่อ และไม่แยกตามหมู่บ้าน", "Totals from the care lists supplied by the municipality, without names or village split") : text("ยอดรวมทั้งเทศบาล ไม่แยกตามหมู่บ้าน", "City-wide totals, not split by village");
      const received = new Date(S.publicSummary.sourceReceivedAt + "T00:00:00Z");
      if (Number.isFinite(received.getTime())) document.querySelector(".snapshot-label").textContent = received.toLocaleDateString(S.lang === "en" ? "en-GB" : "th-TH", {day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});
    } else if (S.dataset === "terrain") {
      const inspected = new Date((S.terrainSource?.inspected_date || "2026-10-19") + "T00:00:00Z");
      document.querySelector(".snapshot-label").textContent = inspected.toLocaleDateString(S.lang === "en" ? "en-GB" : "th-TH", {day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});
    }
    const sep = `<span class="breadcrumb-separator" aria-hidden="true">${window.SilaIcons.icon("next",{size:16})}</span>`;
    const municipality = text("เทศบาลเมืองศิลา", "Sila Municipality");
    $("breadcrumbs").innerHTML = `${S.scope.type === "municipality" && !S.record ? `<strong aria-current="location">${esc(municipality)}</strong>` : `<button data-scope="sila">${esc(municipality)}</button>`}${S.scope.type !== "municipality" ? `${sep}${S.record ? `<button data-close-record>${esc(scopeLabel())}</button>` : `<strong aria-current="location">${esc(scopeLabel())}</strong>`}` : ""}${S.record ? `${sep}<strong aria-current="location">${esc(S.record.properties.label || S.record.properties.id)}</strong>` : ""}`;
    $("back").disabled =
      S.scope.type === "municipality" && !S.record && !S.choice;
    document
      .querySelectorAll("[data-tab]")
      .forEach((b) =>
        b.setAttribute("aria-selected", String(b.dataset.tab === S.tab)),
      );
    $("tab-content").setAttribute("aria-labelledby", "tab-" + S.tab);
    renderPicker();
    renderLayerControls();
  }
  const unitOf = (id) => text(...(Missions?.unit[id] || ["รายการ", "records"]));
  const purposeOf = (id) => text(...(Missions?.purpose[id] || ["ข้อมูลจากเทศบาล", "Municipal data"]));
  /* Aggregate value for the map summary: large baht amounts read as millions. */
  function aggregateItem(m) {
    const unit = PublicAggregates.localized(m.unit, S.lang);
    const name = PublicAggregates.localized(m.label, S.lang);
    if (/^(บาท|THB)$/.test(unit) && Math.abs(m.value) >= 1e6)
      return [`${(m.value / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${text("ล้าน", "M")}`, `${name} (${unit})`];
    return [m.value, `${name} (${unit})`];
  }
  /* "21.53 ล้านบาท" keeps the number large and the unit small so it fits one line on phones. */
  function metricHTML(v) {
    if (typeof v !== "string") return num(v);
    const m = v.match(/^([-+]?[\d,.]+)\s(.+)$/);
    return m ? `${esc(m[1])} <small class="metric-unit">${esc(m[2])}</small>` : esc(v);   // the space lets the unit wrap on very narrow screens
  }
  function renderSummary() {
    const c = countFor(S.dataset);
    let items;
    const agg = publicAggregate();
    if (agg) {
      items = agg.metrics.filter((m) => m.value !== null && m.id !== "source_files").slice(0, 3).map(aggregateItem);
      if (!items.length) items = [[dataset().count, text("ไฟล์ที่เทศบาลส่งมา", "files supplied")]];
    } else if (S.dataset === "terrain") items = [];
    else if (S.dataset === "overview")
      items = [
        [countFor("houses"), text("จุดบ้านเลขที่", "house points")],
        [countFor("buildings"), text("อาคาร", "buildings")],
        [
          S.scope.type === "municipality" ? boundaries().length : 1,
          S.boundary === "village" ? text("หมู่บ้าน", "villages") : S.boundary === "election" ? text("เขตเลือกตั้ง", "electoral areas") : text("เขตเทศบาล", "municipality"),
        ],
      ];
    else if (S.dataset === "population")
      items = [
        [populationFor(), text("คน", "people")],
        [
          S.scope.type === "election" ? null : S.scope.type === "village" ? num(scopeData().male) : num(S.metadata.villages.reduce((a, v) => a + v.male, 0)),
          text("ชาย", "male"),
        ],
        [
          S.scope.type === "election" ? null : S.scope.type === "village" ? num(scopeData().female) : num(S.metadata.villages.reduce((a, v) => a + v.female, 0)),
          text("หญิง", "female"),
        ],
      ];
    else if (S.dataset === "flood")
      items = [
        [S.docs.sites.length, text("จุดในแผนเดิม", "sites in the past plan")],
        [S.docs.summary.estimateAvailableCount, text("จุดที่มีประมาณการงบ", "sites with a cost estimate")],
      ];
    else if (S.dataset === "taxmap") {
      /* Village scope uses that village's parcels; the city receipts figure exists only city-wide. */
      const village = S.scope.type === "village" ? S.taxResult?.byVillage?.get(S.scope.id) : null;
      const t = village || S.taxResult?.totals, receipts = S.parcelTax?.summary?.cityTotals?.receiptsTaxYear2569;
      items = [
        [moneyShort(t?.assessed69), text("ภาษีปี 2569 ของแปลงที่จับคู่ได้", "2569 tax, matched parcels")],
        [moneyShort(t?.new70), text("ปี 2570 ตามข้อเสนอ", "2570 with fixes")],
      ];
      if (!village) items.splice(1, 0, [moneyShort(receipts), text("รับชำระปีภาษี 2569 ทั้งเมือง", "2569 receipts, whole city")]);
    } else if (S.dataset === "properties") {
      const t = propScopeTotals();
      items = [[moneyShort(t.gain), text("ภาษีปี 2570 ที่เพิ่มได้ต่อปี", "2570 tax that can be added a year")], [t.nGain, text("ทรัพย์สินที่ควรตรวจ", "properties to check")], [moneyShort(t.new70), text("ปี 2570 ตามข้อเสนอ ของแปลงที่มีเจ้าของ", "2570 with fixes, owned parcels")]];
    } else if (S.dataset === "negotiate") {
      const t = initiativeTotals(), e = t && S.initiative ? t.list.find((x) => x.id === S.initiative) : null;
      if (S.initiative) items = [[`+${moneyShort(e ? e.sum : 0)}`, text(`เก็บเพิ่มได้ต่อปี · ${initiativeShort(S.initiative)}`, `a year · ${initiativeShort(S.initiative)}`)], [e ? e.parcels : 0, text("แปลงที่ต้องเจรจา", "titles to negotiate")], [t && t.gain ? `${fixed(((e ? e.sum : 0) / t.gain) * 100, 0)} %` : null, text("ของยอดเก็บเพิ่มได้ทั้งหมด", "of the total gain")]];
      else items = [[t ? `+${moneyShort(t.gain)}` : null, text("เก็บเพิ่มได้ต่อปี", "can be added a year")], [t ? t.parcels : null, text("แปลงที่ต้องเจรจา", "titles to negotiate")], [t && t.billed ? `+${fixed((t.gain / t.billed) * 100, 1)} %` : null, text("เพิ่มจากที่เรียกเก็บปี 2569", "over the 2569 bill")]];
    } else if (S.dataset === "agriwatch") {
      const l = agriWatchScope();
      items = [[`+${moneyShort(l.reduce((a, w) => a + (w.potential || 0), 0))}`, text("ต่อปี ถ้าตรวจพบว่าไม่ได้ทำประโยชน์", "a year if found unused")], [l.length, text("แปลงเกษตรมูลค่า 5 ล้านขึ้นไป", "farm titles worth 5M+")], [moneyShort(l.reduce((a, w) => a + (w.billed69 || 0), 0)), text("เรียกเก็บปี 2569 ตามอัตราเกษตร", "billed in 2569 at farm rates")]];
    } else if (S.dataset === "portfolio") {
      const o = S.owner ? ownerRec(S.owner) : null;
      if (o) items = [[moneyShort(o.value), text(`มูลค่าประเมินรวม · อันดับ ${num(o.rank)}`, `appraised value · #${num(o.rank)}`)], [o.parcels.length, text("แปลงของรายนี้", "parcels held")], [o.gain >= 0.5 ? `+${moneyShort(o.gain)}` : moneyShort(0), text("เก็บเพิ่มได้ต่อปี", "can be added a year")]];
      else {
        const l = ownersInScope();
        const tot = l.reduce((a, o) => a + o.value, 0), top10 = l.slice(0, 10).reduce((a, o) => a + o.value, 0);
        items = [[l.length, text("เจ้าของในบัญชีปี 2563", "owners in the 2563 list")], [moneyShort(tot), text("มูลค่าประเมินรวม", "appraised value in total")], [tot ? `${fixed((top10 / tot) * 100, 1)} %` : null, text("ถือโดย 10 อันดับแรก", "held by the top 10")]];
      }
    } else if (S.dataset === "businesses") {
      /* Pinned businesses in the selected area, the same count as the panel (no per-area table in metadata). */
      const fs = S.cache.get(dataset()?.geojson) ? currentFeatures() : null;
      items = [[fs ? fs.length : null, text("ธุรกิจที่ปักหมุดในพื้นที่นี้", "businesses pinned in this area")], [fs ? fs.filter((f) => f.properties.website).length : null, text("มีเว็บไซต์ทางการที่ยืนยันได้", "with a confirmed official website")]];
    } else if (S.dataset === "appraisal") {
      const st = appraisalStats();
      items = [[st.n, text("แปลงที่มีราคาประเมิน", "parcels with an appraisal")], [st.med, text("ราคากลาง บาท/ตร.ว.", "median THB per sq wah")]];
    } else if (S.dataset === "popgrid") {
      const t = S.popStructure?.totals;
      items = [[t?.t ?? null, text("คนในรายชื่อ", "listed people")], [t?.c ?? null, text("เด็กต่ำกว่า 15 ปี", "children under 15")], [t?.o ?? null, text("อายุประมาณ 42 ปีขึ้นไป", "about 42 and over")]];
    } else if (S.dataset === "buildings") {
      const fs = currentFeatures(), n = (test) => fs.filter((f) => test(f.properties)).length;
      items = [[fs.length || c, text("อาคารในพื้นที่นี้", "buildings in this area")]];
      if (S.buildingView === "roll") items.push([n((p) => p.roll === "on_roll"), text("ผูกกับบัญชีสิ่งปลูกสร้างแล้ว", "linked to the building roll")], [n((p) => p.roll === "missing_house_no"), text("บ้านเลขที่ไม่อยู่ในบัญชี", "house number not on the roll")]);
      else if (S.buildingView === "registry") items.push([n((p) => p.surveyPoints > 0), text("ผูกกับทะเบียนบ้านได้", "joined to the house register")], [n((p) => p.surveyPoints >= 2), text("มี 2 ทะเบียนบ้านขึ้นไป", "with 2+ registrations")]);
      else items.push([n((p) => p.straddle), text("อยู่บนหลายแปลง", "span parcels")]);
    }
    else items = [[c, `${unitOf(S.dataset)}${text("ในพื้นที่นี้", " in this area")}`]];
    $("summary-title").textContent = label(S.dataset);
    const cityWide = agg || ["appraisal", "popgrid"].includes(S.dataset) || (S.dataset === "taxmap" && S.scope.type !== "village");
    $("summary-eyebrow").innerHTML = (cityWide ? text("ยอดรวมทั้งเทศบาลเมืองศิลา", "Sila city-wide totals") : esc(scopeLabel())) + (S.scope.type !== "municipality" ? `<button type="button" class="summary-scope" data-scope="sila">${text("ดูทั้งเมือง", "Whole city")}</button>` : "");
    $("summary-metrics").innerHTML = items
      .map(
        ([v, k]) =>
          `<div><strong>${metricHTML(v)}</strong><span>${esc(k)}</span></div>`,
      )
      .join("");
    $("summary-metrics").hidden = !items.length;
    $("summary-note").textContent = agg
      ? text("ยอดรวมจากไฟล์ที่เทศบาลส่งมา ไม่แยกตามหมู่บ้าน · อ่านความหมายแต่ละตัวเลขในแผงด้านขวา", "Totals from files supplied by the municipality, not split by village · each figure is explained in the panel")
      : S.dataset === "terrain"
        ? text("ใช้ดูรูปทรงที่สูงที่ต่ำประกอบการวางแผน ไม่ใช่ระดับน้ำท่วม", "Shows the shape of high and low ground for planning; not flood depth")
        : S.dataset === "flood"
          ? text("แผนเดิม พ.ศ. 2564–2567 ไม่ใช่สถานการณ์น้ำท่วมตอนนี้", "Past 2021–2024 plan, not current flooding")
          : S.dataset === "properties"
            ? text("ทรัพย์สิน = แปลงที่ติดกันของเจ้าของเดียวกันพร้อมอาคาร · เจ้าของตามบัญชี ภ.ด.ส.3 ปี 2563 สมมติว่ายังไม่เปลี่ยน · ตรวจโฉนดและการใช้จริงก่อนแจ้งประเมิน", "Property = adjoining parcels of one owner with their buildings · owners from the 2563 PDS 3 list, assumed unchanged · check deeds and actual use before any assessment")
          : S.dataset === "taxmap"
            ? (S.scope.type === "village"
              ? text("รวมเฉพาะแปลงในหมู่บ้านนี้ จากบัญชีภาษีปี 2569 และการคาดการณ์ปี 2570 · ยอดรับชำระมีเฉพาะทั้งเมือง", "Parcels in this village only, from the 2569 roll and 2570 estimates · receipts exist only city-wide")
              : S.scope.type === "election"
                ? text("ภาษีรายเขตเลือกตั้งยังไม่ได้แยก จึงแสดงยอดรวมทั้งเทศบาล", "Tax is not split by electoral area, so city-wide totals are shown")
                : text("ยอดรวมทั้งเทศบาลจากบัญชีภาษีปี 2569 และการคาดการณ์ปี 2570", "Municipal totals from the 2569 roll and 2570 estimates"))
            : purposeOf(S.dataset);
  }
  const notice = (title, body) =>
    `<div class="notice"><strong>${esc(title)}</strong><p>${esc(body)}</p></div>`;
  const fact = (value, title, detail = "", digits = 0) =>
    `<div class="fact"><small>${esc(title)}</small><strong>${num(value, digits)}</strong>${detail ? `<span>${esc(detail)}</span>` : ""}</div>`;
  function areaRows(areas, metric) {
    const vals = areas.map((a) =>
      metric === "population"
        ? (a.populationReported ?? null)
        : countFor(metric, { type: S.boundary, id: a.id }),
    );
    const max = Math.max(1, ...vals.filter((v) => v != null));
    return areas
      .map(
        (a, i) =>
          `<button class="area-row" data-scope="${a.id}" aria-current="${S.scope.id === a.id}"><span><span class="area-name">${esc(areaLabel(a))}</span><span class="area-meta">${metric === "population" ? text("ตัวเลขปี 2569", "2026 figures") : esc(label(metric))}${metric === "population" && a.populationDiscrepancy ? " · " + text("ตัวเลขรวมรอเทศบาลยืนยัน", "total awaiting confirmation") : ""}</span><span class="area-track"><span class="area-bar" style="width:${vals[i] == null ? 0 : Math.round((vals[i] / max) * 100)}%;background:${categoryColor(metric)}"></span></span></span><span class="area-value">${num(vals[i])}<small>${metric === "population" ? text("คน", "people") : esc(unitOf(metric))}</small></span></button>`,
      )
      .join("");
  }
  /* One short pointer replaces stacked caveat boxes; details live in the sources tab. */
  const notesLink = () =>
    `<p class="inline-note notes-link">${text("ก่อนนำตัวเลขไปใช้ อ่าน", "Before using these figures, read")} <button type="button" class="text-button" data-open-tab="source">${text("ที่มาและข้อควรรู้", "sources and notes")}</button></p>`;

  function overviewContent() {
    if (publicAggregate()) return publicAggregateView("overview");
    if (S.dataset === "flood") return floodContent();
    if (S.dataset === "floodsites") return floodSitesContent();
    if (S.dataset === "parcels") return parcelContent();
    if (S.dataset === "terrain") return terrainContent() + supplementsHTML();
    if (S.dataset === "taxmap") return taxmapContent();
    if (S.dataset === "properties") return propertiesContent();
    if (S.dataset === "negotiate") return negotiateContent();
    if (S.dataset === "agriwatch") return agriWatchContent();
    if (S.dataset === "portfolio") return portfolioContent();
    if (S.dataset === "businesses") return businessesContent();
    if (S.dataset === "appraisal") return appraisalContent();
    if (S.dataset === "popgrid") return popgridContent();
    if (S.dataset === "buildings") return buildingsContent();
    if (S.dataset === "houses") return housesContent();
    let html = "";
    if (S.boundary === "election")
      html += `<p class="inline-note">${text("เขตเลือกตั้งเป็นขอบเขตทดลองที่ต่อจากเส้นในไฟล์ ยังไม่มีประชากรแยกตามเขต", "Electoral areas are trial boundaries joined from source lines; no population by area yet")}</p>`;
    if (S.dataset === "population") html += populationNotice();
    if (S.dataset === "overview") {
      html += `<section class="panel-section"><div class="section-title"><h2>${text("ในพื้นที่นี้มี", "In this area")}</h2></div><div class="facts-grid">${fact(countFor("houses"), text("จุดบ้านเลขที่", "House number points"))}${fact(countFor("buildings"), text("อาคาร", "Buildings"))}${fact(countFor("roads"), text("ช่วงถนนขึ้นทะเบียน", "Registered road segments"))}${fact(countFor("cctv"), text("กล้อง CCTV", "CCTV cameras"))}</div>${notesLink()}</section>`;
    } else if (
      !["population", "villages", "municipality", "election"].includes(
        S.dataset,
      )
    ) {
      const chip = Missions?.status[dataset().status] ? `<span class="status-label">${esc(text(...Missions.status[dataset().status]))}</span>` : "";
      html += `<section class="panel-section"><div class="section-title"><h2>${esc(label(S.dataset))}</h2>${chip}</div><p>${esc(purposeOf(S.dataset))}</p><div class="facts-grid">${fact(countFor(S.dataset), `${unitOf(S.dataset)}${text("ในพื้นที่นี้", " in this area")}`)}</div><button class="more-button" data-show-list>${text("ดูรายการในพื้นที่นี้", "Browse records in this area")}</button>${notesLink()}</section>`;
    }
    if (S.scope.type === "municipality") {
      const metric = [
        "overview",
        "villages",
        "municipality",
        "election",
      ].includes(S.dataset)
        ? "houses"
        : S.dataset;
      const sort = boundaries()
        .slice()
        .sort((a, b) =>
          metric === "population"
            ? b.populationReported - a.populationReported
            : (countFor(metric, { type: S.boundary, id: b.id }) ?? -1) -
              (countFor(metric, { type: S.boundary, id: a.id }) ?? -1),
        );
      html += S.boundary === "municipality"
        ? `<section class="panel-section"><div class="section-title"><h2>${text("ดูทีละหมู่บ้าน", "Look village by village")}</h2></div><p>${text("แบ่งแผนที่และตัวเลขเป็น 28 หมู่บ้าน แล้วกดหมู่บ้านที่ต้องการ", "Split the map and figures into 28 villages, then choose one")}</p><button type="button" class="more-button" data-boundary-switch="village">${text("แบ่งดูทีละหมู่บ้าน", "Show by village")}</button></section>`
        : `<section class="panel-section"><div class="section-title"><h2>${text("ดูทีละพื้นที่", "Look at one area")}</h2><span>${text("กดชื่อเพื่อซูมเข้า", "select a name to zoom in")}</span></div><div class="area-list">${areaRows(sort, metric)}</div></section>`;
    } else {
      const place = scopeData();
      html += `<section class="panel-section"><div class="section-title"><h2>${text("ข้อมูลพื้นที่นี้", "About this area")}</h2></div><div class="facts-grid">${fact(populationFor(), text("ประชากร", "Population"), text("ตัวเลขปี 2569", "2026 figure"))}${fact(place.areaKm2, text("ขนาดพื้นที่โดยประมาณ", "Approximate size"), text("ตารางกิโลเมตร วัดจากแผนที่", "km², measured from the map"), 2)}</div><p class="inline-note">${text("เปลี่ยนงานหรือชุดข้อมูลได้ โดยยังอยู่ในพื้นที่นี้", "You can switch work or data and stay in this area")}</p></section>`;
      if (S.scope.type === "village" && place.populationDiscrepancy)
        html += populationNotice();
    }
    return html + supplementsHTML();
  }
  function populationNotice() {
    return `<p class="inline-note">${S.scope.type === "village"
      ? text(
          `หมู่ ${scopeData().number}: ยอดรวม ${num(scopeData().populationReported)} คน แต่ชายรวมหญิงได้ ${num(scopeData().male + scopeData().female)} คน รอเทศบาลยืนยัน`,
          `Village ${scopeData().number}: total ${num(scopeData().populationReported)}, but male + female is ${num(scopeData().male + scopeData().female)}; awaiting confirmation`,
        )
      : text(
          "ยอดรวม 55,838 คน แต่ชายรวมหญิงได้ 55,238 คน ต่างกัน 600 คนที่หมู่ 11 รอเทศบาลยืนยัน",
          "Total 55,838, but male + female is 55,238; the 600 difference is in village 11 and awaits confirmation",
        )}</p>`;
  }
  function floodContent() {
    return (
      `<p class="inline-note flood-note">${text("แผนเดิม พ.ศ. 2564–2567 ใช้ประกอบการวางแผน ไม่ใช่การแจ้งเตือนน้ำท่วม จุดในแผนยังไม่มีพิกัดบนแผนที่", "Past 2021–2024 plan for planning use, not a flood alert. Plan sites are not yet pinned on the map.")}</p>` +
      `<section class="panel-section"><div class="facts-grid">${fact(16, text("จุดในแผนเดิม", "Sites in the past plan"))}${fact(null, text("น้ำท่วมตอนนี้", "Flooding now"), text("ยังไม่มีข้อมูลส่วนนี้", "Not available"))}</div></section><div class="section-title"><h2>${text("ปัญหาและแนวทางแก้ในแผนเดิม", "Problems and fixes in the past plan")}</h2></div>` +
      S.docs.sites
        .map(
          (d) =>
            `<article class="document-card"><div class="document-meta">${text("จุดที่", "Site")} ${d.sourceSiteOrdinal} · ${esc(d.communityLabel)}</div><h3>${esc(d.title)}</h3><p>${esc(S.lang === "en" ? d.problemEn : d.problem)}</p><p>${text("แนวทางในเอกสาร: ", "Source proposal: ")}${esc(S.lang === "en" ? d.proposedActionEn : d.proposedAction)}</p><p class="document-meta">${d.budget.amount == null ? text("ประมาณการไม่ครบหรือขัดกัน", "Estimate missing or conflicting") : `${text("ประมาณการในแผนเดิม", "Historical estimate")} ${num(d.budget.amount)} ${text("บาท", "THB")}`} · ${text("ยังไม่ทราบงบอนุมัติปัจจุบัน", "current approved budget unknown")}</p><a href="${esc(d.sourceUrl)}" target="_blank" rel="noopener">${text("อ่านต้นฉบับ หน้า", "Read source page")} ${d.sourcePage}</a></article>`,
        )
        .join("")
    );
  }
  /* Parcel caveats live in the sources tab; the overview keeps the task. */
  const PARCEL_NOTES = [
    ["ใช้ดูตำแหน่งประกอบงาน ยังไม่ใช่หลักฐานแนวเขตทางกฎหมาย ระบบพิกัดในไฟล์ต้นทางไม่ได้ระบุ จึงเทียบกับข้อมูลบ้านและอาคารแล้วรอเจ้าหน้าที่รับรอง", "For locating work only, not legal boundary evidence. The source file has no stated coordinate system; it was matched to house and building data and awaits official confirmation."],
    ["ไฟล์ส่งมา 40,368 แปลง แสดงได้ 40,367 รูป · 1 รูปไม่มีพื้นที่ · 48 รูปปรับให้แสดงได้ โดยเก็บต้นฉบับไว้", "40,368 parcels supplied; 40,367 shown · 1 has no area · 48 were adjusted for display, with the originals kept."],
    ["ก่อนใช้กับงานภาษี ต้องแก้รหัสแปลงว่าง 77 แปลง กลุ่มรหัสซ้ำ 47 กลุ่ม และเนื้อที่อ่านไม่ได้ 5,453 แปลง", "Before tax use, fix 77 blank parcel codes, 47 duplicate-code groups and 5,453 unreadable area values."],
    ["ไม่มีชื่อเจ้าของหรือเลขผู้เสียภาษีบนเว็บ และยังไม่ได้จับคู่แปลงกับอาคารเป็นรายการเดียวกัน", "No owner names or taxpayer numbers on this site; parcels and buildings are not yet matched one-to-one."],
  ];
  function parcelContent() {
    return `<section class="panel-section"><p>${esc(purposeOf("parcels"))}</p><div class="facts-grid">${fact(countFor("parcels"), text("แปลงในพื้นที่นี้", "Parcels in this area"))}${fact(null, text("แปลงที่อยู่ในบัญชีภาษีแล้ว", "Parcels on the tax roll"), text("ยังไม่มีข้อมูลส่วนนี้", "Not available yet"))}</div><button data-show-list class="more-button">${text("ดูรายการแปลงในพื้นที่นี้", "List parcels in this area")}</button><button type="button" class="more-button" data-tool="tax-calculator">${ui("calculator", 18)}${text("คิดภาษีที่ควรเก็บของหนึ่งแปลง", "Work out the tax due for one parcel")}</button>${notesLink()}</section>`;
  }
  function terrainStateLabel() {
    if (S.mode === "3d") {
      if (S.terrain3DStatus.state === "ready" && S.terrain3DStatus.basemapState === "loading") return text("ภูมิประเทศ 3D พร้อม · กำลังเติมภาพพื้นหลัง", "3D terrain ready · loading the basemap");
      if (S.terrain3DStatus.state === "ready" && S.terrain3DStatus.basemapState === "partial") return text("ภูมิประเทศ 3D พร้อม · ภาพพื้นหลังยังไม่ครบ", "3D terrain ready · basemap partially available");
      if (S.terrain3DStatus.state === "ready" && S.terrain3DStatus.basemapState === "unavailable") return text("ภูมิประเทศ 3D พร้อม · ภาพพื้นหลังโหลดไม่ได้ จึงแสดงพื้นผิวสีเรียบ", "3D terrain ready · basemap unavailable, showing a plain surface");
      const states = {
        loading: S.terrain3DVisible ? ["กำลังเพิ่มรายละเอียดภูมิประเทศ 3D", "Loading additional 3D terrain detail"] : ["กำลังเปิด 3D · ยังดูแผนที่ 2D ต่อได้", "Loading 3D · the 2D map remains available"],
        ready: ["แสดงภูมิประเทศ 3D แล้ว", "3D terrain is ready"],
        partial: ["แสดงภูมิประเทศ 3D ได้บางส่วน · พื้นที่ที่ไม่มีข้อมูลเว้นว่างไว้", "3D terrain is partially available · missing areas remain empty"],
        error: ["3D ยังเปิดไม่ได้ · เลือก 2D เพื่อดูพื้นที่ต่อ", "3D is unavailable · choose 2D to continue"],
      };
      return text(...(states[S.terrain3DStatus.state] || states.loading));
    }
    if (S.terrain3DError) return text("กลับมาแสดง 2D แล้ว · เลือก 3D เพื่อลองเปิดอีกครั้ง", "Showing 2D · select 3D to try again");
    const labels = {
      loading: ["กำลังเปิดเงาภูมิประเทศ", "Loading terrain hillshade"],
      ready: ["เปิดเงาภูมิประเทศแล้ว", "Terrain hillshade loaded"],
      partial: ["เปิดเงาภูมิประเทศได้บางส่วน", "Terrain hillshade partially loaded"],
      error: ["เปิดเงาภูมิประเทศไม่สำเร็จ ขอบเขตพื้นที่ยังใช้ได้", "Terrain hillshade could not load; boundaries remain available"],
    };
    return text(...(labels[S.terrainStatus.state] || ["ข้อมูล FABDEM พร้อมเชื่อมจาก CityMETER", "FABDEM source available from CityMETER"]));
  }
  function terrainContent() {
    return `<section class="panel-section"><p>${text("ดูว่าตรงไหนสูง ตรงไหนต่ำ ช่วยคิดเรื่องทางน้ำและจุดที่น้ำอาจขัง ภาพนี้แสดงรูปทรงพื้นที่ ไม่ใช่ระดับน้ำท่วม", "See where ground is high or low to think about water paths and pooling. It shows land shape, not flood depth.")}</p><p id="terrain-state">${esc(terrainStateLabel())}</p><p>${text("กด 2D เหนือแผนที่เพื่ออ่านตำแหน่ง หรือกด 3D เพื่อหมุนและเอียงดู ตำแหน่งและระดับซูมจะตามกันเมื่อสลับ", "Choose 2D above the map to read locations, or 3D to rotate and tilt. Position and zoom carry over when you switch.")}</p>${notesLink()}</section>`;
  }
  function terrainSources() {
    const s = S.terrainSource;
    return `<p class="inline-note">${text("เงาภูมิประเทศ FABDEM ครอบคลุมอำเภอเมืองขอนแก่น แสงช่วยเห็นรูปทรง ไม่ใช่ความเสี่ยงน้ำท่วม · ใน 3D รูปทรงพื้นผิวต่อด้วย FABDEM นอกอำเภอเพื่อไม่ให้เกิดหน้าผาปลอมที่ขอบอำเภอ ส่วนสีความสูง เส้นชั้นความสูง และการวัดความต่างระดับใช้เฉพาะในอำเภอ · 3D ไม่สร้างความสูงอาคารหรือระดับน้ำ", "FABDEM hillshade for Mueang Khon Kaen district. Shading shows form, not flood risk · In 3D the surface shape continues with FABDEM beyond the district so no false cliff appears at its edge; height colours, contours and relief measurements stay inside the district · 3D does not infer building heights or water levels.")}</p>` +
      `<dl class="source-dl"><dt>${text("ชุดข้อมูล", "Dataset")}</dt><dd>${esc(s?.dataset || "FABDEM")}</dd><dt>${text("รายละเอียดต้นทาง", "Source detail")}</dt><dd>${esc(s?.resolution || text("กำลังเปิดคำอธิบายต้นทาง", "Source description is loading"))}</dd><dt>${text("รุ่นไฟล์แสดงผล", "Tile build version")}</dt><dd>${esc(s?.version || "—")} · ${text("วันสร้าง tile ไม่ใช่วันสำรวจภูมิประเทศ", "Tile build date is not terrain survey date")}</dd><dt>${text("ระดับซูม", "Zoom")}</dt><dd>${text("ข้อมูลต้นทางถึงซูม", "Native source through zoom")} ${num(s?.maxNativeZoom)} · ${text("ขยายแสดงผลถึง 22 โดยไม่เพิ่มรายละเอียด", "Display overzoom through 22 adds no detail")}</dd><dt>${text("ฐานอ้างอิงแนวดิ่ง", "Vertical datum")}</dt><dd>${esc(s?.verticalDatum || text("ยังไม่ประกาศในคำอธิบายที่ได้รับ", "Not declared in the supplied source description"))}</dd><dt>${text("สิทธิ์และที่มา", "Rights and source")}</dt><dd>${esc(s?.attribution || "—")}${s?.sourceUrl ? ` · <a href="${esc(s.sourceUrl)}" target="_blank" rel="noopener">${text("ต้นทาง", "Source")}</a>` : ""}${s?.licenseUrl ? ` · <a href="${esc(s.licenseUrl)}" target="_blank" rel="noopener">${text("อ่านเงื่อนไข", "Read terms")}</a>` : ""}</dd></dl>`;
  }
  function renderTerrainControls() {
    const active = S.dataset === "terrain";
    $("terrain-view-controls").hidden = !active;
    $("terrain-view-panel").hidden = !active;
    if (active) document.body.dataset.terrainView = S.mode;
    else delete document.body.dataset.terrainView;
    document.querySelectorAll("[data-terrain-mode]").forEach(button => {
      const selected = button.dataset.terrainMode === S.mode;
      button.setAttribute("aria-pressed", String(selected));
      button.tabIndex = selected ? 0 : -1;
      button.setAttribute("aria-label", button.dataset.terrainMode === "3d" ? text("3D · หมุนดูรูปทรงภูมิประเทศ", "3D · rotate and tilt terrain") : text("2D · อ่านตำแหน่งและเลือกรายการ", "2D · inspect locations and records"));
    });
    $("terrain-view-help").textContent = S.mode === "3d"
      ? (TOUCH()
        ? text("ลากนิ้วเดียวเพื่อเลื่อน · จีบหรือถ่างสองนิ้วเพื่อซูม · ลากสองนิ้วขึ้นลงเพื่อเอียง · ทิศเหนืออยู่ด้านบนเสมอ · ความสูงขยายให้เห็นรูปทรง ไม่ใช่ความสูงจริง", "Drag one finger to pan · pinch to zoom · slide two fingers up or down to tilt · north stays up · height is exaggerated to show form")
        : text("ลากเพื่อเลื่อน · หมุนล้อ จีบทัชแพด หรือปัดสองนิ้วขึ้นลงเพื่อซูม · ปัดสองนิ้วซ้ายขวาเพื่อเลื่อน · คลิกขวาลากขึ้นลงเพื่อเอียง · ทิศเหนืออยู่ด้านบนเสมอ · ความสูงขยายให้เห็นรูปทรง ไม่ใช่ความสูงจริง", "Drag to pan · wheel, pinch or two-finger swipe up/down to zoom · two-finger swipe sideways to pan · right-drag up or down to tilt · north stays up · height is exaggerated to show form"))
      : text("อ่านตำแหน่งใน 2D · เปลี่ยนเป็น 3D เพื่อดูรูปทรงพื้นที่", "Inspect locations in 2D · switch to 3D to explore terrain form");
    const status = active ? terrainStateLabel() : "";
    if ($("terrain-view-status").textContent !== status) $("terrain-view-status").textContent = status;
    $("terrain-exaggeration").hidden = !(active && S.mode === "3d");
    syncExaggerationReadout();
    const overlaysDisabled = active && S.mode === "3d";
    $("layers-open").disabled = overlaysDisabled;
    $("layers-open").title = overlaysDisabled ? text("ชั้นข้อมูลซ้อนเปิดใช้ในมุมมอง 2D", "Context overlays are available in 2D") : "";
    if (overlaysDisabled) { $("layer-options").hidden = true; $("layers-open").setAttribute("aria-expanded", "false"); }
  }
  /* Vertical exaggeration as in the CityMETER terrain viewer: logarithmic 0.5x–50x slider and an automatic mode
     that shows the in-view relief as a share of the view width (default 15%). */
  const exText = (v) => v == null ? "—" : (v < 10 ? v.toFixed(1) : String(Math.round(v)));
  const exNowText = () => text(`ขยายความสูง ${exText(S.terrainExaggeration)} เท่า${S.terrainAuto ? " (อัตโนมัติ)" : ""}`, `Height × ${exText(S.terrainExaggeration)}${S.terrainAuto ? " (automatic)" : ""}`);
  function syncExaggerationReadout(updateSlider = true) {
    const input = $("terrain-exaggeration-input");
    if (updateSlider && input && TEX) input.value = String(!S.terrainAuto && S.terrainSliderPos != null ? S.terrainSliderPos : TEX.exToSlider(S.terrainExaggeration));
    if (input) input.setAttribute("aria-valuetext", text(`${exText(S.terrainExaggeration)} เท่า${S.terrainAuto ? " อัตโนมัติ" : ""}`, `${exText(S.terrainExaggeration)} times${S.terrainAuto ? ", automatic" : ""}`));
    if ($("terrain-exaggeration-value")) $("terrain-exaggeration-value").textContent = `×${exText(S.terrainExaggeration)}`;
    const auto = $("terrain-auto");
    if (auto) { auto.setAttribute("aria-pressed", String(S.terrainAuto)); auto.textContent = text("อัตโนมัติ", "Auto"); }
    const now = $("terrain-ex-now");
    if (now) now.textContent = exNowText();
  }
  function applyAutoExaggeration(force = false) {
    if (!S.terrainAuto || !S.terrain3D?.measureRelief || !TEX) return;
    const r = S.terrain3D.measureRelief();
    S.terrainRelief = r;
    const v = TEX.autoValue(r?.relief, r?.widthM, S.terrainAutoTarget);
    if (v != null && (force || Math.abs(v - S.terrainExaggeration) > 0.05 * S.terrainExaggeration)) {
      S.terrainExaggeration = v;
      S.terrain3D.setExaggeration(v);
    }
    syncExaggerationReadout();
    const note = $("terrain-relief-note");
    if (note) note.textContent = reliefText();
  }
  function scheduleAutoExaggeration() {
    if (S.terrain3D?.measureRelief && !S.terrainAuto) { S.terrainRelief = S.terrain3D.measureRelief(); const note = $("terrain-relief-note"); if (note) note.textContent = reliefText(); return; }
    clearTimeout(scheduleAutoExaggeration.timer);
    scheduleAutoExaggeration.timer = setTimeout(() => applyAutoExaggeration(false), 160);
  }
  function setTerrainAuto(on) {
    S.terrainAuto = !!on;
    S.terrainSliderPos = null;
    if (S.terrainAuto) applyAutoExaggeration(true);
    syncExaggerationReadout();
    renderLayerControls();
    syncURL(true);
  }
  function reliefText() {
    const r = S.terrainRelief;
    if (!r || r.relief == null) return text("ยังวัดความต่างระดับในมุมมองนี้ไม่ได้ (ยังโหลดไม่ครบ หรืออยู่นอกพื้นที่ที่มีข้อมูล)", "The relief in this view cannot be measured yet (still loading, or outside the data area)");
    return text(`ในมุมมองนี้ ความต่างระดับ ${num(r.relief, 1)} ม. (${num(r.low, 0)}–${num(r.high, 0)} ม. ตัดค่าสุดโต่งบนล่าง 1%) ความกว้างภาพ ${num(r.widthM / 1000, 1)} กม.`, `In this view the relief is ${num(r.relief, 1)} m (${num(r.low, 0)}–${num(r.high, 0)} m, top and bottom 1% trimmed) across ${num(r.widthM / 1000, 1)} km`);
  }
  function terrainControlsHTML() {
    if (S.mode !== "3d") return `<div class="control-card"><p class="small-note">${text("กด 3D เหนือแผนที่ แล้วปรับความสูงได้ที่นี่หรือที่แถบเหนือแผนที่", "Choose 3D above the map, then adjust the height here or in the bar above the map")}</p></div>`;
    const pct = Math.round(S.terrainAutoTarget * 100);
    return `<div class="control-card"><h2 class="control-title">${text("ความสูงในภาพ 3D", "Height in the 3D view")}</h2><p id="terrain-ex-now" class="control-field" aria-live="polite">${esc(exNowText())}</p>`
      + `<label class="check-item"><input type="checkbox" id="terrain-auto-check"${S.terrainAuto ? " checked" : ""}><span>${text("ขยายความสูงอัตโนมัติ", "Automatic height")}<small>${text(`ความต่างระดับสูงเป็น ${pct}% ของความกว้างมุมมอง · สูตรเดียวกับ CityMETER · เลื่อนแถบความสูงเมื่อไรจะเปลี่ยนเป็นกำหนดเอง`, `Relief shown as ${pct}% of the view width · same rule as CityMETER · moving the height slider switches to manual`)}</small></span></label>`
      + (S.terrainAuto ? `<div class="control-field"><span id="terrain-target-label">${text("สัดส่วนความต่างระดับต่อความกว้างมุมมอง", "Relief as a share of view width")}</span><div class="control-range"><input id="terrain-target" type="range" min="5" max="30" step="1" value="${pct}" aria-labelledby="terrain-target-label"><output id="terrain-target-value" for="terrain-target">${pct}%</output></div></div>` : "")
      + `<p id="terrain-relief-note" class="small-note">${esc(reliefText())}</p>`
      + `<p class="small-note">${text("ค่าเริ่มต้น 2 เท่า ตามที่เจ้าของงานกำหนด ศิลาค่อนข้างราบ ทั้งเขตเทศบาลสูงต่างกันราว 60 ม. ในความกว้าง 13 กม. ภาพที่ 2 เท่าจึงค่อนข้างแบน ถ้าอยากเห็นรูปทรงชัดขึ้น เลือก “ขยายความสูงอัตโนมัติ” (สูตร CityMETER ความต่างระดับเป็น 15% ของความกว้างภาพ ทั้งเทศบาลจะขยายราว 34 เท่า) ความสูงที่ขยายใช้ดูรูปทรงเท่านั้น ไม่ใช่ความสูงจริงหรือระดับน้ำ", "Default 2 times, as set by the owner. Sila is fairly flat, with about 60 m of relief across 13 km, so 2 times looks rather flat. For a clearer shape choose “Automatic height” (the CityMETER rule: relief shown as 15% of the view width, about 34 times for the whole city). Exaggeration shows form only, not true height or water level.")}</p>`
      + (!S.terrainAuto && S.terrainExaggeration === TERRAIN_DEFAULT_EX ? "" : `<button type="button" class="more-button" data-terrain-reset>${text("กลับไปค่าเริ่มต้น (2 เท่า)", "Back to the default (2 times)")}</button>`) + `</div>`;
  }
  /* Height colour (OH3 explore: stretched to the view's 0.5–99.5% heights, re-stretched after each move unless locked)
     and contour lines (finest step with at most 100 lines in view by default; a manual step above 200 lines is coarsened). */
  const stepText = (v) => String(Math.round(v * 100) / 100);   // 0.05, 0.5, 2.5, 10 (no rounding of half-metre majors)
  function contourStepFor(relief) {
    if (!(relief > 0)) return { step: S.terrainStepChoice === "auto" ? S.terrainStep : S.terrainStepChoice, note: null };
    const fits = (limit) => CONTOUR_STEPS.find((st) => relief / st <= limit) ?? CONTOUR_STEPS[CONTOUR_STEPS.length - 1];
    if (S.terrainStepChoice === "auto") return { step: fits(CONTOUR_SOFT), note: null };
    const want = S.terrainStepChoice;
    if (relief / want <= CONTOUR_HARD) return { step: want, note: relief / want > CONTOUR_SOFT ? text(`ระยะ ${stepText(want)} ม. ในมุมมองนี้มีราว ${num(Math.round(relief / want))} เส้น อาจช้า`, `${stepText(want)} m gives about ${num(Math.round(relief / want))} lines here and may be slow`) : null };
    const used = fits(CONTOUR_HARD);
    return { step: used, note: text(`ใช้ระยะ ${stepText(used)} ม. แทน ${stepText(want)} ม. เพื่อไม่ให้เกิน ${CONTOUR_HARD} เส้น ซูมเข้าเพื่อใช้ระยะที่ละเอียดขึ้น`, `Using ${stepText(used)} m instead of ${stepText(want)} m to stay under ${CONTOUR_HARD} lines; zoom in for finer steps`) };
  }
  function terrainMeasure() {
    if (S.terrain3DVisible && S.terrain3D?.measureRelief) {
      const r = S.terrain3D.measureRelief();
      return r && r.relief != null ? { lo: r.lo, hi: r.hi, relief: r.relief, quantiles: r.quantiles } : null;
    }
    if (S.terrainLayer?.measureRange && S.map) {
      const b = S.map.getBounds(), r = S.terrainLayer.measureRange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      return r ? { lo: r.lo, hi: r.hi, relief: r.q99 - r.q01, quantiles: r.quantiles } : null;
    }
    return null;
  }
  function terrainSurfaceStyle() {
    const pal = TERRAIN_PALETTES[S.terrainPalette];
    return { colors: pal?.colors || null, colorOn: !!pal, lo: S.terrainRange.lo, hi: S.terrainRange.hi, opacity: 0.85, interval: S.terrainContours ? S.terrainStep : 0, major: 5,
      bands: S.terrainBands ? S.terrainStep : 0, mapping: S.terrainMapping, quantiles: S.terrainQuantiles };
  }
  function applyTerrainSurface() {
    const style = terrainSurfaceStyle();
    S.terrainLayer?.setStyle?.(style);
    S.terrain3D?.setSurface?.(style);
  }
  function updateTerrainSurface(force = false) {
    if (S.dataset !== "terrain") return;
    const m = terrainMeasure();
    let changed = force;
    if (m) {
      S.terrainMeasured = m;
      if (!S.terrainRangeLock) {
        let lo = m.lo, hi = m.hi;
        if (hi - lo < 0.5) { const mid = (hi + lo) / 2; lo = mid - 0.25; hi = mid + 0.25; }
        const span = Math.max(0.5, S.terrainRange.hi - S.terrainRange.lo);
        if (Math.abs(lo - S.terrainRange.lo) > 0.02 * span || Math.abs(hi - S.terrainRange.hi) > 0.02 * span) { S.terrainRange = { lo, hi }; changed = true; }
        if (m.quantiles?.length === 101) {
          const old = S.terrainQuantiles, moved = !old || m.quantiles.some((v, i) => Math.abs(v - old[i]) > 0.02 * span);
          if (moved) { S.terrainQuantiles = m.quantiles.slice(); changed = true; }
        }
      }
      if (S.terrainRangeLock && !S.terrainQuantiles && m.quantiles?.length === 101) { S.terrainQuantiles = m.quantiles.slice(); changed = true; }
      const { step, note } = contourStepFor(m.relief);
      if (step !== S.terrainStep) { S.terrainStep = step; changed = true; }
      S.terrainStepNote = note;
    }
    if (changed) applyTerrainSurface();
    drawLegend();
    const card = $("terrain-surface-now"); if (card) card.textContent = surfaceNowText();
    const bandNote = $("terrain-bands-note"); if (bandNote) bandNote.textContent = bandNoteText();
  }
  function scheduleTerrainSurface() {
    clearTimeout(scheduleTerrainSurface.timer);
    scheduleTerrainSurface.timer = setTimeout(() => updateTerrainSurface(false), 220);
  }
  /* Height -> colour position, the same rule the renderers use (linear in metres, or equal area via in-view percentiles). */
  function terrainT(h) {
    const r = S.terrainRange, q = S.terrainMapping === "equalize" && S.terrainQuantiles?.length === 101 ? S.terrainQuantiles : null;
    if (!q) return Math.min(1, Math.max(0, (h - r.lo) / Math.max(1e-9, r.hi - r.lo)));
    if (h <= q[0]) return 0; if (h >= q[100]) return 1;
    let a = 0, b = 100;
    while (b - a > 1) { const m = (a + b) >> 1; if (q[m] <= h) a = m; else b = m; }
    return (a + (q[b] > q[a] ? (h - q[a]) / (q[b] - q[a]) : 0)) / 100;
  }
  /* Legend bar drawn in colour-position space: smooth ramp, or the bands in view (each band at its middle height). */
  function terrainBarCSS(colors) {
    const smooth = `linear-gradient(90deg,${colors.join(",")})`;
    if (!S.terrainBands || !window.SilaFabdem?.rampLUT) return smooth;
    const lut = window.SilaFabdem.rampLUT(colors), r = S.terrainRange, band = S.terrainStep, span = r.hi - r.lo;
    if (!(span > 0) || !(band > 0) || span / band > 120) return smooth;
    const stops = [];
    for (let b0 = Math.floor(r.lo / band) * band; b0 < r.hi; b0 += band) {
      const k = Math.round(terrainT(b0 + band / 2) * 255) * 3, c = `rgb(${lut[k]},${lut[k + 1]},${lut[k + 2]})`;
      stops.push(`${c} ${(terrainT(b0) * 100).toFixed(2)}%`, `${c} ${(terrainT(b0 + band) * 100).toFixed(2)}%`);
    }
    return `linear-gradient(90deg,${stops.join(",")})`;
  }
  function terrainTicks() {
    const r = S.terrainRange, q = S.terrainMapping === "equalize" && S.terrainQuantiles?.length === 101 ? S.terrainQuantiles : null;
    return q ? [q[0], q[25], q[50], q[75], q[100]] : [r.lo, r.lo + (r.hi - r.lo) / 4, (r.lo + r.hi) / 2, r.lo + 3 * (r.hi - r.lo) / 4, r.hi];
  }
  const bandNoteText = () => text(`แต่ละสีกว้าง ${stepText(S.terrainStep)} ม. เท่าระยะเส้น อ่านระดับได้ง่ายกว่าไล่สีต่อเนื่อง`, `Each colour spans ${stepText(S.terrainStep)} m, the contour interval; easier to read than a smooth ramp`);
  function surfaceNowText() {
    const r = S.terrainRange, parts = [];
    if (TERRAIN_PALETTES[S.terrainPalette]) parts.push(text(`สีช่วง ${num(r.lo, 1)}–${num(r.hi, 1)} ม.${S.terrainRangeLock ? " (ล็อกไว้)" : " (ยืดตามมุมมอง)"}`, `Colours span ${num(r.lo, 1)}–${num(r.hi, 1)} m${S.terrainRangeLock ? " (locked)" : " (fitted to view)"}`));
    if (S.terrainContours) parts.push(text(`เส้นทุก ${stepText(S.terrainStep)} ม. เส้นหนาทุก ${stepText(S.terrainStep * 5)} ม.`, `lines every ${stepText(S.terrainStep)} m, bold every ${stepText(S.terrainStep * 5)} m`));
    return parts.join(" · ") || text("ปิดสีและเส้นชั้นความสูง", "Colour and contours off");
  }
  function terrainSurfaceControlsHTML() {
    const pal = S.terrainPalette, opts = [...Object.entries(TERRAIN_PALETTES).map(([id, p]) => [id, text(...p.label)]), ["off", text("ปิดสี (เงาอย่างเดียว)", "Off (shading only)")]];
    const stepOpts = [["auto", text("ละเอียดสุดที่อ่านได้ (อัตโนมัติ)", "Finest readable (automatic)")], ...CONTOUR_STEPS.map((st) => [String(st), text(`${stepText(st)} ม.`, `${stepText(st)} m`)])];
    const fine = S.terrainContours && S.terrainStep < 1;
    return `<div class="control-card"><h2 class="control-title">${text("สีตามความสูงและเส้นชั้นความสูง", "Height colour and contours")}</h2><p id="terrain-surface-now" class="control-field" aria-live="polite">${esc(surfaceNowText())}</p>`
      + `<label class="control-field"><span>${text("ชุดสี", "Colours")}</span><select id="terrain-palette">${opts.map(([id, l]) => `<option value="${id}"${id === pal ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`
      + (TERRAIN_PALETTES[pal] ? `<p class="small-note">${esc(text(...TERRAIN_PALETTES[pal].note))}</p><label class="check-item"><input type="checkbox" id="terrain-bands"${S.terrainBands ? " checked" : ""}><span>${text("แบ่งสีเป็นชั้นตามเส้นชั้นความสูง", "Colour in bands between contour lines")}<small id="terrain-bands-note">${esc(bandNoteText())}</small></span></label><label class="control-field"><span>${text("กระจายสีตาม", "Spread colours by")}</span><select id="terrain-mapping"><option value="equalize"${S.terrainMapping === "equalize" ? " selected" : ""}>${text("พื้นที่ (แต่ละสีครอบคลุมพื้นที่พอ ๆ กัน) · แนะนำ", "Area (each colour covers a similar share) · recommended")}</option><option value="linear"${S.terrainMapping === "linear" ? " selected" : ""}>${text("เมตร (เชิงเส้น)", "Metres (linear)")}</option></select></label><p class="small-note">${text("ศิลาราบเป็นส่วนใหญ่ ครึ่งหนึ่งของพื้นที่สูงไม่เกิน 160 ม. ถ้ากระจายตามเมตร ที่ต่ำเกือบทั้งหมดจะเป็นสีเดียว กระจายตามพื้นที่จึงเห็นความต่างในที่ราบได้ชัดกว่า", "Sila is mostly flat: half the area is below about 160 m. Spread by metres, most low ground shares one colour; spread by area shows differences across the flat ground.")}</p><label class="check-item"><input type="checkbox" id="terrain-lock"${S.terrainRangeLock ? " checked" : ""}><span>${text("ล็อกช่วงสี", "Lock the colour range")}<small>${text("ใช้สเกลเดียวกันเมื่อเลื่อนไปเทียบพื้นที่อื่น ถ้าไม่ล็อก สีจะยืดตามความสูงที่เห็นอยู่ สีเดียวกันในสองมุมมองจึงอาจไม่ใช่ความสูงเดียวกัน", "Keeps one scale while you compare areas. Unlocked, colours stretch to the heights in view, so the same colour in two views can mean different heights.")}</small></span></label>` : "")
      + `<label class="check-item"><input type="checkbox" id="terrain-contours"${S.terrainContours ? " checked" : ""}><span>${text("แสดงเส้นชั้นความสูง", "Show contour lines")}<small>${text("เส้นหนาทุก 5 ช่วง", "Bold every fifth line")}</small></span></label>`
      + (S.terrainContours ? `<label class="control-field"><span>${text("ระยะห่างระหว่างเส้น", "Contour interval")}</span><select id="terrain-step">${stepOpts.map(([id, l]) => `<option value="${id}"${String(S.terrainStepChoice) === id ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>` : "")
      + (S.terrainStepNote ? `<p class="small-note" role="status">${esc(S.terrainStepNote)}</p>` : "")
      + (S.lowgroundStatus === "ready" ? `<label class="check-item"><input type="checkbox" id="terrain-lowground"${S.terrainLowground ? " checked" : ""}${S.mode === "3d" ? " disabled" : ""}><span>${text("ที่ลุ่มปิดล้อม (น้ำขังได้ก่อนล้นออก)", "Closed low ground (ponds before it spills)")}<small>${text("จาก FABDEM 30 ม. เติมแอ่งถึงระดับล้น · ภาพคัดกรอง ไม่ใช่แผนที่เสี่ยงภัย · 2D เท่านั้น", "From 30 m FABDEM, depressions filled to the spill level · screening picture, not a risk map · 2D only")}</small></span></label>` : "")
      + (fine ? `<p class="small-note">${text("เส้นที่ละเอียดกว่า 1 ม. แสดงรูปทรงจากแบบจำลอง FABDEM ไม่ใช่ระดับที่สำรวจจริง (FABDEM คลาดเคลื่อนเฉลี่ยราว 1.1 ม. ในเขตเมือง และ 2.9 ม. ในพื้นที่ป่า)", "Lines finer than 1 m show the shape of the FABDEM model, not surveyed levels (FABDEM’s mean error is about 1.1 m in built-up areas and 2.9 m in forest)")}</p>` : "")
      + `<p class="small-note">${text("สีความสูงใช้ชุดสี OH3 แบบเดียวกับ CityMETER เป็นข้อยกเว้นนอก LDS 0.9.7 เฉพาะชั้นนี้ เพราะ LDS ยังไม่มีสเกลความสูงพื้นดิน ความสูงไม่ใช่ระดับน้ำหรือความเสี่ยงน้ำท่วม", "Height colours use the OH3 palettes as in CityMETER, an exception to LDS 0.9.7 for this layer only, because LDS has no land-height scale yet. Height is not water level or flood risk.")}</p></div>`;
  }
  function terrainCamera2D() {
    try { const c = S.map.getCenter(); return {center:[c.lng,c.lat],zoom:S.map.getZoom()}; }
    catch (_) { const b = scopeData().bbox; return {center:[(b[0]+b[2])/2,(b[1]+b[3])/2],zoom:13}; }
  }
  function validTerrainCamera(camera) {
    const zoom = camera?.zoom ?? camera?.zoomLeafletCompatible;
    return camera && Array.isArray(camera.center) && camera.center.length === 2 && camera.center.every(Number.isFinite) && Number.isFinite(zoom)
      ? {...camera,zoom} : null;
  }
  function hideTerrain3D(syncCamera = true) {
    if (syncCamera && S.terrain3D && (S.mode === "3d" || S.terrain3DVisible)) {
      let camera = null;
      try { camera = validTerrainCamera(S.terrain3D.getCamera()); } catch (_) {}
      if (camera) {
        S.terrain3DCamera = camera;
        const snap = S.map.options.zoomSnap;
        try { S.map.options.zoomSnap = 0; S.map.setView([camera.center[1],camera.center[0]],camera.zoom,{animate:false}); }
        finally { S.map.options.zoomSnap = snap; }
      }
    }
    try { S.terrain3D?.hide(); } catch (_) {}
    S.terrain3DVisible = false;
    $("terrain-3d").hidden = true;
    document.querySelector(".map-stage").dataset.renderer = "2d";
    S.map?.invalidateSize({pan:false});
  }
  function showTerrain3D() {
    if (S.dataset !== "terrain" || S.mode !== "3d") return;
    const becameVisible = !S.terrain3DVisible;
    S.terrain3DVisible = true;
    $("terrain-3d").hidden = false;
    document.querySelector(".map-stage").dataset.renderer = "3d";
    if (S.terrainLayer) { S.map.removeLayer(S.terrainLayer); S.terrainLayer = null; }
    if (becameVisible) S.terrain3D?.resize();
    renderTerrainControls();
  }
  function terrain3DFailed() {
    if (S.dataset !== "terrain" || S.mode !== "3d") return;
    hideTerrain3D();
    S.terrain3DGeneration++;
    try { S.terrain3D?.destroy(); } catch (_) {}
    S.terrain3D = null; S.terrain3DInit = null;
    S.mode = "2d"; S.terrain3DError = true; S.terrain3DStatus = {state:"error"};
    renderPanel(); drawTerrain(); syncURL(true);
    toast(text("เปิด 3D ไม่สำเร็จ · กลับมาใช้ 2D แล้ว ลอง 3D ได้อีกครั้ง", "3D could not open · 2D is restored. You can retry 3D."));
  }
  function terrainBoundaryContext() {
    const fc = geoForBoundary();
    return {boundary: S.scope.type === "municipality" ? fc : {...fc,features:fc.features.filter(f=>f.properties.id===S.scope.id)},municipality:S.cache.get("data/municipality.geojson")};
  }
  async function syncTerrainView() {
    if (S.dataset !== "terrain" || S.mode !== "3d") { hideTerrain3D(); return; }
    $("terrain-3d").hidden = false;
    if (S.terrain3D) {
      if (!S.terrain3DVisible) S.terrain3D.setCamera({...S.terrain3DCamera,...terrainCamera2D()});
      S.terrain3D.setTheme(S.theme); S.terrain3D.setBasemap(S.basemap); S.terrain3D.setBoundaries(terrainBoundaryContext());
      S.terrain3D.show();
      S.terrain3D.ready.then(showTerrain3D).catch(()=>{});
      return;
    }
    if (S.terrain3DInit) return S.terrain3DInit;
    if (!window.SilaTerrain3D?.create || !S.terrainSource || !S.terrainCoverage) { terrain3DFailed(); return; }
    const generation = ++S.terrain3DGeneration;
    S.terrain3DStatus = {state:"loading"}; renderTerrainControls();
    const pending = window.SilaTerrain3D.create({
      container:$("terrain-3d"),source:S.terrainSource,coverage:S.terrainCoverage,tokens:S.tokens,exaggeration:S.terrainExaggeration,
      camera:{...S.terrain3DCamera,...terrainCamera2D()},theme:S.theme,basemap:S.basemap,...terrainBoundaryContext(),
      onCameraChange:camera=>{
        if(generation!==S.terrain3DGeneration)return;
        const c=validTerrainCamera(camera);if(!c)return;
        S.terrain3DCamera=c; scheduleAutoExaggeration(); scheduleTerrainSurface();
        Object.assign($("terrain-3d").dataset,{longitude:String(c.center[0]),latitude:String(c.center[1]),zoom:String(c.zoom),pitch:String(c.pitch),bearing:String(c.bearing)});
      },
      // Relief is measured in the terrain worker after each move and as tiles arrive; re-fit height and colours then.
      onRelief:()=>{ if(generation!==S.terrain3DGeneration)return; scheduleAutoExaggeration(); scheduleTerrainSurface(); },
      onStatus:status=>{
        if(generation!==S.terrain3DGeneration)return;
        S.terrain3DStatus=status; $("map").dataset.terrain3dState=status.state;
        for(const key of ["pending","rendered","triangles","exaggeration"])if(Number.isFinite(status[key]))$("terrain-3d").dataset[key]=String(status[key]);
        if(status.basemapState)$("terrain-3d").dataset.basemapState=status.basemapState;
        if(S.dataset!=="terrain"||S.mode!=="3d")return;
        if(status.state==="error"&&status.fatal){terrain3DFailed();return;}
        if(status.state==="ready"||status.state==="partial"&&status.rendered>0){showTerrain3D();scheduleAutoExaggeration();scheduleTerrainSurface();}
        renderTerrainControls(); const node=$("terrain-state");if(node)node.textContent=terrainStateLabel();drawLegend();
      }
    }).then(controller=>{
      if(generation!==S.terrain3DGeneration){controller.destroy();return;}
      S.terrain3D=controller; controller.setSurface?.(terrainSurfaceStyle());
      controller.ready.then(()=>{if(generation===S.terrain3DGeneration)showTerrain3D();}).catch(()=>{if(generation===S.terrain3DGeneration)terrain3DFailed();});
      if(S.dataset==="terrain"&&S.mode==="3d"){
        if(!S.terrain3DVisible)controller.setCamera({...S.terrain3DCamera,...terrainCamera2D()});
        controller.show();controller.resize();
      }else controller.hide();
    }).catch(()=>{if(generation===S.terrain3DGeneration)terrain3DFailed();}).finally(()=>{if(S.terrain3DInit===pending)S.terrain3DInit=null;});
    S.terrain3DInit=pending;
    return pending;
  }
  async function setTerrainMode(mode, push = true) {
    if(S.dataset!=="terrain"||!["2d","3d"].includes(mode))return;
    if(mode===S.mode)return;
    if(mode==="2d")hideTerrain3D();
    S.mode=mode;S.terrain3DError=false;
    if(mode==="3d"&&!S.terrain3DVisible&&!S.terrain3D)S.terrain3DStatus={state:"loading"};
    if(mode==="3d")clearLowground();
    renderPanel();if(push)syncURL();
    if(mode==="2d")drawTerrain();
    await syncTerrainView();
  }
  function recordsContent() {
    if (publicAggregate()) return publicAggregateView("list");
    if (["flood", "terrain"].includes(S.dataset)) return overviewContent();
    if (S.dataset === "popgrid") return popVillageTableHTML();
    if (
      [
        "overview",
        "villages",
        "population",
        "municipality",
        "election",
      ].includes(S.dataset)
    ) {
      const q = S.search.toLowerCase();
      return (
        searchInput(true) +
        `<div class="area-list">${areaRows(
          boundaries()
            .filter(
              (a) => S.scope.type === "municipality" || a.id === S.scope.id,
            )
            .filter((a) =>
              [a.label, a.name, a.number].join(" ").toLowerCase().includes(q),
            ),
          S.dataset === "population" ? "population" : "houses",
        )}</div>`
      );
    }
    if (S.dataset === "properties" && S.cache.has(dataset().geojson)) return propertyListHTML();
    if (S.dataset === "negotiate" && S.cache.has(dataset().geojson)) return negotiateListHTML();
    if (S.dataset === "agriwatch" && S.cache.has(dataset().geojson)) return agriWatchListHTML();
    if (S.dataset === "portfolio") return ownerListHTML();
    if (dataset().geojson && !S.cache.has(dataset().geojson))
      return notice(
        text("กำลังเปิดรายการ", "Loading records"),
        text(
          "ข้อมูลชั้นนี้ยังโหลดไม่ครบ ลองอีกครั้งเมื่อแผนที่พร้อม",
          "This layer is still loading. Retry once the map is ready.",
        ),
      );
    const lf = activeListFilter();
    const q = S.search.trim().toLowerCase();
    const list = currentFeatures().filter((f) =>
      (!lf || lf.test(f.properties)) &&
      (!q || searchText(f).includes(q)),
    );
    if (lf?.sort) list.sort(lf.sort);
    else if (CHORO_LAYERS.has(S.dataset)) list.sort((a, b) => (layerValue(b) ?? -Infinity) - (layerValue(a) ?? -Infinity));
    return (
      searchInput() +
      (lf ? `<div class="filter-row"><span class="flag-chip">${esc(text(...lf.label))}</span><button type="button" class="quiet" data-clear-filter>${text("ล้างตัวกรอง", "Clear filter")}</button></div>` : "") +
      `<div class="section-title"><h2>${text("รายการในขอบเขต", "Records in this boundary")}</h2><span>${num(list.length)} ${text("รายการ", list.length === 1 ? "record" : "records")}</span></div><div class="area-list">${list
        .slice(0, S.page)
        .map(
          (f) =>
            `<button class="area-row" data-record="${esc(f.properties.id)}"><span class="area-name">${esc(featureTitle(f))}<span class="area-meta">${lf === LIST_FILTERS.fixes ? (() => { const r = taxRow(f.properties.id); return esc(text(`ตามข้อเสนอ +${fixed(r.new70 - r.old70, 2)} บาท (จาก ${fixed(r.old70, 2)})`, `with fixes +${fixed(r.new70 - r.old70, 2)} THB (from ${fixed(r.old70, 2)})`)) + " · "; })() : lf === LIST_FILTERS.titlesets || lf === LIST_FILTERS.titleoffroll ? (() => { const u = buildingUnit(f.properties), ids = S.parcelTax.buildingGroups.get(u.id) || [], g = setOf(f.properties), off = setOffRoll(f.properties); return esc(text(`ชุด ${ids.length} โฉนด ${ids.map(codeOf).join(", ")}${g ? ` · ปี 2569 ${fixed(g.assessed69, 2)} · ปี 2570 ${fixed(g.new70, 2)} บาท` : ""}${off ? ` · ยังจับคู่กับบัญชีไม่ได้ ${off} โฉนด` : ""}`, `${ids.length} titles ${ids.map(codeOf).join(", ")}${g ? ` · 2569 ${fixed(g.assessed69, 2)} · 2570 ${fixed(g.new70, 2)} THB` : ""}${off ? ` · ${off} not matched to the roll` : ""}`)) + " · "; })() : featureLines(f)[0] ? featureLines(f)[0] + " · " : ""}${esc(villageNamesOf(f).join(" · ") || text("ยังไม่ระบุหมู่บ้าน", "village not assigned"))}${f.properties.villageIds?.length > 1 ? " · " + text("อยู่บนเส้นแบ่งหลายหมู่บ้าน", "on a village dividing line") : ""}</span></span><span aria-hidden="true">›</span></button>`,
        )
        .join(
          "",
        )}</div>${!list.length ? `<div class="empty-state"><h3>${text(S.search ? "ไม่พบรายการที่ค้นหา" : "ไม่พบรายการจากชั้นนี้ในขอบเขต", S.search ? "No matching records" : "No mapped records in this boundary")}</h3><p>${text("ไม่พบในข้อมูลที่ได้รับ ไม่ได้แปลว่าในพื้นที่จริงไม่มี", "Not found in the supplied data; this does not mean none exist on the ground.")}</p></div>` : ""}${list.length > S.page ? `<button class="more-button" data-more>${text("ดูเพิ่มอีก 60 รายการ", "Show 60 more")}</button>` : ""}<p class="inline-note">${text("รายการที่อยู่บนเส้นแบ่งจะเห็นได้ในหลายหมู่บ้าน ไม่ใช่รายการซ้ำที่ต้องลบ", "Items on a dividing line appear in several villages; they are not duplicates to delete.")}</p><button class="more-button" data-export>${ui("csv", 18)}${text("ดาวน์โหลดรายการที่ค้นหา · CSV", "Download matching records · CSV")}</button>`
    );
  }
  function popVillageTableHTML() {
    const v = S.popStructure?.villages || {};
    const rows = S.metadata.villages.map((x) => ({ x, r: v[x.id] })).filter((o) => o.r && o.r.t);
    const cell = (n) => (n === "<5" || (n > 0 && n < 5) ? "<5" : num(n));
    return `<div class="section-title"><h2>${text("รายหมู่บ้าน (จากรายชื่อในแบบสำรวจ)", "By village (from survey member lists)")}</h2></div><table class="data-table"><thead><tr><th>${text("หมู่บ้าน", "Village")}</th><th class="num">${text("คน", "People")}</th><th class="num">${text("เด็ก", "Children")}</th><th class="num">15–42</th><th class="num">42+</th><th class="num">${text("บ้านที่มีรายชื่อ", "Listed homes")}</th></tr></thead><tbody>${rows.map(({ x, r }) => `<tr><td><button type="button" data-scope="${esc(x.id)}">${esc(villageLabel(x))}</button></td><td class="num">${cell(r.t)}</td><td class="num">${cell(r.c)}</td><td class="num">${cell(r.a)}</td><td class="num">${cell(r.o)}</td><td class="num">${num(r.hh)} / ${num(r.pts)}</td></tr>`).join("")}</tbody></table><p class="small-note">${text("บ้านที่มีรายชื่อ / หมุดสำรวจทั้งหมด บอกว่าตัวเลขครอบคลุมแค่ไหน", "Listed homes / all survey points shows how complete the figures are")}</p>`;
  }
  const villageNamesOf = (f) => (f.properties.villageIds || []).map((id) => {
    const v = S.metadata.villages.find((x) => x.id === id);
    return v ? (S.lang === "en" ? `Village ${v.number}` : v.label) : id;
  });
  /* Search text of a record: its published values plus the names of the villages it lies in (Thai and English). */
  const villageSearchCache = new Map();
  function searchText(f) {
    const ids = (f.properties.villageIds || []).join(",");
    let v = villageSearchCache.get(ids);
    if (v == null) {
      v = (f.properties.villageIds || []).map((id) => {
        const x = S.metadata.villages.find((y) => y.id === id);
        return x ? `${x.label} village ${x.number} หมู่ ${x.number}` : "";
      }).join(" ").toLowerCase();
      villageSearchCache.set(ids, v);
    }
    const p = f.properties;
    const en = S.lang === "en" ? " " + [p.type, p.use, p.material].map((x) => (x && SURVEY_EN[x]) || "").join(" ").toLowerCase() : "";
    return JSON.stringify(p).toLowerCase() + " " + v + en;
  }
  function searchInput(boundaryList = false) {
    const ph = boundaryList
      ? ["ค้นหาชื่อหรือเลขหมู่บ้าน", "Search a village name or number"]
      : ({
          taxmap: ["ค้นหารหัสแปลง หรือชื่อหมู่บ้าน", "Search a parcel code or village"],
          properties: ["ค้นหารหัสทรัพย์สิน รหัสแปลง หรือรหัสเจ้าของ", "Search a property, parcel or owner code"],
          businesses: ["ค้นหาชื่อธุรกิจ หรือชื่อหมู่บ้าน", "Search a business name or village"],
          appraisal: ["ค้นหารหัสแปลง หรือชื่อหมู่บ้าน", "Search a parcel code or village"],
          parcels: ["ค้นหารหัสแปลง หรือชื่อหมู่บ้าน", "Search a parcel code or village"],
          buildings: ["ค้นหาบ้านเลขที่ ประเภทอาคาร หรือชื่อหมู่บ้าน", "Search a house number, building type or village"],
          houses: ["ค้นหาบ้านเลขที่ หรือชื่อหมู่บ้าน", "Search a house number or village"],
          popgrid: ["ค้นหาชื่อหมู่บ้าน", "Search a village"],
          roads: ["ค้นหาชื่อถนน หรือชื่อหมู่บ้าน", "Search a road name or village"],
        }[S.dataset] || ["ค้นหาชื่อสถานที่ หรือชื่อหมู่บ้าน", "Search a place name or village"]);
    return `<label class="search-field list-search"><span class="sr-only">${text("ค้นหารายการ", "Search records")}</span>${ui("search", 20)}<input type="search" id="record-search" placeholder="${esc(text(...ph))}" value="${esc(S.search)}"></label>`;
  }
  function sourcesContent() {
    if (publicAggregate()) return publicAggregateView("source");
    if (S.dataset === "terrain") return terrainSources();
    const d = dataset();
    // Layers rebuilt from the 19 Oct files list those files instead of the 5 Oct folders they replaced.
    const sourceFolders =
      S.dataset === "overview"
        ? S.catalog.folders
        : NEW_LAYERS_19OCT.has(S.dataset) ? [] : S.catalog.folders.filter((f) =>
            (d.sourceFolders || []).includes(f.folder || f.title || f.name),
          );
    const notes = plainCaveatList(d);
    return `<section class="panel-section"><div class="section-title"><h2>${text("ข้อควรรู้ก่อนใช้", "Know before you use it")}</h2>${Missions?.status[d.status] ? `<span class="status-label">${esc(text(...Missions.status[d.status]))}</span>` : ""}</div><ul class="notes-list">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>${["taxmap", "appraisal", "buildings"].includes(S.dataset) ? `<p class="small-note"><a href="https://github.com/montri-th/sila/blob/main/reference/tax-map-method.md" target="_blank" rel="noopener">${text("อ่านวิธีจับคู่และวิธีคิดภาษีฉบับเต็ม", "Read the full matching and tax method")}</a></p>` : ""}</section><div class="section-title"><h2>${text("ข้อมูลนี้มาจากไหน", "Where this data comes from")}</h2></div><dl class="source-dl"><dt>${text("ตัวเลขนับอะไร", "What is counted")}</dt><dd>${esc(text(...(hints[S.dataset] || ["จำนวนรายการจากไฟล์ ไม่ใช่จำนวนคนหรือครัวเรือนที่ยืนยันแล้ว", "Rows from the files, not verified people or households"])))}</dd><dt>${text("นับในพื้นที่ไหน", "Which area is counted")}</dt><dd>${esc(scopeLabel())} · ${["flood", "terrain"].includes(S.dataset) ? text("ชุดนี้ยังไม่ได้ผูกกับพื้นที่บนแผนที่", "This dataset is not tied to map areas yet") : text("นับสิ่งที่อยู่ในเส้นขอบเขต ไม่ขึ้นกับการเลื่อนแผนที่", "Counts what lies inside the boundary, regardless of map panning")}</dd><dt>${text("เทศบาลส่งข้อมูลเมื่อ", "Received from the municipality")}</dt><dd>${NEW_LAYERS_19OCT.has(S.dataset) ? text("19 ตุลาคม 2569", "19 October 2026") : text("5 ตุลาคม 2569", "5 October 2026")} · ${text("ไม่ใช่วันที่สำรวจ", "not the survey date")}</dd><dt>${text("ตำแหน่งบนแผนที่", "Map positions")}</dt><dd>${["flood", "terrain"].includes(S.dataset) ? text("ยังไม่มีตำแหน่งที่ตรวจแล้ว", "No checked positions yet") : (["parcels", "taxmap", "appraisal", "houses", "popgrid"].includes(S.dataset) ? text("อ่านเป็น Indian 1975 UTM 48N (EPSG:24048) แล้วแปลงเป็น WGS84 · รอเทศบาลรับรอง", "Read as Indian 1975 UTM 48N (EPSG:24048), shown in WGS84 · awaiting municipal confirmation") : S.dataset === "buildings" ? text("รูปอาคารส่งมาเป็น WGS84", "Footprints supplied in WGS84") : d.sourceCRS?.join(", ")) || text("ตามไฟล์ขอบเขตที่ได้รับ", "Supplied boundary files")} · ${text("ยังไม่ได้ตรวจความแม่นยำในพื้นที่จริง", "field accuracy not yet checked")}</dd></dl>${!sourceFolders.length && SOURCE_FILES_19OCT[S.dataset] ? `<section class="panel-section" style="margin-top:24px"><div class="section-title"><h2>${text("ไฟล์ต้นทาง", "Source files")}</h2></div><ul class="notes-list">${SOURCE_FILES_19OCT[S.dataset].map((x) => `<li>${esc(text(...x))}</li>`).join("")}</ul><p class="small-note">${text("ไฟล์ต้นฉบับมีข้อมูลส่วนบุคคล จึงไม่เปิดให้ดาวน์โหลดจากหน้านี้", "The original files hold personal data, so they are not downloadable here.")}</p></section>` : ""}<section class="panel-section" style="margin-top:24px"${!sourceFolders.length && !d.sourceUrl ? " hidden" : ""}><div class="section-title"><h2>${text("โฟลเดอร์ต้นทาง", "Source folders")}</h2><span>${num(sourceFolders.length)}</span></div>${sourceFolders.map((f) => `<a class="source-folder" target="_blank" rel="noopener" href="${esc(f.url || f.sourceUrl || "https://drive.google.com/drive/folders/" + f.id)}">${esc(f.folder || f.title || f.name)}<span>${num(f.fileCount ?? f.componentCount ?? f.inventoryComponents ?? f.files?.length)} ${text("ไฟล์ประกอบ", "file components")} · ${text("เปิดใน Google Drive", "open in Google Drive")}</span></a>`).join("")}${!sourceFolders.length && d.sourceUrl ? `<a class="mini-action" href="${esc(d.sourceUrl)}" target="_blank" rel="noopener">${text("เปิดต้นทาง", "Open source")}</a>` : ""}</section>${S.dataset === "flood" ? S.docs.documents.map((x) => `<article class="document-card"><h3>${esc(x.title)}</h3><p>${text("เอกสารประกอบการวางแผน ไม่ใช่สถานการณ์ปัจจุบัน", "Planning document, not current conditions")}</p><a href="${esc(x.url)}" target="_blank" rel="noopener">${text("อ่านเอกสารต้นฉบับ", "Read original document")}</a></article>`).join("") : ""}<div id="context-actions"></div>`;
  }
  const NEW_LAYERS_19OCT = new Set(["parcels", "taxmap", "properties", "appraisal", "buildings", "houses", "popgrid"]);
  const PARCEL_FILE = ["ชั้นแปลงที่ดิน parcel (Shapefile) ที่เทศบาลส่ง 19 ต.ค. 2569", "Parcel layer (Shapefile) received 19 Oct 2026"];
  const LTAX_FILE = ["ไฟล์ส่งออกจาก LTAX ปีภาษี 2569: ภ.ด.ส.1, 3, 7 บัญชีเลขประเมิน บัญชีชำระ และบัญชีลูกหนี้", "LTAX exports for tax year 2569: PDS 1, 3 and 7, the assessment, payment and debtor registers"];
  const PDS63_FILE = ["บัญชีรายการที่ดินและสิ่งปลูกสร้าง ภ.ด.ส.3 ปี 2563 (Excel) ที่เจ้าของงานส่งมา 20 ต.ค. 2569", "2563 land and building inventory list, PDS 3 (Excel), supplied by the project owner on 20 Oct 2026"];
  const SURVEY_FILE = ["หมุดแบบสำรวจอาคาร Building_point (Shapefile) ที่เทศบาลส่ง 19 ต.ค. 2569", "Building survey points Building_point (Shapefile) received 19 Oct 2026"];
  const SOURCE_FILES_19OCT = {
    parcels: [PARCEL_FILE], taxmap: [PARCEL_FILE, LTAX_FILE, PDS63_FILE], properties: [PARCEL_FILE, LTAX_FILE, PDS63_FILE], appraisal: [PARCEL_FILE, LTAX_FILE],
    businesses: [["ทะเบียนผู้ประกอบการจดทะเบียนภาษีมูลค่าเพิ่ม กรมสรรพากร (data.go.th) ดาวน์โหลด 17 ต.ค. 2569", "VAT registrant list, Revenue Department (data.go.th), downloaded 17 Oct 2026"], SURVEY_FILE],
    buildings: [["รูปอาคาร Building (Shapefile) ที่เทศบาลส่ง 19 ต.ค. 2569", "Building footprints (Shapefile) received 19 Oct 2026"], SURVEY_FILE, LTAX_FILE],
    houses: [SURVEY_FILE], popgrid: [SURVEY_FILE],
  };
  const NEW_LAYER_NOTES = {
    taxmap: [
      ["ภาษีปี 2569 มาจาก ภ.ด.ส.7 บัญชีเลขประเมิน บัญชีชำระ และลูกหนี้ ที่เทศบาลส่งเมื่อ 19 ต.ค. 2569 ไม่แสดงชื่อ เลขบัตร หรือเลขผู้เสียภาษีของเทศบาล ใช้รหัสแทน", "2569 tax comes from PDS 7, the assessment, payment and debtor registers received 19 Oct 2026. Names, ID numbers and municipal taxpayer numbers are not shown; a code is used instead."],
      ["ภาษีปี 2570 เป็นค่าคาดการณ์จากกฎหมายและข้อมูลที่มี ไม่ใช่ใบแจ้งประเมิน ก่อนใช้กับผู้เสียภาษีต้องตรวจเอกสารสิทธิ การใช้ประโยชน์จริง และสิทธิยกเว้นทีละราย", "2570 figures are estimates from the law and the data on hand, not assessments. Check title, actual use and exemptions case by case before acting."],
      ["ปี 2570 วิธีเดิม คือภาษีปี 2569 ของแปลง ปรับตามสัดส่วนที่ภาษีตามกฎหมายเปลี่ยนเมื่อราคาที่ดินเปลี่ยน ส่วนปี 2570 ตามข้อเสนอ คือวิธีเดิมบวกผลต่างจากข้อเสนอที่เลือก ส่วนต่างระหว่างสองค่าจึงเป็นผลของข้อเสนอล้วน ๆ", "2570 current method = the parcel’s 2569 tax scaled by how the legal tax changes with land prices; 2570 with fixes = current method plus the difference the selected fixes make, so the gap is purely the effect of the fixes."],
      ["เจ้าของมาจากบัญชี ภ.ด.ส.3 ปี 2563 สมมติว่ายังไม่เปลี่ยน จึงคิดรวมแปลงของเจ้าของเดียวกัน (ม.40 ม.41 ม.42 วรรคสอง) ได้ ชื่อเจ้าของไม่แสดง ใช้รหัสสุ่ม · สถานะการชำระรายแปลงยังแสดงเฉพาะโฉนดในบัญชีลูกหนี้ปี 2569", "Owners come from the 2563 PDS 3 list, assumed unchanged, so one owner’s parcels can be combined (s.40, s.41, s.42 para 2). Owner names are not shown; random codes are used. Payment status per parcel still exists only for titles on the 2569 debtor list."],
      ["แปลงที่แผนที่ไม่มีเลขโฉนด จับคู่กับบัญชีปี 2569 ผ่านบัญชีปี 2563 ได้อีก 8,240 แปลง (รหัสแปลงและเนื้อที่ตรงกับปี 2563 แล้วใช้เลขโฉนดของปี 2563) ถ้าบ้านเลขที่บนแปลงขัดกับบัญชีจะไม่จับคู่", "8,240 more parcels without a deed number on the map are matched to the 2569 roll through the 2563 list (map code and area match 2563, then its deed number); a parcel whose house numbers contradict the roll is not matched."],
      ["ภาษี 0 บาทแสดงเฉพาะโฉนดที่บัญชีพิสูจน์ว่ายกเว้นทั้งหมด แปลงที่ไม่พบในบัญชีแสดงเป็นลายเส้นเทา ไม่ใช่ศูนย์", "A 0 THB tax appears only where the roll proves the title fully exempt; parcels not on the roll show grey hatching, not zero."],
    ],
    properties: [
      ["ทรัพย์สิน = แปลงที่มีเขตติดกันอย่างน้อย 1 เมตรของเจ้าของเดียวกันในบัญชี ภ.ด.ส.3 ปี 2563 พร้อมอาคารบนแปลงเหล่านั้น แปลงเดียวที่มีเจ้าของนับเป็นทรัพย์สินของตัวเอง", "Property = parcels of one owner in the 2563 PDS 3 list sharing at least 1 m of boundary, with the buildings on them; a single owned parcel is its own property."],
      ["เจ้าของสมมติว่ายังไม่เปลี่ยนตั้งแต่ปี 2563 โฉนดที่ขาย ตกทอด หรือแบ่งแยกหลังจากนั้นอาจมีเจ้าของผิด ตรวจโฉนดก่อนดำเนินการ", "Owners are assumed unchanged since 2563; titles sold, inherited or subdivided since then can carry the wrong owner. Check the deed before acting."],
      ["เงินที่เพิ่มได้ = ปี 2570 ตามข้อเสนอที่เลือก ลบ ปี 2570 วิธีเดิม รวมเฉพาะแปลงที่มีภาษีปี 2569 เป็นค่าคาดการณ์ ไม่ใช่ใบแจ้งประเมิน", "Amount added = 2570 with the selected fixes minus the 2570 current method, over the parcels with a 2569 tax; an estimate, not an assessment."],
    ],
    businesses: [
      ["ปักหมุดนิติบุคคลทุกรายที่หาตำแหน่งได้ ตามที่เจ้าของงานตัดสินใจ 20 ต.ค. 2569 ไม่แสดงผู้ประกอบการที่เป็นบุคคลธรรมดา ไม่แสดงเลขผู้เสียภาษีหรือที่อยู่", "Every juristic person that could be placed is pinned (owner decision, 20 Oct 2026). Sole proprietors, tax IDs and addresses are not shown."],
      ["ตำแหน่งมาจากบ้านเลขที่และหมู่ในทะเบียน VAT ที่ตรงกับหมุดแบบสำรวจ หรือเลขโฉนดในที่อยู่ จุดที่จับคู่ด้วยบ้านเลขที่อย่างเดียวอ่อนกว่า · นิติบุคคลอีกราว 400 รายยังหาตำแหน่งไม่ได้", "Positions come from the VAT house number and moo matched to a survey point, or a deed number in the address; number-only matches are weaker · about 400 more juristic registrants could not be placed yet."],
      ["ธุรกิจที่ตั้งอยู่บนทรัพย์สินไม่จำเป็นต้องเป็นเจ้าของที่ดิน ทะเบียน VAT ไม่บอกประเภทกิจการ และอาจมีรายที่เลิกกิจการแล้ว", "A business located on a property is not necessarily its owner. The VAT list gives no business type and may include businesses that have closed."],
    ],
    appraisal: [["ราคาประเมินเป็นราคาที่เทศบาลใช้ในบัญชีปี 2569 แปลงที่ยังจับคู่กับบัญชีไม่ได้ไม่แสดงสี และไม่ได้แปลว่าราคาเป็นศูนย์", "Prices are those on the municipality’s 2569 roll. Unmatched parcels have no colour; that does not mean a zero price."]],
    popgrid: [
      ["นับจากรายชื่อสมาชิกในแบบสำรวจอาคาร 19 ต.ค. 2569 ซึ่งมีรายชื่อเพียงบางหลัง จึงไม่ใช่ประชากรทั้งหมด", "Counted from member lists in the 19 Oct 2026 building survey; only some houses have lists, so this is not the full population."],
      ["เด็กต่ำกว่า 15 ปีดูจากคำนำหน้า เด็กชาย/เด็กหญิง อายุ 15–42 และ 42 ปีขึ้นไปประมาณจากประเภทเลขบัตรประชาชน (เกิดก่อนหรือหลังปี 2527)", "Children under 15 come from the titles เด็กชาย/เด็กหญิง (boy/girl). The 15–42 and 42+ bands are estimated from the national ID type (born before or after 1984)."],
      ["ช่องที่มีคนน้อยกว่า 10 คนหรือบ้านน้อยกว่า 3 หลังปิดตัวเลขทั้งหมด กลุ่มย่อยที่มี 1–4 คนแสดงเป็น <5 และปิดกลุ่มอื่นเพิ่มจนคำนวณย้อนจากยอดรวมไม่ได้ว่า <5 คือเท่าใด หรือกลุ่มที่ปิดมีน้อยกว่า 5 คน ไม่มีข้อมูลรายหลังบนเว็บนี้", "Cells with under 10 people or 3 households are hidden entirely. Groups of 1–4 show as <5, and more groups are hidden until neither a <5 nor a hidden group can be worked out from the totals. There is no per-house data on this site."],
    ],
    buildings: [["อาคารที่อยู่บนหลายแปลง: แปลงที่สองมีหลังคาตั้งแต่ 25% และ 20 ตร.ม. แผนที่แปลงกับรูปอาคารมาจากคนละชุดและอาจเหลื่อมกัน จึงเป็นสัญญาณให้ตรวจ ไม่ใช่ข้อสรุป", "Spanning parcels: a second parcel holds at least 25% and 20 m² of the roof. The parcel map and footprints come from different sources and can be offset, so this is a signal to check, not a finding."],
      ["มูลค่าอาคารประมาณจาก พื้นที่หลังคา × จำนวนชั้น × ราคากรมธนารักษ์ขอนแก่น 2566–2569 หักค่าเสื่อม ใช้จัดลำดับตรวจเท่านั้น", "Estimated value = roof area × floors × Khon Kaen Treasury price 2566–2569 less depreciation; for ordering checks only."],
      ["บ้านเลขที่และจำนวนทะเบียนบ้านต่ออาคารมาจากหมุดแบบสำรวจที่อยู่ในรูปอาคาร หรืออยู่ติดอาคารไม่เกิน 5 ม. ในแปลงเดียวกัน ชั้นรูปอาคารเองแทบไม่มีบ้านเลขที่ (7 จาก 38,749 หลัง) ไม่พบหมุด ไม่ได้แปลว่าไม่มีคนอยู่", "House numbers and registrations per building come from survey points inside the outline, or within 5 m on the same parcel. The footprint layer itself has almost no house numbers (7 of 38,749). No point found does not mean nobody lives there."]],
    houses: [["หมุดจากแบบสำรวจอาคารที่เทศบาลส่ง 19 ต.ค. 2569 เผยเฉพาะบ้านเลขที่และผลสำรวจอาคาร ไม่มีชื่อ เลขบัตร รหัสประจำบ้าน รูปถ่าย หรือหมายเหตุ", "Points from the building survey received 19 Oct 2026. Only house numbers and building survey fields are published: no names, ID numbers, house-register codes, photos or remarks."],
      ["ผูกหมุดกับรูปอาคารด้วยตำแหน่งเท่านั้น: อยู่ในรูปอาคาร หรืออยู่ติดอาคารไม่เกิน 5 ม. และอยู่ในแปลงเดียวกัน หมุดที่เหลือแสดงว่ายังไม่มีรูปอาคาร พร้อมระยะถึงรูปที่ใกล้สุด", "Points are joined to footprints by position only: inside the outline, or within 5 m on the same parcel. Other points show as having no footprint, with the distance to the nearest outline."]],
  };
  function plainCaveatList(d) {
    const notes = [];
    for (const n of NEW_LAYER_NOTES[d.id] || []) notes.push(text(...n));
    if (d.id === "parcels") notes.push(...PARCEL_NOTES.map((n) => text(...n)));
    if (d.id === "population" || (d.id === "overview" && S.scope.type === "village" && scopeData()?.populationDiscrepancy)) notes.push(text("ยอดประชากรรวมกับชายรวมหญิงไม่เท่ากันที่หมู่ 11 (ต่างกัน 600 คน) รอเทศบาลยืนยันว่าใช้ค่าไหน", "Total population and male + female differ in village 11 (by 600); awaiting confirmation of which to use"));
    if (d.id === "flood") notes.push(text("แผน พ.ศ. 2564–2567 มี 16 จุด ยังไม่มีพิกัดที่ตรวจแล้ว และไม่ใช่ขอบเขตน้ำท่วมตอนนี้", "The 2021–2024 plan lists 16 sites without checked positions; it is not a current flood extent"));
    if (d.id === "overview") notes.push(text("บ้านหรืออาคารที่อยู่บนเส้นแบ่งอาจถูกนับในหลายหมู่บ้าน จึงไม่ควรบวกยอดหมู่บ้านเป็นยอดเทศบาล", "Houses or buildings on a dividing line may count in several villages, so village totals should not be added up as the city total"));
    // The dataset hint is printed under "What is counted", so it is not repeated in this list.
    const hint = hints[d.id] ? text(...hints[d.id]) : null;
    for (const line of plainCaveats(d)) if (!notes.includes(line) && line !== hint) notes.push(line);
    if (!notes.length) notes.push(text("วันที่สำรวจ ความครบถ้วน และเจ้าของข้อมูลยังต้องยืนยันกับเทศบาล", "Survey date, completeness and data ownership still need confirming with the municipality"));
    return notes;
  }
  function plainCaveats(d) {
    const notes = [];
    if (hints[d.id]) notes.push(text(...hints[d.id]));
    if (d.nullOrUnusableGeometryCount)
      notes.push(
        text(
          `มี ${num(d.nullOrUnusableGeometryCount)} รายการที่ไม่มีตำแหน่งให้แสดงบนแผนที่`,
          `${num(d.nullOrUnusableGeometryCount)} source records have no usable geometry`,
        ),
      );
    if (d.displayRepairCount)
      notes.push(
        text(
          `ปรับรูป ${num(d.displayRepairCount)} รายการให้แสดงบนแผนที่ได้ โดยเก็บต้นฉบับไว้`,
          `${num(d.displayRepairCount)} geometries were repaired for display; source retained`,
        ),
      );
    if (d.id === "election" || S.boundary === "election")
      notes.push(
        text(
          "เขตเลือกตั้งเป็นขอบเขตทดลองที่ต่อจากเส้นในไฟล์ ไม่ใช่ขอบเขตทางกฎหมายที่รับรองแล้ว",
          "Electoral polygons are derived for display, not legally certified",
        ),
      );
    if (!notes.length)
      notes.push(
        text(
          "วันที่สำรวจ ความครบถ้วน และเจ้าของข้อมูลยังต้องยืนยันกับเทศบาล",
          "Survey date, completeness and data ownership still need confirming with the municipality",
        ),
      );
    return notes;
  }
  function renderPanel() {
    if (!S.ready) return;
    renderHeader();
    renderSummary();
    $("tab-content").innerHTML =
      S.tab === "overview"
        ? overviewContent()
        : S.tab === "list"
          ? recordsContent()
          : sourcesContent();
    mountCharts();
    if ($("context-actions")) {
      window.SilaContextActions.render({
      mount: $("context-actions"),
      language: S.lang,
      datasetId: S.dataset,
      datasetLabel: label(S.dataset),
      scopeId: S.scope.id,
      scopeLabel: scopeLabel(),
      municipality: text("เทศบาลเมืองศิลา", "Sila Municipality"),
      sourceDate: publicAggregate() ? S.publicSummary.sourceReceivedAt : S.dataset === "terrain" ? S.terrainSource?.inspected_date || "2026-10-19" : dataset()?.status === "source_supplied_20261019" ? "2026-10-19" : "2026-10-05",
    });
    }
    renderRecord();
  }
  function renderRecord() {
    const el = $("record-detail");
    if (!S.record && S.choice) {
      const c = S.choice,
        rows = c.features.slice(0, c.page),
        area = c.kind === "areas";
      el.hidden = false;
      el.innerHTML = `<article class="record-card"><div class="record-title"><div><small>${text("เลือกจากพื้นที่ที่คลิก", "Choose from the clicked area")}</small><h2>${num(c.features.length)} ${area ? text("ขอบเขต", "areas") : text("รายการ", "records")}</h2></div><button class="quiet" data-close-record>${text("ปิด", "Close")}</button></div><p>${esc(c.reason)}</p><div class="record-choices">${rows.map((f) => `<button class="record-choice" ${area ? "data-scope" : "data-record"}="${esc(f.properties.id)}"><strong>${esc(area ? f.properties.label || f.properties.id : featureTitle(f))}</strong>${!area && featureLines(f)[0] ? `<span>${featureLines(f)[0]}</span>` : ""}</button>`).join("")}</div>${rows.length < c.features.length ? `<button class="more-button" data-choice-more>${text("แสดงเพิ่ม", "Show more")} (${num(c.features.length - rows.length)})</button>` : ""}${!area ? `<button class="mini-action" data-focus-choice>${text("ซูมดูบริเวณรายการนี้", "Zoom to these records")}</button>` : ""}</article>`;
      return;
    }
    if (!S.record) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    const f = S.record;
    const rows = recordRows(f);
    const portfolio = S.dataset === "properties" ? propertyCardHTML(f) : S.dataset === "buildings" ? buildingTitlesHTML(f) : S.dataset === "houses" ? titleSetHTML(parcelAttr(f.properties.parcelId)?.bgrp, f.properties.parcelId) : ["taxmap", "appraisal", "negotiate", "agriwatch", "portfolio"].includes(S.dataset) ? portfolioHTML(f.properties.id) + titleSetHTML(parcelAttr(f.properties.id)?.bgrp, f.properties.id) + parcelBuildingsHTML(f.properties.id)
      + (parcelAttr(f.properties.id) ? `<div class="record-actions"><button type="button" class="mini-action" data-tool="tax-calculator" data-parcel="${esc(f.properties.id)}">${ui("calculator", 18)}${text("เปิดแปลงนี้ในเครื่องคิดภาษี", "Open this parcel in the tax calculator")}</button></div><p class="small-note">${esc(calculatorNote(f.properties.id))}</p>` : "") : "";
    el.hidden = false;
    const ext = externalActionsHTML(f);
    refreshStreetView(f);
    el.innerHTML = `<article class="record-card" tabindex="-1"><div class="record-title"><div><small>${esc(label(S.dataset))}</small><h2>${esc(featureTitle(f))}</h2></div><button class="quiet" data-close-record>${text("ปิด", "Close")}</button></div><dl class="record-dl">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>${recordFlags(f)}${portfolio}${ext}<div class="record-actions"><button class="mini-action" data-focus-record>${text("ซูมไปที่รายการนี้", "Zoom to this record")}</button>${recordLinks(f)}</div></article>`;
  }

  /* Building -> titles under its roof -> tax 2569 and 2570, and the set of titles likely taxed together (joined by one building:
     s.42 para 2 proxy; one owner and one use are assumed, not known, because the PDS files carry no owner per title). */
  const codeOf = (id) => S.parcelTax?.codes?.get(id) || `#${Number(String(id).slice(8))}`;
  function titleLine(id, share, current) {
    const r = taxRow(id), a = parcelAttr(id);
    const name = esc(text(`แปลง ${codeOf(id)}`, `Parcel ${codeOf(id)}`));
    const link = id === current ? `<strong>${name}</strong>` : `<button type="button" class="portfolio-link" data-goto="taxmap|${esc(id)}">${name}</button>`;
    const share_ = share != null ? esc(text(` · หลังคา ${Math.round(share * 100)}%`, ` · ${Math.round(share * 100)}% of the roof`)) : "";
    const val = !a ? text("ยังจับคู่กับบัญชีภาษีไม่ได้", "Not matched to the tax roll") : r?.assessed69 == null ? text("ยังไม่มีตัวเลขภาษี", "No tax figure")
      : text(`ปี 2569 ${money(r.assessed69, 2)} · ปี 2570 ${money(r.new70, 2)}`, `2569 ${money(r.assessed69, 2)} · 2570 ${money(r.new70, 2)}`);
    return `<li><span>${link}${share_}</span><span>${esc(val)}</span></li>`;
  }
  function titleSetHTML(gid, current, listed = []) {
    if (gid == null || !S.taxResult || !S.parcelTax?.buildingGroups) return "";
    const members = S.parcelTax.buildingGroups.get(gid) || [], g = S.taxResult.byGroup?.get(gid);
    if (members.length < 2) return "";
    const off = members.filter((id) => !parcelAttr(id)).length, gap = g ? g.combined70 - g.old70 : 0;
    const notes = [];
    if (g) notes.push(Math.abs(gap) < 1
      ? text("รวมหรือแยกโฉนดได้ภาษีเท่ากัน เพราะมูลค่ารวมของแต่ละประเภทการใช้ยังไม่ถึงขั้นถัดไปของอัตรา หรือยังอยู่ในเกณฑ์ยกเว้นบ้านหลังหลัก", "Combined or title by title, the tax is the same: the value per use type does not reach the next rate step, or stays within the main-home exemption")
      : text(`ถ้ารวมเป็นฐานเดียว ภาษีต่างจากคิดแยกโฉนด ${gap > 0 ? "+" : ""}${money(gap, 2)}`, `Combined into one base, the tax differs from title by title by ${gap > 0 ? "+" : ""}${money(gap, 2)}`));
    if (g && g.taxed < g.onRoll) notes.push(text(`${num(g.onRoll - g.taxed)} โฉนดในบัญชียังไม่มีตัวเลขภาษี จึงไม่อยู่ในยอดรวม`, `${num(g.onRoll - g.taxed)} title(s) on the roll have no tax figure and are not in the totals`));
    if (off) notes.push(text(`${num(off)} โฉนดในชุดนี้ยังจับคู่กับบัญชีภาษีไม่ได้ อาจไม่อยู่ในบัญชี หรือจับคู่ไม่ได้เพราะแผนที่แปลงไม่มีเลขโฉนดหรือมีโฉนดที่เป็นไปได้หลายใบ ควรตรวจว่าตกสำรวจหรือไม่`, `${num(off)} title(s) in this set are not matched to the tax roll: either not on it, or not matchable because the parcel map has no deed number or several candidate deeds; check whether they were missed`));
    notes.push(text("รวมฐานได้เมื่อเป็นเจ้าของเดียวกันและใช้ประโยชน์ประเภทเดียวกัน (ม.42 วรรคสอง) ไฟล์ ภ.ด.ส. ที่ได้รับไม่มีชื่อเจ้าของ ต้องตรวจโฉนดก่อนใช้", "Bases combine only for one owner and one use type (s.42 para 2); the PDS files carry no owner, so check the titles before use"));
    const dl = g ? `<dl class="record-dl"><dt>${text("ปี 2569 ที่ประเมิน (บัญชีคิดแยกโฉนด)", "2569 assessed (the roll taxes each title)")}</dt><dd>${esc(money(g.assessed69, 2))}</dd>`
      + `<dt>${text("ปี 2570 วิธีเดิม แยกโฉนด", "2570 current method, title by title")}</dt><dd>${esc(money(g.old70, 2))}</dd>`
      + `<dt>${text("ปี 2570 ถ้ารวมเป็นฐานเดียว", "2570 combined into one base")}</dt><dd>${esc(money(g.combined70, 2))}</dd>`
      + `<dt>${text("ปี 2570 ตามข้อเสนอที่เลือก", "2570 with the selected fixes")}</dt><dd>${esc(money(g.new70, 2))}</dd></dl>` : "";
    // The member list is left out when it would only repeat the titles already listed under the building.
    const same = listed.length && members.every((id) => listed.includes(id));
    return `<div class="title-set"><h4>${esc(text(`ชุดโฉนดที่น่าจะคิดภาษีรวมกัน · ${members.length} โฉนด (อาคารหลังเดียวกันคร่อม)`, `Titles likely taxed together · ${members.length} (joined by one building)`))}</h4>${same ? `<p class="small-note">${text("ชุดนี้คือโฉนดใต้อาคารด้านบน", "This set is the titles listed above")}</p>` : `<ul class="title-list">${members.map((id) => titleLine(id, null, current)).join("")}</ul>`}${dl}${notes.map((x) => `<p class="small-note">${esc(x)}</p>`).join("")}</div>`;
  }
  function buildingTitlesHTML(f) {
    const p = f.properties, ids = p.parcelIds || [];
    const head = `<div class="record-section"><h3>${text("โฉนดใต้อาคารและภาษี", "Titles under the building and their tax")}</h3>`;
    if (!S.taxResult) return head + `<p class="small-note">${text("ยังเปิดข้อมูลภาษีไม่ได้", "Tax data is not open yet")}</p></div>`;
    if (!ids.length) return head + `<p class="small-note">${text("อาคารนี้ไม่ตรงแปลงใดในแผนที่แปลง", "No parcel on the parcel map lies under this building")}</p></div>`;
    const u = buildingUnit(p);
    const lead = !u ? text("ยังจับคู่โฉนดใต้อาคารนี้กับบัญชีภาษีไม่ได้", "None of the titles under this building is matched to the tax roll")
      : u.kind === "group" ? text("อาคารนี้น่าจะคิดภาษีกับชุดโฉนดด้านล่าง", "This building is likely taxed with the set of titles below")
      : text(`อาคารนี้คิดภาษีกับแปลง ${codeOf(u.id)} ไม่พบโฉนดอื่นที่อาคารหลังเดียวกันคร่อมตามเกณฑ์`, `This building is taxed with parcel ${codeOf(u.id)}; no other title is joined to it by one building under the rule`);
    return head + `<ul class="title-list">${ids.map((id, i) => titleLine(id, p.parcelShares?.[i])).join("")}</ul><p class="small-note">${esc(lead)}</p>${u?.kind === "group" ? titleSetHTML(u.id, null, ids) : ""}`
      + `<p class="small-note">${text("ปี 2570 ใช้ค่าที่ตั้งไว้ในแถบสมมติและข้อเสนอที่เลือก", "2570 uses the slider assumptions and the selected fixes")}</p></div>`;
  }
  /* Parcel -> buildings on it (deed x footprint x house number). The footprint file is large, so it opens on request. */
  const BUILDINGS_PATH = () => dataset("buildings")?.geojson || "data/buildings.geojson";
  function parcelBuildingsHTML(parcelId) {
    const fc = S.cache.get(BUILDINGS_PATH());
    const head = `<div class="record-section" id="parcel-buildings" data-parcel="${esc(parcelId)}"><h3>${text("อาคารบนแปลงนี้", "Buildings on this parcel")}</h3>`;
    if (!fc) return head + `<p class="small-note">${text("เปิดรูปอาคารทุกหลังของเทศบาลเพื่อดูว่าแปลงนี้มีอาคารใด บ้านเลขที่อะไร และอยู่ในบัญชีหรือยัง (ไฟล์ใหญ่ ใช้เวลาสักครู่)", "Open the building footprints to see which buildings stand on this parcel, their house numbers and roll status (large file, takes a moment).")}</p><div class="record-actions"><button type="button" class="mini-action" data-parcel-buildings="${esc(parcelId)}">${text("ดูอาคารบนแปลงนี้", "Show buildings on this parcel")}</button></div></div>`;
    const list = fc.features.filter((b) => b.properties.parcelIds?.includes(parcelId));
    if (!list.length) return head + `<p class="small-note">${text("ไม่พบรูปอาคารบนแปลงนี้", "No building footprint on this parcel")}</p></div>`;
    const items = list.slice(0, 20).map((b) => {
      const p = b.properties, g = rollGroup(p), main = p.parcelIds[0] === parcelId;
      const name = `${esc(sv(p.type) || text("อาคาร", "Building"))} #${esc(String(p.sourceRecord ?? ""))}${p.houseNumbers?.length ? ` · ${esc(text("บ้านเลขที่ ", "No. ") + houseNumbersText(p.houseNumbers, 3))}` : ""}`;
      const status = g ? text(...g.label) : text("ไม่ตรงแปลงใด", "No parcel match");
      return `<li><button type="button" class="portfolio-link" data-goto="buildings|${esc(p.id)}">${name}</button><span>${g ? `<span class="legend-chip" style="display:inline-block;vertical-align:middle;margin-right:4px;background:${catHex(g.color)}"></span>` : ""}${esc(status)}${main ? "" : esc(text(" · ส่วนใหญ่อยู่แปลงข้างเคียง", " · mostly on a neighbouring parcel"))}</span></li>`;
    }).join("");
    return head + `<ul class="portfolio-list parcel-buildings">${items}</ul>${list.length > 20 ? `<p class="small-note">${text(`และอีก ${num(list.length - 20)} หลัง`, `and ${num(list.length - 20)} more`)}</p>` : ""}<p class="small-note">${text("สถานะบัญชีผูกเมื่อบ้านเลขที่ในอาคารและโฉนดใต้อาคารตรงกับรายการในบัญชีสิ่งปลูกสร้าง", "Roll status links when the building’s house number and the title under it both match a building-roll entry")}</p></div>`;
  }
  async function showParcelBuildings(parcelId) {
    const box = document.getElementById("parcel-buildings");
    if (box) box.querySelector(".record-actions")?.replaceChildren(Object.assign(document.createElement("p"), { className: "small-note", textContent: text("กำลังเปิดรูปอาคาร…", "Opening building footprints…") }));
    try { await fetchJSON(BUILDINGS_PATH()); } catch (_) { toast(text("เปิดรูปอาคารไม่ได้ ลองใหม่อีกครั้ง", "Could not open the footprints; try again")); }
    const again = document.getElementById("parcel-buildings");
    if (again && again.dataset.parcel === parcelId) again.outerHTML = parcelBuildingsHTML(parcelId);
  }
  /* Cross-layer links on the record card: house point -> its footprint, footprint -> tax of the parcels under it. */
  function recordLinks(f) {
    const p = f.properties, out = [];
    if (S.dataset === "houses" && p.buildingId && dataset("buildings")) out.push(`<button class="mini-action" data-goto="buildings|${esc(p.buildingId)}">${text("ดูรูปอาคารหลังนี้", "Open this footprint")}</button>`);
    if (S.dataset === "buildings" && p.parcelIds?.length) {
      const code = codeOf;
      if (dataset("taxmap") && S.parcelTax) for (const id of p.parcelIds.slice(0, 3)) out.push(`<button class="mini-action" data-goto="taxmap|${esc(id)}">${esc(text(`ภาษีแปลง ${code(id)}`, `Tax of parcel ${code(id)}`))}</button>`);
    }
    return out.join("");
  }

  /* ---------- Revision 1.8: analytical layers, hover, popups, record cards ---------- */
  const CHORO_LAYERS = new Set(["taxmap", "properties", "appraisal", "popgrid", "negotiate", "agriwatch", "portfolio"]);
  const PARCEL_TAX_LAYERS = new Set(["taxmap", "negotiate", "agriwatch", "portfolio"]);   // parcel layers whose record is the title on the roll
  const POINT_LAYERS = new Set(["houses", "businesses", "cctv", "education", "health", "religion"]);
  const fixed = (v, digits) => Number(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const money = (v, digits = 0) => v == null || !Number.isFinite(Number(v)) ? text("ยังไม่มีข้อมูลส่วนนี้", "Not available") : `${fixed(v, digits)} ${text("บาท", "THB")}`;
  const moneyShort = (v) => {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    const a = Math.abs(v);
    if (a >= 1e6) return `${fixed(v / 1e6, 2)} ${text("ล้านบาท", "M THB")}`;
    return `${num(v)} ${text("บาท", "THB")}`;
  };
  function sqwaText(sqwa) {
    if (sqwa == null || !Number.isFinite(sqwa)) return text("ยังไม่มีข้อมูลส่วนนี้", "Not available");
    const rai = Math.floor(sqwa / 400), ngan = Math.floor((sqwa - rai * 400) / 100), wah = sqwa - rai * 400 - ngan * 100;
    return text(`${rai} ไร่ ${ngan} งาน ${num(wah, 1)} ตร.ว.`, `${rai} rai ${ngan} ngan ${num(wah, 1)} sq wah`);
  }
  const tpLabel = (key) => key ? text(`ผู้เสียภาษีรหัส ${key}`, `Taxpayer ${key}`) : text("ยังไม่พบในบัญชีภาษี", "Not found on the tax roll");
  const parcelAttr = (id) => S.parcelTax?.byId?.get(id) || null;
  const taxRow = (id) => S.taxResult?.byParcel?.get(id) || null;

  /* Value per feature for the active analytical layer; null means no data (never zero). */
  function layerValue(f) {
    const p = f.properties;
    if (S.dataset === "appraisal") { const price = parcelAttr(p.id)?.price; return price == null ? null : price * (1 + S.appraisalAdj / 100); }
    if (S.dataset === "taxmap") {
      const r = taxRow(p.id);
      if (!r) return null;
      return S.taxScenario === "assessed69" ? r.assessed69 : S.taxScenario === "old70" ? r.old70 : S.taxScenario === "new70" ? r.new70 : r.delta;
    }
    if (S.dataset === "popgrid") return p.suppressed ? null : p.hidden?.includes(S.popMetric) ? "<5" : p[S.popMetric];
    if (S.dataset === "properties") { const k = propKeyOf(p.id); if (!k) return null; const v = propValue(k); return v === Infinity ? 1e6 : v; }
    if (S.dataset === "negotiate") {
      const r = taxRow(p.id);
      if (!r || r.gain == null) return null;                                  // not on the roll: no data
      if (S.initiative) { const a = r.alloc.get(S.initiative) || 0; return a >= (S.initiative === TAX_AUDIT?.id ? AUDIT_MIN : 0.5) ? a : 0; }
      return negotiateGain(r);
    }
    if (S.dataset === "agriwatch") { const w = agriWatchRow(p.id); return w ? (w.potential ?? null) : undefined; }   // undefined: out of scope (not watched)
    if (S.dataset === "portfolio") { const o = ownerOf(p.id); return o ? o.value : null; }
    return null;
  }
  /* ---------- Revision 2.0: negotiation plan, farmland watch, owner ranking ---------- */
  const AUDIT_MIN = 100;   // THB per title: smaller gaps between the bill and the law-based figure are rounding and depreciation noise
  const INITIATIVE_ORDER = ["mixedUse", "combine", "rented", "newBuildings", "mainHomeOnce", "juristic", "agriShare", "combineBuilding", "rollBelow"];
  const INITIATIVE_SERIES = { mixedUse: "coral", combine: "blue", rented: "apricot", newBuildings: "teal", mainHomeOnce: "yellow", juristic: "sky", agriShare: "lime", combineBuilding: "mint", rollBelow: "slate" };
  const initiativeColor = (id) => catHex(INITIATIVE_SERIES[id] || "slate") || "#8AA4AA";
  const initiativeInk = (id) => S.tokens?.categoricalSeries.values.find((v) => v.name === (INITIATIVE_SERIES[id] || "slate"))?.[S.theme]?.ink || initiativeColor(id);
  const initiativeLabel = (id) => text(...(STRATEGY_BY_ID.get(id)?.label || [id, id]));
  const initiativeShort = (id) => text(...(INITIATIVE_SHORT[id] || STRATEGY_BY_ID.get(id)?.label || [id, id]));
  const INITIATIVE_SHORT = {
    mixedUse: ["แยกชั้นค้าขาย", "Split shop floors"], combine: ["รวมแปลงติดกัน", "Combine parcels"], rented: ["บ้านให้เช่า", "Rented homes"], newBuildings: ["อาคารตกบัญชี", "Missing buildings"],
    mainHomeOnce: ["บ้านหลักคนละแห่ง", "One main home"], juristic: ["นิติบุคคล", "Companies"], agriShare: ["เกษตรครั้งเดียว", "One farm allowance"], combineBuilding: ["โฉนดที่อาคารคร่อม", "Titles under one roof"], rollBelow: ["บัญชีต่ำกว่าที่คำนวณ", "Roll below the law"],
  };
  const INITIATIVE_HOW = {
    mixedUse: ["ขอผังการใช้รายชั้นและภาพถ่าย แล้วแบ่งตามสัดส่วนที่ใช้ค้าขาย (ม.38)", "Ask for the floor-use layout and photos, then split by the commercial share (s.38)"],
    combine: ["ตรวจชื่อในโฉนดที่ติดกันว่าเป็นคนเดียวกัน แล้วรวมมูลค่าเป็นฐานเดียว (ม.42 วรรคสอง)", "Check the adjoining deeds carry one owner, then combine the value into one base (s.42 para 2)"],
    rented: ["ขอสัญญาเช่าหรือยืนยันผู้อยู่ ถ้าให้เช่าทั้งหลัง สิทธิบ้านหลังหลักหมดไป (ม.41)", "Ask for the lease or confirm the occupant; a fully rented house loses main-home relief (s.41)"],
    newBuildings: ["ออกตรวจอาคารที่สำรวจพบ บันทึกขนาดและปีสร้าง แล้วเพิ่มในบัญชี (ม.35)", "Inspect the surveyed building, record its size and year, then add it to the roll (s.35)"],
    mainHomeOnce: ["ตรวจทะเบียนบ้านของเจ้าของ คนหนึ่งได้ยกเว้นบ้านหลังหลักแห่งเดียว (ม.41)", "Check the owner’s house registration; one person gets one main-home relief (s.41)"],
    juristic: ["ตรวจประเภทผู้เสียภาษี นิติบุคคลไม่ได้ยกเว้นเกษตรและบ้านหลังหลัก (ม.40, ม.41)", "Check the taxpayer type; companies get no farm or main-home relief (s.40, s.41)"],
    agriShare: ["รวมที่ดินเกษตรของบุคคลเดียวกันทั้งเขต ยกเว้น 50 ล้านบาทครั้งเดียว (ม.40)", "Add up one person’s farmland in the district; the 50 million relief applies once (s.40)"],
    combineBuilding: ["ตรวจชื่อในโฉนดที่อาคารหลังเดียวกันคร่อม", "Check the owners of titles under one building"],
    rollBelow: ["เทียบบัญชีกับการคำนวณทีละโฉนด: ราคา เนื้อที่ การใช้ อาคาร และข้อยกเว้นเฉพาะราย", "Reconcile the bill with the computation title by title: price, area, use, buildings and case reliefs"],
  };
  /* The gain shown on the negotiation map: the allocated gain of the title, but the audit part only when material. */
  function negotiateGain(r) {
    let g = 0;
    for (const [id, a] of r.alloc) if (a >= (id === TAX_AUDIT?.id ? AUDIT_MIN : 0.5)) g += a;
    return g;
  }
  const dominantOf = (r) => { let best = 0, id = null; for (const [k, a] of r.alloc) { const min = k === TAX_AUDIT?.id ? AUDIT_MIN : 0.5; if (a >= min && a > best) { best = a; id = k; } } return id; };
  /* Per-initiative totals inside the selected boundary (parcels in view with a 2569 bill). Cached per run and scope. */
  function initiativeTotals() {
    const fs = currentFeatures(), res = S.taxResult;
    if (!res) return null;
    if (S.initCache?.fs === fs && S.initCache.res === res) return S.initCache.t;
    const by = new Map(INITIATIVE_ORDER.map((id) => [id, { id, sum: 0, parcels: 0 }]));
    let gain = 0, parcels = 0, billed = 0, rollAbove = 0, nAbove = 0, rollBelowSmall = 0, nSmall = 0;
    for (const f of fs) {
      const r = taxRow(f.properties.id);
      if (!r || r.assessed69 == null) continue;
      billed += r.assessed69;
      if (r.rollAbove >= 0.5) { rollAbove += r.rollAbove; nAbove++; }
      const g = negotiateGain(r);
      if (g >= 0.5) { gain += g; parcels++; }
      for (const [id, a] of r.alloc) {
        if (id === TAX_AUDIT?.id && a < AUDIT_MIN) { rollBelowSmall += a; nSmall++; continue; }
        if (a < 0.5) continue;
        const e = by.get(id) || by.set(id, { id, sum: 0, parcels: 0 }).get(id); e.sum += a; e.parcels++;
      }
    }
    /* Initiatives by size; the roll check item (not a negotiation) always last. */
    const audit = TAX_AUDIT?.id;
    const t = { gain, parcels, billed, rollAbove, nAbove, rollBelowSmall, nSmall, list: [...by.values()].filter((e) => e.parcels).sort((a, b) => (a.id === audit) - (b.id === audit) || b.sum - a.sum) };
    S.initCache = { fs, res, t };
    return t;
  }
  /* Farmland watch rows from the engine, keyed by parcel; recomputed per run. */
  function agriWatchRows() {
    const res = S.taxResult;
    if (!res || !S.parcelTax) return [];
    if (S.agriCache?.res === res && S.agriCache.min === S.agriMin) return S.agriCache.list;
    const list = window.SilaTaxEngine.agriWatch(S.parcelTax, res, S.agriMin);
    S.agriCache = { res, min: S.agriMin, list, by: new Map(list.map((w) => [w.id, w])) };
    return list;
  }
  const agriWatchRow = (id) => { agriWatchRows(); return S.agriCache?.by.get(id) || null; };
  /* Owner ranking from the engine; `ownerOf(parcel)` resolves the owner record of a title. */
  function ownerRanking() {
    const res = S.taxResult;
    if (!res || !S.parcelTax) return [];
    if (S.ownerCache?.res === res) return S.ownerCache.list;
    const list = window.SilaTaxEngine.ownerRanking(S.parcelTax, res);
    S.ownerCache = { res, list, by: new Map(list.map((o) => [o.code, o])) };
    return list;
  }
  const ownerRec = (code) => { ownerRanking(); return code ? S.ownerCache?.by.get(code) || null : null; };
  const ownerOf = (parcelId) => ownerRec(parcelAttr(parcelId)?.tp || null);
  const ownerTypeText = (o) => o?.type === "juristic" ? text(...(OWNER_KIND[o.kind] || ["นิติบุคคล", "juristic person"])) : o?.type === "individual" ? text("บุคคลธรรมดา", "individual") : text("ไม่ทราบประเภท", "type unknown");
  /* Vacancy inferred from the roll (s.43), as a short sentence for cards and lists. */
  function vacancyText(v) {
    if (!v) return "";
    const pct = (r) => `${(r * 100).toFixed(1).replace(/\.0$/, "")}%`;
    return v.steps === 0
      ? text(`ทิ้งว่างปีที่ 1–3 ตามอัตราที่เรียกเก็บ ${pct(v.rate)} · ถ้ายังทิ้งว่าง อัตราขึ้นเป็น ${pct(v.nextRate)} ระหว่างปี ${v.nextStepEarliest}–${v.nextStepLatest}`, `Vacant for 1–3 years at the billed ${pct(v.rate)} · if still vacant, the rate rises to ${pct(v.nextRate)} between ${v.nextStepEarliest} and ${v.nextStepLatest} BE`)
      : text(`เรียกเก็บ ${pct(v.rate)} แปลว่าทิ้งว่างมาแล้ว ${v.yearsMin}–${v.yearsMax} ปี (เริ่มราวปี ${v.startEarliest}–${v.startLatest}) · อัตราขึ้นเป็น ${pct(v.nextRate)} ระหว่างปี ${v.nextStepEarliest}–${v.nextStepLatest}`, `Billed at ${pct(v.rate)}, so vacant for ${v.yearsMin}–${v.yearsMax} years (since about ${v.startEarliest}–${v.startLatest} BE) · the rate rises to ${pct(v.nextRate)} between ${v.nextStepEarliest} and ${v.nextStepLatest} BE`);
  }
  /* LDS 0.9.7: tax and appraisal use the approved 41-sample LUT (as in CityMETER), one exact sample per bin, no interpolation.
     Thresholds are equal-count cut points of a FIXED reference for the whole municipality (2569 roll tax, the current
     appraisal, or the change at the default settings), rounded to three significant figures. A given amount therefore keeps
     its colour when the year, scope or sliders change, so the map colours move with the sliders. Bins are [lower, upper);
     amounts beyond the last cut take the last colour and the legend says "X and above" (a declared end bin). */
  const LUT_STEPS = 41;
  const nice3 = (v) => { if (!Number.isFinite(v) || v === 0) return v; const p = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 2); return Math.round(Math.round(v / p) * p * 1e6) / 1e6; };
  function lutCutsOf(values, bins) {
    const v = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
    if (!v.length) return [];
    const cuts = [];
    for (let i = 1; i < bins; i++) cuts.push(nice3(v[Math.min(v.length - 1, Math.floor(i * v.length / bins))]));
    return [...new Set(cuts)].filter((x) => x > 0);
  }
  function defaultTaxRun() {
    if (!S.defaultTaxRun && S.parcelTax && window.SilaTaxEngine) S.defaultTaxRun = window.SilaTaxEngine.run(S.parcelTax, { strategies: new Set(TAX_STRATEGIES.map((x) => x.id)), appraisalAdjPct: 0, buildingAdjPct: 0 });
    return S.defaultTaxRun;
  }
  /* A building is taxed with the titles under it: the first title under the roof that is on the roll, together with every title
     joined to it by one building (bgrp, s.42 para 2 proxy). */
  function buildingUnit(p) {
    for (const id of p.parcelIds || []) {
      const a = parcelAttr(id);
      if (a) return a.bgrp != null ? { kind: "group", id: a.bgrp, main: id } : { kind: "parcel", id, main: id };
    }
    return null;
  }
  function unitValue(u, scen, result = S.taxResult) {
    if (!u || !result) return null;
    if (u.kind === "group") {
      const g = result.byGroup?.get(u.id);
      if (!g || !g.taxed) return null;
      return scen === "assessed69" ? g.assessed69 : scen === "old70" ? g.old70 : scen === "new70" ? g.new70 : g.new70 - g.assessed69;
    }
    const r = result.byParcel.get(u.id);
    if (!r) return null;
    return scen === "assessed69" ? r.assessed69 : scen === "old70" ? r.old70 : scen === "new70" ? r.new70 : r.delta;
  }
  function unitValues(result, scen) {
    if (!result || !S.parcelTax) return [];
    const out = [];
    for (const p of S.parcelTax.parcels) if (p.bgrp == null) out.push(unitValue({ kind: "parcel", id: p.id }, scen, result));
    for (const id of result.byGroup?.keys() || []) out.push(unitValue({ kind: "group", id }, scen, result));
    return out.filter((v) => v != null);
  }
  function lutRef(kind) {
    if (S.lutRefs[kind]) return S.lutRefs[kind];
    const parcels = S.parcelTax?.parcels || [];
    let cuts = [];
    if (kind === "price") cuts = lutCutsOf(parcels.map((p) => p.price), LUT_STEPS);
    else if (kind === "tax") cuts = lutCutsOf(parcels.map((p) => p.tax69), LUT_STEPS);
    else if (kind === "unitTax") cuts = lutCutsOf(unitValues(S.taxResult, "assessed69"), LUT_STEPS);
    else if (kind === "delta" || kind === "unitDelta") {
      const base = defaultTaxRun();
      const vals = kind === "delta" ? [...(base?.byParcel.values() || [])].map((r) => r.delta) : unitValues(base, "delta");
      cuts = lutCutsOf(vals.filter((x) => x != null && Math.abs(x) >= 1).map(Math.abs), 20);
    } else if (kind === "agriPotential") {
      cuts = lutCutsOf(agriWatchRows().map((w) => w.potential).filter((x) => x != null && x >= 1), 20);
    } else if (kind === "ownerValue") {
      cuts = lutCutsOf(ownerRanking().map((o) => o.value).filter((x) => x > 0), LUT_STEPS);
    } else if (kind === "propGain" || kind === "propPct") {
      // Properties gaining at the default settings (same prices, every available fix): equal-count ranges, fixed thereafter.
      const base = defaultTaxRun(), pct = kind === "propPct";
      const vals = [...(base?.byProperty?.values() || [])].map((e) => (pct ? propPct(e) : propGain(e))).filter((x) => x != null && Number.isFinite(x) && x >= (pct ? 0.5 : 1));
      cuts = lutCutsOf(vals, 20);
    }
    if (cuts.length) S.lutRefs[kind] = cuts;
    return cuts;
  }
  function lutIndex(c, v) {
    let j = 0;
    if (c.kind === "lutdiv") {
      if (Math.abs(v) < c.neutral) return 20;
      while (j < c.cuts.length && Math.abs(v) >= c.cuts[j]) j++;
      const k = c.cuts.length ? Math.round(j * 19 / c.cuts.length) : 0;
      return v < 0 ? 19 - k : 21 + k;
    }
    while (j < c.cuts.length && v >= c.cuts[j]) j++;
    return c.cuts.length ? Math.round(j * 40 / c.cuts.length) : 0;
  }
  const lutHex = (c, v) => c.lut[lutIndex(c, v)];
  function appraisalTitle() {
    return S.appraisalAdj ? text(`ราคาประเมินที่ดิน สมมติรอบ 2570–2573 ${S.appraisalAdj > 0 ? "+" : ""}${S.appraisalAdj}%`, `Land appraisal, assumed 2570–2573 round ${S.appraisalAdj > 0 ? "+" : ""}${S.appraisalAdj}%`)
      : text("ราคาประเมินที่ดิน", "Land appraisal");
  }
  function computeClassing() {
    S.classing = null;
    if (!window.SilaScales) return;
    const lut = (scaleId) => SilaScales.record(scaleId, "light").lut;
    const divergent = (cuts, title, unit, refNote) => ({ kind: "lutdiv", scaleId: "delta", lut: lut("delta"), cuts, neutral: 1, title, unit, refNote });
    const sequential = (cuts, title, unit, refNote) => ({ kind: "lut", scaleId: "price", lut: lut("price"), cuts, title, unit, refNote });
    const deltaNote = text("ช่วงสีจากขนาดส่วนต่างทั้งเมืองเมื่อใช้ค่าเริ่มต้น (ราคาเท่าเดิม ข้อเสนอที่คิดได้ทุกข้อ) · สองฝั่งใช้ช่วงเดียวกัน", "Ranges from the city-wide size of the change at the default settings (same prices, every fix that can be computed) · both sides share the ranges");
    if (S.dataset === "buildings") {
      if (S.buildingView !== "tax" || !S.taxResult) return;
      S.classing = S.taxScenario === "delta"
        ? divergent(lutRef("unitDelta"), text("ภาษีของชุดโฉนดเปลี่ยนจากปี 2569", "Change in the title set's tax from 2569"), text("บาทต่อปี · ปี 2570 ตามข้อเสนอ ลบ ปี 2569 · โฉนดที่อาคารหลังเดียวกันคร่อมนับเป็นชุดเดียว", "THB per year · 2570 with fixes minus 2569 · titles joined by one building count as one set"), deltaNote)
        : sequential(lutRef("unitTax"), `${taxScenarioLabel(S.taxScenario)}${text(" ของโฉนดใต้อาคาร", " of the titles under the building")}`, text("บาทต่อปี ต่อชุดโฉนด · โฉนดที่อาคารหลังเดียวกันคร่อมนับเป็นชุดเดียว", "THB per year per title set · titles joined by one building count as one set"), text("ช่วงสีจากภาษีปี 2569 ของทุกชุดโฉนดในเมือง แต่ละช่วงมีจำนวนชุดเท่า ๆ กัน", "Ranges from the 2569 tax of every title set in the city, an equal number of sets in each"));
      return;
    }
    if (!CHORO_LAYERS.has(S.dataset)) return;
    if (S.dataset === "taxmap") {
      S.classing = S.taxScenario === "delta"
        ? divergent(lutRef("delta"), text("ภาษีเปลี่ยนจากปี 2569", "Change from 2569 tax"), text("บาทต่อปี · ปี 2570 ตามข้อเสนอ ลบ ปี 2569 ที่ประเมิน", "THB per year · 2570 proposed minus 2569 assessed"), deltaNote)
        : sequential(lutRef("tax"), taxScenarioLabel(S.taxScenario), text("บาทต่อปี ต่อแปลง", "THB per year per parcel"), text("ช่วงสีจากภาษีปี 2569 ทั้งเมือง แต่ละช่วงมีจำนวนแปลงเท่า ๆ กัน", "Ranges from the city-wide 2569 tax, an equal number of parcels in each"));
      return;
    }
    if (S.dataset === "properties") {
      const pct = S.propMetric === "pct";
      S.classing = { kind: "lutdiv", oneSided: true, pct, scaleId: "delta", lut: lut("delta"), cuts: lutRef(pct ? "propPct" : "propGain"), neutral: pct ? 0.5 : 1,
        title: pct ? text("ภาษีปี 2570 ที่เพิ่มได้ เทียบกับวิธีเดิม", "2570 tax that can be added, vs the current method") : text("ภาษีปี 2570 ที่เพิ่มได้ต่อทรัพย์สิน", "2570 tax that can be added per property"),
        unit: pct ? text("ร้อยละของภาษีปี 2570 วิธีเดิม · ทรัพย์สินที่วิธีเดิมเป็น 0 บาทอยู่ช่วงบนสุด", "% of the 2570 current-method tax · properties at 0 THB today sit in the top range") : text("บาทต่อปี · ปี 2570 ตามข้อเสนอ ลบ ปี 2570 วิธีเดิม", "THB a year · 2570 with fixes minus 2570 current method"),
        refNote: text("ช่วงสีจากทรัพย์สินที่ภาษีเพิ่มเมื่อใช้ค่าเริ่มต้น แต่ละช่วงมีจำนวนเท่า ๆ กัน", "Ranges from properties that gain at the default settings, equal counts per range") };
      return;
    }
    if (S.dataset === "appraisal") {
      S.classing = sequential(lutRef("price"), appraisalTitle(), text("บาทต่อตารางวา", "THB per square wah"), text("ช่วงสีจากราคาประเมินรอบปัจจุบันทั้งเมือง แต่ละช่วงมีจำนวนแปลงเท่า ๆ กัน", "Ranges from the current city-wide appraisal, an equal number of parcels in each"));
      return;
    }
    if (S.dataset === "negotiate") {
      if (S.initiative) {
        S.classing = { kind: "lutdiv", oneSided: true, scaleId: "delta", lut: lut("delta"), cuts: lutRef("propGain"), neutral: 0.5,
          title: text(`เก็บเพิ่มได้ · ${initiativeShort(S.initiative)}`, `Can be added · ${initiativeShort(S.initiative)}`), unit: text("บาทต่อปี ต่อแปลง · เทียบกับที่เรียกเก็บปี 2569", "THB a year per parcel · against the 2569 bill"),
          refNote: text("ช่วงสีเดียวกับแผนที่ทรัพย์สิน · แปลงที่กลุ่มนี้ไม่มีผลเป็นสีกลาง", "Same ranges as the property map · parcels this initiative does not touch are neutral") };
      } else {
        S.classing = { kind: "categorical", title: text("กลุ่มข้อเสนอที่เพิ่มได้มากที่สุดในแปลง", "Initiative adding most on the parcel"), unit: text("แปลงที่เก็บเพิ่มได้ เทียบกับที่เรียกเก็บปี 2569 · แปลงที่ไม่เพิ่มเป็นสีกลาง", "Parcels that can add tax over the 2569 bill · unchanged parcels are neutral"),
          items: INITIATIVE_ORDER.filter((id) => id !== "combineBuilding").map((id) => ({ id, label: initiativeShort(id), color: initiativeColor(id) })) };
      }
      return;
    }
    if (S.dataset === "agriwatch") {
      S.classing = { kind: "lut", scaleId: "price", lut: lut("price"), cuts: lutRef("agriPotential"), title: text("ภาษีที่จะเพิ่มถ้าพบว่าไม่ได้ทำประโยชน์", "Tax added if found unused"),
        unit: text("บาทต่อปี ต่อแปลง · อัตราที่ดินว่างเปล่า 0.3% ลบที่เรียกเก็บปี 2569 · เฉพาะแปลงเกษตรที่มูลค่าที่ดิน 5 ล้านบาทขึ้นไป", "THB a year per parcel · vacant-land rate 0.3% minus the 2569 bill · farmland titles worth 5 million THB or more"),
        refNote: text("แปลงอื่นไม่ระบายสี · เป็นขนาดถ้าตรวจพบ ไม่ใช่ข้อสรุปว่าไม่ได้ทำประโยชน์", "Other parcels are not coloured · a size if a check finds the land unused, not a finding") };
      return;
    }
    if (S.dataset === "portfolio") {
      S.classing = { kind: "lut", scaleId: "price", lut: lut("price"), cuts: lutRef("ownerValue"), title: text("มูลค่าประเมินรวมของเจ้าของแปลงนี้", "Appraised value of this parcel’s owner"),
        unit: text("บาท · ที่ดินทุกแปลงของเจ้าของ บวกสิ่งปลูกสร้างที่บัญชีผูกได้ · เจ้าของตามบัญชีปี 2563", "THB · all the owner’s land plus roll-linked buildings · owners per the 2563 list"),
        refNote: text("ช่วงสีจากเจ้าของทุกรายในเมือง แต่ละช่วงมีจำนวนเท่า ๆ กัน · แปลงที่ไม่รู้เจ้าของเป็นลายเส้น", "Ranges from every owner in the city, equal counts per range · parcels with no owner are hatched") };
      return;
    }
    /* Population cells keep seven LDS classes with their hidden and <5 states. */
    const feats = currentFeatures();
    const vals = feats.map(layerValue).filter((v) => typeof v === "number");
    const colors = SilaScales.classes("count", 7);
    const breaks = SilaScales.quantileBreaks(vals, colors.length);
    S.classing = { kind: "sequential", scaleId: "count", colors: colors.slice(0, breaks.length + 1), breaks, title: popMetricLabel(S.popMetric), unit: text("คนในช่อง 250 × 250 ม. · เฉพาะบ้านที่มีรายชื่อในแบบสำรวจ", "people per 250 × 250 m cell · surveyed households with member lists only") };
  }
  function classColor(v) {
    const c = S.classing;
    if (c.kind === "categorical") return c.items.find((x) => x.id === v)?.color || null;
    if (c.kind === "lut" || c.kind === "lutdiv") return lutHex(c, v);
    if (c.kind === "diverging") return c.colors[SilaScales.divergingIndex(v, c.cuts, c.neutral, 3)];
    return c.colors[Math.min(c.colors.length - 1, SilaScales.classIndex(v, c.breaks))];
  }
  function choroplethStyle(f) {
    const c = S.classing, v = layerValue(f);
    const stroke = S.theme === "light" ? "#FFFFFF" : "#11191D";
    /* Data classes are drawn at full opacity so map colours equal the legend HEX in both themes (no opacity change to data colour). */
    const base = { stroke: true, color: stroke, weight: S.dataset === "popgrid" ? 0.8 : 0.35, opacity: 0.9, fill: true, fillOpacity: 1 };
    if (!c) return { ...base, fillColor: SilaScales.noData("price", S.theme) };
    if (v === undefined) return { ...base, fill: false, color: S.theme === "light" ? "#C9D1CC" : "#2E3A3A", weight: 0.3, opacity: 0.8 };   // out of scope: bare basemap, faint outline
    if (c.kind === "categorical") {
      const r = taxRow(f.properties.id), dom = r ? dominantOf(r) : null;
      if (v == null) return { ...base, fillColor: SilaScales.hatch(S.theme) || SilaScales.noData("price", S.theme) };
      if (!(v > 0) || !dom) return { ...base, fillColor: S.theme === "light" ? "#E6EAE6" : "#20292B" };   // on the roll, nothing to add: neutral
      return { ...base, fillColor: classColor(dom) };
    }
    if (c.oneSided && v === 0) return { ...base, fillColor: S.theme === "light" ? "#E6EAE6" : "#20292B" };   // on the roll, this initiative adds nothing
    // Hidden and <5 cells are UI states, not data classes: a neutral fill plus a dashed outline (non-colour cue).
    if (S.dataset === "popgrid" && f.properties.suppressed) return { ...base, fillColor: S.theme === "light" ? "#DDE2DE" : "#26302F", dashArray: "3 3", color: S.theme === "light" ? "#5F6B66" : "#8C968F", weight: 1 };
    if (v === "<5") return { ...base, fillColor: S.theme === "light" ? "#DDE2DE" : "#26302F", dashArray: "5 2", color: S.theme === "light" ? "#3D4744" : "#C4CECA", weight: 1.2 };
    if (v == null) return { ...base, fillColor: SilaScales.hatch(S.theme) || SilaScales.noData("price", S.theme) };
    if (v === 0 && (c.kind === "sequential" || c.kind === "lut")) return { ...base, fillColor: (c.lut || c.colors)[0], color: SilaScales.zeroOutline(c.scaleId, S.theme), weight: 1.4 };
    return { ...base, fillColor: classColor(v) };
  }
  /* Published use is grouped so empty homes cannot be singled out: owner-occupied, other, vacant and blank are one group. */
  const USE_GROUPS = [
    { id: "rent", match: /เช่า|ผู้อื่น/, label: ["ให้เช่าหรือผู้อื่นใช้", "Rented or used by others"], color: "coral" },
    { id: "store", match: /จอด|เก็บ/, label: ["จอดรถหรือเก็บของ", "Parking or storage"], color: "sky" },
    { id: "farm", match: /สวน|เลี้ยง|เกษตร/, label: ["เกษตรหรือเลี้ยงสัตว์", "Farming or livestock"], color: "lime" },
  ];
  const USE_OTHER_LABEL = ["อยู่เอง อื่น ๆ หรือไม่ระบุ", "Owner-occupied, other or not stated"];
  const surveyedBuilding = (p) => (p.surveyPoints || 0) > 0 || (p.registryNear || 0) > 0 || p.type != null || p.material != null || p.floors != null;
  const useGroup = (p) => {
    if (p.commercial) return { id: "commerce", label: ["มีชั้นที่ใช้ค้าขาย", "Has a commercial floor"], color: "yellow" };
    const g = USE_GROUPS.find((x) => x.match.test(p.use || ""));
    if (g) return g;
    return surveyedBuilding(p) ? { id: "other", label: USE_OTHER_LABEL, color: null, neutral: true } : { id: "unknown", label: ["ไม่มีหมุดสำรวจ", "No survey point"], color: null };
  };
  const catHex = (name) => S.tokens?.categoricalSeries.values.find((v) => v.name === name)?.[S.theme]?.fill || "#BFD4E7";
  function buildingStyle(f) {
    const p = f.properties, stroke = S.theme === "light" || S.basemap.startsWith("satellite") ? "#182327" : categoryColor("buildings");
    if (S.buildingView === "tax") {
      /* Colour = the tax of the titles under the building (41-sample LUT, fixed reference). No figure = no-data hatch, never zero. */
      const c = S.classing, v = c ? unitValue(buildingUnit(p), S.taxScenario) : null, outline = S.theme === "light" ? "#8C968F" : "#46524F";
      if (v == null) return { color: outline, weight: 0.6, fill: true, fillColor: SilaScales.hatch(S.theme) || SilaScales.noData("price", S.theme), fillOpacity: 1, opacity: 1 };
      if (v === 0 && c.kind === "lut") return { color: SilaScales.zeroOutline("price", S.theme), weight: 1.4, fill: true, fillColor: c.lut[0], fillOpacity: 1, opacity: 1 };
      return { color: S.theme === "light" ? "#FFFFFF" : "#11191D", weight: 0.4, fill: true, fillColor: lutHex(c, v), fillOpacity: 1, opacity: 0.9 };
    }
    if (S.buildingView === "straddle") {
      return p.straddle
        ? { color: S.theme === "light" ? "#182327" : "#F1F4EF", weight: 1.4, fill: true, fillColor: catHex("coral"), fillOpacity: 1, opacity: 1 }
        : { color: S.theme === "light" ? "#8C968F" : "#46524F", weight: 0.6, fill: true, fillColor: S.theme === "light" ? "#DCE1DD" : "#33403D", fillOpacity: 1, opacity: 1 };
    }
    if (S.buildingView === "use") {
      const g = useGroup(p);
      if (g.color) return { color: stroke, weight: 0.6, fill: true, fillColor: catHex(g.color), fillOpacity: 1, opacity: 1 };
      if (g.neutral) return { color: S.theme === "light" ? "#8C968F" : "#46524F", weight: 0.6, fill: true, fillColor: S.theme === "light" ? "#DCE1DD" : "#33403D", fillOpacity: 1, opacity: 1 };
      return { color: S.theme === "light" ? "#8C968F" : "#46524F", weight: 0.6, fill: true, fillColor: SilaScales.hatch(S.theme) || "#3B4849", fillOpacity: 1, opacity: 1 };
    }
    if (S.buildingView === "roll") {
      const g = rollGroup(p);
      return g ? { color: stroke, weight: 0.6, fill: true, fillColor: catHex(g.color), fillOpacity: 1, opacity: 1 }
        : { color: S.theme === "light" ? "#8C968F" : "#46524F", weight: 0.6, fill: true, fillColor: SilaScales.hatch(S.theme) || "#3B4849", fillOpacity: 1, opacity: 1 };
    }
    if (S.buildingView === "registry") {
      /* Count of house-register points joined to the footprint. Exact LDS count classes (3), same HEX in both themes.
         No point found is not a measured zero (annex, non-residential or not surveyed), so it takes the no-data hatch.
         Near-only joins get a dashed outline (non-colour cue). */
      const n = p.surveyPoints || 0, cls = REGISTRY_CLASSES();
      const near = p.attrFrom === "near";
      if (n === 0) return { color: S.theme === "light" ? "#8C968F" : "#46524F", weight: 0.6, fill: true, fillColor: SilaScales.hatch(S.theme) || SilaScales.noData("count", S.theme), fillOpacity: 1, opacity: 1 };
      return { color: S.theme === "light" ? "#182327" : "#F1F4EF", weight: near ? 1.2 : 0.6, dashArray: near ? "3 2" : null, fill: true, fillColor: cls[n >= 4 ? 2 : n >= 2 ? 1 : 0], fillOpacity: 1, opacity: 1 };
    }
    return featureStyle("buildings");
  }
  const REGISTRY_CLASSES = () => SilaScales.classes("count", 3);
  /* Roll status of a footprint (building roll x house number x deed). Categorical colours: categories, not risk. */
  const ROLL_GROUPS = [
    { id: "on_roll", color: "mint", label: ["อยู่ในบัญชีแล้ว (บ้านเลขที่และโฉนดตรง)", "On the roll (house number and title agree)"] },
    { id: "missing_house_no", color: "coral", label: ["บ้านเลขที่ไม่อยู่ในบัญชีสิ่งปลูกสร้าง", "House number absent from the building roll"] },
    { id: "house_no_unmatched", color: "apricot", label: ["บ้านเลขที่ไม่อยู่ในบัญชี แต่โฉนดยังมีอาคารที่ผูกไม่ได้", "House number not on the roll; title has unlinked roll buildings"] },
    { id: "house_no_elsewhere", color: "yellow", label: ["บ้านเลขที่อยู่ในบัญชี แต่ผูกกับโฉนดอื่น", "House number on the roll under another title"] },
    { id: "parcel_on_roll_unlinked", color: "sky", label: ["แปลงอยู่ในบัญชี ไม่มีหมุดบ้านในอาคาร", "Parcel on the roll, no house point in the building"] },
    { id: "parcel_not_on_roll", color: "slate", label: ["แปลงยังจับคู่กับบัญชีไม่ได้", "Parcel not matched to the roll yet"] },
  ];
  const rollGroup = (p) => ROLL_GROUPS.find((g) => g.id === p.roll) || null;
  const houseNumbersText = (list, max = 8) => {
    if (!list?.length) return null;
    const shown = list.slice(0, max).join(", ");
    return list.length > max ? shown + text(` และอีก ${num(list.length - max)} เลข`, ` and ${num(list.length - max)} more`) : shown;
  };
  function registryText(p) {
    const n = p.surveyPoints || 0;
    if (!n) return text("ไม่พบหมุดทะเบียนบ้านในหรือติดอาคาร", "No house-register point in or beside it");
    const near = p.registryNear || 0;
    return text(`${num(n)} หมุด`, `${num(n)} point${n > 1 ? "s" : ""}`) + (near ? text(` (ผูกจากระยะไม่เกิน 5 ม. ${num(near)} หมุด)`, ` (${num(near)} joined within 5 m)`) : "");
  }

  /* English for survey values (the survey records them in Thai); unknown values stay as recorded. */
  const SURVEY_EN = {
    "อยู่เอง": "Owner-occupied", "ตัวเอง": "Owner-occupied", "เช่า": "Rented", "จอดรถ": "Parking", "ผู้อื่นทำประโยชน์": "Used by others", "อื่น ๆ": "Other",
    "เก็บของ": "Storage", "ให้เช่าหรือผู้อื่นใช้": "Rented or used by others", "จอดรถหรือเก็บของ": "Parking or storage", "เกษตรหรือเลี้ยงสัตว์": "Farming or livestock", "บ้านสวน เลี้ยงเป็ดไก่": "Garden house, poultry", "จุดแวะพัก": "Rest stop", "เลี้ยงวัว ควาย": "Cattle and buffalo",
    "ตรวจสอบแล้ว/สำรวจแล้ว": "Checked / surveyed", "เพิ่มตำแหน่งใหม่": "New position added", "ไม่มีข้อมูล": "No data", "มีข้อมูล/ยังไม่ตรวจสอบ": "Data, not yet checked",
    "ตึก": "Masonry", "ครึ่งตึกครึ่งไม้": "Half masonry, half wood", "ไม้": "Wood", "สังกะสี": "Corrugated metal", "เต็นท์": "Tent",
    "ประเภทบ้านเดี่ยว": "Detached house", "ประเภทบ้านแถว (ทาวน์เฮาส์)": "Townhouse", "ประเภทตึกแถว": "Shophouse", "โรงจอดรถ": "Carport",
    "คลังสินค้า พื้นที่เกินกว่า 300 ตารางเมตรขึ้นไป": "Warehouse over 300 m²", "คลังสินค้า พื้นที่ไม่เกิน 300 ตารางเมตร": "Warehouse up to 300 m²", "ประเภทห้องแถว": "Row house",
    "อาคารอยู่อาศัยรวม ความสูงไม่เกิน 5 ชั้น": "Apartment building up to 5 floors", "อาคารอยู่อาศัยรวม ความสูงเกินกว่า 5 ชั้นขึ้นไป": "Apartment building over 5 floors",
    "โรงเลี้ยงสัตว์": "Animal shed", "โครงเหล็ก": "Steel-frame structure", "ห้องน้ำรวม": "Shared toilets", "อาคารพาณิชยกรรม ประเภทค้าปลีกค้าส่ง": "Retail or wholesale building",
    "ประเภทสิ่งปลูกสร้างอื่นๆ": "Other structure", "ประเภทสิงปลูกสร้างอี่นๆ": "Other structure", "สำนักงาน ความสูงไม่เกิน 5 ชั้น": "Office up to 5 floors", "อาคารจอดรถ": "Parking building",
    "โรงแรม ความสูงไม่เกิน 5 ชั้น": "Hotel up to 5 floors", "โรงแรม ความสูงเกินกว่า 5 ชั้นขึ้นไป": "Hotel over 5 floors", "สถานศึกษา": "School", "อู่ซ่อมรถยนต์": "Car repair garage",
    "โรงงาน": "Factory", "ภัตตาคาร": "Restaurant", "อาคารพาณิชย์ ประเภทโฮมออฟฟิศ": "Home office building", "โรงงานซ่อมรถยนต์": "Car repair workshop",
    "อาคารพาณิชย์ ประเภทโชว์รูมรถยนต์": "Car showroom", "ตลาด พื้นที่ไม่เกิน 1,000 ตารางเมตร": "Market up to 1,000 m²", "สถานพยาบาล": "Health facility",
    "สถานีบริการน้ำมันเชื้อเพลิง": "Fuel station", "ห้างสรรพสินค้า": "Department store", "ลานคอนกรีต": "Concrete yard", "สระว่ายน้ำ": "Swimming pool",
    "อาคารเปิดโล่ง": "Open-sided building", "ลานกีฬาอเนกประสงค์": "Multi-purpose sports court",
  };
  const sv = (v) => (v == null || v === "" ? v : S.lang === "en" ? SURVEY_EN[v] || v : v);
  const floorsText = (n) => `${n} ${text("ชั้น", Number(n) === 1 ? "floor" : "floors")}`;
  /* ---------- labels for hover, popup and record card ---------- */
  function taxScenarioLabel(id) {
    return text(...({
      assessed69: ["ภาษีปี 2569 ที่ประเมิน", "2569 tax assessed"],
      old70: ["ภาษีปี 2570 ถ้าคิดวิธีเดิม", "2570 tax, current method"],
      new70: ["ภาษีปี 2570 ถ้าทำตามข้อเสนอ", "2570 tax with proposed fixes"],
      delta: ["ส่วนต่าง ปี 2570 ตามข้อเสนอ กับ ปี 2569", "Change: 2570 proposed vs 2569"],
    }[id] || ["ภาษี", "Tax"]));
  }
  /* Population cell value as shown: hidden groups say so, <5 stays <5, missing is a dash (never zero). */
  const pv = (p, k) => (p.hidden?.includes(k) ? text("ปิดไว้", "hidden") : p[k] == null ? "—" : String(p[k]));
  function popMetricLabel(id) {
    return text(...({ t: ["คนทั้งหมด", "All people"], c: ["เด็กต่ำกว่า 15 ปี", "Children under 15"], a: ["อายุประมาณ 15–42 ปี", "About 15–42 years"], o: ["อายุประมาณ 42 ปีขึ้นไป", "About 42 and over"], m: ["ชาย", "Male"], f: ["หญิง", "Female"] }[id] || ["คน", "People"]));
  }
  /* Approved interface icons (owner, 20 Oct 2026): warning = needs check, check_circle = passed, schedule = awaiting data.
     Icons never replace the words; the chip colour uses the LDS semantic state tokens. */
  const ui = (role, size = 16) => window.SilaIcons?.icon(role, { size }) || "";
  const stateChip = (state, label) => `<span class="state-chip" data-state="${state}">${ui({ check: "needscheck", passed: "passed", awaiting: "awaiting" }[state] || "info")}<span>${esc(label)}</span></span>`;
  const statusHTML = (s) => s === "paid" ? stateChip("passed", statusText(s)) : s === "unpaid" || s === "partial" ? stateChip("check", statusText(s)) : s === "none" ? esc(statusText(s)) : stateChip("awaiting", statusText(s));
  const statusText = (s) => text(...({ paid: ["ชำระครบแล้ว", "Paid in full"], partial: ["ชำระบางส่วน (บัญชีลูกหนี้ 30 ก.ย. 2569)", "Partly paid (debtor list, 30 Sep 2569)"], unpaid: ["ค้างชำระ (บัญชีลูกหนี้ 30 ก.ย. 2569)", "Unpaid (debtor list, 30 Sep 2569)"], none: ["ไม่มียอดต้องชำระของโฉนดนี้", "Nothing due on this title"] }[s] || ["ยังผูกการชำระรายแปลงไม่ได้", "Payment not linked to parcels yet"]));
  function featureTitle(f) {
    const p = f.properties;
    if (S.dataset === "houses") return p.houseNumber ? text(`บ้านเลขที่ ${p.houseNumber}`, `House ${p.houseNumber}`) : text(`จุดสำรวจ #${p.sourceRecord}`, `Survey point #${p.sourceRecord}`);
    if (S.dataset === "properties") { const k = propKeyOf(p.id); return k ? propName(k) : p.code ? text(`แปลง ${p.code}`, `Parcel ${p.code}`) : p.label; }
    if (S.dataset === "businesses") return p.label + (p.branch && p.branch !== "head" ? text(` (สาขา ${p.branch})`, ` (branch ${p.branch})`) : "");
    if (["taxmap", "appraisal", "parcels", "negotiate", "agriwatch", "portfolio"].includes(S.dataset)) return p.code ? text(`แปลง ${p.code}`, `Parcel ${p.code}`) : p.label;
    if (S.dataset === "buildings") return (sv(p.type) || text("อาคาร", "Building")) + ` #${p.sourceRecord}`;
    if (S.dataset === "popgrid") return text("ช่อง 250 ม.", "250 m cell");
    return p.label || p.id;
  }
  function featureLines(f) {
    const p = f.properties, out = [];
    if (S.dataset === "houses") {
      if (p.type) out.push(esc(`${sv(p.type)}${p.floors ? ` · ${floorsText(p.floors)}` : ""}`));
      if (p.use) out.push(esc(`${text("การใช้", "Use")}: ${sv(p.use)}${p.commercial ? text(" · มีชั้นค้าขาย", " · commercial floor") : ""}`));
      else if (p.commercial) out.push(text("มีชั้นที่ใช้ค้าขาย", "Has a commercial floor"));
      if (!p.buildingId) out.push(text("ยังไม่มีรูปอาคาร", "No footprint yet"));
    } else if (S.dataset === "buildings") {
      if (p.houseNumbers?.length) out.push(esc(text("บ้านเลขที่ ", "House no. ") + houseNumbersText(p.houseNumbers, 4)));
      else if (S.buildingView === "registry") out.push(esc(registryText(p)));
      out.push(`${p.floors ? `${floorsText(p.floors)} · ` : ""}${text("หลังคา", "roof")} ${num(p.areaM2)} ${text("ตร.ม.", "m²")}`);
      if (p.use) out.push(esc(`${text("การใช้", "Use")}: ${sv(p.use)}`));
      if (p.straddle) out.push(text(`ตั้งอยู่บน ${p.parcelCount} แปลง`, `Spans ${p.parcelCount} parcels`));
      if (S.buildingView === "tax") {
        const u = buildingUnit(p), v = unitValue(u, S.taxScenario);
        out.push(`${esc(taxScenarioLabel(S.taxScenario))}: <span class="hover-value">${v == null ? "—" : (S.taxScenario === "delta" && v > 0 ? "+" : "") + fixed(v, 2)}</span> ${text("บาท", "THB")}`);
        if (u?.kind === "group") out.push(esc(text(`ชุดโฉนด ${num(S.parcelTax.buildingGroups.get(u.id)?.length || 0)} โฉนดที่น่าจะคิดรวมกัน`, `Set of ${num(S.parcelTax.buildingGroups.get(u.id)?.length || 0)} titles likely taxed together`)));
        else if (!u) out.push(text("โฉนดใต้อาคารยังจับคู่กับบัญชีภาษีไม่ได้", "Titles under it are not matched to the tax roll"));
      }
    } else if (S.dataset === "floodsites") {
      out.push(esc(p.cause));
      out.push(esc(floodStatusText(p)));
    } else if (S.dataset === "appraisal") {
      const a = parcelAttr(p.id);
      out.push(a?.price != null ? `<span class="hover-value">${num(a.price)}</span> ${text("บาท/ตร.ว.", "THB/sq wah")}` : text("ยังไม่มีราคาประเมินของแปลงนี้", "No appraisal for this parcel yet"));
      if (a?.price != null && S.appraisalAdj) out.push(`${text("สมมติรอบใหม่", "Assumed new round")} ${pctText(S.appraisalAdj)}: <span class="hover-value">${num(Math.round(a.price * (1 + S.appraisalAdj / 100)))}</span> ${text("บาท/ตร.ว.", "THB/sq wah")}`);
    } else if (S.dataset === "taxmap") {
      const r = taxRow(p.id);
      if (!r) out.push(text("ยังไม่พบแปลงนี้ในบัญชีภาษี", "Not found on the tax roll"));
      else {
        const v = layerValue(f);
        out.push(`${esc(taxScenarioLabel(S.taxScenario))}: <span class="hover-value">${v == null ? "—" : (S.taxScenario === "delta" && v > 0 ? "+" : "") + fixed(v, 2)}</span> ${text("บาท", "THB")}`);
        if (S.taxScenario === "assessed69" && r.status69 !== "unknown") out.push(statusText(r.status69));
      }
    } else if (S.dataset === "negotiate") {
      const r = taxRow(p.id);
      if (!r || r.assessed69 == null) out.push(text("ยังไม่พบแปลงนี้ในบัญชีภาษี", "Not found on the tax roll"));
      else {
        const g = negotiateGain(r), dom = dominantOf(r);
        out.push(g >= 0.5 ? `${text("เก็บเพิ่มได้", "Can be added")}: <span class="hover-value">+${fixed(g, 0)}</span> ${text("บาทต่อปี", "THB a year")}` : text(`เรียกเก็บปี 2569 ${fixed(r.assessed69, 0)} บาท · ไม่มีส่วนเพิ่ม`, `Billed ${fixed(r.assessed69, 0)} THB in 2569 · nothing to add`));
        if (dom) out.push(esc(initiativeShort(dom)));
      }
    } else if (S.dataset === "agriwatch") {
      const w = agriWatchRow(p.id);
      if (!w) out.push(text("ไม่อยู่ในกลุ่มเพ่งเล็ง", "Not in the watch list"));
      else out.push(`${text("ถ้าพบว่าไม่ได้ทำประโยชน์ เพิ่ม", "If found unused, adds")}: <span class="hover-value">+${fixed(w.potential ?? 0, 0)}</span> ${text("บาทต่อปี", "THB a year")}`, esc(text(`มูลค่าที่ดิน ${moneyShort(w.landValue)} · เรียกเก็บปี 2569 ${fixed(w.billed69 ?? 0, 0)} บาท`, `Land ${moneyShort(w.landValue)} · billed ${fixed(w.billed69 ?? 0, 0)} THB in 2569`)));
    } else if (S.dataset === "portfolio") {
      const o = ownerOf(p.id);
      if (!o) out.push(text("ยังไม่พบเจ้าของในบัญชีปี 2563", "No owner in the 2563 list"));
      else out.push(`${text("เจ้าของอันดับ", "Owner rank")} <span class="hover-value">${num(o.rank)}</span> · ${esc(text(`${num(o.parcels.length)} แปลง · มูลค่ารวม ${moneyShort(o.value)}`, `${num(o.parcels.length)} parcels · ${moneyShort(o.value)}`))}`);
    } else if (S.dataset === "businesses") {
      out.push(esc(businessKindText(p)));
      if (p.site) out.push(esc(p.site));
      if (p.placedBy === "house_no_only") out.push(text("ตำแหน่งจากบ้านเลขที่อย่างเดียว · ควรตรวจ", "Placed by house number only · check"));
    } else if (S.dataset === "properties") {
      const k = propKeyOf(p.id), e = propRow(k);
      if (!k) out.push(text("ยังไม่พบเจ้าของในบัญชีปี 2563", "No owner in the 2563 list"));
      else if (!e?.taxed) out.push(text("ยังไม่มีตัวเลขภาษี", "No tax figure yet"));
      else {
        const g = propGain(e);
        out.push(`${text("เพิ่มได้ต่อปี", "Can be added a year")}: <span class="hover-value">${g >= 0.5 ? "+" : ""}${fixed(g, 0)}</span> ${text("บาท", "THB")} (${esc(pctLabel(propPct(e)))})`);
        out.push(esc(text(`${num(propParcels(k).length)} แปลง · ปี 2570 ตามข้อเสนอ ${fixed(e.new70, 0)} บาท`, `${num(propParcels(k).length)} parcel(s) · 2570 with fixes ${fixed(e.new70, 0)} THB`)));
      }
    } else if (S.dataset === "popgrid") {
      if (p.suppressed) out.push(text("คนในรายชื่อน้อยกว่า 10 คนหรือบ้านน้อยกว่า 3 หลัง จึงปิดตัวเลขไว้", "Fewer than 10 listed people or 3 households; figures hidden"));
      else out.push(esc(`${text("คน", "People")} ${pv(p, "t")} · ${text("เด็ก", "children")} ${pv(p, "c")} · 15–42 ${pv(p, "a")} · 42+ ${pv(p, "o")}`));
    }
    return out;
  }
  function hoverHTML(f) {
    return `<strong>${esc(featureTitle(f))}</strong>${featureLines(f).map((l) => `<div>${l}</div>`).join("")}`;
  }

  /* ---------- hover ---------- */
  function installHover() {
    if (matchMedia("(pointer:coarse)").matches) return;
    S.map.on("mousemove", (e) => {
      S.hoverEvent = e;
      if (S.hoverFrame) return;
      S.hoverFrame = requestAnimationFrame(() => { S.hoverFrame = 0; updateHover(S.hoverEvent); });
    });
    S.map.on("mouseout", clearHover);
    S.map.on("zoomstart", clearHover);
  }
  function updateHover(e) {
    if (!S.pickIndex || !e?.latlng || S.dataset === "terrain" || S.terrain3DVisible) { clearHover(); return; }
    const hits = S.pickIndex.pick({ map: S.map, latlng: e.latlng, tolerancePx: POINT_LAYERS.has(S.dataset) || S.dataset === "roads" ? 8 : 2, limit: 1 });
    const f = hits?.features?.[0];
    if (!f) { clearHover(); return; }
    if (S.hoverId !== f.properties.id) {
      S.hoverId = f.properties.id;
      if (S.hoverLayer) S.map.removeLayer(S.hoverLayer);
      S.hoverLayer = L.geoJSON(f, { pane: "selected", interactive: false, style: { color: mapToken("hoverStroke"), weight: 2.5, fill: false, opacity: 1 },
        pointToLayer: (_f, ll) => L.circleMarker(ll, { pane: "selected", radius: 9, color: mapToken("hoverStroke"), weight: 2, fill: false, interactive: false }) }).addTo(S.map);
    }
    if (!S.hoverTooltip) S.hoverTooltip = L.tooltip({ className: "sila-hover", direction: "top", offset: [0, -10], opacity: 1 });
    S.hoverTooltip.setLatLng(e.latlng).setContent(hoverHTML(f));
    if (!S.map.hasLayer(S.hoverTooltip)) S.hoverTooltip.openOn(S.map);
    $("map").style.cursor = "pointer";
  }
  function clearHover() {
    S.hoverId = null;
    if (S.hoverLayer) { S.map?.removeLayer(S.hoverLayer); S.hoverLayer = null; }
    if (S.hoverTooltip && S.map?.hasLayer(S.hoverTooltip)) S.map.removeLayer(S.hoverTooltip);
    if ($("map")) $("map").style.cursor = "";
  }

  /* ---------- click popup ---------- */
  function featureCenter(f) {
    const g = f.geometry;
    if (g.type === "Point") return L.latLng(g.coordinates[1], g.coordinates[0]);
    try { return L.geoJSON(f).getBounds().getCenter(); } catch (_) { return S.map.getCenter(); }
  }
  function closePopup() { if (S.popup && S.map) S.map.closePopup(S.popup); S.popup = null; }
  function openPopupFor(f, latlng) {
    if (!S.map) return;
    closePopup();
    const rows = popupRows(f);
    const sv = f.geometry && S.dataset !== "popgrid" ? streetView(f) : null;
    /* Revision 1.9: a compact peek, not a second record card. Title, the two or three figures that matter for this
       layer, a one-line notice when there is something to check, and two actions; everything else is in the panel. */
    const narrow = (S.map.getContainer().clientWidth || 999) < 520;
    const peek = rows.slice(0, narrow ? 1 : 3), nFlags = recordFlagList(f).length;
    /* Revision 2.0: the popup's map link opens Google Maps with a pin here (never a blank panorama); the facing Street View link is on the card. */
    const svTitle = text("เปิด Google Maps ที่จุดนี้ในแท็บใหม่", "Open Google Maps here in a new tab");
    const svLink = sv ? `<a class="popup-link ext-link" href="${esc(sv.pinHref)}" target="_blank" rel="noopener noreferrer" title="${esc(svTitle)}">${window.SilaIcons?.icon("map", { size: 16 }) || ""}<span>Google Maps</span>${extMark()}</a>` : "";
    const flagLine = nFlags ? `<p class="popup-flag">${ui("needscheck")}<span>${text(`มีข้อควรตรวจ ${num(nFlags)} ข้อ`, `${num(nFlags)} thing${nFlags > 1 ? "s" : ""} to check`)}</span></p>` : "";
    const html = `<div class="popup-peek"><p class="popup-title">${esc(featureTitle(f))}</p>${peek.length ? `<dl class="popup-dl">${peek.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>` : ""}${flagLine}<div class="popup-actions"><button type="button" class="popup-more" data-record-focus>${window.SilaIcons?.icon("info", { size: 16 }) || ""}<span>${text("รายละเอียด", "Details")}</span></button>${svLink}</div></div>`;
    S.popup = L.popup({ maxWidth: narrow ? 248 : 276, minWidth: narrow ? 240 : 250, className: "sila-popup", autoPanPaddingTopLeft: [12, 60], autoPanPaddingBottomRight: [12, 12 + sheetCover()], closeButton: true }).setLatLng(latlng || featureCenter(f)).setContent(html).openOn(S.map);
    // Numerals and link cues are added just after insertion; re-measure so the peek is panned fully into view.
    const opened = S.popup;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (S.popup === opened && opened.isOpen()) opened.update(); }));
  }
  /* The popup leads with what the layer is about: on the tax map, the tax figures come first. */
  function popupRows(f) {
    const rows = recordRows(f);
    if (S.dataset === "buildings" && S.buildingView === "tax") {
      /* In the tax view the popup leads with the tax of the titles under the building. */
      const u = buildingUnit(f.properties), ids = u?.kind === "group" ? S.parcelTax.buildingGroups.get(u.id) || [] : u ? [u.id] : [];
      const lead = [[text("คิดภาษีกับ", "Taxed with"), ids.length ? esc(ids.map((id) => text(`แปลง ${codeOf(id)}`, `parcel ${codeOf(id)}`)).join(", ")) + (ids.length > 1 ? esc(text(" (ชุดที่น่าจะคิดรวมกัน)", " (likely taxed together)")) : "") : text("โฉนดใต้อาคารยังจับคู่กับบัญชีภาษีไม่ได้", "Titles under it are not matched to the tax roll")]];
      for (const [k, scen] of [[text("ภาษีปี 2569 ที่ประเมิน", "2569 assessed"), "assessed69"], [text("ปี 2570 วิธีเดิม", "2570 current method"), "old70"], [text("ปี 2570 ตามข้อเสนอ", "2570 with fixes"), "new70"]]) {
        const v = unitValue(u, scen); if (u) lead.push([k, v == null ? text("ยังไม่มีตัวเลข", "No figure") : money(v, 2)]);
      }
      return lead.concat(rows.slice(0, 2)).slice(0, 7);
    }
    if (S.dataset === "floodsites") return rows.slice(0, 4);
    if (S.dataset === "properties") {   // the peek leads with the gain and the priority, then the size
      const pick = [text("เพิ่มได้ต่อปี", "Can be added a year"), text("ลำดับที่ควรจัดการ", "Priority rank"), text("แปลงในทรัพย์สิน", "Parcels in the property")];
      const lead = pick.map((k) => rows.find((x) => x[0] === k)).filter(Boolean);
      return lead.concat(rows.filter((x) => !lead.includes(x))).slice(0, 8);
    }
    if (S.dataset === "negotiate" || S.dataset === "agriwatch" || S.dataset === "portfolio") {
      const pick = S.dataset === "negotiate" ? [text("เก็บเพิ่มได้ต่อปี", "Can be added a year"), text("กลุ่มข้อเสนอ", "Initiatives"), text("ภาษีปี 2569 ที่ประเมิน", "2569 assessed")]
        : S.dataset === "agriwatch" ? [text("ถ้าพบว่าไม่ได้ทำประโยชน์", "If found unused"), text("มูลค่าที่ดิน", "Land value"), text("ภาษีปี 2569 ที่ประเมิน", "2569 assessed")]
        : [text("เจ้าของ (บัญชีปี 2563)", "Owner (2563 list)"), text("ภาษีปี 2569 ที่ประเมิน", "2569 assessed"), text("มูลค่าที่ดิน", "Land value")];
      const lead = pick.map((k) => rows.find((x) => x[0] === k)).filter(Boolean);
      return lead.concat(rows.filter((x) => !lead.includes(x))).slice(0, 8);
    }
    if (S.dataset !== "taxmap") return rows.slice(0, 6);
    const r = taxRow(f.properties.id), find = (k) => rows.find((x) => x[0] === k);
    const out = [];
    if (!r) out.push([text("ภาษี", "Tax"), text("ยังไม่พบแปลงนี้ในบัญชีภาษี", "Not found on the tax roll")]);
    else if (S.taxScenario === "delta") out.push([text("ส่วนต่าง 2570 กับ 2569", "Change 2570 vs 2569"), r.delta == null ? "—" : `${r.delta > 0 ? "+" : ""}${money(r.delta, 2)}`]);
    for (const k of [text("ภาษีปี 2569 ที่ประเมิน", "2569 assessed"), text("ปี 2570 วิธีเดิม", "2570 current method"), text("ปี 2570 ตามข้อเสนอ", "2570 with fixes"), text("การชำระปี 2569", "2569 payment"), text("หมู่บ้าน", "Village"), text("การใช้ประโยชน์ปี 2569", "Use in 2569"), text("ราคาประเมิน", "Appraisal")]) {
      const row = find(k);
      if (row) out.push(row);
    }
    return out.slice(0, 8);
  }
  /* [label, html] pairs shared by the popup and the record card. Values are escaped here. */
  function recordRows(f) {
    const p = f.properties, rows = [], villageNames = (p.villageIds || []).map((id) => { const v = S.metadata.villages.find((x) => x.id === id); return v ? (S.lang === "th" ? v.label : `Village ${v.number} · ${v.name}`) : id; }).join(", ");
    const add = (k, v) => { if (v != null && v !== "") rows.push([k, v]); };
    if (S.dataset === "floodsites") {
      add(text("สาเหตุตามข้อมูลเดิม", "Cause on record"), esc(p.cause));
      add(text("ทางเลือกแรก", "First option"), esc(p.option1));
      add(text("ทางเลือกเพิ่ม", "Further option"), esc(p.option2));
      add(text("ทางรับ · ลำดับเริ่มงาน", "Receiver · sequence"), esc(p.receiver));
      add(text("สิ่งที่ควรทำก่อน", "What to do first"), esc(p.firstAction));
      if (p.options?.length) add(text("เลือกเมื่อ", "Choose when"), `<ul class="plain-list">${p.options.map((o) => `<li><strong>${esc(o.option)}</strong> · ${esc(o.when)}</li>`).join("")}</ul>`);
      add(text("แนวสำรวจตามถนน", "Survey route along roads"), p.surveyRouteM ? esc(text(`ประมาณ ${num(p.surveyRouteM)} เมตร · ไม่ใช่ระยะท่อที่สำรวจแล้ว`, `about ${num(p.surveyRouteM)} m · not a surveyed pipe length`)) : null);
      add(text("หมู่บ้าน", "Village"), esc(villageNames));
      add(text("สถานะพิกัด", "Coordinate status"), esc(floodStatusText(p, true)));
      add(text("หมายเหตุ", "Note"), p.areaNote ? esc(p.areaNote) : null);
      add(text("ที่มา", "Source"), esc(p.sourceNote));
      return rows;
    }
    if (S.dataset === "houses") {
      add(text("บ้านเลขที่", "House number"), esc(p.houseNumber || text("ไม่มีในแบบสำรวจ", "Not in survey")));
      add(text("หมู่บ้าน", "Village"), esc(villageNames));
      add(text("ประเภทอาคาร", "Building type"), esc(sv(p.type) || text("ไม่มีในแบบสำรวจ", "Not in survey")));
      add(text("วัสดุ", "Material"), esc(sv(p.material)));
      add(text("จำนวนชั้น", "Floors"), p.floors ? num(p.floors) : null);
      add(text("อายุอาคาร", "Building age"), p.age != null ? `${num(p.age)} ${text("ปี", Number(p.age) === 1 ? "year" : "years")}` : null);
      add(text("รูปอาคาร", "Footprint"), p.buildingId
        ? (p.buildingMatch === "near" ? text(`ติดรูปอาคาร #${num(Number(p.buildingId.slice(10)))} ห่าง ${num(p.buildingDistM, 1)} ม.`, `Beside footprint #${num(Number(p.buildingId.slice(10)))}, ${num(p.buildingDistM, 1)} m away`)
          : text(`อยู่ในรูปอาคาร #${num(Number(p.buildingId.slice(10)))}`, `Inside footprint #${num(Number(p.buildingId.slice(10)))}`))
        : text(`ยังไม่มีรูปอาคาร${p.buildingDistM != null ? ` · รูปที่ใกล้สุดห่าง ${num(p.buildingDistM, p.buildingDistM < 100 ? 1 : 0)} ม.` : ""}`, `No footprint yet${p.buildingDistM != null ? ` · nearest is ${num(p.buildingDistM, p.buildingDistM < 100 ? 1 : 0)} m away` : ""}`));
      add(text("การใช้ตามสำรวจ", "Surveyed use"), esc(sv(p.use) || text(...USE_OTHER_LABEL)));
      add(text("ชั้นที่ใช้ค้าขาย", "Commercial floor"), p.commercial ? text("มี", "Yes") : text("ไม่พบ", "None found"));
      add(text("ตำแหน่งใหม่จากการสำรวจ", "New position from the survey"), p.newPoint ? text("ใช่ · อาจยังไม่อยู่ในบัญชี", "Yes · may be missing from the roll") : text("ไม่ใช่", "No"));
      if (p.parcelId) {
        const a = parcelAttr(p.parcelId), r = taxRow(p.parcelId);
        add(text("โฉนด", "Title"), `<button type="button" class="portfolio-link" data-goto="taxmap|${esc(p.parcelId)}">${esc(text(`แปลง ${codeOf(p.parcelId)}`, `Parcel ${codeOf(p.parcelId)}`))}</button>${esc(p.parcelFrom === "p" ? text(" · แปลงที่หมุดตั้งอยู่", " · parcel the point stands in") : text(" · โฉนดหลักของอาคาร", " · main title of the building"))}`);
        add(text("ภาษีของโฉนด", "Tax of the title"), esc(!a ? text("ยังจับคู่กับบัญชีภาษีไม่ได้", "Not matched to the tax roll") : r?.assessed69 == null ? text("ยังไม่มีตัวเลขภาษี", "No tax figure") : text(`ปี 2569 ${money(r.assessed69, 2)} · ปี 2570 ${money(r.new70, 2)}`, `2569 ${money(r.assessed69, 2)} · 2570 ${money(r.new70, 2)}`)));
      }
    } else if (S.dataset === "buildings") {
      if (p.houseNumbers?.length || p.surveyPoints) add(text("บ้านเลขที่ในอาคาร", "House numbers"), esc(houseNumbersText(p.houseNumbers, 12) || text("ไม่มีในแบบสำรวจ", "None in the survey")));
      if (p.roll) add(text("บัญชีสิ่งปลูกสร้าง", "Building roll"), esc(text(...(rollGroup(p)?.label || ["อาคารไม่ตรงแปลงใด", "No parcel under the building"]))) + (p.rollValue != null
        ? esc(p.rollShared
          ? text(` · รายการที่ผูกได้ ${num(p.rollRecords)} รายการ มูลค่ารวม ${moneyShort(p.rollValue)} ใช้ร่วมกับอาคารอื่น ${num(p.rollShared)} หลังที่บ้านเลขที่และโฉนดเดียวกัน`, ` · ${num(p.rollRecords)} linked entr${p.rollRecords > 1 ? "ies" : "y"} worth ${moneyShort(p.rollValue)} in total, shared with ${num(p.rollShared)} other building(s) on the same house number and title`)
          : text(` · มูลค่าในบัญชี ${moneyShort(p.rollValue)}`, ` · roll value ${moneyShort(p.rollValue)}`))
        : ""));
      add(text("หมุดทะเบียนบ้าน", "House-register points"), esc(registryText(p)) + (p.surveyPoints ? esc(p.registeredHouses ? text(` · มีรหัสประจำบ้าน ${num(p.registeredHouses)}`, ` · ${num(p.registeredHouses)} with a house code`) : text(" · ยังไม่มีรหัสประจำบ้าน", " · no house code yet")) : ""));
      add(text("ประเภทอาคาร", "Building type"), esc(sv(p.type) || text("ไม่มีผลสำรวจ", "No survey")));
      add(text("จำนวนชั้น", "Floors"), p.floors ? num(p.floors) : null);
      add(text("วัสดุ", "Material"), esc(sv(p.material)));
      add(text("อายุอาคาร", "Building age"), p.age != null ? `${num(p.age)} ${text("ปี", Number(p.age) === 1 ? "year" : "years")}` : null);
      add(text("การใช้ตามสำรวจ", "Surveyed use"), p.use ? esc(sv(p.use)) : surveyedBuilding(p) ? esc(text(...USE_OTHER_LABEL)) : null);
      add(text("พื้นที่หลังคา", "Roof area"), `${num(p.areaM2)} ${text("ตร.ม.", "m²")}`);
      add(text("มูลค่าอาคารประมาณ", "Estimated building value"), p.estValue != null ? money(p.estValue) : text("ยังคิดไม่ได้", "Not calculable"));
      add(text("ตั้งอยู่บนแปลง", "Parcels under it"), p.parcelCount ? `${num(p.parcelCount)} ${text("แปลง", p.parcelCount === 1 ? "parcel" : "parcels")}` : text("ไม่ตรงแปลงใด", "No parcel match"));
    } else if (["taxmap", "appraisal", "negotiate", "agriwatch", "portfolio"].includes(S.dataset)) {
      const a = parcelAttr(p.id), r = taxRow(p.id);
      if (S.dataset === "negotiate" && r && r.assessed69 != null) {
        const g = negotiateGain(r);
        add(text("เก็บเพิ่มได้ต่อปี", "Can be added a year"), g >= 0.5 ? `<strong>+${esc(money(g, 0))}</strong>` : text("ไม่มีส่วนเพิ่ม", "Nothing to add"));
        const parts = [...r.alloc.entries()].filter(([id, v]) => v >= (id === TAX_AUDIT?.id ? AUDIT_MIN : 0.5)).sort((x, y) => y[1] - x[1]);
        if (parts.length) add(text("กลุ่มข้อเสนอ", "Initiatives"), parts.map(([id, v]) => `<span class="init-chip" style="--chip:${initiativeColor(id)}">${esc(initiativeShort(id))} +${esc(fixed(v, 0))}</span>`).join(" "));
        if (r.rollAbove >= 0.5) add(text("บัญชีเรียกเก็บสูงกว่าที่คำนวณ", "Roll bills above the computation"), esc(text(`${money(r.rollAbove, 0)} · ไม่หักออก ตรวจเหตุ`, `${money(r.rollAbove, 0)} · not deducted; check why`)));
      }
      if (S.dataset === "agriwatch") {
        const w = agriWatchRow(p.id);
        if (w) { add(text("ถ้าพบว่าไม่ได้ทำประโยชน์", "If found unused"), `<strong>+${esc(money(w.potential ?? 0, 0))}</strong> ${text("ต่อปี", "a year")}`); add(text("คิดจากอัตราที่ดินว่างเปล่า", "Vacant-land basis"), esc(text(`${money(w.ifVacant, 0)} ต่อปี (0.3% ของมูลค่าที่ดิน ไม่มียกเว้น)`, `${money(w.ifVacant, 0)} a year (0.3% of land value, no relief)`))); }
      }
      if (S.dataset === "portfolio") {
        const o = ownerOf(p.id);
        if (o) add(text("เจ้าของ (บัญชีปี 2563)", "Owner (2563 list)"), `<button type="button" class="portfolio-link" data-owner="${esc(o.code)}">${esc(text(`อันดับ ${num(o.rank)} · รหัส ${o.code}`, `Rank ${num(o.rank)} · code ${o.code}`))}</button> · ${esc(ownerTypeText(o))}`);
      }
      add(text("รหัสแปลง", "Parcel code"), esc(p.code || "—"));
      add(text("หมู่บ้าน", "Village"), esc(villageNames));
      if (a?.sqwa != null) add(text("เนื้อที่ตามบัญชี", "Area on the roll"), esc(sqwaText(a.sqwa)));
      else add(text("เนื้อที่ (วัดจากแผนที่)", "Area (map measure)"), `${num(p.areaM2)} ${text("ตร.ม.", "m²")}`);
      add(text("ราคาประเมิน", "Appraisal"), a?.price != null ? `${num(a.price)} ${text("บาท/ตร.ว.", "THB/sq wah")}` : text("ยังไม่มีข้อมูลส่วนนี้", "Not available"));
      if (a?.price != null && S.appraisalAdj) add(text("ราคาสมมติรอบ 2570–2573", "Assumed 2570–2573 price"), `${num(Math.round(a.price * (1 + S.appraisalAdj / 100)))} ${text("บาท/ตร.ว.", "THB/sq wah")} (${pctText(S.appraisalAdj)})`);
      add(text("มูลค่าที่ดิน", "Land value"), a?.landValue != null ? money(a.landValue) : null);
      add(text("การใช้ประโยชน์ปี 2569", "Use in 2569"), a?.useLabel ? esc(text(...a.useLabel)) + (a.mainHome ? text(" · บ้านหลังหลัก", " · main home") : "") : null);
      if (r) {
        add(text("ภาษีปี 2569 ที่ประเมิน", "2569 assessed"), money(r.assessed69, 2));
        add(text("การชำระปี 2569", "2569 payment"), statusHTML(r.status69));
        add(text("ปี 2570 วิธีเดิม", "2570 current method"), money(r.old70, 2));
        add(text("ปี 2570 ตามข้อเสนอ", "2570 with fixes"), money(r.new70, 2));
        if (r.vacancy) add(text("ทิ้งว่าง (ม.43)", "Vacancy (s.43)"), esc(vacancyText(r.vacancy)));
      }
    } else if (S.dataset === "businesses") {
      add(text("ชื่อจดทะเบียน", "Registered name"), esc(p.label));
      if (p.site) add(text("ชื่อสถานประกอบการ", "Trading name"), esc(p.site));
      add(text("ประเภท", "Type"), esc(businessKindText(p)));
      if (p.vatSince) add(text("จดทะเบียน VAT ตั้งแต่", "VAT registered since"), esc(text(`ปี ${p.vatSince}`, `${p.vatSince - 543}`)));
      add(text("หมู่บ้าน", "Village"), esc(villageNames));
      add(text("ตำแหน่ง", "Position"), esc(p.placedBy === "deed" ? text("แปลงที่มีเลขโฉนดตามที่อยู่", "the parcel with the deed number in the address") : p.placedBy === "house_no_only" ? text("บ้านเลขที่ตรงกับหมุดสำรวจ (ไม่มีหมู่) · อ่อนกว่า ควรตรวจ", "house number matches a survey point (no moo) · weaker, check") : p.placedBy === "house_no_moo_commercial" ? text("บ้านเลขที่และหมู่ตรงกับหมุดสำรวจที่ใช้ค้าขาย", "house number and moo match a commercial survey point") : text("บ้านเลขที่และหมู่ตรงกับหมุดสำรวจ", "house number and moo match a survey point")));
      if (p.commercialObserved != null) add(text("แบบสำรวจพบการค้าขาย", "Survey saw commercial use"), p.commercialObserved ? text("พบ", "Yes") : text("ไม่พบ", "Not seen"));
      if (p.website) add(text("เว็บไซต์ทางการ", "Official website"), `<a class="ext-link" href="${esc(p.website)}" target="_blank" rel="noopener noreferrer">${esc(p.website.replace(/^https:\/\//, "").replace(/\/$/, ""))}${extMark()}</a>`);
      if (p.parcelId) { const k = propKeyOf(p.parcelId); add(text("ตั้งอยู่บน", "Located on"), `<button type="button" class="portfolio-link" data-goto="${k ? "properties" : "taxmap"}|${esc(p.parcelId)}">${esc(k ? propName(k) : text(`แปลง ${codeOf(p.parcelId)}`, `Parcel ${codeOf(p.parcelId)}`))}</button>`); }
    } else if (S.dataset === "properties") {
      const key = propKeyOf(p.id), e = propRow(key), rk = propRanking();
      if (!key) {
        add(text("รหัสแปลง", "Parcel code"), esc(p.code || "—"));
        add(text("เจ้าของ", "Owner"), text("ยังไม่พบเจ้าของแปลงนี้ในบัญชี ภ.ด.ส.3 ปี 2563", "No owner for this parcel in the 2563 PDS 3 list"));
      } else {
        const ids = propParcels(key), code = propOwnerCode(key);
        add(text("แปลงในทรัพย์สิน", "Parcels in the property"), esc(text(`${num(ids.length)} แปลง`, `${num(ids.length)}`)));
        if (code) add(text("เจ้าของ (บัญชีปี 2563)", "Owner (2563 list)"), esc(ownerText(code)));
        if (e?.taxed) {
          const g = propGain(e);
          add(text("เพิ่มได้ต่อปี", "Can be added a year"), `<strong>${esc((g >= 0.5 ? "+" : "") + money(g, 2))}</strong> (${esc(pctLabel(propPct(e)))})`);
          if (rk?.rank.has(key)) add(text("ลำดับที่ควรจัดการ", "Priority rank"), esc(text(`${num(rk.rank.get(key))} จาก ${num(rk.list.length)} ทรัพย์สิน`, `${num(rk.rank.get(key))} of ${num(rk.list.length)} properties`)));
          add(text("ภาษีปี 2569 ที่ประเมิน", "2569 assessed"), money(e.assessed69, 2));
          add(text("ปี 2570 วิธีเดิม", "2570 current method"), money(e.old70, 2));
          add(text("ปี 2570 ตามข้อเสนอ", "2570 with fixes"), money(e.new70, 2));
          if (e.taxed < ids.length) add(text("แปลงที่ยังไม่มีตัวเลขภาษี", "Parcels without a tax figure"), esc(text(`${num(ids.length - e.taxed)} แปลง ไม่อยู่ในยอดนี้`, `${num(ids.length - e.taxed)}, not in these totals`)));
        } else add(text("ภาษี", "Tax"), text("ยังไม่มีตัวเลขภาษีของแปลงในทรัพย์สินนี้", "No tax figure for the parcels of this property"));
      }
    } else if (S.dataset === "popgrid") {
      if (p.suppressed) add(text("ตัวเลข", "Figures"), text("ปิดไว้ เพราะคนในรายชื่อน้อยกว่า 10 คนหรือบ้านน้อยกว่า 3 หลัง", "Hidden: fewer than 10 listed people or 3 households"));
      else {
        add(text("คนในรายชื่อ", "Listed people"), esc(pv(p, "t")));
        add(text("ชาย / หญิง", "Male / female"), esc(`${pv(p, "m")} / ${pv(p, "f")}`));
        add(text("เด็กต่ำกว่า 15 ปี", "Children under 15"), esc(pv(p, "c")));
        add(text("ประมาณ 15–42 ปี", "About 15–42"), esc(pv(p, "a")));
        add(text("ประมาณ 42 ปีขึ้นไป", "About 42 and over"), esc(pv(p, "o")));
        add(text("ไม่ทราบอายุ", "Age unknown"), esc(pv(p, "u")));
        if (p.hidden?.length) add(text("ปิดไว้เพิ่ม", "Also hidden"), text("กลุ่มที่ปิดไว้ช่วยไม่ให้คำนวณย้อนกลุ่มที่น้อยกว่า 5 ได้", "Hidden so a group under 5 cannot be worked out by subtraction"));
        add(text("บ้านที่มีรายชื่อ", "Households listed"), num(p.households));
      }
      add(text("หมุดสำรวจในช่อง", "Survey points in cell"), num(p.points));
    } else {
      add(text("ชื่อ", "Name"), esc(p.label || p.id));
      add(text("หมู่บ้าน", "Village"), esc(villageNames));
      if (p.roadName) add(text("ชื่อถนน", "Road"), esc(p.roadName));
    }
    return rows;
  }
  function recordFlags(f) {
    const flags = recordFlagList(f);
    return flags.length ? `<div>${flags.map((x) => `<span class="flag-chip">${ui("needscheck")}<span>${esc(x)}</span></span>`).join("")}</div>` : "";
  }
  function recordFlagList(f) {
    const p = f.properties, flags = [];
    if (S.dataset === "buildings" && p.straddle) flags.push(text("อาคารอยู่บนหลายแปลง · ตรวจว่ารวมฐานภาษีได้หรือไม่", "Spans parcels · check whether the tax base should be combined"));
    if (S.dataset === "buildings" && (p.surveyPoints || 0) >= 2) flags.push(text(`มี ${num(p.surveyPoints)} ทะเบียนบ้านในอาคารเดียว · ตรวจการให้เช่าหรือหลายครัวเรือน`, `${num(p.surveyPoints)} house registrations in one building · check renting or several households`));
    if (S.dataset === "buildings" && p.roll === "missing_house_no") flags.push(text("บ้านเลขที่ไม่อยู่ในบัญชีสิ่งปลูกสร้าง · ตรวจว่าตกสำรวจหรือไม่", "House number absent from the building roll · check whether it was missed"));
    if (S.dataset === "buildings" && p.roll === "house_no_unmatched") flags.push(text("บ้านเลขที่ไม่อยู่ในบัญชี แต่โฉนดใต้อาคารมีรายการอาคารที่ยังผูกกับรูปอาคารไม่ได้ · อาจเป็นหลังเดียวกันที่บันทึกโดยไม่มีบ้านเลขที่ ตรวจก่อนนับว่าตกสำรวจ", "House number not on the roll, but the title under it has roll buildings not yet linked · possibly this building recorded without a house number; check before counting it as missed"));
    if (S.dataset === "buildings" && p.roll === "house_no_elsewhere") flags.push(text("บ้านเลขที่อยู่ในบัญชีแต่ผูกกับโฉนดอื่น · ตรวจโฉนด", "House number on the roll under another title · check the deed"));
    if (S.dataset === "buildings" && p.attrFrom === "near") flags.push(text("ผูกหมุดจากระยะใกล้ ไม่ได้อยู่ในรูปอาคาร · ตรวจตำแหน่ง", "Joined from a nearby point, not inside the outline · check position"));
    if (S.dataset === "houses" && !p.buildingId) flags.push(text("หมุดนี้ยังไม่มีรูปอาคาร · อาจเป็นอาคารใหม่หรือหมุดวางคลาด", "No footprint for this point · possibly a new building or a misplaced point"));
    if (["taxmap", "appraisal", "negotiate", "agriwatch", "portfolio"].includes(S.dataset)) {
      if (p.straddleBuildings) flags.push(text(`มีอาคาร ${p.straddleBuildings} หลังคร่อมแปลงนี้กับแปลงข้างเคียง`, `${p.straddleBuildings} building(s) span this and a neighbouring parcel`));
      const pa = parcelAttr(p.id);
      if (pa?.missBld) flags.push(text(`อาคาร ${pa.missBld} หลังมีบ้านเลขที่แต่เลขนั้นไม่อยู่ในบัญชีสิ่งปลูกสร้าง · ควรตรวจ`, `${pa.missBld} building(s) have a house number absent from the building roll · check`));
      if (pa?.link === "house") flags.push(text("จับคู่โฉนดผ่านบ้านเลขที่ ไม่ใช่เลขโฉนด", "Title matched through house numbers, not the deed"));
      if (pa && pa.tax69 === 0 && ["other", "vacant"].concat(pa.mainHome ? [] : ["res"]).includes(pa.use) && (pa.landValue || 0) > 0) flags.push(text("ภาษี 0 บาท แต่บัญชีไม่ได้ระบุเป็นบ้านหลังหลักหรือเกษตร · ตรวจเหตุยกเว้นในบัญชี", "0 THB tax, but the roll records neither a main home nor farm use · check the exemption on the roll"));
      const reasons = PARCEL_TAX_LAYERS.has(S.dataset) ? (taxRow(p.id)?.reasons || []).map((r) => r[S.lang === "en" ? 1 : 0]) : [];
      if (reasons.length) flags.push(text(`ปี 2570 ตามข้อเสนอ ต่างจากวิธีเดิมเพราะ: ${reasons.join(" · ")} (สมมติจากแบบสำรวจ ต้องตรวจก่อน)`, `2570 with fixes differs because of: ${reasons.join(" · ")} (assumed from the survey; check first)`));
    }
    return flags;
  }

  /* ---------- legends ---------- */
  /* 41-sample legend: one flat swatch per bin in the order drawn (no gradient), end labels, and the full range table. */
  const lutNum = (v) => (Math.abs(v) >= 100 ? num(Math.round(v)) : num(v, Math.abs(v) >= 10 ? 1 : 2));
  function lutLegendHTML(c, noDataLabel, zeroLabel) {
    const m = c.cuts.length;
    if (!m) return `<div class="legend-title">${esc(c.title)}</div><p class="small-note">${text("ยังคำนวณช่วงสีไม่ได้", "Colour ranges are not available yet")}</p>`;
    let swatches = [], ends = [], rows = [];
    if (c.kind === "lut") {
      for (let j = 0; j <= m; j++) {
        const col = c.lut[m ? Math.round(j * 40 / m) : 0];
        swatches.push(col);
        rows.push([col, j === 0 ? text(`ต่ำกว่า ${lutNum(c.cuts[0])}`, `Under ${lutNum(c.cuts[0])}`) : j === m ? text(`${lutNum(c.cuts[m - 1])} ขึ้นไป`, `${lutNum(c.cuts[m - 1])} and above`) : `${lutNum(c.cuts[j - 1])}–${lutNum(c.cuts[j])}`]);
      }
      ends = [text(`ต่ำกว่า ${lutNum(c.cuts[0])}`, `Under ${lutNum(c.cuts[0])}`), lutNum(c.cuts[Math.floor(m / 2)]), text(`${lutNum(c.cuts[m - 1])} ขึ้นไป`, `${lutNum(c.cuts[m - 1])} and up`)];
    } else {
      const arm = (j) => (m ? Math.round(j * 19 / m) : 0);
      const range = (j) => (j === m ? text(`${lutNum(c.cuts[m - 1])} ขึ้นไป`, `${lutNum(c.cuts[m - 1])} and over`) : `${lutNum(j === 0 ? c.neutral : c.cuts[j - 1])}–${lutNum(c.cuts[j])}`);
      if (!c.oneSided) for (let j = m; j >= 0; j--) { swatches.push(c.lut[19 - arm(j)]); rows.push([c.lut[19 - arm(j)], text(`ลดลง ${range(j)}`, `Down ${range(j)}`)]); }
      swatches.push(c.lut[20]); rows.push([c.lut[20], c.pct ? text(`ไม่เพิ่ม (ไม่ถึง ${c.neutral}%)`, `No gain (under ${c.neutral}%)`) : text(`ไม่เปลี่ยน (ต่างไม่ถึง ${c.neutral} บาท)`, `No change (under ${c.neutral} THB)`)]);
      for (let j = 0; j <= m; j++) { swatches.push(c.lut[21 + arm(j)]); rows.push([c.lut[21 + arm(j)], text(`เพิ่มขึ้น ${range(j)}`, `Up ${range(j)}`)]); }
      const u = c.pct ? "%" : "";
      ends = c.oneSided ? [text("ไม่เพิ่ม", "No gain"), `+${lutNum(c.cuts[Math.floor(m / 2)])}${u}`, text(`+${lutNum(c.cuts[m - 1])}${u} ขึ้นไป`, `+${lutNum(c.cuts[m - 1])}${u} and up`)]
        : [text(`ลดลง ${lutNum(c.cuts[m - 1])}+`, `Down ${lutNum(c.cuts[m - 1])}+`), text("ไม่เปลี่ยน", "No change"), text(`เพิ่ม ${lutNum(c.cuts[m - 1])}+`, `Up ${lutNum(c.cuts[m - 1])}+`)];
    }
    const bar = `<div class="lut-bar" aria-hidden="true">${swatches.map((col) => `<span style="background:${col}"></span>`).join("")}</div>`;
    const endRow = `<div class="lut-ends"><span>${esc(ends[0])}</span><span>${esc(ends[1])}</span><span>${esc(ends[2])}</span></div>`;
    const extra = (zeroLabel ? `<div class="legend-class"><span class="legend-chip" data-state="zero" style="background:${c.lut[0]};--zero-outline:${SilaScales.zeroOutline(c.scaleId, S.theme)}"></span><span>${esc(zeroLabel)}</span></div>` : "")
      + `<div class="legend-class"><span class="legend-chip" data-state="no-data" style="background-color:${SilaScales.noData("price", S.theme)}"></span><span>${esc(noDataLabel)}</span></div>`;
    // The range list scrolls inside the legend, so the scroll box takes keyboard focus (axe scrollable-region-focusable).
    const table = `<details class="lut-table"><summary>${text(`ช่วงสีทั้งหมด ${rows.length} ช่วง`, `All ${rows.length} colour ranges`)}</summary><div class="lut-scroll" role="region" tabindex="0" aria-label="${esc(text(`ช่วงสี ${rows.length} ช่วงของ${c.title}`, `${rows.length} colour ranges of ${c.title}`))}"><ul>${rows.map(([col, label]) => `<li><span class="legend-chip" style="background:${col}"></span><span>${esc(label)}</span></li>`).join("")}</ul></div></details>`;
    const method = `<p class="legend-unit">${esc(text(`41 สีตาม LDS · ${c.refNote} · ช่วงคงที่ เปลี่ยนปีหรือเลื่อนแถบแล้วสีเปลี่ยนตามจำนวนเงิน`, `41 LDS colours · ${c.refNote} · fixed ranges, so colours follow the amount when the year or sliders change`))}</p>`;
    return `<div class="legend-title">${esc(c.title)}</div>${bar}${endRow}<div class="legend-classes">${extra}</div><div class="legend-unit">${esc(c.unit)}</div>${table.replace('<div class="lut-scroll"', method + '<div class="lut-scroll"')}`;
  }
  function analyticalLegend() {
    const c = S.classing;
    if (!c) return "";
    if (c.kind === "categorical") {
      const neutral = S.theme === "light" ? "#E6EAE6" : "#20292B";
      const rows = c.items.map((it) => `<div class="legend-class"><span class="legend-chip" style="background:${it.color}"></span><span>${esc(it.label)}</span></div>`).join("")
        + `<div class="legend-class"><span class="legend-chip" style="background:${neutral}"></span><span>${text("ไม่เพิ่ม", "Nothing to add")}</span></div>`
        + `<div class="legend-class"><span class="legend-chip" data-state="no-data" style="background-color:${SilaScales.noData("price", S.theme)}"></span><span>${text("ยังไม่อยู่ในบัญชีภาษี", "Not on the roll")}</span></div>`;
      return `<div class="legend-title">${esc(c.title)}</div><div class="legend-classes legend-classes-cat">${rows}</div><div class="legend-unit">${esc(c.unit)}</div>`;
    }
    if (c.kind === "lut" || c.kind === "lutdiv") {
      const noData = S.dataset === "appraisal" ? text("ยังไม่มีราคาประเมิน", "No appraisal yet") : S.dataset === "properties" ? text("ไม่พบเจ้าของในบัญชีปี 2563 หรือไม่มีตัวเลขภาษี (ไม่ใช่ศูนย์)", "No owner in the 2563 list or no tax figure (not zero)")
        : S.dataset === "portfolio" ? text("ไม่พบเจ้าของในบัญชีปี 2563", "No owner in the 2563 list") : S.dataset === "agriwatch" ? text("ไม่มีตัวเลขภาษีปี 2569 (ไม่ใช่ศูนย์)", "No 2569 figure (not zero)") : text("ไม่มีตัวเลขภาษีของแปลงนี้ (ไม่ใช่ศูนย์)", "No tax figure for this parcel (not zero)");
      return lutLegendHTML(c, noData, S.dataset === "taxmap" && c.kind === "lut" ? text("0 บาท (บัญชีระบุว่ายกเว้นทั้งหมด)", "0 THB (the roll shows it fully exempt)") : null);
    }
    let rows = "";
    if (c.kind === "diverging") {
      const cuts = c.cuts, n = cuts.length;
      const lab = (i) => {
        if (i === 3) return text(`ไม่เปลี่ยน (ต่างไม่ถึง ${c.neutral} บาท)`, `No change (under ${c.neutral} THB)`);
        const k = i < 3 ? 2 - i : i - 4; const lo = k === 0 ? c.neutral : cuts[k - 1], hi = cuts[k];
        const range = hi != null ? `${num(lo)}–${num(hi)}` : `≥ ${num(lo)}`;
        return i < 3 ? text(`ลดลง ${range}`, `Down ${range}`) : text(`เพิ่มขึ้น ${range}`, `Up ${range}`);
      };
      rows = c.colors.map((col, i) => `<div class="legend-class"><span class="legend-chip" style="background:${col}"></span><span>${esc(lab(i))}</span></div>`).join("");
    } else {
      rows = c.colors.map((col, i) => {
        const lo = i === 0 ? null : c.breaks[i - 1], hi = c.breaks[i];
        const range = lo == null ? text(`ต่ำกว่า ${num(hi)}`, `Under ${num(hi)}`) : hi == null ? text(`${num(lo)} ขึ้นไป`, `${num(lo)} and above`) : `${num(lo)}–${num(hi)}`;
        return `<div class="legend-class"><span class="legend-chip" style="background:${col}"></span><span>${esc(range)}</span></div>`;
      }).join("");
      if (S.dataset === "taxmap") rows += `<div class="legend-class"><span class="legend-chip" data-state="zero" style="background:${c.colors[0]};--zero-outline:${SilaScales.zeroOutline(c.scaleId, S.theme)}"></span><span>${text("0 บาท (บัญชีระบุว่ายกเว้นทั้งหมด)", "0 THB (the roll shows it fully exempt)")}</span></div>`;
    }
    if (S.dataset === "popgrid") rows += `<div class="legend-class"><span class="legend-chip" data-state="suppressed"></span><span>${text("ช่องที่ปิดตัวเลข (น้อยกว่า 10 คน หรือน้อยกว่า 3 บ้าน)", "Hidden cell (under 10 people or 3 households)")}</span></div><div class="legend-class"><span class="legend-chip" style="background:${S.theme === "light" ? "#DDE2DE" : "#26302F"};border:1.5px dashed ${S.theme === "light" ? "#3D4744" : "#C4CECA"}"></span><span>${text("กลุ่มที่เลือกมี 1–4 คน หรือปิดไว้", "Chosen group has 1–4 people, or is hidden")}</span></div>`;
    else rows += `<div class="legend-class"><span class="legend-chip" data-state="no-data" style="background-color:${SilaScales.noData("price", S.theme)}"></span><span>${S.dataset === "appraisal" ? text("ยังไม่มีราคาประเมิน", "No appraisal yet") : text("ไม่มีตัวเลขภาษีของแปลงนี้ (ไม่ใช่ศูนย์)", "No tax figure for this parcel (not zero)")}</span></div>`;
    return `<div class="legend-title">${esc(c.title)}</div><div class="legend-classes">${rows}</div><div class="legend-unit">${esc(c.unit)}</div>`;
  }
  function buildingLegend() {
    if (S.buildingView === "tax") return S.classing ? lutLegendHTML(S.classing, text("ยังไม่มีตัวเลขภาษีของโฉนดใต้อาคาร (ไม่ใช่ศูนย์)", "No tax figure for the titles under it (not zero)"), S.classing.kind === "lut" ? text("0 บาท (บัญชีระบุว่ายกเว้นทั้งหมด)", "0 THB (the roll shows it fully exempt)") : null)
      : `<p class="small-note">${text("กำลังเปิดข้อมูลภาษี…", "Opening tax data…")}</p>`;
    if (S.buildingView === "straddle") return `<div class="legend-title">${text("อาคารที่อยู่บนหลายแปลง", "Buildings spanning parcels")}</div><div class="legend-classes"><div class="legend-class"><span class="legend-chip" style="background:${catHex("coral")}"></span><span>${text("แปลงที่สองมีหลังคาตั้งแต่ 25% และ 20 ตร.ม.", "Second parcel holds ≥25% and 20 m² of the roof")}</span></div><div class="legend-class"><span class="legend-chip" style="background:${S.theme === "light" ? "#DCE1DD" : "#33403D"}"></span><span>${text("อาคารอื่น", "Other buildings")}</span></div></div>`;
    if (S.buildingView === "roll") return `<div class="legend-title">${text("อาคารกับบัญชีสิ่งปลูกสร้างปี 2569", "Buildings and the 2569 building roll")}</div><div class="legend-classes one-col">${ROLL_GROUPS.map((g) => `<div class="legend-class"><span class="legend-chip" style="background:${catHex(g.color)}"></span><span>${esc(text(...g.label))}</span></div>`).join("")}<div class="legend-class"><span class="legend-chip" data-state="no-data" style="background-color:${SilaScales.noData("price", S.theme)}"></span><span>${text("ไม่ตรงแปลงใด", "No parcel under it")}</span></div></div><div class="legend-unit">${text("ผูกเมื่อบ้านเลขที่ในอาคารและโฉนดใต้อาคารตรงกับรายการในบัญชี · สีแยกประเภท ไม่ใช่ระดับความเสี่ยง", "Linked when the building’s house number and the title under it both match a roll entry · colours separate categories, not risk")}</div>`;
    if (S.buildingView === "registry") {
      const cls = REGISTRY_CLASSES(), dark = S.theme !== "light" ? "#F1F4EF" : "#182327";
      const row = (fill, label) => `<div class="legend-class"><span class="legend-chip" style="background:${fill}"></span><span>${esc(label)}</span></div>`;
      return `<div class="legend-title">${text("หมุดทะเบียนบ้านต่ออาคาร", "House-register points per building")}</div><div class="legend-classes">${row(cls[2], text("4 หมุดขึ้นไป", "4 or more"))}${row(cls[1], text("2–3 หมุด", "2–3"))}${row(cls[0], text("1 หมุด", "1"))}<div class="legend-class"><span class="legend-chip" data-state="no-data" style="background-color:${SilaScales.noData("count", S.theme)}"></span><span>${text("ไม่พบหมุดสำรวจ (ไม่ทราบ ไม่ใช่ศูนย์)", "No survey point (unknown, not zero)")}</span></div><div class="legend-class"><span class="legend-chip" style="background:transparent;border:1.5px dashed ${dark}"></span><span>${text("ผูกจากหมุดที่อยู่ติดอาคาร ≤5 ม.", "Joined from a point ≤5 m away")}</span></div></div><div class="legend-unit">${text("นับหมุดจากแบบสำรวจอาคาร 19 ต.ค. 2569 · ไม่พบหมุด อาจเป็นอาคารประกอบ อาคารที่ไม่ได้อยู่อาศัย หรือยังไม่สำรวจ", "Points from the 19 Oct 2026 building survey · none found can mean an annex, a non-residential building or no survey yet")}</div>`;
    }
    if (S.buildingView === "use") return `<div class="legend-title">${text("การใช้อาคารตามแบบสำรวจ", "Surveyed building use")}</div><div class="legend-classes">${[...[{ label: ["มีชั้นที่ใช้ค้าขาย", "Commercial floor"], color: "yellow" }], ...USE_GROUPS].map((g) => `<div class="legend-class"><span class="legend-chip" style="background:${catHex(g.color)}"></span><span>${esc(text(...g.label))}</span></div>`).join("")}<div class="legend-class"><span class="legend-chip" style="background:${S.theme === "light" ? "#DCE1DD" : "#33403D"};border:1px solid ${S.theme === "light" ? "#8C968F" : "#46524F"}"></span><span>${esc(text(...USE_OTHER_LABEL))}</span></div><div class="legend-class"><span class="legend-chip" data-state="no-data" style="background-color:${SilaScales.noData("price", S.theme)}"></span><span>${text("ไม่มีหมุดสำรวจ", "No survey point")}</span></div></div><div class="legend-unit">${text("สีแยกประเภท ไม่ใช่ระดับความเสี่ยง · ไม่แยกอยู่เองกับบ้านว่างรายหลัง เพื่อความปลอดภัยของบ้านที่ไม่มีคนอยู่", "Colours separate categories, not risk · owner-occupied and empty homes are not told apart, for the safety of empty homes")}</div>`;
    return "";
  }

  /* ---------- supplements: non-map summaries folded into a map layer ---------- */
  function supplementsHTML() {
    const ids = Missions.layer(S.dataset)?.supplements || [];
    return ids.map((id) => {
      let body = "";
      if (id === "flood") body = floodContent();
      else if (PublicAggregates.get(S.publicSummary, id)) body = PublicAggregates.render(S.publicSummary, id, { language: S.lang, tab: "overview", scopeLabel: scopeLabel() });
      if (!body) return "";
      return `<details class="supplement"><summary>${esc(text(...(Missions.supplementTitles[id] || ["ข้อมูลเสริม", "More information"])))}</summary><div class="supplement-body">${body}</div></details>`;
    }).join("");
  }
  /* ---------- layer controls shown under the selectors ---------- */
  function renderLayerControls() {
    const mount = $("layer-controls");
    if (!mount) return;
    let html = "";
    if (S.dataset === "taxmap") {
      html = `<div class="control-card">${taxAssumptionsHTML()}</div>`;
    } else if (S.dataset === "properties") {
      html = `<div class="control-card"><span class="control-field">${text("สีบนแผนที่แสดง", "Map colours show")}</span><div class="segmented" role="group" aria-label="${text("เลือกตัวเลขที่ใช้ระบายสี", "Choose the figure for the colours")}">${[["thb", ["เพิ่มกี่บาท", "THB added"]], ["pct", ["เพิ่มกี่เปอร์เซ็นต์", "Percent added"]]].map(([id, l]) => `<button type="button" data-prop-metric="${id}" aria-pressed="${id === S.propMetric}">${esc(text(...l))}</button>`).join("")}</div>${taxAssumptionsHTML(false)}</div>`;
    } else if (S.dataset === "negotiate" || S.dataset === "agriwatch" || S.dataset === "portfolio") {
      html = "";   // assumptions live inside the explanation block of these maps
    } else if (S.dataset === "appraisal") {
      html = `<div class="control-card"><fieldset class="assumptions"><legend>${text("สมมติราคาประเมินรอบใหม่ (กรมธนารักษ์)", "Assumed new appraisal round (Treasury)")}</legend>${adjSliderHTML("appraisal-adj", text("ราคาที่ดิน เทียบรอบปัจจุบัน", "Land prices vs the current round"), S.appraisalAdj)}<p id="adj-note" class="small-note">${text("ที่ 0% แผนที่แสดงราคารอบปัจจุบัน เมื่อเลื่อนแถบ แผนที่และตัวเลขแสดงราคาที่สมมติ ช่วงสีคงเดิม สีจึงเปลี่ยนตามราคา · กรมธนารักษ์มีกำหนดประกาศราคาใหม่ 1 ธ.ค. 2569", "At 0% the map shows the current round; moving the slider shows assumed prices on the same colour ranges, so colours follow the price · the Treasury is due to publish new prices on 1 Dec 2569")}</p></fieldset></div>`;
    } else if (S.dataset === "popgrid") {
      html = `<div class="control-card"><span class="control-field">${text("สีบนแผนที่แสดง", "Map colours show")}</span><div class="segmented" role="group" aria-label="${text("เลือกกลุ่มคน", "Choose a group")}">${["t", "c", "a", "o", "m", "f"].map((id) => `<button type="button" data-pop-metric="${id}" aria-pressed="${id === S.popMetric}">${esc(popMetricLabel(id))}</button>`).join("")}</div><p class="small-note">${text("นับจากรายชื่อในแบบสำรวจอาคาร 19 ต.ค. 2569 ซึ่งมีรายชื่อเพียงบางหลัง อายุ 15–42 และ 42 ปีขึ้นไปประมาณจากประเภทเลขบัตรประชาชน", "Counted from member lists in the 19 Oct 2026 building survey, which only some houses have. The 15–42 and 42+ bands are estimated from the national ID type.")}</p></div>`;
    } else if (S.dataset === "terrain") {
      html = terrainSurfaceControlsHTML() + terrainControlsHTML();
    } else if (S.dataset === "buildings") {
      html = `<div class="control-card"><span class="control-field">${text("ระบายสีตาม", "Colour by")}</span><div class="segmented" role="group" aria-label="${text("ระบายสีอาคารตาม", "Colour buildings by")}">${[["type", ["อาคารทั้งหมด", "All buildings"]], ["tax", ["ภาษีของโฉนดใต้อาคาร", "Tax of the titles under it"]], ["roll", ["อยู่ในบัญชีภาษีหรือยัง", "On the tax roll?"]], ["registry", ["ทะเบียนบ้านต่ออาคาร", "House registrations"]], ["straddle", ["อยู่บนหลายแปลง", "Spans parcels"]], ["use", ["การใช้ตามสำรวจ", "Surveyed use"]]].map(([id, lab]) => `<button type="button" data-building-view="${id}" aria-pressed="${id === S.buildingView}">${esc(text(...lab))}</button>`).join("")}</div>${S.buildingView === "tax" ? `<p class="small-note">${text("อาคารคิดภาษีกับโฉนดใต้หลังคา โฉนดที่อาคารหลังเดียวกันคร่อม (หลังคาบนโฉนดที่สองอย่างน้อย 25% และ 20 ตร.ม. มีบ้านเลขที่ไม่เกินหนึ่งเลข และโฉนดที่สองไม่มีอาคารอื่น) นับเป็นชุดเดียวที่น่าจะคิดภาษีรวมกัน ต้องตรวจชื่อในโฉนดก่อนใช้", "A building is taxed with the titles under its roof. Titles joined by one building (at least 25% and 20 m² of the roof on the second title, one house number at most, no other building on the second title) count as one set that is likely taxed together; check the owner on the titles before use.")}</p>${taxAssumptionsHTML()}` : ""}</div>`;
    }
    mount.innerHTML = html;
  }

  const pctText = (v) => `${v > 0 ? "+" : ""}${v}%`;
  function adjSliderHTML(id, label, value) {
    return `<div class="control-field"><span id="${id}-label">${label}</span><div class="control-range"><input id="${id}" type="range" min="-30" max="100" step="5" value="${value}" aria-labelledby="${id}-label" aria-describedby="adj-note"><output id="${id}-value" for="${id}">${pctText(value)}</output></div></div>`;
  }
  /* Shared assumptions for the tax map and the buildings tax view: year shown, new appraisal round (land and buildings), fixes. */
  function taxAssumptionsHTML(withScenario = true) {
    const scen = ["assessed69", "old70", "new70", "delta"].map((id) => `<option value="${id}"${id === S.taxScenario ? " selected" : ""}>${esc(taxScenarioLabel(id))}</option>`).join("");
    const avail = (s) => S.parcelTax?.availability?.[s.id] !== false;
    const fixes = TAX_STRATEGIES.map((s) => `<label class="check-item"><input type="checkbox" data-strategy="${s.id}"${S.taxStrategies.has(s.id) && avail(s) ? " checked" : ""}${avail(s) ? "" : " disabled"}><span>${esc(text(...s.label))}<small>${esc(text(...(avail(s) ? s.basis : window.SilaTaxEngine.OWNER_REASON)))}</small></span></label>`).join("");
    const on = TAX_STRATEGIES.filter((s) => S.taxStrategies.has(s.id) && avail(s)).length;
    return (withScenario ? `<label class="control-field"><span>${text("สีบนแผนที่แสดง", "Map colours show")}</span><select id="tax-scenario">${scen}</select></label>` : "")
      + `<details class="fix-details"${S.appraisalAdj || S.bldAdj ? " open" : ""}><summary>${text(`สมมติราคาประเมินรอบใหม่${S.appraisalAdj || S.bldAdj ? ` (ที่ดิน ${S.appraisalAdj > 0 ? "+" : ""}${S.appraisalAdj}% · อาคาร ${S.bldAdj > 0 ? "+" : ""}${S.bldAdj}%)` : " (เท่าเดิม)"}`, `Assumed new appraisal round${S.appraisalAdj || S.bldAdj ? ` (land ${S.appraisalAdj > 0 ? "+" : ""}${S.appraisalAdj}% · buildings ${S.bldAdj > 0 ? "+" : ""}${S.bldAdj}%)` : " (unchanged)"}`)}</summary><fieldset class="assumptions"><legend class="sr-only">${text("สมมติราคาประเมินรอบใหม่ (กรมธนารักษ์)", "Assumed new appraisal round (Treasury)")}</legend>`
      + adjSliderHTML("appraisal-adj", text("ราคาที่ดิน เทียบรอบปัจจุบัน", "Land prices vs the current round"), S.appraisalAdj)
      + adjSliderHTML("building-adj", text("ราคาสิ่งปลูกสร้าง เทียบรอบปัจจุบัน", "Building prices vs the current round"), S.bldAdj)
      + `<p id="adj-note" class="small-note">${text("มีผลกับภาษีปี 2570 · กรมธนารักษ์มีกำหนดประกาศราคาใหม่ 1 ธ.ค. 2569 ระหว่างนี้ใช้แถบนี้สมมติ · ถ้าแผนที่แสดงปี 2569 อยู่ เลื่อนแถบแล้วจะเปลี่ยนไปแสดงปี 2570 ตามข้อเสนอ · ยังไม่ได้คิดค่าเสื่อมอาคารที่เพิ่มขึ้นหนึ่งปี", "Applies to the 2570 tax · the Treasury is due to publish new prices on 1 Dec 2569; until then use these to assume · if the map shows 2569, moving a slider switches it to 2570 with fixes · one more year of building depreciation is not included")}</p></fieldset></details>`
      + `<details class="fix-details"${!withScenario || S.taxScenario === "new70" || S.taxScenario === "delta" ? " open" : ""}><summary>${text(`ข้อเสนอที่คิดรวมในปี 2570 ตามข้อเสนอ (เลือก ${on} ข้อ)`, `Fixes in 2570 with fixes (${on} selected)`)}</summary><fieldset class="check-list"><legend class="sr-only">${text("ข้อเสนอที่คิดรวม", "Fixes included")}</legend>${fixes}</fieldset></details>`;
  }
  /* ---------- Revision 1.9: properties = adjoining parcels of one owner with their buildings ----------
     Owners come from the 2563 PDS 3 list and are assumed unchanged (2569 debtor links take precedence). A property is
     'g<grp>' for two or more adjoining parcels of one owner, or 'p<parcel id>' for a single owned parcel. */
  const propertyOf = (id) => S.parcelTax?.propertyOf?.get(id) ?? null;
  function propKeyOf(id) {
    const g = propertyOf(id);
    if (g != null) return "g" + g;
    return parcelAttr(id)?.tp ? "p" + id : null;
  }
  const propParcels = (key) => (!key ? [] : key[0] === "g" ? S.parcelTax?.properties?.get(Number(key.slice(1))) || [] : [key.slice(1)]);
  const propRow = (key) => (key ? S.taxResult?.byProperty?.get(key) || null : null);
  const propGain = (e) => (e && e.taxed ? e.new70 - e.old70 : null);
  const propPct = (e) => { const g = propGain(e); if (g == null) return null; if (e.old70 > 0) return (g / e.old70) * 100; return g >= 0.5 ? Infinity : 0; };
  const propValue = (key) => { const e = propRow(key); return S.propMetric === "pct" ? propPct(e) : propGain(e); };
  const propCode = (key) => (key?.[0] === "g" ? `P${key.slice(1).padStart(4, "0")}` : key ? codeOf(key.slice(1)) : "");
  const propName = (key) => (key?.[0] === "g" ? text(`ทรัพย์สิน ${propCode(key)}`, `Property ${propCode(key)}`) : text(`ทรัพย์สินแปลงเดียว · แปลง ${propCode(key)}`, `Single-parcel property · parcel ${propCode(key)}`));
  const pctLabel = (p) => (p == null ? "—" : p === Infinity ? text("จาก 0 บาท", "from 0 THB") : `${p >= 0 ? "+" : ""}${fixed(p, Math.abs(p) >= 10 ? 0 : 1)}%`);
  const propOwnerCode = (key) => { for (const id of propParcels(key)) { const tp = parcelAttr(id)?.tp; if (tp) return tp; } return null; };
  const STRATEGY_BY_ID = new Map([...TAX_STRATEGIES, ...(TAX_AUDIT ? [TAX_AUDIT] : [])].map((x) => [x.id, x]));
  /* Ranked work list: properties whose 2570 tax with fixes exceeds the current method, largest gain first (cached per run). */
  function propRanking() {
    const res = S.taxResult;
    if (!res?.byProperty) return null;
    if (S.propRankCache?.res === res) return S.propRankCache;
    const list = [...res.byProperty.values()].filter((e) => propGain(e) >= 1).sort((a, b) => propGain(b) - propGain(a) || (a.key < b.key ? -1 : 1));
    S.propRankCache = { res, list, rank: new Map(list.map((e, i) => [e.key, i + 1])) };
    return S.propRankCache;
  }
  /* Properties in the selected boundary: a property counts where any of its parcels lies in the boundary. */
  function propsInScope() {
    const fs = currentFeatures();
    if (S.propScopeCache?.fs === fs) return S.propScopeCache.keys;
    const keys = new Set();
    for (const f of fs) { const k = propKeyOf(f.properties.id); if (k) keys.add(k); }
    S.propScopeCache = { fs, keys };
    return keys;
  }
  function propScopeTotals() {
    const keys = propsInScope(), t = { n: 0, nGain: 0, gain: 0, old70: 0, new70: 0, assessed69: 0, byFix: new Map() };
    for (const k of keys) {
      const e = propRow(k);
      if (!e) continue;
      t.n++;
      if (!e.taxed) continue;
      t.assessed69 += e.assessed69; t.old70 += e.old70; t.new70 += e.new70;
      const g = propGain(e);
      if (g >= 1) { t.nGain++; t.gain += g; for (const [id, d] of e.reasons) t.byFix.set(id, (t.byFix.get(id) || 0) + d); }
    }
    return t;
  }
  const OWNER_KIND = { company: ["บริษัท", "company"], partnership: ["ห้างหุ้นส่วน", "partnership"], bank: ["ธนาคาร", "bank"], cooperative: ["สหกรณ์", "cooperative"], foundation: ["มูลนิธิ", "foundation"], association: ["สมาคม", "association"], religious: ["ศาสนสถาน", "religious body"], government: ["ส่วนราชการหรือรัฐวิสาหกิจ", "government body"], other: ["นิติบุคคลอื่น", "other juristic person"] };
  function ownerText(code) {
    const t = S.parcelTax?.taxpayers?.get(code);
    const kind = t?.type === "juristic" ? text(...(OWNER_KIND[t.kind] || ["นิติบุคคล", "juristic person"])) : t?.type === "individual" ? text("บุคคลธรรมดา", "individual") : text("ไม่ทราบประเภท", "type unknown");
    return text(`รหัส ${code} · ${kind}`, `code ${code} · ${kind}`);
  }
  const OWN_EVIDENCE = { ds: ["เลขโฉนดและหน้าสำรวจตรงกับบัญชีปี 2563", "deed and survey numbers match the 2563 list"], dl: ["เลขโฉนดและเลขที่ดินตรงกับบัญชีปี 2563", "deed and land numbers match the 2563 list"], dc: ["เลขโฉนดและรหัสแปลงตรงกับบัญชีปี 2563", "deed number and map code match the 2563 list"], du: ["เลขโฉนดตรงกับโฉนดเดียวในบัญชีปี 2563", "the deed number matches one title in the 2563 list"], ca: ["รหัสแปลงและเนื้อที่ตรงกับบัญชีปี 2563 (แผนที่ไม่มีเลขโฉนด)", "map code and area match the 2563 list (no deed number on the map)"], d69: ["บัญชีลูกหนี้ปี 2569", "the 2569 debtor list"] };
  function ownEvidenceText(own) {
    if (!own) return text("ยังไม่พบเจ้าของในบัญชีปี 2563", "No owner found in the 2563 list");
    const h = own !== "d69" && own.endsWith("h"), k = h ? own.slice(0, -1) : own;
    return text(...(OWN_EVIDENCE[k] || ["ไม่ทราบวิธีจับคู่", "matching method unknown"])) + (h ? text(" · บ้านเลขที่ในแปลงตรงกับบัญชี", " · house numbers on the parcel agree") : "");
  }
  const propertyFeatures = (key) => {
    const ids = new Set(propParcels(key)), fc = S.cache.get("data/parcels.geojson");
    return fc && ids.size ? fc.features.filter((x) => ids.has(x.properties.id)) : [];
  };
  /* Open a property from the ranked list: select one of its parcels in the boundary and fit the whole property. */
  function openProperty(key) {
    const ids = new Set(propParcels(key));
    const f = currentFeatures().find((x) => ids.has(x.properties.id));
    if (!f) { toast(text("ทรัพย์สินนี้ไม่อยู่ในขอบเขตที่เลือก", "This property is not in the selected boundary")); return; }
    selectRecord(f);
    if (S.selectedLayer && S.map && !S.terrain3DVisible) { S.interactionRevision++; S.map.fitBounds(S.selectedLayer.getBounds(), { ...fitPad(64), maxZoom: 19, animate: false }); openPopupFor(f); }
  }
  function propertiesContent() {
    if (!S.taxResult?.byProperty) return `<section class="panel-section">${notice(text("ยังเปิดข้อมูลภาษีไม่ได้", "Tax data is not open yet"), text("ลองโหลดหน้าใหม่", "Try reloading the page"))}</section>`;
    const t = propScopeTotals(), where = S.scope.type === "municipality" ? text("ทั้งเมือง", "whole city") : scopeLabel();
    const fixRows = [...t.byFix.entries()].filter(([, d]) => d >= 0.5).sort((a, b) => b[1] - a[1]);
    const sm = S.parcelTax?.summary?.ownersFrom2563;
    const chart = fixRows.length ? chartHTML("props-fixes", { type: "bars", items: fixRows.map(([id, d]) => ({ id, label: initiativeShort(id), value: Math.round(d), color: initiativeColor(id) })), format: "money" }, text(`บาทต่อปีที่เพิ่มได้ แยกตามข้อเสนอ คิดทีละข้อ · ${where}`, `THB a year that can be added, by fix applied alone · ${where}`), Math.max(130, 26 * fixRows.length + 40)) : "";
    return `<section class="panel-section"><h2 class="sr-only">${text("ทรัพย์สินรายเจ้าของ", "Properties by owner")}</h2>`
      + statsGrid([statHTML(t.old70, text("ปี 2570 วิธีเดิม", "2570 current method"), { small: true }), statHTML(t.new70, text("ปี 2570 ตามข้อเสนอ", "2570 with fixes"), { small: true }), statHTML(t.n, text("ทรัพย์สินที่มีเจ้าของในบัญชีปี 2563", "Properties with a 2563 owner"), { format: "count", small: true })])
      + `<button type="button" class="more-button" data-open-tab="list">${text(`ดูรายการที่ควรจัดการก่อน (${num(t.nGain)})`, `See what to handle first (${num(t.nGain)})`)}</button>`
      + chart
      + explainHTML(text("วิธีคิดและข้อจำกัด", "Method and limits"),
        noteP("ทรัพย์สิน = แปลงที่ขอบติดกันของเจ้าของเดียวกันพร้อมอาคาร เรียงตามเงินที่เพิ่มได้ต่อปี (ปี 2570 ตามข้อเสนอ ลบ วิธีเดิม) จากมากไปน้อย รายต้น ๆ คุ้มค่าที่จะตรวจก่อน แต่ทุกรายต้องตรวจโฉนด ทะเบียนบ้าน และการใช้จริงก่อนแจ้งประเมิน · แต่ละแท่งในกราฟคิดข้อเสนอทีละข้อ ผลรวมจึงต่างจากยอดที่คิดพร้อมกันเล็กน้อย", "A property is the adjoining parcels of one owner with their buildings, ranked by the tax that can be added a year (2570 with fixes minus the current method). The top ones are worth checking first, but every case needs the deed, house registration and actual use checked before any assessment · each bar applies one fix alone, so the bars differ slightly from the combined total")
        + noteP(`เจ้าของมาจากบัญชี ภ.ด.ส.3 ปี 2563 ที่เทศบาลส่งมา สมมติว่ายังไม่เปลี่ยน${sm ? ` · ผูกเจ้าของกับแปลงในบัญชีภาษีได้ ${num(sm.parcelsWithOwner)} แปลง` : ""} · ชื่อเจ้าของไม่แสดงบนเว็บ ใช้รหัสสุ่มแทน`, `Owners come from the 2563 PDS 3 list supplied by the municipality and are assumed unchanged${sm ? ` · ${num(sm.parcelsWithOwner)} parcels on the roll have an owner` : ""} · owner names are not shown; random codes are used`))
      + `</section>` + supplementsHTML() + notesLink();
  }

  /* ---------- Revision 2.0 panel pieces: stats, charts, explanations ---------- */
  /* Big number per LDS technical/data role: the figure in JetBrains Mono with its unit small beside it, the label under it.
     `value` is a number (formatted by `format`) or a ready string; null renders the no-data dash with a short reason. */
  const moneyParts = (v) => { const a = Math.abs(v); return a >= 1e6 ? [fixed(v / 1e6, 2), text("ล้านบาท", "M THB")] : [num(Math.round(v)), text("บาท", "THB")]; };
  function statHTML(value, label, opts = {}) {
    const fmtv = opts.format || "money";
    let n, u = opts.unit || "";
    if (value == null || (typeof value === "number" && !Number.isFinite(value))) { n = "—"; u = opts.noData || text("ยังไม่มีตัวเลข", "No figure"); }
    else if (typeof value === "string") n = value;
    else if (fmtv === "money") [n, u] = moneyParts(value);
    else if (fmtv === "percent") { n = fixed(value, Math.abs(value) >= 10 ? 0 : 1); u = "%"; }
    else n = num(value, opts.digits || 0);
    const sign = typeof value === "number" && opts.signed && value > 0 ? "+" : "";
    return `<div class="stat${opts.emphasis ? " stat-emphasis" : ""}${opts.small ? " stat-small" : ""}"><strong class="stat-value"><span class="num">${sign}${esc(n)}</span>${u ? `<small class="stat-unit">${esc(u)}</small>` : ""}</strong><span class="stat-label">${esc(label)}</span>${opts.note ? `<span class="stat-note">${esc(opts.note)}</span>` : ""}</div>`;
  }
  const statsGrid = (items) => `<div class="stats-grid">${items.join("")}</div>`;
  /* Charts are registered by id here and mounted after the HTML is in the DOM; the spec carries the DATAVIZ-01 declaration. */
  S.charts = new Map();
  function chartHTML(id, spec, caption, height = 200) {
    S.charts.set(id, spec);
    return `<figure class="chart-figure"><div class="chart" data-chart-id="${esc(id)}" style="height:${height}px" role="img" aria-label="${esc(caption)}"></div><figcaption>${esc(caption)}</figcaption></figure>`;
  }
  window.addEventListener("sila:am5-ready", () => mountCharts());
  function mountCharts() {
    const C = window.SilaCharts;
    if (!C || !C.available()) return;
    C.prune();
    document.querySelectorAll("[data-chart-id]").forEach((el) => {
      if (el.dataset.mounted === S.theme + S.lang + (el.dataset.specRev || "")) return;
      const spec = S.charts.get(el.dataset.chartId);
      if (!spec) return;
      C.render(el, spec, { theme: S.theme, lang: S.lang });
      el.dataset.mounted = S.theme + S.lang + (el.dataset.specRev || "");
    });
  }
  /* A collapsed explanation block: everything an officer does not need at first glance goes here (one layer deeper). */
  const explainHTML = (title, bodyHTML, open = false) => bodyHTML ? `<details class="explain"${open ? " open" : ""}><summary>${ui("info")}<span>${esc(title)}</span></summary><div class="explain-body">${bodyHTML}</div></details>` : "";
  const noteP = (th, en) => `<p class="small-note">${text(th, en)}</p>`;
  const whereText = () => (S.scope.type === "municipality" ? text("ทั้งเมือง", "whole city") : scopeLabel());

  /* ---------- Revision 2.0: negotiation plan ---------- */
  function negotiateContent() {
    const t = initiativeTotals();
    if (!t) return `<section class="panel-section">${notice(text("ยังเปิดข้อมูลภาษีไม่ได้", "Tax data is not open yet"), text("ลองโหลดหน้าใหม่", "Try reloading the page"))}</section>`;
    const where = whereText();
    const items = t.list.map((e) => ({ id: e.id, label: initiativeShort(e.id), value: Math.round(e.sum), color: initiativeColor(e.id) }));
    const chart = items.length ? chartHTML("negotiate-bars", { type: "bars", items, format: "money", emphasis: S.initiative || null }, text(`บาทต่อปีที่เก็บเพิ่มได้ แยกตามกลุ่มข้อเสนอ · ${where} · เทียบกับที่เรียกเก็บปี 2569 ราคาประเมินเท่าเดิม`, `THB a year that can be added, by initiative · ${where} · against the 2569 bill at current prices`), Math.max(140, 26 * items.length + 40)) : "";
    const rows = t.list.map((e) => `<button type="button" class="init-row${S.initiative === e.id ? " is-active" : ""}" data-initiative="${esc(e.id)}" aria-pressed="${S.initiative === e.id}"><span class="init-swatch" style="background:${initiativeColor(e.id)}"></span><span class="init-name">${esc(initiativeShort(e.id))}<small>${esc(text(`${num(e.parcels)} แปลง`, `${num(e.parcels)} parcels`))}</small></span><span class="init-amount num">+${esc(moneyShort(e.sum))}</span></button>`).join("");
    const picked = S.initiative ? t.list.find((e) => e.id === S.initiative) : null;
    const focus = S.initiative ? `<div class="focus-card"><div class="focus-head"><span class="init-swatch" style="background:${initiativeColor(S.initiative)}"></span><strong>${esc(initiativeShort(S.initiative))}</strong><button type="button" class="quiet" data-initiative="">${text("ดูทุกกลุ่ม", "All initiatives")}</button></div>`
      + statsGrid([statHTML(picked ? picked.sum : 0, text("เก็บเพิ่มได้ต่อปี", "Can be added a year"), { signed: true, emphasis: true }), statHTML(picked ? picked.parcels : 0, text("แปลงที่ต้องเจรจา", "Titles to negotiate"), { format: "count" })])
      + `<p class="focus-how">${ui("done")}<span>${esc(text(...(INITIATIVE_HOW[S.initiative] || ["", ""])))}</span></p>`
      + `<button type="button" class="more-button" data-show-list="initiative">${text("ดูรายการแปลง เรียงจากมากไปน้อย", "List the titles, largest first")}</button>`
      + explainHTML(text("ฐานกฎหมายและข้อสมมติ", "Legal basis and assumptions"), `<p>${esc(text(...(STRATEGY_BY_ID.get(S.initiative)?.basis || ["", ""])))}</p>`) + `</div>` : "";
    const totals = S.taxResult.totals;
    return `<section class="panel-section"><h2 class="sr-only">${text("แผนการเจรจา", "Negotiation plan")}</h2>`
      + focus + chart + `<div class="init-list">${rows}</div>`
      + (t.nAbove ? `<p class="small-note">${text(`อีก ${num(t.nAbove)} แปลง บัญชีเรียกเก็บสูงกว่าที่คำนวณได้ รวม ${moneyShort(t.rollAbove)} (ส่วนใหญ่คือที่ทิ้งว่างที่คิดอัตราสะสม) ไม่หักออกจากยอด`, `${num(t.nAbove)} more titles are billed above the computed figure, ${moneyShort(t.rollAbove)} in total (mostly vacant land at an escalated rate); not deducted`)}</p>` : "")
      + explainHTML(text("วิธีคิดและข้อจำกัด", "Method and limits"),
        noteP(`ส่วนเพิ่มของแต่ละแปลง = ภาษีตามกฎหมายเมื่อใช้ข้อเสนอที่เลือก ลบ ยอดที่เทศบาลเรียกเก็บปี 2569 ของแปลงนั้น (ภ.ด.ส.7) ถ้าคำนวณได้ต่ำกว่าที่เรียกเก็บ ถือว่าไม่มีส่วนเพิ่ม · แบ่งส่วนเพิ่มให้ข้อเสนอที่ทำให้ภาษีสูงขึ้น ส่วนที่เหลือคือบัญชีเรียกเก็บต่ำกว่าที่คำนวณจากข้อมูลเดียวกัน ซึ่งต้องตรวจทีละโฉนด ไม่ใช่ข้อเสนอ · ส่วนต่างต่ำกว่า ${num(AUDIT_MIN)} บาทต่อโฉนด (${num(t.nSmall)} โฉนด รวม ${moneyShort(t.rollBelowSmall)}) ไม่นำมานับ เพราะเป็นผลของการปัดเศษและค่าเสื่อม`,
          `A title’s gain = the law-based tax with the selected fixes minus what the municipality billed for it in 2569 (PDS 7); a computed figure below the bill adds nothing. The gain is allocated to the fixes that raise the tax; the rest is the roll billing below the law-based figure from the same data, a title-by-title check rather than a proposal. Gaps under ${num(AUDIT_MIN)} THB per title (${num(t.nSmall)} titles, ${moneyShort(t.rollBelowSmall)}) are left out as rounding and depreciation noise.`)
        + noteP(`ทั้งเมือง: เรียกเก็บปี 2569 ${moneyShort(totals.assessed69)} · คำนวณตามกฎหมายจากข้อมูลเดียวกันโดยไม่ใช้ข้อเสนอ ${moneyShort(totals.law69)} · ปี 2570 ตามข้อเสนอ ${moneyShort(totals.new70)} · ทุกข้อเป็นสมมติฐาน ต้องตรวจโฉนด ทะเบียนบ้าน และการใช้จริงก่อนแจ้งประเมิน เจ้าของมาจากบัญชีปี 2563 สมมติว่ายังไม่เปลี่ยน`,
          `Whole city: billed ${moneyShort(totals.assessed69)} in 2569 · law-based figure from the same data without fixes ${moneyShort(totals.law69)} · 2570 with fixes ${moneyShort(totals.new70)} · every item is a scenario; check the deed, house registration and actual use before any assessment. Owners from the 2563 list, assumed unchanged.`)
        + taxAssumptionsHTML(false))
      + `</section>` + supplementsHTML() + notesLink();
  }
  function negotiateListHTML() {
    const q = S.search.trim().toLowerCase(), init = S.initiative;
    const rowsAll = currentFeatures().map((f) => { const r = taxRow(f.properties.id); if (!r) return null; const v = init ? (r.alloc.get(init) || 0) : negotiateGain(r); const min = init === TAX_AUDIT?.id ? AUDIT_MIN : 0.5; return v >= min ? { f, r, v } : null; }).filter(Boolean);
    let list = rowsAll.sort((a, b) => b.v - a.v);
    if (q) list = list.filter((x) => searchText(x.f).includes(q));
    const rows = list.slice(0, S.page).map(({ f, r, v }) => {
      const dom = init || dominantOf(r);
      return `<button class="area-row row-figure" data-record="${esc(f.properties.id)}"><span class="area-name">${esc(featureTitle(f))}<span class="area-meta">${dom ? `<span class="init-chip" style="--chip:${initiativeColor(dom)}">${esc(initiativeShort(dom))}</span> ` : ""}${esc(text(`เรียกเก็บปี 2569 ${fixed(r.assessed69, 0)} บาท`, `billed ${fixed(r.assessed69, 0)} THB in 2569`))}${r.vacancy ? " · " + esc(text(`ทิ้งว่าง ${r.vacancy.yearsMin}–${r.vacancy.yearsMax} ปี`, `vacant ${r.vacancy.yearsMin}–${r.vacancy.yearsMax} yrs`)) : ""}</span></span><span class="row-amount num">+${esc(fixed(v, 0))}<small>${text("บาท/ปี", "THB/yr")}</small></span></button>`;
    }).join("");
    return searchInput() + (init ? `<div class="filter-row"><span class="init-chip" style="--chip:${initiativeColor(init)}">${esc(initiativeShort(init))}</span><button type="button" class="quiet" data-initiative="">${text("ดูทุกกลุ่ม", "All initiatives")}</button></div>` : "")
      + `<div class="section-title"><h2>${text("แปลงที่ควรเจรจาก่อน", "Titles to negotiate first")}</h2><span>${num(list.length)} ${text("แปลง", "titles")}</span></div><div class="area-list">${rows}</div>`
      + (!list.length ? `<div class="empty-state"><h3>${text("ไม่มีแปลงในกลุ่มนี้ในขอบเขตที่เลือก", "No titles for this group in the selected boundary")}</h3></div>` : "")
      + (list.length > S.page ? `<button class="more-button" data-more>${text("ดูเพิ่มอีก 60 รายการ", "Show 60 more")}</button>` : "")
      + `<button class="more-button" data-export>${ui("csv", 18)}${text("ดาวน์โหลดรายการ · CSV", "Download the list · CSV")}</button>`;
  }
  function exportNegotiateCSV() {
    const init = S.initiative, min = (id) => (id === TAX_AUDIT?.id ? AUDIT_MIN : 0.5);
    const list = currentFeatures().map((f) => { const r = taxRow(f.properties.id); if (!r) return null; const v = init ? (r.alloc.get(init) || 0) : negotiateGain(r); return v >= (init ? min(init) : 0.5) ? { f, r, v } : null; }).filter(Boolean).sort((a, b) => b.v - a.v);
    const r2 = (v) => (v == null || !Number.isFinite(Number(v)) ? "" : Math.round(Number(v) * 100) / 100);
    const cols = ["parcelCode", "village", "billed2569THB", "lawBased2569THB", "tax2570CurrentMethodTHB", "tax2570WithFixesTHB", "gainVsBillTHB", "leadInitiative", "allocation", "rollAboveTHB", "vacancyYears", "vacancyRateNow"];
    const quote = (v) => { let c = String(v ?? ""); if (/^[=+@\-\t\r]/.test(c)) c = "'" + c; return '"' + c.replace(/"/g, '""') + '"'; };
    const lines = list.map(({ f, r, v }) => [f.properties.code || f.properties.id, villageNamesOf(f).join("|"), r2(r.assessed69), r2(r.law69), r2(r.old70), r2(r.new70), r2(v), dominantOf(r) || "", [...r.alloc.entries()].filter(([id, a]) => a >= min(id)).map(([id, a]) => `${id}:${Math.round(a)}`).join("|"), r2(r.rollAbove), r.vacancy ? `${r.vacancy.yearsMin}-${r.vacancy.yearsMax}` : "", r.vacancy ? r.vacancy.rate : ""].map(quote).join(","));
    downloadCSV(cols, lines, `sila-negotiation-${init || "all"}-${S.scope.id}-20261020.csv`, text("ดาวน์โหลดรายการเจรจา", "Downloaded the negotiation list"));
  }
  function downloadCSV(cols, lines, name, msg) {
    const csv = "﻿" + cols.join(",") + "\r\n" + lines.join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(msg);
  }

  /* ---------- Revision 2.0: farmland on high-value land ---------- */
  function agriWatchScope() {
    const keys = new Set(currentFeatures().map((f) => f.properties.id));
    return agriWatchRows().filter((w) => keys.has(w.id));
  }
  function agriWatchContent() {
    if (!S.taxResult) return `<section class="panel-section">${notice(text("ยังเปิดข้อมูลภาษีไม่ได้", "Tax data is not open yet"), text("ลองโหลดหน้าใหม่", "Try reloading the page"))}</section>`;
    const list = agriWatchScope(), where = whereText();
    const pot = list.reduce((a, w) => a + (w.potential || 0), 0), billed = list.reduce((a, w) => a + (w.billed69 || 0), 0), value = list.reduce((a, w) => a + w.landValue, 0);
    const bands = [[50e6, Infinity, text("50 ล้านขึ้นไป", "50M and above")], [20e6, 50e6, text("20–50 ล้าน", "20–50M")], [10e6, 20e6, text("10–20 ล้าน", "10–20M")], [5e6, 10e6, text("5–10 ล้าน", "5–10M")]];
    const items = bands.map(([lo, hi, label]) => ({ id: `${lo}`, label, value: Math.round(list.filter((w) => w.landValue >= lo && w.landValue < hi).reduce((a, w) => a + (w.potential || 0), 0)), color: catHex("lime") || "#BECE7E" })).filter((x) => x.value > 0);
    const chart = items.length ? chartHTML("agri-bands", { type: "bars", items, format: "money" }, text(`บาทต่อปีที่จะเพิ่มถ้าพบว่าไม่ได้ทำประโยชน์ แยกตามมูลค่าที่ดินของแปลง · ${where}`, `THB a year added if found unused, by the parcel’s land value · ${where}`), 150) : "";
    const bld = list.filter((w) => w.buildingsOnTitle || w.surveyBuilding).length, jur = list.filter((w) => w.ownerType === "juristic").length;
    return `<section class="panel-section"><h2 class="sr-only">${text("เกษตรบนที่ดินราคาสูง", "High-value farmland")}</h2>`
      + chart
      + statsGrid([statHTML(value, text("มูลค่าที่ดินรวม", "Land value in total"), { small: true }), statHTML(bld, text("แปลงที่มีอาคารในบัญชีหรือจากสำรวจ", "Titles with a building on the roll or survey"), { format: "count", small: true }), statHTML(jur, text("เจ้าของเป็นนิติบุคคล", "Company-owned"), { format: "count", small: true })])
      + `<button type="button" class="more-button" data-show-list="agri">${text("ดูรายการแปลง เรียงจากมากไปน้อย", "List the titles, largest first")}</button>`
      + explainHTML(text("วิธีคิดและข้อจำกัด", "Method and limits"),
        noteP("แปลงที่บัญชีปี 2569 ระบุการใช้เป็นเกษตร (ทั้งแปลงหรือบางส่วน) และมูลค่าที่ดินตั้งแต่ 5 ล้านบาท · ตัวเลขคือภาษีถ้าถือเป็นที่ดินว่างเปล่า (0.3% ไม่มียกเว้น) ลบที่เรียกเก็บปี 2569 · เกษตรต้องเข้าเกณฑ์ประกาศกระทรวง เช่น ความหนาแน่นของต้นไม้ต่อไร่ การตรวจในพื้นที่เท่านั้นที่ตัดสินได้ ถ้าทิ้งว่างต่อเนื่อง อัตราจะเพิ่มอีก 0.3% ทุก 3 ปีตาม ม.43", "Titles the 2569 roll records as agricultural (wholly or partly) with land worth 5 million THB or more · the figure is the tax if treated as vacant land (0.3%, no relief) minus the 2569 bill · farming must meet the ministerial criteria (planting density per rai and the like); only a site check decides. If left vacant, the rate rises another 0.3% every 3 years (s.43)")
        + noteP("บุคคลธรรมดาได้ยกเว้นที่ดินเกษตร 50 ล้านบาทแรก แปลงที่ถูกต้องตามเกณฑ์จึงเสียภาษีน้อยหรือไม่เสียเลย นี่จึงเป็นขนาดถ้าตรวจพบว่าไม่ได้ทำประโยชน์ ไม่ใช่ข้อสรุป", "Individuals are relieved on the first 50 million THB of farmland, so a title that meets the criteria pays little or nothing; this is the size if a check finds the land unused, not a finding"))
      + `</section>` + supplementsHTML() + notesLink();
  }
  function agriWatchListHTML() {
    const q = S.search.trim().toLowerCase();
    let list = agriWatchScope();
    if (q) list = list.filter((w) => [w.code, w.id, w.tp].join(" ").toLowerCase().includes(q));
    const rows = list.slice(0, S.page).map((w) => `<button class="area-row row-figure" data-record="${esc(w.id)}"><span class="area-name">${esc(text(`แปลง ${w.code || w.id}`, `Parcel ${w.code || w.id}`))}<span class="area-meta">${esc(text(`ที่ดิน ${moneyShort(w.landValue)} · เรียกเก็บ ${fixed(w.billed69 ?? 0, 0)} บาท`, `land ${moneyShort(w.landValue)} · billed ${fixed(w.billed69 ?? 0, 0)} THB`))}${w.buildingsOnTitle || w.surveyBuilding ? " · " + text("มีอาคาร", "has building") : ""}${w.ownerType === "juristic" ? " · " + text("นิติบุคคล", "company") : ""}</span></span><span class="row-amount num">+${esc(fixed(w.potential ?? 0, 0))}<small>${text("บาท/ปี", "THB/yr")}</small></span></button>`).join("");
    return searchInput() + `<div class="section-title"><h2>${text("แปลงเกษตรที่ควรเพ่งเล็ง", "Farmland to watch")}</h2><span>${num(list.length)} ${text("แปลง", "titles")}</span></div><div class="area-list">${rows}</div>`
      + (!list.length ? `<div class="empty-state"><h3>${text("ไม่มีแปลงเกษตรมูลค่า 5 ล้านบาทขึ้นไปในขอบเขตนี้", "No farmland worth 5 million THB or more in this boundary")}</h3></div>` : "")
      + (list.length > S.page ? `<button class="more-button" data-more>${text("ดูเพิ่มอีก 60 รายการ", "Show 60 more")}</button>` : "")
      + `<button class="more-button" data-export>${ui("csv", 18)}${text("ดาวน์โหลดรายการ · CSV", "Download the list · CSV")}</button>`;
  }
  function exportAgriCSV() {
    const list = agriWatchScope(), r2 = (v) => (v == null || !Number.isFinite(Number(v)) ? "" : Math.round(Number(v) * 100) / 100);
    const cols = ["parcelCode", "village", "landValueTHB", "areaSqWah", "pricePerSqWah", "agriShare", "billed2569THB", "taxIfVacantTHB", "potentialTHB", "ownerType", "buildingOnRoll", "buildingSurveyed"];
    const quote = (v) => { let c = String(v ?? ""); if (/^[=+@\-\t\r]/.test(c)) c = "'" + c; return '"' + c.replace(/"/g, '""') + '"'; };
    const vname = (v) => { const x = S.metadata.villages.find((y) => y.id === v); return x ? villageLabel(x) : v || ""; };
    downloadCSV(cols, list.map((w) => [w.code || w.id, vname(w.v), r2(w.landValue), r2(w.sqwa), r2(w.price), w.agriShare, r2(w.billed69), r2(w.ifVacant), r2(w.potential), w.ownerType || "", w.buildingsOnTitle ? 1 : 0, w.surveyBuilding ? 1 : 0].map(quote).join(",")), `sila-farmland-watch-${S.scope.id}-20261020.csv`, text("ดาวน์โหลดรายการเกษตรที่ควรเพ่งเล็ง", "Downloaded the farmland watch list"));
  }

  /* ---------- Revision 2.0: owners by appraised value ---------- */
  function ownersInScope() {
    const list = ownerRanking();
    if (S.scope.type === "municipality") return list;
    const keys = new Set();
    for (const f of currentFeatures()) { const tp = parcelAttr(f.properties.id)?.tp; if (tp) keys.add(tp); }
    return list.filter((o) => keys.has(o.code));
  }
  function portfolioContent() {
    if (!S.taxResult) return `<section class="panel-section">${notice(text("ยังเปิดข้อมูลภาษีไม่ได้", "Tax data is not open yet"), text("ลองโหลดหน้าใหม่", "Try reloading the page"))}</section>`;
    if (S.owner) return ownerCardHTML(S.owner) + supplementsHTML() + notesLink();
    const list = ownersInScope(), where = whereText();
    const top = list.slice(0, 10);
    const items = top.map((o) => ({ id: o.code, label: text(`อันดับ ${o.rank}`, `#${o.rank}`), value: Math.round(o.value), color: o.type === "juristic" ? (catHex("blue") || "#6196D1") : (catHex("teal") || "#49C0BC") }));
    const chart = items.length ? chartHTML("owner-top", { type: "bars", items, format: "money" }, text(`มูลค่าประเมินรวม (ที่ดินและสิ่งปลูกสร้างที่บัญชีผูกได้) ของเจ้าของ 10 อันดับแรก · ${where} · น้ำเงิน = นิติบุคคล เขียว = บุคคลธรรมดา`, `Appraised value (land plus roll-linked buildings) of the top 10 owners · ${where} · blue = company, green = individual`), 300) : "";
    const totalValue = list.reduce((a, o) => a + o.value, 0), top10 = top.reduce((a, o) => a + o.value, 0);
    const rows = top.map((o) => ownerRowHTML(o)).join("");
    return `<section class="panel-section"><h2 class="sr-only">${text("เจ้าของรายใหญ่", "Largest owners")}</h2>`
      + chart + `<div class="section-title"><h2>${text("10 อันดับแรก", "Top 10")}</h2></div><div class="area-list">${rows}</div>`
      + `<button type="button" class="more-button" data-show-list="owners">${text("ดูทั้งหมดและค้นหาเจ้าของ", "See all and search owners")}</button>`
      + explainHTML(text("วิธีคิดและข้อจำกัด", "Method and limits"), noteP("มูลค่ารวม = ราคาประเมินที่ดินทุกแปลงของเจ้าของในบัญชีภาษี บวกมูลค่าสิ่งปลูกสร้างที่บัญชีผูกกับโฉนดได้ อาคารที่ผูกไม่ได้ไม่นับ (ไม่ใช่ศูนย์) · เจ้าของตามบัญชี ภ.ด.ส.3 ปี 2563 สมมติว่ายังไม่เปลี่ยน · ไม่แสดงชื่อ ใช้รหัสสุ่ม · ค้นได้ด้วยรหัสเจ้าของหรือรหัสแปลง", "Total = appraised land value of every title the owner holds on the roll plus roll-linked buildings; unlinked buildings are not counted (not zero) · owners per the 2563 PDS 3 list, assumed unchanged · no names, random codes · search by owner code or parcel code"))
      + `</section>`;
  }
  function ownerRowHTML(o) {
    return `<button class="area-row row-figure" data-owner="${esc(o.code)}"><span class="area-name"><span class="rank-badge">${num(o.rank)}</span> ${esc(text(`รหัส ${o.code}`, `Code ${o.code}`))}<span class="area-meta">${esc(ownerTypeText(o))} · ${esc(text(`${num(o.parcels.length)} แปลง · ภาษีปี 2569 ${moneyShort(o.assessed69)}`, `${num(o.parcels.length)} parcels · 2569 tax ${moneyShort(o.assessed69)}`))}${o.gain >= 1 ? " · " + esc(text(`เพิ่มได้ +${moneyShort(o.gain)}`, `can add +${moneyShort(o.gain)}`)) : ""}</span></span><span class="row-amount num">${esc(moneyParts(o.value)[0])}<small>${esc(moneyParts(o.value)[1])}</small></span></button>`;
  }
  function ownerListHTML() {
    const q = S.search.trim().toLowerCase();
    let list = ownersInScope();
    if (q) list = list.filter((o) => [o.code, ...o.parcels.map(codeOf)].join(" ").toLowerCase().includes(q));
    return searchInput() + `<div class="section-title"><h2>${text("เจ้าของเรียงตามมูลค่าประเมินรวม", "Owners by appraised value")}</h2><span>${num(list.length)} ${text("ราย", "owners")}</span></div><div class="area-list">${list.slice(0, S.page).map(ownerRowHTML).join("")}</div>`
      + (!list.length ? `<div class="empty-state"><h3>${text("ไม่พบเจ้าของที่ค้นหา", "No matching owner")}</h3></div>` : "")
      + (list.length > S.page ? `<button class="more-button" data-more>${text("ดูเพิ่มอีก 60 รายการ", "Show 60 more")}</button>` : "")
      + `<p class="inline-note">${text("ค้นได้ด้วยรหัสเจ้าของ (T-XXXXXX) หรือรหัสแปลง", "Search by owner code (T-XXXXXX) or parcel code")}</p><button class="more-button" data-export>${ui("csv", 18)}${text("ดาวน์โหลดรายการเจ้าของ · CSV", "Download the owner list · CSV")}</button>`;
  }
  function ownerCardHTML(code) {
    const o = ownerRec(code);
    if (!o) return `<section class="panel-section">${notice(text("ไม่พบเจ้าของรหัสนี้", "No owner with this code"), "")}<button type="button" class="more-button" data-owner="">${text("กลับไปรายการ", "Back to the list")}</button></section>`;
    const tp = S.parcelTax.taxpayers.get(code);
    const uses = Object.entries(o.uses).sort((a, b) => b[1] - a[1]).map(([u, n]) => `${text(...(window.SilaTaxEngine.USE_LABEL[u] || [u, u]))} ${num(n)}`).join(" · ");
    const parcels = o.parcels.map((id) => ({ id, a: parcelAttr(id), r: taxRow(id) })).sort((x, y) => (y.a?.landValue || 0) + (y.a?.bldValue || 0) - ((x.a?.landValue || 0) + (x.a?.bldValue || 0)));
    const rows = parcels.slice(0, S.page).map(({ id, a, r }) => `<button class="area-row row-figure" data-goto="portfolio|${esc(id)}"><span class="area-name">${esc(text(`แปลง ${codeOf(id)}`, `Parcel ${codeOf(id)}`))}<span class="area-meta">${a?.useLabel ? esc(text(...a.useLabel)) : ""}${a?.mainHome ? " · " + text("บ้านหลังหลัก", "main home") : ""}${r && r.assessed69 != null ? " · " + esc(text(`ภาษีปี 2569 ${fixed(r.assessed69, 0)} บาท`, `2569 tax ${fixed(r.assessed69, 0)} THB`)) : ""}${r && r.gain >= 1 ? " · " + esc(text(`เพิ่มได้ +${fixed(r.gain, 0)}`, `can add +${fixed(r.gain, 0)}`)) : ""}</span></span><span class="row-amount num">${esc(moneyParts((a?.landValue || 0) + (a?.bldValue || 0))[0])}<small>${esc(moneyParts((a?.landValue || 0) + (a?.bldValue || 0))[1])}</small></span></button>`).join("");
    const villages = o.villages.map((v) => { const x = S.metadata.villages.find((y) => y.id === v); return x ? villageLabel(x) : v; });
    return `<section class="panel-section owner-card"><div class="focus-head"><strong>${esc(text(`เจ้าของอันดับ ${num(o.rank)} · รหัส ${o.code}`, `Owner #${num(o.rank)} · code ${o.code}`))}</strong><button type="button" class="quiet" data-owner="">${text("ทุกราย", "All owners")}</button></div><p class="owner-type">${esc(ownerTypeText(o))}${tp?.src === "2563" ? " · " + text("ตามบัญชีปี 2563", "per the 2563 list") : ""}${tp?.status69 && tp.status69 !== "unknown" ? " · " + statusHTML(tp.status69) : ""}</p>`
      + statsGrid([statHTML(o.value, text("มูลค่าประเมินรวม", "Appraised value"), { emphasis: true, note: text(`ที่ดิน ${moneyShort(o.landValue)} · อาคาร ${o.bldKnown ? moneyShort(o.bldValue) : text("ยังไม่มีตัวเลข", "no figure")}`, `land ${moneyShort(o.landValue)} · buildings ${o.bldKnown ? moneyShort(o.bldValue) : text("", "no figure")}`) }), statHTML(o.parcels.length, text("แปลงบนแผนที่", "Parcels on the map"), { format: "count" }), statHTML(o.assessed69, text("ภาษีปี 2569", "2569 tax")), statHTML(o.gain >= 0.5 ? o.gain : 0, text("เก็บเพิ่มได้ต่อปี", "Can be added a year"), { signed: true })])
      + `<p class="small-note">${esc(uses)}${villages.length ? " · " + esc(villages.slice(0, 4).join(", ")) + (villages.length > 4 ? esc(text(` และอีก ${villages.length - 4} หมู่บ้าน`, ` and ${villages.length - 4} more`)) : "") : ""}</p>`
      + `<div class="record-actions"><button type="button" class="mini-action" data-highlight-taxpayer="${esc(o.code)}">${ui("fit", 18)}${text("ดูทุกแปลงบนแผนที่", "Show every parcel on the map")}</button></div>`
      + `<div class="section-title"><h2>${text("แปลงของเจ้าของรายนี้", "This owner’s parcels")}</h2><span>${num(o.parcels.length)}</span></div><div class="area-list">${rows}</div>${o.parcels.length > S.page ? `<button class="more-button" data-more>${text("ดูเพิ่มอีก 60 รายการ", "Show 60 more")}</button>` : ""}`
      + `<button class="more-button" data-export>${ui("csv", 18)}${text("ดาวน์โหลดแปลงของรายนี้ · CSV", "Download this owner’s parcels · CSV")}</button>`
      + explainHTML(text("ข้อจำกัด", "Limits"), noteP("เจ้าของตามบัญชี ภ.ด.ส.3 ปี 2563 สมมติว่ายังไม่เปลี่ยน ชื่อไม่แสดง · มูลค่าสิ่งปลูกสร้างนับเฉพาะที่บัญชีผูกกับโฉนดได้ · ส่วนเพิ่มคิดเทียบกับที่เรียกเก็บปี 2569", "Owner per the 2563 PDS 3 list, assumed unchanged; no names · building value only where the roll links it to a title · the gain is against the 2569 bill")) + `</section>`;
  }
  function exportOwnersCSV() {
    const r2 = (v) => (v == null || !Number.isFinite(Number(v)) ? "" : Math.round(Number(v) * 100) / 100);
    const quote = (v) => { let c = String(v ?? ""); if (/^[=+@\-\t\r]/.test(c)) c = "'" + c; return '"' + c.replace(/"/g, '""') + '"'; };
    if (S.owner) {
      const o = ownerRec(S.owner); if (!o) return;
      const cols = ["ownerCode", "parcelCode", "use", "mainHome", "landValueTHB", "buildingValueTHB", "billed2569THB", "tax2570WithFixesTHB", "gainVsBillTHB"];
      downloadCSV(cols, o.parcels.map((id) => { const a = parcelAttr(id), r = taxRow(id); return [o.code, codeOf(id), a?.use || "", a?.mainHome ? 1 : 0, r2(a?.landValue), r2(a?.bldValue), r2(r?.assessed69), r2(r?.new70), r2(r?.gain)].map(quote).join(","); }), `sila-owner-${o.code}-20261020.csv`, text("ดาวน์โหลดแปลงของเจ้าของรายนี้", "Downloaded this owner’s parcels"));
      return;
    }
    const q = S.search.trim().toLowerCase();
    let list = ownersInScope();
    if (q) list = list.filter((o) => [o.code, ...o.parcels.map(codeOf)].join(" ").toLowerCase().includes(q));
    const cols = ["rank", "ownerCode", "ownerType", "parcels", "landValueTHB", "buildingValueTHB", "buildingsKnown", "totalValueTHB", "billed2569THB", "tax2570WithFixesTHB", "gainVsBillTHB", "properties"];
    downloadCSV(cols, list.map((o) => [o.rank, o.code, o.type === "juristic" ? `juristic:${o.kind || ""}` : o.type || "", o.parcels.length, r2(o.landValue), r2(o.bldValue), o.bldKnown, r2(o.value), r2(o.assessed69), r2(o.new70), r2(o.gain), o.properties].map(quote).join(",")), `sila-owners-${S.scope.id}-20261020.csv`, text("ดาวน์โหลดรายการเจ้าของ", "Downloaded the owner list"));
  }
  /* Focus one owner: card in the panel, every parcel outlined on the map. */
  function setOwner(code, push = true) {
    S.owner = code || null;
    S.page = 60; S.search = "";
    if (S.owner) highlightTaxpayer(S.owner); else highlightTaxpayer(null);
    renderPanel();
    if (push) syncURL();
  }
  function setInitiative(id, push = true) {
    S.initiative = id && INITIATIVE_ORDER.includes(id) ? id : null;
    S.page = 60;
    restyleLayer();
    renderPanel();
    if (push) syncURL(true);
  }
  /* ---------- Revision 2.0: the 16 flood study sites ---------- */
  const FLOOD_STATUS = { approximate: ["จับคู่ภาพเอกสารโดยประมาณ", "matched approximately from the plan's figure"], representative: ["ตัวแทนบริเวณ ยังต้องชี้หมุดจริง", "representative of the area; the real spot is still to be pointed out"], coordinator: ["หมุดจากผู้ประสานงาน", "pinned by the coordinator"], surveyed: ["รังวัดภาคสนามแล้ว", "surveyed in the field"] };
  const floodStatusText = (p, long = false) => text(...(FLOOD_STATUS[p.coordStatus] || FLOOD_STATUS.approximate)) + (long && p.searchRadiusM ? text(` · วงค้นหา ${num(p.searchRadiusM)} ม.`, ` · search radius ${num(p.searchRadiusM)} m`) : "") + (long ? text(" · ยังไม่มีจุดใดรับรองจากรังวัด", " · no site is survey-certified yet") : "");
  function floodSitesContent() {
    const fs = currentFeatures(), where = whereText();
    const by = (k) => fs.filter((f) => f.properties.coordStatus === k).length;
    const items = [{ id: "approximate", label: text("โดยประมาณ", "Approximate"), value: by("approximate"), color: catHex("blue") }, { id: "representative", label: text("ตัวแทนบริเวณ", "Representative"), value: by("representative"), color: catHex("sky") }, { id: "coordinator", label: text("ผู้ประสานงานชี้", "Coordinator pin"), value: by("coordinator"), color: catHex("teal") }, { id: "surveyed", label: text("รังวัดแล้ว", "Surveyed"), value: by("surveyed"), color: catHex("mint") }];
    const phases = [[text("1 · เปิดปลายทางและส่วนคอด", "1 · Open the outlets and pinch points"), text("ห้วยศิลา ลำน้ำพอง บึงทุ่งสร้าง และช่องลอดตามแนวกั้น ตรวจระดับน้ำปลายทาง สิทธิ์ และช่องผ่าน คืนทางที่อุดตันได้ก่อน", "Huai Sila, the Phong, Bueng Thung Sang and the culverts through the barriers: check outlet levels, rights and openings; clear blocked paths first")],
      [text("2 · ทางลำเลียงและสองแถวรับน้ำ", "2 · Conveyance and the two intake rows"), text("ขุดลอกคืนร่องเดิม เตรียมทางลำเลียงก่อนเปิดคลองดักตีนเนิน ทำเป็นช่วงพร้อมพื้นที่หน่วง แล้วเชื่อมรางแถวสองเมื่อปลายรับพร้อม", "Dredge the old channels and prepare the conveyance before opening the foothill intercept canal, in stages with detention, then join the second-row drains once the outlet is ready")],
      [text("3 · เชื่อมซอยและติดตามผล", "3 · Connect the lanes and follow up"), text("เพิ่มทางรับย่อยเมื่อทางหลักพร้อม ตรวจรอยน้ำและเวลาระบายหลังฝนที่ 16 จุดและพื้นที่ปลายทาง", "Add lane intakes once the mains are ready; check water marks and drain-down time after rain at the 16 sites and downstream")]];
    return `<section class="panel-section"><h2 class="sr-only">${text("จุดศึกษาน้ำท่วม", "Flood study sites")}</h2>`
      + chartHTML("floodsites-status", { type: "bars", items, format: "count" }, text(`สถานะพิกัดของ ${num(fs.length)} จุด · ${where} · พิกัดบอกบริเวณที่จะลงพื้นที่ ไม่ใช่จุดน้ำลึกสุดหรือปากท่อ`, `Coordinate status of ${num(fs.length)} sites · ${where} · points mark the area to visit, not the lowest point or a pipe mouth`), 150)
      + `<div class="section-title"><h2>${text("ลำดับงานตามข้อเสนอ", "Sequence in the study")}</h2></div><ol class="phase-list">${phases.map(([h, b]) => `<li><strong>${h}</strong><span>${b}</span></li>`).join("")}</ol>`
      + `<button type="button" class="more-button" data-open-tab="list">${text("ดูทั้ง 16 จุด พร้อมสาเหตุและทางเลือก", "See all 16 sites with cause and options")}</button>`
      + explainHTML(text("ที่มาและข้อจำกัด", "Source and limits"),
        noteP("จุดและข้อความมาจากข้อเสนอการป้องกันและแก้ปัญหาน้ำท่วม เทศบาลเมืองศิลา (CityChat ฉบับ 7, 17 ต.ค. 2569) ซึ่งต่อยอดแผนแก้ปัญหาน้ำท่วมของเทศบาล พ.ศ. 2564–2567 และข้อมูลจากผู้ประสานงาน · ตารางจัดลำดับงานเริ่มตรวจและแก้ส่วนคอด ไม่ใช่อันดับความรุนแรงของน้ำท่วมที่วัดแล้ว", "Sites and text come from the flood prevention study for Sila Municipality (CityChat edition 7, 17 Oct 2569), which builds on the municipal flood plan 2564–2567 and the coordinator's notes · the sequence orders survey and pinch-point work, not measured flood severity")
        + noteP("ข้อเสนอมีฉากน้ำสมมติ 10–50 ซม. และแนวสำรวจตามถนนของแต่ละจุด บนข้อมูลระดับ 30 ม. ชั้นข้อมูลเหล่านี้ยังไม่แสดงบนแผนที่จนกว่าเจ้าของงานจะตรวจ เพราะการสื่อสารความเสี่ยงต่อสาธารณะต้องผ่านคนก่อนเสมอ", "The study's 10–50 cm water scenarios and road survey corridors (on 30 m elevation data) are not on the map until the owner reviews them: public flood-risk communication always passes a person first")
        + noteP("ยังไม่มีจุดใดรับรองระดับและพิกัดจากรังวัด ต้องตรวจระดับ ความจุ สิทธิ์ และผู้ดูแลก่อนใช้จริง", "No site has survey-certified levels or coordinates; check levels, capacity, rights and the responsible body before use"))
      + `</section>` + supplementsHTML() + notesLink();
  }
  function businessesContent() {
    const fs = currentFeatures(), n = (t) => fs.filter((f) => t(f.properties)).length, d = dataset("businesses") || {};
    const kinds = [["company", "บริษัท", "companies"], ["public", "บริษัทมหาชน", "public companies"], ["partnership", "ห้างหุ้นส่วน", "partnerships"]].map(([k, th, en]) => [n((p) => p.kind === k), text(th, en)]).filter(([c]) => c);
    const np = d.notPlaced || {};
    return `<section class="panel-section"><div class="facts-grid">${fact(fs.length, text("ธุรกิจที่ปักหมุดในพื้นที่นี้", "Businesses pinned in this area"))}${fact(n((p) => p.branch && p.branch !== "head"), text("เป็นสาขา", "branches"))}${fact(n((p) => p.commercialObserved), text("แบบสำรวจพบการค้าขายที่จุดเดียวกัน", "with commercial use seen by the survey"))}${fact(n((p) => p.website), text("มีเว็บไซต์ทางการที่ยืนยันได้", "with a confirmed official website"))}</div>`
      + `<p class="small-note">${esc(kinds.map(([c, l]) => `${l} ${num(c)}`).join(" · "))}</p>`
      + (np.juristic != null ? `<p class="small-note">${text(`ทั้งตำบล: นิติบุคคลที่ยังหาตำแหน่งไม่ได้ ${num(np.juristic)} ราย และผู้ประกอบการบุคคลธรรมดา ${num(np.individuals)} รายไม่แสดงบนเว็บ`, `Whole tambon: ${num(np.juristic)} juristic registrants could not be placed yet, and ${num(np.individuals)} sole proprietors are not shown`)}</p>` : "")
      + `<button class="more-button" data-show-list>${text("ดูรายชื่อธุรกิจในพื้นที่นี้", "List businesses in this area")}</button>`
      + `<p class="small-note">${text("ข้อมูลจากทะเบียนผู้ประกอบการ VAT ของกรมสรรพากร (data.go.th) ไม่บอกประเภทกิจการ ใช้ปุ่ม Google AI Mode ในการ์ดธุรกิจเพื่อค้นข้อมูลเพิ่ม แล้วตรวจกับเอกสารก่อนใช้", "From the Revenue Department VAT registrant list (data.go.th), which has no business type. Use the Google AI Mode button on a business card to look further, and verify before use.")}</p></section>` + notesLink();
  }
  function propertyListHTML() {
    const rk = propRanking();
    if (!rk) return notice(text("ยังเปิดข้อมูลภาษีไม่ได้", "Tax data is not open yet"), text("ลองโหลดหน้าใหม่", "Try reloading the page"));
    const keys = propsInScope(), q = S.search.trim().toLowerCase();
    let list = rk.list.filter((e) => keys.has(e.key));
    if (q) list = list.filter((e) => [propCode(e.key), ...propParcels(e.key).map(codeOf), e.tp].join(" ").toLowerCase().includes(q));
    if (S.propSort === "pct") { const v = (e) => { const p = propPct(e); return p === Infinity ? 1e9 : p ?? -1; }; list = [...list].sort((a, b) => v(b) - v(a)); }
    const sortBtns = `<div class="segmented" role="group" aria-label="${text("เรียงรายการตาม", "Sort the list by")}">${[["thb", ["เรียงตามบาท", "By THB"]], ["pct", ["เรียงตามเปอร์เซ็นต์", "By percent"]]].map(([id, l]) => `<button type="button" data-prop-sort="${id}" aria-pressed="${id === S.propSort}">${esc(text(...l))}</button>`).join("")}</div>`;
    const rows = list.slice(0, S.page).map((e) => {
      const g = propGain(e), n = propParcels(e.key).length;
      const fixes = [...e.reasons.entries()].filter(([, d]) => d >= 0.5).sort((a, b) => b[1] - a[1]).map(([id]) => text(...(STRATEGY_BY_ID.get(id)?.label || [id, id])));
      return `<button class="area-row" data-property="${esc(e.key)}"><span class="area-name"><span class="rank-badge" aria-label="${esc(text(`ลำดับ ${rk.rank.get(e.key)}`, `rank ${rk.rank.get(e.key)}`))}">${num(rk.rank.get(e.key))}</span> ${esc(propName(e.key))}<span class="area-meta">${esc(text(`+${fixed(g, 0)} บาทต่อปี (${pctLabel(propPct(e))}) · ${num(n)} แปลง`, `+${fixed(g, 0)} THB a year (${pctLabel(propPct(e))}) · ${num(n)} parcel${n === 1 ? "" : "s"}`))}${fixes.length ? " · " + esc(fixes.join(" · ")) : ""}</span></span><span aria-hidden="true">›</span></button>`;
    }).join("");
    return searchInput() + sortBtns
      + `<div class="section-title"><h2>${text("ทรัพย์สินที่ควรจัดการก่อน", "Properties to handle first")}</h2><span>${num(list.length)} ${text("ราย", list.length === 1 ? "property" : "properties")}</span></div><div class="area-list">${rows}</div>`
      + (!list.length ? `<div class="empty-state"><h3>${text(q ? "ไม่พบทรัพย์สินที่ค้นหา" : "ไม่พบทรัพย์สินที่ภาษีเพิ่มได้ในขอบเขตนี้", q ? "No matching property" : "No property in this boundary gains tax")}</h3><p>${text("ลองเลือกข้อเสนอเพิ่ม หรือขยายขอบเขตเป็นทั้งเทศบาล", "Try selecting more fixes or the whole municipality")}</p></div>` : "")
      + (list.length > S.page ? `<button class="more-button" data-more>${text("ดูเพิ่มอีก 60 รายการ", "Show 60 more")}</button>` : "")
      + `<p class="inline-note">${text("ค้นได้ด้วยรหัสทรัพย์สิน รหัสแปลง หรือรหัสเจ้าของ", "Search by property code, parcel code or owner code")}</p><button class="more-button" data-export>${ui("csv", 18)}${text("ดาวน์โหลดรายการทรัพย์สิน · CSV", "Download the property list · CSV")}</button>`;
  }
  /* Property card: figures, why the tax changes (with the law), parcels, buildings, businesses, evidence. */
  function propertyCardHTML(f) {
    const key = propKeyOf(f.properties.id);
    if (!key) return `<div class="record-section"><p class="small-note">${text("แปลงนี้ยังไม่พบเจ้าของในบัญชี ภ.ด.ส.3 ปี 2563 จึงยังจัดเป็นทรัพย์สินไม่ได้ ดูภาษีรายแปลงได้ที่แผนที่ภาษีที่ดินรายแปลง", "This parcel has no owner in the 2563 PDS 3 list, so it is not grouped into a property. See its tax on the land tax map")}</p><div class="record-actions"><button type="button" class="mini-action" data-goto="taxmap|${esc(f.properties.id)}">${text("ดูภาษีของแปลงนี้", "See this parcel’s tax")}</button></div></div>`;
    const e = propRow(key), ids = propParcels(key);
    const reasons = e ? [...e.reasons.entries()].filter(([, d]) => d >= 0.5).sort((a, b) => b[1] - a[1]) : [];
    const why = reasons.length ? `<div class="record-section"><h3>${text("ทำไมภาษีเพิ่ม", "Why the tax goes up")}</h3><ul class="reason-list">${reasons.map(([id, d]) => { const st = STRATEGY_BY_ID.get(id); return `<li><strong>${esc(text(...(st?.label || [id, id])))}</strong> <span class="reason-amount">+${esc(fixed(d, 0))} ${text("บาท", "THB")}</span><details><summary>${text("ฐานกฎหมายและข้อสมมติ", "Legal basis and assumptions")}</summary><p class="small-note">${esc(text(...(st?.basis || ["", ""])))}</p></details></li>`; }).join("")}</ul><p class="small-note"><span class="evidence-badge" data-evidence="inference">${text("ข้อสรุป", "Inference")}</span> ${text("คิดจากบัญชีปี 2569 แบบสำรวจอาคาร และเจ้าของปี 2563 ต้องตรวจในพื้นที่ก่อนใช้", "From the 2569 roll, the building survey and 2563 owners; check on site before use")}</p></div>`
      : `<div class="record-section"><p class="small-note">${text("ข้อเสนอที่เลือกไม่ทำให้ภาษีของทรัพย์สินนี้เปลี่ยน", "The selected fixes do not change this property’s tax")}</p></div>`;
    const list = ids.slice(0, 15).map((id) => titleLine(id, null, f.properties.id)).join("");
    const parcels = `<div class="record-section"><h3>${text(`แปลงในทรัพย์สิน (${num(ids.length)})`, `Parcels in the property (${num(ids.length)})`)}</h3><ul class="title-list">${list}</ul>${ids.length > 15 ? `<p class="small-note">${text(`และอีก ${num(ids.length - 15)} แปลง`, `and ${num(ids.length - 15)} more`)}</p>` : ""}<p class="small-note">${esc(ownEvidenceText(parcelAttr(f.properties.id)?.own))}</p></div>`;
    return why + parcels + propertyBuildingsHTML(key) + propertyBusinessesHTML(key)
      + `<div class="record-actions"><button type="button" class="mini-action" data-tool="tax-calculator" data-parcel="${esc(f.properties.id)}">${ui("calculator", 18)}${text("เปิดแปลงนี้ในเครื่องคิดภาษี", "Open this parcel in the tax calculator")}</button><button type="button" class="mini-action" data-goto="taxmap|${esc(f.properties.id)}">${text("ดูแปลงนี้บนแผนที่ภาษี", "See this parcel on the tax map")}</button></div>`;
  }
  /* Buildings on the property's parcels (main parcel of each footprint); the footprint file opens on request. */
  function propertyBuildingsHTML(key) {
    const fc = S.cache.get(BUILDINGS_PATH()), ids = new Set(propParcels(key));
    const head = `<div class="record-section" id="property-buildings" data-property="${esc(key)}"><h3>${text("อาคารในทรัพย์สิน", "Buildings in the property")}</h3>`;
    if (!fc) return head + `<div class="record-actions"><button type="button" class="mini-action" data-property-buildings="${esc(key)}">${text("เปิดรายการอาคาร", "Open the buildings")}</button></div></div>`;
    const list = fc.features.filter((b) => ids.has((b.properties.parcelIds || [])[0]));
    if (!list.length) return head + `<p class="small-note">${text("ไม่พบรูปอาคารบนแปลงของทรัพย์สินนี้", "No building footprint on this property’s parcels")}</p></div>`;
    const by = new Map();
    for (const b of list) { const g = rollGroup(b.properties); const k = g ? text(...g.label) : text("ไม่ตรงแปลงใด", "No parcel match"); by.set(k, (by.get(k) || 0) + 1); }
    const items = list.slice(0, 12).map((b) => { const p = b.properties; return `<li><button type="button" class="portfolio-link" data-goto="buildings|${esc(p.id)}">${esc(sv(p.type) || text("อาคาร", "Building"))} #${esc(String(p.sourceRecord ?? ""))}${p.houseNumbers?.length ? ` · ${esc(text("บ้านเลขที่ ", "No. ") + houseNumbersText(p.houseNumbers, 3))}` : ""}</button><span>${esc(text(...(rollGroup(p)?.label || ["ไม่ตรงแปลงใด", "No parcel match"])))}</span></li>`; }).join("");
    return head + `<p class="small-note">${esc([...by.entries()].map(([k, n]) => `${k} ${num(n)}`).join(" · "))}</p><ul class="portfolio-list">${items}</ul>${list.length > 12 ? `<p class="small-note">${text(`และอีก ${num(list.length - 12)} หลัง`, `and ${num(list.length - 12)} more`)}</p>` : ""}</div>`;
  }
  const BUSINESSES_PATH = () => dataset("businesses")?.geojson || "data/businesses.geojson";
  const businessKindText = (p) => [p.kind ? text(...(OWNER_KIND[p.kind] || ["นิติบุคคล", "juristic person"])) : "", p.branch ? text(p.branch === "head" ? "สำนักงานใหญ่" : `สาขา ${p.branch}`, p.branch === "head" ? "head office" : `branch ${p.branch}`) : ""].filter(Boolean).join(" · ");
  /* Registered businesses located on the property (filled once the businesses layer exists). */
  function propertyBusinessesHTML(key) {
    const fc = S.cache.get(BUSINESSES_PATH()), ids = new Set(propParcels(key));
    if (!dataset("businesses")) return "";
    const head = `<div class="record-section" id="property-businesses" data-property="${esc(key)}"><h3>${text("ธุรกิจที่ตั้งอยู่ในทรัพย์สิน", "Businesses located in the property")}</h3>`;
    if (!fc) return head + `<div class="record-actions"><button type="button" class="mini-action" data-property-businesses="${esc(key)}">${text("เปิดรายการธุรกิจ", "Open the businesses")}</button></div></div>`;
    const list = fc.features.filter((b) => ids.has(b.properties.parcelId));
    const counted = (S.businessCounts?.get(key) || 0);
    if (!list.length && !counted) return head + `<p class="small-note">${text("ไม่พบธุรกิจที่จดทะเบียนภาษีมูลค่าเพิ่มในทรัพย์สินนี้ ไม่ได้แปลว่าไม่มีกิจการจริง", "No VAT-registered business found here; that does not mean none operates")}</p></div>`;
    return head + `<ul class="portfolio-list">${list.slice(0, 12).map((b) => `<li><button type="button" class="portfolio-link" data-goto="businesses|${esc(b.properties.id)}">${esc(b.properties.label)}</button><span>${esc(businessKindText(b.properties))}</span></li>`).join("")}</ul>${counted > list.length ? `<p class="small-note">${text(`มีผู้ประกอบการอีก ${num(counted - list.length)} รายที่ไม่ปักหมุด เพราะที่อยู่อาจเป็นบ้านของบุคคล`, `${num(counted - list.length)} more registrants are counted but not pinned, as the address may be a person’s home`)}</p>` : ""}<p class="small-note">${text("ธุรกิจที่ตั้งอยู่ไม่จำเป็นต้องเป็นเจ้าของที่ดิน", "A business located here is not necessarily the land owner")}</p></div>`;
  }
  function exportPropertiesCSV() {
    const rk = propRanking();
    if (!rk) return;
    const keys = propsInScope(), q = S.search.trim().toLowerCase();
    let list = rk.list.filter((e) => keys.has(e.key));
    if (q) list = list.filter((e) => [propCode(e.key), ...propParcels(e.key).map(codeOf), e.tp].join(" ").toLowerCase().includes(q));
    const r2 = (v) => (v == null || !Number.isFinite(Number(v)) ? "" : Math.round(Number(v) * 100) / 100);
    const tag = `land${S.appraisalAdj >= 0 ? "+" : ""}${S.appraisalAdj}pct_buildings${S.bldAdj >= 0 ? "+" : ""}${S.bldAdj}pct`;
    const cols = ["rank", "propertyId", "ownerCode", "ownerType", "parcelCodes", "parcels", "parcelsWithTax", "tax2569AssessedTHB", `tax2570CurrentMethodTHB_${tag}`, `tax2570WithFixesTHB_${tag}`, "gainTHB", "gainPct", "fixes", "ownerMatchedBy", "mapColorStep41", "mapColorHex"];
    const quote = (v) => { let c = String(v ?? ""); if (/^[=+@\-\t\r]/.test(c)) c = "'" + c; return '"' + c.replace(/"/g, '""') + '"'; };
    const lines = list.map((e) => {
      const ids = propParcels(e.key), code = propOwnerCode(e.key), t = S.parcelTax.taxpayers.get(code), p = propPct(e), v = propValue(e.key);
      const step = S.classing && v != null ? lutIndex(S.classing, v === Infinity ? 1e6 : v) : "";
      return [rk.rank.get(e.key), propCode(e.key), code, t?.type === "juristic" ? `juristic:${t.kind || ""}` : t?.type || "", ids.map(codeOf).join("|"), ids.length, e.taxed, r2(e.assessed69), r2(e.old70), r2(e.new70), r2(propGain(e)), p === Infinity ? "from 0" : r2(p),
        [...e.reasons.entries()].filter(([, d]) => d >= 0.5).map(([id, d]) => `${id}:${Math.round(d)}`).join("|"), parcelAttr(ids.find((id) => parcelAttr(id)?.own))?.own || "", step, step !== "" ? S.classing.lut[step] : ""].map(quote).join(",");
    });
    const csv = "﻿" + cols.join(",") + "\r\n" + lines.join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `sila-properties-${S.scope.id}-20261020.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(text("ดาวน์โหลดรายการทรัพย์สินในขอบเขตนี้", "Downloaded the property list for this boundary"));
  }

  /* ---------- Revision 1.9: Street View facing the place, and Google AI Mode questions without personal data ---------- */
  const ROADS_PATH = () => dataset("roads")?.geojson || "data/roads.geojson";
  function bearingDeg(a, b) {
    const r = Math.PI / 180, y = Math.sin((b[0] - a[0]) * r) * Math.cos(b[1] * r);
    const x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos((b[0] - a[0]) * r);
    return (Math.atan2(y, x) / r + 360) % 360;
  }
  /* Road lines near the place: the registered roads, plus streets drawn by the street basemap (OpenStreetMap via OpenFreeMap)
     when it is showing. Used only to stand the Street View camera on a road; nothing is drawn from them. */
  function roadLines() {
    const out = [], fc = S.cache.get(ROADS_PATH());
    const push = (g, name) => { if (g?.type === "LineString") out.push({ c: g.coordinates, name }); else if (g?.type === "MultiLineString") for (const c of g.coordinates) out.push({ c, name }); };
    if (fc) for (const f of fc.features) push(f.geometry, f.properties?.roadName || null);
    try {
      const gl = S.basemap === "street" ? S.tile?.getMaplibreMap?.() : null;
      if (gl) for (const f of gl.querySourceFeatures("openmaptiles", { sourceLayer: "transportation" })) {
        if (["path", "track", "rail", "transit", "ferry", "aerialway", "bridleway"].includes(f.properties?.class)) continue;
        push(f.geometry, f.properties?.["name:th"] || f.properties?.name || null);
      }
    } catch (_) { /* the basemap may not be ready */ }
    return out;
  }
  /* Nearest point on those road lines (local metric plane); null when no road lies within 120 m. */
  function roadViewpoint(target, named = false) {
    const lines = roadLines();
    if (!lines.length) return null;
    const kx = Math.cos((target[1] * Math.PI) / 180) * 111320, ky = 110540;
    let best = null, bd = Infinity, bestName = null;
    for (const { c: line, name } of lines) {
      if (named && !name) continue;
      for (let i = 1; i < line.length; i++) {
      const ax = (line[i - 1][0] - target[0]) * kx, ay = (line[i - 1][1] - target[1]) * ky, dx = (line[i][0] - line[i - 1][0]) * kx, dy = (line[i][1] - line[i - 1][1]) * ky;
      const l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      const x = ax + t * dx, y = ay + t * dy, d = x * x + y * y;
      if (d < bd) { bd = d; best = [target[0] + x / kx, target[1] + y / ky]; bestName = name; }
      }
    }
    return best && Math.sqrt(bd) <= 120 ? { point: best, distM: Math.sqrt(bd), name: bestName } : null;
  }
  /* A place described in words (nearest named road within 60 m, village, tambon): AI questions carry no coordinates,
     house numbers or records, as in the area questions of the context actions. */
  function placeText(f) {
    const v = (f.properties.villageIds || (f.properties.villageId ? [f.properties.villageId] : [])).map((id) => S.metadata.villages.find((x) => x.id === id)).filter(Boolean)[0];
    const road = roadViewpoint(targetPoint(f), true);
    const roadPart = road && road.distM <= 60 && road.name ? text(`ริม${/^(ถนน|ถ\.|ซอย|ซ\.)/.test(road.name) ? "" : "ถนน"}${road.name} `, `along ${road.name}, `) : "";
    return roadPart + (v ? text(`${v.label} `, `Village ${v.number} ${v.name}, `) : "") + text("ตำบลศิลา อำเภอเมืองขอนแก่น จังหวัดขอนแก่น", "Sila subdistrict, Mueang Khon Kaen, Khon Kaen");
  }
  function targetPoint(f) {
    const g = f.geometry;
    if (g?.type === "Point") return g.coordinates;
    const c = featureCenter(f);
    return [c.lng, c.lat];
  }
  const metresBetween = (a, b) => Math.hypot((b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180) * 111320, (b[1] - a[1]) * 110540);
  const outerRings = (g) => !g ? [] : g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((p) => p[0]) : [];
  /* Frontage: the road point closest to the place's outline (sampled every ~12 m), within 120 m. Street View stands there. */
  function frontage(rings) {
    const lines = roadLines();
    if (!lines.length || !rings.length) return null;
    let w = Infinity, so = Infinity, e = -Infinity, n = -Infinity;
    for (const r of rings) for (const [x, y] of r) { if (x < w) w = x; if (x > e) e = x; if (y < so) so = y; if (y > n) n = y; }
    const kx = Math.cos(((so + n) / 2) * Math.PI / 180) * 111320, ky = 110540, px = 125 / kx, py = 125 / ky, segs = [];
    for (const { c } of lines) for (let i = 1; i < c.length; i++) {
      const a = c[i - 1], b = c[i];
      if (Math.max(a[0], b[0]) < w - px || Math.min(a[0], b[0]) > e + px || Math.max(a[1], b[1]) < so - py || Math.min(a[1], b[1]) > n + py) continue;
      segs.push([a, b]);
    }
    if (!segs.length) return null;
    const pts = [];
    for (const r of rings) for (let i = 1; i < r.length && pts.length < 4000; i++) {
      const a = r[i - 1], b = r[i], k = Math.max(1, Math.ceil(Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * ky) / 12));
      for (let j = 0; j < k; j++) pts.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
    }
    let best = null, bd = Infinity;
    for (const p of pts) for (const [a, b] of segs) {
      const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky, dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * ky, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0, x = ax + t * dx, y = ay + t * dy, d = x * x + y * y;
      if (d < bd) { bd = d; best = { road: [p[0] + x / kx, p[1] + y / ky], edge: p }; }
    }
    return best && Math.sqrt(bd) <= 120 ? { ...best, distM: Math.sqrt(bd) } : null;
  }
  /* Google Maps URL API: open the panorama on the road in front of the place, turned toward it. A point (house, business)
     uses the nearest road; an outline (parcel, building, whole property) uses its frontage and looks at its middle,
     or at the frontage itself when the middle is far away (large properties). */
  function streetView(f) {
    const rings = S.dataset === "properties"
      ? (() => { const ids = new Set(propParcels(propKeyOf(f.properties.id))); return currentFeatures().filter((x) => ids.has(x.properties.id)).flatMap((x) => outerRings(x.geometry)); })()
      : outerRings(f.geometry);
    let at = null, aim = null;
    if (rings.length) {
      const v = frontage(rings);
      if (v) {
        let sx = 0, sy = 0, k = 0;
        for (const r of rings) for (const [x, y] of r) { sx += x; sy += y; k++; }
        const mid = [sx / k, sy / k], dMid = metresBetween(v.road, mid);
        at = v.road; aim = dMid > 4 && dMid <= 150 ? mid : metresBetween(v.road, v.edge) > 2 ? v.edge : mid;
      }
    }
    if (!at) { const t = targetPoint(f), v = roadViewpoint(t); if (v && v.distM > 3) { at = v.point; aim = t; } else at = t; }
    const facing = !!aim && metresBetween(at, aim) > 2;
    const params = { api: "1", map_action: "pano", viewpoint: `${at[1].toFixed(6)},${at[0].toFixed(6)}` };
    if (facing) params.heading = String(Math.round(bearingDeg(at, aim)));
    params.pitch = "0"; params.fov = "80";
    /* Revision 2.0: the pin link opens Google Maps at the place itself (never a black screen); the panorama link stays
       as the second step, since estate roads often have no Google imagery. `cover` is the offline coverage check when the
       municipality supplies a key (tools/streetview-coverage.py); unknown means the panorama may or may not exist. */
    const cover = S.svCoverage?.[f.properties.id] ?? null;
    const pin = targetPoint(f);
    return { href: "https://www.google.com/maps/@?" + new URLSearchParams(params).toString(), facing, cover,
      pinHref: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(`${pin[1].toFixed(6)},${pin[0].toFixed(6)}`) };
  }
  const aiModeURL = (q) => "https://www.google.com/search?udm=50&q=" + encodeURIComponent(q);
  /* Questions carry only a place in words, a registered business name or a general legal question: no coordinates, owner code, tax figure, house number or name of a person. */
  const RULE_QUESTIONS = {
    mixedUse: ["ตาม พ.ร.บ.ภาษีที่ดินและสิ่งปลูกสร้าง พ.ศ. 2562 มาตรา 38 อาคารที่ชั้นล่างค้าขายและชั้นบนอยู่อาศัยคิดภาษีอย่างไร และเจ้าหน้าที่องค์กรปกครองส่วนท้องถิ่นควรตรวจหลักฐานอะไร", "Under Thailand’s Land and Building Tax Act 2019 s.38, how is a building with a shop downstairs and a home upstairs taxed, and what evidence should local officers check?"],
    rented: ["ตาม พ.ร.บ.ภาษีที่ดินและสิ่งปลูกสร้าง พ.ศ. 2562 มาตรา 41 บ้านที่ให้เช่ายังได้รับยกเว้นแบบบ้านหลังหลักหรือไม่ และเจ้าหน้าที่ควรตรวจอะไร", "Under Thailand’s Land and Building Tax Act 2019 s.41, does a rented house keep the main-home exemption, and what should officers check?"],
    mainHomeOnce: ["ตาม พ.ร.บ.ภาษีที่ดินและสิ่งปลูกสร้าง พ.ศ. 2562 มาตรา 41 คนหนึ่งได้รับยกเว้นบ้านหลังหลักได้กี่หลัง และใช้หลักฐานทะเบียนบ้านอย่างไร", "Under Thailand’s Land and Building Tax Act 2019 s.41, how many main homes can one person have exempted, and how is the house registration used?"],
    juristic: ["ตาม พ.ร.บ.ภาษีที่ดินและสิ่งปลูกสร้าง พ.ศ. 2562 มาตรา 40 และ 41 นิติบุคคลได้รับยกเว้นภาษีที่ดินเกษตรหรือบ้านหลังหลักหรือไม่", "Under Thailand’s Land and Building Tax Act 2019 s.40 and s.41, can a company receive the farm or main-home exemption?"],
    combine: ["ตาม พ.ร.บ.ภาษีที่ดินและสิ่งปลูกสร้าง พ.ศ. 2562 มาตรา 42 วรรคสอง ที่ดินหลายแปลงที่ติดกันของเจ้าของเดียวกันต้องรวมมูลค่าเป็นฐานภาษีเดียวอย่างไร", "Under Thailand’s Land and Building Tax Act 2019 s.42 para 2, how are adjoining parcels of one owner combined into one tax base?"],
    agriShare: ["ตาม พ.ร.บ.ภาษีที่ดินและสิ่งปลูกสร้าง พ.ศ. 2562 มาตรา 40 ยกเว้นที่ดินเกษตร 50 ล้านบาทนับต่อคนหรือต่อแปลง", "Under Thailand’s Land and Building Tax Act 2019 s.40, is the 50 million baht farm exemption per person or per parcel?"],
    newBuildings: ["ตาม พ.ร.บ.ภาษีที่ดินและสิ่งปลูกสร้าง พ.ศ. 2562 อาคารที่สร้างใหม่หรือต่อเติมแต่ยังไม่อยู่ในบัญชีรายการ องค์กรปกครองส่วนท้องถิ่นต้องทำอย่างไร", "Under Thailand’s Land and Building Tax Act 2019, what must a local authority do about new or extended buildings missing from the inventory list?"],
  };
  function reasonIdsOf(f) {
    if (S.dataset === "properties") { const e = propRow(propKeyOf(f.properties.id)); return e ? [...e.reasons.entries()].filter(([, d]) => d >= 0.5).sort((a, b) => b[1] - a[1]).map(([id]) => id) : []; }
    if (S.dataset === "taxmap") { const r = taxRow(f.properties.id); return (r?.reasons || []).map((lab) => TAX_STRATEGIES.find((x) => x.label === lab)?.id).filter(Boolean); }
    return [];
  }
  function aiQuestions(f) {
    const at = placeText(f), out = [];
    if (S.dataset === "businesses" && f.properties.label) out.push([text("ค้นข้อมูลกิจการนี้", "Look up this business"), text(`${f.properties.label} จังหวัดขอนแก่น ประเภทกิจการ เว็บไซต์ทางการ และสาขาในตำบลศิลา`, `${f.properties.label} Khon Kaen: type of business, official website and its Sila branch`)]);
    out.push([text("ถามว่าบริเวณนี้มีกิจการอะไร", "Ask what operates around here"), text(`บริเวณ${at} มีร้านค้า หอพัก ห้องเช่า หรือกิจการอะไรตั้งอยู่บ้าง ขอแหล่งอ้างอิงและวันที่ของข้อมูล`, `What shops, dormitories, rentals or businesses operate ${at}? Please cite sources and dates.`)]);
    for (const id of reasonIdsOf(f).slice(0, 2)) if (RULE_QUESTIONS[id]) out.push([text(`ถามข้อกฎหมาย: ${text(...STRATEGY_BY_ID.get(id).label)}`, `Ask the law: ${text(...STRATEGY_BY_ID.get(id).label)}`), text(...RULE_QUESTIONS[id])]);
    return out;
  }
  const extMark = () => `${window.SilaIcons?.icon("external", { size: 16, className: "ext-icon" }) || ""}<span class="sr-only">${text(" (เปิดแท็บใหม่)", " (opens a new tab)")}</span>`;
  const svLabel = (sv) => (sv.facing ? text("Street View หันมาทางนี้", "Street View facing this place") : text("Street View ใกล้ตำแหน่งนี้", "Street View near this place")) + (sv.cover === true ? "" : text(" · ถ้ามีภาพ", " · if imagery exists"));
  function externalActionsHTML(f) {
    if (!f?.geometry || S.dataset === "popgrid") return "";
    const sv = streetView(f);
    return `<div class="record-section external-actions"><h3>${text("ตรวจจากหน้าจอก่อนลงพื้นที่", "Check from the screen before a site visit")}</h3><div class="record-actions">`
      + `<a class="mini-action ext-link" href="${esc(sv.pinHref)}" target="_blank" rel="noopener noreferrer">${window.SilaIcons?.icon("map", { size: 18 }) || ""}<span>${text("เปิด Google Maps ที่จุดนี้", "Open Google Maps here")}</span>${extMark()}</a>`
      + (sv.cover === false ? "" : `<a class="mini-action ext-link" data-sv-link href="${esc(sv.href)}" target="_blank" rel="noopener noreferrer">${window.SilaIcons?.icon("streetview", { size: 18 }) || ""}<span data-sv-label>${esc(svLabel(sv))}</span>${extMark()}</a>`)
      + aiQuestions(f).map(([label, q]) => `<a class="mini-action ext-link" href="${esc(aiModeURL(q))}" target="_blank" rel="noopener noreferrer">${window.SilaIcons?.icon("travel_explore", { size: 18 }) || ""}<span>${esc(label)}</span>${extMark()}</a>`).join("")
      + `</div>` + explainHTML(text("ก่อนเปิด", "Before you open"), noteP("เปิดบริการของ Google ในแท็บใหม่ · ปุ่มแรกเปิดแผนที่พร้อมหมุดที่จุดนี้ จากนั้นลากหมุดรูปคนสีเหลืองไปวางบนเส้นสีฟ้าที่ใกล้ที่สุดได้ · ปุ่ม Street View ยืนบนถนนหน้าแปลงและหันเข้าหาแปลง แต่ถนนในหมู่บ้านจัดสรรหลายเส้นยังไม่มีภาพของ Google จอจะว่าง ไม่ใช่ความผิดพลาดของข้อมูลเทศบาล · ภาพอาจเก่า ดูวันที่ในภาพ · คำถามถึง Google AI ใช้ชื่อถนน หมู่บ้าน หรือชื่อธุรกิจที่จดทะเบียนเท่านั้น ไม่ส่งพิกัด รหัสเจ้าของ ตัวเลขภาษี หรือบ้านเลขที่ คำตอบเป็นข้อมูลประกอบ ต้องตรวจกับเอกสารก่อนใช้", "Opens Google in a new tab · the first button opens the map with a pin here; from there drag the yellow figure onto the nearest blue line · the Street View button stands on the road in front of the parcel facing it, but many estate roads have no Google imagery, so the screen stays blank; that is not a municipal data error · imagery can be old, check its date · questions to Google AI use only road, village or registered business names, never coordinates, owner codes, tax figures or house numbers; answers are leads to verify against documents")) + `</div>`;
  }
  /* Roads open on request; when they arrive, turn the Street View link toward the place. */
  function refreshStreetView(f) {
    if (S.cache.has(ROADS_PATH())) return;
    fetchJSON(ROADS_PATH()).then(() => {
      if (S.record !== f) return;
      const a = document.querySelector("[data-sv-link]"), sv = streetView(f);
      if (!a) return;
      a.href = sv.href;
      const lab = a.querySelector("[data-sv-label]");
      if (lab) lab.textContent = svLabel(sv);
    }).catch(() => {});
  }
  /* ---------- tax engine glue ---------- */
  function runTax() {
    S.taxResult = null;
    if (!S.parcelTax || !window.SilaTaxEngine) return;
    try {
      S.taxResult = window.SilaTaxEngine.run(S.parcelTax, { strategies: S.taxStrategies, appraisalAdjPct: S.appraisalAdj, buildingAdjPct: S.bldAdj });
    } catch (e) { console.error(e); S.taxResult = null; }
  }
  /* Parcels matched to the municipal roll whose outline lies outside the boundary line: in city totals, not in the municipality list. */
  function outsideTaxed() {
    if (S.outsideTaxedCache) return S.outsideTaxedCache;
    const fc = S.cache.get("data/parcels.geojson");
    if (!fc || !S.taxResult) return null;
    let n = 0, sum = 0;
    for (const f of fc.features) {
      if (f.properties.insideMunicipality !== false) continue;
      const r = taxRow(f.properties.id);
      if (r && r.assessed69 != null) { n++; sum += r.assessed69; }
    }
    S.outsideTaxedCache = { n, sum };
    return S.outsideTaxedCache;
  }
  function taxTotalsHTML() {
    const all = S.taxResult?.totals, sm = S.parcelTax?.summary, c = sm?.cityTotals;
    if (!all) return `<p class="small-note">${text("ยังเปิดข้อมูลภาษีรายแปลงไม่ได้ ลองโหลดหน้าใหม่", "Parcel tax data could not open; try reloading.")}</p>`;
    /* Village scope shows that village's matched parcels; receipts exist only city-wide and say so. */
    const vid = S.scope.type === "village" ? S.scope.id : null, vt = vid ? S.taxResult.byVillage?.get(vid) : null;
    const t = vt || all, where = vt ? scopeLabel() : text("ทั้งเมือง", "whole city");
    const n69 = vt ? (S.parcelTax?.parcels || []).filter((p) => p.v === vid && p.tax69 != null).length : all.parcels69;
    const box = (label, value, note, emph) => `<div class="total-box"${emph ? ' data-emphasis="true"' : ""}><small>${esc(label)}</small><strong>${esc(moneyShort(value))}</strong>${note ? `<span>${esc(note)}</span>` : ""}</div>`;
    const adj = S.appraisalAdj ? text(`ราคาที่ดิน ${S.appraisalAdj > 0 ? "+" : ""}${S.appraisalAdj}%`, `land price ${S.appraisalAdj > 0 ? "+" : ""}${S.appraisalAdj}%`) : text("ราคาประเมินเท่าเดิม", "same appraisal");
    return (S.scope.type === "election" ? `<p class="small-note">${text("ภาษีรายเขตเลือกตั้งยังไม่ได้แยก ตัวเลขด้านล่างเป็นของทั้งเมือง", "Tax is not split by electoral area; the figures below are city-wide")}</p>` : "")
      + `<div class="totals-grid">${box(text(`ภาษีปี 2569 ของแปลงที่จับคู่ได้ · ${where}`, `2569 tax, matched parcels · ${where}`), t.assessed69, text(`${num(n69)} แปลง · ตาม ภ.ด.ส.7 รายโฉนด`, `${num(n69)} parcels · PDS 7 per title`))}`
      + (c ? box(text("ทั้งเมือง: รับชำระของปีภาษี 2569", "Whole city: 2569 tax received"), c.receiptsTaxYear2569, text(`บัญชีประเมิน ${moneyShort(c.assessedRegister2569)} · ลูกหนี้ ${num(c.debtors2569)} ราย ${moneyShort(c.debt2569)}`, `assessment register ${moneyShort(c.assessedRegister2569)} · ${num(c.debtors2569)} debtors ${moneyShort(c.debt2569)}`)) : "")
      + box(text(`ปี 2570 วิธีเดิม · ${where}`, `2570 current method · ${where}`), t.old70, adj)
      + box(text(`ปี 2570 ตามข้อเสนอ · ${where}`, `2570 with fixes · ${where}`), t.new70, t.old70 ? text(`ต่างจากวิธีเดิม ${t.new70 - t.old70 >= 0 ? "+" : ""}${moneyShort(t.new70 - t.old70)}`, `vs current method ${t.new70 - t.old70 >= 0 ? "+" : ""}${moneyShort(t.new70 - t.old70)}`) : "", true) + `</div>`
      + (sm ? `<p class="small-note">${text(`${vid ? "ทั้งเมือง: " : ""}จับคู่โฉนดกับแปลงได้ ${num(sm.parcelsOnRoll)} แปลง (เลขโฉนด ${num(sm.parcelsDeedMatched)} · ผ่านบ้านเลขที่ ${num(sm.parcelsHouseNoMatched)}) ภาษี 0 บาทแสดงเฉพาะโฉนดที่บัญชีพิสูจน์ว่ายกเว้นทั้งหมด`, `${vid ? "Whole city: " : ""}${num(sm.parcelsOnRoll)} parcels matched to titles (deed ${num(sm.parcelsDeedMatched)} · via house numbers ${num(sm.parcelsHouseNoMatched)}). A 0 THB tax appears only where the roll proves the title fully exempt.`)}${(() => { const o = !vid ? outsideTaxed() : null; return o && o.n ? esc(text(` ยอดทั้งเมืองรวม ${num(o.n)} แปลงที่โฉนดอยู่ในบัญชีของเทศบาลแต่รูปแปลงอยู่นอกเส้นเขตเทศบาล (ภาษีปี 2569 ${money(o.sum, 2)}) แปลงเหล่านี้จึงไม่อยู่ในรายการและไฟล์ CSV ของขอบเขตเทศบาล`, ` The city totals include ${num(o.n)} parcels whose title is on the municipal roll but whose outline lies outside the municipal boundary line (2569 tax ${money(o.sum, 2)}), so they are not in the municipality list or its CSV.`)) : ""; })()}</p>` : "")
      + (c && c.assessedRegister2569 != null && c.receiptsTaxYear2569 != null && c.debt2569 != null ? `<p class="small-note">${(() => { const gap = c.assessedRegister2569 - c.receiptsTaxYear2569 - c.debt2569; return text(`บัญชีประเมินปี 2569 รวม ${moneyShort(c.assessedRegister2569)} สูงกว่ารับชำระรวมลูกหนี้ราว ${moneyShort(gap)} ไฟล์ที่ได้รับอธิบายส่วนต่างนี้ได้ไม่ครบ เช่น ชำระในชื่อผู้อื่น หรือใบแจ้งตีกลับ ควรกระทบยอดกับกองคลังก่อนใช้ตัวเลขนี้`, `The 2569 assessment register totals ${moneyShort(c.assessedRegister2569)}, about ${moneyShort(gap)} more than receipts plus arrears. The files received explain only part of the gap (for example payments under another name or returned notices); reconcile with the finance division before using it.`); })()}</p>` : "");
  }
  function strategyTableHTML() {
    const rows = S.taxResult?.byStrategy;
    if (!rows?.length) return "";
    return `<table class="data-table"><thead><tr><th>${text("ข้อเสนอ", "Fix")}</th><th class="num">${text("แปลงที่มีผล", "Parcels")}</th><th class="num">${text("ภาษีที่อาจเพิ่มต่อปี (สมมติ)", "Possible added tax a year (scenario)")}</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(text(...r.label))}</td><td class="num">${num(r.parcels)}</td><td class="num">${esc(moneyShort(r.delta))}</td></tr>`).join("")}</tbody></table><p class="small-note">${text("ทั้งเมือง · แต่ละแถวคิดทีละข้อเทียบกับวิธีเดิม เฉพาะแปลงที่มีภาษีปี 2569 ผลรวมทุกข้อคิดครั้งเดียวในช่อง ปี 2570 ตามข้อเสนอ จึงต่างจากผลบวกของแถวเล็กน้อย เพราะบางข้อมีผลซ้อนกันในแปลงเดียวกัน", "Whole city · each row is computed alone against the current method, for parcels with a 2569 tax. The combined total is computed once, so it differs slightly from the sum of rows where fixes overlap on one parcel.")}</p>`;
  }
  function villageTaxTableHTML() {
    const v = S.taxResult?.byVillage;
    if (!v) return "";
    const rows = S.metadata.villages.map((x) => ({ x, r: v.get(x.id) })).filter((o) => o.r).sort((a, b) => (b.r.new70 - b.r.assessed69) - (a.r.new70 - a.r.assessed69));
    return `<table class="data-table"><thead><tr><th>${text("หมู่บ้าน", "Village")}</th><th class="num">${text("ปี 2569", "2569")}</th><th class="num">${text("ปี 2570 ตามข้อเสนอ", "2570 fixes")}</th></tr></thead><tbody>${rows.map(({ x, r }) => `<tr><td><button type="button" data-scope="${esc(x.id)}">${esc(villageLabel(x))}</button></td><td class="num">${esc(moneyShort(r.assessed69))}</td><td class="num">${esc(moneyShort(r.new70))}</td></tr>`).join("")}</tbody></table><p class="small-note">${text("แปลงที่คร่อมหลายหมู่บ้านนับในหมู่บ้านที่มีพื้นที่มากที่สุด", "A parcel crossing villages counts in the village holding most of it")}</p>`;
  }
  function taxmapContent() {
    const debtors = S.taxResult ? currentFeatures().filter((f) => LIST_FILTERS.debtors.test(f.properties)).length : 0;
    const fixes = S.taxResult ? currentFeatures().filter((f) => LIST_FILTERS.fixes.test(f.properties)).length : 0;
    const all = S.taxResult?.totals, sm = S.parcelTax?.summary, c = sm?.cityTotals;
    if (!all) return `<section class="panel-section">${notice(text("ยังเปิดข้อมูลภาษีรายแปลงไม่ได้", "Parcel tax data could not open"), text("ลองโหลดหน้าใหม่", "Try reloading the page"))}</section>`;
    const vid = S.scope.type === "village" ? S.scope.id : null, vt = vid ? S.taxResult.byVillage?.get(vid) : null;
    const t = vt || all, where = vt ? scopeLabel() : text("ทั้งเมือง", "whole city");
    const n69 = vt ? (S.parcelTax?.parcels || []).filter((p) => p.v === vid && p.tax69 != null).length : all.parcels69;
    const adj = S.appraisalAdj || S.bldAdj ? text(`ราคาที่ดิน ${S.appraisalAdj > 0 ? "+" : ""}${S.appraisalAdj}% · อาคาร ${S.bldAdj > 0 ? "+" : ""}${S.bldAdj}%`, `land ${S.appraisalAdj > 0 ? "+" : ""}${S.appraisalAdj}% · buildings ${S.bldAdj > 0 ? "+" : ""}${S.bldAdj}%`) : text("ราคาประเมินเท่าเดิม", "same appraisal");
    const items = [{ id: "a69", label: text("เรียกเก็บ 2569", "Billed 2569"), value: Math.round(t.assessed69), color: catHex("slate") }];
    if (c && !vt) items.push({ id: "r69", label: text("รับชำระ 2569", "Received 2569"), value: Math.round(c.receiptsTaxYear2569), color: catHex("sky") });
    items.push({ id: "o70", label: text("2570 วิธีเดิม", "2570 current"), value: Math.round(t.old70), color: catHex("slate") }, { id: "n70", label: text("2570 ตามข้อเสนอ", "2570 with fixes"), value: Math.round(t.new70), color: catHex("teal") });
    const chart = chartHTML("taxmap-years", { type: "columns", items, format: "money", emphasis: "n70" }, text(`ภาษีที่ดินและสิ่งปลูกสร้าง บาทต่อปี · ${where} · ${num(n69)} แปลงที่จับคู่กับบัญชีได้ · ${adj}`, `Land and building tax, THB a year · ${where} · ${num(n69)} matched titles · ${adj}`), 190);
    const gain = t.new70 - t.old70;
    const strat = (S.taxResult?.byStrategy || []).filter((r) => r.delta >= 0.5).sort((a, b) => b.delta - a.delta);
    const stratChart = strat.length && !vt ? chartHTML("taxmap-fixes", { type: "bars", items: strat.map((r) => ({ id: r.id, label: initiativeShort(r.id), value: Math.round(r.delta), color: initiativeColor(r.id) })), format: "money" }, text("ผลของข้อเสนอแต่ละข้อเมื่อคิดทีละข้อ บาทต่อปี · ทั้งเมือง · ยอดรวมในแผนการเจรจาคิดพร้อมกันครั้งเดียว", "Effect of each fix applied alone, THB a year · whole city · the negotiation plan combines them once"), Math.max(130, 26 * strat.length + 40)) : "";
    return `<section class="panel-section"><h2 class="sr-only">${text("ภาษีรายแปลง", "Tax by parcel")}</h2>`
      + (S.scope.type === "election" ? `<p class="small-note">${text("ภาษีรายเขตเลือกตั้งยังไม่ได้แยก ตัวเลขเป็นของทั้งเมือง", "Tax is not split by electoral area; figures are city-wide")}</p>` : "")
      + chart
      + statsGrid([statHTML(gain, text("ตามข้อเสนอ เพิ่มจากวิธีเดิมต่อปี", "Fixes add a year over the current method"), { signed: true, small: true }), c && !vt ? statHTML(c.debt2569, text(`ลูกหนี้ปี 2569 · ${num(c.debtors2569)} ราย`, `2569 debtors · ${num(c.debtors2569)}`), { small: true }) : ""])
      + `<div class="action-stack">${fixes ? `<button type="button" class="more-button" data-show-list="fixes">${text("ดูแปลงที่ข้อเสนอทำให้ภาษีเปลี่ยน", "List parcels the fixes change")} (${num(fixes)})</button>` : ""}${debtors ? `<button type="button" class="more-button" data-show-list="debtors">${text("ดูแปลงในบัญชีลูกหนี้ปี 2569", "List parcels on the 2569 debtor list")} (${num(debtors)})</button>` : ""}<button type="button" class="more-button" data-tool="tax-calculator">${ui("calculator", 18)}${text("คิดภาษีแปลงเดียวด้วยมือ", "Work out one parcel by hand")}</button></div>`
      + stratChart
      + `<details class="supplement"><summary>${text("ภาษีรายหมู่บ้าน", "Tax by village")}</summary><div class="supplement-body">${villageTaxTableHTML()}</div></details>`
      + explainHTML(text("ตัวเลขนี้มาจากไหน", "Where these figures come from"),
        (sm ? noteP(`จับคู่โฉนดกับแปลงได้ ${num(sm.parcelsOnRoll)} แปลง (เลขโฉนด ${num(sm.parcelsDeedMatched)} · ผ่านบ้านเลขที่ ${num(sm.parcelsHouseNoMatched)}) · ภาษี 0 บาทแสดงเฉพาะโฉนดที่บัญชีระบุว่ายกเว้นทั้งหมด${sm.parcelsOutsideBoundary ? ` · ${num(sm.parcelsOutsideBoundary)} โฉนดในบัญชีอยู่นอกเขตเทศบาล จึงไม่อยู่ในรายการ` : ""}`, `${num(sm.parcelsOnRoll)} titles matched to parcels (${num(sm.parcelsDeedMatched)} by deed · ${num(sm.parcelsHouseNoMatched)} by house number) · 0 THB is shown only where the roll records a full exemption${sm.parcelsOutsideBoundary ? ` · ${num(sm.parcelsOutsideBoundary)} titles on the roll lie outside the municipality and are left out` : ""}`) : "")
        + (c && c.assessedRegister2569 != null && c.receiptsTaxYear2569 != null && c.debt2569 != null ? noteP(`บัญชีประเมินปี 2569 รวม ${moneyShort(c.assessedRegister2569)} สูงกว่ารับชำระรวมลูกหนี้ราว ${moneyShort(c.assessedRegister2569 - c.receiptsTaxYear2569 - c.debt2569)} ไฟล์ที่ได้รับอธิบายส่วนต่างไม่ครบ เช่น ชำระในชื่ออื่น หรือใบแจ้งตีกลับ ควรกระทบยอดกับกองคลังก่อนใช้ตัวเลขนี้`, `The 2569 assessment register (${moneyShort(c.assessedRegister2569)}) exceeds receipts plus debtors by about ${moneyShort(c.assessedRegister2569 - c.receiptsTaxYear2569 - c.debt2569)}; the files do not fully explain the gap, so reconcile with the treasury before using it`) : "")
        + noteP("ปี 2570 วิธีเดิม = ยอดที่เรียกเก็บปี 2569 ปรับตามราคาประเมินที่สมมติ · ตามข้อเสนอ = คิดใหม่ตามกฎหมายด้วยข้อเสนอที่เลือกไว้ ทุกข้อเป็นสมมติฐาน ต้องตรวจโฉนดและการใช้จริงก่อนแจ้งประเมิน · คลิกหรือแตะแปลงเพื่อดูภาษี อาคารในบัญชี และอาคารที่สำรวจพบแต่ไม่อยู่ในบัญชี", "2570 current method = the 2569 bill scaled by the assumed appraisal · with fixes = recomputed under the law with the selected fixes; every item is a scenario, check deeds and actual use before any assessment · click or tap a parcel for its tax, buildings on the roll and surveyed buildings missing from it"))
      + `</section>` + supplementsHTML() + notesLink();
  }
  /* Median appraisal per village from the matched parcels (a parcel counts in the village holding most of it). */
  function villagePriceTableHTML() {
    const by = new Map();
    for (const p of S.parcelTax?.parcels || []) if (p.price != null && p.v) { if (!by.has(p.v)) by.set(p.v, []); by.get(p.v).push(p.price); }
    const rows = S.metadata.villages.filter((x) => by.has(x.id)).map((x) => { const a = by.get(x.id).sort((m, n) => m - n); return { x, n: a.length, med: a[Math.floor(a.length / 2)], max: a[a.length - 1] }; }).sort((a, b) => b.med - a.med);
    if (!rows.length) return "";
    return `<table class="data-table"><thead><tr><th>${text("หมู่บ้าน", "Village")}</th><th class="num">${text("แปลงที่มีราคา", "Priced parcels")}</th><th class="num">${text("ราคากลาง", "Median")}</th><th class="num">${text("สูงสุด", "Highest")}</th></tr></thead><tbody>${rows.map(({ x, n, med, max }) => `<tr><td><button type="button" data-scope="${esc(x.id)}">${esc(villageLabel(x))}</button></td><td class="num">${num(n)}</td><td class="num">${num(med)}</td><td class="num">${num(max)}</td></tr>`).join("")}</tbody></table><p class="small-note">${text("บาทต่อตารางวา · ราคากลางคือค่ามัธยฐานของแปลงที่จับคู่กับบัญชีได้ แปลงที่คร่อมหลายหมู่บ้านนับในหมู่บ้านที่มีพื้นที่มากที่สุด", "THB per square wah · the median of parcels matched to the roll; a parcel crossing villages counts in the village holding most of it")}</p>`;
  }
  /* Appraisal count and median for the scope in view: a village uses its own matched parcels, otherwise the whole city. */
  function appraisalStats() {
    const vid = S.scope.type === "village" ? S.scope.id : null;
    if (!vid) { const sm = S.parcelTax?.summary; return { n: sm?.pricedParcels ?? null, med: sm?.medianPrice ?? null, where: text("ทั้งเมือง", "whole city") }; }
    const a = (S.parcelTax?.parcels || []).filter((p) => p.v === vid && p.price != null).map((p) => p.price).sort((m, n) => m - n);
    return { n: a.length, med: a.length ? a[Math.floor(a.length / 2)] : null, where: scopeLabel() };
  }
  function appraisalContent() {
    const st = appraisalStats(), table = villagePriceTableHTML();
    return `<section class="panel-section"><div class="facts-grid">${fact(st.n, text(`แปลงที่มีราคาประเมิน · ${st.where}`, `Parcels with an appraisal · ${st.where}`))}${fact(st.med, text(`ราคากลาง (มัธยฐาน) บาท/ตร.ว. · ${st.where}`, `Median THB per sq wah · ${st.where}`))}</div><p class="small-note">${text("ราคาประเมินมาจากบัญชีที่เทศบาลใช้คิดภาษีปี 2569 แปลงที่ยังจับคู่กับบัญชีไม่ได้แสดงเป็นลายเส้นเทา ไม่ใช่ราคาเป็นศูนย์ กรมธนารักษ์มีกำหนดประกาศราคารอบ 2570–2573 วันที่ 1 ธ.ค. 2569", "Prices come from the roll the municipality used for 2569. Parcels not yet matched show grey hatching, not a zero price. The Treasury Department is due to publish 2570–2573 prices on 1 Dec 2569.")}</p></section>`
      + (table ? `<details class="supplement" open><summary>${text("ราคาประเมินรายหมู่บ้าน", "Appraisal by village")}</summary><div class="supplement-body">${table}</div></details>` : "") + notesLink();
  }
  function popgridContent() {
    const t = S.popStructure?.totals;
    return `<section class="panel-section"><div class="facts-grid">${fact(t?.t ?? null, text("คนในรายชื่อ (ไม่นับซ้ำ)", "Listed people (deduplicated)"))}${fact(t?.hh ?? null, text("บ้านที่มีรายชื่อ", "Households with lists"))}${fact(t?.c ?? null, text("เด็กต่ำกว่า 15 ปี", "Children under 15"))}${fact(t?.o ?? null, text("อายุประมาณ 42 ปีขึ้นไป", "About 42 and over"))}</div><p class="small-note">${text(`มีรายชื่อคนใน ${num(t?.hh)} จาก ${num(t?.pts)} หมุดสำรวจในเขต 28 หมู่บ้าน ตัวเลขนี้จึงไม่ใช่ประชากรทั้งหมด ใช้ดูว่ากลุ่มไหนกระจุกตรงไหน ผู้สูงอายุ 60 ปีขึ้นไปแยกไม่ได้จากไฟล์นี้`, `Member lists exist for ${num(t?.hh)} of ${num(t?.pts)} survey points inside the 28 villages, so this is not the full population. Use it to see where groups cluster. People aged 60 and over cannot be separated from this file.`)}</p></section>` + supplementsHTML() + notesLink();
  }
  function buildingsContent() {
    const fs = currentFeatures(), straddle = fs.filter((f) => f.properties.straddle).length, valued = fs.filter((f) => f.properties.estValue != null).length;
    const withReg = fs.filter((f) => f.properties.surveyPoints > 0).length, multi = fs.filter((f) => f.properties.surveyPoints >= 2).length;
    const onRoll = fs.filter((f) => f.properties.roll === "on_roll").length, missing = fs.filter((f) => f.properties.roll === "missing_house_no").length, unmatched = fs.filter((f) => f.properties.roll === "house_no_unmatched").length, elsewhere = fs.filter((f) => f.properties.roll === "house_no_elsewhere").length;
    return `<section class="panel-section"><div class="facts-grid">${fact(fs.length, text("อาคารในพื้นที่นี้", "Buildings in this area"))}${fact(withReg, text("อาคารที่ผูกกับทะเบียนบ้านได้", "Buildings joined to the house register"))}${fact(multi, text("อาคารที่มี 2 ทะเบียนบ้านขึ้นไป", "Buildings with 2+ house registrations"))}${fact(onRoll, text("อาคารที่ผูกกับบัญชีสิ่งปลูกสร้างได้", "Buildings linked to the building roll"))}${fact(missing, text("บ้านเลขที่ไม่อยู่ในบัญชีสิ่งปลูกสร้าง", "House number absent from the roll"))}${fact(straddle, text("อาคารที่อยู่บนหลายแปลง", "Buildings spanning parcels"))}${fact(valued, text("อาคารที่ประมาณมูลค่าได้", "Buildings with an estimated value"))}</div>`
      + `<button class="more-button" data-show-list="missing">${text("ดูอาคารที่บ้านเลขที่ไม่อยู่ในบัญชี", "List buildings missing from the roll")} (${num(missing)})</button>${unmatched ? `<button class="more-button" data-show-list="unmatched">${text("ดูอาคารที่ต้องเทียบกับรายการไม่มีบ้านเลขที่", "List buildings to compare with roll entries lacking a number")} (${num(unmatched)})</button>` : ""}${elsewhere ? `<button class="more-button" data-show-list="elsewhere">${text("ดูบ้านเลขที่ที่ผูกกับโฉนดอื่น", "List house numbers under another title")} (${num(elsewhere)})</button>` : ""}<button class="more-button" data-show-list="multi">${text("ดูอาคารที่มีหลายทะเบียนบ้าน", "List buildings with several registrations")}</button><button class="more-button" data-show-list="straddle">${text("ดูอาคารที่อยู่บนหลายแปลง", "List buildings spanning parcels")}</button>`
      + (() => { if (!S.taxResult) return ""; const sets = fs.filter((f) => setLead(f.properties) != null), off = sets.filter((f) => setOffRoll(f.properties) > 0).length;
          return sets.length ? `<button class="more-button" data-show-list="titlesets">${text("ดูชุดโฉนดที่น่าจะคิดภาษีรวมกัน (อาคารหลังเดียวกันคร่อม)", "List title sets likely taxed together")} (${num(sets.length)})</button>${off ? `<button class="more-button" data-show-list="titleoffroll">${text("ดูชุดโฉนดที่มีโฉนดยังจับคู่กับบัญชีภาษีไม่ได้", "List title sets with a title not matched to the roll")} (${num(off)})</button>` : ""}` : ""; })()
      + `<p class="small-note">${text("ผูกหมุดทะเบียนบ้านกับรูปอาคารด้วยตำแหน่ง: หมุดอยู่ในรูปอาคาร หรืออยู่ติดอาคารไม่เกิน 5 ม. และอยู่ในแปลงเดียวกัน ไม่ใช้ชื่อหรือเลขที่คล้ายกันเดา อาคารหลายทะเบียนบ้านเป็นสัญญาณให้ตรวจการให้เช่าหรือสิทธิบ้านหลังหลัก ไม่ใช่ข้อพิสูจน์", "House-register points are joined to footprints by position: inside the outline, or within 5 m on the same parcel. No guessing from names or similar numbers. Several registrations in one building signal a check on renting or main-home relief, not proof.")}</p>`
      + `<p class="small-note">${text("อาคารที่อยู่บนหลายแปลงเป็นสัญญาณให้ตรวจว่าแปลงเหล่านั้นควรรวมเป็นฐานภาษีเดียวกันหรือไม่ (ม.42 วรรคสอง ถ้าเป็นเจ้าของเดียวกันและที่ดินติดกัน) แผนที่สองชุดอาจเหลื่อมกันเล็กน้อย จึงต้องตรวจที่ดินจริงก่อน", "A building spanning parcels is a signal to check whether those parcels form one tax base (s.42 para 2, same owner and adjoining). The two maps can be slightly offset, so check on site first.")}</p></section>` + supplementsHTML() + notesLink();
  }
  function housesContent() {
    const fs = currentFeatures(), commercial = fs.filter((f) => f.properties.commercial).length, rented = fs.filter((f) => /เช่า|ผู้อื่น/.test(f.properties.use || "")).length;
    const nofp = fs.filter((f) => !f.properties.buildingId).length;
    return `<section class="panel-section"><div class="facts-grid">${fact(fs.length, text("หมุดสำรวจในพื้นที่นี้", "Survey points in this area"))}${fact(fs.length - nofp, text("หมุดที่ผูกกับรูปอาคารได้", "Points joined to a footprint"))}${fact(nofp, text("หมุดที่ยังไม่มีรูปอาคาร", "Points without a footprint"))}${fact(rented, text("ให้เช่าหรือผู้อื่นใช้", "Rented or used by others"))}${fact(commercial, text("มีชั้นที่ใช้ค้าขาย", "With a commercial floor"))}</div><button class="more-button" data-show-list>${text("ค้นหาบ้านเลขที่", "Search house numbers")}</button><button class="more-button" data-show-list="nofootprint">${text("ดูหมุดที่ยังไม่มีรูปอาคาร", "List points without a footprint")}</button>${(() => { const n = fs.filter((f) => f.properties.newPoint === true).length; return n ? `<button class="more-button" data-show-list="newpoints">${text("ดูหมุดตำแหน่งใหม่จากการสำรวจ อาจยังไม่อยู่ในบัญชี", "List positions added by the survey, may be missing from the roll")} (${num(n)})</button>` : ""; })()}<p class="small-note">${text("หมุดที่ยังไม่มีรูปอาคารอาจเป็นอาคารที่สร้างหลังทำรูปอาคารชุดนี้ หรือหมุดวางคลาด ควรตรวจในพื้นที่ก่อนเพิ่มในบัญชีภาษี", "A point without a footprint may be a building put up after these outlines were drawn, or a misplaced point. Check on site before adding it to the tax roll.")}</p></section>` + notesLink();
  }
  const LIST_FILTERS = {
    multi: { layer: "buildings", test: (p) => (p.surveyPoints || 0) >= 2, sort: (a, b) => (b.properties.surveyPoints || 0) - (a.properties.surveyPoints || 0), label: ["อาคารที่มี 2 ทะเบียนบ้านขึ้นไป", "Buildings with 2+ house registrations"] },
    straddle: { layer: "buildings", test: (p) => p.straddle, label: ["อาคารที่อยู่บนหลายแปลง", "Buildings spanning parcels"] },
    missing: { layer: "buildings", test: (p) => p.roll === "missing_house_no", sort: (a, b) => (b.properties.estValue || 0) - (a.properties.estValue || 0), label: ["อาคารที่บ้านเลขที่ไม่อยู่ในบัญชีสิ่งปลูกสร้าง", "Buildings whose house number is absent from the roll"] },
    unmatched: { layer: "buildings", test: (p) => p.roll === "house_no_unmatched", sort: (a, b) => (b.properties.estValue || 0) - (a.properties.estValue || 0), label: ["บ้านเลขที่ไม่อยู่ในบัญชี แต่โฉนดยังมีอาคารที่ผูกไม่ได้", "House number not on the roll; title has unlinked roll buildings"] },
    elsewhere: { layer: "buildings", test: (p) => p.roll === "house_no_elsewhere", label: ["บ้านเลขที่อยู่ในบัญชีแต่ผูกกับโฉนดอื่น", "House number on the roll under another title"] },
    fixes: { layer: "taxmap", test: (p) => { const r = taxRow(p.id); return r?.new70 != null && r?.old70 != null && r.new70 - r.old70 >= 1; }, sort: (a, b) => { const d = (f) => { const r = taxRow(f.properties.id); return (r?.new70 ?? 0) - (r?.old70 ?? 0); }; return d(b) - d(a); }, label: ["แปลงที่ข้อเสนอทำให้ภาษีปี 2570 เปลี่ยน เรียงจากมากไปน้อย (ควรตรวจก่อน)", "Parcels whose 2570 tax changes with the fixes, largest first (check first)"] },
    debtors: { layer: "taxmap", test: (p) => ["unpaid", "partial"].includes(taxRow(p.id)?.status69), sort: (a, b) => (taxRow(b.properties.id)?.assessed69 || 0) - (taxRow(a.properties.id)?.assessed69 || 0), label: ["แปลงที่อยู่ในบัญชีลูกหนี้ปี 2569", "Parcels on the 2569 debtor list"] },
    titlesets: { layer: "buildings", test: (p) => setLead(p) != null, sort: (a, b) => (setOf(b.properties)?.new70 ?? -1) - (setOf(a.properties)?.new70 ?? -1), label: ["ชุดโฉนดที่น่าจะคิดภาษีรวมกัน (อาคารหลังเดียวกันคร่อม) เรียงตามภาษีปี 2570 ตามข้อเสนอ", "Title sets likely taxed together (joined by one building), by 2570 tax with fixes"] },
    titleoffroll: { layer: "buildings", test: (p) => setLead(p) != null && setOffRoll(p) > 0, sort: (a, b) => setOffRoll(b.properties) - setOffRoll(a.properties), label: ["ชุดโฉนดที่มีโฉนดยังจับคู่กับบัญชีภาษีไม่ได้ (ควรตรวจว่าตกสำรวจหรือไม่)", "Title sets with a title not matched to the tax roll (check whether it was missed)"] },
    newpoints: { layer: "houses", test: (p) => p.newPoint === true, label: ["หมุดตำแหน่งใหม่จากการสำรวจ", "Positions added by the survey"] },
    nofootprint: { layer: "houses", test: (p) => !p.buildingId, sort: (a, b) => (b.properties.buildingDistM ?? 0) - (a.properties.buildingDistM ?? 0), label: ["หมุดที่ยังไม่มีรูปอาคาร", "Points without a footprint"] },
  };
  const activeListFilter = () => (S.listFilter && LIST_FILTERS[S.listFilter]?.layer === S.dataset ? LIST_FILTERS[S.listFilter] : null);
  /* One list row per title set: the largest building whose titles belong to the set leads it. */
  function setLeads() {
    const fc = S.cache.get(BUILDINGS_PATH());
    if (!fc || !S.parcelTax) return null;
    if (S.setLeads?.fc === fc) return S.setLeads.map;
    const map = new Map();
    for (const f of fc.features) {
      const u = buildingUnit(f.properties);
      if (u?.kind !== "group") continue;
      const cur = map.get(u.id);
      if (!cur || (f.properties.areaM2 || 0) > cur.area) map.set(u.id, { id: f.properties.id, area: f.properties.areaM2 || 0 });
    }
    S.setLeads = { fc, map };
    return map;
  }
  function setLead(p) { const u = buildingUnit(p); return u?.kind === "group" && setLeads()?.get(u.id)?.id === p.id ? u.id : null; }
  const setOf = (p) => { const u = buildingUnit(p); return u?.kind === "group" ? S.taxResult?.byGroup?.get(u.id) || null : null; };
  const setOffRoll = (p) => { const u = buildingUnit(p); return u?.kind === "group" ? (S.parcelTax.buildingGroups.get(u.id) || []).filter((id) => !parcelAttr(id)).length : 0; };
  async function gotoFeature(layer, id) {
    if (!dataset(layer)) return;
    if (S.dataset !== layer) await setDataset(layer);
    const find = () => currentFeatures().find((f) => f.properties.id === id);
    let f = find();
    if (!f && S.scope.type !== "municipality") { await selectScope("sila"); f = find(); }
    if (!f) { toast(text("ไม่พบรายการนี้ในชั้นข้อมูล", "This record is not in the layer")); return; }
    selectRecord(f);
    if (S.selectedLayer) { S.interactionRevision++; S.map.fitBounds(S.selectedLayer.getBounds(), { ...fitPad(64), maxZoom: 19, animate: false }); openPopupFor(f); }
  }
  function genericLayerContent() {
    const chip = Missions?.status[dataset()?.status] ? `<span class="status-label">${esc(text(...Missions.status[dataset().status]))}</span>` : "";
    return `<section class="panel-section"><div class="section-title"><h2>${esc(label(S.dataset))}</h2>${chip}</div><div class="facts-grid">${fact(countFor(S.dataset), `${unitOf(S.dataset)}${text("ในพื้นที่นี้", " in this area")}`)}</div><button class="more-button" data-show-list>${text("ดูรายการในพื้นที่นี้", "Browse records in this area")}</button></section>` + supplementsHTML() + notesLink();
  }
  function highlightTaxpayer(key) {
    if (S.highlightLayer) { S.map.removeLayer(S.highlightLayer); S.highlightLayer = null; }
    S.highlightTaxpayer = key || null;
    if (!key || !S.parcelTax) return;
    const ids = new Set(S.parcelTax.taxpayers.get(key)?.parcels || []);
    const fc = S.cache.get("data/parcels.geojson");
    if (!fc) return;
    const feats = fc.features.filter((f) => ids.has(f.properties.id));
    if (!feats.length) return;
    S.highlightLayer = L.geoJSON({ type: "FeatureCollection", features: feats }, { pane: "selected", interactive: false, style: { color: mapToken("selectedStroke"), weight: 3, dashArray: "6 4", fill: false, opacity: 1 } }).addTo(S.map);
    S.interactionRevision++;
    S.map.fitBounds(S.highlightLayer.getBounds(), { ...fitPad(48), maxZoom: 18, animate: false });
  }
  function titleCardHTML(a) {
    const rows = [];
    rows.push([text("จับคู่โฉนดด้วย", "Title matched by"), a.link === "house" ? text("บ้านเลขที่ของอาคารในแปลง (แผนที่แปลงไม่มีเลขโฉนด) · อ่อนกว่าเลขโฉนด", "house numbers of buildings on the parcel (no deed number in the map) · weaker than a deed")
      : a.link === "pds63" ? text("เลขโฉนดจากบัญชี ภ.ด.ส.3 ปี 2563 (แผนที่แปลงไม่มีเลขโฉนด จับคู่ด้วยรหัสแปลงและเนื้อที่) · อ่อนกว่าเลขโฉนดบนแผนที่", "deed number from the 2563 PDS 3 list (no deed number in the map; matched by map code and area) · weaker than a deed on the map")
      : text("เลขโฉนด หน้าสำรวจ หรือเลขที่ดิน", "deed, survey or land number")]);
    rows.push([text("เจ้าของ", "Owner"), a.tp ? (a.own && a.own !== "d69" && a.own.endsWith("h") ? stateChip("passed", text("ผ่าน · บ้านเลขที่ตรง", "Passed · house numbers agree")) + " " : "") + esc(ownEvidenceText(a.own)) : stateChip("awaiting", text("ยังไม่พบในบัญชีปี 2563", "Not found in the 2563 list"))]);
    rows.push([text("อาคารในบัญชีของโฉนดนี้", "Buildings on this title’s roll"), a.rollBld != null ? text(`${num(a.rollBld)} หลัง${a.bldValue != null ? ` · ${moneyShort(a.bldValue)}` : ""}`, `${num(a.rollBld)}${a.bldValue != null ? ` · ${moneyShort(a.bldValue)}` : ""}`) : text("ยังไม่มีข้อมูลส่วนนี้", "Not available")]);
    if (a.missBld) rows.push([text("อาคารที่สำรวจพบแต่ไม่อยู่ในบัญชี", "Surveyed buildings missing from the roll"), text(`${num(a.missBld)} หลัง${a.surveyBld ? ` · ประมาณ ${moneyShort(a.surveyBld)}` : ""}`, `${num(a.missBld)}${a.surveyBld ? ` · about ${moneyShort(a.surveyBld)}` : ""}`)]);
    return `<div class="record-section"><h3>${text("โฉนดของแปลงนี้ในบัญชีภาษี", "This parcel’s title on the roll")}</h3><dl class="record-dl">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`
      + (a.tp ? "" : `<p class="small-note">${text("ยังไม่รู้ว่าเป็นของเจ้าของรายใด บัญชีปี 2569 ไม่มีชื่อเจ้าของ และไม่พบโฉนดนี้ในบัญชี ภ.ด.ส.3 ปี 2563 จึงคิดทีละโฉนด", "The owner is not known: the 2569 roll carries no owner and this title is not in the 2563 PDS 3 list, so tax is worked out for the title alone.")}</p>`) + `</div>`;
  }
  function portfolioHTML(parcelId) {
    const a = parcelAttr(parcelId);
    if (!a || !S.parcelTax) return "";
    if (!a.tp) return titleCardHTML(a);
    const tp = S.parcelTax.taxpayers.get(a.tp), r = S.taxResult?.byTaxpayer?.get(a.tp);
    if (!tp) return "";
    const list = tp.parcels.slice(0, 12).map((id) => {
      const f = S.cache.get("data/parcels.geojson")?.features.find((x) => x.properties.id === id);
      const tr = taxRow(id);
      const name = `${esc(f?.properties.code || id)}${parcelAttr(id)?.useLabel ? ` · ${esc(text(...parcelAttr(id).useLabel))}` : ""}`;
      return `<li${id === parcelId ? ' aria-current="true"' : ""}>${id === parcelId ? `<span>${name}</span>` : `<button type="button" class="portfolio-link" data-goto="${esc(S.dataset)}|${esc(id)}">${name}</button>`}<span>${tr ? esc(moneyShort(tr.assessed69)) : "—"}</span></li>`;
    }).join("");
    const roll = tp.roll || {}, rollParts = [];
    if (roll.land != null) rollParts.push(text(`ที่ดิน ${num(roll.land)} รายการ`, `${num(roll.land)} land title${roll.land === 1 ? "" : "s"}`));
    if (roll.bld != null) rollParts.push(text(`สิ่งปลูกสร้าง ${num(roll.bld)}`, `${num(roll.bld)} building${roll.bld === 1 ? "" : "s"}`));
    if (roll.condo) rollParts.push(text(`ห้องชุด ${num(roll.condo)} ห้อง`, `${num(roll.condo)} condo units`));
    const from63 = tp.src === "2563";
    return `<div class="record-section"><h3>${esc(from63 ? text(`เจ้าของ${ownerText(a.tp)}`, `Owner ${ownerText(a.tp)}`) : `${tpLabel(a.tp)} · ${tp.type === "juristic" ? text("นิติบุคคล", "juristic person") : tp.type === "individual" ? text("บุคคลธรรมดา", "individual") : text("ไม่ทราบประเภท", "type unknown")}`)}</h3>`
      + (from63 ? `<p class="small-note"><span class="evidence-badge" data-evidence="hypothesis">${text("สมมติฐาน", "Hypothesis")}</span> ${text("เจ้าของตามบัญชี ภ.ด.ส.3 ปี 2563 สมมติว่ายังไม่เปลี่ยน · ชื่อไม่แสดงบนเว็บ", "Owner from the 2563 PDS 3 list, assumed unchanged · names are not shown")}</p>` : "")
      + `<dl class="record-dl">${rollParts.length ? `<dt>${text("ในบัญชีภาษี", "On the tax roll")}</dt><dd>${esc(rollParts.join(" · "))}</dd>` : ""}${from63 ? "" : `<dt>${text("บัญชีลูกหนี้ 30 ก.ย. 2569", "Debtor list, 30 Sep 2569")}</dt><dd>${esc(text(`ประเมิน ${money(tp.assessed69, 2)} · ค้าง ${money(tp.debt69, 2)}`, `assessed ${money(tp.assessed69, 2)} · owed ${money(tp.debt69, 2)}`))}</dd>`}<dt>${text("แปลงที่จับคู่ได้บนแผนที่", "Matched parcels on the map")}</dt><dd>${esc(text(`${num(tp.parcels.length)} แปลง · ภาษีปี 2569 รวม ${money(r?.assessed69, 2)}`, `${num(tp.parcels.length)} · 2569 tax ${money(r?.assessed69, 2)}`))}</dd><dt>${text("ปี 2570 ตามข้อเสนอ", "2570 with fixes")}</dt><dd>${esc(money(r?.new70, 2))}</dd></dl>`
      + (r && tp.assessed69 != null && Math.abs((r.assessed69 || 0) - tp.assessed69) > 1 ? `<p class="small-note">${text("ยอดของแปลงบนแผนที่ไม่เท่ายอดในบัญชีลูกหนี้ อาจมีโฉนดที่ยังจับคู่ไม่ได้ หรือสองบัญชีไม่ตรงกัน ควรตรวจกับกองคลัง", "The matched parcels do not add up to the debtor-list amount: some titles may be unmatched, or the two registers disagree. Check with the finance division.")}</p>` : "")
      + `<ul class="portfolio-list">${list}</ul>${tp.parcels.length > 12 ? `<p class="small-note">${text(`และอีก ${num(tp.parcels.length - 12)} แปลง`, `and ${num(tp.parcels.length - 12)} more`)}</p>` : ""}`
      + `<div class="record-actions"><button type="button" class="mini-action" data-highlight-taxpayer="${esc(a.tp)}">${text("ไฮไลต์ทุกแปลงของรายนี้บนแผนที่", "Highlight all this taxpayer’s parcels")}</button>${propKeyOf(parcelId) ? `<button type="button" class="mini-action" data-goto="properties|${esc(parcelId)}">${text("ดูทรัพย์สินที่แปลงนี้อยู่", "See the property this parcel belongs to")}</button>` : ""}</div></div>` + titleCardHTML(a);
  }
  function initMap() {
    S.map = L.map("map", {
      zoomControl: false,
      preferCanvas: true,
      minZoom: 8,
      maxZoom: 22,
      zoomSnap: 0.25,
      attributionControl: true,
      fadeAnimation: false,
      zoomAnimation: false,
    });
    L.control.zoom({ position: "topright" }).addTo(S.map);
    localizeZoom();
    S.map.createPane("terrain");
    S.map.getPane("terrain").style.zIndex = 330;
    S.map.getPane("terrain").style.pointerEvents = "none";
    S.map.createPane("boundary");
    S.map.getPane("boundary").style.zIndex = 350;
    S.boundaryRenderer = L.svg({ pane: "boundary" });
    S.map.createPane("features");
    S.map.getPane("features").style.zIndex = 360;
    S.map.createPane("symbols");
    S.map.getPane("symbols").style.zIndex = 380;
    S.map.createPane("selected");
    S.map.getPane("selected").style.zIndex = 390;
    S.map.getPane("selected").style.pointerEvents = "none";
    S.map.createPane("outsideMask");
    S.map.getPane("outsideMask").style.zIndex = 450;
    S.map.getPane("outsideMask").style.pointerEvents = "none";
    S.maskRenderer = L.svg({ pane: "outsideMask" });
    setBasemap();
    S.map.on("dragstart", () => S.interactionRevision++);
    S.map.on("popupopen", () => document.querySelector(".map-stage")?.classList.add("popup-open"));
    S.map.on("popupclose", () => document.querySelector(".map-stage")?.classList.remove("popup-open"));
    $("map").addEventListener("wheel", () => S.interactionRevision++, {
      passive: true,
    });
    // Trackpad: a two-finger swipe that starts mostly sideways pans; up/down swipes, mouse wheels and pinches zoom as before.
    { let mode = null, last = 0, dx = 0, dy = 0, raf = 0;
      $("map").addEventListener("wheel", (e) => {
        if (e.ctrlKey || e.deltaMode !== 0) { mode = null; return; }
        const now = performance.now();
        if (!mode || now - last > 220) mode = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? "pan" : "zoom";
        last = now;
        if (mode !== "pan") return;
        e.preventDefault(); e.stopImmediatePropagation(); S.interactionRevision++;
        dx += e.deltaX; dy += e.deltaY;
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (dx || dy) S.map.panBy([dx, dy], { animate: false }); dx = dy = 0; });
      }, { capture: true, passive: false }); }
    $("map").addEventListener("click", (e) => {
      if (e.target.closest(".leaflet-control-zoom")) S.interactionRevision++;
    });
    S.map.on("click", handleMapClick);
    installHover();
    S.map.on("zoomend", () => {
      $("map").dataset.zoom = String(S.map.getZoom());
      syncSymbols();
      // Flood site numbers only once the sites are apart (zoom 14 and closer); the tooltip and list carry them at any zoom.
      if (S.siteLabels && S.featureLayer && S.dataset === "floodsites") { const show = S.map.getZoom() >= 14; if (show && !S.featureLayer.hasLayer(S.siteLabels)) S.featureLayer.addLayer(S.siteLabels); else if (!show && S.featureLayer.hasLayer(S.siteLabels)) S.featureLayer.removeLayer(S.siteLabels); }
    });
    S.map.on("moveend", () => {
      const c=S.map.getCenter();
      Object.assign($("map").dataset,{longitude:String(c.lng),latitude:String(c.lat),zoom:String(S.map.getZoom())});
      if (S.dataset === "terrain" && !S.terrain3DVisible) scheduleTerrainSurface();
    });
    new ResizeObserver(() => {S.map.invalidateSize({ pan: false });S.terrain3D?.resize();}).observe(
      $("map"),
    );
  }
  function setBasemap() {
    if (!S.map) return;
    const revision = ++S.basemapRevision;
    if (S.tile) {
      S.map.removeLayer(S.tile);
      S.tile.off();
      S.tile = null;
    }
    S.tileFailed = false;
    $("map-error").hidden = true;
    if (S.basemap === "none") {
      $("map").dataset.basemapStatus = "none";
      $("map").dataset.basemapRenderer = "";
      $("basemap-caption").hidden = true;
      return;
    }
    $("map").dataset.basemapStatus = "loading";
    $("basemap-caption").hidden = !S.basemap.startsWith("satellite");
    $("basemap-caption").textContent = text("ภาพดาวเทียม · กำลังโหลดข้อมูลต้นทาง", "Satellite · loading source imagery");
    S.tile = window.SilaBasemap.create({
      mode: S.basemap,
      theme: S.theme,
      language: S.lang,
      fallback: true,
    })
      .on("basemapstatus", (e) => {
        if (revision !== S.basemapRevision) return;
        $("map").dataset.basemapStatus = e.status;
        $("map").dataset.basemapRenderer = e.renderer || "";
        $("map").dataset.basemapTheme = S.theme;
        if (e.status === "ready") {
          if (S.basemap.startsWith("satellite")) {const state=S.tile?.getBasemapState?.();$("basemap-caption").textContent=state?.zoomNotice || text("ภาพดาวเทียม · รอรายละเอียดต้นทาง", "Satellite · source details pending");}
          S.tileFailed = false;
          $("map-error").hidden = true;
        }
      })
      .on("basemapzoom", e => {
        if (revision !== S.basemapRevision || !S.basemap.startsWith("satellite")) return;
        const state = S.tile?.getBasemapState?.() || e;
        $("basemap-caption").textContent = state.zoomNotice || text("ภาพดาวเทียม · รอรายละเอียดต้นทาง", "Satellite · source details pending");
      })
      .on("tileerror", () => {
        if (revision !== S.basemapRevision) return;
        S.tileFailed = true;
        $("map-error").textContent = text(
          "พื้นหลังบางส่วนโหลดไม่ได้ ข้อมูลเทศบาลยังใช้งานได้",
          "Some basemap tiles failed. Municipal data remains usable.",
        );
        $("map-error").hidden = false;
      })
      .on("basemapfallback", () => {
        if (revision !== S.basemapRevision) return;
        S.tileFailed = true;
        $("map-error").textContent = text(
          "OpenFreeMap ใช้งานไม่ได้ในขณะนี้ · ใช้พื้นหลัง OpenStreetMap สำรอง",
          "OpenFreeMap unavailable · using the OpenStreetMap fallback",
        );
        $("map-error").hidden = false;
      })
      .addTo(S.map);
  }

  /* Bottom-sheet layout (phones and tablets): the sheet covers the lower part of the full-height map,
     so fits keep their target in the visible part above it. */
  const sheetLayout = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(max-width: 899px)").matches;
  const sheetCover = () => { if (!sheetLayout()) return 0; const r = $("inspector")?.getBoundingClientRect(), m = $("map")?.getBoundingClientRect(); return r && m ? Math.max(0, Math.round(m.bottom - r.top)) : 0; };
  const fitPad = (x, y = x) => ({ paddingTopLeft: [x, y], paddingBottomRight: [x, y + sheetCover()] });
  function fitScope() {
    const b = scopeData().bbox;
    if (!b) return;
    S.map.fitBounds(
      [
        [b[1], b[0]],
        [b[3], b[2]],
      ],
      {
        ...fitPad(24, 16),
        maxZoom: S.scope.type === "municipality" ? 13 : 16,
        animate: false,
      },
    );
    if (S.dataset === "terrain" && S.mode === "3d" && S.terrain3D) S.terrain3D.setCamera({...S.terrain3DCamera,...terrainCamera2D()});
  }
  function geoForBoundary() {
    return S.cache.get(BOUNDARY_TYPES[S.boundary].file);
  }
  function drawOutsideMask() {
    if (S.outsideMask) S.map.removeLayer(S.outsideMask);
    const source = S.cache.get("data/municipality.geojson");
    const rings = source.features.flatMap((f) =>
      f.geometry.type === "Polygon"
        ? f.geometry.coordinates
        : f.geometry.type === "MultiPolygon"
          ? f.geometry.coordinates.flat()
          : [],
    );
    if (!rings.length)
      throw new Error("Municipal polygon is required for the outside mask");
    const world = [
      [-180, -85.05112878],
      [180, -85.05112878],
      [180, 85.05112878],
      [-180, 85.05112878],
      [-180, -85.05112878],
    ];
    S.outsideMask = L.geoJSON(
      {
        type: "Feature",
        properties: { role: "outside-municipality-mask" },
        geometry: { type: "Polygon", coordinates: [world, ...rings] },
      },
      {
        pane: "outsideMask",
        renderer: S.maskRenderer,
        interactive: false,
        bubblingMouseEvents: false,
        onEachFeature: (_feature, layer) =>
          layer.on("add", () => {
            const node = layer.getElement?.();
            node?.setAttribute("data-map-role", "outside-municipality-mask");
            node?.setAttribute("aria-hidden", "true");
          }),
        style: {
          stroke: false,
          fill: true,
          fillRule: "evenodd",
          fillColor:
            S.theme === "dark"
              ? S.tokens.foundation["surface.canvas"].dark
              : S.tokens.foundation["surface.raised"].light,
          fillOpacity: 0.78,
        },
      },
    ).addTo(S.map);
    const node = S.outsideMask.getLayers()[0]?.getElement?.();
    node?.setAttribute("data-map-role", "outside-municipality-mask");
    node?.setAttribute("aria-hidden", "true");
  }
  function drawBoundaries() {
    if (S.boundaryLayer) S.map.removeLayer(S.boundaryLayer);
    if (S.contextLayer) S.map.removeLayer(S.contextLayer);
    S.contextLayer = null;
    const fc = geoForBoundary();
    const data =
      S.scope.type === "municipality"
        ? fc
        : {
            ...fc,
            features: fc.features.filter((f) => f.properties.id === S.scope.id),
          };
    const scale = S.tokens.analyticalScales.find(
      (x) => x.scaleId === "count" && x.theme === S.theme,
    );
    const maxPop = Math.max(
      ...S.metadata.villages.map((x) => x.populationReported || 0),
    );
    if (S.theme === "light" || S.basemap.startsWith("satellite")) {
      const width = S.scope.type === "municipality" ? 1.2 : 2.5;
      const halos=[];
      if (S.basemap.startsWith("satellite")) halos.push(L.geoJSON(data,{pane:"boundary",renderer:S.boundaryRenderer,interactive:false,style:{color:"#FFFFFF",weight:width+4,opacity:1,fill:false}}));
      halos.push(L.geoJSON(data,{pane:"boundary",renderer:S.boundaryRenderer,interactive:false,style:{color:"#182327",weight:width+2,opacity:1,fill:false}}));
      S.contextLayer=L.featureGroup(halos).addTo(S.map);
    }
    S.boundaryLayer = L.geoJSON(data, {
      pane: "boundary",
      renderer: S.boundaryRenderer,
      style: (f) => {
        const popView =
          S.dataset === "population" &&
          S.boundary === "village" &&
          S.scope.type === "municipality";
        return {
          color:
            S.scope.type === "municipality"
              ? mapToken("activeLayer")
              : mapToken("selectedStroke"),
          weight: S.scope.type === "municipality" ? 1.2 : 2.5,
          fill: popView,
          fillColor: popView
            ? f.properties.populationReported == null
              ? scale.noData
              : scale.classes["5"][
                  Math.min(
                    4,
                    Math.floor((f.properties.populationReported / maxPop) * 5),
                  )
                ]
            : categoryColor("villages"),
          fillOpacity: popView ? 1 : 0,
          opacity: 1,
        };
      },
      onEachFeature: (f, l) => {
        if (["overview", "population"].includes(S.dataset) || !dataset()?.geojson)
          l.bindTooltip(S.dataset === "population" && f.properties.populationReported != null ? `<strong>${esc(f.properties.label)}</strong><div>${num(f.properties.populationReported)} ${text("คน · ปี 2569", "people · 2026")}</div>` : esc(f.properties.label), {
            sticky: true,
            direction: "top",
            className: "sila-hover",
          });
        l.on("mouseover", () => {
          l.setStyle({ color: mapToken("hoverStroke"), weight: 3 });
          l.bringToFront();
        });
        l.on("mouseout", () => S.boundaryLayer.resetStyle(l));
        l.on("click", (e) => {
          if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
          handleMapClick(e);
        });
        l.on("add", () => {
          const node = l.getElement?.();
          if (!node) return;
          node.setAttribute("tabindex", "0");
          node.setAttribute("role", "button");
          node.setAttribute(
            "aria-label",
            text("เลือก ", "Select ") + areaLabel(f.properties),
          );
          node.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              selectScope(f.properties.id);
            }
          });
        });
      },
    }).addTo(S.map);
  }
  function featureStyle(id) {
    return {
      color: !["roads", "parcels", "waterways"].includes(id) && (S.theme === "light" || S.basemap.startsWith("satellite")) ? "#182327" : categoryColor(id),
      weight: id === "roads" ? 2 : id === "buildings" ? 1 : 1.2,
      opacity: 1,
      fill: !["roads", "parcels"].includes(id),
      fillColor: categoryColor(id),
      fillOpacity: 1,
    };
  }
  function featureGroup(fc, id, interactive = true) {
    const main = L.geoJSON(fc, {
      pane: "features",
      interactive,
      style: featureStyle(id),
      pointToLayer: (f, ll) =>
        L.circleMarker(ll, {
          pane: "features",
          radius: id === "houses" ? 3 : 6,
          color: S.basemap.startsWith("satellite") ? "#182327" : mapToken("markerStroke"),
          weight: 1.5,
          fillColor: categoryColor(id),
          fillOpacity: 1,
          opacity: 1,
          interactive,
        }),
      onEachFeature: interactive
        ? (f, l) => {
            l.bindTooltip(esc(f.properties.label || f.properties.id), {
              sticky: true,
              direction: "top",
            });
            l.on("click", (e) => {
              L.DomEvent.stopPropagation(e.originalEvent);
              selectRecord(f, true, true);
            });
          }
        : undefined,
    });
    // Flood study sites carry their number beside the dot so officers can match them with the study and the plan.
    if (id === "floodsites") {
      const labels = L.geoJSON(fc, { pane: "features", interactive: false, pointToLayer: (f, ll) => L.marker(ll, { pane: "features", interactive: false, keyboard: false, icon: L.divIcon({ className: "site-number", html: `<span>${esc(String(f.properties.site).padStart(2, "0"))}</span>`, iconSize: [28, 18], iconAnchor: [-8, 9] }) }) });
      S.siteLabels = labels;
      const group = L.featureGroup([main]);
      if (S.map.getZoom() >= 14) group.addLayer(labels);
      return group;
    }
    // A neutral underlay keeps original category HEX legible without recoloring data.
    // Both layers are non-interactive; source geometry remains the central picking authority.
    if (["roads", "parcels", "waterways"].includes(id)) {
      const layers=[];
      if (S.basemap.startsWith("satellite")) layers.push(L.geoJSON(fc,{pane:"features",interactive:false,style:{color:"#FFFFFF",weight:6,opacity:1,fill:false}}));
      layers.push(L.geoJSON(fc,{pane:"features",interactive:false,style:{color:"#182327",weight:4,opacity:1,fill:false}}),main);
      const group=L.featureGroup(layers);
      group.on("add",()=>main.bringToFront());
      return group;
    }
    return main;
  }
  function drawTerrain() {
    if (S.mode === "3d" && S.terrain3DVisible) { drawLegend(); return; }
    if (!S.terrainSource || !S.terrainCoverage || !window.SilaFabdem?.createLayer) {
      S.terrainStatus = { state: "error" };
      drawLegend();
      return;
    }
    if (!S.terrainLayer) {
      S.terrainLayer = window.SilaFabdem.createLayer({
        coverage: S.terrainCoverage,
        source: S.terrainSource,
        theme: S.theme,
        pane: "terrain",
        style: terrainSurfaceStyle(),
        onStatus: status => {
          const changed = S.terrainStatus.state !== status.state;
          S.terrainStatus = status;
          $("map").dataset.terrainState = status.state;
          if (S.dataset === "terrain" && (status.state === "ready" || status.state === "partial")) scheduleTerrainSurface();
          if (S.dataset !== "terrain" || !changed) return;
          const node = $("terrain-state");
          if (node) node.textContent = terrainStateLabel();
          renderTerrainControls();
          drawLegend();
        },
      }).addTo(S.map);
    } else S.terrainLayer.setTheme?.(S.theme);
    drawLowground();
    drawLegend();
  }
  /* ---------- Revision 2.0: closed low ground on the terrain map ----------
     Depressions in FABDEM filled to their spill level (priority flood); depth = how deep water could stand before it
     spills over the lowest rim. Drawn in 2D with the LDS 'water' sequential scale (5 classes, same colours in both
     themes); the data file ships only after the owner's review of the flood pictures. */
  const LOWGROUND_FILE = "data/flood-lowground.geojson";
  const LOWGROUND_CLASSES = [[0.3, "0.3–0.5"], [0.5, "0.5–1"], [1, "1–2"], [2, "2–4"], [4, "≥ 4"]];
  const lowgroundClass = (d) => { let k = 0; for (let i = 0; i < LOWGROUND_CLASSES.length; i++) if (d >= LOWGROUND_CLASSES[i][0]) k = i; return k; };
  const lowgroundColors = () => { try { return window.SilaScales.classes("water", 5); } catch (_) { return null; } };
  function clearLowground() { if (S.lowgroundLayer) { S.map.removeLayer(S.lowgroundLayer); S.lowgroundLayer = null; } }
  async function drawLowground() {
    clearLowground();
    if (S.dataset !== "terrain" || !S.terrainLowground || S.mode === "3d" || S.lowgroundStatus === "missing") return;
    let fc = S.cache.get(LOWGROUND_FILE);
    if (!fc) {
      try { fc = await fetchJSON(LOWGROUND_FILE); S.lowgroundStatus = "ready"; renderLayerControls(); }
      catch (_) { S.lowgroundStatus = "missing"; return; }
      if (S.dataset !== "terrain" || !S.terrainLowground || S.mode === "3d") return;
    }
    S.lowgroundStatus = "ready";
    const cols = lowgroundColors();
    if (!cols) return;
    S.lowgroundLayer = L.geoJSON(fc, { pane: "features", interactive: true, bubblingMouseEvents: false,
      style: (f) => ({ color: "#182327", weight: 0.6, opacity: 0.7, fillColor: cols[lowgroundClass(f.properties.depthMaxM)], fillOpacity: 0.72 }),
      onEachFeature: (f, l) => l.bindTooltip(`<strong>${esc(text("ที่ลุ่มปิดล้อม", "Closed low ground"))}</strong>${esc(text(`ลึกสุด ${num(f.properties.depthMaxM, 1)} ม. · เฉลี่ย ${num(f.properties.depthMeanM, 1)} ม. · ${num(Math.round(f.properties.areaSqm / 1600))} ไร่ · ล้นที่ระดับ ${num(f.properties.spillLevelM, 1)} ม.`, `deepest ${num(f.properties.depthMaxM, 1)} m · mean ${num(f.properties.depthMeanM, 1)} m · ${num(Math.round(f.properties.areaSqm / 10000 * 10) / 10)} ha · spills at ${num(f.properties.spillLevelM, 1)} m`))}`, { sticky: true, direction: "top", className: "sila-hover" }) }).addTo(S.map);
  }
  function lowgroundLegendHTML() {
    if (S.dataset !== "terrain" || !S.terrainLowground || S.mode === "3d" || S.lowgroundStatus !== "ready") return "";
    const cols = lowgroundColors();
    if (!cols) return "";
    return `<div class="legend-title" style="margin-top:8px">${text("ที่ลุ่มปิดล้อม · ลึกได้ก่อนล้น (เมตร)", "Closed low ground · depth before it spills (m)")}</div><div class="legend-classes">${LOWGROUND_CLASSES.map(([, l], i) => `<div class="legend-class"><span class="legend-chip" style="background:${cols[i]}"></span><span>${esc(l)}</span></div>`).join("")}</div><div class="legend-unit">${text("เติมแอ่งใน FABDEM 30 ม. ถึงระดับล้น คลาดเคลื่อนราว 1 ม. · บอกว่าน้ำขังได้ตรงไหน ไม่ใช่ว่าจะท่วม · ไม่รวมท่อระบายและทางน้ำที่สร้างขึ้น", "FABDEM 30 m depressions filled to the spill level, about 1 m error · where water can stand, not a flood forecast · ignores drains and built channels")}</div>`;
  }
  /* ---------- Revision 2.0: headline symbols, the AHA at city zoom ----------
     At city zoom the parcels that matter are too small to see, so the largest figures are drawn as proportional circles
     at parcel centroids: negotiation (gain, coloured by the initiative that explains most of it), farmland watch (potential)
     and the top 10 owners (one circle on each owner's most valuable parcel, numbered by rank). The circles hide from
     zoom 16, where the parcels themselves are legible, and the figure is always printed in the tooltip, popup and list. */
  const SYMBOL_MAX = 60, SYMBOL_HIDE_ZOOM = 16;
  const centroidOf = (geom) => {
    const ring = geom.type === "Polygon" ? geom.coordinates[0] : geom.type === "MultiPolygon" ? geom.coordinates.map((p) => p[0]).sort((a, b) => b.length - a.length)[0] : null;
    if (!ring || !ring.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return [(y0 + y1) / 2, (x0 + x1) / 2];
  };
  function symbolRows() {
    if (!S.taxResult || !S.parcelTax) return [];
    if (S.dataset === "negotiate") {
      const init = S.initiative;
      return currentFeatures().map((f) => { const r = taxRow(f.properties.id); if (!r) return null; const v = init ? (r.alloc.get(init) || 0) : negotiateGain(r); return v >= 1 ? { f, v, color: initiativeColor(init || dominantOf(r) || "rollBelow"), tip: `${featureTitle(f)} · ${text(`เก็บเพิ่มได้ +${fixed(v, 0)} บาท/ปี`, `can add +${fixed(v, 0)} THB/yr`)}` } : null; }).filter(Boolean).sort((a, b) => b.v - a.v).slice(0, SYMBOL_MAX);
    }
    if (S.dataset === "agriwatch") {
      const by = new Map(agriWatchScope().map((w) => [w.id, w]));
      return currentFeatures().map((f) => { const w = by.get(f.properties.id); return w && w.potential >= 1 ? { f, v: w.potential, color: catHex("lime"), tip: `${featureTitle(f)} · ${text(`ถ้าไม่ได้ทำประโยชน์ +${fixed(w.potential, 0)} บาท/ปี`, `if unused +${fixed(w.potential, 0)} THB/yr`)}` } : null; }).filter(Boolean).sort((a, b) => b.v - a.v).slice(0, SYMBOL_MAX);
    }
    if (S.dataset === "portfolio" && !S.owner) {
      const byId = new Map(currentFeatures().map((f) => [f.properties.id, f]));
      return ownersInScope().slice(0, 10).map((o) => {
        const best = o.parcels.map((id) => ({ id, f: byId.get(id), a: parcelAttr(id) })).filter((x) => x.f).sort((x, y) => (y.a?.landValue || 0) - (x.a?.landValue || 0))[0];
        return best ? { f: best.f, v: o.value, color: o.type === "juristic" ? catHex("blue") : catHex("teal"), owner: o.code, rank: o.rank, tip: text(`อันดับ ${o.rank} · รหัส ${o.code} · ${moneyShort(o.value)} · ${num(o.parcels.length)} แปลง`, `#${o.rank} · code ${o.code} · ${moneyShort(o.value)} · ${num(o.parcels.length)} parcels`) } : null;
      }).filter(Boolean);
    }
    return [];
  }
  function clearSymbols() { if (S.symbolLayer) { S.map.removeLayer(S.symbolLayer); S.symbolLayer = null; } S.symbolCount = 0; }
  function drawSymbols() {
    clearSymbols();
    if (!S.map || S.terrain3DVisible) return;
    const rows = symbolRows();
    if (!rows.length) return;
    const vmax = Math.max(...rows.map((r) => r.v)) || 1;
    const stroke = mapToken("markerStroke");
    // Circles scale with the map: full size from about 700 px wide, two-thirds on a 320 px phone.
    const k = Math.max(0.6, Math.min(1, ($("map")?.clientWidth || 700) / 700));
    S.symbolLayer = L.layerGroup([], { pane: "symbols" });
    for (const r of rows) {
      const ll = centroidOf(r.f.geometry);
      if (!ll) continue;
      const radius = (r.rank ? 16 : 7 + 21 * Math.sqrt(r.v / vmax)) * k;
      const m = L.circleMarker(ll, { pane: "symbols", radius, color: stroke, weight: 1.5, opacity: 0.9, fillColor: r.color, fillOpacity: 0.82, bubblingMouseEvents: false });
      m.bindTooltip(r.tip, { direction: "top", offset: [0, -radius], className: "sila-hover", sticky: false });
      m.on("click", (e) => { L.DomEvent.stop(e); if (r.owner) { S.owner = r.owner; if (S.dataset !== "portfolio") setDataset("portfolio"); else setOwner(r.owner); } else selectRecord(r.f, true, true); });
      S.symbolLayer.addLayer(m);
      if (r.rank) S.symbolLayer.addLayer(L.marker(ll, { pane: "symbols", interactive: false, icon: L.divIcon({ className: "symbol-rank", html: `<span>${r.rank}</span>`, iconSize: [32, 32], iconAnchor: [16, 16] }) }));
    }
    S.symbolCount = rows.length;
    syncSymbols();
  }
  function syncSymbols() {
    if (!S.symbolLayer || !S.map) return;
    const show = S.map.getZoom() < SYMBOL_HIDE_ZOOM;
    if (show && !S.map.hasLayer(S.symbolLayer)) S.symbolLayer.addTo(S.map);
    else if (!show && S.map.hasLayer(S.symbolLayer)) S.map.removeLayer(S.symbolLayer);
  }
  function symbolLegendHTML() {
    if (!S.symbolCount) return "";
    const what = S.dataset === "portfolio" ? text("วงกลมมีเลข = เจ้าของ 10 อันดับแรก วางบนแปลงที่มูลค่าสูงสุดของรายนั้น น้ำเงิน นิติบุคคล · เขียว บุคคลธรรมดา · แตะเพื่อเปิดรายนั้น", "Numbered circles = the top 10 owners, on each owner's most valuable parcel; blue company, green individual · tap to open")
      : text(`วงกลม = ${num(S.symbolCount)} แปลงที่ตัวเลขมากที่สุด ขนาดตามจำนวนเงิน · ซูมเข้าเพื่อเห็นแปลงจริง`, `Circles = the ${num(S.symbolCount)} largest figures, sized by amount · zoom in to see the parcels`);
    return `<div class="legend-row legend-symbol"><span class="legend-circle"></span><span>${esc(what)}</span></div>`;
  }
  async function drawFeatures(ticket) {
    if (S.dataset !== "terrain" && S.terrainLayer) {
      S.map.removeLayer(S.terrainLayer);
      S.terrainLayer = null;
    }
    if (S.dataset !== "terrain") clearLowground();
    if (S.featureLayer) S.map.removeLayer(S.featureLayer);
    S.featureLayer = null;
    clearSymbols();
    if (S.selectedLayer) S.map.removeLayer(S.selectedLayer);
    S.selectedLayer = null;
    const d = dataset();
    S.pickIndex = null;
    if (S.dataset === "terrain") {
      drawTerrain();
      return;
    }
    if (
      !d.geojson ||
      ["population", "villages", "municipality", "election"].includes(S.dataset)
    ) {
      drawLegend();
      return;
    }
    const fc = await fetchJSON(d.geojson);
    if (ticket !== S.ticket) return;
    const scoped = filterFeatures(fc);
    S.pickIndex = window.SilaMapPick.createIndex(scoped);
    if (CHORO_LAYERS.has(S.dataset)) {
      computeClassing();
      S.featureLayer = L.geoJSON({ ...fc, features: scoped }, { pane: "features", interactive: false, style: choroplethStyle }).addTo(S.map);
    } else if (S.dataset === "buildings") {
      computeClassing();
      S.featureLayer = L.geoJSON({ ...fc, features: scoped }, { pane: "features", interactive: false, style: buildingStyle }).addTo(S.map);
    } else S.featureLayer =
      S.dataset === "houses"
        ? window.SilaHousePoints.create({
            features: scoped,
            language: S.lang,
            interactive: false,
            color: categoryColor("houses"),
            strokeColor: S.basemap.startsWith("satellite") ? "#182327" : mapToken("markerStroke"),
            onPickPoint: (event) => handleMapClick({
              ...event,
              latlng: event.originalEvent
                ? S.map.mouseEventToLatLng(event.originalEvent)
                : event.latlng,
            }),
            onSelectRecord: (feature) => {
              const [lng, lat] = feature.geometry.coordinates;
              if (!tryDrillAreaAt({ lng, lat })) selectRecord(feature, true, true);
            },
          }).addTo(S.map)
        : featureGroup({ ...fc, features: scoped }, S.dataset, false).addTo(
            S.map,
          );
    drawSymbols();
    drawLegend();
    if (S.restoreRecord) {
      const r = fc.features.find((x) => x.properties.id === S.restoreRecord);
      if (r && filterFeatures({ features: [r] }).length) selectRecord(r, false);
      S.restoreRecord = null;
    }
    if (S.record) drawSelected();
  }
  function showChoice(features, reason, kind = "records") {
    S.record = null;
    if (S.selectedLayer) S.map.removeLayer(S.selectedLayer);
    S.selectedLayer = null;
    S.choice = { features: [...features], reason, kind, page: 60 };
    renderRecord();
    renderHeader();
    syncURL();
    if (sheetLayout()) { if (S.sheet === "peek") window.setSheet?.("half"); $("record-detail").scrollIntoView({ behavior: "auto", block: "start" }); }
  }
  function tryDrillAreaAt(latlng) {
    const xy = [latlng.lng, latlng.lat];
    if (S.scope.type === "municipality" && S.boundary !== "municipality") {
      const areas = geoForBoundary().features.filter((f) =>
        window.SilaMapPick.containsPoint(f.geometry, xy),
      );
      if (areas.length === 1) {
        selectScope(areas[0].properties.id);
        return true;
      }
      if (areas.length > 1) {
        showChoice(
          areas,
          text(
            "ขอบเขตต้นทางซ้อนกันบริเวณนี้ เลือกพื้นที่ที่จะตรวจ",
            "Source boundaries overlap here. Choose the area to inspect.",
          ),
          "areas",
        );
        return true;
      }
    }
    return false;
  }
  function handleMapClick(e) {
    if (!e.latlng) return;
    S.lastClickLatLng = e.latlng;
    const xy = [e.latlng.lng, e.latlng.lat];
    const municipal = S.cache.get("data/municipality.geojson")?.features[0];
    if (municipal && !window.SilaMapPick.containsPoint(municipal.geometry, xy))
      return;
    if (tryDrillAreaAt(e.latlng)) return;
    const hits = S.pickIndex?.pick({
      map: S.map,
      latlng: e.latlng,
      tolerancePx: matchMedia("(pointer:coarse)").matches ? 22 : 12,
      limit: Infinity,
    });
    if (hits?.total === 1) {
      selectRecord(hits.features[0], true, true);
      return;
    }
    if (hits?.total > 1 && !hits.exact) {
      /* What the hover card showed is what the click opens; otherwise take a clear nearest hit. */
      const hovered = S.hoverId && hits.features.find((f) => f.properties.id === S.hoverId);
      const d0 = hits.hits[0]?.distancePx ?? Infinity, d1 = hits.hits[1]?.distancePx ?? Infinity;
      if (hovered) { selectRecord(hovered, true, true); return; }
      if (d0 <= 4 && d1 - d0 >= 4) { selectRecord(hits.features[0], true, true); return; }
    }
    if (hits?.total > 1) {
      showChoice(
        hits.features,
        hits.exact
          ? text(
              "หลายรูปตัดตำแหน่งนี้ เลือกรายการที่ต้องการ",
              "Several geometries intersect this position. Choose a record.",
            )
          : text(
              "พบรายการใกล้จุดที่คลิก เลือกเพื่อดูตำแหน่งจริง",
              "Nearby records found. Choose one to inspect its original position.",
            ),
      );
      return;
    }
    if (S.record || S.choice) closeRecord();
  }
  function drawSelected() {
    if (S.selectedLayer) S.map.removeLayer(S.selectedLayer);
    if (!S.record) return;
    // On the properties map the whole property (every adjoining parcel of the owner) is outlined.
    const shown = S.dataset === "properties" ? propertyFeatures(propKeyOf(S.record.properties.id)) : null;
    S.selectedLayer = L.geoJSON(shown?.length > 1 ? { type: "FeatureCollection", features: shown } : S.record, {
      pane: "selected",
      interactive: false,
      style: {
        color: mapToken("selectedStroke"),
        weight: 3,
        fill: false,
        opacity: 1,
      },
      pointToLayer: (f, ll) =>
        L.circleMarker(ll, {
          pane: "selected",
          radius: 10,
          color: mapToken("selectedStroke"),
          weight: 2,
          fill: false,
          interactive: false,
        }),
    }).addTo(S.map);
  }
  async function drawOverlays(ticket) {
    for (const l of S.overlayLayers.values()) S.map.removeLayer(l);
    S.overlayLayers.clear();
    for (const id of S.overlays) {
      if (id === S.dataset) continue;
      const d = dataset(id);
      if (!d?.geojson) continue;
      const fc = await fetchJSON(d.geojson);
      if (ticket !== S.ticket) return;
      const l = featureGroup(
        { ...fc, features: filterFeatures(fc) },
        id,
        false,
      ).addTo(S.map);
      S.overlayLayers.set(id, l);
    }
    drawLegend();
  }
  /* Revision 2.0: the legend lives in the panel under the summary, never on the map. */
  function drawLegend() {
    drawLegendBody();
  }
  /* Leaflet's zoom buttons carry English titles; follow the page language. */
  function localizeZoom() {
    const set = (sel, th, en) => { const el = document.querySelector(sel); if (el) { el.title = text(th, en); el.setAttribute("aria-label", text(th, en)); } };
    set(".leaflet-control-zoom-in", "ซูมเข้า", "Zoom in");
    set(".leaflet-control-zoom-out", "ซูมออก", "Zoom out");
  }
  const TOUCH = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  function drawLegendBody() {
    if (CHORO_LAYERS.has(S.dataset)) {
      $("map-legend").innerHTML = (analyticalLegend() || `<div class="legend-description">${text("กำลังเปิดข้อมูล", "Loading data")}</div>`) + symbolLegendHTML();
      $("map-context-text").textContent = scopeLabel() + " · " + (TOUCH() ? text("แตะเพื่อดูตัวเลขและรายละเอียด", "Tap to read values and details") : text("ชี้เพื่อดูตัวเลข คลิกเพื่อดูรายละเอียด", "Point to read values, click for details"));
      return;
    }
    if (S.dataset === "buildings" && S.buildingView !== "type") {
      $("map-legend").innerHTML = buildingLegend();
      $("map-context-text").textContent = scopeLabel() + " · " + (TOUCH() ? text("แตะอาคารเพื่อดูรายละเอียด", "Tap a building for details") : text("ชี้เพื่อดูอาคาร คลิกเพื่อดูรายละเอียด", "Point to read a building, click for details"));
      return;
    }
    if (S.dataset === "terrain") {
      const pal = TERRAIN_PALETTES[S.terrainPalette], r = S.terrainRange;
      const bar = pal ? `<div class="legend-title">${text("ความสูงจาก FABDEM (เมตร)", "FABDEM height (metres)")}</div><div class="terrain-bar" style="background:${terrainBarCSS(pal.colors)}" role="img" aria-label="${esc(text(`ไล่สีจาก ${num(r.lo, 1)} ถึง ${num(r.hi, 1)} เมตร`, `Colour ramp from ${num(r.lo, 1)} to ${num(r.hi, 1)} metres`))}"></div><div class="terrain-bar-labels">${terrainTicks().map((v) => `<span>${num(v, 1)}</span>`).join("")}</div><div class="legend-unit">${esc((S.terrainMapping === "equalize" ? text("แต่ละช่วงสีครอบคลุมพื้นที่พอ ๆ กัน ตัวเลขใต้แถบคือความสูงที่แบ่งพื้นที่เป็น 4 ส่วนเท่ากัน · ", "Each colour covers a similar share of the area; the numbers split the area into quarters · ") : "") + (S.terrainRangeLock ? text("ล็อกช่วงสีไว้", "Colour range locked") : text("สียืดตามความสูงที่เห็น (ตัดบนล่าง 0.5%) สีเดียวกันต่างมุมมองอาจไม่ใช่ความสูงเดียวกัน", "Colours fit the heights in view (0.5% trimmed); the same colour in another view can mean another height")))}</div>` : "";
      const contour = S.terrainContours ? `<div class="legend-row"><span class="legend-line terrain-contour-sample${TERRAIN_PALETTES[S.terrainPalette] ? " on-colour" : ""}"></span><span>${esc(text(`เส้นชั้นความสูงทุก ${stepText(S.terrainStep)} ม. · เส้นหนาทุก ${stepText(S.terrainStep * 5)} ม.`, `Contours every ${stepText(S.terrainStep)} m · bold every ${stepText(S.terrainStep * 5)} m`))}</span></div>${S.terrainStep < 1 ? `<div class="legend-unit">${text("ละเอียดกว่าความคลาดเคลื่อนของ FABDEM ใช้ดูรูปทรง ไม่ใช่ระดับสำรวจ", "Finer than FABDEM’s error: shows form, not surveyed levels")}</div>` : ""}` : "";
      $("map-legend").innerHTML = `${bar}${contour}${lowgroundLegendHTML()}<div class="legend-row"><span class="legend-line" style="border-color:${mapToken("activeLayer")}"></span><span>${esc(boundaryLabel())}</span></div><div class="legend-description">${esc(S.mode === "3d" ? text("3D · รูปทรงพื้นที่ ไม่ใช่ความเสี่ยงน้ำท่วม", "3D · terrain form, not flood risk") : text("ความสูงพื้นดิน ไม่ใช่ระดับน้ำหรือความเสี่ยงน้ำท่วม", "Ground height, not water level or flood risk"))}</div><div class="legend-description">${esc(terrainStateLabel())}</div>`;
      $("map-context-text").textContent = scopeLabel() + " · " + text("FABDEM เฉพาะอำเภอเมืองขอนแก่น", "FABDEM within Mueang Khon Kaen district only");
      return;
    }
    if (publicAggregate()) {
      $("map-legend").innerHTML = `<div class="legend-row"><span class="legend-line" style="border-color:${mapToken("activeLayer")}"></span><span>${esc(boundaryLabel())}</span></div><div class="legend-description">${text("แผนที่เป็นบริบท · ไม่ได้แจกแจงยอดสรุปตามพื้นที่", "Map context only · summary values are not spatially allocated")}</div>`;
      $("map-context-text").textContent = scopeLabel() + " · " + (S.dataset === "caregroups" ? text("กลุ่มตามบัญชีที่ได้รับ · ไม่ใช่ผู้ป่วยทั้งหมด", "received care cohort · not all patients") : text("ยอดสรุปใช้ทั้งเทศบาล", "summary covers the whole municipality"));
      return;
    }
    if (
      S.dataset === "population" &&
      S.boundary === "village" &&
      S.scope.type === "municipality"
    ) {
      const cs = S.tokens.analyticalScales.find(
        (x) => x.scaleId === "count" && x.theme === S.theme,
      ).classes["5"];
      const max = Math.max(
        ...S.metadata.villages.map((v) => v.populationReported ?? 0),
      );
      $("map-legend").innerHTML =
        `<div>${text("คน · รวมต้นทาง ปี 2569", "People · source total, 2026")}</div><div class="population-legend">${cs.map((c, i) => `<span><span class="legend-swatch" style="background:${c}"></span><small>${num(Math.ceil((i * max) / 5))}–${num(i === 4 ? max : Math.ceil(((i + 1) * max) / 5) - 1)}</small></span>`).join("")}</div><div class="legend-description">${text("หมู่ 11 รอสอบทาน · สีไม่ใช่ความเสี่ยง", "Village 11 to reconcile · not a risk scale")}</div>`;
    } else
      $("map-legend").innerHTML =
        `<div class="legend-row"><span class="legend-line" style="border-color:${mapToken("activeLayer")}"></span><span>${esc(boundaryLabel())}</span></div>${dataset().geojson && !["overview", "population", "villages", "municipality", "election"].includes(S.dataset) ? `<div class="legend-row"><span class="legend-dot" style="background:${categoryColor(S.dataset)}"></span><span>${esc(label(S.dataset))}</span></div>` : ""}<div class="legend-description">${S.dataset === "houses" ? (TOUCH() ? text("หมุดสำรวจทุกจุดในขอบเขต · แตะหมุดเพื่อดูบ้านเลขที่และผลสำรวจ", "All survey points in this scope · tap a point for its house number and survey") : text("หมุดสำรวจทุกจุดในขอบเขต · ชี้เพื่อดูบ้านเลขที่ คลิกเพื่อดูผลสำรวจ", "All survey points in this scope · point to read, click for the survey")) : TOUCH() ? text("แตะเพื่อดูชื่อและรายละเอียด · สีแยกประเภท ไม่ใช่ความเสี่ยง", "Tap for names and details · colours separate types, not risk") : text("ชี้เพื่อดูชื่อ คลิกเพื่อดูรายละเอียด · สีแยกประเภท ไม่ใช่ความเสี่ยง", "Point to read names, click for details · colours separate types, not risk")}</div>`;
    $("map-context-text").textContent =
      S.scope.type === "municipality"
        ? S.boundary === "election"
          ? text(
              "เขตทดลองจากเส้นต้นทาง · ไม่ใช่ขอบเขตทางกฎหมายที่รับรอง",
              "Derived electoral boundaries · legal authority unverified",
            )
          : S.boundary === "municipality"
            ? text(
                "คลิกหรือแตะรูปข้อมูลเพื่อดูรายการ หรือเลือกหมู่บ้านเพื่อลงรายละเอียด",
                "Click or tap data shapes to inspect records, or choose villages to drill down",
              )
            : text(
                "ขอบเขตหมู่บ้านจากไฟล์ · คลิกหรือแตะพื้นที่เพื่อลงรายละเอียด",
                "Source village boundaries · select an area to drill down",
              )
        : scopeLabel() +
          " · " +
          text("รายการใช้ขอบเขตนี้", "records use this scope");
  }
  async function refreshMap({ fit = false } = {}) {
    const ticket = ++S.ticket,
      interactionRevision = S.interactionRevision;
    $("map-loading").textContent = text("กำลังเปิดข้อมูล…", "Loading data…");
    $("map-loading").hidden = false;
    await new Promise((r) => requestAnimationFrame(r));
    try {
      drawBoundaries();
      drawOutsideMask();
      await drawFeatures(ticket);
      if (ticket !== S.ticket) return;
      if (S.dataset === "portfolio" && S.owner && S.highlightTaxpayer !== S.owner) highlightTaxpayer(S.owner);
      await drawOverlays(ticket);
      if (ticket !== S.ticket) return;
      if (fit && interactionRevision === S.interactionRevision) fitScope();
      await syncTerrainView();
      if (ticket !== S.ticket) return;
      if (!S.tileFailed) $("map-error").hidden = true;
      renderPanel();
    } catch (e) {
      if (ticket !== S.ticket) return;
      $("map-error").textContent = text(
        "เปิดชั้นข้อมูลไม่สำเร็จ ลองเลือกชุดข้อมูลนี้อีกครั้ง ขอบเขตยังดูได้",
        "This layer failed to load. Retry the dataset; boundaries remain usable.",
      );
      $("map-error").hidden = false;
      console.error(e);
    } finally {
      if (ticket === S.ticket) $("map-loading").hidden = true;
    }
  }
  /* Calculator prefill from a parcel on the map (land part only; buildings are entered by hand). */
  function calculatorPrefill(parcelId) {
    const a = parcelAttr(parcelId);
    if (!a) return null;
    const out = { landPricePerWah: a.price };
    // The 2569 tax includes the title's buildings, so it is offered for comparison only when the roll lists none.
    const hasBuildings = (a.rollBld || 0) > 0 || (a.bldValue || 0) > 0;
    if (!hasBuildings && a.tax69 != null) out.previousTax = Math.round(a.tax69 * 100) / 100;
    if (a.sqwa != null) { const rai = Math.floor(a.sqwa / 400), ngan = Math.floor((a.sqwa - rai * 400) / 100); Object.assign(out, { rai, ngan, wah: Math.round((a.sqwa - rai * 400 - ngan * 100) * 10) / 10 }); }
    const res = a.mainHome ? "mainLandAndHouse" : "residentialOther";
    const byUse = { agri: "agriculture", res, other: "other", vacant: "vacant" };
    if (byUse[a.use]) out.use = byUse[a.use];
    else if (a.use === "mixed" && a.shares) {
      const parts = Object.entries(a.shares).filter(([, v]) => v > 0);
      // The calculator splits a residence from a business share only; other mixes take the largest use.
      if (parts.every(([k]) => k === "res" || k === "other") && (a.shares.res || 0) > 0) { out.use = res; out.otherSharePct = Math.round((a.shares.other || 0) * 1000) / 10; }
      else out.use = byUse[parts.sort((x, y) => y[1] - x[1])[0][0]];
    }
    const tp = a.tp ? S.parcelTax?.taxpayers?.get(a.tp) : null;
    if (tp?.type) out.owner = tp.type === "juristic" ? "juristic" : "individual";
    return out;
  }
  function calculatorNote(parcelId) {
    const a = parcelAttr(parcelId);
    if (!a) return "";
    const notes = [text("เครื่องคิดเติมราคา เนื้อที่ และการใช้ให้ อาคารต้องใส่เอง", "The calculator fills in price, area and use; enter buildings yourself")];
    if ((a.rollBld || 0) > 0 || (a.bldValue || 0) > 0) notes.push(text(`ภาษีปี 2569 ของโฉนดนี้รวมอาคาร ${num(a.rollBld || 0)} หลังแล้ว จึงไม่เติมไว้เทียบ ใส่อาคารก่อนแล้วกรอกเอง`, `The title’s 2569 tax already includes its ${num(a.rollBld || 0)} building(s), so it is not filled in; add the buildings first, then enter it`));
    else if (a.tax69 != null) notes.push(text("เติมภาษีปี 2569 ไว้เทียบ", "The 2569 tax is filled in to compare"));
    if (a.use === "mixed" && a.shares && Object.keys(a.shares).some((k) => k === "agri" || k === "vacant")) notes.push(text("แปลงนี้ใช้หลายประเภทรวมเกษตรหรือที่ว่าง เครื่องคิดรับได้ประเภทเดียว จึงเติมประเภทที่มีสัดส่วนมากที่สุด", "This title mixes farm or vacant use; the calculator takes one use, so the largest share is filled in"));
    return notes.join(" · ");
  }
  function openTool(id, opener) {
    if (id === "tax-calculator" && window.SilaTaxCalculator) {
      const parcel = opener?.dataset?.parcel;
      window.SilaTaxCalculator.open({ language: S.lang, returnFocus: opener, prefill: parcel ? calculatorPrefill(parcel) : null });
      return;
    }
    toast(text("เครื่องมือนี้ยังเปิดไม่ได้ ลองโหลดหน้าใหม่", "This tool could not open. Try reloading the page."));
  }
  async function setDataset(id, push = true) {
    S.pickIndex = null;
    const resolved = Missions.resolve(id);
    if (!resolved) return;
    const layer = resolved.layer;
    if (layer !== "overview" && !dataset(layer)) return;
    S.mission = Missions.missionFor(layer, resolved.mission || S.mission);
    if (layer !== S.dataset) { hideTerrain3D(); S.mode = "2d"; S.terrain3DError = false; }
    if (layer !== "portfolio" && S.owner) { S.owner = null; if (S.highlightTaxpayer) highlightTaxpayer(null); }
    if (layer !== "negotiate") S.initiative = null;
    S.dataset = layer;
    S.record = null;
    S.choice = null;
    S.restoreRecord = null;
    S.listFilter = null;
    S.search = "";
    S.page = 60;
    S.tab = "overview";
    clearHover();
    closePopup();
    const wantBoundary = resolved.boundary || (layer === "population" && S.scope.type === "municipality" ? "village" : null);
    if (wantBoundary && S.boundary !== wantBoundary) {
      S.boundary = wantBoundary;
      S.scope = { type: "municipality", id: "sila" };
    }
    renderPanel();
    if (push) syncURL();
    await refreshMap();
  }
  async function selectScope(id, push = true) {
    S.pickIndex = null;
    S.listFilter = null;
    S.record = null;
    S.choice = null;
    S.restoreRecord = null;
    S.search = "";
    S.page = 60;
    S.tab = "overview";
    if (id === "sila") S.scope = { type: "municipality", id };
    else if (S.metadata.villages.some((v) => v.id === id)) {
      S.scope = { type: "village", id };
      S.boundary = "village";
    } else if (S.metadata.elections.some((v) => v.id === id)) {
      S.scope = { type: "election", id };
      S.boundary = "election";
    } else return;
    renderPanel();
    if (push) syncURL();
    await refreshMap({ fit: true });
  }
  function selectRecord(f, push = true, fromMap = false) {
    const source = { taxmap: "parcels", properties: "parcels", appraisal: "parcels", negotiate: "parcels", agriwatch: "parcels", portfolio: "parcels", popgrid: "population-grid" }[S.dataset] || S.dataset;
    if (
      (f?.properties?.datasetId !== source && f?.properties?.datasetId !== S.dataset) ||
      !filterFeatures({ features: [f] }).length
    )
      return;
    S.record = f;
    S.choice = null;
    renderRecord();
    drawSelected();
    renderHeader();
    if (push) syncURL();
    clearHover();
    if (S.map && !S.terrain3DVisible) openPopupFor(f, S.lastClickLatLng && S.pickIndex ? S.lastClickLatLng : null);
    S.lastClickLatLng = null;
    const card = $("record-detail");
    // Phones and tablets: a map tap keeps the map in view (the popup shows the key figures and its "See all details"
    // button lifts the sheet); a record chosen from a list lifts a peeking sheet to half so the card is visible.
    if (sheetLayout()) { if (!fromMap && S.sheet === "peek") window.setSheet?.("half"); }
    if (card && !card.hidden && !(fromMap && sheetLayout())) card.scrollIntoView({ behavior: "auto", block: "nearest" });
  }
  function closeRecord(push = true) {
    S.record = null;
    S.choice = null;
    closePopup();
    if (S.selectedLayer) S.map.removeLayer(S.selectedLayer);
    S.selectedLayer = null;
    renderRecord();
    renderHeader();
    if (push) syncURL();
  }
  function exportCSV() {
    if (S.dataset === "properties") return exportPropertiesCSV();
    if (S.dataset === "negotiate") return exportNegotiateCSV();
    if (S.dataset === "agriwatch") return exportAgriCSV();
    if (S.dataset === "portfolio") return exportOwnersCSV();
    if (publicAggregate()) { toast(text("หน้านี้เผยเฉพาะข้อมูลสรุป ไม่มีรายการรายบุคคลให้ดาวน์โหลด", "This view contains public summaries only; no individual rows are downloadable.")); return; }
    const lf = activeListFilter();
    const q = S.search.trim().toLowerCase();
    const rows = currentFeatures().filter((f) =>
      (!lf || lf.test(f.properties)) &&
      (!q || searchText(f).includes(q)),
    );
    if (lf?.sort) rows.sort(lf.sort);
    const prop = (k) => (r) => r.properties[k];
    /* Common columns, then the values staff work with on each layer. Blank means no value, never zero. */
    const cols = [["id", prop("id")], ["label", prop("label")], ["sourceRecord", prop("sourceRecord")], ["sourceFolder", prop("sourceFolder")], ["sourceFile", prop("sourceFile")], ["villageIds", prop("villageIds")], ["electionIds", prop("electionIds")]];
    const round2 = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
    if (["taxmap", "appraisal"].includes(S.dataset)) {
      const a = (r) => parcelAttr(r.properties.id) || {};
      const t = (r) => taxRow(r.properties.id) || {};
      cols.push(["taxMapCode", prop("code")], ["titleMatchedBy", (r) => a(r).link], ["appraisalTHBPerSqWah", (r) => a(r).price], ["areaSqWah", (r) => round2(a(r).sqwa)],
        ["tax2569AssessedTHB", (r) => round2(t(r).assessed69)], ["payment2569", (r) => (t(r).status69 ? statusText(t(r).status69) : null)], ["taxpayerCode", (r) => a(r).tp],
        [`tax2570CurrentMethodTHB_land${S.appraisalAdj >= 0 ? "+" : ""}${S.appraisalAdj}pct_buildings${S.bldAdj >= 0 ? "+" : ""}${S.bldAdj}pct`, (r) => round2(t(r).old70)],
        [`tax2570WithFixesTHB_land${S.appraisalAdj >= 0 ? "+" : ""}${S.appraisalAdj}pct_buildings${S.bldAdj >= 0 ? "+" : ""}${S.bldAdj}pct`, (r) => round2(t(r).new70)], ["fixesApplied", (r) => (t(r).reasons || []).map((x) => (Array.isArray(x) ? text(...x) : x)).join("|")],
        ["titleSetId", (r) => a(r).bgrp], ["titleSetSize", (r) => (a(r).bgrp != null ? S.parcelTax.buildingGroups.get(a(r).bgrp)?.length : null)]);
      if (S.dataset === "appraisal" && S.appraisalAdj) cols.push([`appraisalAssumedTHBPerSqWah_${S.appraisalAdj >= 0 ? "+" : ""}${S.appraisalAdj}pct`, (r) => (a(r).price == null ? null : Math.round(a(r).price * (1 + S.appraisalAdj / 100)))]);
      /* Same thresholds and colours as the map and legend (LDS 41-sample LUT). */
      if (S.classing?.lut) cols.push(["mapColorStep41", (r) => { const v = layerValue(r); return typeof v === "number" ? lutIndex(S.classing, v) : null; }], ["mapColorHex", (r) => { const v = layerValue(r); return typeof v === "number" ? lutHex(S.classing, v) : null; }]);
    } else if (S.dataset === "buildings") {
      cols.push(["type", prop("type")], ["floors", prop("floors")], ["areaM2", prop("areaM2")], ["houseNumbers", prop("houseNumbers")], ["parcelIds", prop("parcelIds")], ["parcelCodes", (r) => (r.properties.parcelIds || []).map(codeOf)], ["rollStatus", prop("roll")], ["spansParcels", prop("straddle")]);
      if (S.taxResult) {
        const unit = (r) => buildingUnit(r.properties);
        cols.push(["taxedWithTitleSet", (r) => { const u = unit(r); return u?.kind === "group" ? (S.parcelTax.buildingGroups.get(u.id) || []).map(codeOf) : u ? [codeOf(u.id)] : null; }],
          ["titleSetTax2569THB", (r) => round2(unitValue(unit(r), "assessed69"))], [`titleSetTax2570WithFixesTHB_land${S.appraisalAdj >= 0 ? "+" : ""}${S.appraisalAdj}pct_buildings${S.bldAdj >= 0 ? "+" : ""}${S.bldAdj}pct`, (r) => round2(unitValue(unit(r), "new70"))]);
        if (S.buildingView === "tax" && S.classing?.lut) cols.push(["mapColorStep41", (r) => { const v = unitValue(unit(r), S.taxScenario); return v == null ? null : lutIndex(S.classing, v); }], ["mapColorHex", (r) => { const v = unitValue(unit(r), S.taxScenario); return v == null ? null : lutHex(S.classing, v); }]);
      }
    } else if (S.dataset === "houses") {
      cols.push(["houseNumber", prop("houseNumber")], ["type", prop("type")], ["use", prop("use")], ["buildingId", prop("buildingId")], ["parcelId", prop("parcelId")], ["parcelCode", (r) => (r.properties.parcelId ? codeOf(r.properties.parcelId) : null)], ["parcelFrom", (r) => ({ b: "building main title", p: "point in parcel" }[r.properties.parcelFrom] || null)]);
    } else if (S.dataset === "roads") {
      cols.push(["roadName", prop("roadName")], ["surface", prop("surface")]);
    }
    const quote = (v) => {
      let clean = String(v ?? "");
      if (/^[=+@\-\t\r]/.test(clean)) clean = "'" + clean;
      return '"' + clean.replace(/"/g, '""') + '"';
    };
    const csv =
      "\ufeff" +
      cols.map(([k]) => k).join(",") +
      "\r\n" +
      rows
        .map((r) =>
          cols
            .map(([, get]) => {
              const v = get(r);
              return quote(Array.isArray(v) ? v.join("|") : v);
            })
            .join(","),
        )
        .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sila-${S.dataset}-${S.scope.id}-${NEW_LAYERS_19OCT.has(S.dataset) ? "20261019" : "20261005"}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(
      text(
        "ดาวน์โหลดเฉพาะรายการที่ค้นหาในขอบเขตนี้",
        "Downloaded matching records in this scope",
      ),
    );
  }
  function restyleLayer() {
    if (S.featureLayer) {
      if (CHORO_LAYERS.has(S.dataset)) { computeClassing(); S.featureLayer.setStyle(choroplethStyle); }
      else if (S.dataset === "buildings") { computeClassing(); S.featureLayer.setStyle(buildingStyle); }
    }
    drawSymbols();
    drawLegend();
    if (S.record) { renderRecord(); if (S.popup) openPopupFor(S.record, S.popup.getLatLng()); }
  }
  /* Slider assumptions: the value shows while dragging; the map and totals follow after a short pause and on release.
     Controls are not re-rendered meanwhile, so the slider keeps focus and the drag. */
  function readAdj(t) {
    const v = Math.max(-30, Math.min(100, Math.round(Number(t.value) || 0)));
    if (t.id === "building-adj") S.bldAdj = v; else S.appraisalAdj = v;
    const out = $(`${t.id}-value`); if (out) out.textContent = pctText(v);
  }
  function applyAssumptions() {
    clearTimeout(applyAssumptions.timer); applyAssumptions.timer = 0;
    const taxView = S.dataset === "taxmap" || (S.dataset === "buildings" && S.buildingView === "tax");
    if (taxView && S.taxScenario === "assessed69" && (S.appraisalAdj || S.bldAdj)) {
      S.taxScenario = "new70";
      const sel = $("tax-scenario"); if (sel) sel.value = "new70";
      const det = document.querySelector(".fix-details"); if (det) det.open = true;
      toast(text("แผนที่เปลี่ยนไปแสดงภาษีปี 2570 ตามข้อเสนอ เพราะราคาใหม่มีผลกับปี 2570", "The map now shows the 2570 tax with fixes, since new prices apply to 2570"));
    }
    if (S.dataset !== "appraisal") runTax();
    restyleLayer();
    if (S.tab === "overview") $("tab-content").innerHTML = overviewContent();
    else if (S.dataset === "properties" && S.tab === "list") $("tab-content").innerHTML = recordsContent();
    renderSummary(); syncURL(true);
  }
  function bindEvents() {
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t.id === "mission-select") { setMission(t.value); return; }
      if (t.id === "layer-select") { setDataset(t.value); return; }
      if (t.id === "tax-scenario") { S.taxScenario = t.value; renderLayerControls(); restyleLayer(); syncURL(true); $("tax-scenario")?.focus(); return; }
      if (t.matches?.("[data-strategy]")) {
        t.checked ? S.taxStrategies.add(t.dataset.strategy) : S.taxStrategies.delete(t.dataset.strategy);
        const sum = document.querySelector(".fix-details > summary"), on = TAX_STRATEGIES.filter((x) => S.taxStrategies.has(x.id) && S.parcelTax?.availability?.[x.id] !== false).length;
        if (sum) sum.textContent = text(`ข้อเสนอที่คิดรวมในปี 2570 ตามข้อเสนอ (เลือก ${on} ข้อ)`, `Fixes in 2570 with fixes (${on} selected)`);
        runTax(); restyleLayer(); $("tab-content").innerHTML = S.tab === "overview" ? overviewContent() : $("tab-content").innerHTML; renderSummary(); syncURL(true); return;
      }
      if (t.id === "terrain-exaggeration-input") { renderLayerControls(); syncURL(true); return; }
      if (t.id === "terrain-target") { syncURL(true); return; }
      if (t.id === "terrain-auto-check") { setTerrainAuto(t.checked); return; }
      if (t.id === "terrain-palette") { S.terrainPalette = t.value; applyTerrainSurface(); renderLayerControls(); drawLegend(); syncURL(true); $("terrain-palette")?.focus(); return; }
      if (t.id === "terrain-mapping") { S.terrainMapping = t.value === "linear" ? "linear" : "equalize"; updateTerrainSurface(true); renderLayerControls(); drawLegend(); syncURL(true); $("terrain-mapping")?.focus(); return; }
      if (t.id === "terrain-bands") { S.terrainBands = t.checked; applyTerrainSurface(); renderLayerControls(); drawLegend(); syncURL(true); $("terrain-bands")?.focus(); return; }
      if (t.id === "terrain-lock") { S.terrainRangeLock = t.checked; if (!t.checked) updateTerrainSurface(true); renderLayerControls(); drawLegend(); syncURL(true); $("terrain-lock")?.focus(); return; }
      if (t.id === "terrain-contours") { S.terrainContours = t.checked; updateTerrainSurface(true); renderLayerControls(); syncURL(true); $("terrain-contours")?.focus(); return; }
      if (t.id === "terrain-lowground") { S.terrainLowground = t.checked; drawLowground(); drawLegend(); syncURL(true); $("terrain-lowground")?.focus(); return; }
      if (t.id === "terrain-step") { S.terrainStepChoice = t.value === "auto" ? "auto" : Number(t.value); updateTerrainSurface(true); renderLayerControls(); syncURL(true); $("terrain-step")?.focus(); return; }
      if (t.id === "appraisal-adj" || t.id === "building-adj") { readAdj(t); applyAssumptions(); return; }
    });
    document.addEventListener("input", (e) => {
      if (e.target.id === "appraisal-adj" || e.target.id === "building-adj") {
        readAdj(e.target);
        clearTimeout(applyAssumptions.timer); applyAssumptions.timer = setTimeout(applyAssumptions, 260);
      }
      if (e.target.id === "terrain-exaggeration-input" && TEX) {
        S.terrainAuto = false;
        S.terrainSliderPos = Number(e.target.value);
        S.terrainExaggeration = TEX.sliderToEx(e.target.value);
        S.terrain3D?.setExaggeration(S.terrainExaggeration);
        syncExaggerationReadout(false);
      }
      if (e.target.id === "terrain-target") {
        S.terrainAutoTarget = (Number(e.target.value) || 15) / 100;
        $("terrain-target-value").textContent = `${Math.round(S.terrainAutoTarget * 100)}%`;
        applyAutoExaggeration(true);
      }
    });
    /* Phones and tablets: the panel is a bottom sheet over the map (peek / half / full). The handle cycles the states,
       a swipe on it moves one step, and a record opened from the map lifts a peeking sheet to half. */
    const handle = $("sheet-handle");
    const SHEET_ORDER = ["peek", "half", "full"];
    const applySheet = () => { document.body.dataset.sheet = S.sheet; handle.setAttribute("aria-expanded", String(S.sheet !== "peek")); handle.setAttribute("aria-label", S.sheet === "full" ? text("ย่อแผงข้อมูล", "Collapse the panel") : text("ขยายแผงข้อมูล", "Expand the panel")); };
    window.setSheet = (state) => { if (!SHEET_ORDER.includes(state)) return; S.sheet = state; applySheet(); };
    applySheet();
    handle.addEventListener("click", () => setSheet(SHEET_ORDER[(SHEET_ORDER.indexOf(S.sheet) + 1) % SHEET_ORDER.length]));
    { let y0 = null;
      handle.addEventListener("touchstart", (e) => { y0 = e.touches[0].clientY; }, { passive: true });
      handle.addEventListener("touchend", (e) => { if (y0 == null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null; if (Math.abs(dy) < 24) return; e.preventDefault(); const i = SHEET_ORDER.indexOf(S.sheet); setSheet(SHEET_ORDER[Math.max(0, Math.min(2, i + (dy < 0 ? 1 : -1)))]); });
    }
    const splitter = $("panel-splitter");
    const setSplit = value => { const percent=Math.max(36,Math.min(64,value)); document.querySelector(".workspace").style.setProperty("--map-share",percent+"%"); splitter.setAttribute("aria-valuenow",String(Math.round(percent))); };
    splitter.addEventListener("pointerdown",e=>{splitter.setPointerCapture(e.pointerId);splitter.dataset.dragging="true";});
    splitter.addEventListener("pointermove",e=>{if(splitter.dataset.dragging!=="true")return;const r=document.querySelector(".workspace").getBoundingClientRect();setSplit((e.clientX-r.left)/r.width*100);});
    splitter.addEventListener("pointerup",()=>delete splitter.dataset.dragging);
    splitter.addEventListener("pointercancel",()=>delete splitter.dataset.dragging);
    splitter.addEventListener("keydown",e=>{if(!["ArrowLeft","ArrowRight","Home"].includes(e.key))return;e.preventDefault();setSplit(e.key==="Home"?50:Number(splitter.getAttribute("aria-valuenow"))+(e.key==="ArrowLeft"?-2:2));});
    document.addEventListener("click", (e) => {
      const pb = e.target.closest("[data-parcel-buildings]");
      if (pb) { showParcelBuildings(pb.dataset.parcelBuildings); return; }
      if (!e.target.closest(".header-settings")) document.querySelector(".header-settings").open=false;
      if (e.target.closest("#terrain-auto")) { setTerrainAuto(!S.terrainAuto); return; }
      if (e.target.closest("[data-terrain-reset]")) { S.terrainAutoTarget = 0.15; S.terrainExaggeration = TERRAIN_DEFAULT_EX; setTerrainAuto(false); S.terrain3D?.setExaggeration(TERRAIN_DEFAULT_EX); syncExaggerationReadout(); return; }
      const terrainMode = e.target.closest("[data-terrain-mode]");
      if (terrainMode) { setTerrainMode(terrainMode.dataset.terrainMode); return; }
      const pm = e.target.closest("[data-prop-metric]");
      if (pm) { S.propMetric = pm.dataset.propMetric; renderLayerControls(); restyleLayer(); syncURL(true); $("layer-controls").querySelector(`[data-prop-metric="${S.propMetric}"]`)?.focus(); return; }
      const psort = e.target.closest("[data-prop-sort]");
      if (psort) { S.propSort = psort.dataset.propSort; S.page = 60; renderPanel(); document.querySelector(`[data-prop-sort="${S.propSort}"]`)?.focus(); return; }
      const metric = e.target.closest("[data-pop-metric]");
      if (metric) { S.popMetric = metric.dataset.popMetric; renderLayerControls(); restyleLayer(); syncURL(true); $(`layer-controls`).querySelector(`[data-pop-metric="${S.popMetric}"]`)?.focus(); return; }
      const bview = e.target.closest("[data-building-view]");
      if (bview) { S.buildingView = bview.dataset.buildingView; renderLayerControls(); restyleLayer(); renderSummary(); syncURL(true); $(`layer-controls`).querySelector(`[data-building-view="${S.buildingView}"]`)?.focus(); return; }
      const hl = e.target.closest("[data-highlight-taxpayer]");
      if (hl) { highlightTaxpayer(hl.dataset.highlightTaxpayer); return; }
      const missionBtn = e.target.closest("[data-mission]");
      if (missionBtn) { setMission(missionBtn.dataset.mission); return; }
      const initBtn = e.target.closest("[data-initiative]");
      if (initBtn) { setInitiative(initBtn.dataset.initiative || null); return; }
      const ownerBtn = e.target.closest("[data-owner]");
      if (ownerBtn) { if (S.dataset !== "portfolio") { S.owner = ownerBtn.dataset.owner || null; setDataset("portfolio"); } else setOwner(ownerBtn.dataset.owner || null); return; }
      if (e.target.closest("[data-record-focus]")) { const card = document.querySelector("#record-detail .record-card"); card?.scrollIntoView({ behavior: "auto", block: "start" }); card?.focus({ preventScroll: true }); return; }
      const mission = e.target.closest("[data-mission]");
      if (mission) {
        setMission(mission.dataset.mission);
        return;
      }
      const tool = e.target.closest("[data-tool]");
      if (tool) {
        openTool(tool.dataset.tool, tool);
        return;
      }
      const boundarySwitch = e.target.closest("[data-boundary-switch]");
      if (boundarySwitch) {
        $("boundary-mode").value = boundarySwitch.dataset.boundarySwitch;
        $("boundary-mode").dispatchEvent(new Event("change"));
        return;
      }
      const openTab = e.target.closest("[data-open-tab]");
      if (openTab) {
        S.tab = openTab.dataset.openTab;
        S.search = "";
        S.page = 60;
        renderPanel();
        $("tab-" + S.tab)?.focus();
        return;
      }
      const d = e.target.closest("[data-dataset]");
      if (d) {
        setDataset(d.dataset.dataset);
        return;
      }
      const area = e.target.closest("[data-scope]");
      if (area) {
        selectScope(area.dataset.scope);
        return;
      }
      const prow = e.target.closest("[data-property]");
      if (prow) { openProperty(prow.dataset.property); return; }
      const record = e.target.closest("[data-record]");
      if (record) {
        const r = currentFeatures().find(
          (f) => f.properties.id === record.dataset.record,
        );
        if (r) selectRecord(r);
        return;
      }
      const tab = e.target.closest("[data-tab]");
      if (tab) {
        S.tab = tab.dataset.tab;
        S.listFilter = null;
        S.search = "";
        S.page = 60;
        renderPanel();
        return;
      }
      const showList = e.target.closest("[data-show-list]");
      if (showList) {
        S.tab = "list";
        S.listFilter = ["initiative", "agri", "owners"].includes(showList.dataset.showList) ? null : showList.dataset.showList || null;
        S.page = 60;
        renderPanel();
        $("tab-list")?.focus();
        return;
      }
      if (e.target.closest("[data-clear-filter]")) { S.listFilter = null; renderPanel(); return; }
      const pbtn = e.target.closest("[data-property-buildings], [data-property-businesses]");
      if (pbtn) {
        const key = pbtn.dataset.propertyBuildings || pbtn.dataset.propertyBusinesses, isB = !!pbtn.dataset.propertyBuildings;
        pbtn.replaceWith(Object.assign(document.createElement("p"), { className: "small-note", textContent: text("กำลังเปิดรายการ…", "Opening…") }));
        fetchJSON(isB ? BUILDINGS_PATH() : BUSINESSES_PATH()).catch(() => null).then(() => {
          const box = document.getElementById(isB ? "property-buildings" : "property-businesses");
          if (box && box.dataset.property === key) box.outerHTML = isB ? propertyBuildingsHTML(key) : propertyBusinessesHTML(key);
        });
        return;
      }
      const go = e.target.closest("[data-goto]");
      if (go) { const [layer, id] = go.dataset.goto.split("|"); gotoFeature(layer, id); return; }
      if (e.target.closest("[data-more]")) {
        S.page += 60;
        renderPanel();
      }
      if (e.target.closest("[data-close-record]")) closeRecord();
      if (e.target.closest("[data-choice-more]") && S.choice) {
        S.choice.page += 60;
        renderRecord();
      }
      if (
        e.target.closest("[data-focus-choice]") &&
        S.choice?.kind === "records"
      ) {
        const bounds = L.geoJSON({
          type: "FeatureCollection",
          features: S.choice.features,
        }).getBounds();
        S.interactionRevision++;
        if (bounds.isValid())
          S.map.fitBounds(bounds, {
            ...fitPad(48),
            maxZoom: 19,
            animate: false,
          });
      }
      if (e.target.closest("[data-focus-record]") && S.selectedLayer) {
        S.interactionRevision++;
        S.map.fitBounds(S.selectedLayer.getBounds(), {
          ...fitPad(48),
          maxZoom: 18,
          animate: false,
        });
      }
      if (e.target.closest("[data-export]")) exportCSV();
    });
    document.addEventListener("input", (e) => {
      if (e.target.id === "record-search") {
        S.search = e.target.value;
        S.page = 60;
        clearTimeout(bindEvents.searchTimer);
        bindEvents.searchTimer = setTimeout(() => {
          const start = e.target.selectionStart;
          renderPanel();
          const next = $("record-search");
          next?.focus();
          next?.setSelectionRange?.(start, start);
        }, 160);
      }
    });
    $("boundary-mode").addEventListener("change", () => {
      S.pickIndex = null;
      S.boundary = $("boundary-mode").value;
      S.scope = { type: "municipality", id: "sila" };
      S.record = null;
      S.choice = null;
      S.restoreRecord = null;
      S.search = "";
      S.page = 60;
      syncURL();
      refreshMap({ fit: true });
    });
    $("layers-open").addEventListener("click", () => {
      const open = $("layer-options").hidden;
      $("layer-options").hidden = !open;
      $("layers-open").setAttribute("aria-expanded", String(open));
    });
    document.querySelectorAll("[data-overlay]").forEach((el) =>
      el.addEventListener("change", () => {
        el.checked
          ? S.overlays.add(el.dataset.overlay)
          : S.overlays.delete(el.dataset.overlay);
        refreshMap();
      }),
    );
    $("basemap").addEventListener("change", () => {
      S.basemap = $("basemap").value;
      setBasemap();
      refreshMap();
      syncURL();
    });
    $("back").addEventListener("click", () =>
      S.record || S.choice ? closeRecord() : selectScope("sila"),
    );
    $("fit").addEventListener("click", () => {
      S.interactionRevision++;
      fitScope();
    });
    $("language").addEventListener("click", () => {
      S.lang = S.lang === "th" ? "en" : "th";
      renderPanel();
      localizeZoom();
      S.tile?.setLanguage?.(S.lang);
      refreshMap();
      syncURL();
    });
    $("theme").addEventListener("click", () => {
      S.theme = S.theme === "dark" ? "light" : "dark";
      renderPanel();
      if (S.basemap.startsWith("satellite") && S.tile) S.tile.setTheme(S.theme);
      else setBasemap();
      refreshMap();
      syncURL();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const settings=document.querySelector(".header-settings");
        if(settings.open){settings.open=false;settings.querySelector("summary").focus();return;}
        {
          if (!$("layer-options").hidden) {
            $("layer-options").hidden = true;
            $("layers-open").setAttribute("aria-expanded", "false");
          } else if (S.record || S.choice) closeRecord();
        }
      }
    });
    document
      .querySelector(".inspector-tabs")
      .addEventListener("keydown", (e) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        const buttons = [...document.querySelectorAll("[data-tab]")];
        let i = buttons.indexOf(document.activeElement);
        if (i < 0) return;
        e.preventDefault();
        i =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? 2
              : (i + (e.key === "ArrowRight" ? 1 : -1) + 3) % 3;
        buttons[i].click();
        buttons[i].focus();
      });
    $("terrain-mode-group").addEventListener("keydown", e => {
      if (!["ArrowLeft","ArrowRight","Home","End"].includes(e.key)) return;
      const buttons = [...$("terrain-mode-group").querySelectorAll("button")];
      const active = buttons.indexOf(document.activeElement);
      if (active < 0) return;
      e.preventDefault();
      const next = e.key === "Home" ? 0 : e.key === "End" ? 1 : (active + 1) % 2;
      buttons[next].click(); buttons[next].focus();
    });
    window.addEventListener("popstate", () => {
      const previousScope = S.scope.id;
      hideTerrain3D();
      fromURL();
      if (S.parcelTax) runTax();
      renderPanel();
      setBasemap();
      refreshMap({ fit: previousScope !== S.scope.id });
    });
  }
  /* LDS 0.9.7 technical/data role: figures and codes in UI text are set in JetBrains Mono (Thai keeps its own face).
     Text added anywhere in the page is scanned once and each figure is wrapped in <lds-num> (an inline element that no
     existing span rule matches); form controls, options and cells already set in the data face are left alone. */
  const NUM_TOKEN = /(?:[+\u2212](?=\d))?[A-Za-z0-9]+(?:[.,/:\-][A-Za-z0-9]+)*%?/g;
  const NUM_SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "OPTION", "OPTGROUP", "SELECT", "INPUT", "TITLE", "NOSCRIPT", "CODE", "PRE", "svg", "LDS-NUM"]);
  const numSkipEl = (e) => NUM_SKIP.has(e.nodeName) || e.classList?.contains("num") || e.classList?.contains("no-num") || e.isContentEditable;
  function numInsideSkip(n) {
    for (let e = n.nodeType === 1 ? n : n.parentNode; e && e !== document.body; e = e.parentNode) if (e.nodeType === 1 && numSkipEl(e)) return true;
    return false;
  }
  /* The pieces stay inside one inline <lds-run>, so a flex or grid parent still sees one item and keeps its spaces. */
  function numWrapText(n) {
    const text = n.data; let last = 0, run = null;
    for (const m of text.matchAll(NUM_TOKEN)) {
      if (!/\d/.test(m[0])) continue;
      run = run || document.createElement("lds-run");
      if (m.index > last) run.appendChild(document.createTextNode(text.slice(last, m.index)));
      const span = document.createElement("lds-num"); span.textContent = m[0]; run.appendChild(span);
      last = m.index + m[0].length;
    }
    if (!run || !n.parentNode) return;
    if (last < text.length) run.appendChild(document.createTextNode(text.slice(last)));
    n.parentNode.replaceChild(run, n);
  }
  function numWrap(root) {
    if (!root || !root.isConnected || numInsideSkip(root)) return;
    if (root.nodeType === 3) { if (/\d/.test(root.data)) numWrapText(root); return; }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: (n) =>
      n.nodeType === 1 ? (numSkipEl(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP) : (/\d/.test(n.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(numWrapText);
  }
  function installNumerals() {
    if (!window.MutationObserver || !document.body) return;
    const pending = new Set(); let queued = false;
    const flush = () => { queued = false; const list = [...pending]; pending.clear(); list.forEach(numWrap); };
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") pending.add(r.target);
        else for (const n of r.addedNodes) if (n.nodeType === 1 || n.nodeType === 3) pending.add(n);
      }
      if (pending.size && !queued) { queued = true; queueMicrotask(flush); }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    numWrap(document.body);
  }
  /* Phones (revision 1.9): a data table never widens the page. Each table sits in its own scroll region; only a table
     that really overflows becomes a labelled, keyboard-focusable region (scrollable-region-focusable). */
  function installTableScroll() {
    const root = $("inspector");
    if (!root) return;
    const mark = () => {
      for (const w of root.querySelectorAll(".table-scroll")) {
        const over = w.scrollWidth > w.clientWidth + 1;
        if (String(over) === w.dataset.scrollable) continue;
        w.dataset.scrollable = String(over);
        if (over) {
          const t = w.querySelector("table"), cap = t?.closest("section, details, article")?.querySelector("h2, h3, summary")?.textContent?.trim();
          if (!w.hasAttribute("aria-label")) w.setAttribute("aria-label", cap ? text(`ตาราง ${cap} (เลื่อนซ้ายขวาได้)`, `${cap} table (scrolls sideways)`) : text("ตาราง (เลื่อนซ้ายขวาได้)", "Table (scrolls sideways)"));
          w.setAttribute("role", "region"); w.tabIndex = 0;
        } else if (!w.dataset.fixedRegion) { w.removeAttribute("role"); w.removeAttribute("tabindex"); w.removeAttribute("aria-label"); }
      }
    };
    let queued = false;
    const wrap = () => {
      queued = false;
      for (const t of root.querySelectorAll("table.data-table")) {
        if (t.parentElement?.classList.contains("table-scroll")) continue;
        const w = document.createElement("div");
        w.className = "table-scroll";
        t.replaceWith(w); w.appendChild(t);
      }
      for (const w of root.querySelectorAll(".table-scroll[role='region'][tabindex='0']:not([data-scrollable])")) w.dataset.fixedRegion = "1";
      requestAnimationFrame(mark);
    };
    new MutationObserver(() => { if (!queued) { queued = true; queueMicrotask(wrap); } }).observe(root, { childList: true, subtree: true });
    window.addEventListener("resize", () => requestAnimationFrame(mark), { passive: true });
    wrap();
  }
  /* LDS CTA-01: every link that opens a new tab carries the open_in_new cue and says so to screen readers. Links whose
     own text already says "new tab" keep their wording. Re-applied when locale text replaces a link's content. */
  function installExternalCues() {
    const cue = (a) => {
      if (a.querySelector(".ext-icon") || /แท็บใหม่|new tab/i.test(a.textContent)) return;
      a.insertAdjacentHTML("beforeend", extMark());
    };
    const scan = (node) => {
      if (node.nodeType !== 1) return;
      if (node.matches?.('a[target="_blank"]')) cue(node);
      node.querySelectorAll?.('a[target="_blank"]').forEach(cue);
    };
    let queued = false; const pending = new Set();
    new MutationObserver((records) => {
      for (const r of records) {
        const a = r.target.closest?.('a[target="_blank"]') || (r.target.parentElement && r.target.parentElement.closest?.('a[target="_blank"]'));
        if (a) pending.add(a);
        for (const n of r.addedNodes) if (n.nodeType === 1) pending.add(n);
      }
      if (pending.size && !queued) { queued = true; queueMicrotask(() => { queued = false; const list = [...pending]; pending.clear(); list.forEach(scan); }); }
    }).observe(document.body, { childList: true, subtree: true });
    scan(document.body);
  }
  async function start() {
    installNumerals();
    installTableScroll();
    installExternalCues();
    try {
      let scales, parcelTax;
      let svCover;
      [S.catalog, S.metadata, S.docs, S.tokens, S.publicSummary, S.terrainSource, S.terrainCoverage, scales, parcelTax, S.popStructure, svCover] = await Promise.all([
        fetchJSON("data/catalog.json"),
        fetchJSON("data/metadata.json"),
        fetchJSON("reference/document-catalog.json"),
        fetchJSON("reference/design-tokens.json"),
        fetchJSON("data/municipal-summary.json").catch(() => null),
        fetchJSON("data/terrain-source.json").catch(() => null),
        fetchJSON("data/terrain-coverage.geojson").catch(() => null),
        fetchJSON("reference/lds-analytical-subset.json").catch(() => null),
        fetchJSON("data/parcel-tax.json").catch(() => null),
        fetchJSON("data/population-structure.json").catch(() => null),
        fetchJSON("data/streetview-coverage.json").catch(() => null),   // optional: written offline by tools/streetview-coverage.py
      ]);
      S.svCoverage = svCover?.byRecord || null;
      if (!window.SilaScales?.load(scales)) S.catalog.datasets = S.catalog.datasets.filter((d) => !["taxmap", "appraisal", "popgrid"].includes(d.id));
      if (parcelTax && window.SilaTaxEngine) {
        try { S.parcelTax = window.SilaTaxEngine.prepare(parcelTax); S.parcelTaxStatus = "ready"; }
        catch (e) { console.error(e); S.parcelTaxStatus = "error"; }
      } else S.parcelTaxStatus = "unavailable";
      if (S.parcelTaxStatus !== "ready") S.catalog.datasets = S.catalog.datasets.filter((d) => !["taxmap", "properties", "appraisal", "negotiate", "agriwatch", "portfolio"].includes(d.id));
      if (!S.popStructure) S.catalog.datasets = S.catalog.datasets.filter((d) => d.id !== "popgrid");
      if (S.terrainSource && S.terrainCoverage) {
        Object.assign(S.catalog.datasets.find(d => d.id === "terrain"), {status:"ready_external_dem",sourceMetadata:"data/terrain-source.json",coverageMetadata:"data/terrain-coverage.geojson"});
      }
      if (PublicAggregates.valid(S.publicSummary)) {
        S.catalog.datasets.push(...PublicAggregates.entries(S.publicSummary));
        S.publicSummaryStatus = "ready";
      } else {
        S.publicSummary = null;
        S.publicSummaryStatus = "unavailable";
      }
      await Promise.all(
        [
          "data/municipality.geojson",
          "data/villages.geojson",
          "data/election.geojson",
        ].map(fetchJSON),
      );
      fromURL();
      if (S.parcelTax) runTax();   // scenario, fixes and appraisal change come from the URL
      S.ready = true;
      bindEvents();
      initMap();
      renderPanel();
      await refreshMap({ fit: true });
      syncURL(true);
    } catch (e) {
      $("tab-content").innerHTML = notice(
        "เปิดข้อมูลไม่สำเร็จ",
        "ลองโหลดหน้าใหม่ หรือตรวจบัญชีชุดข้อมูลและคำอธิบายต้นแบบ",
      );
      $("map-error").hidden = false;
      $("map-error").textContent =
        "ข้อมูลยังเปิดไม่สำเร็จ ไม่ได้หมายความว่าไม่มีข้อมูลเมือง";
      console.error(e);
    }
  }
  window.SilaExplorer = {
    getState: () => ({
      dataset: S.dataset,
      mission: S.mission,
      mode: S.dataset === "terrain" ? S.mode : "2d",
      renderer: S.terrain3DVisible ? "3d" : "2d",
      terrain3DStatus: {...S.terrain3DStatus},
      publicSummaryStatus: S.publicSummaryStatus,
      publicAggregateScope: publicAggregate() ? S.dataset === "caregroups" ? "received_source_cohort" : "municipality" : null,
      datasetCount: S.catalog?.datasets.length ?? 0,
      boundary: S.boundary,
      scope: { ...S.scope },
      record: S.record?.properties.id || null,
      tab: S.tab,
      loaded: [...S.cache.keys()],
      camera: S.map
        ? S.terrain3DVisible && S.terrain3D && validTerrainCamera(S.terrain3D.getCamera())
          ? (()=>{const c=validTerrainCamera(S.terrain3D.getCamera());return {center:{lat:c.center[1],lng:c.center[0]},zoom:c.zoom,pitch:c.pitch,bearing:c.bearing};})()
          : { center: S.map.getCenter(), zoom: S.map.getZoom() }
        : null,
      count: countFor(S.dataset),
      featureCount: currentFeatures().length,
      ready: S.ready,
      basemap: S.tile?.getBasemapState?.() || { status: "none" },
      houseDisplay:
        S.dataset === "houses" ? S.featureLayer?.getDisplayState?.() : null,
      choice: S.choice
        ? {
            kind: S.choice.kind,
            total: S.choice.features.length,
            page: S.choice.page,
          }
        : null,
    }),
    selectScope,
    setDataset,
    setMission,
    setTerrainMode,
    closeRecord,
  };
  start();
})();
