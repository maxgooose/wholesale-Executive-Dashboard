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

## Task 2: Unified Header ✅ PLANNED

### Analysis — 3 Different Header Systems Found

**Canonical header** (from `dashboard_standalone.html`):
- Uses `<header class="header no-print">` with `.header-inner`, `.header-brand`, `.header-nav`, `.header-actions`
- CSS classes: `header`, `header-inner`, `header-brand`, `header-logo`, `header-title`, `header-subtitle`, `header-nav`, `nav-link`, `header-actions`
- Nav links: Dashboard, Data Manager, Pricing, Assistant (4 links)
- Actions: sync indicator, theme toggle, refresh button
- Styled via `styles/theme.css` (design system)

**Pages using canonical header (already correct):**
| Page | Status | Notes |
|------|--------|-------|
| `dashboard_standalone.html` | ✅ Source of truth | Lines 341-410 |
| `index.html` | ✅ Matches canonical | Lines 371-410, identical structure |
| `ai-chat.html` | ✅ Matches canonical | Lines 497-540, identical structure |
| `data-manager.html` | ✅ Matches canonical | Lines 788-830, identical structure |

**Pages with DIFFERENT headers:**
| Page | Header System | Key Differences |
|------|--------------|-----------------|
| `deal-maker.html` | Custom `<nav class="gnav">` | Completely different CSS (`.gnav`, `.gnav-brand`, `.gnav-link`), inline styles in `<style>` block. No subtitle. No sync indicator. No refresh button. Links to `index.html` instead of `dashboard_standalone.html`. Has "Deal Maker" nav item but missing "Assistant". |
| `pricing-manager.html` | Custom `<nav class="global-nav">` + `<header class="top-bar">` | TWO separate nav elements. Global nav has its own CSS (`.global-nav`, `.global-nav-inner`, `.gnav-link`). Dark themed by default. No logo SVG. Has an additional top-bar with search, filters, view toggle. Missing "Deal Maker" nav link. |

### Nav Link Inventory (What Each Page Currently Has)
| Link | dashboard_standalone | index | ai-chat | data-manager | deal-maker | pricing-manager |
|------|---------------------|-------|---------|--------------|------------|-----------------|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ (→index.html) | ✅ |
| Data Manager | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pricing | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Assistant | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Deal Maker | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |

### Unification Plan

**Step 1: Add "Deal Maker" to canonical nav**
- Add a 5th nav link to the canonical header between Pricing and Assistant
- Icon: clipboard/checklist SVG (from deal-maker.html)

**Step 2: Fix `deal-maker.html`**
- Remove inline `.gnav-*` CSS (lines ~15-25)
- Replace `<nav class="gnav">` block with canonical `<header class="header no-print">` block
- Add `<link rel="stylesheet" href="styles/theme.css">` if missing
- Add `<script src="scripts/theme-switcher.js"></script>` if missing
- Set Deal Maker nav-link as `active`

**Step 3: Fix `pricing-manager.html`**
- Remove `<nav class="global-nav">` and its inline CSS (~lines 95-125)
- Replace with canonical `<header class="header no-print">` block
- Keep the `<header class="top-bar">` (page-specific search/filter bar — NOT part of global nav)
- Set Pricing nav-link as `active`
- Ensure `styles/theme.css` and `scripts/theme-switcher.js` are loaded

**Step 4: Update all 6 pages** to have the same 5 nav links:
- Dashboard → `dashboard_standalone.html`
- Data Manager → `data-manager.html`
- Pricing → `pricing-manager.html`
- Deal Maker → `deal-maker.html`
- Assistant → `ai-chat.html`

**Step 5: Decide `index.html` vs `dashboard_standalone.html`**
- Both are dashboards. `index.html` is the landing page. Dashboard link should point to `dashboard_standalone.html` (or redirect index→dashboard_standalone).
- Keep as-is for now — both already have the correct header.

