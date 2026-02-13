# Field Exploration Quick Start Guide

**Created**: November 18, 2024  
**Goal**: Help you discover and utilize all available Wholecell API fields

---

## 🚀 Quick Start (5 Minutes)

### Step 1: Make Sure Proxy Server is Running

```bash
cd "/Users/hamza/Desktop/data git/wholesale-Executive-Dashboard"

# Check if running
curl http://localhost:5001/api/health

# If not running, start it
python3 wholecell-proxy.py
```

### Step 2: Open the Field Explorer

```bash
# Open in your browser
open test-api-fields.html
```

### Step 3: Discover Your Fields

1. Click **"🔍 Discover All Fields"** - Shows all available fields
2. Click **"🎯 Analyze Custom Fields"** - Shows Battery Health and other custom fields
3. Click **"📍 Analyze Locations"** - Shows warehouse and location values
4. Click **"📊 Analyze Statuses"** - Shows device status breakdown

---

## 📋 What to Look For

### Critical Questions to Answer:

1. **What custom fields do you have?**
   - Is there IMEI Status?
   - Is there Screen Condition?
   - Is there Carrier Status?
   - Is there Battery Percentage (not just "GOOD/FAIR")?

2. **What status values exist?**
   - Just "Available" and "Sold"?
   - Or also "Processing", "Reserved", "Locked"?

3. **What locations/rooms do you have?**
   - What warehouses?
   - What rooms/locations within warehouses?
   - Do they match your current room workflow?

4. **What networks/carriers are in your inventory?**
   - How many UNLOCKED devices?
   - What carriers are locked devices tied to?

---

## 🎯 Immediate Actions Based on Results

### If You Find These Custom Fields:

#### ✅ IMEI Check Status
```
Priority: CRITICAL
Action: Add to display immediately
Use: Filter out blacklisted devices from exports
```

#### ✅ Battery Percentage (exact number)
```
Priority: HIGH
Action: Use instead of generic "GOOD/FAIR"
Use: Filter premium devices (>85% battery)
```

#### ✅ Screen Condition
```
Priority: HIGH
Action: Add to QC workflow
Use: Justify grade assignments
```

#### ✅ Carrier Status / Carrier Lock
```
Priority: CRITICAL
Action: Show prominently in UI
Use: Critical pricing information
```

#### ✅ iCloud Status (iOS) / FRP Status (Android)
```
Priority: CRITICAL
Action: Add to display immediately
Use: Unsellable if locked
```

---

## 📊 Analysis Results Examples

### Example 1: You Find "IMEI Check Status"

**What to do:**
1. Update `wholecell-transformer.js`:
   ```javascript
   'IMEI_STATUS': customFields['IMEI Check Status'] || 'UNKNOWN'
   ```

2. Add filter in `excel-export.js`:
   ```javascript
   // Only export clean IMEI devices
   if (filters.cleanIMEIOnly) {
     filtered = filtered.filter(item => item.IMEI_STATUS === 'CLEAN');
   }
   ```

3. Add to UI:
   ```html
   <div class="imei-status">
     <span class="badge">IMEI: ${item.IMEI_STATUS}</span>
   </div>
   ```

### Example 2: You Find Multiple Locations

**What to do:**
1. Add location filter dropdown with actual values
2. Create location-based reports
3. Sync with your room workflow

### Example 3: You Find Multiple Status Values

**What to do:**
1. Update status filter to multi-select
2. Create status-specific views
3. Track status transitions

---

## 🔧 Implementation Priority

### Week 1: Critical Data Capture

**Files to update:**
- `wholecell-transformer.js` - Capture all fields
- `room-workflow.js` - Display new fields
- `dashboard_standalone.html` - Show in UI

**What to add:**
1. All custom fields (dynamic capture)
2. Network/Carrier status
3. Purchase Order ID
4. All location data

### Week 2: Enhanced Filtering

**Files to update:**
- `excel-export.js` - Add new filters
- `dashboard_standalone.html` - Update UI

**What to add:**
1. Multi-status filter
2. Location filters (warehouse + room)
3. Network filter (unlocked only option)
4. Custom field filters

### Week 3: Polish & Testing

**Tasks:**
1. Test all new filters
2. Update documentation
3. Train users on new features

---

## 📝 Copy These Code Snippets

### 1. Enhanced Transformer (copy to wholecell-transformer.js)

```javascript
static transformItem(wholecellItem) {
  if (!wholecellItem) return null;

  const product = wholecellItem.product_variation?.product || {};
  const customFields = wholecellItem.custom_field_values || {};

  return {
    // ... existing fields ...
    
    // ADD THESE NEW FIELDS:
    'NETWORK': product.network || 'Unknown',
    'IS_UNLOCKED': product.network === 'UNLOCKED',
    'PURCHASE_ORDER_ID': wholecellItem.purchase_order_id,
    'ORDER_ID': wholecellItem.order_id,
    'HEX_ID': wholecellItem.hex_id,
    
    // Promoted custom fields (update based on what you find)
    'BATTERY_PERCENTAGE': customFields['Battery Percentage'],
    'SCREEN_CONDITION': customFields['Screen Condition'],
    'IMEI_STATUS': customFields['IMEI Check Status'],
    'CARRIER_STATUS': customFields['Carrier Status'],
    'ICLOUD_STATUS': customFields['iCloud Status'],
    'FRP_STATUS': customFields['Google Lock Status'],
    
    // Store ALL custom fields
    'CUSTOM_FIELDS': customFields,
    
    // ... rest of fields ...
  };
}
```

