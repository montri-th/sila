# เงาภูมิประเทศ FABDEM สำหรับศิลา

Revision1.5 · สัญญาข้อมูลที่ตรวจแล้ว ผลเผยแพร่และเว็บจริงใช้หลักฐานแยก

แสดงเงาภูมิประเทศ FABDEM V1-2 บน Leaflet เดิม ไม่แทนแผนที่ด้วย iframe ปุ่ม 3D เปิด [CityMETER อำเภอเมืองขอนแก่น4001](https://landometer.com/v3/citymeter-3d/KKN/D/4001?d=terrain) แยกแท็บ หากต้นทางเปิด source อื่นให้เลือก FABDEM ที่หน้านั้น `d=terrain` เพียงอย่างเดียวไม่ยืนยันว่าต้นทางเลือก FABDEM

ชั้นภาพแสดงเฉพาะ viewport ที่ตัดกับ district4001 และ clipตาม polygonรวมรู ข้างนอกโปร่งใสโดยคง inverted municipal mask เดิม Source alpha0คือไม่มีข้อมูล ไม่ใช้แทนความสูง0และไม่แทนด้วย AWS source อื่น Moduleโหลด tile โดยตรงจาก API CityMETER ไม่คัดลอก DEM/ภาพภูมิประเทศไปเก็บใน host ของเว็บ

ต้นทาง `FABDEM V1-2`, build `z12-20261007`, Terrarium256px, native zoom12 และ display zoomถึง22 การขยายไม่เพิ่มรายละเอียดประมาณ1arc-second(~30mที่เส้นศูนย์สูตร) วันสร้าง tile7Oct2026ไม่ใช่วันสำรวจภูมิประเทศ ฐานอ้างอิงแนวดิ่ง ความแม่นยำและวันสำรวจยังไม่ประกาศ เงาขาวดำใช้แสง315°สูง45°เพื่ออ่านรูปทรง ไม่ใช่สีระดับความสูง/ระดับน้ำ/ความเสี่ยง จึงไม่มี legendช่วงระดับเมตร

UIแสดง loading/ready/partial/error ตามการโหลดจริง เมื่อล้มเหลวขอบเขตและชุดข้อมูลอื่นยังใช้ได้ สลับ dataset/themeใช้ mapเดิม ไม่ fitกล้องใหม่เพียงเพราะเปลี่ยนชุดข้อมูล

## ข้อมูลต้นทางกับสถานะ catalog

รักษา `data/catalog.json` และ GISเดิม19ไฟล์ให้เหมือนก่อนรอบนี้ทุกbyte สถานะ terrainในไฟล์catalogเดิมเป็น historical pending เมื่อ metadataภายนอกทั้ง2ไฟล์พร้อม consumerจึง overrideเฉพาะ entryในหน่วยความจำเป็น `ready_external_dem` ไม่ใช้ค่าpendingเดิมเป็นสถานะUIปัจจุบัน ไฟล์ใหม่มี `data/terrain-source.json`, `data/terrain-coverage.geojson` และ `fabdem-layer.js` ดูรายละเอียดใน [machine contract](terrain-contract.json)

## ที่มาและสิทธิ์

[FABDEM tile manifest](https://landometer.com/api/v2/public/dem/z12-20261007/fabdem/manifest.json) · [ผู้จัดทำต้นฉบับ FABDEM V1-2](https://research-information.bris.ac.uk/en/datasets/fabdem-v1-2/) · [CC BY-NC-SA4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)

Attributionคงตามต้นทาง: FABDEM V1-2 (Hawker et al.2022, University of Bristol), CC BY-NC-SA4.0 ยังไม่มีหลักฐานยืนยันสิทธิใช้เชิงพาณิชย์เพิ่มเติม ไม่อ้างว่าเปิด APIได้เท่ากับได้รับสิทธิใหม่

## ขอบเขตการตรวจ

21deterministic fixtures ตรวจdecodeศูนย์/ค่าติดลบ/ไม่มีข้อมูล การตัดขอบเขต รู polygon/MultiPolygon และ neutralhillshade พร้อม actualChrome TH/EN/light/dark desktop/390px ใบตรวจไม่ใช่การรับรองความถูกต้องDEMทั้งอำเภอ น้ำท่วมหรือมาตรฐาน accessibilityทั้งหมด ดู [fixture receipt](../qa/revision-1.5-terrain-fixtures.json) และ [browser receipt](../qa/revision-1.5-browser-checks.json)
