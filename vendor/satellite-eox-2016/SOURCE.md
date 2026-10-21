# Source · EOX Sentinel-2 cloudless 2016 tiles

What: 121 original JPEG tiles (256 × 256 px, zoom 8 to 14, 1,505,423 bytes) of the layer `s2cloudless_3857`, product year 2016 (source window 2016/2017), covering Sila Municipality and about 4 km around it. They feed the user-selected "satellite archive" basemap in `basemap.js`; the published site serves them from this folder and does not call the EOX tile service.

Source: EOX IT Services GmbH, WMTS `https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml` (layer title "Sentinel-2 cloudless layer for 2016 by EOX - 3857"). Downloaded 2026-10-06 (UTC). Every tile's source URL, byte count and SHA-256 are listed in [`reference/satellite-tile-inventory.json`](../../reference/satellite-tile-inventory.json); the method and limits are in [`reference/satellite-basemap-contract.md`](../../reference/satellite-basemap-contract.md).

Licence: CC BY 4.0, as declared by EOX for the 2016 layer only (see [LICENSE.md](LICENSE.md)). The 2018 to 2025 EOX layers carry a non-commercial licence and are not used.

Required attribution (shown by `basemap.js` whenever the archive basemap is on): Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 & 2017).

Do not edit, re-encode or add tiles by hand. A new tile set needs its own download record in the inventory and the owner's go-ahead (SAFE-02).
