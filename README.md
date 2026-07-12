# HHI Mumbai Board — Dashboard Website

Plain HTML + vanilla JS site styled to match the `Dashboard/` mockups, powered by data from `analysis/working-sheets/MumbaiBoard_WorkingSheet.xlsx`.

## Run locally

Serve the folder over HTTP (fetch needs a server):

```bash
cd website
python3 -m http.server 8080
```

Open http://localhost:8080

## Pages

| Page | File |
|------|------|
| Home | `index.html` |
| Analytics Dashboard | `dashboard.html` |
| Other nav items | shell stubs (same chrome) |

## Data

`data/mumbai.json` is extracted from the Mumbai Board working sheet (`RVA-HHI`, `HHIscoring`, `Issues Reported`, `FrequencyQS`).

Re-extract after Excel updates with the export snippet used during build (or ask to regenerate).
