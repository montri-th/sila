# แหล่งอ้างอิงและสัญญาที่ล็อก

> ฉบับ 1 · 2026-10-21 · ไซต์ revision 2.0.2 (ฐาน 2.0.1 commit `4b32208`) · สร้างจาก `tools/handoff/` ห้ามแก้ไฟล์นี้ด้วยมือ

## ลำดับอำนาจ

เอกสารระดับล่างไม่ทับระดับบน ขัดกันให้รายงานความต่าง ห้ามเลือกข้างเงียบ ๆ

| ลำดับ | เอกสาร | กำกับ | ที่อยู่ | สถานะ | SHA-256 |
|---|---|---|---|---|---|
| 1 | Owner amendment (CityChat Project instructions, 2026-10-01) | รุ่นและการใช้ design system กติกาโลโก้ LOGO-01 และกติกาธุรกิจที่ยังมีผล | Project instructions บน claude.ai (เจ้าของงาน) | มีผล | — |
| 2 | Landometer Master Brand Brief v0.5.3 | brand statement เสียง ขอบเขตการกล่าวอ้าง และมาตรฐานหลักฐาน | Google Drive ของเจ้าของงาน (ขอจากเจ้าของ) | ไฟล์ระบุสถานะว่า "Draft prepared 2026-08-20 — บังคับใช้เมื่อเจ้าของอนุมัติ และบันทึกการอนุมัติใน §0.3" แต่ section 0.3 ยังไม่มีบันทึกอนุมัติ ขณะที่ Project instructions ระบุให้ใช้เป็นแหล่งอ้างอิง รอเจ้าของยืนยัน (D-16) | 33041749f59bca930459dccc3637bad1a4884bf4cecc8e1a543f8ec3771fe87c |
| 3 | CityChat Product Brief v4 | ผู้ใช้ ข้อมูล workflow การตัดสินใจ ความพร้อม และผลลัพธ์ของ CityChat | Google Drive ของเจ้าของงาน (ขอจากเจ้าของ) | ไม่มีส่วนควบคุมเอกสาร (ไม่มีวันที่ ผู้รับผิดชอบ หรือสถานะ) | 0cb900937a7f0a35f78fa5212bb216b128308ecd4b7ed3af05be3301cbf166ef |
| 4 | Landometer Design System 0.9.7 (complete base) | สี ตัวอักษร control focus ไอคอน motion การเข้าถึง และสเกลข้อมูล | https://montri-th.github.io/Landometer/v0.9.7/normative/Landometer-Design-System-v0.9.7.md | ฉบับปัจจุบัน | d3085cbc0a50195f1cbf0c77b1d77c0d19b84364daf2948eb367348d65432d96 |
| 4 | CityChat Add-on 0.9.2 for LDS 0.9.7 | identity เสียง ประเภทหน้าจอ (surfaces) รูปแบบจากข้อมูลสู่การลงมือ และเกณฑ์ก่อนออก release ของ CityChat | Project source บน claude.ai (เจ้าของงาน) | ฉบับปัจจุบัน ผูกกับ LDS 0.9.7 ข้างบน | 345ef4054d7a646a73a8b369549c58c8b11d3190e39de5aa0f59704d6a3223ad |
| 5 | Official assets with hashes | ไบต์ของโลโก้ motif favicon และบทบาทที่อนุมัติ | assets/brand/manifest.json (repository นี้) | ฉบับปัจจุบัน | — |
| 6 | Locale Insight specification | ชั้นข้อมูลวิเคราะห์ทำเล | ไซต์นี้ไม่ได้ใช้ | ไม่เกี่ยวข้อง | — |

## สัญญาใน repository ที่แผนนี้อ้าง

ถ้าค่า SHA-256 เปลี่ยน `build_handoff.py --check` จะล้มจนกว่าจะ build ใหม่ เพื่อให้คนอ่านสัญญาฉบับใหม่ก่อน

