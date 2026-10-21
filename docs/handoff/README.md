# ชุดส่งต่องานสำหรับนักพัฒนา · แผนที่งานเจ้าหน้าที่ศิลา

> ฉบับ 1 · 2026-10-21 · ไซต์ revision 2.0.2 (ฐาน 2.0.1 commit `4b32208`) · สร้างจาก `tools/handoff/` ห้ามแก้ไฟล์นี้ด้วยมือ

ชุดนี้ให้นักพัฒนาและ AI coding agent ทำงานต่อบน `montri-th/sila` ได้ทันที เอกสารหลักทุกฉบับมีส่วนที่คนอ่านและ JSON ที่เครื่องอ่าน โดย JSON ที่ฝังใน .md ตรงกับไฟล์ .json คู่กันทุกตัวอักษร

## อ่านอะไรก่อน

| ผู้อ่าน | ลำดับ |
|---|---|
| นักพัฒนา | PRODUCT_BRIEF.md → HANDOFF.md → IMPLEMENTATION_PLAN.md → AGENTS.md |
| AI coding agent | AGENTS.md (โหลดเองจาก CLAUDE.md หรือ AGENTS.md) → implementation-plan.json งานที่ได้รับ → readFirst ของงาน |
| เจ้าของงาน | PRODUCT_BRIEF.md หัวข้อความขัดกับเอกสารต้นทาง → IMPLEMENTATION_PLAN.md ตารางคำตัดสิน |

## ไฟล์

| ไฟล์ | คืออะไร | SHA-256 |
|---|---|---|
| [PRODUCT_BRIEF.md](PRODUCT_BRIEF.md) | brief ระดับไซต์ (ไทย) + JSON | `9b6d2caa1b13472e8f24dc8b3703f756464550c741435c943513c46bc8753207` |
| [product-brief.json](product-brief.json) | brief สำหรับเครื่อง | `bce0ec44c14bdd14828986ea52abddbd073200b865a61c034abe1737a2cba5a8` |
| [HANDOFF.md](HANDOFF.md) | สถานะ สถาปัตยกรรม สัญญาข้อมูล การตรวจ release | `b37770fe74f632b3141f0043fcb73eed00d4acdfb00345595c07266459eb379d` |
| [handoff.json](handoff.json) | handoff สำหรับเครื่อง | `8f3f0946707ad64f31f07d4ee42dfe4605594bdef1ef80b7268f10b5fee85b79` |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | แผนลงมือ งาน เกณฑ์ผ่าน คำตัดสิน พรอมป์ | `b7d162f7c18616c4639780fb0f359dcb252ecda42ecf41b63df81abbf0991304` |
| [implementation-plan.json](implementation-plan.json) | แผนสำหรับเครื่อง | `93cbcecd9600b08389326191ee729e648996ac564fff378987d837a5cced8634` |
| [SOURCES.md](SOURCES.md) | ลำดับอำนาจและ SHA-256 ของสัญญา | `a66f1fa896e3040ca50b719d5e4af3e5a4728cfa99f265effbf124252b908d5e` |
| [CHANGELOG.md](CHANGELOG.md) | บันทึกการเปลี่ยนแปลงของชุดนี้ | `072aa3fbdf11995bfae963c9e4a6c1c09c92df1319f0d83b4e5db678069b7cb3` |

FACTS.md และ facts.json เป็นภาพ ณ เวลาที่ build (ขนาดไฟล์ จำนวนบรรทัด cache key) จึงไม่มี hash ในตารางนี้

## แก้และตรวจ

- แก้เนื้อหาที่ tools/handoff/handoff_data.py, plan_data.py และ brief_data.py แล้วรัน `python3 tools/handoff/build_handoff.py`
- ก่อนเปิด pull request รัน `python3 tools/handoff/build_handoff.py --check` (ล้มเมื่อไฟล์ไม่ตรงกับ builder แผนผิดกติกา path ไม่มีจริง หรือมี trailing space/BOM)
- เอกสารนี้อยู่ใน repository สาธารณะ: ห้ามใส่ข้อมูลส่วนบุคคล ราคา สัญญา pipeline การขาย หรือ credential
