/* Sila internal Officer prototype. Actual source geometries; no production writes. */
(() => {
  "use strict";
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
    dataset: ["ชุดข้อมูล", "Dataset"],
    boundaries: ["ขอบเขตพื้นที่", "Area boundaries"],
    layers: ["ซ้อนชั้นข้อมูล", "Layers"],
    contextLayers: ["ข้อมูลประกอบแผนที่", "Context layers"],
    waterways: ["ลำห้วยและแหล่งน้ำ", "Streams & water bodies"],
    roads: ["ถนนขึ้นทะเบียน", "Registered roads"],
    buildings: ["รูปอาคาร", "Building footprints"],
    basemap: ["พื้นหลัง", "Basemap"],
    back: ["ย้อนกลับ", "Back"],
    fit: ["ดูเต็มพื้นที่", "Fit area"],
    floodPurpose: ["น้ำและแผนป้องกัน", "Water & prevention"],
    taxPurpose: ["ที่ดินและสิ่งปลูกสร้าง", "Land & buildings"],
    overview: ["ภาพรวม", "Overview"],
    list: ["รายการ", "Records"],
    sources: ["แหล่งข้อมูล", "Sources"],
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
      "จำนวนไฟล์ไม่ใช่จำนวนชุดข้อมูล แต่ละชั้นแสดงที่มาและข้อจำกัดของตัวเอง",
      "File count is not dataset count. Each layer has its own source and limitations.",
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
    parcels: ["แปลงที่ดิน / ความพร้อมภาษี", "Parcels & tax readiness"],
    flood: ["น้ำท่วม / แผนแก้ไข 16 จุด", "Flood planning · 16 sites"],
    terrain: ["ภูมิประเทศ 3D DEM", "3D terrain / DEM"],
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
  };
  const groupLabels = {
    Land: ["ที่ดินและอาคาร", "Land & buildings"],
    Infrastructure: ["โครงสร้างพื้นฐาน", "Infrastructure"],
    Location: ["สถานที่และบริการ", "Places & services"],
    Water: ["น้ำและแผนงาน", "Water & planning"],
    Living: ["ผู้คน", "People"],
    Boundaries: ["ขอบเขตพื้นที่", "Area boundaries"],
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
      "พิกัดเทียบต้นทางแล้ว · รอรับรองและทะเบียนภาษี",
      "Source controls compared · formal CRS and tax register pending",
    ],
    flood: [
      "แผน พ.ศ. 2564–2567 ไม่ใช่สถานการณ์ปัจจุบัน",
      "2021–2024 plan, not current flood conditions",
    ],
    terrain: [
      "อีกทีมกำลังจัดทำ dataset ใน CityMETER",
      "A separate team is preparing the CityMETER dataset",
    ],
    election: [
      "ขอบเขตแสดงผลที่ต่อจากเส้นต้นทาง",
      "Display boundaries derived from source lines",
    ],
  };
  const statusLabels = {
    ready_with_caveats: ["ข้อมูลต้นทาง", "Source data"],
    needs_reconciliation: ["รอสอบทาน", "To reconcile"],
    derived_display: ["ขอบเขตทดลอง", "Derived display"],
    blocked_crs: ["รอระบบพิกัด", "CRS pending"],
    inferred_control_validated: [
      "พิกัดเทียบต้นทางแล้ว",
      "Source controls compared",
    ],
    document_evidence_only: ["หลักฐานเอกสาร", "Document evidence"],
    external_team_pending: ["กำลังจัดทำ", "In preparation"],
  };
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
  const label = (id) =>
    labels[id] ? text(...labels[id]) : dataset(id)?.label || id;
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
      dataset: S.dataset,
      boundary: S.boundary,
      scope: S.scope.type === "municipality" ? "sila" : S.scope.id,
      lang: S.lang,
      theme: S.theme,
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
      "ค้นหาชุดข้อมูลหรือชื่อโฟลเดอร์",
      "Search a dataset or source folder",
    );
    $("basemap").options[0].textContent = text("แผนที่ถนน", "Street map");
    $("basemap").options[1].textContent = text(
      "เฉพาะข้อมูลพื้นที่",
      "Data only",
    );
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
    document.title = `${scopeLabel()} · ${label(S.dataset)} | CityChat CityMETER`;
  }
  function renderCatalog() {
    const q = $("dataset-search").value.trim().toLowerCase();
    const rows = [dataset("overview"), ...S.catalog.datasets].filter((d) =>
      [d.label, label(d.id), ...(d.sourceFolders || [])]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
    let html = "";
    const groups = [
      "Boundaries",
      "Land",
      "Living",
      "Infrastructure",
      "Location",
      "Water",
    ];
    for (const g of groups) {
      const list = rows.filter((d) => d.group === g);
      if (!list.length) continue;
      html += `<h3 class="dataset-group-title">${esc(text(...(groupLabels[g] || [g, g])))}</h3>`;
      for (const d of list)
        html += `<button class="dataset-row" data-dataset="${esc(d.id)}" aria-current="${d.id === S.dataset}"><span class="dataset-dot" style="background:${categoryColor(d.id)}" aria-hidden="true"></span><span><strong>${esc(label(d.id))}</strong><small>${esc(text(...(hints[d.id] || statusLabels[d.status] || ["ข้อมูลจากเทศบาล", "Municipal source data"])))}</small></span><span class="number">${num(d.count)}<small>${d.id === "overview" ? text("หมู่บ้าน", "villages") : d.id === "flood" ? text("จุดในเอกสาร", "document sites") : d.count == null ? text("รอข้อมูล", "pending") : text("รายการต้นทาง", "source rows")}</small></span></button>`;
    }
    $("dataset-catalog").innerHTML =
      html ||
      `<p>${text("ไม่พบชุดข้อมูลที่ค้นหา", "No matching datasets")}</p>`;
  }
  function renderHeader() {
    applyLocale();
    $("dataset-title").textContent = label(S.dataset);
    window.SilaContextActions.render({
      mount: $("context-actions"),
      language: S.lang,
      datasetId: S.dataset,
      datasetLabel: label(S.dataset),
      scopeId: S.scope.id,
      scopeLabel: scopeLabel(),
      municipality: text("เทศบาลเมืองศิลา", "Sila Municipality"),
      sourceDate: "2026-10-05",
    });
    document.querySelector(".dataset-trigger .dataset-dot").style.background =
      categoryColor(S.dataset);
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
            "เลือกพื้นที่ แล้วดูข้อมูลที่เกี่ยวข้องกับงานของคุณ",
            "Choose an area and inspect the data relevant to your work",
          )
        : text(
            "ตัวเลขและรายการด้านล่างใช้ขอบเขตนี้ ไม่เปลี่ยนตามการเลื่อนแผนที่",
            "Figures and records use this boundary, not the current map viewport",
          );
    $("breadcrumbs").innerHTML =
      `<span>${text("ขอนแก่น", "Khon Kaen")}</span><span aria-hidden="true">›</span>${S.scope.type === "municipality" ? `<strong>${scopeLabel()}</strong>` : `<button data-scope="sila">${text("เทศบาลเมืองศิลา", "Sila Municipality")}</button><span aria-hidden="true">›</span><strong>${esc(scopeLabel())}</strong>`}`;
    $("back").disabled =
      S.scope.type === "municipality" && !S.record && !S.choice;
    document
      .querySelectorAll("[data-tab]")
      .forEach((b) =>
        b.setAttribute("aria-selected", String(b.dataset.tab === S.tab)),
      );
    $("tab-content").setAttribute("aria-labelledby", "tab-" + S.tab);
    document
      .querySelectorAll("[data-purpose]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(
            b.dataset.purpose === "flood"
              ? ["flood", "waterways"].includes(S.dataset)
              : ["parcels", "buildings", "houses"].includes(S.dataset),
          ),
        ),
      );
  }
  function renderSummary() {
    const c = countFor(S.dataset);
    let items;
    if (S.dataset === "overview")
      items = [
        [
          S.scope.type === "municipality" ? boundaries().length : 1,
          S.boundary === "municipality"
            ? text("ขอบเขตเทศบาลจากไฟล์", "source municipal boundary")
            : S.boundary === "village"
              ? text("หมู่บ้านจากไฟล์", "source villages")
              : text("เขตแสดงผลจากเส้น", "derived areas"),
        ],
        [countFor("houses"), text("หมุดบ้านในขอบเขต", "house points in scope")],
        [
          countFor("buildings"),
          text("รูปอาคารในขอบเขต", "footprints in scope"),
        ],
      ];
    else if (S.dataset === "population")
      items = [
        [
          populationFor(),
          text("คน ตามตัวเลขรวมต้นทาง", "people · source total"),
        ],
        [
          S.scope.type === "election"
            ? null
            : S.scope.type === "village"
              ? num(scopeData().male)
              : num(S.metadata.villages.reduce((a, v) => a + v.male, 0)),
          text("ชาย ตามต้นทาง", "male · source"),
        ],
        [
          S.scope.type === "election"
            ? null
            : S.scope.type === "village"
              ? num(scopeData().female)
              : num(S.metadata.villages.reduce((a, v) => a + v.female, 0)),
          text("หญิง ตามต้นทาง", "female · source"),
        ],
      ];
    else if (S.dataset === "flood")
      items = [
        [
          S.docs.sites.length,
          text("จุดในเอกสารแผน", "sites in planning documents"),
        ],
        [null, text("พื้นที่น้ำท่วมปัจจุบัน", "current flooded area")],
        [
          S.docs.summary.estimateAvailableCount,
          text("จุดที่อ่านประมาณการได้", "sites with clear estimates"),
        ],
      ];
    else if (S.dataset === "parcels")
      items = [
        [dataset().count, text("รูปแปลงในไฟล์ต้นทาง", "source parcel records")],
        [
          c,
          text("รูปแปลงตัดขอบเขตที่เลือก", "parcel shapes intersecting scope"),
        ],
        [null, text("ความครอบคลุมทะเบียนภาษี", "tax register coverage")],
      ];
    else if (S.dataset === "terrain")
      items = [
        [null, text("ความสูงภูมิประเทศ", "terrain elevation")],
        [null, text("dataset ที่พร้อมใช้", "available dataset")],
        [null, text("source ที่เลือกแล้ว", "selected source")],
      ];
    else
      items = [
        [c, text("รายการในขอบเขต", "records in scope")],
        [dataset().count, text("รายการต้นทางทั้งหมด", "all source records")],
        [
          dataset().mappedCount,
          text("รายการที่มีรูป/พิกัด", "records with geometry"),
        ],
      ];
    $("summary-title").textContent = label(S.dataset);
    $("summary-eyebrow").textContent = scopeLabel();
    $("summary-metrics").innerHTML = items
      .map(
        ([v, k]) =>
          `<div><strong>${typeof v === "string" ? esc(v) : num(v)}</strong><span>${esc(k)}</span></div>`,
      )
      .join("");
    $("summary-note").textContent =
      S.dataset === "overview"
        ? text(
            "นับรายการที่ตัดกับขอบเขตจากไฟล์ ไม่ใช่จำนวนครัวเรือนที่ยืนยันแล้ว",
            "Records intersecting the supplied boundary; not verified unique households",
          )
        : hints[S.dataset]
          ? text(...hints[S.dataset])
          : text(
              "นับรายการที่ตัดกับขอบเขต เส้นหรือรูปที่ข้ามพื้นที่อาจอยู่ในหลายหมู่บ้าน",
              "Boundary-intersection count. Crossing features may appear in several villages",
            );
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
          `<button class="area-row" data-scope="${a.id}" aria-current="${S.scope.id === a.id}"><span><span class="area-name">${esc(areaLabel(a))}</span><span class="area-meta">${metric === "population" ? text("ตัวเลขต้นทาง ปี 2569", "Source figures · 2026") : esc(label(metric)) + " · " + text("รายการที่ตัดกับขอบเขต", "Boundary-intersection records")}${metric === "population" && a.populationDiscrepancy ? " · " + text("ตัวเลขรวมรอสอบทาน", "total to reconcile") : ""}</span><span class="area-track"><span class="area-bar" style="width:${vals[i] == null ? 0 : Math.round((vals[i] / max) * 100)}%;background:${categoryColor(metric)}"></span></span></span><span class="area-value">${num(vals[i])}<small>${metric === "population" ? text("คน", "people") : text("รายการ", "records")}</small></span></button>`,
      )
      .join("");
  }
  function overviewContent() {
    if (S.dataset === "flood") return floodContent();
    if (S.dataset === "parcels") return parcelContent();
    if (S.dataset === "terrain") return terrainContent();
    let html = "";
    if (S.boundary === "election")
      html += notice(
        text("ขอบเขตสำหรับแสดงผล", "Derived display boundary"),
        text(
          "ต่อรูปจากไฟล์เส้นเขตเลือกตั้ง ไม่ใช่การรับรองขอบเขตทางกฎหมาย และยังไม่มีประชากรแยกตามเขต",
          "Joined from electoral boundary lines; legal authority is unverified. Electoral-area population is unavailable.",
        ),
      );
    if (S.dataset === "population") html += populationNotice();
    if (S.dataset === "overview") {
      html += `<section class="panel-section"><div class="section-title"><h2>${text("ข้อมูลของพื้นที่นี้", "Data for this area")}</h2><span>${text("จากไฟล์ที่ได้รับ", "received files")}</span></div><div class="facts-grid">${fact(countFor("houses"), text("หมุดบ้านเลขที่", "House number points"))}${fact(countFor("buildings"), text("รูปอาคาร", "Building footprints"))}${fact(countFor("roads"), text("ช่วงถนนขึ้นทะเบียน", "Registered road segments"))}${fact(countFor("cctv"), text("ตำแหน่งกล้อง", "CCTV locations"))}</div><p class="inline-note">${text("รูปและหมุดอาจตัดหลายขอบเขต ไม่บวกยอดย่อยเป็นยอดเทศบาลโดยอัตโนมัติ", "Shapes may intersect multiple areas. Subtotals are not automatically additive.")}</p></section>`;
      html += notice(
        text("เริ่มจากคำถามของเทศบาล", "Start with the municipal question"),
        text(
          "น้ำและแผนป้องกัน: ดูแหล่งน้ำและแผนเดิม · ที่ดินและสิ่งปลูกสร้าง: ดูรูปอาคารและข้อมูลที่รอยืนยันเพื่อเชื่อมทะเบียนภาษี",
          "Water: inspect water bodies and historical plans. Land and buildings: inspect footprints and data needed for tax reconciliation.",
        ),
      );
    } else if (
      !["population", "villages", "municipality", "election"].includes(
        S.dataset,
      )
    ) {
      html += `<section class="panel-section"><div class="section-title"><h2>${esc(label(S.dataset))}</h2><span class="status-label">${text(...(statusLabels[dataset().status] || ["ข้อมูลต้นทาง", "Source data"]))}</span></div><div class="facts-grid">${fact(countFor(S.dataset), text("รายการในขอบเขต", "In this boundary"))}${fact(dataset().count, text("ต้นทางทั้งหมด", "All source records"))}</div><p>${esc(text(...(hints[S.dataset] || ["รายการที่วางบนแผนที่ได้จากข้อมูลที่ได้รับ", "Mapped from received source files"])))}</p><button class="more-button" data-show-list>${text("ดูรายการในพื้นที่นี้", "Browse records in this area")}</button></section>`;
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
      html += `<section class="panel-section"><div class="section-title"><h2>${text("เลือกพื้นที่เพื่อลงรายละเอียด", "Select an area to drill down")}</h2><span>${text("ตามขอบเขตไฟล์", "source boundaries")}</span></div><div class="area-list">${areaRows(sort, metric)}</div></section>`;
    } else {
      const place = scopeData();
      html += `<section class="panel-section"><div class="section-title"><h2>${text("ข้อมูลประกอบพื้นที่", "Area context")}</h2></div><div class="facts-grid">${fact(populationFor(), text("ประชากรตามตัวเลขรวม", "Reported population"), text("ปี 2569 · รอสอบทานที่มา", "2026 · source validation pending"))}${fact(place.areaKm2, text("พื้นที่จากรูปขอบเขต", "Calculated boundary area"), text("ตารางกิโลเมตร · ไม่ใช่พื้นที่ทางการ", "km² · not certified area"), 2)}</div><p class="inline-note">${text("เลือก dataset อื่นได้โดยยังอยู่ในพื้นที่นี้", "Switch datasets while staying in this area")}</p></section>`;
      if (S.scope.type === "village" && place.populationDiscrepancy)
        html += populationNotice();
    }
    return html;
  }
  function populationNotice() {
    return notice(
      text("ตัวเลขประชากรรอสอบทาน", "Population needs reconciliation"),
      S.scope.type === "village"
        ? text(
            `หมู่ ${scopeData().number}: รวมต้นทาง ${num(scopeData().populationReported)} คน ชาย+หญิง ${num(scopeData().male + scopeData().female)} คน · วันอ้างอิงและเจ้าของข้อมูลยังต้องยืนยัน`,
            `Village ${scopeData().number}: source total ${num(scopeData().populationReported)}; male + female ${num(scopeData().male + scopeData().female)}. Reference date and authority are unverified.`,
          )
        : text(
            "รวมตามต้นทาง 55,838 คน เทียบกับชาย+หญิง 55,238 คน ต่างกัน 600 คนที่หมู่ 11 ยังไม่เลือกค่าหนึ่งเป็นประชากรทางการ",
            "Reported total 55,838 versus male + female 55,238; a difference of 600 at village 11. Neither is a certified municipal total.",
          ),
    );
  }
  function floodContent() {
    return (
      notice(
        text(
          "หลักฐานสำหรับวางแผน ไม่ใช่การแจ้งเตือน",
          "Planning evidence, not a flood alert",
        ),
        text(
          "เอกสารแผน พ.ศ. 2564–2567 มี 16 จุด ไม่มีพิกัด GIS ที่ตรวจยืนยันและไม่มีขอบเขตน้ำท่วมปัจจุบัน แผนที่จึงแสดงขอบเขตพื้นที่เดิม",
          "The 2021–2024 plan has 16 sites, without validated site coordinates or a current flood footprint. The map retains the area boundaries.",
        ),
      ) +
      `<section class="panel-section"><div class="facts-grid">${fact(16, text("จุดในเอกสารแผน", "Historical planning sites"))}${fact(null, text("น้ำท่วมปัจจุบัน", "Current flooding"), text("ยังไม่มีข้อมูลส่วนนี้", "No current evidence"))}</div></section><div class="section-title"><h2>${text("จุดและแนวทางในแผนเดิม", "Sites and proposals in the plan")}</h2><span>${text("ยังไม่กรองตามพิกัด", "not spatially filtered")}</span></div>` +
      S.docs.sites
        .map(
          (d) =>
            `<article class="document-card"><div class="document-meta">${text("จุดที่", "Site")} ${d.sourceSiteOrdinal} · ${esc(d.communityLabel)}</div><h3>${esc(d.title)}</h3><p>${esc(S.lang === "en" ? d.problemEn : d.problem)}</p><p>${text("แนวทางในเอกสาร: ", "Source proposal: ")}${esc(S.lang === "en" ? d.proposedActionEn : d.proposedAction)}</p><p class="document-meta">${d.budget.amount == null ? text("ประมาณการไม่ครบหรือขัดกัน", "Estimate missing or conflicting") : `${text("ประมาณการในแผนเดิม", "Historical estimate")} ${num(d.budget.amount)} ${text("บาท", "THB")}`} · ${text("ยังไม่ทราบงบอนุมัติปัจจุบัน", "current approved budget unknown")}</p><a href="${esc(d.sourceUrl)}" target="_blank" rel="noopener">${text("อ่านต้นฉบับ หน้า", "Read source page")} ${d.sourcePage}</a></article>`,
        )
        .join("")
    );
  }
  function parcelContent() {
    return (
      notice(
        text(
          "ดูรูปแปลงเพื่อวางแผนพื้นที่",
          "Inspect parcels for area planning",
        ),
        text(
          "พิกัดแปลงเทียบข้อมูลต้นทางแล้ว โดยใช้พิกัดอ้างอิงในข้อมูลบ้านและรูปอาคาร ระบบพิกัดในไฟล์ยังเป็น UNKNOWN จึงรอเจ้าหน้าที่รับรองก่อนใช้เป็นหลักฐานทางกฎหมายหรือภาษี",
          "Parcel coordinates were compared against source house controls and building footprints. The source CRS remains UNKNOWN; formal confirmation is required for legal or tax use.",
        ),
      ) +
      `<section class="panel-section"><div class="facts-grid">${fact(countFor("parcels"), text("รูปแปลงตัดขอบเขตนี้", "Parcel shapes intersecting this scope"))}${fact(null, text("ความครอบคลุมภาษี", "Tax coverage"), text("รอทะเบียนต้นทางและตัวหาร", "authoritative register pending"))}</div><button data-show-list class="more-button">${text("ตรวจรายการแปลงในพื้นที่นี้", "Inspect parcels in this scope")}</button></section>` +
      notice(
        text("แผนที่ใช้รูปแสดงผล", "Display geometry"),
        text(
          "ต้นทาง 40,368 รายการ แสดงได้ 40,367 รูป · 1 รูปไม่มีพื้นที่จึงไม่วาด · 48 รูปปรับ topology เพื่อแสดงผล ไม่มีชื่อเจ้าของหรือรหัสผู้เสียภาษี และยังไม่จับคู่แปลงกับอาคารเป็นรายการเดียวกัน",
          "40,368 source rows; 40,367 display shapes. One zero-area shape is quarantined; 48 shapes were repaired for display. Owner and taxpayer identifiers are excluded. Parcels and buildings have no verified entity match.",
        ),
      ) +
      notice(
        text(
          "ข้อมูลที่ต้องสอบทานก่อนงานภาษี",
          "Reconcile before tax operations",
        ),
        text(
          "รหัสแปลงว่าง 77 รายการ · 47 กลุ่มรหัสซ้ำ · ค่าพื้นที่อ่านไม่ได้ 5,453 รายการ ไม่ใช้รูปหรือค่าพื้นที่ยืนยันว่าอยู่ในทะเบียนภาษี",
          "77 blank parcel codes; 47 duplicate-code groups; 5,453 unreadable area values. Geometry or area values do not prove tax registration.",
        ),
      )
    );
  }
  function terrainContent() {
    return (
      notice(
        text("กำลังจัดทำข้อมูลภูมิประเทศ", "Terrain dataset is being prepared"),
        text(
          "อีกทีมกำลังเปรียบเทียบ GLO-30 กับ FABDEM เพื่อจัดทำ dataset ใน CityMETER คาดว่าจะเชื่อมได้สัปดาห์หน้า ยังไม่แสดงความสูงหรือผลวิเคราะห์น้ำท่วมจาก DEM ในต้นแบบนี้",
          "A separate team is comparing GLO-30 and FABDEM for CityMETER, expected next week. This preview does not show terrain heights or DEM-based flood results.",
        ),
      ) +
      `<p>${text("เมื่อ source และชุดข้อมูลพร้อม จะเพิ่มชั้นภูมิประเทศโดยคง dataset และขอบเขตที่เลือกไว้", "When the source and dataset are ready, the terrain layer can use the existing dataset and scope selection.")}</p>`
    );
  }
  function recordsContent() {
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
            `<button class="area-row" data-record="${esc(f.properties.id)}"><span class="area-name">${esc(f.properties.label || f.properties.id)}<span class="area-meta">${esc(f.properties.sourceFile || f.properties.sourceFolder)} · ${text("รายการ", "record")} ${f.properties.sourceRecord}${f.properties.villageIds?.length > 1 ? " · " + text("ตัดหลายหมู่บ้าน", "crosses villages") : ""}</span></span><span aria-hidden="true">›</span></button>`,
        )
        .join(
          "",
        )}</div>${!list.length ? `<div class="empty-state"><h3>${text(S.search ? "ไม่พบรายการที่ค้นหา" : "ไม่พบรายการจากชั้นนี้ในขอบเขต", S.search ? "No matching records" : "No mapped records in this boundary")}</h3><p>${text("ไม่ใช่การยืนยันว่าไม่มีสิ่งนี้ในพื้นที่จริง", "This does not prove the real-world absence of these objects.")}</p></div>` : ""}${list.length > S.page ? `<button class="more-button" data-more>${text("ดูเพิ่มอีก 60 รายการ", "Show 60 more")}</button>` : ""}<p class="inline-note">${text("นับจากข้อมูลที่ได้รับ รายการในหลายพื้นที่ไม่ใช่รายการซ้ำที่ควรลบทิ้ง", "Counts use received data. Membership in several areas does not mean a duplicate should be deleted.")}</p><button class="more-button" data-export>${text("ดาวน์โหลดรายการที่ค้นหา · CSV", "Download matching records · CSV")}</button>`
    );
  }
  function searchInput() {
    return `<label class="search-field list-search"><span class="sr-only">${text("ค้นหารายการ", "Search records")}</span><input type="search" id="record-search" placeholder="${text("ค้นหาชื่อ บ้านเลขที่ หรือหมู่บ้าน", "Search a name, house number or village")}" value="${esc(S.search)}"></label>`;
  }
  function sourcesContent() {
    const d = dataset();
    const sourceFolders =
      S.dataset === "overview"
        ? S.catalog.folders
        : S.catalog.folders.filter((f) =>
            (d.sourceFolders || []).includes(f.folder || f.title || f.name),
          );
    return `<div class="section-title"><h2>${text("ข้อมูลที่ใช้ในมุมมองนี้", "Source for this view")}</h2><span class="status-label">${text(...(statusLabels[d.status] || ["ข้อมูลต้นทาง", "Source data"]))}</span></div><dl class="source-dl"><dt>${text("ความหมายของจำนวน", "Count meaning")}</dt><dd>${esc(text(...(hints[S.dataset] || ["จำนวนรายการจากไฟล์ ไม่ใช่จำนวนบุคคลหรือครัวเรือนที่ยืนยัน", "Source records, not verified unique people or households"])))}</dd><dt>${text("ขอบเขตคำนวณ", "Calculation scope")}</dt><dd>${esc(scopeLabel())} · ${["flood", "terrain"].includes(S.dataset) ? text("เป็นบริบทพื้นที่ที่เลือก ชุดนี้ยังไม่ได้จับคู่เชิงพื้นที่", "View context only; this dataset is not spatially assigned") : text("ใช้การตัดกับรูปขอบเขต ไม่ใช้กรอบที่มองเห็น", "Geometry intersection, not the viewport")}</dd><dt>${text("วันรับข้อมูล", "Data received")}</dt><dd>5 ${text("ตุลาคม 2569", "October 2026")} · ${text("ไม่ใช่วันสำรวจ", "not the survey date")}</dd><dt>${text("ที่มารูป/พิกัด", "Geometry source")}</dt><dd>${["flood", "terrain"].includes(S.dataset) ? text("ยังไม่มีรูป/พิกัดที่ยืนยันเพื่อแสดงผล", "No verified display geometry available") : (S.dataset === "parcels" ? text("ต้นทาง UNKNOWN · EPSG:24048 สำหรับแสดงผลจากการเทียบพิกัดต้นทาง · รอรับรอง", "Source UNKNOWN · display EPSG:24048 inferred from source controls · confirmation pending") : d.sourceCRS?.join(", ")) || text("ตามไฟล์ขอบเขตที่ได้รับ", "Received boundary files")} · ${text("ความแม่นยำภาคสนามยังไม่รับรอง", "field accuracy is unverified")}</dd><dt>${text("ข้อจำกัดสำคัญ", "Material limitations")}</dt><dd>${plainCaveats(d)}</dd></dl><section class="panel-section" style="margin-top:24px"><div class="section-title"><h2>${text("โฟลเดอร์ต้นทาง", "Source folders")}</h2><span>${num(sourceFolders.length)}</span></div>${sourceFolders.map((f) => `<a class="source-folder" target="_blank" rel="noopener" href="${esc(f.url || f.sourceUrl || "https://drive.google.com/drive/folders/" + f.id)}">${esc(f.folder || f.title || f.name)}<span>${num(f.fileCount ?? f.componentCount ?? f.inventoryComponents ?? f.files?.length)} ${text("ไฟล์ประกอบ", "file components")} · ${text("เปิดใน Google Drive", "open in Google Drive")}</span></a>`).join("")}${!sourceFolders.length && d.sourceUrl ? `<a class="mini-action" href="${esc(d.sourceUrl)}" target="_blank" rel="noopener">${text("เปิดต้นทาง", "Open source")}</a>` : ""}</section>${S.dataset === "flood" ? S.docs.documents.map((x) => `<article class="document-card"><h3>${esc(x.title)}</h3><p>${text("เอกสารประกอบการวางแผน ไม่ใช่สถานการณ์ปัจจุบัน", "Planning document, not current conditions")}</p><a href="${esc(x.url)}" target="_blank" rel="noopener">${text("อ่านเอกสารต้นฉบับ", "Read original document")}</a></article>`).join("") : ""}`;
  }
  function plainCaveats(d) {
    const notes = [];
    if (hints[d.id]) notes.push(text(...hints[d.id]));
    if (d.nullOrUnusableGeometryCount)
      notes.push(
        text(
          `มี ${num(d.nullOrUnusableGeometryCount)} รายการที่ไม่มีรูป/พิกัดใช้งานได้`,
          `${num(d.nullOrUnusableGeometryCount)} source records have no usable geometry`,
        ),
      );
    if (d.displayRepairCount)
      notes.push(
        text(
          `ปรับรูปเพื่อแสดงผล ${num(d.displayRepairCount)} รายการ โดยเก็บต้นทางไว้`,
          `${num(d.displayRepairCount)} geometries were repaired for display; source retained`,
        ),
      );
    if (d.id === "election" || S.boundary === "election")
      notes.push(
        text(
          "ขอบเขตเลือกตั้งเป็นรูปแสดงผลที่ต่อจากเส้น ไม่ใช่ขอบเขตทางกฎหมายที่รับรอง",
          "Electoral polygons are derived for display, not legally certified",
        ),
      );
    return (
      notes.map(esc).join("<br>") ||
      text(
        "วันที่สำรวจ ความครบถ้วน และเจ้าของข้อมูลยังต้องยืนยัน",
        "Survey date, completeness and data authority remain to be validated",
      )
    );
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
    el.innerHTML = `<article class="record-card"><div class="record-title"><div><small>${esc(label(S.dataset))}</small><h2>${esc(p.label || p.id)}</h2></div><button class="quiet" data-close-record>${text("ปิด", "Close")}</button></div><p>${text("เลือกหนึ่งรายการ ตัวเลขภาพรวมยังใช้ขอบเขตเดิม", "One record selected. Aggregates retain the area scope.")}</p><dl><dt>${text("รายการต้นทาง", "Source row")}</dt><dd>${num(p.sourceRecord)}</dd><dt>${text("ไฟล์", "File")}</dt><dd>${esc(source)}</dd><dt>${text("หมู่บ้านที่ตัด", "Village intersections")}</dt><dd>${esc(villageNames.join(" · ") || text("ยังไม่จับคู่ขอบเขต", "not assigned"))}</dd>${p.houseNumber ? `<dt>${text("บ้านเลขที่", "House number")}</dt><dd>${esc(p.houseNumber)}</dd>` : ""}${p.geometryDisplayRepair ? `<dt>${text("รูปแสดงผล", "Display shape")}</dt><dd>${text("มีการปรับรูปจากต้นทางเพื่อแสดงผล", "Repaired for display from retained source")}</dd>` : ""}</dl><button class="mini-action" data-focus-record>${text("ดูตำแหน่งรายการนี้", "Fit this record")}</button></article>`;
  }
  function initMap() {
    S.map = L.map("map", {
      zoomControl: false,
      preferCanvas: true,
      minZoom: 8,
      maxZoom: 20,
      zoomSnap: 0.25,
      attributionControl: true,
      fadeAnimation: false,
      zoomAnimation: false,
    });
    L.control.zoom({ position: "topright" }).addTo(S.map);
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
    new ResizeObserver(() => S.map.invalidateSize({ pan: false })).observe(
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
      return;
    }
    $("map").dataset.basemapStatus = "loading";
    S.tile = window.SilaBasemap.create({
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
          S.tileFailed = false;
          $("map-error").hidden = true;
        }
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
      color: categoryColor(id),
      weight: id === "roads" ? 2 : id === "buildings" ? 0.8 : 1.2,
      opacity: 1,
      fill: !["roads", "parcels"].includes(id),
      fillColor: categoryColor(id),
      fillOpacity: 1,
    };
  }
  function featureGroup(fc, id, interactive = true) {
    return L.geoJSON(fc, {
      pane: "features",
      interactive,
      style: featureStyle(id),
      pointToLayer: (f, ll) =>
        L.circleMarker(ll, {
          pane: "features",
          radius: id === "houses" ? 3 : 6,
          color: mapToken("markerStroke"),
          weight: id === "houses" ? 0.5 : 1,
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
  }
  async function drawFeatures(ticket) {
    if (S.featureLayer) S.map.removeLayer(S.featureLayer);
    S.featureLayer = null;
    if (S.selectedLayer) S.map.removeLayer(S.selectedLayer);
    S.selectedLayer = null;
    const d = dataset();
    S.pickIndex = null;
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
            strokeColor: mapToken("markerStroke"),
            clusterActionLabel:
              S.scope.type === "municipality" && S.boundary !== "municipality"
                ? text("เลือกพื้นที่บริเวณนี้", "select this area")
                : text("เปิดรายการทั้งหมด", "open all members"),
            onSelectRecord: (feature) => {
              const [lng, lat] = feature.geometry.coordinates;
              if (!tryDrillAreaAt({ lng, lat })) selectRecord(feature);
            },
            onCluster: (members, context) => {
              if (tryDrillAreaAt(context.latlng)) return;
              showChoice(
                members,
                text(
                  "จำนวนคือหมุดจากไฟล์ เปิดเลือกแต่ละรายการได้ ไม่ใช่จำนวนครัวเรือนที่ยืนยัน",
                  "Counts represent source point records. Choose any member; these are not verified households.",
                ),
              );
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
        `<div class="legend-row"><span class="legend-line" style="border-color:${mapToken("activeLayer")}"></span><span>${esc(boundaryLabel())}</span></div>${dataset().geojson && !["overview", "population", "villages", "municipality", "election"].includes(S.dataset) ? `<div class="legend-row"><span class="legend-dot" style="background:${categoryColor(S.dataset)}"></span><span>${esc(label(S.dataset))}</span></div>` : ""}<div class="legend-description">${S.dataset === "houses" ? text("ตัวเลขบนหมุด = รายการบ้านในกลุ่ม · กดเพื่อเลือกบ้าน", "Marker counts = grouped source house records · select to inspect") : text("คลิกพื้นที่หรือรูปข้อมูลเพื่อดูรายการ · สีไม่ใช่ความเสี่ยง", "Click an area or data shape to inspect records · colors are not risk")}</div>`;
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
  async function setDataset(id, push = true) {
    S.pickIndex = null;
    if (id !== "overview" && !dataset(id)) return;
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
      const purpose = e.target.closest("[data-purpose]");
      if (purpose)
        setDataset(purpose.dataset.purpose === "flood" ? "flood" : "parcels");
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
      setBasemap();
      refreshMap();
      syncURL();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
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
    window.addEventListener("popstate", () => {
      const previousScope = S.scope.id;
      fromURL();
      renderPanel();
      renderCatalog();
      setBasemap();
      refreshMap({ fit: previousScope !== S.scope.id });
    });
  }
  async function start() {
    try {
      [S.catalog, S.metadata, S.docs, S.tokens] = await Promise.all([
        fetchJSON("data/catalog.json"),
        fetchJSON("data/metadata.json"),
        fetchJSON("reference/document-catalog.json"),
        fetchJSON("reference/design-tokens.json"),
      ]);
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
      boundary: S.boundary,
      scope: { ...S.scope },
      record: S.record?.properties.id || null,
      tab: S.tab,
      loaded: [...S.cache.keys()],
      camera: S.map
        ? { center: S.map.getCenter(), zoom: S.map.getZoom() }
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
    closeRecord,
  };
  start();
})();
