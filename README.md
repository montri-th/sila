---
artifact_id: sila-citymeter-officer-prototype-20261005
artifact_revision: "1.2"
updated_on: "2026-10-06"
product: CityChat / Officer CityMETER
municipality: เทศบาลเมืองศิลา
source_received_on: "2026-10-05"
source_folder_count: 14
source_component_count: 251
catalog_dataset_count: 16
additional_view: area_overview
release_mode: owner_authorized_static_prototype
publish_repository: montri-th/sila
lds_release: v0.9.7-owner.1
lds_color_set: color-srgb-10
citychat_addon: "0.9.2"
production_connected: false
authentication_connected: false
municipal_writes: false
---

# ศิลา · CityChat CityMETER สำหรับเจ้าหน้าที่

เว็บต้นแบบนี้นำข้อมูลจริงจากทุกโฟลเดอร์ที่ได้รับมาแยกเป็น 16 dataset และภาพรวม ให้เลือกขอบเขตเทศบาล หมู่บ้าน หรือเขตเลือกตั้ง แล้วดูรายการในพื้นที่ตามแนวทาง drilldown ของ Yolk ผู้ใช้อนุญาตให้เผยแพร่ต้นแบบที่ [montri-th/sila](https://github.com/montri-th/sila) แล้ว สถานะการเผยแพร่และ hash ของ build ให้ยึด release receipt ที่จัดทำพร้อมการส่งมอบ

Revision 1.2 แก้ datum operation ของหมุดบ้าน ขอบเขตเทศบาล และสาธารณูปการตามพิกัดอ้างอิงที่มีในไฟล์ต้นทาง เพิ่มรูปแปลง 40,367 รายการ และคำนวณจำนวนต่อขอบเขตใหม่จาก geometry จริง สถานะ CRS ของแปลงเป็น `inferred_control_validated`; PRJ ต้นทางยังระบุ `UNKNOWN` และยังไม่มีการรับรองพิกัดภาคสนามหรือขอบเขตทางกฎหมาย ดูหลักฐานและข้อจำกัดด้านล่าง

Revision 1.2 เริ่มต้นที่รูปอาคาร ใช้ OpenFreeMap แบบ vector ตามธีม แก้การคลิกหมู่บ้านและอาคารด้วย geometry จริง มีรายการให้เลือกเมื่อรูปซ้อนหรืออยู่ใกล้กัน หมุดบ้านรวมเป็นกลุ่มตามซูมและเปิดสมาชิกได้ เพิ่มเมนูค้นต้นทาง/เตรียมคำถามเพื่อวางโครงการ และ favicon แบบ ICO/PNG/SVG ตรวจ browser ตาม coverage ใน [receipt 1.2](qa/revision-1.2-browser-checks.json) แล้ว ส่วน Esri/OSM และภาพทดสอบ 1.1 เป็นหลักฐานของรุ่นก่อน

ต้นแบบยังไม่ได้เชื่อมบัญชี Officer, ฐานข้อมูล CityChat, ระบบรับเรื่อง, การอนุมัติโครงการ หรือทะเบียนภาษี จึงไม่มีการเขียนข้อมูลกลับไปยังระบบงานเทศบาล

## เปิดในเครื่อง

เปิด terminal ในโฟลเดอร์นี้แล้วเรียก:

```sh
python3 server.py
```

เปิด [http://127.0.0.1:8768/](http://127.0.0.1:8768/) ตัว server เปิดเฉพาะ loopback และ serve เฉพาะไฟล์ต้นแบบ, `assets/`, `vendor/`, `data/` และ `reference/` ไม่ serve scripts หรือ raw GIS companions ต้องเปิดผ่าน HTTP เพื่อโหลด GeoJSON และ JavaScript modules; เปลี่ยน port ได้ด้วย `python3 server.py --port 8769`

## วิธีตรวจข้อมูล

1. เปิด **ชุดข้อมูล** แล้วเลือก dataset; **ภาพรวม** เป็นมุมมองเพิ่มนอกบัญชี 16 dataset
2. เลือกชนิดขอบเขต **เทศบาล / หมู่บ้าน / เขตเลือกตั้ง** ครั้งละหนึ่งชนิด การเปลี่ยนชนิดจะกลับสู่เทศบาลและล้างรายการที่เลือก
3. คลิกพื้นที่บนแผนที่หรือในรายการเพื่อ drilldown; เลือกหนึ่งรายการเพื่อเปิดรายละเอียด ใช้ breadcrumb หรือ **ย้อนกลับ** กลับพื้นที่ระดับบน
4. เปลี่ยน dataset ในขอบเขตเดิม หรือเปิด **ซ้อนชั้นข้อมูล** เพื่อประกอบกับถนน ลำห้วย และรูปอาคาร
5. เปิด **แหล่งข้อมูล** เพื่อดูที่มา ความหมายของจำนวน CRS และข้อจำกัด; dataset GIS รองรับค้นหาและดาวน์โหลด CSV ของรายการที่กรองในขอบเขตปัจจุบัน

URL เก็บ dataset, ประเภทขอบเขต, พื้นที่, ภาษา, ธีม และรายการที่เลือก การเลื่อนหรือซูมแผนที่อย่างเดียวไม่เปลี่ยนขอบเขตคำนวณ การเลือกรายการเดียวไม่เปลี่ยนตัวเลขภาพรวม ขอบเขตและข้อมูลหลักยังใช้ได้เมื่อ tile ภายนอกโหลดไม่ได้; เลือก **เฉพาะข้อมูลพื้นที่** เพื่อปิด basemap

อ้างอิง Yolk 1.7.5 / workspace-map 1.7 / map-boundary-appearance 1.7.4: แผนที่อยู่ต่อเนื่อง, dataset คงเดิมเมื่อเข้า/ออกพื้นที่, แยก hover / พื้นที่ / รายการ, ใช้ขอบเขตจริงและไม่ลงสีเต็มในพื้นที่ที่เลือก ลำดับสำหรับศิลาคือ **เทศบาล → หมู่บ้านหรือเขตเลือกตั้ง → รายการ** ไม่เดาว่าหมู่บ้านอยู่ในเขตเลือกตั้งใด ดูสัญญาพฤติกรรมของศิลาที่ [drilldown contract](reference/drilldown-contract.json)

## จำนวนและความหมาย

จำนวนต้นทางต่างจากจำนวนรูปที่วางได้ และจำนวนในขอบเขตเทศบาล ตารางนี้แสดงทั้งสามจำนวนตาม data build ของ 1.2 จำนวนในเทศบาลคำนวณด้วยการตัดกันของ geometry จริง รายการที่ตัดหลายพื้นที่อาจปรากฏมากกว่าหนึ่งพื้นที่ จึงไม่บวกยอดย่อยเป็นยอดเทศบาลโดยอัตโนมัติ เครื่องหมาย — หมายถึงไม่ได้คำนวณจำนวนรายการ GIS สำหรับชุดนั้น

| Dataset ID | ชุดข้อมูล | ต้นทาง | วางได้ | ในเทศบาล | ข้อจำกัดหลัก |
|---|---|---:|---:|---:|---|
| `houses` | บ้านเลขที่ | 28,783 | 28,783 | 28,262 | หมุดต้นทาง ไม่ใช่ทะเบียนครัวเรือนที่รับรองครบ |
| `buildings` | รูปอาคาร | 38,849 | 38,847 | 38,794 | ไม่มีความสูง เจ้าของ หรือข้อมูลภาษี |
| `roads` | ถนนขึ้นทะเบียน | 713 | 713 | 713 | ช่วงเส้นถนน ไม่ใช่จำนวนสายหรือถนนทั้งหมด |
| `cctv` | กล้อง CCTV | 51 | 50 | 48 | ตำแหน่ง ไม่ยืนยันสถานะออนไลน์ |
| `education` | สถานศึกษา | 20 | 20 | 20 | ตามไฟล์ที่ได้รับ |
| `health` | สถานพยาบาล | 4 | 4 | 4 | ตามไฟล์ที่ได้รับ |
| `religion` | ศาสนสถาน | 24 | 24 | 23 | ตามไฟล์ที่ได้รับ |
| `publicfacilities` | สาธารณูปการ | 100 | 100 | 96 | รูปพื้นที่/สถานที่ต้นทาง |
| `waterways` | ลำห้วยและแหล่งน้ำ | 110 | 110 | 108 | KML ไม่ใช่พื้นที่น้ำท่วมหรือระดับน้ำ |
| `population` | ประชากรรายหมู่บ้าน | 28 ระเบียน | 28 หมู่บ้าน | — | DBF ปี 2569 ต้องสอบทานค่าหมู่ 11 |
| `villages` | ขอบเขตหมู่บ้าน | 29 รูป | 28 พื้นที่ | — | รวมรูปของหมู่เดียวกันเพื่อแสดงผล |
| `municipality` | ขอบเขตเทศบาล | 1 | 1 | — | ไม่รับรองขอบเขตทางกฎหมาย |
| `election` | เขตเลือกตั้ง | 5 เส้น | 3 พื้นที่ | — | polygon ที่ประกอบเพื่อแสดงผล |
| `parcels` | แปลงที่ดิน / ภาษี | 40,368 | 40,367 | 40,224 | CRS ที่อนุมานและตรวจด้วยข้อมูลอ้างอิง; แยก 1 รูปเสื่อมสภาพ |
| `flood` | น้ำท่วม / แผนแก้ไข | 16 จุดเอกสาร | ไม่มี GIS จุด | — | แผนเดิม พ.ศ. 2564–2567 |
| `terrain` | 3D DEM | ยังไม่ได้รับ | ยังไม่วาง | — | อีกทีมกำลังจัดทำ dataset |

14 โฟลเดอร์มี 251 ไฟล์ประกอบ รวม sidecars, metadata, backups และเอกสาร ไม่ใช่ 251 dataset ดู [catalog](data/catalog.json) และ [source manifest](data/source-manifest.json) เอกสารต้นฉบับอ้างอิง Drive และผลอ่านเดิม ไม่ได้คัดลอก PDF/DOCX ทุกไฟล์มาเผยแพร่ผ่านเว็บ

## ข้อจำกัดในการใช้ตัดสินใจ

- **ประชากร:** รวมตามต้นทาง 55,838 คน; ชาย 26,791 + หญิง 28,447 = 55,238 ต่างกัน 600 คนที่หมู่ 11 ต้นแบบคงค่าต้นทางพร้อมข้อสังเกต ไม่เลือกเป็นค่าทางการ ประชากรระดับเขตเลือกตั้งเป็น `null` สเกลสีใช้จำนวนคนต่อหมู่บ้าน ไม่ใช่ความหนาแน่น วันรับไฟล์ไม่ใช่วันอ้างอิงประชากร
- **แปลงและภาษี:** รูปจากชุดเดิมที่ได้รับแสดงได้ 40,367 จาก 40,368 รายการด้วย CRS สำหรับแสดงผลที่อนุมานและตรวจด้วยหลักฐาน เก็บ PRJ ต้นทาง `UNKNOWN` ไว้ใน provenance; ยังไม่ได้รับการยืนยัน CRS จากเจ้าของข้อมูล แยก source record 38,721 ซึ่งเสื่อมสภาพจนไม่มีพื้นที่ออกจากแผนที่ และซ่อม topology สำหรับแสดงผล 48 รูป ไม่ส่งออกรหัสโฉนด รหัสแปลง เจ้าของ หรือทะเบียนภาษี การตรวจ attributes เดิมพบรหัสว่าง 77 รายการ, รหัสซ้ำ 47 กลุ่ม และค่าพื้นที่อ่านไม่ได้ 5,453 รายการ; ค่านี้ไม่ใช่ผลตรวจทะเบียนภาษี ไม่มีข้อมูลรูปแปลงชุดใหม่เพิ่มในการแก้ครั้งนี้ ความครอบคลุมทะเบียนภาษีเป็น `null` เพราะไม่มีทะเบียนอ้างอิงและตัวหาร
- **น้ำท่วม:** ทั้ง 16 จุดไม่มี geometry ที่ยืนยัน จึงแสดงเป็นเอกสารโดยไม่เดาพิกัดหรือกรองพื้นที่ มีประมาณการไม่ขัดกัน 9 จุด รวมบางส่วน 46,836,600 บาทในแผนเดิม ไม่ใช่งบอนุมัติปัจจุบัน จุด 12 มีงบสองค่าขัดกัน พื้นที่น้ำท่วมปัจจุบันเป็น `no_data` ไม่ใช่ 0% หรือหลักฐานว่าไม่มีน้ำท่วม
- **DEM:** อีกทีมศึกษา GLO-30 กับ FABDEM และเตรียม dataset ใน CityMETER งานนี้ไม่มี DEM, ผลเลือก source, แบบจำลองหรือคำเตือนน้ำท่วม และไม่รวมงาน DEM ในแผน 5 MD
- **ขอบเขต/พิกัด:** รูปบ้าน เทศบาล และสาธารณูปการที่ PRJ ประกาศ Indian 1975 / UTM 48N เปลี่ยนมาใช้ registered datum operation (2) ตามการเทียบพิกัดในข้อมูลต้นทาง แปลงใช้ projection เดียวกันในฐานะการอนุมานเพื่อแสดงผล รูปที่ซ่อมมีสถานะกำกับ เขตเลือกตั้งประกอบจากเส้นต้นทางเป็น 3 polygon เพื่อแสดงผล ไม่ใช่ขอบเขตทางการที่ตรวจรับ การแปลงพิกัดและการตรงกันของข้อมูลต้นทางไม่ยืนยันความแม่นยำภาคสนาม

## การแก้ข้อมูล revision 1.2

ตรวจหมุดบ้านกับช่อง `Lat_long` ใน DBF ต้นทาง 28,594 คู่ พบว่า operation (4) ที่เลือกอัตโนมัติคลาดจากพิกัดในไฟล์ค่ามัธยฐาน 189.06 เมตร ส่วน operation (2) ต่างกันค่ามัธยฐาน 0.00314 เมตร มี 28,339 คู่ภายใน 1 เมตร และ 255 คู่เกิน 1 เมตร ค่าสูงสุด 53.83 เมตร นี่เป็นการตรวจความสอดคล้องของข้อมูลสองช่องในชุดต้นทาง ค่าความแม่นยำที่กำกับ operation (2) คือ 5 เมตร และยังไม่มีจุดสำรวจอิสระที่รับรองความแม่นยำภาคสนาม

รูปแปลงมี PRJ `UNKNOWN` จึงตรวจ projection family เพิ่มกับรูปอาคาร WGS84 38,847 รูป โดยกัน 12,949 รูปไว้ทดสอบตามลำดับต้นทาง modulo 3 รูปอาคารอ้างอิงในกลุ่มนี้อยู่ในรูปแปลงหลังใช้ operation (2) 11,621 รูป หรือ 89.74%; operation (4) ได้ 78.12% และ WGS84 / UTM 48N ได้ 75.93% Operation (3) อยู่ใกล้ (2) จึงใช้พิกัดตัวเลขของบ้านเป็นหลักเลือก (2) ไม่มีการปรับเลื่อนรูปด้วยค่าที่ fit เพิ่ม การทดสอบนี้รองรับตำแหน่งสำหรับแสดงผล แต่ไม่สร้างความสัมพันธ์เจ้าของ/บ้าน/แปลงหรือรับรองแนวเขต

Pipeline ที่รันจริงคืออ่าน source geometry และ PRJ, เทียบพิกัดบ้าน, ตรวจ projection ของแปลงด้วยรูปอาคารที่ได้รับ, แปลงเป็น WGS84, ซ่อมเฉพาะ geometry สำหรับแสดงผล, แยกรูปไม่มีพื้นที่, แล้วคำนวณสมาชิกเทศบาล/หมู่บ้าน/เขตเลือกตั้งด้วย geometry intersections ใหม่ มี GeoJSON ปัจจุบัน **14 ไฟล์** หลักฐาน [CRS repair](qa/crs-repair-evidence.json) เก็บ source hashes, ผลทดสอบ, before/after SHA-256 และรายการที่แยกออก; [data validation](data/data-validation.json) เก็บจำนวนและผลตรวจที่ตรงกับ build นี้

```json
{
  "schemaVersion": "sila-revision-change-notes-1",
  "revision": "1.2",
  "dataValidationStatus": "passed",
  "uiValidationStatus": "passed_bounded_browser_spot_checks",
  "affectedExistingGeometryLayers": ["houses", "municipality", "publicfacilities"],
  "selectedDisplayCRS": "EPSG:24048",
  "selectedDatumOperation": "Indian 1975 to WGS 84 (2)",
  "operationAccuracyMetadataM": 5,
  "fieldPositionAccuracyVerified": false,
  "legalBoundaryVerified": false,
  "houseCoordinateControls": {
    "count": 28594,
    "medianResidualM": 0.0031382749437613823,
    "within1M": 28339,
    "above1M": 255
  },
  "parcels": {
    "sourceRecords": 40368,
    "mappedRecords": 40367,
    "insideMunicipality": 40224,
    "displayRepairCount": 48,
    "quarantinedRecords": 1,
    "sourceCRS": "UNKNOWN",
    "displayCRSStatus": "inferred_control_validated",
    "formalSourceCRSConfirmed": false,
    "cadastralOwnerTaxIdentifiersExported": false
  },
  "insideMunicipalityCounts": {
    "houses": 28262,
    "buildings": 38794,
    "roads": 713,
    "cctv": 48,
    "education": 20,
    "health": 4,
    "religion": 23,
    "publicfacilities": 96,
    "waterways": 108,
    "parcels": 40224
  },
  "geojsonFileCount": 14,
  "membershipMethod": "actual_geometry_intersections",
  "converter": "tools/repair-crs.py",
  "sourceManifest": "data/source-manifest.json",
  "sourceAndBeforeAfterHashEvidence": "qa/crs-repair-evidence.json",
  "validation": "data/data-validation.json",
  "historicalUiEvidence": "qa/revision-1.1-browser-checks.json",
  "currentFloodAreaPercent": null,
  "taxCoveragePercent": null,
  "authenticationConnected": false,
  "municipalWrites": false
}
```

## ไฟล์สำหรับพัฒนาต่อ

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html`, `styles.css`, `app.js` | map workspace, dataset/scope/record state, TH/EN, theme, URL/history, CSV |
| `server.py` | preview แบบ loopback |
| `data/catalog.json`, `metadata.json`, `*.geojson` | บัญชี dataset, จำนวนต่อขอบเขต, รูป WGS84 และ quality flags |
| `reference/document-catalog.json` | เอกสาร 16 จุด พร้อม source/page/งบและความขัดกัน |
| `reference/design-tokens.json` | ค่าจริง LDS 0.9.7 + CityChat Add-on 0.9.2 และ identity receipt reference |
| `assets/brand/manifest.json`, `INTEGRATION.md` | exact asset hashes, สิทธิ์ใช้สำหรับ artifact นี้, motion/fallback |
| `tools/repair-crs.py`, `tools/README.md` | converter ที่รับ input paths ชัดเจน; วิธีรันและขอบเขตตรวจพิกัด |
| `qa/crs-repair-evidence.json`, `data/source-manifest.json`, `data/data-validation.json` | source hashes, before/after hashes และจำนวนของ data build 1.2 |
| `tools/verify-live.py`, `tools/validation-config.json` | เทียบทุก runtime file บนเว็บเผยแพร่กับ bytes/hash/MIME ใน build manifest |
| `qa/`, `screenshots/` | ผลตรวจและภาพตาม coverage ที่บันทึก |

ชุดเผยแพร่รวม converter และเครื่องมือตรวจ release ที่ระบุด้านบน แต่ไม่รวม raw ingestion packages, Python dependencies, raw-extra, cache, raw SHP/DBF/SHX/PRJ/CPG, authentication caches หรือเอกสารสัญญา/ใบแจ้งหนี้ที่ไม่เกี่ยวกับเว็บ Source hashes และ Drive links ใช้สืบกลับต้นทาง; ชื่อ `source-audit-reference/` ใน provenance ของเอกสารเป็นรหัสอ้างอิงผลตรวจเดิม ไม่ใช่ไฟล์ runtime ที่รวมมา โหลด GeoJSON ชั้นใหญ่เมื่อเลือก dataset; production ควรเปลี่ยนเป็น API/vector tiles และใช้ Officer entitlement/tenant ของ `theshifters/landometer-citychat` ที่มีจริง

## Identity, สิทธิ์ และผลตรวจ

ใช้ LDS 0.9.7 (`v0.9.7-owner.1`, `color-srgb-10`) คู่ CityChat Add-on 0.9.2 โดยคง analytical HEX เดียวกันทั้งธีม ฟอนต์และ asset อยู่ใน bundle; ไม่มี decorative bracket หรือ colored left rail ผล [package verifier](reference/lds-package-verifier.json) ผ่าน 9,768 checks และเก็บ warnings เป็นการตรวจ package integrity ไม่ใช่การรับรองเว็บทั้งหมด

โลโก้ใหม่ใช้ exact rounded-balloon composition จาก CityChat commit `02bf0a94caec0adbf4cfba170cd9e4bad4cd8b6d` ตามคำขอเจ้าของสำหรับ Sila header และการเผยแพร่ครั้งนี้ Motion เล่นครั้งเดียวต่อ page load และมี static composition สำหรับ reduced motion, no JavaScript และ load failure โลโก้ทั้งสี่องค์ประกอบและ motion ต้นฉบับสองไฟล์เก็บ bytes เดิม; adapter เพิ่มเฉพาะ layout/controller Favicon เป็น PNG ต้นฉบับพร้อม receipt สำหรับ browser tab ไม่อ้างสิทธิ์ touch/maskable/social หรือชุด icon ครบทุกขนาด ไม่เปลี่ยนสถานะโลโก้ใน DS กลาง

ข้อมูลส่งออกไม่มีชื่อเจ้าของ เลขประจำตัวผู้เสียภาษี โทรศัพท์ หรือ CCTV stream แต่มีบ้านเลขที่พร้อมตำแหน่ง รูปอาคาร และตำแหน่ง CCTV ตาม dataset ที่ผู้ใช้ให้เผยแพร่ การแก้แปลงตามคำขอเผยแพร่เฉพาะรูปและลำดับรายการต้นทาง ไม่รวมรหัสโฉนด รหัสแปลง เจ้าของ หรือข้อมูลภาษี การมีสิทธิ์อ่าน Drive และคำสั่งเผยแพร่ไม่ได้พิสูจน์ว่าเทศบาลออก open-data license; ไม่ติดป้ายข้อมูลเทศบาลว่า open licensed

ผลตรวจ data build 1.2 อยู่ใน [data validation](data/data-validation.json) และ [CRS repair evidence](qa/crs-repair-evidence.json) ส่วน [revision 1.1 browser receipt](qa/revision-1.1-browser-checks.json), ภาพ 1.1 และ publication audit เดิมเป็น **หลักฐานย้อนหลังของ revision 1.1** จำนวน 13 GeoJSON และผล UI ใน receipt เก่าไม่ใช่ผลตรวจ build ปัจจุบัน Coverage ของ 1.1 คือ:

- ไทย light/dark ที่ 1280 × 720 และไทย light / อังกฤษ dark ที่ 390 × 844 รวมรายการด้านล่าง ไม่พบ horizontal overflow ในกรณีที่ตรวจ
- รูปขอบเขตแสดง 1 / 28 / 3 ตามชนิดที่เลือก พร้อม mask หนึ่งรูป; Enter ที่หมู่ 2 แสดงบ้าน 3,907 และอาคาร 4,631 ในข้อมูลรุ่นเดิม จำนวนบ้านหมู่ 2 หลังแก้ datum ใน 1.2 เป็น 3,801 ส่วนรูปอาคารยัง 4,631
- เห็นถนน/label จาก native Esri dark tiles จริง ใช้ tile 256 px / EPSG:3857 โดยไม่ใช้ CSS filter
- เห็น logo เปลี่ยนจาก animating เป็น complete; เปลี่ยน theme แล้วไม่เล่นซ้ำ ทั้งสาม LDS static scans ผ่านตาม scope ที่ระบุ

Revision 1.2 ตรวจ desktop 1280×720 และจอแคบ 390×844 ภาษาไทย/อังกฤษ ธีมมืด/สว่าง รวมส่วนแปลง รายการ และเมนูตามบริบทแล้ว ไม่พบ horizontal overflow หรือ browser error ในรอบที่ตรวจ ดู [receipt](qa/revision-1.2-browser-checks.json) Static LDS checks ของ index ที่รวม CSS, app และ styles ผ่านในขอบเขต checker; ไม่อ้าง full conformance Reduced-motion fallback รุ่นเดิมตรวจจาก source ยังไม่ได้สลับ OS preference; ยังไม่ได้ตรวจ native devices, Thai text 130%, zoom 200% หรือจำลอง slow network ไม่อ้าง exhaustive accessibility หรือการทดสอบระบบสิทธิ์/การเขียน production ผลเทียบ bytes บนเว็บเผยแพร่ให้ยึด release receipt ที่จัดทำสำหรับ revision นี้

## งานตามบริบทและการคลิก revision 1.2

เปิด **ค้นข้อมูลเพิ่มเพื่อวางโครงการ** เพื่อแก้คำค้นก่อนเปิด Google หรือเตรียมคำถามสำหรับ Google AI แล้ววางเองในเครื่องมือภายนอก ข้อความเริ่มต้นใช้ชื่อพื้นที่ dataset และงานที่เกี่ยวข้อง ไม่แนบรายการบ้าน พิกัด รายการแปลง หรือไฟล์เทศบาลโดยอัตโนมัติ `CONTEXT-01`, `IMPL-SEARCH-EXT-01`, `IMPL-AI-EXT-01` เป็น patterns ที่เจ้าของเลือกจากเอกสารประวัติ การใช้ครั้งนี้เป็น contract ของ artifact ที่เข้ากันกับ LDS 0.9.7 / CityChat 0.9.2 ไม่เปลี่ยน pin ฐานปัจจุบัน ดู [contract](reference/context-actions-contract.json) และ [source lineage](reference/context-actions-notes.md)

เมื่อยังอยู่ระดับเทศบาลและเลือกขอบเขตหมู่บ้าน/เขตเลือกตั้ง การคลิกแผนที่รวมถึงกลุ่มหมุดจะเลือกพื้นที่ก่อน ภายในพื้นที่หรือเมื่อเลือกขอบเขตเทศบาลอย่างเดียว การคลิกจะเลือกรายการ อาศัย polygon จริงรวมรูภายในและขอบเส้น; ถ้าไม่มี hit ตรง จะค้นขอบ/จุดใกล้เคียงในระยะ 12 px หรือ 22 px สำหรับ coarse pointer หลาย hit เปิดรายการเรียงตามระยะและ source ID ให้เลือก ไม่ตัดสินจากลำดับการวาด Canvas สมาชิกทั้งหมดเข้าถึงได้ผ่านปุ่มแสดงเพิ่มและปุ่มซูมดูบริเวณนี้

การตรวจเว็บจริงพบว่า Canvas ของเส้นเน้นรายการที่เลือกค้างอยู่หลังเปลี่ยน dataset และบังปุ่มกลุ่มบ้าน จึงกำหนดให้ pane `selected` ไม่รับ pointer event และให้ปุ่มกลุ่มบ้านอยู่เหนือ Canvas ด้วย z-index คงที่ ตรวจซ้ำหลังเลือกแปลง → เปลี่ยนเป็นบ้าน: กลุ่ม 126 เปิดสมาชิก 126 รายการได้ด้วยเมาส์และ Enter รวมถึงหลังเลือกบ้านแล้วปิดรายละเอียด กลุ่มใกล้ขอบบน 10 หมุดเปิดได้ครบหลังเปลี่ยนธีม ดูผลเพิ่มใน `interactionRegression` ของ receipt 1.2; การเลื่อนระยะไกลและอุปกรณ์สัมผัสจริงยังไม่ได้ทดสอบ

หมุดบ้านใช้ grid คงที่ใน world coordinates เพื่อลดการเปลี่ยนกลุ่มเมื่อ pan ตัวเลขคือรายการหมุดต้นทาง ไม่ใช่จำนวนครัวเรือนหรือระดับความเสี่ยง จุดเดี่ยวคงพิกัดเดิม มีขอบกลางช่วยอ่านทั้งสองธีม แผนที่พื้นหลังใช้ [OpenFreeMap](https://openfreemap.org/quick_start/) ผ่าน MapLibre/Leaflet bridge; หาก WebGL/provider ใช้ไม่ได้จึงแสดง OpenStreetMap raster พร้อมข้อความกำกับ ไม่มี SLA ของ municipal data หรือ provider ถูกสมมติขึ้น
