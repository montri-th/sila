# Correct CityChat rounded-balloon logo

Use these exact components from `montri-th/CityChat` commit `02bf0a94caec0adbf4cfba170cd9e4bad4cd8b6d`. Six original source files match the SHA-256 values in the original approved Build Card. This artifact uses the current LDS 0.9.7 foundation; none of the older source artifact's design-system tokens or CTA exceptions is adopted.

The current human request explicitly selects the corrected animated logo and publication for Sila. Record this as artifact-specific header-use authority. The earlier September 8 approval covered the CityChat landing opening hero, and does not itself authorize other surfaces. `proposal` is a retained source filename, not the current adoption status. No family/global design-system promotion is claimed.

In `index.html`, remove the old faceted `assets/citychat-logo.svg` header `<img>` and insert the exact static composition inside the existing labelled brand link:

```html
<span class="cc-header-logo" data-citychat-header-logo aria-hidden="true">
  <span class="cc-header-logo__still">
    <span class="cc-header-logo__rendition" data-logo-rendition="light">
      <img src="assets/brand/lockup-without-bubbles-light.png" alt="" width="494" height="106">
      <img src="assets/brand/logo-bubbles-proposal-light.svg" alt="" width="494" height="106">
    </span>
    <span class="cc-header-logo__rendition" data-logo-rendition="dark">
      <img src="assets/brand/lockup-without-bubbles-dark.png" alt="" width="494" height="106">
      <img src="assets/brand/logo-bubbles-proposal-dark.svg" alt="" width="494" height="106">
    </span>
  </span>
</span>
```

Keep the brand anchor's meaningful `aria-label` (CityChat + destination). The SVG layers are decorative inside it and never a second focus target. Use the entire 494/106 composition at proportional size; do not crop, reconstruct or recolor it.

Load after the general styles:

```html
<link rel="stylesheet" href="assets/brand/citychat-motif-motion.css">
<link rel="stylesheet" href="assets/brand/citychat-header-logo.css">
<script type="module" src="assets/brand/citychat-header-logo.js"></script>
```

`data-theme="light"` selects light-rendition artwork; `dark` selects dark rendition on this foundation header. The old landing's hero inverted renditions for its identity-gradient field; that inversion is not correct for this header canvas.

Motion is a finite opening gesture, once per page load. Only the rounded chat balloons and their dots move. Both theme layers start together so theme changes do not replay it. Reduced motion, missing JavaScript, module/image errors and print retain the exact complete static composition. The adapter settles motion when the page is hidden.

The browser-tab favicon source remains the exact original `citychat-favicon-3b7439f6.png` (transparent 250 × 265) with its unchanged extraction receipt. The current owner request additionally authorizes browser-tab format conversion: `favicon.ico` (16/32/48), a 32 px PNG, and a square SVG embedding the unchanged source PNG. All use transparent contain padding and proportional scaling without crop, reshape or recolor. Read `favicon-formats.manifest.json` for exact paths, hashes, runtime and recipe. The current HTML links the content-revisioned ICO, PNG32 and SVG. This permission is limited to browser tabs; it does not establish apple-touch, maskable, social or a complete six-size LDS product icon set.

Before publication, root must inspect the actual header at narrow/desktop widths and both themes, normal/reduced motion, no-JavaScript fallback, and verify deployed source hashes. Package hash parity alone does not verify the rendered geometry or all accessibility behavior. Do not use the horizontal lockup as an invented favicon.
