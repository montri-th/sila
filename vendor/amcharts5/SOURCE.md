# amCharts 5 bundle for the Sila officer site

- Package: `@amcharts/amcharts5` 5.21.2 from the npm registry (installed 20 Oct 2026; registry shasum 4d28b1b239ad92142fdd8fd01e839a020c63138e, integrity sha512-z/zNqUfcsmujFn13LIBa+o6aBFiPYpYhMe/zsWmFzMcsLzi3My2SOvoh8XPatteuh5iaPlz2yMXkoyetHOuOLQ==)
- Bundle: `amcharts5-sila.min.js` = `index` (core), `xy`, `percent`, `themes/Responsive`, `locales/th_TH`, `locales/en_US`, built with esbuild 0.28.2 as one IIFE (SHA-256 f88190e6b341839b5a4f6ce2c1a4fa4bed7d206a4e38aa7f638ee29c769c7033) exposing `window.SilaAm5`; the entry file adds one line of ours that dispatches a `sila:am5-ready` event on `window` once the bundle has run, so the page (which loads the bundle deferred) can mount charts that were rendered before it arrived
- Licence: free amCharts licence (`LICENSE.md`, copied from the package). The amCharts branding link that the library draws on every chart is kept; a commercial licence key can be added later with `am5.addLicense` without changing the charts
- Nothing else is added or removed; no amCharts code is modified
