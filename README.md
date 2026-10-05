---
artifact_id: sila-citymeter-officer-prototype-20261005
artifact_revision: "1.1"
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

Revision 1.1 ใช้โลโก้ CityChat animated แบบบอลลูนมุมมนที่ผู้ใช้เลือก เก็บองค์ประกอบและ motion ต้นฉบับครบทั้ง rendition สว่าง/มืด แผนที่เริ่มจากขอบเขตเทศบาลครั้งละหนึ่งชนิด ใช้ Esri World Dark Gray Base + Reference ในธีมมืด และ OSM standard ในธีมสว่าง พื้นที่นอก **polygon เทศบาลจริง** ถูกคลุมด้วย mask โปร่งแสง opacity 0.78 โดยยังเห็นบริบทภายนอก

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

จำนวนต้นทางต่างจากจำนวนรูปที่วางได้ และจำนวนในขอบเขตที่เลือก ตารางนี้แสดงสองจำนวนแรก รายการที่ตัดหลายพื้นที่อาจปรากฏมากกว่าหนึ่งพื้นที่ จึงไม่บวกยอดย่อยเป็นยอดเทศบาลโดยอัตโนมัติ

| Dataset ID | ชุดข้อมูล | ต้นทาง | วางได้ | ข้อจำกัดหลัก |
|---|---|---:|---:|---|
| `houses` | บ้านเลขที่ | 28,783 | 28,783 | หมุดต้นทาง ไม่ใช่ทะเบียนครัวเรือนที่รับรองครบ |
| `buildings` | รูปอาคาร | 38,849 | 38,847 | ไม่มีความสูง เจ้าของ หรือข้อมูลภาษี |
| `roads` | ถนนขึ้นทะเบียน | 713 | 713 | ช่วงเส้นถนน ไม่ใช่จำนวนสายหรือถนนทั้งหมด |
| `cctv` | กล้อง CCTV | 51 | 50 | ตำแหน่ง ไม่ยืนยันสถานะออนไลน์ |
| `education` | สถานศึกษา | 20 | 20 | ตามไฟล์ที่ได้รับ |
| `health` | สถานพยาบาล | 4 | 4 | ตามไฟล์ที่ได้รับ |
| `religion` | ศาสนสถาน | 24 | 24 | ตามไฟล์ที่ได้รับ |
| `publicfacilities` | สาธารณูปการ | 100 | 100 | รูปพื้นที่/สถานที่ต้นทาง |
| `waterways` | ลำห้วยและแหล่งน้ำ | 110 | 110 | KML ไม่ใช่พื้นที่น้ำท่วมหรือระดับน้ำ |
| `population` | ประชากรรายหมู่บ้าน | 28 | 28 หมู่บ้าน | DBF ปี 2569 ต้องสอบทานค่าหมู่ 11 |
| `villages` | ขอบเขตหมู่บ้าน | 29 รูป | 28 พื้นที่ | รวมรูปของหมู่เดียวกันเพื่อแสดงผล |
| `municipality` | ขอบเขตเทศบาล | 1 | 1 | ไม่รับรองขอบเขตทางกฎหมาย |
| `election` | เขตเลือกตั้ง | 5 เส้น | 3 พื้นที่ | polygon ที่ประกอบเพื่อแสดงผล |
| `parcels` | แปลงที่ดิน / ภาษี | 40,368 | ยังไม่วาง | CRS UNKNOWN; ไม่มีทะเบียนภาษีอ้างอิง |
| `flood` | น้ำท่วม / แผนแก้ไข | 16 จุดเอกสาร | ไม่มี GIS จุด | แผนเดิม พ.ศ. 2564–2567 |
| `terrain` | 3D DEM | ยังไม่ได้รับ | ยังไม่วาง | อีกทีมกำลังจัดทำ dataset |

