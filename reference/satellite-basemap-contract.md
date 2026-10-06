# Satellite basemap contract — Sila

ตรวจแหล่งและ implementation: 6 ตุลาคม 2569 · `SilaBasemap 1.2.0`

มีโหมด `street`, `satellite`, `satellite-archive` และ `none` บน Leaflet เดิม ตามคำขอให้นำแหล่งภาพที่ CityChat ใช้อยู่มาใช้ต่อ `satellite` จึงใช้ Google Hybrid URL เดียวกับ `CmScreen.tsx` บรรทัด 439 พร้อม `crossOrigin:anonymous` จำกัดคำขอระดับ 19 ตาม configuration ของ source ใน `CmScreen-3d.tsx` และขยายภาพเมื่อแสดงระดับ 20 คงพิกัดกล้องเดิม พร้อมข้อความว่าระบบยังไม่ทราบวันที่ถ่ายภาพและความละเอียดจริงในแต่ละพื้นที่

การนำ URL เดิมมาใช้เป็นงาน compatibility ตามคำขอ ไม่ได้ยืนยันสิทธิ์ใหม่หรือเรียกว่า official Google Maps Tile API สัญญา machine บันทึก `licenseStatus:not_verified` ไว้ ส่วน [Map Tiles API ที่ Google รองรับ](https://developers.google.com/maps/documentation/tile/session_tokens) ใช้ API key/session พร้อม viewport metadata สำหรับระดับภาพและ attribution ตาม [นโยบาย](https://developers.google.com/maps/documentation/tile/policies) ยังคงรอยืนยัน configuration/สิทธิ์ที่ทีมใช้อยู่ โดยงานนี้ไม่ได้ดึง key หรือดาวน์โหลด/cache ภาพ Google

`satellite-archive` เป็นตัวเลือกแยกที่ผู้ใช้เลือกเอง ใช้ EOX Sentinel-2 cloudless ปี 2016/2017 ประมาณ 10 เมตรต่อพิกเซล ขยายภาพระดับ 14 เมื่อซูมสูงขึ้นถึง 20 ไม่มีการสลับ Google ไป EOX โดยอัตโนมัติเมื่อโหลดไม่ได้

EOX ระบุชุด 2016 เป็น CC BY 4.0 ใน [WMTS capability รายชั้น](https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml) และ [คำอธิบายใบอนุญาตของผู้ให้ข้อมูล](https://eox.at/2025/03/sentinel-2-cloudless-2024/) ชุดนี้เตรียมเป็นไฟล์ JPEG ต้นฉบับ 121 tiles สำหรับเทศบาลศิลาและรอบข้างประมาณ 4 กม. รวม 1,505,423 bytes ภายใน `vendor/satellite-eox-2016/` เบราว์เซอร์ที่เผยแพร่โหลดจาก host ของงานนี้ ไม่เรียก tile service ของ EOX ทุกไฟล์เก็บ URL ต้นทางและ SHA-256 ใน `satellite-tile-inventory.json`

ชุด EOX ปี 2018–2025 มีข้อกำหนด NC และ Esri World Imagery มีข้อกำหนดสิทธิ์ที่ต้องยืนยัน จึงยังไม่เปิดใช้งาน ดู [EOX license](https://cloudless.eox.at/documentation/license) และ [Esri terms summary](https://goto.arcgis.com/termsofuse/viewsummary)

## Host integration

```js
const layer = SilaBasemap.create({
  mode: S.basemap, // street | satellite | satellite-archive | none
  theme: S.theme,
  language: S.lang,
  fallback: true,
});
const updateCaption = () => {
  const state = layer.getBasemapState();
  caption.textContent = state.zoomNotice;
  caption.hidden = !state.mode.startsWith('satellite');
};
layer.on('basemapstatus basemapzoom', updateCaption).addTo(S.map);
```

เปลี่ยน theme ด้วย `layer.setTheme(theme)` และภาษาโดย `layer.setLanguage(lang)` ทั้งสองโหมดภาพคง tile layer และกล้องเมื่อเปลี่ยน theme ส่วน street ใช้ OpenFreeMap dark/light `getBasemapState()` คืน `mode`, `provider`, `imageryDate`, `nominalResolutionM`, `nativeZoom`, `sourceTileZoom`, `overzoom`, `scaleFactor`, `licenseStatus`, `sourceCompatibility`, `officialGoogleAPI` และ `zoomNotice` พร้อมฉบับ `Th`/`En` Google คืนวันที่และความละเอียดเป็น `null` และมี attribution เป็น Google Maps โดยไม่ใช้เครดิต OpenStreetMap ของ source เก่าใน repo

ไฟล์ static server และ publication ต้องเปิดให้บริการ `vendor/satellite-eox-2016/**/*.jpg` เป็น `image/jpeg` เมื่อเลื่อนแผนที่ออกนอก coverage ที่เตรียมไว้ ภาพในบริเวณนั้นอาจไม่มี แต่ dataset และการเลือกพื้นที่ยังใช้ได้

เพิ่ม provider ที่มีสิทธิ์แล้วผ่าน `satelliteProvider` object ประกอบด้วย `id`, `name`, `tileUrl` แบบ HTTPS, `attribution`, `maxNativeZoom`, `imageryDate`, `nominalResolutionM` และ `licenseConfirmed:true` หลังตรวจสิทธิ์จริงของแหล่งนั้น

## Interaction and evidence

Basemap ไม่เขียน `setView`, `setZoom`, `fitBounds`, `pan` หรือ `fly` ลง Leaflet กล้องยังอยู่ภายใต้ host controls/drill/focus โดย official bridge อ่านกล้อง Leaflet แล้วส่งให้ MapLibre เท่านั้น Dataset, ขอบเขตคำนวณ, สีข้อมูล และ geometry คงเดิม Satellite อยู่ใน `tilePane` ใต้ data และ municipal outside mask

ภาพที่โหลดไม่ได้ส่ง `degraded`/`unavailable` และ `tileerror` โดยคง provider/mode ที่เลือกไว้ ผู้ใช้เลือก EOX archive ได้เอง ส่วน OpenFreeMap ที่ใช้ WebGL ไม่ได้มี OpenStreetMap fallback พร้อม label ตาม contract เดิม

ตรวจแล้ว: syntax ผ่าน; 35 assertions สำหรับ exact repo URL/CORS, วันที่/ความละเอียดที่ยังไม่ทราบ, native cap/overzoom, theme independence, camera authority, การเลือก archive เอง และ cleanup ผ่าน; EOX tiles 121 ไฟล์ครบ SHA ตรงและ JPEG 256×256 ส่วน Google tile availability, browser rendering และ deployment ของ revision นี้ให้ root ตรวจต่อ

Machine contract: `satellite-basemap-contract.json` · tile provenance: `satellite-tile-inventory.json`
