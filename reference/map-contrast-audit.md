# Sila map contrast · revision 1.3

ตรวจคู่สีจาก OpenFreeMap Liberty และ dark style ที่ดึงจากแหล่งจริงวันที่ 6 ตุลาคม 2026 โดยคง LDS 0.9.7 และ CityChat Add-on 0.9.2 นี่เป็นการคำนวณ source paint ไม่ใช่การรับรองผล render หรือ WCAG ทั้งแผนที่ ดู [machine evidence](map-contrast-audit.json)

| คู่สีที่ตรวจ | contrast ต่ำสุดใน sample | ผลต่อรูปแบบ |
|---|---:|---|
| อาคาร/แปลง light yellow `#EAC578` กับ 7 surfaces | 1.14:1 | ใช้ fill เดิมพร้อมขอบ neutral |
| บ้าน light mint `#7BD0A3` กับ 7 surfaces | 1.02:1 | ไม่พึ่งสี fill อย่างเดียว |
| CCTV light sky `#6ACCF0` กับ 7 surfaces | 1.03:1 | ขอบหมุด 1.5px ช่วยแยกจากพื้น |
| light rim `#182327` กับ 7 surfaces | 8.54:1 | ขอบอาคาร 1px และ dark underlay 4px รองรับคู่สีที่ตรวจ |
| dark rim `#F1F4EF` กับ 5 surfaces | 14.68:1 | ขอบหมุดกับ native dark มีความต่างเชิงคู่สี |
| neutral `#182327` กับ `#FFFFFF` | 16.05:1 | ขอบสองชั้นช่วยอ่านบน imagery ที่มีหลายความสว่าง |

ถนนใช้ category core 2px และแปลง/ลำห้วย 1.2px วางบน neutral 4px จึงเหลือ dark band อย่างน้อยด้านละ 1px ภาพดาวเทียมเพิ่ม white underlay 6px เป็น outer band ด้านละ 1px Underlay ไม่รับ click; geometry ต้นทางยังเป็นตัวเลือกข้อมูล อาคารใช้ fill เดิมและขอบ `#182327` 1px ใน light/satellite; ไม่ลด opacity ของข้อมูล การเห็นแถบ 1px จริงขึ้นกับ zoom และ antialiasing จึงต้องตรวจ browser เพิ่ม

Identity gradient light `#007A58 → #007E79` ใช้ ink `#FFFFFF` ได้อย่างน้อย 4.93:1; dark `#3BD19B → #3BD3CB` ใช้ ink `#182327` อย่างน้อย 8.24:1 จาก 101 sRGB samples นี่ไม่ได้วัดตำแหน่ง glyph จริงหรือการอ่านฟอนต์บน gradient

EOX cloudless 2016/17 ยังไม่มี pixel sample ใน receipt นี้ ตรวจเฉพาะเหตุผลของ neutral สองชั้น หมุดบน satellite ควรใช้ dark rim แทน rim ขาวของ dark theme เพื่อแยกจากหลังคาสว่าง ต้องตรวจ source imagery และภาพ render จริงก่อนเพิ่ม coverage สีจาก layer ทับกัน, labels, raster, antialiasing และทุกตำแหน่ง/ซูมยังไม่ถูกจำลอง

ข้อสังเกตเพิ่มเติมเฉพาะ source pair: `activeLayer/hoverStroke` light `#347DA8` กับ water paint ได้ 2.41:1 ส่วน `selectedStroke/focusStroke` `#176B82` ได้ 3.23:1 หากขอบเขตทับน้ำและจำเป็นต่อการอ่าน ให้คง approved blue token พร้อม neutral backing stroke; ยังไม่ได้ตรวจ geometry ที่ทับน้ำหรือ halo ของขอบเขตใน browser

ใช้ [WCAG relative luminance](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance) เพื่อคำนวณคู่สี และใช้ 3:1 เป็น diagnostic ของขอบที่จำเป็นตาม [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) ไม่อ้าง universal map, WCAG หรือ color-vision pass

การปรับ host เพิ่มเติม: activeLayer/hoverStroke light `#347DA8` มี source-pair contrast กับ water paint 2.41:1 จึงรองขอบเทศบาล/หมู่บ้านด้วย neutral `#182327` ก่อนเส้นสีน้ำเงินเดิม และเพิ่ม outer white เมื่อใช้ satellite ทุก underlay ไม่รับ pointer และไม่สร้างพื้นที่เลือกใหม่ ตรวจ rendered parcel ที่ zoom 15 และ 20 เห็น category core หลังแก้ draw order ให้ main layer อยู่หน้าริม