14 โฟลเดอร์มี 251 ไฟล์ประกอบ รวม sidecars, metadata, backups และเอกสาร ไม่ใช่ 251 dataset ดู [catalog](data/catalog.json) และ [source manifest](data/source-manifest.json) เอกสารต้นฉบับอ้างอิง Drive และผลอ่านเดิม ไม่ได้คัดลอก PDF/DOCX ทุกไฟล์มาเผยแพร่ผ่านเว็บ

## ข้อจำกัดในการใช้ตัดสินใจ

- **ประชากร:** รวมตามต้นทาง 55,838 คน; ชาย 26,791 + หญิง 28,447 = 55,238 ต่างกัน 600 คนที่หมู่ 11 ต้นแบบคงค่าต้นทางพร้อมข้อสังเกต ไม่เลือกเป็นค่าทางการ ประชากรระดับเขตเลือกตั้งเป็น `null` สเกลสีใช้จำนวนคนต่อหมู่บ้าน ไม่ใช่ความหนาแน่น วันรับไฟล์ไม่ใช่วันอ้างอิงประชากร
- **แปลงและภาษี:** PRJ ระบุ UNKNOWN จึงไม่เดาตำแหน่งแปลง รหัสว่าง 77 รายการ, รหัสซ้ำ 47 กลุ่ม, ค่าพื้นที่อ่านไม่ได้ 5,453 รายการ ข้อมูลรูปแปลงโฉนดชุดใหม่ยังไม่รวม ความครอบคลุมทะเบียนภาษีเป็น `null` เพราะยังไม่มีทะเบียนอ้างอิงและตัวหาร
- **น้ำท่วม:** ทั้ง 16 จุดไม่มี geometry ที่ยืนยัน จึงแสดงเป็นเอกสารโดยไม่เดาพิกัดหรือกรองพื้นที่ มีประมาณการไม่ขัดกัน 9 จุด รวมบางส่วน 46,836,600 บาทในแผนเดิม ไม่ใช่งบอนุมัติปัจจุบัน จุด 12 มีงบสองค่าขัดกัน พื้นที่น้ำท่วมปัจจุบันเป็น `no_data` ไม่ใช่ 0% หรือหลักฐานว่าไม่มีน้ำท่วม
- **DEM:** อีกทีมศึกษา GLO-30 กับ FABDEM และเตรียม dataset ใน CityMETER งานนี้ไม่มี DEM, ผลเลือก source, แบบจำลองหรือคำเตือนน้ำท่วม และไม่รวมงาน DEM ในแผน 5 MD
- **ขอบเขต/พิกัด:** แปลง CRS ตาม PRJ เป็น WGS84 เพื่อแสดงบนเว็บ รูปที่ซ่อมเพื่อแสดงผลมีสถานะกำกับ เขตเลือกตั้งเป็นรูปที่ประกอบจากเส้น ไม่ใช่ขอบเขตทางการที่ตรวจรับ การแปลงพิกัดไม่ยืนยันความแม่นยำภาคสนาม