### 2. Unlocked-Only Filter (copy to excel-export.js)

```javascript
// Add to getFilteredData() function

// Filter for unlocked devices only
if (this.selectedUnlockedOnly) {
  filtered = filtered.filter(item => item.IS_UNLOCKED === true);
}
```

### 3. Multi-Status Filter (copy to excel-export.js)

```javascript
// Replace single status filter with this:

// Multi-status filter
if (this.selectedStatuses && this.selectedStatuses.length > 0) {
  filtered = filtered.filter(item => 
    this.selectedStatuses.includes(item.STATUS)
  );
}
```

### 4. Location Filter (copy to excel-export.js)

```javascript
// Add to getFilteredData() function

// Warehouse filter
if (this.selectedWarehouse) {
  filtered = filtered.filter(item => item.WAREHOUSE === this.selectedWarehouse);
}

// Location/Room filter (multi-select)
if (this.selectedLocations && this.selectedLocations.length > 0) {
  filtered = filtered.filter(item => 
    this.selectedLocations.includes(item.LOCATION)
  );
}
```

---

## 🎓 Understanding the Results

### Custom Fields Section

```
🎯 Custom Fields (5)

Battery Health
- Unique values: 3
- Examples: GOOD, FAIR, POOR

IMEI Check Status
- Unique values: 2
- Examples: CLEAN, BLACKLISTED
```

**What this means:**
- You have 5 custom fields configured
- Battery Health has 3 possible values
- IMEI Check Status exists (CRITICAL - use this!)

### Location Section

```
📍 Location Fields (2)

Warehouses:
- Main Warehouse: 450 items (90%)
- Secondary: 50 items (10%)

Locations:
- Ready Room: 200 items (40%)
- Processing: 150 items (30%)
- Storage: 150 items (30%)
```

**What this means:**
- 2 warehouses in system
- 3 main locations/rooms
- Can filter by these in exports

---

## ⚠️ Common Issues

### Issue: "No custom fields found"

**Possible reasons:**
1. Custom fields not configured in Wholecell
2. Data doesn't have custom field values yet
3. Proxy server not returning full data

**Solution:** 
Check raw API response:
```bash
curl http://localhost:5001/api/inventory?page=1 | jq '.data[0].custom_field_values'
```

### Issue: "Connection error"

**Solution:**
1. Check proxy is running: `ps aux | grep wholecell-proxy`
2. Test health: `curl http://localhost:5001/api/health`
3. Restart proxy: `python3 wholecell-proxy.py`

### Issue: "Getting rate limited"

**Solution:**
- Tool already delays 500ms between pages
- If still getting rate limited, reduce PAGES_TO_ANALYZE in test-api-fields.html

---

## 📚 Next Steps

After exploring your fields:

1. **Document what you found**
   - Save screenshots from the explorer tool
   - Note which custom fields exist
   - Note which ones are critical vs nice-to-have

2. **Prioritize implementation**
   - Start with IMEI Status (if exists)
   - Then Carrier/Network status
   - Then other custom fields

3. **Update code progressively**
   - Don't try to add everything at once
   - Start with data capture (transformer)
   - Then add display (UI)
   - Then add filtering (exports)

4. **Test thoroughly**
   - Test with your actual data
   - Verify exports have new fields
   - Verify filters work correctly

---

## 🆘 Need Help?

### Quick Reference:

**Documentation:**
- `API_FIELDS_EXPLORATION.md` - Complete field documentation
- `WHOLECELL_API_DOCUMENTATION.md` - API basics
- `EXPORT_GUIDE.md` - Export system guide

**Test Tools:**
- `test-api-fields.html` - Field explorer (USE THIS FIRST!)
- `test-wholecell-loading.html` - Load testing

**Key Files:**
- `wholecell-transformer.js` - Data transformation (ADD FIELDS HERE)
- `excel-export.js` - Export filtering (ADD FILTERS HERE)
- `room-workflow.js` - Main UI logic
- `dashboard_standalone.html` - UI display

---

## ✅ Success Checklist

- [ ] Ran field explorer tool
- [ ] Documented available custom fields
- [ ] Identified critical vs nice-to-have fields
- [ ] Updated transformer to capture new fields
- [ ] Added new fields to UI display
- [ ] Added filters for critical fields
- [ ] Tested exports with new filters
- [ ] Updated documentation for users

---

**Remember:** Start with field discovery, then implement progressively. Don't try to do everything at once!

**Time estimate:** 
- Field discovery: 15 minutes
- Basic implementation: 2-3 hours  
- Enhanced filtering: 3-4 hours
- Polish & testing: 2-3 hours

**Total: ~1 day of work for major enhancement**

---

**Ready to start?** Open `test-api-fields.html` in your browser and click "Discover All Fields"! 🚀

