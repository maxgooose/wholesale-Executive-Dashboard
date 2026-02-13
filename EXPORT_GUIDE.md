# Excel Export - User Guide

## Overview
The enhanced Excel Export feature provides flexible filtering and multiple report types to export your inventory data exactly how you need it.

## Report Types

### 1. **Grouped Breakdown** (Default)
- **Best for:** Quick inventory overview by model and storage
- **Format:** One row per model/storage combination
- **Columns:** Model, Storage, Grade counts (A, B, C, D, etc.), Total, Suggested Grade
- **Use case:** When you need to see how many items of each grade exist for each model

### 2. **Detailed Item Listing**
- **Best for:** Complete item-by-item export
- **Format:** One row per inventory item
- **Columns:** Customizable - select which columns to include
- **Use case:** When you need full details of each individual item

### 3. **Pricing Breakdown**
- **Best for:** Financial reporting and valuation
- **Format:** Grouped by model/storage with quantities and pricing
- **Columns:** Model, Storage, Quantities by grade, Prices by grade, Total Value
- **Use case:** When you need to calculate total inventory value

### 4. **Grade Analysis**
- **Best for:** Quality control and grade distribution reports
- **Format:** Statistical breakdown by grade
- **Columns:** Grade, Count, Percentage, Average Battery Health
- **Use case:** Understanding the overall quality distribution of inventory

### 5. **Model Statistics**
- **Best for:** Model-specific analytics
- **Format:** Statistics grouped by phone model
- **Columns:** Model, Total Count, Grade distribution, Average Battery
- **Use case:** Identifying which models are most common and their conditions

### 6. **Summary Report**
- **Best for:** High-level overview
- **Format:** Key metrics and distributions
- **Includes:** Total counts, grade distribution, status distribution
- **Use case:** Quick snapshot for reporting or dashboards

## Data Filtering Options

### Everything
- Exports all inventory data
- No filters applied
- **Best for:** Complete inventory exports

### Recent Batch
- Exports only recently uploaded/updated items
- **Options:**
  - Latest Upload: Items from the most recent data import
  - Today's Updates: Items updated today
  - Last Hour: Items updated in the past hour
- **Best for:** Verifying new inventory uploads

### Selected Items
- Exports only items you've checked in the table
- **Best for:** Custom selections, specific items

### By Room
- Filter by storage location/room
- Select which room to export
- **Best for:** Room-specific inventory reports

### By Grade
- Filter by quality grade(s)
- Select multiple grades: A, A+, B, C, C (AMZ), D, Defective
- **Best for:** Exporting only specific quality items

### By Status
- Filter by item status
- Options: Available, Sold, Locked, Defective
- **Best for:** Status-specific reports (e.g., only available items)

### By Model
- Search and filter by phone model
- Type-ahead search for easy selection
- **Best for:** Model-specific exports

### Date Range
- Filter items by date
- Set From and To dates
- **Best for:** Time-period reports (e.g., monthly inventory)

### Custom Filter
- Combine multiple filters
- Options:
  - Filter by Grade (multiple selection)
  - Filter by Status (multiple selection)
  - Only Items with Pricing (items that have pricing data)
- **Best for:** Complex filtering needs

## Column Selection (for Detailed Listing)

When using "Detailed Item Listing" report type, you can choose which columns to export:

- **IMEI/Serial** - Device identifier
- **Model** - Phone model
- **Color** - Device color
- **Storage** - Storage capacity
- **Room** - Current location
- **Status** - Item status
- **Grade** - Quality grade
- **Battery Health** - Battery percentage
- **QC Notes** - Quality control notes
- **Carrier** - Mobile carrier
- **Estimated Price** - Calculated price based on grade
- **Last Updated** - Last modification date

Use "Select All" or "Deselect All" buttons for quick column management.

## Export Summary

The blue info box at the bottom of the export modal shows:
- Number of items that will be exported
- Selected report type
- Active filters

Review this before exporting to ensure you're getting the right data.

## Tips & Best Practices

1. **Start with "Everything"** to get a complete export, then use filters for specific needs
2. **Use Recent Batch** after uploading new inventory to verify the import
3. **Use Pricing Breakdown** for financial reports and valuation
4. **Combine Custom Filters** for complex reporting needs (e.g., Grade A items that are Available and have pricing)
5. **Save different report types** for different audiences (Summary for management, Detailed for operations)

## File Format

All exports are in CSV (Comma-Separated Values) format which can be opened in:
- Microsoft Excel
- Google Sheets
- Apple Numbers
- Any spreadsheet application

Files are named automatically: `[report_type]_[YYYYMMDD].csv`

## Export History

All exports are logged in the Update History panel, including:
- Export date and time
- Report type
- Number of items exported

Access via the "Update History" button in the header.

## Troubleshooting

**No data to export?**
- Check your filters - you may have filtered out all items
- Ensure inventory data is loaded
- Try "Everything" filter to see all available data

**Missing columns in export?**
- For Detailed Listing, ensure columns are checked
- Some reports have fixed column structures

**Wrong data exported?**
- Review the Export Summary before clicking Export
- Check that the correct Data Filter is selected
- Verify filter options (dates, grades, etc.) are set correctly

**Pricing data missing?**
- Pricing Breakdown requires pricing data to be entered
- Use the Pricing Dashboard to add/update prices
- Only items with pricing will show values

## Support

For issues or questions:
1. Check the Export Summary preview
2. Review your filter settings
3. Check the browser console for error messages
4. Verify inventory data is loaded correctly







