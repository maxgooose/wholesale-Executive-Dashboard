# Excel Export - Quick Start Guide

## Opening the Export Modal

Click the **"Export to Excel"** button in the top navigation bar.

## Basic Export (3 Steps)

### Step 1: Choose Report Type
Select one of 6 report formats:
- ✅ **Grouped Breakdown** - Items grouped by model/storage (DEFAULT - your current format)
- 📋 **Detailed Item Listing** - One row per item
- 💰 **Pricing Breakdown** - With prices and values
- 📊 **Grade Analysis** - Quality statistics
- 📱 **Model Statistics** - Model-specific data
- 📈 **Summary Report** - High-level overview

### Step 2: Choose What to Export
Select which data to include:
- ✅ **Everything** - All inventory (DEFAULT)
- 🆕 **Recent Batch** - Latest upload/update
- ☑️ **Selected Items** - Items you checked
- 🏠 **By Room** - Specific location
- ⭐ **By Grade** - Specific grade(s)
- 📍 **By Status** - Specific status
- 📱 **By Model** - Specific model
- 📅 **Date Range** - Time period
- ⚙️ **Custom Filter** - Combine filters

### Step 3: Export
1. Review the blue preview box (shows item count)
2. Click **"Export to Excel"**
3. File downloads automatically

## Common Use Cases

### Export Recent Upload
```
1. Report Type: Grouped Breakdown
2. Data Filter: Recent Batch → Latest Upload
3. Click Export
```

### Export All Grade A Items
```
1. Report Type: Detailed Item Listing
2. Data Filter: By Grade → Check "Grade A"
3. Select desired columns
4. Click Export
```

### Export Available Inventory for Sale
```
1. Report Type: Pricing Breakdown
2. Data Filter: By Status → Available
3. Click Export
```

### Export Everything (Complete Inventory)
```
1. Report Type: Grouped Breakdown (or any)
2. Data Filter: Everything
3. Click Export
```

### Export Specific Model
```
1. Report Type: Model Statistics
2. Data Filter: By Model
3. Type model name in search box
4. Click Export
```

### Export This Week's Items
```
1. Report Type: Detailed Item Listing
2. Data Filter: Date Range
3. Set From date to start of week
4. Set To date to today
5. Click Export
```

### Export Grade A Available Items with Pricing
```
1. Report Type: Pricing Breakdown
2. Data Filter: Custom
3. Check "Filter by Grade" → Select "A"
4. Check "Filter by Status" → Select "Available"
5. Check "Only Items with Pricing"
6. Click Export
```

## Column Selection (for Detailed Listing)

When using "Detailed Item Listing":
1. The column selection panel appears
2. Check/uncheck columns you want
3. Use "Select All" or "Deselect All" for quick selection
4. Common combinations:
   - **Basic**: IMEI, Model, Grade, Status
   - **Full**: All columns selected
   - **Sales**: Model, Color, Storage, Grade, Price
   - **QC**: IMEI, Model, Grade, Battery, QC Notes

## Preview Box

The blue box at bottom shows what will be exported:
```
"Will export 150 items as 'Grouped Breakdown' using 'Everything' filter"
```
Always check this before exporting!

## Tips

💡 **Quick Full Export**: Just click Export with default settings

💡 **Recent Upload Check**: Use "Recent Batch → Latest Upload" after importing data

💡 **Sales Report**: Use "Pricing Breakdown" with "By Status → Available"

💡 **Quality Report**: Use "Grade Analysis" with "Everything"

💡 **Find Problems**: Use "Grade Analysis" to see distribution

💡 **Management Report**: Use "Summary Report" for high-level view

💡 **Detailed Check**: Use "Detailed Item Listing" when you need all info

## File Output

Files are automatically named:
- Format: `[report_type]_[YYYYMMDD].csv`
- Example: `grouped_breakdown_20250109.csv`
- Opens in Excel, Google Sheets, Numbers, etc.

## Keyboard Shortcuts

- **ESC** - Close modal
- **ENTER** - Export (when modal is open)

## Need Help?

See `EXPORT_GUIDE.md` for detailed documentation of all features.

## What's New?

✨ **New in this version:**
- 6 different report types (was 1)
- 9 data filtering options (was limited)
- Recent batch export (requested feature)
- Custom column selection
- Real-time preview
- Better UI/UX
- Model search
- Date range filtering
- Custom multi-filter