### Files to Change
| File | Change | Risk |
|------|--------|------|
| `deal-maker.html` | Replace gnav with canonical header, add theme.css/theme-switcher imports | Medium — may break layout if gnav spacing was load-bearing |
| `pricing-manager.html` | Replace global-nav with canonical header, keep top-bar | Medium — dual-nav removal needs care |
| `dashboard_standalone.html` | Add Deal Maker nav link | Low |
| `index.html` | Add Deal Maker nav link | Low |
| `ai-chat.html` | Add Deal Maker nav link | Low |
| `data-manager.html` | Add Deal Maker nav link | Low |

### No Blockers
All CSS comes from `styles/theme.css`. Header HTML is self-contained. Straightforward copy-paste with active class adjustment per page.

## Task 3: Sort by Location ✅ PLANNED

### Data Analysis
- **9,692 items** total in `data/available-inventory.json`
- **2 unique locations:** `Ready Room`, `Processing`
- **1 warehouse:** `Main Warehouse`
- Data structure: `item.location.name` in raw JSON → transformed to `item.location` (string) by WholecellTransformer
- Both `deal-maker.html` and `pricing-manager.html` already have `ALLOWED_LOCATIONS = ['Ready Room', 'Processing']`

### Current State — Location Awareness Per Page
| Page | Location Filter | Location in Table | Location Sorting |
|------|----------------|-------------------|-----------------|
| `index.html` (dashboard) | ✅ Dropdown filter | ❌ | ❌ |
| `pricing-manager.html` | ❌ | ❌ | ❌ |
| `deal-maker.html` | ❌ (filters silently) | ❌ | ❌ |
| `data-manager.html` | ❌ | ❌ | ❌ |

### Problem
`pricing-manager.html` groups inventory by `model|storage` but **discards location data** during grouping (line ~1900). A model+storage combo could have units split across Ready Room and Processing — the manager can't see this breakdown.

### Plan

**Option A (Recommended): Add Location Filter + Column to Pricing Manager**

1. **Modify `groupInventory()` in pricing-manager.html** — Track per-location counts in each group:
   ```js
   // Add to group object:
   locations: { 'Ready Room': 0, 'Processing': 0 }
   // Increment during grouping:
   g.locations[location] = (g.locations[location] || 0) + 1;
   ```

2. **Add Location filter chip/dropdown** in the filter sidebar (after Storage chips, before Price Range):
   ```html
   <div class="filter-section">
       <label>Location</label>
       <div class="chip-grid" id="locationChips"></div>
   </div>
   ```
   - Chips: "Ready Room (N)", "Processing (N)" — clickable like brand/storage chips
   - Filter logic: when a location is selected, only show groups that have units in that location

3. **Add Location column to table** — Between the Model/Storage columns and Grade columns:
   - Show location breakdown: "RR: 5 / Proc: 2" or use colored badges
   - Keep it compact since table already has many columns

4. **Add "Location" sort option** to Sort By dropdown:
   ```html
   <option value="location-rr">Ready Room First</option>
   <option value="location-proc">Processing First</option>
   ```
   - Sorts by count of items in that location (descending)

**Option B (Simpler): Location Filter Only**
- Just add the chip filter, no column or sort. Quickest win.

### Recommendation: Go with Option A
It's a complete solution. The pricing manager is where Harb sets prices — knowing whether units are in Ready Room vs Processing helps him prioritize what's actually ready to sell.

### Files to Change
| File | Change | Risk |
|------|--------|------|
| `pricing-manager.html` ~line 1900 | Modify `groupInventory()` to track location counts | Low — additive change |
| `pricing-manager.html` ~line 1400 | Add Location filter section in sidebar HTML | Low |
| `pricing-manager.html` ~line 1384 | Add location sort options to Sort By dropdown | Low |
| `pricing-manager.html` render function | Add Location column to table rows | Medium — table layout shift |

### No Blockers
Data is available. Location field is already extracted by the transformer. Just needs UI exposure.

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
