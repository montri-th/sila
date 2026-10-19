/* Sila public preview. Source GIS and approved municipal aggregates; no production writes. */
(() => {
  "use strict";
  const PublicAggregates = window.SilaPublicAggregates || {ids:[],icons:{},valid:()=>false,get:()=>null,entries:()=>[],render:()=>"",localized:v=>String(v ?? ""),valueLabel:m=>({number:m?.value ?? "—",state:""})};
  const Missions = window.SilaMissions;
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
    overview: ["ภาพรวมพื้นที่", "Area overview"],
    houses: ["ตำแหน่งบ้านเลขที่", "House number locations"],
    buildings: ["รูปอาคาร", "Building footprints"],
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
    terrain: ["ภูมิประเทศ ที่สูงที่ต่ำ", "Terrain · high and low ground"],
  };
  const colors = {
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
      "หมุดจากข้อมูลที่อยู่ ไม่ใช่จำนวนครัวเรือนที่ยืนยันแล้ว",
      "Source address points, not verified unique households",
    ],
    buildings: [
      "รูปอาคาร ไม่มีความสูงและประเภทการใช้งาน",
      "Footprints; height and use are unavailable",
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
    u.search = new URLSearchParams({
      mission: S.mission,
      dataset: S.dataset,
      boundary: S.boundary,
      scope: S.scope.type === "municipality" ? "sila" : S.scope.id,
      lang: S.lang,
      theme: S.theme,
      basemap: S.basemap,
      mode: S.dataset === "terrain" ? S.mode : "2d",
    });
    if (S.record)
      u.searchParams.set("record", S.record.properties?.id || S.record.id);
    history[replace ? "replaceState" : "pushState"]({}, "", u);
  }
  function fromURL() {
    S.pickIndex = null;
    const q = new URLSearchParams(location.search);
    S.dataset = q.get("dataset") || "buildings";
    if (S.dataset !== "overview" && !dataset(S.dataset))
      S.dataset = "buildings";
    S.mission = Missions ? Missions.missionFor(S.dataset, q.get("mission")) : "tax";
    S.mode = S.dataset === "terrain" && q.get("mode") === "3d" ? "3d" : "2d";
    S.boundary = BOUNDARY_TYPES[q.get("boundary")]
      ? q.get("boundary")
      : "municipality";
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
    $("dataset-search").placeholder = text(
      "ค้นหา เช่น ภาษี ถนน น้ำ",
      "Search, e.g. tax, road, water",
    );
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
    $("dataset-open").setAttribute("aria-label", text(`กำลังดู ${label(S.dataset)} · เปิดรายการชุดข้อมูลทั้งหมด`, `Showing ${label(S.dataset)} · open all datasets`));
    document.querySelector(".snapshot-label").textContent=text("5 ต.ค. 2569", "5 Oct 2026");
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
    $("dataset-icon").innerHTML = datasetIcon(S.dataset,28);
  }
  /* Which summary figure a menu row shows for each city-wide summary, in plain units. */
  const AGGREGATE_COUNT = {
    tax: ["receipt_rows", "ใบเสร็จในไฟล์", "receipts on file"],
    business: ["source_business_rows", "รายการกิจการ", "business records"],
    animals: ["detail_dogs", "สุนัข", "dogs"],
    caregroups: ["distinct_source_keys", "รายการในบัญชี", "list entries"],
  };
  /* Plain main count for a dataset row: what an officer counts, not source-file rows. */
  function datasetCount(d) {
    const agg = d.publicAggregate ? publicAggregate(d.id) : null;
    if (agg) {
      const pref = AGGREGATE_COUNT[d.id];
      const m = pref ? agg.metrics.find((x) => x.id === pref[0] && x.value !== null) : null;
      return m ? { value: num(m.value), unit: text(pref[1], pref[2]) } : { value: "—", unit: text("ดูยอดรวม", "see totals") };
    }
    if (d.id === "terrain") return { value: "3D", unit: text("ภาพพื้นที่", "terrain view") };
    if (d.id === "overview") return { value: num(S.metadata.villages.length), unit: text("หมู่บ้าน", "villages") };
    if (d.id === "flood") return { value: num(S.docs?.sites?.length ?? d.count), unit: text("จุด", "sites") };
    const n = d.insideMunicipalityCount ?? countFor(d.id, { type: "municipality", id: "sila" }) ?? d.count;
    return { value: num(n), unit: text(...(Missions.unit[d.id] || ["รายการ", "records"])) };
  }
  function renderCatalog() {
    const rows = [dataset("overview"), ...S.catalog.datasets];
    const html = Missions.renderCatalog({
      language: S.lang,
      rows,
      mission: S.mission,
      dataset: S.dataset,
      query: $("dataset-search").value.trim().toLowerCase(),
      matches: (d, q) => [d.label, label(d.id), text(...(Missions.purpose[d.id] || ["", ""])), ...(d.sourceFolders || []), ...(d.searchTerms || [])].join(" ").toLowerCase().includes(q),
      label,
      count: datasetCount,
      datasetIcon,
      icon: window.SilaIcons.icon,
    });
    $("dataset-catalog").innerHTML =
      html ||
      `<p>${text("ไม่พบชุดข้อมูลที่ค้นหา ลองคำอื่น เช่น ภาษี ถนน น้ำ", "No matching datasets. Try another word, such as tax, road or water.")}</p>`;
  }
  function renderMissions() {
    const nav = $("mission-nav"), card = $("mission-card");
    if (!nav || !card || !Missions) return;
    const focused = nav.contains(document.activeElement) ? document.activeElement.dataset.mission : null;
    nav.innerHTML = Missions.renderNav(S.mission, { language: S.lang, icon: window.SilaIcons.icon });
    card.innerHTML = Missions.renderCard(S.mission, {
      language: S.lang,
      dataset: S.dataset,
      icon: window.SilaIcons.icon,
      datasetIcon,
      available: (id) => id === "overview" || Boolean(dataset(id)),
    });
    if (focused) nav.querySelector(`[data-mission="${focused}"]`)?.focus();
  }
  function setMission(id, push = true) {
    if (!Missions?.byId(id) || id === S.mission) return;
    S.mission = id;
    renderMissions();
    renderCatalog();
    if (push) syncURL();
  }
  function renderHeader() {
    const aggregateMode = String(Boolean(publicAggregate()));
    const aggregateModeChanged = document.body.dataset.publicAggregate !== aggregateMode;
    document.body.dataset.publicAggregate = aggregateMode;
    if (aggregateModeChanged && S.map) requestAnimationFrame(() => S.map.invalidateSize({pan:false}));
    applyLocale();
    renderTerrainControls();
    $("dataset-title").textContent = label(S.dataset);
    window.SilaContextActions.render({
      mount: $("context-actions"),
      language: S.lang,
      datasetId: S.dataset,
      datasetLabel: label(S.dataset),
      scopeId: S.scope.id,
      scopeLabel: scopeLabel(),
      municipality: text("เทศบาลเมืองศิลา", "Sila Municipality"),
      sourceDate: publicAggregate() ? S.publicSummary.sourceReceivedAt : S.dataset === "terrain" ? S.terrainSource?.inspected_date || "2026-10-19" : "2026-10-05",
    });

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
            "เลือกงานที่จะทำ แล้วกดสิ่งที่อยากดู แผนที่และตัวเลขจะเปลี่ยนตาม",
            "Choose your work, then what you want to see. The map and figures follow.",
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
    renderMissions();
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
    else items = [[c, `${unitOf(S.dataset)}${text("ในพื้นที่นี้", " in this area")}`]];
    $("summary-title").textContent = label(S.dataset);
    $("summary-eyebrow").textContent = agg ? text("ยอดรวมทั้งเทศบาลเมืองศิลา", "Sila city-wide totals") : scopeLabel();
    $("summary-metrics").innerHTML = items
      .map(
        ([v, k]) =>
          `<div><strong>${typeof v === "string" ? esc(v) : num(v)}</strong><span>${esc(k)}</span></div>`,
      )
      .join("");
    $("summary-metrics").hidden = !items.length;
    $("summary-note").textContent = agg
      ? text("ยอดรวมจากไฟล์ที่เทศบาลส่งมา ไม่แยกตามหมู่บ้าน · อ่านความหมายแต่ละตัวเลขในแผงด้านขวา", "Totals from files supplied by the municipality, not split by village · each figure is explained in the panel")
      : S.dataset === "terrain"
        ? text("ใช้ดูรูปทรงที่สูงที่ต่ำประกอบการวางแผน ไม่ใช่ระดับน้ำท่วม", "Shows the shape of high and low ground for planning; not flood depth")
        : S.dataset === "flood"
          ? text("แผนเดิม พ.ศ. 2564–2567 ไม่ใช่สถานการณ์น้ำท่วมตอนนี้", "Past 2021–2024 plan, not current flooding")
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
    if (S.dataset === "terrain") return terrainContent();
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
      html += `<section class="panel-section"><div class="section-title"><h2>${text("ดูทีละพื้นที่", "Look at one area")}</h2><span>${text("กดชื่อเพื่อซูมเข้า", "select a name to zoom in")}</span></div><div class="area-list">${areaRows(sort, metric)}</div></section>`;
    } else {
      const place = scopeData();
      html += `<section class="panel-section"><div class="section-title"><h2>${text("ข้อมูลพื้นที่นี้", "About this area")}</h2></div><div class="facts-grid">${fact(populationFor(), text("ประชากร", "Population"), text("ตัวเลขปี 2569", "2026 figure"))}${fact(place.areaKm2, text("ขนาดพื้นที่โดยประมาณ", "Approximate size"), text("ตารางกิโลเมตร วัดจากแผนที่", "km², measured from the map"), 2)}</div><p class="inline-note">${text("เปลี่ยนงานหรือชุดข้อมูลได้ โดยยังอยู่ในพื้นที่นี้", "You can switch work or data and stay in this area")}</p></section>`;
      if (S.scope.type === "village" && place.populationDiscrepancy)
        html += populationNotice();
    }
    return html;
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
      ? text("ลากเพื่อเลื่อน · คลิกขวาลากเพื่อหมุน/เอียง · หรือ Shift + ลูกศร", "Drag to pan · right-drag to rotate/tilt · or Shift + arrows")
      : text("อ่านตำแหน่งใน 2D · เปลี่ยนเป็น 3D เพื่อดูรูปทรงพื้นที่", "Inspect locations in 2D · switch to 3D to explore terrain form");
    const status = active ? terrainStateLabel() : "";
    if ($("terrain-view-status").textContent !== status) $("terrain-view-status").textContent = status;
    const overlaysDisabled = active && S.mode === "3d";
    $("layers-open").disabled = overlaysDisabled;
    $("layers-open").title = overlaysDisabled ? text("ชั้นข้อมูลซ้อนเปิดใช้ในมุมมอง 2D", "Context overlays are available in 2D") : "";
    if (overlaysDisabled) { $("layer-options").hidden = true; $("layers-open").setAttribute("aria-expanded", "false"); }
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
      container:$("terrain-3d"),source:S.terrainSource,coverage:S.terrainCoverage,tokens:S.tokens,
      camera:{...S.terrain3DCamera,...terrainCamera2D()},theme:S.theme,basemap:S.basemap,...terrainBoundaryContext(),
      onCameraChange:camera=>{
        if(generation!==S.terrain3DGeneration)return;
        const c=validTerrainCamera(camera);if(!c)return;
        S.terrain3DCamera=c;
        Object.assign($("terrain-3d").dataset,{longitude:String(c.center[0]),latitude:String(c.center[1]),zoom:String(c.zoom),pitch:String(c.pitch),bearing:String(c.bearing)});
      },
      onStatus:status=>{
        if(generation!==S.terrain3DGeneration)return;
        S.terrain3DStatus=status; $("map").dataset.terrain3dState=status.state;
        for(const key of ["pending","rendered","triangles","exaggeration"])if(Number.isFinite(status[key]))$("terrain-3d").dataset[key]=String(status[key]);
        if(status.basemapState)$("terrain-3d").dataset.basemapState=status.basemapState;
        if(S.dataset!=="terrain"||S.mode!=="3d")return;
        if(status.state==="error"&&status.fatal){terrain3DFailed();return;}
        if(status.state==="ready"||status.state==="partial"&&status.triangles>0)showTerrain3D();
        renderTerrainControls(); const node=$("terrain-state");if(node)node.textContent=terrainStateLabel();drawLegend();
      }
    }).then(controller=>{
      if(generation!==S.terrain3DGeneration){controller.destroy();return;}
      S.terrain3D=controller;
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
        searchInput() +
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
    const list = currentFeatures().filter((f) =>
      JSON.stringify(f.properties)
        .toLowerCase()
        .includes(S.search.toLowerCase()),
    );
    return (
      searchInput() +
      `<div class="section-title"><h2>${text("รายการในขอบเขต", "Records in this boundary")}</h2><span>${num(list.length)} ${text("รายการ", "records")}</span></div><div class="area-list">${list
        .slice(0, S.page)
        .map(
          (f) =>
            `<button class="area-row" data-record="${esc(f.properties.id)}"><span class="area-name">${esc(f.properties.label || f.properties.id)}<span class="area-meta">${esc(villageNamesOf(f).join(" · ") || text("ยังไม่ระบุหมู่บ้าน", "village not assigned"))}${f.properties.villageIds?.length > 1 ? " · " + text("อยู่บนเส้นแบ่งหลายหมู่บ้าน", "on a village dividing line") : ""}</span></span><span aria-hidden="true">›</span></button>`,
        )
        .join(
          "",
        )}</div>${!list.length ? `<div class="empty-state"><h3>${text(S.search ? "ไม่พบรายการที่ค้นหา" : "ไม่พบรายการจากชั้นนี้ในขอบเขต", S.search ? "No matching records" : "No mapped records in this boundary")}</h3><p>${text("ไม่พบในข้อมูลที่ได้รับ ไม่ได้แปลว่าในพื้นที่จริงไม่มี", "Not found in the supplied data; this does not mean none exist on the ground.")}</p></div>` : ""}${list.length > S.page ? `<button class="more-button" data-more>${text("ดูเพิ่มอีก 60 รายการ", "Show 60 more")}</button>` : ""}<p class="inline-note">${text("รายการที่อยู่บนเส้นแบ่งจะเห็นได้ในหลายหมู่บ้าน ไม่ใช่รายการซ้ำที่ต้องลบ", "Items on a dividing line appear in several villages; they are not duplicates to delete.")}</p><button class="more-button" data-export>${text("ดาวน์โหลดรายการที่ค้นหา · CSV", "Download matching records · CSV")}</button>`
    );
  }
  const villageNamesOf = (f) => (f.properties.villageIds || []).map((id) => {
    const v = S.metadata.villages.find((x) => x.id === id);
    return v ? (S.lang === "en" ? `Village ${v.number}` : v.label) : id;
  });
  function searchInput() {
    return `<label class="search-field list-search"><span class="sr-only">${text("ค้นหารายการ", "Search records")}</span><input type="search" id="record-search" placeholder="${text("ค้นหาชื่อ บ้านเลขที่ หรือหมู่บ้าน", "Search a name, house number or village")}" value="${esc(S.search)}"></label>`;
  }
  function sourcesContent() {
    if (publicAggregate()) return publicAggregateView("source");
    if (S.dataset === "terrain") return terrainSources();
    const d = dataset();
    const sourceFolders =
      S.dataset === "overview"
        ? S.catalog.folders
        : S.catalog.folders.filter((f) =>
            (d.sourceFolders || []).includes(f.folder || f.title || f.name),
          );
    const notes = plainCaveatList(d);
    return `<section class="panel-section"><div class="section-title"><h2>${text("ข้อควรรู้ก่อนใช้", "Know before you use it")}</h2>${Missions?.status[d.status] ? `<span class="status-label">${esc(text(...Missions.status[d.status]))}</span>` : ""}</div><ul class="notes-list">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></section><div class="section-title"><h2>${text("ข้อมูลนี้มาจากไหน", "Where this data comes from")}</h2></div><dl class="source-dl"><dt>${text("ตัวเลขนับอะไร", "What is counted")}</dt><dd>${esc(text(...(hints[S.dataset] || ["จำนวนรายการจากไฟล์ ไม่ใช่จำนวนคนหรือครัวเรือนที่ยืนยันแล้ว", "Rows from the files, not verified people or households"])))}</dd><dt>${text("นับในพื้นที่ไหน", "Which area is counted")}</dt><dd>${esc(scopeLabel())} · ${["flood", "terrain"].includes(S.dataset) ? text("ชุดนี้ยังไม่ได้ผูกกับพื้นที่บนแผนที่", "This dataset is not tied to map areas yet") : text("นับสิ่งที่อยู่ในเส้นขอบเขต ไม่ขึ้นกับการเลื่อนแผนที่", "Counts what lies inside the boundary, regardless of map panning")}</dd><dt>${text("เทศบาลส่งข้อมูลเมื่อ", "Received from the municipality")}</dt><dd>5 ${text("ตุลาคม 2569", "October 2026")} · ${text("ไม่ใช่วันที่สำรวจ", "not the survey date")}</dd><dt>${text("ตำแหน่งบนแผนที่", "Map positions")}</dt><dd>${["flood", "terrain"].includes(S.dataset) ? text("ยังไม่มีตำแหน่งที่ตรวจแล้ว", "No checked positions yet") : (S.dataset === "parcels" ? text("ไฟล์ต้นทางไม่ระบุระบบพิกัด · ใช้ EPSG:24048 จากการเทียบกับข้อมูลบ้านและอาคาร · รอรับรอง", "Source coordinate system not stated · EPSG:24048 inferred from house and building data · awaiting confirmation") : d.sourceCRS?.join(", ")) || text("ตามไฟล์ขอบเขตที่ได้รับ", "Supplied boundary files")} · ${text("ยังไม่ได้ตรวจความแม่นยำในพื้นที่จริง", "field accuracy not yet checked")}</dd></dl><section class="panel-section" style="margin-top:24px"><div class="section-title"><h2>${text("โฟลเดอร์ต้นทาง", "Source folders")}</h2><span>${num(sourceFolders.length)}</span></div>${sourceFolders.map((f) => `<a class="source-folder" target="_blank" rel="noopener" href="${esc(f.url || f.sourceUrl || "https://drive.google.com/drive/folders/" + f.id)}">${esc(f.folder || f.title || f.name)}<span>${num(f.fileCount ?? f.componentCount ?? f.inventoryComponents ?? f.files?.length)} ${text("ไฟล์ประกอบ", "file components")} · ${text("เปิดใน Google Drive", "open in Google Drive")}</span></a>`).join("")}${!sourceFolders.length && d.sourceUrl ? `<a class="mini-action" href="${esc(d.sourceUrl)}" target="_blank" rel="noopener">${text("เปิดต้นทาง", "Open source")}</a>` : ""}</section>${S.dataset === "flood" ? S.docs.documents.map((x) => `<article class="document-card"><h3>${esc(x.title)}</h3><p>${text("เอกสารประกอบการวางแผน ไม่ใช่สถานการณ์ปัจจุบัน", "Planning document, not current conditions")}</p><a href="${esc(x.url)}" target="_blank" rel="noopener">${text("อ่านเอกสารต้นฉบับ", "Read original document")}</a></article>`).join("") : ""}`;
  }
  function plainCaveatList(d) {
    const notes = [];
    if (d.id === "parcels") notes.push(...PARCEL_NOTES.map((n) => text(...n)));
    if (d.id === "population" || (d.id === "overview" && S.scope.type === "village" && scopeData()?.populationDiscrepancy)) notes.push(text("ยอดประชากรรวมกับชายรวมหญิงไม่เท่ากันที่หมู่ 11 (ต่างกัน 600 คน) รอเทศบาลยืนยันว่าใช้ค่าไหน", "Total population and male + female differ in village 11 (by 600); awaiting confirmation of which to use"));
    if (d.id === "flood") notes.push(text("แผน พ.ศ. 2564–2567 มี 16 จุด ยังไม่มีพิกัดที่ตรวจแล้ว และไม่ใช่ขอบเขตน้ำท่วมตอนนี้", "The 2021–2024 plan lists 16 sites without checked positions; it is not a current flood extent"));
    if (d.id === "overview") notes.push(text("บ้านหรืออาคารที่อยู่บนเส้นแบ่งอาจถูกนับในหลายหมู่บ้าน จึงไม่ควรบวกยอดหมู่บ้านเป็นยอดเทศบาล", "Houses or buildings on a dividing line may count in several villages, so village totals should not be added up as the city total"));
    for (const line of plainCaveats(d)) if (!notes.includes(line)) notes.push(line);
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
    renderRecord();
  }
  function renderRecord() {
    const el = $("record-detail");
    if (!S.record && S.choice) {
      const c = S.choice,
        rows = c.features.slice(0, c.page),
        area = c.kind === "areas";
      el.hidden = false;
      el.innerHTML = `<article class="record-card"><div class="record-title"><div><small>${text("เลือกจากพื้นที่ที่คลิก", "Choose from the clicked area")}</small><h2>${num(c.features.length)} ${area ? text("ขอบเขต", "areas") : text("รายการ", "records")}</h2></div><button class="quiet" data-close-record>${text("ปิด", "Close")}</button></div><p>${esc(c.reason)}</p><div class="record-choices">${rows.map((f) => `<button class="record-choice" ${area ? "data-scope" : "data-record"}="${esc(f.properties.id)}"><strong>${esc(f.properties.label || f.properties.id)}</strong>${!area ? `<span>${text("รายการต้นทาง", "Source row")} ${num(f.properties.sourceRecord)}</span>` : ""}</button>`).join("")}</div>${rows.length < c.features.length ? `<button class="more-button" data-choice-more>${text("แสดงเพิ่ม", "Show more")} (${num(c.features.length - rows.length)})</button>` : ""}${!area ? `<button class="mini-action" data-focus-choice>${text("ซูมดูบริเวณรายการนี้", "Zoom to these records")}</button>` : ""}</article>`;
      return;
    }
    if (!S.record) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    const p = S.record.properties;
    const source = p.sourceFile || p.sourceFolder || "";
    const villageNames = (p.villageIds || []).map(
      (id) => S.metadata.villages.find((v) => v.id === id)?.label || id,
    );
    el.hidden = false;
    el.innerHTML = `<article class="record-card"><div class="record-title"><div><small>${esc(label(S.dataset))}</small><h2>${esc(p.label || p.id)}</h2></div><button class="quiet" data-close-record>${text("ปิด", "Close")}</button></div><p>${text("ตัวเลขภาพรวมยังนับทั้งพื้นที่เดิม", "Area totals still count the whole area.")}</p><dl><dt>${text("อยู่ในหมู่บ้าน", "Village")}</dt><dd>${esc(villageNames.join(" · ") || text("ยังไม่ระบุหมู่บ้าน", "not assigned"))}</dd><dt>${text("ลำดับในไฟล์ต้นทาง", "Row in source file")}</dt><dd>${num(p.sourceRecord)} · ${esc(source)}</dd>${p.houseNumber ? `<dt>${text("บ้านเลขที่", "House number")}</dt><dd>${esc(p.houseNumber)}</dd>` : ""}${p.geometryDisplayRepair ? `<dt>${text("รูปแสดงผล", "Display shape")}</dt><dd>${text("มีการปรับรูปจากต้นทางเพื่อแสดงผล", "Repaired for display from retained source")}</dd>` : ""}</dl><button class="mini-action" data-focus-record>${text("ดูตำแหน่งรายการนี้", "Fit this record")}</button></article>`;
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
    $("map").addEventListener("wheel", () => S.interactionRevision++, {
      passive: true,
    });
    $("map").addEventListener("click", (e) => {
      if (e.target.closest(".leaflet-control-zoom")) S.interactionRevision++;
    });
    S.map.on("click", handleMapClick);
    S.map.on("zoomend", () => {
      $("map").dataset.zoom = String(S.map.getZoom());
    });
    S.map.on("moveend", () => {
      const c=S.map.getCenter();
      Object.assign($("map").dataset,{longitude:String(c.lng),latitude:String(c.lat),zoom:String(S.map.getZoom())});
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
        l.bindTooltip(esc(f.properties.label), {
          sticky: true,
          direction: "top",
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
              selectRecord(f);
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
        onStatus: status => {
          const changed = S.terrainStatus.state !== status.state;
          S.terrainStatus = status;
          $("map").dataset.terrainState = status.state;
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
    S.featureLayer =
      S.dataset === "houses"
        ? window.SilaHousePoints.create({
            features: scoped,
            language: S.lang,
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
              if (!tryDrillAreaAt({ lng, lat })) selectRecord(feature);
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
      selectRecord(hits.features[0]);
      return;
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
  function drawLegend() {
    if (S.dataset === "terrain") {
      const legend = S.terrainSource?.legend;
      $("map-legend").innerHTML = `<div class="legend-row"><span class="legend-line" style="border-color:${mapToken("activeLayer")}"></span><span>${esc(boundaryLabel())}</span></div><div class="legend-description">${esc(S.mode === "3d" ? text("3D · รูปทรงพื้นที่ ไม่ใช่ความเสี่ยงน้ำท่วม", "3D · terrain form, not flood risk") : legend?.[S.lang] || text("เงาภูมิประเทศจาก FABDEM ไม่ใช่สีระดับความสูงหรือความเสี่ยง", "FABDEM hillshade is not elevation or risk colouring"))}</div><div class="legend-description">${esc(terrainStateLabel())}</div>`;
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
        `<div class="legend-row"><span class="legend-line" style="border-color:${mapToken("activeLayer")}"></span><span>${esc(boundaryLabel())}</span></div>${dataset().geojson && !["overview", "population", "villages", "municipality", "election"].includes(S.dataset) ? `<div class="legend-row"><span class="legend-dot" style="background:${categoryColor(S.dataset)}"></span><span>${esc(label(S.dataset))}</span></div>` : ""}<div class="legend-description">${S.dataset === "houses" ? text("จุดบ้านจากไฟล์ทุกจุดในขอบเขต · คลิกเพื่อตรวจรายการ", "All source house points in this scope · click to inspect") : text("คลิกพื้นที่หรือรูปข้อมูลเพื่อดูรายการ · สีไม่ใช่ความเสี่ยง", "Click an area or data shape to inspect records · colors are not risk")}</div>`;
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
  function openTool(id, opener) {
    if (id === "tax-calculator" && window.SilaTaxCalculator) {
      window.SilaTaxCalculator.open({ language: S.lang, returnFocus: opener });
      return;
    }
    toast(text("เครื่องมือนี้ยังเปิดไม่ได้ ลองโหลดหน้าใหม่", "This tool could not open. Try reloading the page."));
  }
  async function setDataset(id, push = true) {
    S.pickIndex = null;
    if (id !== "overview" && !dataset(id)) return;
    if (Missions) S.mission = Missions.missionFor(id, S.mission);
    if (id !== S.dataset) { hideTerrain3D(); S.mode = "2d"; S.terrain3DError = false; }
    S.dataset = id;
    S.record = null;
    S.choice = null;
    S.restoreRecord = null;
    S.search = "";
    S.page = 60;
    S.tab = "overview";
    if (id === "election" && S.boundary !== "election") {
      S.boundary = "election";
      S.scope = { type: "municipality", id: "sila" };
    }
    if (id === "villages" && S.boundary !== "village") {
      S.boundary = "village";
      S.scope = { type: "municipality", id: "sila" };
    }
    if (id === "municipality" && S.boundary !== "municipality") {
      S.boundary = "municipality";
      S.scope = { type: "municipality", id: "sila" };
    }
    renderPanel();
    renderCatalog();
    if (push) syncURL();
    await refreshMap();
  }
  async function selectScope(id, push = true) {
    S.pickIndex = null;
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
  function selectRecord(f, push = true) {
    if (
      f?.properties?.datasetId !== S.dataset ||
      !filterFeatures({ features: [f] }).length
    )
      return;
    S.record = f;
    S.choice = null;
    renderRecord();
    drawSelected();
    renderHeader();
    if (push) syncURL();
    if (matchMedia("(max-width:899px)").matches)
      $("record-detail").scrollIntoView({ behavior: "auto", block: "start" });
  }
  function closeRecord(push = true) {
    S.record = null;
    S.choice = null;
    if (S.selectedLayer) S.map.removeLayer(S.selectedLayer);
    S.selectedLayer = null;
    renderRecord();
    renderHeader();
    if (push) syncURL();
  }
  function exportCSV() {
    if (publicAggregate()) { toast(text("หน้านี้เผยเฉพาะข้อมูลสรุป ไม่มีรายการรายบุคคลให้ดาวน์โหลด", "This view contains public summaries only; no individual rows are downloadable.")); return; }
    const rows = currentFeatures().filter((f) =>
      JSON.stringify(f.properties)
        .toLowerCase()
        .includes(S.search.toLowerCase()),
    );
    const headers = [
      "id",
      "label",
      "sourceRecord",
      "sourceFolder",
      "sourceFile",
      "villageIds",
      "electionIds",
    ];
    const quote = (v) => {
      let clean = String(v ?? "");
      if (/^[=+@\-\t\r]/.test(clean)) clean = "'" + clean;
      return '"' + clean.replace(/"/g, '""') + '"';
    };
    const csv =
      "\ufeff" +
      headers.join(",") +
      "\r\n" +
      rows
        .map((r) =>
          headers
            .map((k) =>
              quote(
                Array.isArray(r.properties[k])
                  ? r.properties[k].join("|")
                  : r.properties[k],
              ),
            )
            .join(","),
        )
        .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sila-${S.dataset}-${S.scope.id}-20261005.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(
      text(
        "ดาวน์โหลดเฉพาะรายการที่ค้นหาในขอบเขตนี้",
        "Downloaded matching records in this scope",
      ),
    );
  }
  function bindEvents() {
    const splitter = $("panel-splitter");
    const setSplit = value => { const percent=Math.max(36,Math.min(64,value)); document.querySelector(".workspace").style.setProperty("--map-share",percent+"%"); splitter.setAttribute("aria-valuenow",String(Math.round(percent))); };
    splitter.addEventListener("pointerdown",e=>{splitter.setPointerCapture(e.pointerId);splitter.dataset.dragging="true";});
    splitter.addEventListener("pointermove",e=>{if(splitter.dataset.dragging!=="true")return;const r=document.querySelector(".workspace").getBoundingClientRect();setSplit((e.clientX-r.left)/r.width*100);});
    splitter.addEventListener("pointerup",()=>delete splitter.dataset.dragging);
    splitter.addEventListener("pointercancel",()=>delete splitter.dataset.dragging);
    splitter.addEventListener("keydown",e=>{if(!["ArrowLeft","ArrowRight","Home"].includes(e.key))return;e.preventDefault();setSplit(e.key==="Home"?50:Number(splitter.getAttribute("aria-valuenow"))+(e.key==="ArrowLeft"?-2:2));});
    $("dataset-open").addEventListener("click", () => {
      renderCatalog();
      $("dataset-dialog").showModal();
      $("dataset-search").focus();
    });
    $("dataset-close").addEventListener("click", () =>
      $("dataset-dialog").close(),
    );
    $("dataset-dialog").addEventListener("click", (e) => {
      if (e.target === $("dataset-dialog")) {
        $("dataset-dialog").close();
      }
    });
    $("dataset-search").addEventListener("input", renderCatalog);
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".header-settings")) document.querySelector(".header-settings").open=false;
      const terrainMode = e.target.closest("[data-terrain-mode]");
      if (terrainMode) { setTerrainMode(terrainMode.dataset.terrainMode); return; }
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
        $("dataset-dialog").close();
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
        S.search = "";
        S.page = 60;
        renderPanel();
        return;
      }
      if (e.target.closest("[data-show-list]")) {
        S.tab = "list";
        renderPanel();
      }
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
      renderCatalog();
      S.tile?.setLanguage?.(S.lang);
      refreshMap();
      syncURL();
    });
    $("theme").addEventListener("click", () => {
      S.theme = S.theme === "dark" ? "light" : "dark";
      renderPanel();
      renderCatalog();
      if (S.basemap.startsWith("satellite") && S.tile) S.tile.setTheme(S.theme);
      else setBasemap();
      refreshMap();
      syncURL();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const settings=document.querySelector(".header-settings");
        if(settings.open){settings.open=false;settings.querySelector("summary").focus();return;}
        if (!$("dataset-dialog").open) {
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
    $("mission-nav").addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
      const buttons = [...$("mission-nav").querySelectorAll("[data-mission]")];
      let i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const n = buttons.length;
      i = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : -1) + n) % n;
      const id = buttons[i].dataset.mission;
      setMission(id);
      $("mission-nav").querySelector(`[data-mission="${id}"]`)?.focus();
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
      renderPanel();
      renderCatalog();
      setBasemap();
      refreshMap({ fit: previousScope !== S.scope.id });
    });
  }
  async function start() {
    try {
      [S.catalog, S.metadata, S.docs, S.tokens, S.publicSummary, S.terrainSource, S.terrainCoverage] = await Promise.all([
        fetchJSON("data/catalog.json"),
        fetchJSON("data/metadata.json"),
        fetchJSON("reference/document-catalog.json"),
        fetchJSON("reference/design-tokens.json"),
        fetchJSON("data/municipal-summary.json").catch(() => null),
        fetchJSON("data/terrain-source.json").catch(() => null),
        fetchJSON("data/terrain-coverage.geojson").catch(() => null),
      ]);
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
      S.ready = true;
      bindEvents();
      initMap();
      renderPanel();
      renderCatalog();
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