| ไฟล์ | SHA-256 | กำกับ |
|---|---|---|
| reference/tax-map-method.md | `f82c48be28e92e249dc62f477613c589885feffe2b371e6977a89d87766734b8` | tax method, baseline rule, what is not published, requests to the municipality |
| reference/tax-calculator-rules.md | `9228ade4763009f3c872e6953e575e149c405b05a5230c3ee6c4be177d047f3e` | one-parcel calculator rules and legal sources |
| reference/public-summary-contract.md | `01d7fc428db576068c1791897bfddfee817b4ed21734133fe6911b7339db87fb` | municipality-level summaries and the public versus officer boundary |
| reference/public-summary-contract.json | `6688ed1f0b9b3f4626be458740186694babd5f4ef9ea5832c01f4e86b180d7f4` | machine form of the public summary contract |
| reference/drilldown-contract.json | `b047aab284098a220291551b212a7efd64d1c8f4cb9f59a3444d816fc9aa22da` | scope drilldown behaviour (municipality, village or election, record) |
| reference/context-actions-contract.json | `ba31d153c4a97d2534f8eab7eeee2781c30171c832a455d1f2ada08d6434ccf4` | search and AI-question actions without personal data |
| reference/terrain-contract.json | `40c9e847559afe999a089266a4ac9d090d1b4fd25de30dd0ac8c091bf7092aec` | terrain 2D/3D and closed-low-ground contract |
| reference/terrain-contract.md | `5ed8301ddbf1b3e87850ac00f37aa72a480b91d85c6b6b52dcbad697d2285c5b` | terrain contract (Thai) |
| reference/lds-analytical-subset.json | `77b4a2958fb81278d008e197d5d49d3c9c8bc95aa7fdb65ce728b75ecc125298` | LDS 0.9.7 analytical scales used by the site |
| reference/design-tokens.json | `b203db089ab50cae16bea666016540bf50f01b012999476cfdb132bb27adb62e` | LDS 0.9.7 and CityChat Add-on 0.9.2 values used by the site |
| reference/ui-icons.manifest.json | `312b54242c303816f8ad23b4a2518955e1bc4419e182ca5a2954f48c835b2cda` | interface icon subset, sources, hashes and approvals |
| reference/satellite-basemap-contract.json | `dbae7bc6a8df2c5ad3a947e6303d20cbf372f35197dce9061927eed00474ff02` | satellite basemap providers and licence status |
| assets/brand/manifest.json | `e02411c8fba8aa38f447b4100d72a00e5c147dfdac124d81d882bbf46d314cb9` | official brand asset bytes and approved roles |
| data/terrain-source.json | `b6ddd968f4cad37f4798c7c6a9de473e5cb84f2d923a7041344364acac47f7a3` | FABDEM service, licence and attribution |

## ข้อความที่ฝังตามตัวอักษร

- handoff.json#/dataContracts/taxBaseline: reference/tax-map-method.md หัวข้อ 'รุ่น 2.0: ฐานเปรียบเทียบคือยอดที่เรียกเก็บปี 2569 และการจัดสรรส่วนเพิ่มให้ข้อเสนอ' (ไม่รวมหัวข้อย่อย)
- handoff.json#/dataContracts/notPublished: reference/tax-map-method.md หัวข้อ 'สิ่งที่ไม่เผยแพร่'
- handoff.json#/dataContracts/publicSummary: reference/public-summary-contract.md หัวข้อ 'สัญญาข้อมูล'
- product-brief.json#/evidenceLabels และ implementation-plan.json#/aiContext/evidenceLabels: MBB v0.5.3 section 3.7
- product-brief.json#/brief: คำพูดจาก CityChat Product Brief v4 section 1.2.1 และ Appendix C, MBB v0.5.3 sections 0.3 และ 5.1
- implementation-plan.json#/decision: คำของเจ้าของงานตามป้าย VERBATIM, PARTIAL หรือ RECONSTRUCTED
