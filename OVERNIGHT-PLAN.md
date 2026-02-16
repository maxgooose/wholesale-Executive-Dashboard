# Overnight Work Plan — Feb 16, 2026 (1:37 AM - 9:00 AM EST)

## Task 1: Dashboard Data Loading ✅ PLANNED

### Finding
The dashboard (index.html) **already loads data correctly** from `data/available-inventory.json` (9,692 items, $895K value). Verified on live site — all 7 charts render, stats populate, search works. The "loads empty" issue no longer exists.

### Remaining Cleanup (Minor)
1. **Remove dead `combined_details.preloaded.js` script tag** (line ~1080 of index.html) — causes harmless 404 on every page load
2. **Remove dead fallback paths** in `loadData()` — Priority 2 (`assets/wholecell-data-backup-2025-11-24.json`) and Priority 3 (`combined_details.json`, `__PRELOADED_INVENTORY__`) reference files that don't exist. Dead code.
3. **`dashboard_standalone.html` uses different data path** — tries `/api/inventory` first (Vercel Blob), then `combined_details.json`. Should be aligned with index.html to use `data/available-inventory.json` as primary source.

### Files to Change
| File | Change | Risk |
|------|--------|------|
| `index.html` ~line 1080 | Remove `<script src="combined_details.preloaded.js"></script>` | None — file doesn't exist |
| `index.html` loadData() | Remove Priority 2+3 fallbacks, keep only `data/available-inventory.json` | Low — dead code removal |
| `dashboard_standalone.html` loadData() | Replace `/api/inventory` + `combined_details.json` with `data/available-inventory.json` path (same as index.html) | Low — aligns data sources |

### Data Flow (Current, Working)
```
data/available-inventory.json (5.7MB, 9692 items)
  → WholecellTransformer.transformAll(rawData.data)
  → inventoryData[] (transformed items with MODEL, GRADE, STATUS, STORAGE, location, cost, etc.)
  → updateKeyMetrics() + updateCharts() (7 charts: brand, grade, aging, battery, top models, storage, stations)
```

### No Blockers
Data loading works. This task is cleanup only — removing dead code and aligning the two dashboard files.

## Task 2: Unified Header
- Use header from `dashboard_standalone.html` across ALL pages
- Currently each page has different header HTML/CSS

## Task 3: Sorting Manager — Sort by Location
- Add location-based sorting in sorting manager
- WholeCell data has location field (e.g., "Ready Room")
- Need to surface this in the UI

## Task 4: Incremental Inventory Sync
- Explore WholeCell API for date-based/updated endpoints
- Goal: only sync changes (adds/removes/updates), not full inventory
- Check API docs for `updated_since`, `modified_after` type params

## Task 5: Past Deals — Export & Save
- Clock modal opens now but deals don't save properly after export
- Check Vercel backend `/api/deals` — ensure POST/PUT works
- Verify Neon DB schema for deals table

## Task 6: Pricing History Backend
- Verify `/api/prices` and `/api/price-history` endpoints work
- Ensure frontend reads from them correctly
- Test full flow: set price → save → retrieve history

## URLs
- Live: https://wholesale-executive-dashboard-sigma.vercel.app
- Old (disconnected): https://wholesale-executive-dashboard.vercel.app
- Repo: maxgooose/wholesale-Executive-Dashboard
- Local: C:\Users\hhgoo\.openclaw\workspace\wholesale-executive-dashboard\
