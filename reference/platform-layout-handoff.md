---
schema_version: sila.citychat-platform-layout-handoff/1.0
revision: "1.3"
created_on: "2026-10-06"
platform_commit: 02ce2238131a06a33743b213f7c1707c69708e2c
lds: "0.9.7 / v0.9.7-owner.1 / color-srgb-10"
citychat_addon: "0.9.2"
implementation_timebox_md: 5
staff: "2 interns"
machine_contract: platform-layout-handoff.json
---

# ศิลา: ต่อ Officer CityMETER ในแพลตฟอร์ม CityChat เดิม

นำโครงและข้อมูลของต้นแบบกลับเข้าหน้า Officer CityMETER ใน repository เดิม โดยใช้ Next Pages Router, React, MUI, React Query และ OpenLayers ที่มีอยู่แล้ว ต้นแบบ static เป็นข้อกำหนดการแสดงผลและพฤติกรรม ไม่ใช่ระบบ Officer ที่ผ่านการยืนยันตัวตนหรือโค้ดที่ merge เข้า production แล้ว

ตรวจ repository แบบอ่านอย่างเดียวเมื่อ 6 ตุลาคม 2569: remote default HEAD ตรงกับ local snapshot commit `02ce2238131a06a33743b213f7c1707c69708e2c` (2 ตุลาคม 2569) ผลนี้ไม่ยืนยันว่าระบบ production กำลังรัน commit เดียวกัน [ดู source](https://github.com/theshifters/landometer-citychat/tree/02ce2238131a06a33743b213f7c1707c69708e2c)

## โครงที่ควรใช้ซ้ำ

| ส่วน | ไฟล์จริงใน repo | งานที่ต้องปรับ |
|---|---|---|
| officer-route | [`web/src/pages/officer-citymeter/[[...breadcrumb]].tsx`](https://github.com/theshifters/landometer-citychat/blob/02ce2238131a06a33743b213f7c1707c69708e2c/web/src/pages/officer-citymeter/[[...breadcrumb]].tsx) | Resolve Sila canonical municipality ID from the server. Never reuse Saensuk route04200103 for Sila. |
| officer-auth | [`web/src/modules/citymeter/officer/components/OfficerCmGuard.tsx`](https://github.com/theshifters/landometer-citychat/blob/02ce2238131a06a33743b213f7c1707c69708e2c/web/src/modules/citymeter/officer/components/OfficerCmGuard.tsx) | Provision Sila context and per-organization entitlements; preserve 401/403 behavior, do not expose raw datasets on a public route. |
| shell | [`web/src/modules/citymeter/base/CmMapLayout.tsx`](https://github.com/theshifters/landometer-citychat/blob/02ce2238131a06a33743b213f7c1707c69708e2c/web/src/modules/citymeter/base/CmMapLayout.tsx) | Keep layout and state APIs. Use current0.9.7 surfaces/type/focus; do not copy old arbitrary colors/shadows. |
| composition | [`web/src/modules/citymeter/base/CmScreen.tsx`](https://github.com/theshifters/landometer-citychat/blob/02ce2238131a06a33743b213f7c1707c69708e2c/web/src/modules/citymeter/base/CmScreen.tsx) | Keep display data-first for Officer, organization-specific default dataset, persistent scope on dataset switch; no fake chat or account in public prototype. |
| map-controls | [`web/src/modules/citymeter/base/CmMapContainer.tsx`](https://github.com/theshifters/landometer-citychat/blob/02ce2238131a06a33743b213f7c1707c69708e2c/web/src/modules/citymeter/base/CmMapContainer.tsx) | Explicit basemap choice, meaningful names, conventional icons with labels, keyboard targets; avoid old outline-basemap invert filter. |
| breadcrumb | [`web/src/modules/citymeter/base/components/CmNavigatorBreadcrumb.tsx`](https://github.com/theshifters/landometer-citychat/blob/02ce2238131a06a33743b213f7c1707c69708e2c/web/src/modules/citymeter/base/components/CmNavigatorBreadcrumb.tsx) | Current source anchor href is undefined. Use real route href or semantic button; aria-current, 44px interaction, sticky visible trail in TH/EN at narrow/desktop widths. |
| dataset-menu | [`web/src/modules/citymeter/base/components/CmDatasetDropdown.tsx`](https://github.com/theshifters/landometer-citychat/blob/02ce2238131a06a33743b213f7c1707c69708e2c/web/src/modules/citymeter/base/components/CmDatasetDropdown.tsx) | Register Sila data and truthful per-organization names/status. Preserve accessibility and labels, no colored selected left rail. |
| dataset-config | [`web/src/modules/citymeter/datasets.ts`](https://github.com/theshifters/landometer-citychat/blob/02ce2238131a06a33743b213f7c1707c69708e2c/web/src/modules/citymeter/datasets.ts) | Use actual dataset capability/entitlement registry. Add data evidence provenance per organization; no code-only import creates municipal data. |
| plugin-registry | [`web/src/modules/citymeter/base/datasetPlugins.tsx`](https://github.com/theshifters/landometer-citychat/blob/02ce2238131a06a33743b213f7c1707c69708e2c/web/src/modules/citymeter/base/datasetPlugins.tsx) | Do not attempt a global registry refactor in fasttrack. Follow current module pattern and add only needed Sila extensions. |
| scope-state | [`web/src/modules/citymeter/base/hooks/useMapViewState.ts`](https://github.com/theshifters/landometer-citychat/blob/02ce2238131a06a33743b213f7c1707c69708e2c/web/src/modules/citymeter/base/hooks/useMapViewState.ts) | Map local v01–v28 to canonical server village IDs. Election is currently not a supported lv3 tile type: add a typed capability or keep explicitly derived overlay, never disguise as villages. |
| portals | [`web/src/modules/citymeter/base/CmRenderPortal.tsx`](https://github.com/theshifters/landometer-citychat/blob/02ce2238131a06a33743b213f7c1707c69708e2c/web/src/modules/citymeter/base/CmRenderPortal.tsx) | Write React plugin panels into current portals; do not mount standalone DOM handlers inside React. |
| provenance | [`web/src/modules/citymeter/shared-components/DatasetProvenanceNote.tsx`](https://github.com/theshifters/landometer-citychat/blob/02ce2238131a06a33743b213f7c1707c69708e2c/web/src/modules/citymeter/shared-components/DatasetProvenanceNote.tsx) | Bind current DS tokens and public plain-language source meaning; preserve null/zero state distinction. |
| lds-adapter | [`web/src/theme/lds/index.ts`](https://github.com/theshifters/landometer-citychat/blob/02ce2238131a06a33743b213f7c1707c69708e2c/web/src/theme/lds/index.ts) | Source explicitly pins LDS0.9.1 and color-srgb05. Preserve useful API names while replacing only selected Sila surface bindings with exact0.9.7 projections, then migrate remaining surfaces separately. |
| icon-renderer | [`web/src/common/components/lds/LdsIcon.tsx`](https://github.com/theshifters/landometer-citychat/blob/02ce2238131a06a33743b213f7c1707c69708e2c/web/src/common/components/lds/LdsIcon.tsx) | Do not treat glyphMap40 as current base approval registry. Bind exact product-owned extension hashes/rights/approval for missing glyphs; selection never changes FILL/weight. |
| http | [`web/src/core/api/index.ts`](https://github.com/theshifters/landometer-citychat/blob/02ce2238131a06a33743b213f7c1707c69708e2c/web/src/core/api/index.ts) | server-apis.ts JSON calls use fetchJson with typed queryParams. Binary MVT keeps sanctioned map-utils descriptor/header pattern. |

จุดสำคัญ: `theme/lds/index.ts` ใน repo ยังนำเข้าไฟล์ v0.9.1 และระบุ `color-srgb-05` จึงเก็บ API/component ที่ใช้ได้แล้ว bind ค่า 0.9.7 ของหน้าศิลาก่อน ไม่แก้แค่ชื่อเวอร์ชัน ส่วน `datasetPlugins.tsx` ยังเป็น registry บางส่วน; ไม่ต้อง refactor ระบบทั้งหมดในงาน fasttrack

## รูปแบบหน้าและการ drilldown

Desktop เริ่ม map ซ้าย + panel ขวาประมาณ 50/50 และปรับความกว้างได้ ลำดับ panel ใช้ breadcrumb ที่เห็นต่อเนื่อง → พื้นที่ของฉัน → dataset → ความหมายหลักของพื้นที่ → ข้อมูลไม่เกินสามข้อพร้อมที่มา → การทำงานถัดไป ผู้ใช้จึงรู้ว่ากำลังอ่านพื้นที่ใดและกลับระดับบนได้ ใน production แสดงข้อมูลเมือง/ห้องแชทตาม capability จริงของระบบเดิม; ใน static demo ไม่เพิ่มห้องแชทหรือบัญชีสมมติ

คง scope เมื่อเปลี่ยน dataset; การเลือกรายการบ้าน/อาคาร/แปลงไม่เปลี่ยนยอดรวมพื้นที่ ยอดใช้ geometry intersection ไม่ใช้กรอบที่กล้องแผนที่มองเห็น และไม่บวกยอดย่อยที่ซ้อนกันเป็นยอดเทศบาลโดยอัตโนมัติ Mobile ใช้ pattern ของ `MobileDynamicPanel` โดยยังเห็นชื่อพื้นที่และ breadcrumb ไม่ลดขนาดตัวอักษรเพื่อฝืนข้อความไทย

เมื่อเปิดรายการจากหมู่บ้านหรือเขตเลือกตั้ง breadcrumb ของพื้นที่แม่ต้องกดเพื่อปิดรายการได้ โดยคงพื้นที่และกล้องเดิม ส่วนรายการที่เลือกเป็นตำแหน่งปัจจุบันใน breadcrumb การกลับเทศบาลจึงเป็นอีก action ที่ชัดเจน

ตำแหน่งบ้านแสดงเป็นจุดต้นทางทุกระดับซูม ไม่มี cluster, หมุดตัวเลขรวม หรือ badge แทนจุด คงพิกัดจริงและไม่กระจายจุดเพื่อให้ดูแยกกัน เมื่อจุดซ้อนในบริเวณที่คลิก ให้เปิดรายการต้นทางให้เลือก พร้อมชื่อ/บ้านเลขที่เมื่อมีและ source row ไม่เลือก record แรกโดยอัตโนมัติ ผู้ใช้คีย์บอร์ดเข้าถึงรายการเดียวกันผ่านรายการข้อมูลได้ เก็บจุดที่มีพิกัดทุก record ใน scope เป็น point layer โดยไม่กรองตาม viewport หรือจำกัดจำนวนจุด; renderer ตัดภาพนอก viewport ตามปกติได้ แต่ไม่เปลี่ยนยอดของขอบเขตหรือใช้จำนวนจุดที่มองเห็นเป็นความครอบคลุม

`useMapViewState.ts` รองรับ village ระดับ lv3 แต่ยังไม่มี election tile type เขตเลือกตั้งสามเขตของต้นแบบจึงต้องเป็น overlay ที่ระบุว่า derived หรือเพิ่ม type/endpoints ที่ตกลงร่วมกัน ห้ามแทน ID ของหมู่บ้านและห้ามสมมติรหัสเทศบาลศิลาจาก route แสนสุข

## ชุดข้อมูลที่ใช้กับ module เดิม

| Dataset ต้นแบบ | Module / แนวทาง | ขอบเขตการตีความ |
|---|---|---|
| `houses` | `house` (existing_plugin) | Source points at every zoom without clustering or count badges; overlapping points open source-record choices. No verified unique households or adjustment writes without official source/receipt. |
| `buildings` | `building` (existing_plugin) | Footprints only; no estimated population/height/tax amount. Organization-specific visible label must not promise missing attributes. |
| `roads` | `road` (existing_plugin) | 713 segments are not unique roads, road surface/lanes or maintenance authority absent unless source supports them. |
| `cctv` | `cctv` (existing_plugin) | 51source/50mapped; no livevideo or operational status. |
| `parcels` | `landparcel` (existing_plugin) | Use source-count/geometry mode; default PRICE/treasury comparison is unavailable. UNKNOWN source CRS and inferred display EPSG24048 remain explicit. |
| `population` | `population` (existing_plugin) | 28village rows only; total55838 vs male+female55238 differ600 in v11. Do not invent age cohorts, reconcile silently or assign population to election areas. |
| `education` | `landmark` (landmark_subtype) | Use source-supported education labels only; no quality/accessibility/reach inference. |
| `health` | `landmark` (landmark_subtype) | Use source-supported health labels only; no capacity/availability inference. |
| `religion` | `landmark` (landmark_subtype) | Use source-supported religion labels only. |
| `publicfacilities` | `landmark` (landmark_geometry_extension) | 100polygons, not100points; do not replace realgeometry by invented points or unmapped category meanings. |
| `waterways` | new_dataset_extension | 110KMLplacemarks/112parts; shapes do not establish drainage capacity, flow, floodhazard. |
| `municipality` | boundary_mode | Supplied1polygon; legal version unverified. |
| `villages` | boundary_mode | 29source records unioned into28filename-grouped areas, retain source IDs. |
| `election` | derived_boundary_mode | 5source lines including1empty→3derived polygons. Not officialcertified; newtyped tiletype capability required forplatform drilldown. |
| `flood` | document_dataset_extension | Keep historical16-site plan separate from floodimpact metric. All16 lackverifiedcoordinates/currentrisk. |
| `terrain` | external_team_adapter | CityMETER GLO30/FABDEM source selection external and pending; not in5MD. No terrain heights/floodmodel before actualdata contract. |

ตัวอย่างที่ต้องแก้ก่อนใช้งาน: `landparcel` plugin เดิมเริ่มที่ PRICE แต่ข้อมูลศิลามีเพียงรูปและ attributes ที่ยังต้องสอบทาน ให้เริ่มจำนวน/รูปแปลง ไม่แสดงราคา ประเมินภาษี หรือ % ความครบทะเบียนภาษี; `building` เดิมมีชื่อประชากรโดยประมาณ แต่ source ศิลาเป็น footprints จึงแสดงชื่อรูปอาคาร และซ่อนตัวเลขประชากร/ความสูงที่ไม่มี

แปลงชุดเดิมมี 40,368 source records และแสดงได้ 40,367 รูปจากการอนุมาน display CRS และตรวจเทียบ control; PRJ ต้นทางยัง UNKNOWN ไม่ใช่การรับรอง CRS/แนวเขตทางกฎหมาย บ้าน 28,783 จุดไม่ใช่ครัวเรือนที่ยืนยัน อาคาร 38,849 source/38,847 mapped กล้อง 51 source/50 mapped รายละเอียด source/mapped/CRS ทั้ง16datasetอ่านได้จาก [catalog](../data/catalog.json) และ machine contract

## Asset ที่มีประโยชน์ต่อการตัดสินใจ

ใช้โลโก้ CityChat บอลลูนมนและ favicon ที่บันทึกบทบาทไว้แล้วใน [identity manifest](../assets/brand/manifest.json) / [favicon formats](../assets/brand/favicon-formats.manifest.json) ไม่ใช้ header lockup เป็น tab icon และไม่อ้างว่าชุด browser ICO/PNG/SVG นี้ครอบคลุม apple/maskable ทั้งชุดตาม FAVICON-01

เพิ่มได้หนึ่งชิ้นบนคำชวนเริ่มสำรวจ: [conversation-welcome.svg](../assets/brand/conversation-welcome.svg) คือ ConversationMotif ต้นฉบับ156×127, 11,610bytes, SHA-256 `fa67237428dc510cb4e7bc15e86e3764e9911db8a5e26787cb7d40291a284ca4` คัด bytes เดิมไม่เปลี่ยนสี/รูป/metadata พร้อม [receipt](../assets/brand/conversation-welcome.receipt.json) ใช้ `<img alt="">` คู่กับข้อความสด เช่น “เลือกพื้นที่และชุดข้อมูล เพื่อดูหลักฐานประกอบการวางโครงการ” ถ้ารูปเสียให้ข้อความยังอยู่ ภาพนี้ไม่ใช่หมุดแผนที่ ไอคอน dataset หลักฐานน้ำท่วม สถานะรับเรื่อง หรือโลโก้ที่สอง

ไอคอนควรช่วยจำแนกงาน: home/บ้าน, apartment/อาคาร, route/ถนน, videocam/กล้อง, water/แหล่งน้ำ, grid_on/แปลง, landscape/ภูมิประเทศ ใช้ชื่อ dataset ที่เห็นเสมอ สีหรือรูปไอคอนไม่ยืนยันความเสี่ยง ความครบภาษี หรือคุณภาพบริการ ทุกไฟล์เพิ่มเติมต้องใช้ product-owned extension manifest ที่ระบุ official source, exacthash, Apache license และ FILL0/wght300/GRAD0; allowlist40ใน repo ไม่ใช่หลักฐาน approval ครบทุก glyph ของฐาน0.9.7

Typography: display ไทย IBM Plex Sans Thai Looped700/Latin Arvo700, body/UI Bai Jamjuree400/600, technical data JetBrains Mono/IBM Plex Sans Thai400 ใช้ไฟล์ exact ที่ส่งอยู่แล้ว ไม่เพิ่มฟอนต์หรือ stock illustration อีกตระกูล Identity gradient CityChat ใช้เฉพาะ identity: light `#007A58→#007E79`, dark `#3BD19B→#3BD3CB`; scale วิเคราะห์คงค่าปัจจุบันเหมือนกันทั้งธีม

## แผนที่และความชัดของหมุด

หน้าเริ่มต้นยังเป็น Street map และ dataset รูปอาคารตามเดิม เมื่อผู้ใช้เลือก Satellite ใช้ Google Hybrid แหล่งเดียวกับ `CmScreen.tsx` ของ CityChat: `https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}` พร้อม `crossOrigin: anonymous` เป็นงาน compatibility ตามคำขอให้ใช้ provider เดิม ไม่ใช่การเปลี่ยนหน้าเริ่มต้นหรือการยืนยันสิทธิ์ใหม่ จำกัดคำขอระดับ 19 ตาม configuration ใน `CmScreen-3d.tsx` และขยาย pixels เดิมเมื่อแสดงระดับ 20 วันที่ภาพและความละเอียดจริงยังเป็น `null`; ไม่อ้างว่าภาพใหม่หรือเป็น official Google Maps Tile API ดู source hashes และข้อจำกัดใน [satellite contract](satellite-basemap-contract.md) / [machine contract](satellite-basemap-contract.json)

Satellite archive เป็นตัวเลือกแยกที่ผู้ใช้เลือกเอง: EOX Sentinel-2 cloudless 2016/2017 ประมาณ 10 เมตรต่อพิกเซล ใช้ native zoom สูงสุด 14 และขยายภาพเดิมถึงระดับ 20 เก็บ tiles ต้นฉบับที่เตรียมไว้เฉพาะศิลาและพื้นที่รอบข้างใน `vendor/satellite-eox-2016/` พร้อม [inventory](satellite-tile-inventory.json) ไม่สลับจาก Google ไป EOX โดยอัตโนมัติเมื่อโหลดไม่ได้ การเลื่อนออกนอก coverage อาจไม่มีภาพ และต้องไม่ทำให้ข้อมูลเทศบาลหรือการเลือกพื้นที่หายไป ส่วน Street map ใช้ OpenFreeMap ตาม [basemap sources](basemap-sources.json)

คงภาพที่เลือกในทุก display zoom ที่รองรับ พร้อมชื่อ provider/attribution และคำอธิบาย native zoom/overzoom ที่ตรงกับ source การขยาย pixels ไม่สร้างความละเอียดสูงขึ้นหรือภาพสำรวจใหม่ สิทธิ์/configuration ของ Google ที่ทีมใช้อยู่ยังต้องยืนยันตาม `licenseStatus: not_verified`; งานนี้ไม่ได้เพิ่ม key/session token หรือดาวน์โหลด/cache ภาพ Google

ปรับ neutral halo/stroke และพื้นรอง label เพื่อให้หมุด เส้น ขอบรูป และ focus เห็นบน map สว่าง/มืด/ดาวเทียม โดยคง fill/data LUT เดิม ห้าม CSS invert/filter/opacity transform ที่เปลี่ยนสีข้อมูล ตรวจ pixels และ render ของ source ที่ใช้จริง; fallback ต้องเรียกชื่อ provider จริงและคง scope/camera

## Fasttrack รวม 5 MD: interns สองคน

เป็น timebox รวม 5 MD หรือคนละ2.5 MD ซึ่งทำขนานได้ประมาณ2.5วันทำงาน เมื่อ repo/dev environment/API/สิทธิ์และ canonical IDs พร้อม ไม่ใช่การประมาณ rewrite ทั้งแพลตฟอร์ม และไม่รวมเวลารอหน่วยงาน/รีวิว/ระบบภายนอก

| Task | คน | MD | ผลที่ต้องได้ |
|---|---|---:|---|
| FT-01 | intern_A | 1.0 | Read exact pinned sources and patch Sila shell/current0.9.7 token adapter while preserving existing component API. |
| FT-02 | intern_B | 1.0 | Create source-version adapter/canonical municipality+village ID crosswalk and source-count parity from existing processed catalog. |
| FT-03 | intern_A | 1.0 | Reuse shell/portals/existing plugins for building/house/road/CCTV/parcel; show source house points at all zooms without clusters/count badges and add visible functional labels/icons + one welcome illustration. |
| FT-04 | intern_B | 1.0 | Connect processedgeometry+boundary sourceadapter, truthful population/document/landmark views and scopeaggregate queries using existing endpoint conventions. |
| FT-05 | intern_A | 0.5 | Targetedbrowser+keyboard test, responsive Thai/English and light/dark/satellite; fix actual failures. |
| FT-06 | intern_B | 0.5 | Targetedsourceparity and permission checks, updateLOI evidence matrix for workactuallyprovided; devreview/deploy handoff. |

รับ scope ที่จำกัดชัด: read-only Officer pilot ใช้ processeddata/pluginเดิม, bind0.9.7 เฉพาะ surface ที่แตะ, ต่อ dataset ที่ขาดเป็น moduleเล็ก, และ QA flow สำคัญ รายการ doneWhen/touchfiles ต่อ task อยู่ใน [machine contract](platform-layout-handoff.json) ไม่รวม DEM ของอีกทีม, แบบจำลอง/แจ้งเตือนน้ำท่วม, tax system-of-record, รับรองแนวเขต, auth/chatใหม่ หรือ migrationทุกหน้า

ตรวจ `pnpm qc:type`, `pnpm qc:lint` และ Playwright deeplink flow ที่เกี่ยวข้อง พร้อม browser TH/EN light/dark/satellite390/1280, 200%zoom, keyboard/reducedmotion/tilefailure ตรวจ tenantและ export ที่ server จริง: anonymous/citizen/องค์กรอื่นต้องอ่าน restricted data ไม่ได้ ความพร้อม5MDไม่แทนใบตรวจรับ LOI; dashboard/GIS/ตำแหน่งครัวเรือนและกลุ่มเปราะบาง/ความเสี่ยงและรายงาน/การอบรมต้องติดตาม evidence ตาม commitment ที่ลงนามและไม่ลดลงตาม prototype

## ขอบเขตผลตรวจ

Audit นี้ยืนยัน source commit+currentpin hashes, paths/componentbehaviorที่อ่าน, และ exactwelcomeassetbytes/XML/noexternalrefs/localrasterreview ไม่มีการแก้ repository production หรือรัน build/e2e ของ repository งาน browser/render/deploy revision1.3 เป็นของ root และต้องอ้าง receipt ของ1.3จริง ไม่ยกผล1.1/1.2มาเป็นผลตรวจ buildใหม่

ข้อมูลพิกัด/attributesที่เผยแพร่ตามคำสั่งเจ้าของต้องแยกจากการรับรอง open-data license ของเทศบาล ยังคง role/tenant gate เมื่อขึ้น Officer จริง ไม่แนบข้อมูลบุคคล/รายการบ้าน/แปลง/กล้องไปบริการค้น/AIโดยอัตโนมัติ และไม่มีข้ออ้างว่าระบบได้บันทึก/รับเรื่อง/มอบหมายโดยไม่มี authoritative receipt

ฐาน normative ที่อ่านร่วมกัน: LDS0.9.7 SHA `d3085cbc0a50195f1cbf0c77b1d77c0d19b84364daf2948eb367348d65432d96` และ CityChatAdd-on0.9.2 SHA `345ef4054d7a646a73a8b369549c58c8b11d3190e39de5aa0f59704d6a3223ad` กฎที่ใช้ตรงงาน: LDS LOGO-01/FAVICON-01/TYPE-01/ICON-01/LAYOUT-01/MEDIA-01/MAP-01/EVID-05 และ Add-on§1–2,§4–7 ไม่คืน oldpalette/CC-EX-01loopเป็น authorityใหม่
