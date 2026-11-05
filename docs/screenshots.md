# Reproducing the screenshots

Run `node tests/preview.cjs` from the repository root. It builds `.preview/index.html` using the real application modules, a mock API, fictional album names and simple generated SVG covers. It does not read `js/config.js` or contact a music server.

Capture the following views at **1280×720**:

| Image | Fragment |
| --- | --- |
| `screenshots/library.png` | no fragment |
| `screenshots/now-playing.png` | `#dock` |
| `screenshots/turntable.png` | `#lp` |
| `screenshots/spectrum.png` | `#viz0` |

For example, with Microsoft Edge on Windows:

```powershell
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$previewFile = (Resolve-Path .\.preview\index.html).Path
$previewUrl = ([uri]$previewFile).AbsoluteUri
$shot = Join-Path (Get-Location) 'docs\screenshots\now-playing.png'
$profile = Join-Path (Get-Location) '.preview\screenshot-profile'
& $edge --headless --disable-gpu --hide-scrollbars --no-first-run `
  --window-size=1280,720 --virtual-time-budget=1800 `
  "--user-data-dir=$profile" "--screenshot=$shot" "$previewUrl#dock"
```

Use a fresh browser profile for each view to avoid carrying saved preview preferences between screenshots. Inspect every output before committing. Spectrum samples are synthetic and should remain described as a layout preview, not measured device output. No personal server data, real album artwork or TV account information belongs in these images.
