/* Sila public preview. Source GIS and approved municipal aggregates; no production writes. */
(() => {
  "use strict";
  const PublicAggregates = window.SilaPublicAggregates || {ids:[],icons:{},valid:()=>false,get:()=>null,entries:()=>[],render:()=>"",localized:v=>String(v ?? ""),valueLabel:m=>({number:m?.value ?? "—",state:""})};
  const Missions = window.SilaMissions;
  const TAX_STRATEGIES = window.SilaTaxEngine?.STRATEGIES || [];
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
    legendCollapsed: typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(max-width: 1100px)").matches : false,
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
    taxStrategies: new Set(["combine", "agriShare", "mixedUse", "rented", "newBuildings"]),
    appraisalAdj: 0,
    popMetric: "t",
    buildingView: "type",
    terrainExaggeration: 20,
    terrainAuto: true,
    terrainAutoTarget: 0.15,
    terrainRelief: null,
    terrainPalette: "oh3-relief-lowland",
    terrainBands: true,
    terrainMapping: "equalize",
    terrainQuantiles: null,
    terrainRangeLock: false,
    terrainRange: { lo: 150, hi: 210 },
    terrainContours: true,
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
    terrain: ["ที่สูงที่ต่ำ 2D และ 3D", "High and low ground in 2D and 3D"],
  };
  const colors = {
    taxmap: "slate",
    appraisal: "slate",
    popgrid: "slate",
    overview: "slate",
    houses: "mint",
    buildings: "yellow",
    roads: "apricot",
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
      : S.catalog.datasets.find((d) => d.id === id);
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
  function fetchJSON(path) {
    if (S.cache.has(path)) return Promise.resolve(S.cache.get(path));
    if (S.inflight.has(path)) return S.inflight.get(path);
    const p = fetch(path)
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
    if (S.dataset === "taxmap") { params.scenario = S.taxScenario; params.adj = String(S.appraisalAdj); params.fix = [...S.taxStrategies].sort().join("."); }
    if (S.dataset === "appraisal" && S.appraisalAdj) params.adj = String(S.appraisalAdj);
    if (S.dataset === "popgrid") params.metric = S.popMetric;
    if (S.dataset === "buildings" && S.buildingView !== "type") params.view = S.buildingView;
    if (S.dataset === "terrain") {
      if (S.terrainPalette !== TERRAIN_DEFAULT_PALETTE) params.pal = S.terrainPalette;
      if (!S.terrainBands) params.bands = "0";
      if (S.terrainMapping !== "equalize") params.map = S.terrainMapping;
      if (S.terrainRangeLock && S.terrainRange) params.lock = `${Math.round(S.terrainRange.lo * 10) / 10}~${Math.round(S.terrainRange.hi * 10) / 10}`;
      if (!S.terrainContours) params.ct = "0";
      if (S.terrainStepChoice !== "auto") params.step = String(S.terrainStepChoice);
    }
    if (S.dataset === "terrain" && S.mode === "3d") {
      if (!S.terrainAuto) params.ex = String(S.terrainExaggeration);
      else if (Math.round(S.terrainAutoTarget * 100) !== 15) params.ext = String(Math.round(S.terrainAutoTarget * 100));
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
    if (q.has("fix")) S.taxStrategies = new Set(String(q.get("fix")).split(".").filter(k => TAX_STRATEGIES.some(s => s.id === k)));
    S.popMetric = ["t", "c", "a", "o", "m", "f"].includes(q.get("metric")) ? q.get("metric") : "t";
    S.buildingView = ["type", "registry", "roll", "straddle", "use"].includes(q.get("view")) ? q.get("view") : "type";
    S.listFilter = null;
    const ex = Number(q.get("ex")), ext = Number(q.get("ext"));
    S.terrainAuto = !(q.has("ex") && Number.isFinite(ex) && ex > 0);
    if (!S.terrainAuto) S.terrainExaggeration = TEX ? TEX.roundEx(Math.max(TEX.min, Math.min(TEX.max, ex))) : ex;
    S.terrainAutoTarget = q.has("ext") && Number.isFinite(ext) && ext >= 5 && ext <= 30 ? ext / 100 : 0.15;
    S.terrainPalette = TERRAIN_PALETTES[q.get("pal")] || q.get("pal") === "off" ? q.get("pal") : TERRAIN_DEFAULT_PALETTE;
    S.terrainBands = q.get("bands") !== "0";
    S.terrainMapping = q.get("map") === "linear" ? "linear" : "equalize";
    S.terrainContours = q.get("ct") !== "0";
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
    if (id === "popgrid") return null;
    const d = dataset(id);
    if (!d) return null;
    const n = countFor(id, S.scope) ?? (S.scope.type === "municipality" ? d.insideMunicipalityCount ?? d.count : null);
    return n == null ? null : `${num(n)} ${text(...(Missions.unit[id] || ["รายการ", "records"]))}`;
  }
  function defaultLayer() {
    return dataset("taxmap") ? "taxmap" : dataset("appraisal") ? "appraisal" : "buildings";
  }
  function renderPicker() {
    const mount = $("layer-picker");
    if (!mount) return;
    const focused = document.activeElement?.id;
    mount.innerHTML = Missions.renderSelectors({ mission: S.mission, layer: S.dataset }, {
      language: S.lang,
      available: (id) => id === "overview" || Boolean(dataset(id)),
      count: layerCount,
    });
    if (focused === "mission-select" || focused === "layer-select") $(focused)?.focus();
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
    $("breadcrumbs").innerHTML = `${window.SilaIcons.icon("municipality",{size:20})}<span>${text("ประเทศไทย", "Thailand")}</span>${sep}<span>${text("ขอนแก่น", "Khon Kaen")}</span>${sep}${S.scope.type === "municipality" && !S.record ? `<strong aria-current="location">${esc(municipality)}</strong>` : `<button data-scope="sila">${esc(municipality)}</button>`}${S.scope.type !== "municipality" ? `${sep}${S.record ? `<button data-close-record>${esc(scopeLabel())}</button>` : `<strong aria-current="location">${esc(scopeLabel())}</strong>`}` : ""}${S.record ? `${sep}<strong aria-current="location">${esc(S.record.properties.label || S.record.properties.id)}</strong>` : ""}`;
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
    } else if (S.dataset === "appraisal") {
      const sm = S.parcelTax?.summary;
      items = [[sm?.pricedParcels ?? null, text("แปลงที่มีราคาประเมิน", "parcels with an appraisal")], [sm?.medianPrice ?? null, text("ราคากลาง บาท/ตร.ว.", "median THB per sq wah")]];
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
    $("summary-eyebrow").textContent = cityWide ? text("ยอดรวมทั้งเทศบาลเมืองศิลา", "Sila city-wide totals") : scopeLabel();
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
    if (S.dataset === "parcels") return parcelContent();
    if (S.dataset === "terrain") return terrainContent() + supplementsHTML();
    if (S.dataset === "taxmap") return taxmapContent();
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
    return `<section class="panel-section"><p>${esc(purposeOf("parcels"))}</p><div class="facts-grid">${fact(countFor("parcels"), text("แปลงในพื้นที่นี้", "Parcels in this area"))}${fact(null, text("แปลงที่อยู่ในบัญชีภาษีแล้ว", "Parcels on the tax roll"), text("ยังไม่มีข้อมูลส่วนนี้", "Not available yet"))}</div><button data-show-list class="more-button">${text("ดูรายการแปลงในพื้นที่นี้", "List parcels in this area")}</button><button type="button" class="more-button" data-tool="tax-calculator">${text("คิดภาษีที่ควรเก็บของหนึ่งแปลง", "Work out the tax due for one parcel")}</button>${notesLink()}</section>`;
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
    return `<p class="inline-note">${text("เงาภูมิประเทศ FABDEM ครอบคลุมอำเภอเมืองขอนแก่น แสงช่วยเห็นรูปทรง ไม่ใช่สีระดับความสูงหรือความเสี่ยงน้ำท่วม · 3D ไม่สร้างความสูงอาคารหรือระดับน้ำ", "FABDEM hillshade for Mueang Khon Kaen district. Shading shows form, not elevation colours or flood risk · 3D does not infer building heights or water levels.")}</p>` +
      `<dl class="source-dl"><dt>${text("ชุดข้อมูล", "Dataset")}</dt><dd>${esc(s?.dataset || "FABDEM")}</dd><dt>${text("รายละเอียดต้นทาง", "Source detail")}</dt><dd>${esc(s?.resolution || text("กำลังเปิดคำอธิบายต้นทาง", "Source description is loading"))}</dd><dt>${text("รุ่นไฟล์แสดงผล", "Tile build version")}</dt><dd>${esc(s?.version || "—")} · ${text("วันสร้าง tile ไม่ใช่วันสำรวจภูมิประเทศ", "Tile build date is not terrain survey date")}</dd><dt>${text("ระดับซูม", "Zoom")}</dt><dd>${text("ข้อมูลต้นทางถึงซูม", "Native source through zoom")} ${num(s?.maxNativeZoom)} · ${text("ขยายแสดงผลถึง 22 โดยไม่เพิ่มรายละเอียด", "Display overzoom through 22 adds no detail")}</dd><dt>${text("ฐานอ้างอิงแนวดิ่ง", "Vertical datum")}</dt><dd>${esc(s?.verticalDatum || text("ยังไม่ประกาศในคำอธิบายที่ได้รับ", "Not declared in the supplied source description"))}</dd><dt>${text("สิทธิ์และที่มา", "Rights and source")}</dt><dd>${esc(s?.attribution || "—")}${s?.sourceUrl ? ` · <a href="${esc(s.sourceUrl)}" target="_blank" rel="noopener">${text("ต้นทาง", "Source")}</a>` : ""}${s?.licenseUrl ? ` · <a href="${esc(s.licenseUrl)}" target="_blank" rel="noopener">${text("อ่านเงื่อนไข", "Read terms")}</a>` : ""}</dd></dl>`;
  }
  function renderTerrainControls() {
    const active = S.dataset === "terrain";
    $("terrain-view-controls").hidden = !active;
    if (active) document.body.dataset.terrainView = S.mode;
    else delete document.body.dataset.terrainView;
    document.querySelectorAll("[data-terrain-mode]").forEach(button => {
      const selected = button.dataset.terrainMode === S.mode;
      button.setAttribute("aria-pressed", String(selected));
      button.tabIndex = selected ? 0 : -1;
      button.setAttribute("aria-label", button.dataset.terrainMode === "3d" ? text("3D · หมุนดูรูปทรงภูมิประเทศ", "3D · rotate and tilt terrain") : text("2D · อ่านตำแหน่งและเลือกรายการ", "2D · inspect locations and records"));
    });
    $("terrain-view-help").textContent = S.mode === "3d"
      ? text("ลากเพื่อเลื่อน · คลิกขวาลากเพื่อหมุน/เอียง · ความสูงขยายให้เห็นรูปทรง ไม่ใช่ความสูงจริง", "Drag to pan · right-drag to rotate/tilt · height is exaggerated to show form")
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
    return `<div class="control-card"><h3>${text("ความสูงในภาพ 3D", "Height in the 3D view")}</h3><p id="terrain-ex-now" class="control-field" aria-live="polite">${esc(exNowText())}</p>`
      + `<label class="check-item"><input type="checkbox" id="terrain-auto-check"${S.terrainAuto ? " checked" : ""}><span>${text("ขยายความสูงอัตโนมัติ", "Automatic height")}<small>${text(`ความต่างระดับสูงเป็น ${pct}% ของความกว้างมุมมอง · สูตรเดียวกับ CityMETER · เลื่อนแถบความสูงเมื่อไรจะเปลี่ยนเป็นกำหนดเอง`, `Relief shown as ${pct}% of the view width · same rule as CityMETER · moving the height slider switches to manual`)}</small></span></label>`
      + (S.terrainAuto ? `<div class="control-field"><span id="terrain-target-label">${text("สัดส่วนความต่างระดับต่อความกว้างมุมมอง", "Relief as a share of view width")}</span><div class="control-range"><input id="terrain-target" type="range" min="5" max="30" step="1" value="${pct}" aria-labelledby="terrain-target-label"><output id="terrain-target-value" for="terrain-target">${pct}%</output></div></div>` : "")
      + `<p id="terrain-relief-note" class="small-note">${esc(reliefText())}</p>`
      + `<p class="small-note">${text("ค่าเริ่มต้นแนะนำ: อัตโนมัติ 15% แบบ CityMETER เพราะศิลาค่อนข้างราบ ทั้งเขตเทศบาลสูงต่างกันราว 60 ม. ในความกว้าง 13 กม. ภาพทั้งเทศบาลจึงขยายราว 34 เท่า ถ้าใช้ 1.5 เท่าแบบค่าตั้งต้นของ CityMETER ภาพจะเกือบแบน ความสูงที่ขยายใช้ดูรูปทรงเท่านั้น ไม่ใช่ความสูงจริงหรือระดับน้ำ", "Recommended start: automatic 15%, as in CityMETER. Sila is fairly flat, with about 60 m of relief across 13 km, so the whole-city view is exaggerated about 34 times. CityMETER’s fixed default of 1.5 times would look almost flat. Exaggeration shows form only, not true height or water level.")}</p>`
      + (S.terrainAuto && pct === 15 ? "" : `<button type="button" class="more-button" data-terrain-reset>${text("กลับไปใช้ค่าแนะนำ (อัตโนมัติ 15%)", "Back to the recommended setting (automatic 15%)")}</button>`) + `</div>`;
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
    return `<div class="control-card"><h3>${text("สีตามความสูงและเส้นชั้นความสูง", "Height colour and contours")}</h3><p id="terrain-surface-now" class="control-field" aria-live="polite">${esc(surfaceNowText())}</p>`
      + `<label class="control-field"><span>${text("ชุดสี", "Colours")}</span><select id="terrain-palette">${opts.map(([id, l]) => `<option value="${id}"${id === pal ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`
      + (TERRAIN_PALETTES[pal] ? `<p class="small-note">${esc(text(...TERRAIN_PALETTES[pal].note))}</p><label class="check-item"><input type="checkbox" id="terrain-bands"${S.terrainBands ? " checked" : ""}><span>${text("แบ่งสีเป็นชั้นตามเส้นชั้นความสูง", "Colour in bands between contour lines")}<small id="terrain-bands-note">${esc(bandNoteText())}</small></span></label><label class="control-field"><span>${text("กระจายสีตาม", "Spread colours by")}</span><select id="terrain-mapping"><option value="equalize"${S.terrainMapping === "equalize" ? " selected" : ""}>${text("พื้นที่ (แต่ละสีครอบคลุมพื้นที่พอ ๆ กัน) · แนะนำ", "Area (each colour covers a similar share) · recommended")}</option><option value="linear"${S.terrainMapping === "linear" ? " selected" : ""}>${text("เมตร (เชิงเส้น)", "Metres (linear)")}</option></select></label><p class="small-note">${text("ศิลาราบเป็นส่วนใหญ่ ครึ่งหนึ่งของพื้นที่สูงไม่เกิน 160 ม. ถ้ากระจายตามเมตร ที่ต่ำเกือบทั้งหมดจะเป็นสีเดียว กระจายตามพื้นที่จึงเห็นความต่างในที่ราบได้ชัดกว่า", "Sila is mostly flat: half the area is below about 160 m. Spread by metres, most low ground shares one colour; spread by area shows differences across the flat ground.")}</p><label class="check-item"><input type="checkbox" id="terrain-lock"${S.terrainRangeLock ? " checked" : ""}><span>${text("ล็อกช่วงสี", "Lock the colour range")}<small>${text("ใช้สเกลเดียวกันเมื่อเลื่อนไปเทียบพื้นที่อื่น ถ้าไม่ล็อก สีจะยืดตามความสูงที่เห็นอยู่ สีเดียวกันในสองมุมมองจึงอาจไม่ใช่ความสูงเดียวกัน", "Keeps one scale while you compare areas. Unlocked, colours stretch to the heights in view, so the same colour in two views can mean different heights.")}</small></span></label>` : "")
      + `<label class="check-item"><input type="checkbox" id="terrain-contours"${S.terrainContours ? " checked" : ""}><span>${text("แสดงเส้นชั้นความสูง", "Show contour lines")}<small>${text("เส้นหนาทุก 5 ช่วง", "Bold every fifth line")}</small></span></label>`
      + (S.terrainContours ? `<label class="control-field"><span>${text("ระยะห่างระหว่างเส้น", "Contour interval")}</span><select id="terrain-step">${stepOpts.map(([id, l]) => `<option value="${id}"${String(S.terrainStepChoice) === id ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>` : "")
      + (S.terrainStepNote ? `<p class="small-note" role="status">${esc(S.terrainStepNote)}</p>` : "")
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
      onStatus:status=>{
        if(generation!==S.terrain3DGeneration)return;
        S.terrain3DStatus=status; $("map").dataset.terrain3dState=status.state;
        for(const key of ["pending","rendered","triangles","exaggeration"])if(Number.isFinite(status[key]))$("terrain-3d").dataset[key]=String(status[key]);
        if(status.basemapState)$("terrain-3d").dataset.basemapState=status.basemapState;
        if(S.dataset!=="terrain"||S.mode!=="3d")return;
        if(status.state==="error"&&status.fatal){terrain3DFailed();return;}
        if(status.state==="ready"||status.state==="partial"&&status.triangles>0){showTerrain3D();scheduleAutoExaggeration();scheduleTerrainSurface();}
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
      `<div class="section-title"><h2>${text("รายการในขอบเขต", "Records in this boundary")}</h2><span>${num(list.length)} ${text("รายการ", "records")}</span></div><div class="area-list">${list
        .slice(0, S.page)
        .map(
          (f) =>
            `<button class="area-row" data-record="${esc(f.properties.id)}"><span class="area-name">${esc(featureTitle(f))}<span class="area-meta">${lf === LIST_FILTERS.fixes ? (() => { const r = taxRow(f.properties.id); return esc(text(`ตามข้อเสนอ +${fixed(r.new70 - r.old70, 2)} บาท (จาก ${fixed(r.old70, 2)})`, `with fixes +${fixed(r.new70 - r.old70, 2)} THB (from ${fixed(r.old70, 2)})`)) + " · "; })() : featureLines(f)[0] ? featureLines(f)[0] + " · " : ""}${esc(villageNamesOf(f).join(" · ") || text("ยังไม่ระบุหมู่บ้าน", "village not assigned"))}${f.properties.villageIds?.length > 1 ? " · " + text("อยู่บนเส้นแบ่งหลายหมู่บ้าน", "on a village dividing line") : ""}</span></span><span aria-hidden="true">›</span></button>`,
        )
        .join(
          "",
        )}</div>${!list.length ? `<div class="empty-state"><h3>${text(S.search ? "ไม่พบรายการที่ค้นหา" : "ไม่พบรายการจากชั้นนี้ในขอบเขต", S.search ? "No matching records" : "No mapped records in this boundary")}</h3><p>${text("ไม่พบในข้อมูลที่ได้รับ ไม่ได้แปลว่าในพื้นที่จริงไม่มี", "Not found in the supplied data; this does not mean none exist on the ground.")}</p></div>` : ""}${list.length > S.page ? `<button class="more-button" data-more>${text("ดูเพิ่มอีก 60 รายการ", "Show 60 more")}</button>` : ""}<p class="inline-note">${text("รายการที่อยู่บนเส้นแบ่งจะเห็นได้ในหลายหมู่บ้าน ไม่ใช่รายการซ้ำที่ต้องลบ", "Items on a dividing line appear in several villages; they are not duplicates to delete.")}</p><button class="more-button" data-export>${text("ดาวน์โหลดรายการที่ค้นหา · CSV", "Download matching records · CSV")}</button>`
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
    const en = S.lang === "en" ? " " + [p.type, p.use, p.material, p.status].map((x) => (x && SURVEY_EN[x]) || "").join(" ").toLowerCase() : "";
    return JSON.stringify(p).toLowerCase() + " " + v + en;
  }
  function searchInput(boundaryList = false) {
    const ph = boundaryList
      ? ["ค้นหาชื่อหรือเลขหมู่บ้าน", "Search a village name or number"]
      : ({
          taxmap: ["ค้นหารหัสแปลง หรือชื่อหมู่บ้าน", "Search a parcel code or village"],
          appraisal: ["ค้นหารหัสแปลง หรือชื่อหมู่บ้าน", "Search a parcel code or village"],
          parcels: ["ค้นหารหัสแปลง หรือชื่อหมู่บ้าน", "Search a parcel code or village"],
          buildings: ["ค้นหาบ้านเลขที่ ประเภทอาคาร หรือชื่อหมู่บ้าน", "Search a house number, building type or village"],
          houses: ["ค้นหาบ้านเลขที่ หรือชื่อหมู่บ้าน", "Search a house number or village"],
          popgrid: ["ค้นหาชื่อหมู่บ้าน", "Search a village"],
          roads: ["ค้นหาชื่อถนน หรือชื่อหมู่บ้าน", "Search a road name or village"],
        }[S.dataset] || ["ค้นหาชื่อสถานที่ หรือชื่อหมู่บ้าน", "Search a place name or village"]);
    return `<label class="search-field list-search"><span class="sr-only">${text("ค้นหารายการ", "Search records")}</span><input type="search" id="record-search" placeholder="${esc(text(...ph))}" value="${esc(S.search)}"></label>`;
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
  const NEW_LAYERS_19OCT = new Set(["parcels", "taxmap", "appraisal", "buildings", "houses", "popgrid"]);
  const PARCEL_FILE = ["ชั้นแปลงที่ดิน parcel (Shapefile) ที่เทศบาลส่ง 19 ต.ค. 2569", "Parcel layer (Shapefile) received 19 Oct 2026"];
  const LTAX_FILE = ["ไฟล์ส่งออกจาก LTAX ปีภาษี 2569: ภ.ด.ส.1, 3, 7 บัญชีเลขประเมิน บัญชีชำระ และบัญชีลูกหนี้", "LTAX exports for tax year 2569: PDS 1, 3 and 7, the assessment, payment and debtor registers"];
  const SURVEY_FILE = ["หมุดแบบสำรวจอาคาร Building_point (Shapefile) ที่เทศบาลส่ง 19 ต.ค. 2569", "Building survey points Building_point (Shapefile) received 19 Oct 2026"];
  const SOURCE_FILES_19OCT = {
    parcels: [PARCEL_FILE], taxmap: [PARCEL_FILE, LTAX_FILE], appraisal: [PARCEL_FILE, LTAX_FILE],
    buildings: [["รูปอาคาร Building (Shapefile) ที่เทศบาลส่ง 19 ต.ค. 2569", "Building footprints (Shapefile) received 19 Oct 2026"], SURVEY_FILE, LTAX_FILE],
    houses: [SURVEY_FILE], popgrid: [SURVEY_FILE],
  };
  const NEW_LAYER_NOTES = {
    taxmap: [
      ["ภาษีปี 2569 มาจาก ภ.ด.ส.7 บัญชีเลขประเมิน บัญชีชำระ และลูกหนี้ ที่เทศบาลส่งเมื่อ 19 ต.ค. 2569 ไม่แสดงชื่อ เลขบัตร หรือเลขผู้เสียภาษีของเทศบาล ใช้รหัสแทน", "2569 tax comes from PDS 7, the assessment, payment and debtor registers received 19 Oct 2026. Names, ID numbers and municipal taxpayer numbers are not shown; a code is used instead."],
      ["ภาษีปี 2570 เป็นค่าคาดการณ์จากกฎหมายและข้อมูลที่มี ไม่ใช่ใบแจ้งประเมิน ก่อนใช้กับผู้เสียภาษีต้องตรวจเอกสารสิทธิ การใช้ประโยชน์จริง และสิทธิยกเว้นทีละราย", "2570 figures are estimates from the law and the data on hand, not assessments. Check title, actual use and exemptions case by case before acting."],
      ["ปี 2570 วิธีเดิม คือภาษีปี 2569 ของแปลง ปรับตามสัดส่วนที่ภาษีตามกฎหมายเปลี่ยนเมื่อราคาที่ดินเปลี่ยน ส่วนปี 2570 ตามข้อเสนอ คือวิธีเดิมบวกผลต่างจากข้อเสนอที่เลือก ส่วนต่างระหว่างสองค่าจึงเป็นผลของข้อเสนอล้วน ๆ", "2570 current method = the parcel’s 2569 tax scaled by how the legal tax changes with land prices; 2570 with fixes = current method plus the difference the selected fixes make, so the gap is purely the effect of the fixes."],
      ["สถานะการชำระรายแปลงแสดงได้เฉพาะโฉนดที่อยู่ในบัญชีลูกหนี้ ไฟล์ ภ.ด.ส. ไม่มีรหัสผู้เสียภาษีต่อโฉนด จึงแบ่งยอดชำระลงแปลงไม่ได้ และยังรวมแปลงของเจ้าของคนเดียว (ม.40 ม.42 วรรคสอง) ไม่ได้", "Payment status per parcel exists only for titles on the debtor list. The PDS files carry no taxpayer code per title, so payments cannot be allocated to parcels and one owner’s parcels cannot be combined (s.40, s.42 para 2)."],
      ["ภาษี 0 บาทแสดงเฉพาะโฉนดที่บัญชีพิสูจน์ว่ายกเว้นทั้งหมด แปลงที่ไม่พบในบัญชีแสดงเป็นลายเส้นเทา ไม่ใช่ศูนย์", "A 0 THB tax appears only where the roll proves the title fully exempt; parcels not on the roll show grey hatching, not zero."],
    ],
    appraisal: [["ราคาประเมินเป็นราคาที่เทศบาลใช้ในบัญชีปี 2569 แปลงที่ยังจับคู่กับบัญชีไม่ได้ไม่แสดงสี และไม่ได้แปลว่าราคาเป็นศูนย์", "Prices are those on the municipality’s 2569 roll. Unmatched parcels have no colour; that does not mean a zero price."]],
    popgrid: [
      ["นับจากรายชื่อสมาชิกในแบบสำรวจอาคาร 19 ต.ค. 2569 ซึ่งมีรายชื่อเพียงบางหลัง จึงไม่ใช่ประชากรทั้งหมด", "Counted from member lists in the 19 Oct 2026 building survey; only some houses have lists, so this is not the full population."],
      ["เด็กต่ำกว่า 15 ปีดูจากคำนำหน้า เด็กชาย/เด็กหญิง อายุ 15–42 และ 42 ปีขึ้นไปประมาณจากประเภทเลขบัตรประชาชน (เกิดก่อนหรือหลังปี 2527)", "Children under 15 come from the titles เด็กชาย/เด็กหญิง (boy/girl). The 15–42 and 42+ bands are estimated from the national ID type (born before or after 1984)."],
      ["ช่องที่มีคนน้อยกว่า 10 คนหรือบ้านน้อยกว่า 3 หลังปิดตัวเลขทั้งหมด กลุ่มย่อยที่มี 1–4 คนแสดงเป็น <5 และเมื่อมีกลุ่มเดียวที่แสดงเป็น <5 จะปิดอีกกลุ่มหนึ่งด้วย เพื่อไม่ให้คำนวณย้อนจากยอดรวมได้ ไม่มีข้อมูลรายหลังบนเว็บนี้", "Cells with under 10 people or 3 households are hidden entirely. Groups of 1–4 show as <5, and when only one group is <5 a second group is hidden too, so it cannot be worked out from the total. There is no per-house data on this site."],
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
    const portfolio = ["taxmap", "appraisal"].includes(S.dataset) ? portfolioHTML(f.properties.id) + parcelBuildingsHTML(f.properties.id)
      + (parcelAttr(f.properties.id) ? `<div class="record-actions"><button type="button" class="mini-action" data-tool="tax-calculator" data-parcel="${esc(f.properties.id)}">${text("เปิดแปลงนี้ในเครื่องคิดภาษี", "Open this parcel in the tax calculator")}</button></div><p class="small-note">${esc(calculatorNote(f.properties.id))}</p>` : "") : "";
    el.hidden = false;
    el.innerHTML = `<article class="record-card" tabindex="-1"><div class="record-title"><div><small>${esc(label(S.dataset))}</small><h2>${esc(featureTitle(f))}</h2></div><button class="quiet" data-close-record>${text("ปิด", "Close")}</button></div><dl class="record-dl">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>${recordFlags(f)}${portfolio}<div class="record-actions"><button class="mini-action" data-focus-record>${text("ซูมไปที่รายการนี้", "Zoom to this record")}</button>${recordLinks(f)}</div></article>`;
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
      const parcels = S.cache.get("data/parcels.geojson")?.features;
      const code = (id) => parcels?.find((x) => x.properties.id === id)?.properties.code || `#${Number(id.slice(8))}`;
      if (dataset("taxmap") && S.parcelTax) for (const id of p.parcelIds.slice(0, 3)) out.push(`<button class="mini-action" data-goto="taxmap|${esc(id)}">${esc(text(`ภาษีแปลง ${code(id)}`, `Tax of parcel ${code(id)}`))}</button>`);
    }
    return out.join("");
  }

  /* ---------- Revision 1.8: analytical layers, hover, popups, record cards ---------- */
  const CHORO_LAYERS = new Set(["taxmap", "appraisal", "popgrid"]);
  const POINT_LAYERS = new Set(["houses", "cctv", "education", "health", "religion"]);
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
    if (S.dataset === "appraisal") return parcelAttr(p.id)?.price ?? null;
    if (S.dataset === "taxmap") {
      const r = taxRow(p.id);
      if (!r) return null;
      return S.taxScenario === "assessed69" ? r.assessed69 : S.taxScenario === "old70" ? r.old70 : S.taxScenario === "new70" ? r.new70 : r.delta;
    }
    if (S.dataset === "popgrid") return p.suppressed ? null : p.hidden?.includes(S.popMetric) ? "<5" : p[S.popMetric];
    return null;
  }
  function computeClassing() {
    S.classing = null;
    if (!CHORO_LAYERS.has(S.dataset) || !window.SilaScales) return;
    const feats = currentFeatures();
    const vals = feats.map(layerValue).filter((v) => typeof v === "number");
    if (S.dataset === "taxmap" && S.taxScenario === "delta") {
      const neutral = 1;
      const cuts = SilaScales.divergingBreaks(vals, 3, neutral);
      S.classing = { kind: "diverging", scaleId: "delta", colors: SilaScales.classes("delta", 7), cuts, neutral,
        unit: text("บาทต่อปี · ปี 2570 ตามข้อเสนอ ลบ ปี 2569 ที่ประเมิน", "THB per year · 2570 proposed minus 2569 assessed"),
        title: text("ภาษีเปลี่ยนจากปี 2569", "Change from 2569 tax") };
      return;
    }
    const scaleId = S.dataset === "popgrid" ? "count" : "price";
    const colors = SilaScales.classes(scaleId, 7);
    const breaks = SilaScales.quantileBreaks(vals, colors.length);
    const units = {
      appraisal: [text("ราคาประเมินที่ดิน", "Land appraisal"), text("บาทต่อตารางวา · รอบบัญชีที่เทศบาลใช้ปี 2569", "THB per square wah · round used for 2569")],
      taxmap: [taxScenarioLabel(S.taxScenario), text("บาทต่อปี ต่อแปลง", "THB per year per parcel")],
      popgrid: [popMetricLabel(S.popMetric), text("คนในช่อง 250 × 250 ม. · เฉพาะบ้านที่มีรายชื่อในแบบสำรวจ", "people per 250 × 250 m cell · surveyed households with member lists only")],
    }[S.dataset];
    S.classing = { kind: "sequential", scaleId, colors: colors.slice(0, breaks.length + 1), breaks, title: units[0], unit: units[1] };
  }
  function classColor(v) {
    const c = S.classing;
    if (c.kind === "diverging") return c.colors[SilaScales.divergingIndex(v, c.cuts, c.neutral, 3)];
    return c.colors[Math.min(c.colors.length - 1, SilaScales.classIndex(v, c.breaks))];
  }
  function choroplethStyle(f) {
    const c = S.classing, v = layerValue(f);
    const stroke = S.theme === "light" ? "#FFFFFF" : "#11191D";
    /* Data classes are drawn at full opacity so map colours equal the legend HEX in both themes (no opacity change to data colour). */
    const base = { stroke: true, color: stroke, weight: S.dataset === "popgrid" ? 0.8 : 0.35, opacity: 0.9, fill: true, fillOpacity: 1 };
    if (!c) return { ...base, fillColor: SilaScales.noData("price", S.theme) };
    // Hidden and <5 cells are UI states, not data classes: a neutral fill plus a dashed outline (non-colour cue).
    if (S.dataset === "popgrid" && f.properties.suppressed) return { ...base, fillColor: S.theme === "light" ? "#DDE2DE" : "#26302F", dashArray: "3 3", color: S.theme === "light" ? "#5F6B66" : "#8C968F", weight: 1 };
    if (v === "<5") return { ...base, fillColor: S.theme === "light" ? "#DDE2DE" : "#26302F", dashArray: "5 2", color: S.theme === "light" ? "#3D4744" : "#C4CECA", weight: 1.2 };
    if (v == null) return { ...base, fillColor: SilaScales.hatch(S.theme) || SilaScales.noData("price", S.theme) };
    if (v === 0 && c.kind === "sequential") return { ...base, fillColor: c.colors[0], color: SilaScales.zeroOutline(c.scaleId, S.theme), weight: 1.4 };
    return { ...base, fillColor: classColor(v) };
  }
  const USE_GROUPS = [
    { id: "own", match: /อยู่เอง/, label: ["อยู่เอง", "Owner-occupied"], color: "mint" },
    { id: "rent", match: /เช่า|ผู้อื่น/, label: ["ให้เช่าหรือผู้อื่นใช้", "Rented or used by others"], color: "coral" },
    { id: "store", match: /จอด|เก็บ/, label: ["จอดรถหรือเก็บของ", "Parking or storage"], color: "sky" },
    { id: "farm", match: /สวน|เลี้ยง/, label: ["เกษตรหรือเลี้ยงสัตว์", "Farming or livestock"], color: "lime" },
  ];
  const useGroup = (p) => {
    if (p.commercial) return { id: "commerce", label: ["มีชั้นที่ใช้ค้าขาย", "Has a commercial floor"], color: "yellow" };
    return USE_GROUPS.find((g) => g.match.test(p.use || "")) || { id: "unknown", label: ["ไม่มีผลสำรวจการใช้", "No survey use"], color: null };
  };
  const catHex = (name) => S.tokens?.categoricalSeries.values.find((v) => v.name === name)?.[S.theme]?.fill || "#BFD4E7";
  function buildingStyle(f) {
    const p = f.properties, stroke = S.theme === "light" || S.basemap.startsWith("satellite") ? "#182327" : categoryColor("buildings");
    if (S.buildingView === "straddle") {
      return p.straddle
        ? { color: S.theme === "light" ? "#182327" : "#F1F4EF", weight: 1.4, fill: true, fillColor: catHex("coral"), fillOpacity: 1, opacity: 1 }
        : { color: S.theme === "light" ? "#8C968F" : "#46524F", weight: 0.6, fill: true, fillColor: S.theme === "light" ? "#DCE1DD" : "#33403D", fillOpacity: 1, opacity: 1 };
    }
    if (S.buildingView === "use") {
      const g = useGroup(p);
      return g.color ? { color: stroke, weight: 0.6, fill: true, fillColor: catHex(g.color), fillOpacity: 1, opacity: 1 }
        : { color: S.theme === "light" ? "#8C968F" : "#46524F", weight: 0.6, fill: true, fillColor: SilaScales.hatch(S.theme) || "#3B4849", fillOpacity: 1, opacity: 1 };
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
    "เก็บของ": "Storage", "บ้านสวน เลี้ยงเป็ดไก่": "Garden house, poultry", "จุดแวะพัก": "Rest stop", "เลี้ยงวัว ควาย": "Cattle and buffalo",
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
  const statusText = (s) => text(...({ paid: ["ชำระครบแล้ว", "Paid in full"], partial: ["ชำระบางส่วน (บัญชีลูกหนี้ 30 ก.ย. 2569)", "Partly paid (debtor list, 30 Sep 2569)"], unpaid: ["ค้างชำระ (บัญชีลูกหนี้ 30 ก.ย. 2569)", "Unpaid (debtor list, 30 Sep 2569)"], none: ["ไม่มียอดต้องชำระของโฉนดนี้", "Nothing due on this title"] }[s] || ["ยังผูกการชำระรายแปลงไม่ได้", "Payment not linked to parcels yet"]));
  function featureTitle(f) {
    const p = f.properties;
    if (S.dataset === "houses") return p.houseNumber ? text(`บ้านเลขที่ ${p.houseNumber}`, `House ${p.houseNumber}`) : text(`จุดสำรวจ #${p.sourceRecord}`, `Survey point #${p.sourceRecord}`);
    if (["taxmap", "appraisal", "parcels"].includes(S.dataset)) return p.code ? text(`แปลง ${p.code}`, `Parcel ${p.code}`) : p.label;
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
    } else if (S.dataset === "appraisal") {
      const a = parcelAttr(p.id);
      out.push(a?.price != null ? `<span class="hover-value">${num(a.price)}</span> ${text("บาท/ตร.ว.", "THB/sq wah")}` : text("ยังไม่มีราคาประเมินของแปลงนี้", "No appraisal for this parcel yet"));
    } else if (S.dataset === "taxmap") {
      const r = taxRow(p.id);
      if (!r) out.push(text("ยังไม่พบแปลงนี้ในบัญชีภาษี", "Not found on the tax roll"));
      else {
        const v = layerValue(f);
        out.push(`${esc(taxScenarioLabel(S.taxScenario))}: <span class="hover-value">${v == null ? "—" : (S.taxScenario === "delta" && v > 0 ? "+" : "") + fixed(v, 2)}</span> ${text("บาท", "THB")}`);
        if (S.taxScenario === "assessed69" && r.status69 !== "unknown") out.push(statusText(r.status69));
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
    const html = `<p class="popup-title">${esc(featureTitle(f))}</p><dl class="popup-dl">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>${recordFlags(f)}<button type="button" class="popup-more" data-record-focus>${text("ดูรายละเอียดทั้งหมด", "See all details")}</button>`;
    S.popup = L.popup({ maxWidth: 340, autoPanPaddingTopLeft: [24, 72], autoPanPaddingBottomRight: [24, 24], closeButton: true }).setLatLng(latlng || featureCenter(f)).setContent(html).openOn(S.map);
  }
  /* The popup leads with what the layer is about: on the tax map, the tax figures come first. */
  function popupRows(f) {
    const rows = recordRows(f);
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
    if (S.dataset === "houses") {
      add(text("บ้านเลขที่", "House number"), esc(p.houseNumber || text("ไม่มีในแบบสำรวจ", "Not in survey")));
      add(text("หมู่บ้าน", "Village"), esc(villageNames));
      add(text("ประเภทอาคาร", "Building type"), esc(sv(p.type) || text("ไม่มีในแบบสำรวจ", "Not in survey")));
      add(text("วัสดุ", "Material"), esc(sv(p.material)));
      add(text("จำนวนชั้น", "Floors"), p.floors ? num(p.floors) : null);
      add(text("อายุอาคาร", "Building age"), p.age != null ? `${num(p.age)} ${text("ปี", "years")}` : null);
      add(text("รูปอาคาร", "Footprint"), p.buildingId
        ? (p.buildingMatch === "near" ? text(`ติดรูปอาคาร #${num(Number(p.buildingId.slice(10)))} ห่าง ${num(p.buildingDistM, 1)} ม.`, `Beside footprint #${num(Number(p.buildingId.slice(10)))}, ${num(p.buildingDistM, 1)} m away`)
          : text(`อยู่ในรูปอาคาร #${num(Number(p.buildingId.slice(10)))}`, `Inside footprint #${num(Number(p.buildingId.slice(10)))}`))
        : text(`ยังไม่มีรูปอาคาร${p.buildingDistM != null ? ` · รูปที่ใกล้สุดห่าง ${num(p.buildingDistM, p.buildingDistM < 100 ? 1 : 0)} ม.` : ""}`, `No footprint yet${p.buildingDistM != null ? ` · nearest is ${num(p.buildingDistM, p.buildingDistM < 100 ? 1 : 0)} m away` : ""}`));
      add(text("การใช้ตามสำรวจ", "Surveyed use"), esc(sv(p.use) || text("ไม่มีในแบบสำรวจ", "Not in survey")));
      add(text("ชั้นที่ใช้ค้าขาย", "Commercial floor"), p.commercial ? text("มี", "Yes") : text("ไม่พบ", "None found"));
      add(text("สถานะสำรวจ", "Survey status"), esc(sv(p.status)));
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
      add(text("อายุอาคาร", "Building age"), p.age != null ? `${num(p.age)} ${text("ปี", "years")}` : null);
      add(text("การใช้ตามสำรวจ", "Surveyed use"), esc(sv(p.use)));
      add(text("พื้นที่หลังคา", "Roof area"), `${num(p.areaM2)} ${text("ตร.ม.", "m²")}`);
      add(text("มูลค่าอาคารประมาณ", "Estimated building value"), p.estValue != null ? money(p.estValue) : text("ยังคิดไม่ได้", "Not calculable"));
      add(text("ตั้งอยู่บนแปลง", "Parcels under it"), p.parcelCount ? `${num(p.parcelCount)} ${text("แปลง", "parcels")}` : text("ไม่ตรงแปลงใด", "No parcel match"));
    } else if (["taxmap", "appraisal"].includes(S.dataset)) {
      const a = parcelAttr(p.id), r = taxRow(p.id);
      add(text("รหัสแปลง", "Parcel code"), esc(p.code || "—"));
      add(text("หมู่บ้าน", "Village"), esc(villageNames));
      if (a?.sqwa != null) add(text("เนื้อที่ตามบัญชี", "Area on the roll"), esc(sqwaText(a.sqwa)));
      else add(text("เนื้อที่ (วัดจากแผนที่)", "Area (map measure)"), `${num(p.areaM2)} ${text("ตร.ม.", "m²")}`);
      add(text("ราคาประเมิน", "Appraisal"), a?.price != null ? `${num(a.price)} ${text("บาท/ตร.ว.", "THB/sq wah")}` : text("ยังไม่มีข้อมูลส่วนนี้", "Not available"));
      add(text("มูลค่าที่ดิน", "Land value"), a?.landValue != null ? money(a.landValue) : null);
      add(text("การใช้ประโยชน์ปี 2569", "Use in 2569"), a?.useLabel ? esc(text(...a.useLabel)) + (a.mainHome ? text(" · บ้านหลังหลัก", " · main home") : "") : null);
      if (r) {
        add(text("ภาษีปี 2569 ที่ประเมิน", "2569 assessed"), money(r.assessed69, 2));
        add(text("การชำระปี 2569", "2569 payment"), esc(statusText(r.status69)));
        add(text("ปี 2570 วิธีเดิม", "2570 current method"), money(r.old70, 2));
        add(text("ปี 2570 ตามข้อเสนอ", "2570 with fixes"), money(r.new70, 2));
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
    const p = f.properties, flags = [];
    if (S.dataset === "buildings" && p.straddle) flags.push(text("อาคารอยู่บนหลายแปลง · ตรวจว่ารวมฐานภาษีได้หรือไม่", "Spans parcels · check whether the tax base should be combined"));
    if (S.dataset === "buildings" && (p.surveyPoints || 0) >= 2) flags.push(text(`มี ${num(p.surveyPoints)} ทะเบียนบ้านในอาคารเดียว · ตรวจการให้เช่าหรือหลายครัวเรือน`, `${num(p.surveyPoints)} house registrations in one building · check renting or several households`));
    if (S.dataset === "buildings" && p.roll === "missing_house_no") flags.push(text("บ้านเลขที่ไม่อยู่ในบัญชีสิ่งปลูกสร้าง · ตรวจว่าตกสำรวจหรือไม่", "House number absent from the building roll · check whether it was missed"));
    if (S.dataset === "buildings" && p.roll === "house_no_unmatched") flags.push(text("บ้านเลขที่ไม่อยู่ในบัญชี แต่โฉนดใต้อาคารมีรายการอาคารที่ยังผูกกับรูปอาคารไม่ได้ · อาจเป็นหลังเดียวกันที่บันทึกโดยไม่มีบ้านเลขที่ ตรวจก่อนนับว่าตกสำรวจ", "House number not on the roll, but the title under it has roll buildings not yet linked · possibly this building recorded without a house number; check before counting it as missed"));
    if (S.dataset === "buildings" && p.roll === "house_no_elsewhere") flags.push(text("บ้านเลขที่อยู่ในบัญชีแต่ผูกกับโฉนดอื่น · ตรวจโฉนด", "House number on the roll under another title · check the deed"));
    if (S.dataset === "buildings" && p.attrFrom === "near") flags.push(text("ผูกหมุดจากระยะใกล้ ไม่ได้อยู่ในรูปอาคาร · ตรวจตำแหน่ง", "Joined from a nearby point, not inside the outline · check position"));
    if (S.dataset === "houses" && !p.buildingId) flags.push(text("หมุดนี้ยังไม่มีรูปอาคาร · อาจเป็นอาคารใหม่หรือหมุดวางคลาด", "No footprint for this point · possibly a new building or a misplaced point"));
    if (["taxmap", "appraisal"].includes(S.dataset)) {
      if (p.straddleBuildings) flags.push(text(`มีอาคาร ${p.straddleBuildings} หลังคร่อมแปลงนี้กับแปลงข้างเคียง`, `${p.straddleBuildings} building(s) span this and a neighbouring parcel`));
      const pa = parcelAttr(p.id);
      if (pa?.missBld) flags.push(text(`อาคาร ${pa.missBld} หลังมีบ้านเลขที่แต่เลขนั้นไม่อยู่ในบัญชีสิ่งปลูกสร้าง · ควรตรวจ`, `${pa.missBld} building(s) have a house number absent from the building roll · check`));
      if (pa?.link === "house") flags.push(text("จับคู่โฉนดผ่านบ้านเลขที่ ไม่ใช่เลขโฉนด", "Title matched through house numbers, not the deed"));
      if (pa && pa.tax69 === 0 && ["other", "vacant"].concat(pa.mainHome ? [] : ["res"]).includes(pa.use) && (pa.landValue || 0) > 0) flags.push(text("ภาษี 0 บาท แต่บัญชีไม่ได้ระบุเป็นบ้านหลังหลักหรือเกษตร · ตรวจเหตุยกเว้นในบัญชี", "0 THB tax, but the roll records neither a main home nor farm use · check the exemption on the roll"));
      const reasons = S.dataset === "taxmap" ? (taxRow(p.id)?.reasons || []).map((r) => r[S.lang === "en" ? 1 : 0]) : [];
      if (reasons.length) flags.push(text(`ปี 2570 ตามข้อเสนอ ต่างจากวิธีเดิมเพราะ: ${reasons.join(" · ")} (สมมติจากแบบสำรวจ ต้องตรวจก่อน)`, `2570 with fixes differs because of: ${reasons.join(" · ")} (assumed from the survey; check first)`));
    }
    return flags.length ? `<div>${flags.map((x) => `<span class="flag-chip">${esc(x)}</span>`).join("")}</div>` : "";
  }

  /* ---------- legends ---------- */
  function analyticalLegend() {
    const c = S.classing;
    if (!c) return "";
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
    if (S.buildingView === "straddle") return `<div class="legend-title">${text("อาคารที่อยู่บนหลายแปลง", "Buildings spanning parcels")}</div><div class="legend-classes"><div class="legend-class"><span class="legend-chip" style="background:${catHex("coral")}"></span><span>${text("แปลงที่สองมีหลังคาตั้งแต่ 25% และ 20 ตร.ม.", "Second parcel holds ≥25% and 20 m² of the roof")}</span></div><div class="legend-class"><span class="legend-chip" style="background:${S.theme === "light" ? "#DCE1DD" : "#33403D"}"></span><span>${text("อาคารอื่น", "Other buildings")}</span></div></div>`;
    if (S.buildingView === "roll") return `<div class="legend-title">${text("อาคารกับบัญชีสิ่งปลูกสร้างปี 2569", "Buildings and the 2569 building roll")}</div><div class="legend-classes one-col">${ROLL_GROUPS.map((g) => `<div class="legend-class"><span class="legend-chip" style="background:${catHex(g.color)}"></span><span>${esc(text(...g.label))}</span></div>`).join("")}<div class="legend-class"><span class="legend-chip" data-state="no-data" style="background-color:${SilaScales.noData("price", S.theme)}"></span><span>${text("ไม่ตรงแปลงใด", "No parcel under it")}</span></div></div><div class="legend-unit">${text("ผูกเมื่อบ้านเลขที่ในอาคารและโฉนดใต้อาคารตรงกับรายการในบัญชี · สีแยกประเภท ไม่ใช่ระดับความเสี่ยง", "Linked when the building’s house number and the title under it both match a roll entry · colours separate categories, not risk")}</div>`;
    if (S.buildingView === "registry") {
      const cls = REGISTRY_CLASSES(), dark = S.theme !== "light" ? "#F1F4EF" : "#182327";
      const row = (fill, label) => `<div class="legend-class"><span class="legend-chip" style="background:${fill}"></span><span>${esc(label)}</span></div>`;
      return `<div class="legend-title">${text("หมุดทะเบียนบ้านต่ออาคาร", "House-register points per building")}</div><div class="legend-classes">${row(cls[2], text("4 หมุดขึ้นไป", "4 or more"))}${row(cls[1], text("2–3 หมุด", "2–3"))}${row(cls[0], text("1 หมุด", "1"))}<div class="legend-class"><span class="legend-chip" data-state="no-data" style="background-color:${SilaScales.noData("count", S.theme)}"></span><span>${text("ไม่พบหมุดสำรวจ (ไม่ทราบ ไม่ใช่ศูนย์)", "No survey point (unknown, not zero)")}</span></div><div class="legend-class"><span class="legend-chip" style="background:transparent;border:1.5px dashed ${dark}"></span><span>${text("ผูกจากหมุดที่อยู่ติดอาคาร ≤5 ม.", "Joined from a point ≤5 m away")}</span></div></div><div class="legend-unit">${text("นับหมุดจากแบบสำรวจอาคาร 19 ต.ค. 2569 · ไม่พบหมุด อาจเป็นอาคารประกอบ อาคารที่ไม่ได้อยู่อาศัย หรือยังไม่สำรวจ", "Points from the 19 Oct 2026 building survey · none found can mean an annex, a non-residential building or no survey yet")}</div>`;
    }
    if (S.buildingView === "use") return `<div class="legend-title">${text("การใช้อาคารตามแบบสำรวจ", "Surveyed building use")}</div><div class="legend-classes">${[...[{ label: ["มีชั้นที่ใช้ค้าขาย", "Commercial floor"], color: "yellow" }], ...USE_GROUPS].map((g) => `<div class="legend-class"><span class="legend-chip" style="background:${catHex(g.color)}"></span><span>${esc(text(...g.label))}</span></div>`).join("")}<div class="legend-class"><span class="legend-chip" data-state="no-data" style="background-color:${SilaScales.noData("price", S.theme)}"></span><span>${text("ไม่มีผลสำรวจการใช้", "No survey use")}</span></div></div><div class="legend-unit">${text("สีแยกประเภท ไม่ใช่ระดับความเสี่ยง", "Colours separate categories, not risk")}</div>`;
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
      const scen = ["assessed69", "old70", "new70", "delta"].map((id) => `<option value="${id}"${id === S.taxScenario ? " selected" : ""}>${esc(taxScenarioLabel(id))}</option>`).join("");
      const future = ["old70", "new70", "delta"].includes(S.taxScenario);
      html = `<div class="control-card"><label class="control-field"><span>${text("สีบนแผนที่แสดง", "Map colours show")}</span><select id="tax-scenario">${scen}</select></label>`
        + (future ? `<div class="control-field"><span id="adj-label">${text("ราคาประเมินรอบใหม่ 2570–2573 เทียบรอบปัจจุบัน", "New 2570–2573 appraisal vs current")}</span><div class="control-range"><input id="appraisal-adj" type="range" min="-30" max="100" step="5" value="${S.appraisalAdj}" aria-labelledby="adj-label" aria-describedby="adj-note"><output id="appraisal-adj-value" for="appraisal-adj">${S.appraisalAdj > 0 ? "+" : ""}${S.appraisalAdj}%</output></div><p id="adj-note" class="small-note">${text("กรมธนารักษ์มีกำหนดประกาศราคาใหม่ 1 ธ.ค. 2569 ระหว่างนี้ใช้แถบนี้สมมติว่าราคาที่ดินเปลี่ยนเท่าไร ราคาอาคารคงเดิม", "The Treasury is due to publish new prices on 1 Dec 2569; until then use this to assume a land price change. Building prices stay the same.")}</p></div>` : "")
        + (S.taxScenario === "new70" || S.taxScenario === "delta" ? `<fieldset class="check-list"><legend>${text("ข้อเสนอที่คิดรวม", "Fixes included")}</legend>${TAX_STRATEGIES.map((s) => { const off = S.parcelTax?.availability?.[s.id] === false; return `<label class="check-item"><input type="checkbox" data-strategy="${s.id}"${S.taxStrategies.has(s.id) && !off ? " checked" : ""}${off ? " disabled" : ""}><span>${esc(text(...s.label))}<small>${esc(text(...(off ? window.SilaTaxEngine.OWNER_REASON : s.basis)))}</small></span></label>`; }).join("")}</fieldset>` : "")
        + `</div>`;
    } else if (S.dataset === "popgrid") {
      html = `<div class="control-card"><span class="control-field">${text("สีบนแผนที่แสดง", "Map colours show")}</span><div class="segmented" role="group" aria-label="${text("เลือกกลุ่มคน", "Choose a group")}">${["t", "c", "a", "o", "m", "f"].map((id) => `<button type="button" data-pop-metric="${id}" aria-pressed="${id === S.popMetric}">${esc(popMetricLabel(id))}</button>`).join("")}</div><p class="small-note">${text("นับจากรายชื่อในแบบสำรวจอาคาร 19 ต.ค. 2569 ซึ่งมีรายชื่อเพียงบางหลัง อายุ 15–42 และ 42 ปีขึ้นไปประมาณจากประเภทเลขบัตรประชาชน", "Counted from member lists in the 19 Oct 2026 building survey, which only some houses have. The 15–42 and 42+ bands are estimated from the national ID type.")}</p></div>`;
    } else if (S.dataset === "terrain") {
      html = terrainSurfaceControlsHTML() + terrainControlsHTML();
    } else if (S.dataset === "buildings") {
      html = `<div class="control-card"><span class="control-field">${text("ระบายสีตาม", "Colour by")}</span><div class="segmented" role="group" aria-label="${text("ระบายสีอาคารตาม", "Colour buildings by")}">${[["type", ["อาคารทั้งหมด", "All buildings"]], ["registry", ["ทะเบียนบ้านต่ออาคาร", "House registrations"]], ["roll", ["อยู่ในบัญชีภาษีหรือยัง", "On the tax roll?"]], ["straddle", ["อยู่บนหลายแปลง", "Spans parcels"]], ["use", ["การใช้ตามสำรวจ", "Surveyed use"]]].map(([id, lab]) => `<button type="button" data-building-view="${id}" aria-pressed="${id === S.buildingView}">${esc(text(...lab))}</button>`).join("")}</div></div>`;
    }
    mount.innerHTML = html;
  }

  /* ---------- tax engine glue ---------- */
  function runTax() {
    S.taxResult = null;
    if (!S.parcelTax || !window.SilaTaxEngine) return;
    try {
      S.taxResult = window.SilaTaxEngine.run(S.parcelTax, { strategies: S.taxStrategies, appraisalAdjPct: S.appraisalAdj });
    } catch (e) { console.error(e); S.taxResult = null; }
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
      + (sm ? `<p class="small-note">${text(`จับคู่โฉนดกับแปลงได้ ${num(sm.parcelsOnRoll)} แปลง (เลขโฉนด ${num(sm.parcelsDeedMatched)} · ผ่านบ้านเลขที่ ${num(sm.parcelsHouseNoMatched)}) ภาษี 0 บาทแสดงเฉพาะโฉนดที่บัญชีพิสูจน์ว่ายกเว้นทั้งหมด`, `${num(sm.parcelsOnRoll)} parcels matched to titles (deed ${num(sm.parcelsDeedMatched)} · via house numbers ${num(sm.parcelsHouseNoMatched)}). A 0 THB tax appears only where the roll proves the title fully exempt.`)}</p>` : "")
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
    return `<section class="panel-section"><h2 class="sr-only">${text("ภาษีรายแปลง", "Tax by parcel")}</h2>${taxTotalsHTML()}${fixes ? `<button type="button" class="more-button" data-show-list="fixes">${text("ดูแปลงที่ข้อเสนอทำให้ภาษีเปลี่ยน เรียงจากมากไปน้อย", "List parcels the fixes change most")} (${num(fixes)})</button>` : ""}${debtors ? `<button type="button" class="more-button" data-show-list="debtors">${text("ดูแปลงที่อยู่ในบัญชีลูกหนี้ปี 2569", "List parcels on the 2569 debtor list")} (${num(debtors)})</button><p class="small-note">${esc(text(`ผูกกับโฉนดบนแผนที่ได้ ${num(S.parcelTax?.taxpayers?.size || 0)} จาก ${num(S.parcelTax?.summary?.cityTotals?.debtors2569 || 0)} รายในบัญชีลูกหนี้ 30 ก.ย. 2569 แสดงเฉพาะแปลงที่โฉนดมีภาษีของตัวเอง`, `${num(S.parcelTax?.taxpayers?.size || 0)} of the ${num(S.parcelTax?.summary?.cityTotals?.debtors2569 || 0)} debtors on the 30 Sep 2569 list could be linked to mapped titles; only parcels whose title has its own tax are listed`))}</p>` : ""}<button type="button" class="more-button" data-tool="tax-calculator">${text("คิดภาษีแปลงเดียวด้วยมือ", "Work out one parcel by hand")}</button><p class="small-note">${text("คลิกแปลงเพื่อดูภาษี อาคารในบัญชี และอาคารที่สำรวจพบแต่ไม่อยู่ในบัญชี ไฟล์ ภ.ด.ส. ที่ได้รับไม่มีชื่อหรือรหัสผู้เสียภาษีต่อโฉนด จึงยังรวมทุกแปลงของเจ้าของคนเดียว (ม.40 ม.42) และแบ่งการชำระรายแปลงไม่ได้ ยกเว้นโฉนดที่อยู่ในบัญชีลูกหนี้", "Click a parcel for its tax, buildings on the roll and surveyed buildings missing from it. The PDS files carry no owner name or taxpayer code per title, so owner portfolios (s.40, s.42) and per-parcel payments are not available yet, except for titles on the debtor list.")}</p></section>`
      + `<details class="supplement" open><summary>${text("ผลของข้อเสนอแต่ละข้อ (ทั้งเมือง)", "Effect of each fix (whole city)")}</summary><div class="supplement-body">${strategyTableHTML()}</div></details>`
      + `<details class="supplement"><summary>${text("ภาษีรายหมู่บ้าน", "Tax by village")}</summary><div class="supplement-body">${villageTaxTableHTML()}</div></details>`
      + supplementsHTML() + notesLink();
  }
  /* Median appraisal per village from the matched parcels (a parcel counts in the village holding most of it). */
  function villagePriceTableHTML() {
    const by = new Map();
    for (const p of S.parcelTax?.parcels || []) if (p.price != null && p.v) { if (!by.has(p.v)) by.set(p.v, []); by.get(p.v).push(p.price); }
    const rows = S.metadata.villages.filter((x) => by.has(x.id)).map((x) => { const a = by.get(x.id).sort((m, n) => m - n); return { x, n: a.length, med: a[Math.floor(a.length / 2)], max: a[a.length - 1] }; }).sort((a, b) => b.med - a.med);
    if (!rows.length) return "";
    return `<table class="data-table"><thead><tr><th>${text("หมู่บ้าน", "Village")}</th><th class="num">${text("แปลงที่มีราคา", "Priced parcels")}</th><th class="num">${text("ราคากลาง", "Median")}</th><th class="num">${text("สูงสุด", "Highest")}</th></tr></thead><tbody>${rows.map(({ x, n, med, max }) => `<tr><td><button type="button" data-scope="${esc(x.id)}">${esc(villageLabel(x))}</button></td><td class="num">${num(n)}</td><td class="num">${num(med)}</td><td class="num">${num(max)}</td></tr>`).join("")}</tbody></table><p class="small-note">${text("บาทต่อตารางวา · ราคากลางคือค่ามัธยฐานของแปลงที่จับคู่กับบัญชีได้ แปลงที่คร่อมหลายหมู่บ้านนับในหมู่บ้านที่มีพื้นที่มากที่สุด", "THB per square wah · the median of parcels matched to the roll; a parcel crossing villages counts in the village holding most of it")}</p>`;
  }
  function appraisalContent() {
    const s = S.parcelTax?.summary, table = villagePriceTableHTML();
    return `<section class="panel-section"><div class="facts-grid">${fact(s?.pricedParcels ?? null, text("แปลงที่มีราคาประเมิน", "Parcels with an appraisal"))}${fact(s?.medianPrice ?? null, text("ราคากลาง (มัธยฐาน) บาท/ตร.ว.", "Median THB per sq wah"))}</div><p class="small-note">${text("ราคาประเมินมาจากบัญชีที่เทศบาลใช้คิดภาษีปี 2569 แปลงที่ยังจับคู่กับบัญชีไม่ได้แสดงเป็นลายเส้นเทา ไม่ใช่ราคาเป็นศูนย์ กรมธนารักษ์มีกำหนดประกาศราคารอบ 2570–2573 วันที่ 1 ธ.ค. 2569", "Prices come from the roll the municipality used for 2569. Parcels not yet matched show grey hatching, not a zero price. The Treasury Department is due to publish 2570–2573 prices on 1 Dec 2569.")}</p></section>`
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
      + `<p class="small-note">${text("ผูกหมุดทะเบียนบ้านกับรูปอาคารด้วยตำแหน่ง: หมุดอยู่ในรูปอาคาร หรืออยู่ติดอาคารไม่เกิน 5 ม. และอยู่ในแปลงเดียวกัน ไม่ใช้ชื่อหรือเลขที่คล้ายกันเดา อาคารหลายทะเบียนบ้านเป็นสัญญาณให้ตรวจการให้เช่าหรือสิทธิบ้านหลังหลัก ไม่ใช่ข้อพิสูจน์", "House-register points are joined to footprints by position: inside the outline, or within 5 m on the same parcel. No guessing from names or similar numbers. Several registrations in one building signal a check on renting or main-home relief, not proof.")}</p>`
      + `<p class="small-note">${text("อาคารที่อยู่บนหลายแปลงเป็นสัญญาณให้ตรวจว่าแปลงเหล่านั้นควรรวมเป็นฐานภาษีเดียวกันหรือไม่ (ม.42 วรรคสอง ถ้าเป็นเจ้าของเดียวกันและที่ดินติดกัน) แผนที่สองชุดอาจเหลื่อมกันเล็กน้อย จึงต้องตรวจที่ดินจริงก่อน", "A building spanning parcels is a signal to check whether those parcels form one tax base (s.42 para 2, same owner and adjoining). The two maps can be slightly offset, so check on site first.")}</p></section>` + supplementsHTML() + notesLink();
  }
  function housesContent() {
    const fs = currentFeatures(), commercial = fs.filter((f) => f.properties.commercial).length, rented = fs.filter((f) => /เช่า|ผู้อื่น/.test(f.properties.use || "")).length;
    const nofp = fs.filter((f) => !f.properties.buildingId).length;
    return `<section class="panel-section"><div class="facts-grid">${fact(fs.length, text("หมุดสำรวจในพื้นที่นี้", "Survey points in this area"))}${fact(fs.length - nofp, text("หมุดที่ผูกกับรูปอาคารได้", "Points joined to a footprint"))}${fact(nofp, text("หมุดที่ยังไม่มีรูปอาคาร", "Points without a footprint"))}${fact(rented, text("ให้เช่าหรือผู้อื่นใช้", "Rented or used by others"))}${fact(commercial, text("มีชั้นที่ใช้ค้าขาย", "With a commercial floor"))}</div><button class="more-button" data-show-list>${text("ค้นหาบ้านเลขที่", "Search house numbers")}</button><button class="more-button" data-show-list="nofootprint">${text("ดูหมุดที่ยังไม่มีรูปอาคาร", "List points without a footprint")}</button><p class="small-note">${text("หมุดที่ยังไม่มีรูปอาคารอาจเป็นอาคารที่สร้างหลังทำรูปอาคารชุดนี้ หรือหมุดวางคลาด ควรตรวจในพื้นที่ก่อนเพิ่มในบัญชีภาษี", "A point without a footprint may be a building put up after these outlines were drawn, or a misplaced point. Check on site before adding it to the tax roll.")}</p></section>` + notesLink();
  }
  const LIST_FILTERS = {
    multi: { layer: "buildings", test: (p) => (p.surveyPoints || 0) >= 2, sort: (a, b) => (b.properties.surveyPoints || 0) - (a.properties.surveyPoints || 0), label: ["อาคารที่มี 2 ทะเบียนบ้านขึ้นไป", "Buildings with 2+ house registrations"] },
    straddle: { layer: "buildings", test: (p) => p.straddle, label: ["อาคารที่อยู่บนหลายแปลง", "Buildings spanning parcels"] },
    missing: { layer: "buildings", test: (p) => p.roll === "missing_house_no", sort: (a, b) => (b.properties.estValue || 0) - (a.properties.estValue || 0), label: ["อาคารที่บ้านเลขที่ไม่อยู่ในบัญชีสิ่งปลูกสร้าง", "Buildings whose house number is absent from the roll"] },
    unmatched: { layer: "buildings", test: (p) => p.roll === "house_no_unmatched", sort: (a, b) => (b.properties.estValue || 0) - (a.properties.estValue || 0), label: ["บ้านเลขที่ไม่อยู่ในบัญชี แต่โฉนดยังมีอาคารที่ผูกไม่ได้", "House number not on the roll; title has unlinked roll buildings"] },
    elsewhere: { layer: "buildings", test: (p) => p.roll === "house_no_elsewhere", label: ["บ้านเลขที่อยู่ในบัญชีแต่ผูกกับโฉนดอื่น", "House number on the roll under another title"] },
    fixes: { layer: "taxmap", test: (p) => { const r = taxRow(p.id); return r?.new70 != null && r?.old70 != null && r.new70 - r.old70 >= 1; }, sort: (a, b) => { const d = (f) => { const r = taxRow(f.properties.id); return (r?.new70 ?? 0) - (r?.old70 ?? 0); }; return d(b) - d(a); }, label: ["แปลงที่ข้อเสนอทำให้ภาษีปี 2570 เปลี่ยน เรียงจากมากไปน้อย (ควรตรวจก่อน)", "Parcels whose 2570 tax changes with the fixes, largest first (check first)"] },
    debtors: { layer: "taxmap", test: (p) => ["unpaid", "partial"].includes(taxRow(p.id)?.status69), sort: (a, b) => (taxRow(b.properties.id)?.assessed69 || 0) - (taxRow(a.properties.id)?.assessed69 || 0), label: ["แปลงที่อยู่ในบัญชีลูกหนี้ปี 2569", "Parcels on the 2569 debtor list"] },
    nofootprint: { layer: "houses", test: (p) => !p.buildingId, sort: (a, b) => (b.properties.buildingDistM ?? 0) - (a.properties.buildingDistM ?? 0), label: ["หมุดที่ยังไม่มีรูปอาคาร", "Points without a footprint"] },
  };
  const activeListFilter = () => (S.listFilter && LIST_FILTERS[S.listFilter]?.layer === S.dataset ? LIST_FILTERS[S.listFilter] : null);
  async function gotoFeature(layer, id) {
    if (!dataset(layer)) return;
    if (S.dataset !== layer) await setDataset(layer);
    const find = () => currentFeatures().find((f) => f.properties.id === id);
    let f = find();
    if (!f && S.scope.type !== "municipality") { await selectScope("sila"); f = find(); }
    if (!f) { toast(text("ไม่พบรายการนี้ในชั้นข้อมูล", "This record is not in the layer")); return; }
    selectRecord(f);
    if (S.selectedLayer) { S.interactionRevision++; S.map.fitBounds(S.selectedLayer.getBounds(), { padding: [64, 64], maxZoom: 19, animate: false }); openPopupFor(f); }
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
    S.map.fitBounds(S.highlightLayer.getBounds(), { padding: [48, 48], maxZoom: 18, animate: false });
  }
  function titleCardHTML(a) {
    const rows = [];
    rows.push([text("จับคู่โฉนดด้วย", "Title matched by"), a.link === "house" ? text("บ้านเลขที่ของอาคารในแปลง (แผนที่แปลงไม่มีเลขโฉนด) · อ่อนกว่าเลขโฉนด", "house numbers of buildings on the parcel (no deed number in the map) · weaker than a deed") : text("เลขโฉนด หน้าสำรวจ หรือเลขที่ดิน", "deed, survey or land number")]);
    rows.push([text("อาคารในบัญชีของโฉนดนี้", "Buildings on this title’s roll"), a.rollBld != null ? text(`${num(a.rollBld)} หลัง${a.bldValue != null ? ` · ${moneyShort(a.bldValue)}` : ""}`, `${num(a.rollBld)}${a.bldValue != null ? ` · ${moneyShort(a.bldValue)}` : ""}`) : text("ยังไม่มีข้อมูลส่วนนี้", "Not available")]);
    if (a.missBld) rows.push([text("อาคารที่สำรวจพบแต่ไม่อยู่ในบัญชี", "Surveyed buildings missing from the roll"), text(`${num(a.missBld)} หลัง${a.surveyBld ? ` · ประมาณ ${moneyShort(a.surveyBld)}` : ""}`, `${num(a.missBld)}${a.surveyBld ? ` · about ${moneyShort(a.surveyBld)}` : ""}`)]);
    return `<div class="record-section"><h3>${text("โฉนดของแปลงนี้ในบัญชีภาษี", "This parcel’s title on the roll")}</h3><dl class="record-dl">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`
      + (a.tp ? "" : `<p class="small-note">${text("ยังไม่รู้ว่าเป็นของผู้เสียภาษีรายใด ไฟล์ ภ.ด.ส. ที่ได้รับไม่มีชื่อหรือรหัสผู้เสียภาษี จึงคิดทีละโฉนด ยังรวมแปลงของเจ้าของคนเดียวไม่ได้", "The owner is not known: the PDS files carry no owner name or taxpayer code, so tax is worked out per title, not per owner.")}</p>`) + `</div>`;
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
    return `<div class="record-section"><h3>${esc(tpLabel(a.tp))} · ${esc(tp.type === "juristic" ? text("นิติบุคคล", "juristic person") : tp.type === "individual" ? text("บุคคลธรรมดา", "individual") : text("ไม่ทราบประเภท", "type unknown"))}</h3>`
      + `<dl class="record-dl">${rollParts.length ? `<dt>${text("ในบัญชีภาษี", "On the tax roll")}</dt><dd>${esc(rollParts.join(" · "))}</dd>` : ""}<dt>${text("บัญชีลูกหนี้ 30 ก.ย. 2569", "Debtor list, 30 Sep 2569")}</dt><dd>${esc(text(`ประเมิน ${money(tp.assessed69, 2)} · ค้าง ${money(tp.debt69, 2)}`, `assessed ${money(tp.assessed69, 2)} · owed ${money(tp.debt69, 2)}`))}</dd><dt>${text("แปลงที่จับคู่ได้บนแผนที่", "Matched parcels on the map")}</dt><dd>${esc(text(`${num(tp.parcels.length)} แปลง · ภาษีปี 2569 รวม ${money(r?.assessed69, 2)}`, `${num(tp.parcels.length)} · 2569 tax ${money(r?.assessed69, 2)}`))}</dd><dt>${text("ปี 2570 ตามข้อเสนอ", "2570 with fixes")}</dt><dd>${esc(money(r?.new70, 2))}</dd></dl>`
      + (r && tp.assessed69 != null && Math.abs((r.assessed69 || 0) - tp.assessed69) > 1 ? `<p class="small-note">${text("ยอดของแปลงบนแผนที่ไม่เท่ายอดในบัญชีลูกหนี้ อาจมีโฉนดที่ยังจับคู่ไม่ได้ หรือสองบัญชีไม่ตรงกัน ควรตรวจกับกองคลัง", "The matched parcels do not add up to the debtor-list amount: some titles may be unmatched, or the two registers disagree. Check with the finance division.")}</p>` : "")
      + `<ul class="portfolio-list">${list}</ul>${tp.parcels.length > 12 ? `<p class="small-note">${text(`และอีก ${num(tp.parcels.length - 12)} แปลง`, `and ${num(tp.parcels.length - 12)} more`)}</p>` : ""}`
      + `<div class="record-actions"><button type="button" class="mini-action" data-highlight-taxpayer="${esc(a.tp)}">${text("ไฮไลต์ทุกแปลงของรายนี้บนแผนที่", "Highlight all this taxpayer’s parcels")}</button></div></div>` + titleCardHTML(a);
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
    S.map.createPane("terrain");
    S.map.getPane("terrain").style.zIndex = 330;
    S.map.getPane("terrain").style.pointerEvents = "none";
    S.map.createPane("boundary");
    S.map.getPane("boundary").style.zIndex = 350;
    S.boundaryRenderer = L.svg({ pane: "boundary" });
    S.map.createPane("features");
    S.map.getPane("features").style.zIndex = 360;
    S.map.createPane("selected");
    S.map.getPane("selected").style.zIndex = 390;
    S.map.getPane("selected").style.pointerEvents = "none";
    S.map.createPane("outsideMask");
    S.map.getPane("outsideMask").style.zIndex = 450;
    S.map.getPane("outsideMask").style.pointerEvents = "none";
    S.maskRenderer = L.svg({ pane: "outsideMask" });
    setBasemap();
    S.map.on("dragstart", () => S.interactionRevision++);
    // While a popup is open on phones and tablets, the folded legend steps aside so it cannot cover the popup's buttons.
    S.map.on("popupopen", () => document.querySelector(".map-stage")?.classList.add("popup-open"));
    S.map.on("popupclose", () => document.querySelector(".map-stage")?.classList.remove("popup-open"));
    $("map").addEventListener("wheel", () => S.interactionRevision++, {
      passive: true,
    });
    $("map").addEventListener("click", (e) => {
      if (e.target.closest(".leaflet-control-zoom")) S.interactionRevision++;
    });
    S.map.on("click", handleMapClick);
    installHover();
    S.map.on("zoomend", () => {
      $("map").dataset.zoom = String(S.map.getZoom());
    });
    S.map.on("moveend", () => {
      const c=S.map.getCenter();
      Object.assign($("map").dataset,{longitude:String(c.lng),latitude:String(c.lat),zoom:String(S.map.getZoom())});
      if (S.dataset === "terrain" && !S.terrain3DVisible) scheduleTerrainSurface();
    });
    const context=document.querySelector(".map-context");
    new ResizeObserver(()=>{$("basemap-caption").style.top=Math.max(62,context.offsetTop+context.offsetHeight+8)+"px";}).observe(context);
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

  function fitScope() {
    const b = scopeData().bbox;
    if (!b) return;
    S.map.fitBounds(
      [
        [b[1], b[0]],
        [b[3], b[2]],
      ],
      {
        padding: [16, 24],
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
            text("เลือก ", "Select ") + f.properties.label,
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
    drawLegend();
  }
  async function drawFeatures(ticket) {
    if (S.dataset !== "terrain" && S.terrainLayer) {
      S.map.removeLayer(S.terrainLayer);
      S.terrainLayer = null;
    }
    if (S.featureLayer) S.map.removeLayer(S.featureLayer);
    S.featureLayer = null;
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
    if (matchMedia("(max-width:899px)").matches)
      $("record-detail").scrollIntoView({ behavior: "auto", block: "start" });
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
    S.selectedLayer = L.geoJSON(S.record, {
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
  /* On phones and tablets the legend can cover most of the map, so it folds to its title with a toggle (wide screens keep it open). */
  function drawLegend() {
    drawLegendBody();
    const el = $("map-legend");
    if (!el || !el.innerHTML.trim()) return;
    el.dataset.collapsed = S.legendCollapsed ? "true" : "false";
    el.insertAdjacentHTML("afterbegin", `<button type="button" class="legend-toggle" aria-expanded="${S.legendCollapsed ? "false" : "true"}">${S.legendCollapsed ? text("แสดงคำอธิบายสี", "Show legend") : text("ซ่อนคำอธิบายสี", "Hide legend")}</button>`);
  }
  const TOUCH = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  function drawLegendBody() {
    if (CHORO_LAYERS.has(S.dataset)) {
      $("map-legend").innerHTML = analyticalLegend() || `<div class="legend-description">${text("กำลังเปิดข้อมูล", "Loading data")}</div>`;
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
      const contour = S.terrainContours ? `<div class="legend-row"><span class="legend-line terrain-contour-sample"></span><span>${esc(text(`เส้นชั้นความสูงทุก ${stepText(S.terrainStep)} ม. · เส้นหนาทุก ${stepText(S.terrainStep * 5)} ม.`, `Contours every ${stepText(S.terrainStep)} m · bold every ${stepText(S.terrainStep * 5)} m`))}</span></div>${S.terrainStep < 1 ? `<div class="legend-unit">${text("ละเอียดกว่าความคลาดเคลื่อนของ FABDEM ใช้ดูรูปทรง ไม่ใช่ระดับสำรวจ", "Finer than FABDEM’s error: shows form, not surveyed levels")}</div>` : ""}` : "";
      $("map-legend").innerHTML = `${bar}${contour}<div class="legend-row"><span class="legend-line" style="border-color:${mapToken("activeLayer")}"></span><span>${esc(boundaryLabel())}</span></div><div class="legend-description">${esc(S.mode === "3d" ? text("3D · รูปทรงพื้นที่ ไม่ใช่ความเสี่ยงน้ำท่วม", "3D · terrain form, not flood risk") : text("ความสูงพื้นดิน ไม่ใช่ระดับน้ำหรือความเสี่ยงน้ำท่วม", "Ground height, not water level or flood risk"))}</div><div class="legend-description">${esc(terrainStateLabel())}</div>`;
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
        `<div class="legend-row"><span class="legend-line" style="border-color:${mapToken("activeLayer")}"></span><span>${esc(boundaryLabel())}</span></div>${dataset().geojson && !["overview", "population", "villages", "municipality", "election"].includes(S.dataset) ? `<div class="legend-row"><span class="legend-dot" style="background:${categoryColor(S.dataset)}"></span><span>${esc(label(S.dataset))}</span></div>` : ""}<div class="legend-description">${S.dataset === "houses" ? text("หมุดสำรวจทุกจุดในขอบเขต · ชี้เพื่อดูบ้านเลขที่ คลิกเพื่อดูผลสำรวจ", "All survey points in this scope · point to read, click for the survey") : text("ชี้เพื่อดูชื่อ คลิกเพื่อดูรายละเอียด · สีแยกประเภท ไม่ใช่ความเสี่ยง", "Point to read names, click for details · colours separate types, not risk")}</div>`;
    $("map-context-text").textContent =
      S.scope.type === "municipality"
        ? S.boundary === "election"
          ? text(
              "เขตทดลองจากเส้นต้นทาง · ไม่ใช่ขอบเขตทางกฎหมายที่รับรอง",
              "Derived electoral boundaries · legal authority unverified",
            )
          : S.boundary === "municipality"
            ? text(
                "คลิกรูปข้อมูลเพื่อดูรายการ หรือเลือกหมู่บ้านเพื่อลงรายละเอียด",
                "Click data shapes to inspect records, or choose villages to drill down",
              )
            : text(
                "ขอบเขตหมู่บ้านจากไฟล์ · คลิกพื้นที่เพื่อลงรายละเอียด",
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
    const source = { taxmap: "parcels", appraisal: "parcels", popgrid: "population-grid" }[S.dataset] || S.dataset;
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
    // On stacked (phone) layouts a map tap keeps the map in view: the popup shows the key figures and its
    // "See all details" button scrolls to the card. Elsewhere the card scrolls into its own panel.
    const stacked = card && $("map") && card.getBoundingClientRect().top >= $("map").getBoundingClientRect().bottom - 1;
    if (card && !card.hidden && !(fromMap && stacked)) card.scrollIntoView({ behavior: "auto", block: "nearest" });
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
        [`tax2570CurrentMethodTHB_appraisal${S.appraisalAdj >= 0 ? "+" : ""}${S.appraisalAdj}pct`, (r) => round2(t(r).old70)],
        [`tax2570WithFixesTHB_appraisal${S.appraisalAdj >= 0 ? "+" : ""}${S.appraisalAdj}pct`, (r) => round2(t(r).new70)], ["fixesApplied", (r) => (t(r).reasons || []).join("|")]);
    } else if (S.dataset === "buildings") {
      cols.push(["type", prop("type")], ["floors", prop("floors")], ["areaM2", prop("areaM2")], ["houseNumbers", prop("houseNumbers")], ["parcelIds", prop("parcelIds")], ["rollStatus", prop("roll")], ["spansParcels", prop("straddle")]);
    } else if (S.dataset === "houses") {
      cols.push(["houseNumber", prop("houseNumber")], ["type", prop("type")], ["use", prop("use")], ["buildingId", prop("buildingId")]);
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
      else if (S.dataset === "buildings") S.featureLayer.setStyle(buildingStyle);
    }
    drawLegend();
    if (S.record) { renderRecord(); if (S.popup) openPopupFor(S.record, S.popup.getLatLng()); }
  }
  function bindEvents() {
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t.id === "mission-select") { setMission(t.value); return; }
      if (t.id === "layer-select") { setDataset(t.value); return; }
      if (t.id === "tax-scenario") { S.taxScenario = t.value; renderLayerControls(); restyleLayer(); syncURL(true); return; }
      if (t.matches?.("[data-strategy]")) {
        t.checked ? S.taxStrategies.add(t.dataset.strategy) : S.taxStrategies.delete(t.dataset.strategy);
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
      if (t.id === "terrain-step") { S.terrainStepChoice = t.value === "auto" ? "auto" : Number(t.value); updateTerrainSurface(true); renderLayerControls(); syncURL(true); $("terrain-step")?.focus(); return; }
      if (t.id === "appraisal-adj") {
        S.appraisalAdj = Number(t.value) || 0;
        runTax(); restyleLayer(); if (S.tab === "overview") $("tab-content").innerHTML = overviewContent(); renderSummary(); syncURL(true); return;
      }
    });
    document.addEventListener("input", (e) => {
      if (e.target.id === "appraisal-adj") { const v = Number(e.target.value) || 0; $("appraisal-adj-value").textContent = `${v > 0 ? "+" : ""}${v}%`; }
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
    const splitter = $("panel-splitter");
    const setSplit = value => { const percent=Math.max(36,Math.min(64,value)); document.querySelector(".workspace").style.setProperty("--map-share",percent+"%"); splitter.setAttribute("aria-valuenow",String(Math.round(percent))); };
    splitter.addEventListener("pointerdown",e=>{splitter.setPointerCapture(e.pointerId);splitter.dataset.dragging="true";});
    splitter.addEventListener("pointermove",e=>{if(splitter.dataset.dragging!=="true")return;const r=document.querySelector(".workspace").getBoundingClientRect();setSplit((e.clientX-r.left)/r.width*100);});
    splitter.addEventListener("pointerup",()=>delete splitter.dataset.dragging);
    splitter.addEventListener("pointercancel",()=>delete splitter.dataset.dragging);
    splitter.addEventListener("keydown",e=>{if(!["ArrowLeft","ArrowRight","Home"].includes(e.key))return;e.preventDefault();setSplit(e.key==="Home"?50:Number(splitter.getAttribute("aria-valuenow"))+(e.key==="ArrowLeft"?-2:2));});
    document.addEventListener("click", (e) => {
      if (e.target.closest(".legend-toggle")) { S.legendCollapsed = !S.legendCollapsed; drawLegend(); $("map-legend")?.querySelector(".legend-toggle")?.focus(); return; }
      const pb = e.target.closest("[data-parcel-buildings]");
      if (pb) { showParcelBuildings(pb.dataset.parcelBuildings); return; }
      if (!e.target.closest(".header-settings")) document.querySelector(".header-settings").open=false;
      if (e.target.closest("#terrain-auto")) { setTerrainAuto(!S.terrainAuto); return; }
      if (e.target.closest("[data-terrain-reset]")) { S.terrainAutoTarget = 0.15; setTerrainAuto(true); return; }
      const terrainMode = e.target.closest("[data-terrain-mode]");
      if (terrainMode) { setTerrainMode(terrainMode.dataset.terrainMode); return; }
      const metric = e.target.closest("[data-pop-metric]");
      if (metric) { S.popMetric = metric.dataset.popMetric; renderLayerControls(); restyleLayer(); syncURL(true); $(`layer-controls`).querySelector(`[data-pop-metric="${S.popMetric}"]`)?.focus(); return; }
      const bview = e.target.closest("[data-building-view]");
      if (bview) { S.buildingView = bview.dataset.buildingView; renderLayerControls(); restyleLayer(); renderSummary(); syncURL(true); $(`layer-controls`).querySelector(`[data-building-view="${S.buildingView}"]`)?.focus(); return; }
      const hl = e.target.closest("[data-highlight-taxpayer]");
      if (hl) { highlightTaxpayer(hl.dataset.highlightTaxpayer); return; }
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
        S.listFilter = showList.dataset.showList || null;
        S.page = 60;
        renderPanel();
        $("tab-list")?.focus();
        return;
      }
      if (e.target.closest("[data-clear-filter]")) { S.listFilter = null; renderPanel(); return; }
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
            padding: [48, 48],
            maxZoom: 19,
            animate: false,
          });
      }
      if (e.target.closest("[data-focus-record]") && S.selectedLayer) {
        S.interactionRevision++;
        S.map.fitBounds(S.selectedLayer.getBounds(), {
          padding: [48, 48],
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
  async function start() {
    try {
      let scales, parcelTax;
      [S.catalog, S.metadata, S.docs, S.tokens, S.publicSummary, S.terrainSource, S.terrainCoverage, scales, parcelTax, S.popStructure] = await Promise.all([
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
      ]);
      if (!window.SilaScales?.load(scales)) S.catalog.datasets = S.catalog.datasets.filter((d) => !["taxmap", "appraisal", "popgrid"].includes(d.id));
      if (parcelTax && window.SilaTaxEngine) {
        try { S.parcelTax = window.SilaTaxEngine.prepare(parcelTax); S.parcelTaxStatus = "ready"; runTax(); }
        catch (e) { console.error(e); S.parcelTaxStatus = "error"; }
      } else S.parcelTaxStatus = "unavailable";
      if (S.parcelTaxStatus !== "ready") S.catalog.datasets = S.catalog.datasets.filter((d) => !["taxmap", "appraisal"].includes(d.id));
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
