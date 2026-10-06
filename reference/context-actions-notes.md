# Context actions · implementation handoff

ใช้ `context-actions.js` แบบ classic script และ `context-actions.css` หลัง styles หลัก แล้วเรียก `window.SilaContextActions.render({mount, language, datasetId, datasetLabel, scopeId, scopeLabel, municipality, sourceDate})` จาก header update ใช้ mount เดิมเพื่อรักษา focus; อย่าส่ง selected record หรือ geometry เข้า options

คำอธิบายผู้ใช้เน้นประโยชน์: **ค้นข้อมูลเพิ่มเพื่อวางโครงการ** → ค้นต้นทางใน Google หรือเตรียมคำถามให้ Google AI ช่วยจัดประเด็น แต่ละงานมี preview ที่แก้ได้ แสดง field ที่นำมาประกอบ และมีปุ่มให้เปิดอย่างชัดเจน Google AI เป็นการคัดลอกคำถามและเปิด entry ให้ผู้ใช้วางเอง ไม่ได้ต่อ AI runtime หรือ upload ไฟล์เทศบาล

Scope ที่รองรับ: `sila`, `v01–v28`, `e01–e03` (`e1–e3` รองรับด้วย) และทุก dataset ID ใน contract ไม่มี handoff รายบ้าน แปลง กล้อง หรือรายการบุคคล ค่าและ counts ไม่ถูกส่ง ไม่มี request ไป Google ก่อนผู้ใช้กด และไม่ใช้ prefetch/preconnect Provider links ใช้ new tab / noopener / noreferrer / no-referrer

LDS 0.9.7 และ CityChat Add-on 0.9.2 ที่มี SHA ตรง Project Source ยังเป็นฐานปัจจุบัน `CONTEXT-01` อยู่ใน LDS 0.9.0 §7.12; `IMPL-SEARCH-EXT-01` และ `IMPL-AI-EXT-01` อยู่ implementation notes 0.8.8, ไม่ใช่ rule IDs ใน base 0.9.7 ปัจจุบัน Migration ledger 0.9.1 ระบุว่า CONTEXT-01 ถูกแทนด้วย LAYER-01 / EVIDENCE-01 งานนี้เป็น behavior ที่เจ้าของเลือกสำหรับ artifact นี้ ใช้ CTA-01, CTRL-01, A11Y-01 และ evidence boundary ปัจจุบัน ไม่มีการย้อนนำ tokens รุ่นเก่า หรือแก้ DS กลาง

[Google Search Help](https://support.google.com/websearch/answer/16011537?co=GENIE.Platform%3DDesktop&hl=en) ที่ตรวจ 6 ตุลาคม 2569 ระบุ `google.com/ai` เป็น entry และอธิบายผลของ history/personalisation; source นี้ไม่ได้รับรอง prompt-prefill parameter ที่เสถียร จึงไม่ใช้ `udm=50` เป็นสัญญาว่าจะ route สำเร็จ

Favicon ปัจจุบันคือ compact symbol PNG 250 × 265 ที่ได้รับอนุมัติ browser-tab role พร้อม receipt ไม่ใช่ animated rounded-balloon header การร้องขอ favicon ไม่ได้ทำให้ source role กลายเป็น touch/maskable/social และยังไม่ใช่ CityChat product icon set ครบหกขนาดตาม FAVICON-01 ชุด favicon format ที่เจ้าของสั่งเพิ่มใช้ SVG embedded exact source, PNG32 และ ICO16/32/48 แบบ contain-only; ดู `assets/brand/favicon-formats.manifest.json` ให้ตรวจ tab/cache จริง โดยคง source PNG bytes

Machine contract, exact current normative records, hashes และ source lineage อยู่ใน `reference/context-actions-contract.json` ผลตรวจ semantic tests อยู่ใน `qa/context-actions-semantic-checks.json` Root ต้องบันทึก actual browser render/keyboard/edit preservation/clipboard fallback และ deployed parity หลังรวม module เข้า build