## ไฟล์สำหรับพัฒนาต่อ

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html`, `styles.css`, `app.js` | map workspace, dataset/scope/record state, TH/EN, theme, URL/history, CSV |
| `server.py` | preview แบบ loopback |
| `data/catalog.json`, `metadata.json`, `*.geojson` | บัญชี dataset, จำนวนต่อขอบเขต, รูป WGS84 และ quality flags |
| `reference/document-catalog.json` | เอกสาร 16 จุด พร้อม source/page/งบและความขัดกัน |
| `reference/design-tokens.json` | ค่าจริง LDS 0.9.7 + CityChat Add-on 0.9.2 และ identity receipt reference |
| `assets/brand/manifest.json`, `INTEGRATION.md` | exact asset hashes, สิทธิ์ใช้สำหรับ artifact นี้, motion/fallback |
| `qa/`, `screenshots/` | ผลตรวจและภาพตาม coverage ที่บันทึก |

ชุดเผยแพร่ไม่รวม ingestion scripts, Python dependencies, raw-extra, cache, raw SHP/DBF/SHX/PRJ/CPG, authentication caches หรือเอกสารสัญญา/ใบแจ้งหนี้ที่ไม่เกี่ยวกับเว็บ โหลด GeoJSON ชั้นใหญ่เมื่อเลือก dataset; production ควรเปลี่ยนเป็น API/vector tiles และใช้ Officer entitlement/tenant ของ `theshifters/landometer-citychat` ที่มีจริง

## Identity, สิทธิ์ และผลตรวจ

ใช้ LDS 0.9.7 (`v0.9.7-owner.1`, `color-srgb-10`) คู่ CityChat Add-on 0.9.2 โดยคง analytical HEX เดียวกันทั้งธีม ฟอนต์และ asset อยู่ใน bundle; ไม่มี decorative bracket หรือ colored left rail ผล [package verifier](reference/lds-package-verifier.json) ผ่าน 9,768 checks และเก็บ warnings เป็นการตรวจ package integrity ไม่ใช่การรับรองเว็บทั้งหมด

โลโก้ใหม่ใช้ exact rounded-balloon composition จาก CityChat commit `02bf0a94caec0adbf4cfba170cd9e4bad4cd8b6d` ตามคำขอเจ้าของสำหรับ Sila header และการเผยแพร่ครั้งนี้ Motion เล่นครั้งเดียวต่อ page load และมี static composition สำหรับ reduced motion, no JavaScript และ load failure โลโก้ทั้งสี่องค์ประกอบและ motion ต้นฉบับสองไฟล์เก็บ bytes เดิม; adapter เพิ่มเฉพาะ layout/controller Favicon เป็น PNG ต้นฉบับพร้อม receipt สำหรับ browser tab ไม่อ้างสิทธิ์ touch/maskable/social หรือชุด icon ครบทุกขนาด ไม่เปลี่ยนสถานะโลโก้ใน DS กลาง

ข้อมูลส่งออกไม่มีชื่อเจ้าของ เลขประจำตัวผู้เสียภาษี โทรศัพท์ หรือ CCTV stream แต่มีบ้านเลขที่พร้อมตำแหน่ง รูปอาคาร และตำแหน่ง CCTV ตาม dataset ที่ผู้ใช้ให้เผยแพร่ การมีสิทธิ์อ่าน Drive และคำสั่งเผยแพร่ไม่ได้พิสูจน์ว่าเทศบาลออก open-data license; ไม่ติดป้ายข้อมูลเทศบาลว่า open licensed

ผลตรวจ data build อยู่ใน [data validation](data/data-validation.json) ส่วน [revision 1.1 browser receipt](qa/revision-1.1-browser-checks.json) บันทึกผลตรวจการปรับครั้งนี้:

- ไทย light/dark ที่ 1280 × 720 และไทย light / อังกฤษ dark ที่ 390 × 844 รวมรายการด้านล่าง ไม่พบ horizontal overflow ในกรณีที่ตรวจ
- รูปขอบเขตแสดง 1 / 28 / 3 ตามชนิดที่เลือก พร้อม mask หนึ่งรูป; Enter ที่หมู่ 2 แสดงบ้าน 3,907 และอาคาร 4,631 และเปลี่ยน dataset โดยคงขอบเขต
- เห็นถนน/label จาก native Esri dark tiles จริง ใช้ tile 256 px / EPSG:3857 โดยไม่ใช้ CSS filter
- เห็น logo เปลี่ยนจาก animating เป็น complete; เปลี่ยน theme แล้วไม่เล่นซ้ำ ทั้งสาม LDS static scans ผ่านตาม scope ที่ระบุ

Reduced-motion fallback ตรวจจาก source ยังไม่ได้สลับ OS preference; ยังไม่ได้ตรวจ native devices, Thai text 130%, zoom 200% หรือจำลอง slow network ไม่อ้าง exhaustive accessibility หรือการทดสอบระบบสิทธิ์/การเขียน production ผลเทียบ bytes บนเว็บเผยแพร่ให้ยึด release receipt ของ root
