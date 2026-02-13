/**
 * Enhanced Excel Export Module with Advanced Filtering and Multiple Report Types
 * 
 * Sheet Types:
 * - Universal Summary: Complete inventory overview with all metrics
 * - Blueberry Regrade: Special regrade analysis sheet
 * - Location Summary: Breakdown by room/location
 * - Grouped Breakdown: By model & storage
 * - Detailed Listing: One row per item
 * - Pricing Report: With values
 * - Age Analysis: Inventory aging report
 * 
 * Filters:
 * - Location: Processing, Receiving, Ready Room, QC, Shipping
 * - Age: Today, 7 days, 30 days, 30+ days, 90+ days
 * - Grade: A, B, C, C (AMZ), D, Defective (multi-select)
 * - Status: Available, Sold, Processing, Locked, Reserved (multi-select)
 */
class ExcelExportManager {
    constructor() {
        this.selectedReportType = 'grouped_breakdown';
        this.selectedDataFilter = 'everything';
        this.selectedDataSource = 'wholecell';
        this.selectedLocationFilter = 'all';
        this.selectedAgeFilter = 'all';
        this.selectedGrades = [];
        this.selectedStatuses = [];
        this.customUploadedData = null;
        this.filterOptions = {};
        this.selectedColumns = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateExportSummary();
        this.updatePreviewStats();
    }

    setupEventListeners() {
        // Report type change
        document.querySelectorAll('input[name="reportType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.selectedReportType = e.target.value;
                this.toggleColumnSelection();
                this.updateExportSummary();
                this.updatePreviewStats();
            });
        });

        // Location filter change
        document.querySelectorAll('input[name="locationFilter"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.selectedLocationFilter = e.target.value;
                this.updateExportSummary();
                this.updatePreviewStats();
            });
        });

        // Age filter change
        document.querySelectorAll('input[name="ageFilter"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.selectedAgeFilter = e.target.value;
                this.updateExportSummary();
                this.updatePreviewStats();
            });
        });

        // Grade filter change (checkboxes)
        document.querySelectorAll('input[name="gradeFilter"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateGradeSelection();
                this.updateExportSummary();
                this.updatePreviewStats();
            });
        });

        // Status filter change (checkboxes)
        document.querySelectorAll('input[name="statusFilter"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateStatusSelection();
                this.updateExportSummary();
                this.updatePreviewStats();
            });
        });

        // Column selection changes
        document.querySelectorAll('.export-column').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateExportSummary();
            });
        });

        // Update preview when panel opens
        const exportPanel = document.getElementById('exportPanel');
        if (exportPanel) {
            const observer = new MutationObserver(() => {
                if (exportPanel.classList.contains('active')) {
                    this.updatePreviewStats();
                }
            });
            observer.observe(exportPanel, { attributes: true, attributeFilter: ['class'] });
        }
    }

    updateGradeSelection() {
        const allCheckbox = document.querySelector('input[name="gradeFilter"][value="all"]');
        const gradeCheckboxes = document.querySelectorAll('.grade-checkbox');
        
        if (allCheckbox?.checked) {
            this.selectedGrades = [];
        } else {
            this.selectedGrades = Array.from(gradeCheckboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value);
        }
    }

    updateStatusSelection() {
        const allCheckbox = document.querySelector('input[name="statusFilter"][value="all"]');
        const statusCheckboxes = document.querySelectorAll('.status-checkbox');
        
        if (allCheckbox?.checked) {
            this.selectedStatuses = [];
        } else {
            this.selectedStatuses = Array.from(statusCheckboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value);
        }
    }

    updatePreviewStats() {
        const data = this.getFilteredData();
        const itemCount = data.length;
        const modelCount = new Set(data.map(item => item.MODEL)).size;
        
        // Calculate estimated value (simplified)
        let estValue = 0;
        data.forEach(item => {
            if (item.cost) estValue += item.cost;
        });

        // Update preview stats in UI
        const itemCountEl = document.getElementById('previewItemCount');
        const modelCountEl = document.getElementById('previewModelCount');
        const estValueEl = document.getElementById('previewEstValue');

        if (itemCountEl) itemCountEl.textContent = itemCount.toLocaleString();
        if (modelCountEl) modelCountEl.textContent = modelCount.toLocaleString();
        if (estValueEl) estValueEl.textContent = '$' + estValue.toLocaleString(undefined, {maximumFractionDigits: 0});
    }

    toggleUploadPanel(source) {
        const panel = document.getElementById('customUploadPanel');
        if (source === 'upload') {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
            this.customUploadedData = null;
            document.getElementById('customSheetName').textContent = 'No file selected';
        }
    }

    async handleCustomSheetUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        document.getElementById('customSheetName').textContent = `Loading ${file.name}...`;

        try {
            // Use the inventory updater to parse the file
            if (window.inventoryUpdater) {
                const data = await inventoryUpdater.parseFile(file);
                this.customUploadedData = data;
                document.getElementById('customSheetName').textContent = `✓ ${file.name} (${data.length} items)`;
                this.updateExportSummary();
            } else {
                throw new Error('Inventory updater not available');
            }
        } catch (error) {
            console.error('Error loading custom sheet:', error);
            document.getElementById('customSheetName').textContent = '✗ Error loading file';
            alert('Failed to load file: ' + error.message);
        }
    }

    toggleColumnSelection() {
        const panel = document.getElementById('columnSelectionPanel');
        // Show column selection only for detailed listing report
        if (this.selectedReportType === 'detailed_listing') {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    }

    showFilterOptions(filterType) {
        // Hide all filter option panels first
        const allPanels = [
            'recentBatchOptions',
            'roomFilterOptions',
            'gradeFilterOptions',
            'statusFilterOptions',
            'modelFilterOptions',
            'dateRangeOptions',
            'customFilterOptions'
        ];

        allPanels.forEach(panelId => {
            document.getElementById(panelId)?.classList.add('hidden');
        });

        // Show the filter options panel
        const mainPanel = document.getElementById('filterOptionsPanel');

        if (filterType === 'everything' || filterType === 'selected_items') {
            mainPanel.classList.add('hidden');
            return;
        }

        mainPanel.classList.remove('hidden');

        // Show specific filter panel
        const panelMap = {
            'recent_batch': 'recentBatchOptions',
            'by_room': 'roomFilterOptions',
            'by_grade': 'gradeFilterOptions',
            'by_status': 'statusFilterOptions',
            'by_model': 'modelFilterOptions',
            'date_range': 'dateRangeOptions',
            'custom': 'customFilterOptions'
        };

        const panelToShow = panelMap[filterType];
        if (panelToShow) {
            document.getElementById(panelToShow)?.classList.remove('hidden');
        }
    }

    showModelSuggestions(searchTerm) {
        if (!searchTerm || !window.inventoryData) return;

        const models = [...new Set(inventoryData.map(item => item.MODEL))];
        const filtered = models.filter(model => 
            model && model.toLowerCase().includes(searchTerm.toLowerCase())
        ).slice(0, 10);

        const container = document.getElementById('modelSuggestions');
        if (!container) return;

        container.innerHTML = filtered.map(model => `
            <div class="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b" 
                 onclick="excelExportManager.selectModel('${model}')">
                ${model}
            </div>
        `).join('');
    }

    selectModel(model) {
        document.getElementById('modelSearchInput').value = model;
        document.getElementById('modelSuggestions').innerHTML = '';
    }

    getFilteredData() {
        // Use Wholecell data (current inventory system)
        if (!window.inventoryData) {
            console.error('Wholecell inventory data not available');
            return [];
        }
        
        let filtered = [...window.inventoryData];

        // Apply location filter
        if (this.selectedLocationFilter && this.selectedLocationFilter !== 'all') {
            filtered = filtered.filter(item => {
                const location = item.location || '';
                return location.toLowerCase().includes(this.selectedLocationFilter.toLowerCase());
            });
        }

        // Apply age filter
        if (this.selectedAgeFilter && this.selectedAgeFilter !== 'all') {
            const now = new Date();
            filtered = filtered.filter(item => {
                const createdAt = new Date(item.created_at || item.lastUpdated);
                if (isNaN(createdAt.getTime())) return true; // Include items without date
                
                const ageInDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
                
                switch (this.selectedAgeFilter) {
                    case 'today':
                        return ageInDays === 0;
                    case '7days':
                        return ageInDays <= 7;
                    case '30days':
                        return ageInDays <= 30;
                    case '30plus':
                        return ageInDays > 30;
                    case '90plus':
                        return ageInDays > 90;
                    default:
                        return true;
                }
            });
        }

        // Apply grade filter (if specific grades selected)
        if (this.selectedGrades.length > 0) {
            filtered = filtered.filter(item => {
                const grade = (item.GRADE || '').trim();
                return this.selectedGrades.some(g => 
                    grade === g || 
                    (g === 'C (AMZ)' && (grade === 'C-AMZ' || grade === 'C(AMZ)'))
                );
            });
        }

        // Apply status filter (if specific statuses selected)
        if (this.selectedStatuses.length > 0) {
            filtered = filtered.filter(item => {
                const status = (item.STATUS || '').toUpperCase();
                return this.selectedStatuses.includes(status);
            });
        }

        return filtered;
    }

    filterByBatch(data, batchType) {
        if (!window.updateHistoryManager) return data;

        const now = new Date();
        let cutoffTime;

        switch (batchType) {
            case 'latest':
                // Get the most recent upload from history
                const latestUpdate = updateHistoryManager.updates.find(u => u.action === 'Data Import');
                if (latestUpdate) {
                    cutoffTime = new Date(latestUpdate.timestamp);
                } else {
                    cutoffTime = new Date(now - 24 * 60 * 60 * 1000); // Last 24 hours fallback
                }
                break;
            case 'today':
                cutoffTime = new Date(now.setHours(0, 0, 0, 0));
                break;
            case 'last_hour':
                cutoffTime = new Date(now - 60 * 60 * 1000);
                break;
        }

        return data.filter(item => {
            const itemDate = new Date(item.lastUpdated || item.timestamp || 0);
            return itemDate >= cutoffTime;
        });
    }

    filterByDateRange(data, dateFrom, dateTo) {
        return data.filter(item => {
            const itemDate = new Date(item.lastUpdated || item.timestamp || 0);
            if (dateFrom && itemDate < new Date(dateFrom)) return false;
            if (dateTo && itemDate > new Date(dateTo)) return false;
            return true;
        });
    }

    applyCustomFilters(data) {
        let filtered = data;

        // Grade filter
        if (document.getElementById('customGradeFilter')?.checked) {
            const selectedGrades = Array.from(
                document.querySelectorAll('#customGradeList input[type="checkbox"]:checked')
            ).map(cb => cb.value);
            if (selectedGrades.length > 0) {
                filtered = filtered.filter(item => selectedGrades.includes(item.GRADE));
            }
        }

        // Status filter (Multi-select)
        if (document.getElementById('customStatusFilter')?.checked) {
            const selectedStatuses = Array.from(
                document.querySelectorAll('#customStatusList input[type="checkbox"]:checked')
            ).map(cb => cb.value);
            if (selectedStatuses.length > 0) {
                filtered = filtered.filter(item => selectedStatuses.includes(item.STATUS));
            }
        }

        // === NEW: Network/Carrier Filter ===
        if (document.getElementById('customNetworkFilter')?.checked) {
            // Check for "Unlocked Only" checkbox
            const unlockedOnly = document.getElementById('unlockedOnlyCheckbox')?.checked;
            if (unlockedOnly) {
                filtered = filtered.filter(item => item.IS_UNLOCKED === true);
            } else {
                // Multi-select by specific carriers
                const selectedNetworks = Array.from(
                    document.querySelectorAll('#customNetworkList input[type="checkbox"]:checked')
                ).map(cb => cb.value);
                if (selectedNetworks.length > 0) {
                    filtered = filtered.filter(item => selectedNetworks.includes(item.NETWORK));
                }
            }
        }

        // === NEW: Warehouse Filter ===
        if (document.getElementById('customWarehouseFilter')?.checked) {
            const selectedWarehouse = document.getElementById('warehouseSelect')?.value;
            if (selectedWarehouse && selectedWarehouse !== 'all') {
                filtered = filtered.filter(item => item.warehouse === selectedWarehouse);
            }
        }

        // === NEW: Location/Room Filter ===
        if (document.getElementById('customLocationFilter')?.checked) {
            const selectedLocations = Array.from(
                document.querySelectorAll('#customLocationList input[type="checkbox"]:checked')
            ).map(cb => cb.value);
            if (selectedLocations.length > 0) {
                filtered = filtered.filter(item => selectedLocations.includes(item.location));
            }
        }

        // === NEW: Custom Fields Filter ===
        if (document.getElementById('customFieldsFilter')?.checked) {
            // IMEI Status filter
            const imeiStatus = document.getElementById('imeiStatusSelect')?.value;
            if (imeiStatus && imeiStatus !== 'all') {
                filtered = filtered.filter(item => item.IMEI_STATUS === imeiStatus);
            }

            // Battery Percentage filter (minimum)
            const minBatteryPercent = document.getElementById('minBatteryPercent')?.value;
            if (minBatteryPercent) {
                filtered = filtered.filter(item => {
                    if (!item.BATTERY_PERCENTAGE) return false;
                    const percent = parseInt(item.BATTERY_PERCENTAGE.replace('%', ''));
                    return !isNaN(percent) && percent >= parseInt(minBatteryPercent);
                });
            }

            // Screen Condition filter
            const screenCondition = document.getElementById('screenConditionSelect')?.value;
            if (screenCondition && screenCondition !== 'all') {
                filtered = filtered.filter(item => item.SCREEN_CONDITION === screenCondition);
            }

            // iCloud Status filter (for iOS devices)
            const icloudStatus = document.getElementById('icloudStatusSelect')?.value;
            if (icloudStatus && icloudStatus !== 'all') {
                filtered = filtered.filter(item => item.ICLOUD_STATUS === icloudStatus);
            }

            // FRP Status filter (for Android devices)
            const frpStatus = document.getElementById('frpStatusSelect')?.value;
            if (frpStatus && frpStatus !== 'all') {
                filtered = filtered.filter(item => item.FRP_STATUS === frpStatus);
            }
        }

        // Price filter
        if (document.getElementById('customPriceFilter')?.checked) {
            filtered = filtered.filter(item => item.pricing || item.estimatedValue);
        }

        return filtered;
    }

    getSelectedColumns() {
        return Array.from(document.querySelectorAll('.export-column:checked'))
            .map(cb => cb.dataset.column);
    }

    updateExportSummary() {
        const summaryElement = document.getElementById('exportSummary');
        if (!summaryElement) return;

        const filteredData = this.getFilteredData();
        const reportTypeName = this.getReportTypeName(this.selectedReportType);
        
        // Build filter description
        const filters = [];
        if (this.selectedLocationFilter && this.selectedLocationFilter !== 'all') {
            filters.push(`📍 ${this.selectedLocationFilter}`);
        }
        if (this.selectedAgeFilter && this.selectedAgeFilter !== 'all') {
            filters.push(`📅 ${this.getAgeFilterName(this.selectedAgeFilter)}`);
        }
        if (this.selectedGrades.length > 0) {
            filters.push(`🏷️ Grades: ${this.selectedGrades.join(', ')}`);
        }
        if (this.selectedStatuses.length > 0) {
            filters.push(`📋 Status: ${this.selectedStatuses.join(', ')}`);
        }

        const filterText = filters.length > 0 
            ? `\n\nFilters: ${filters.join(' | ')}`
            : '';

        summaryElement.innerHTML = `
            <strong>${filteredData.length.toLocaleString()}</strong> items will be exported as 
            <strong>${reportTypeName}</strong>${filterText}
        `;
    }

    getReportTypeName(type) {
        const names = {
            'grouped_breakdown': 'Grouped Breakdown',
            'detailed_listing': 'Detailed Item Listing',
            'pricing_breakdown': 'Pricing Breakdown',
            'grade_analysis': 'Grade Analysis',
            'model_statistics': 'Model Statistics',
            'summary_report': 'Summary Report',
            'universal_summary': 'Universal Summary',
            'blueberry_regrade': 'Blueberry Regrade',
            'location_report': 'Location Report',
            'age_analysis': 'Age Analysis'
        };
        return names[type] || type;
    }

    getAgeFilterName(filter) {
        const names = {
            'all': 'All Time',
            'today': 'Today',
            '7days': 'Last 7 Days',
            '30days': 'Last 30 Days',
            '30plus': '30+ Days Old',
            '90plus': '90+ Days Old'
        };
        return names[filter] || filter;
    }

    getDataFilterName(filter) {
        const names = {
            'everything': 'All Data',
            'recent_batch': 'Recent Batch',
            'selected_items': 'Selected Items',
            'by_room': 'By Room',
            'by_grade': 'By Grade',
            'by_status': 'By Status',
            'by_model': 'By Model',
            'date_range': 'Date Range',
            'custom': 'Custom Filters'
        };
        return names[filter] || filter;
    }

    async export() {
        const spinner = document.getElementById('exportSpinner');
        if (spinner) spinner.classList.remove('hidden');

        try {
            // Validate data source
            if (this.selectedDataSource === 'upload' && !this.customUploadedData) {
                alert('Please upload a custom sheet first');
                if (spinner) spinner.classList.add('hidden');
                return;
            }

            const data = this.getFilteredData();

            if (data.length === 0) {
                alert('No data to export with the current filters');
                if (spinner) spinner.classList.add('hidden');
                return;
            }

            let exportData;
            let filename;

            switch (this.selectedReportType) {
                case 'grouped_breakdown':
                    exportData = await this.generateGroupedBreakdown(data);
                    filename = 'grouped_breakdown';
                    break;
                case 'detailed_listing':
                    exportData = await this.generateDetailedListing(data);
                    filename = 'detailed_listing';
                    break;
                case 'pricing_breakdown':
                    exportData = await this.generatePricingBreakdown(data);
                    filename = 'pricing_breakdown';
                    break;
                case 'grade_analysis':
                    exportData = await this.generateGradeAnalysis(data);
                    filename = 'grade_analysis';
                    break;
                case 'model_statistics':
                    exportData = this.generateModelStatistics(data);
                    filename = 'model_statistics';
                    break;
                case 'summary_report':
                    exportData = this.generateSummaryReport(data);
                    filename = 'summary_report';
                    break;
                case 'universal_summary':
                    exportData = await this.generateUniversalSummary(data);
                    filename = 'universal_summary';
                    break;
                case 'blueberry_regrade':
                    exportData = await this.generateBlueberryRegrade(data);
                    filename = 'blueberry_regrade';
                    break;
                case 'location_report':
                    exportData = this.generateLocationReport(data);
                    filename = 'location_report';
                    break;
                case 'age_analysis':
                    exportData = this.generateAgeAnalysis(data);
                    filename = 'age_analysis';
                    break;
                default:
                    exportData = await this.generateGroupedBreakdown(data);
                    filename = 'export';
            }

            // Add data source prefix to filename
            const sourcePrefix = this.selectedDataSource === 'wholecell' ? 'wholecell' : 'custom';
            this.downloadCSV(exportData.csv, exportData.headers, `${sourcePrefix}_${filename}_${this.formatDate(new Date())}.csv`);

            // Log export to history
            if (window.updateHistoryManager) {
                const dataSourceLabel = this.selectedDataSource === 'wholecell' ? 'Wholecell' : 'Custom Upload';
                updateHistoryManager.addUpdate({
                    action: 'Export',
                    format: this.selectedReportType,
                    source: dataSourceLabel,
                    count: data.length,
                    description: `Exported ${data.length} items from ${dataSourceLabel}`
                });
            }

            setTimeout(() => {
                closeExcelExport();
                this.showExportSuccess();
                
                // Reset custom upload if it was used
                if (this.selectedDataSource === 'upload') {
                    this.resetCustomUpload();
                }
            }, 1000);

        } catch (error) {
            console.error('Export error:', error);
            alert('Failed to export data: ' + error.message);
        } finally {
            if (spinner) spinner.classList.add('hidden');
        }
    }

    resetCustomUpload() {
        this.customUploadedData = null;
        const fileInput = document.getElementById('customSheetUpload');
        if (fileInput) fileInput.value = '';
        document.getElementById('customSheetName').textContent = 'No file selected';
        
        // Switch back to Wholecell data
        const wholecellRadio = document.querySelector('input[name="dataSource"][value="wholecell"]');
        if (wholecellRadio) wholecellRadio.checked = true;
        this.selectedDataSource = 'wholecell';
        this.toggleUploadPanel('wholecell');
    }

    async generateGroupedBreakdown(data) {
        const headers = ['PHONE/MODEL', 'STORAGE', 'A', 'B', 'C', 'C (AMZ)', 'D', 'Defective', 'LOCKED', 'TOTAL', 'PRICE A', 'PRICE B', 'PRICE C', 'PRICE C(AMZ)', 'PRICE D', 'PRICE DEF', 'EST. VALUE', 'PRICING STATUS'];
        const breakdown = {};

        data.forEach(item => {
            const model = item.MODEL || 'Unknown';
            const storage = item.STORAGE || 'Unknown';
            const key = `${model}_${storage}`;

            if (!breakdown[key]) {
                breakdown[key] = {
                    'PHONE/MODEL': model,
                    'STORAGE': storage,
                    'A': 0,
                    'B': 0,
                    'C': 0,
                    'C (AMZ)': 0,
                    'D': 0,
                    'Defective': 0,
                    'LOCKED': 0,
                    'TOTAL': 0
                };
            }

            const grade = (item.GRADE || '').trim();
            const status = (item.STATUS || '').toUpperCase();

            if (status.includes('LOCKED') || status.includes('LOCK')) {
                breakdown[key]['LOCKED']++;
            } else if (status.includes('DEFECT') || grade.toUpperCase() === 'DEFECTIVE') {
                breakdown[key]['Defective']++;
            } else {
                // Exact match for all grades
                if (grade === 'A') {
                    breakdown[key]['A']++;
                } else if (grade === 'B') {
                    breakdown[key]['B']++;
                } else if (grade === 'C') {
                    breakdown[key]['C']++;
                } else if (grade === 'C (AMZ)' || grade === 'C-AMZ' || grade === 'C(AMZ)') {
                    breakdown[key]['C (AMZ)']++;
                } else if (grade === 'D') {
                    breakdown[key]['D']++;
                } else if (grade) {
                    // Unknown grades default to C
                    breakdown[key]['C']++;
                }
            }

            breakdown[key]['TOTAL']++;
        });

        // Fetch pricing data for each model+storage combination
        if (window.pricingDB) {
            for (const key of Object.keys(breakdown)) {
                const row = breakdown[key];
                try {
                    const pricing = await pricingDB.getModelPrice(row['PHONE/MODEL'], row['STORAGE']);
                    if (pricing) {
                        row['PRICE A'] = pricing.gradeA.toFixed(2);
                        row['PRICE B'] = pricing.gradeB.toFixed(2);
                        row['PRICE C'] = pricing.gradeC.toFixed(2);
                        row['PRICE C(AMZ)'] = pricing.gradeCAMZ.toFixed(2);
                        row['PRICE D'] = pricing.gradeD.toFixed(2);
                        row['PRICE DEF'] = pricing.defective.toFixed(2);
                        
                        // Calculate estimated value
                        const estValue = 
                            (row['A'] * pricing.gradeA) +
                            (row['B'] * pricing.gradeB) +
                            (row['C'] * pricing.gradeC) +
                            (row['C (AMZ)'] * pricing.gradeCAMZ) +
                            (row['D'] * pricing.gradeD) +
                            (row['Defective'] * pricing.defective);
                        row['EST. VALUE'] = estValue.toFixed(2);
                        row['PRICING STATUS'] = 'Priced';
                    } else {
                        row['PRICE A'] = '-';
                        row['PRICE B'] = '-';
                        row['PRICE C'] = '-';
                        row['PRICE C(AMZ)'] = '-';
                        row['PRICE D'] = '-';
                        row['PRICE DEF'] = '-';
                        row['EST. VALUE'] = '-';
                        row['PRICING STATUS'] = 'Not Priced';
                    }
                } catch (error) {
                    console.error('Error loading pricing for export:', error);
                    row['PRICE A'] = '-';
                    row['PRICE B'] = '-';
                    row['PRICE C'] = '-';
                    row['PRICE C(AMZ)'] = '-';
                    row['PRICE D'] = '-';
                    row['PRICE DEF'] = '-';
                    row['EST. VALUE'] = '-';
                    row['PRICING STATUS'] = 'Error';
                }
            }
        } else {
            // If pricingDB not available, set all to N/A
            for (const key of Object.keys(breakdown)) {
                const row = breakdown[key];
                row['PRICE A'] = 'N/A';
                row['PRICE B'] = 'N/A';
                row['PRICE C'] = 'N/A';
                row['PRICE C(AMZ)'] = 'N/A';
                row['PRICE D'] = 'N/A';
                row['PRICE DEF'] = 'N/A';
                row['EST. VALUE'] = 'N/A';
                row['PRICING STATUS'] = 'No DB';
            }
        }

        const rows = Object.values(breakdown);
        const csv = this.convertToCSV(rows, headers);

        return { headers, csv, rows };
    }

    async generateDetailedListing(data) {
        const selectedColumns = this.getSelectedColumns();
        const headers = [];
        const columnMap = {
            'imei': { header: 'IMEI/Serial', field: 'IMEI/ SERIAL NO.' },
            'model': { header: 'Model', field: 'MODEL' },
            'color': { header: 'Color', field: 'COLOR' },
            'storage': { header: 'Storage', field: 'STORAGE' },
            'room': { header: 'Room', field: 'source' },
            'status': { header: 'Status', field: 'STATUS' },
            'grade': { header: 'Grade', field: 'GRADE' },
            'battery': { header: 'Battery Health', field: 'BATTERY HEALTH' },
            'qc_notes': { header: 'QC Notes', field: 'qcNotes' },
            'carrier': { header: 'Carrier', field: 'CARRIER' },
            'price': { header: 'Estimated Price', field: 'estimatedValue' },
            'last_updated': { header: 'Last Updated', field: 'lastUpdated' }
        };

        // Fetch pricing for items if price column is selected
        if (selectedColumns.includes('price') && window.pricingDB) {
            for (const item of data) {
                if (item.MODEL && item.STORAGE) {
                    try {
                        const pricing = await pricingDB.getModelPrice(item.MODEL, item.STORAGE);
                        if (pricing) {
                            const gradeMap = {
                                'A': pricing.gradeA,
                                'B': pricing.gradeB,
                                'C': pricing.gradeC,
                                'C (AMZ)': pricing.gradeCAMZ,
                                'D': pricing.gradeD,
                                'Defective': pricing.defective
                            };
                            item.estimatedValue = gradeMap[item.GRADE] ? `$${gradeMap[item.GRADE].toFixed(2)}` : '-';
                        }
                    } catch (error) {
                        console.error('Error fetching pricing:', error);
                    }
                }
            }
        }

        const rows = data.map(item => {
            const row = {};
            selectedColumns.forEach(col => {
                const mapping = columnMap[col];
                if (mapping) {
                    row[mapping.header] = item[mapping.field] || '-';
                }
            });
            return row;
        });

        selectedColumns.forEach(col => {
            if (columnMap[col]) headers.push(columnMap[col].header);
        });

        const csv = this.convertToCSV(rows, headers);
        return { headers, csv, rows };
    }

    async generatePricingBreakdown(data) {
        const headers = ['PHONE/MODEL', 'STORAGE', 'QTY A', 'QTY B', 'QTY C', 'QTY D', 'TOTAL QTY', 'PRICE A', 'PRICE B', 'PRICE C', 'PRICE D', 'TOTAL VALUE'];
        const breakdown = {};

        // Count items by model, storage, and grade
        data.forEach(item => {
            const key = `${item.MODEL}_${item.STORAGE}`;
            if (!breakdown[key]) {
                breakdown[key] = {
                    'PHONE/MODEL': item.MODEL,
                    'STORAGE': item.STORAGE,
                    'QTY A': 0,
                    'QTY B': 0,
                    'QTY C': 0,
                    'QTY D': 0,
                    'TOTAL QTY': 0,
                    'PRICE A': 0,
                    'PRICE B': 0,
                    'PRICE C': 0,
                    'PRICE D': 0,
                    'TOTAL VALUE': 0
                };
            }

            const grade = (item.GRADE || '').toUpperCase();
            breakdown[key]['TOTAL QTY']++;

            switch (grade) {
                case 'A':
                    breakdown[key]['QTY A']++;
                    break;
                case 'B':
                    breakdown[key]['QTY B']++;
                    break;
                case 'C':
                case 'C (AMZ)':
                    breakdown[key]['QTY C']++;
                    break;
                case 'D':
                case 'DEFECTIVE':
                    breakdown[key]['QTY D']++;
                    break;
            }
        });

        // Get pricing data if available
        if (window.pricingDB) {
            for (const key of Object.keys(breakdown)) {
                const row = breakdown[key];
                try {
                    const pricing = await pricingDB.getModelPrice(row['PHONE/MODEL'], row['STORAGE']);
                    if (pricing) {
                        row['PRICE A'] = pricing.gradeA || 0;
                        row['PRICE B'] = pricing.gradeB || 0;
                        row['PRICE C'] = pricing.gradeC || 0;
                        row['PRICE C (AMZ)'] = pricing.gradeCAMZ || 0;
                        row['PRICE D'] = pricing.gradeD || 0;
                        row['TOTAL VALUE'] = 
                            (row['QTY A'] * row['PRICE A']) +
                            (row['QTY B'] * row['PRICE B']) +
                            (row['QTY C'] * row['PRICE C']) +
                            (row['QTY D'] * row['PRICE D']);
                    }
                } catch (error) {
                    console.error('Error loading pricing:', error);
                }
            }
        }

        const rows = Object.values(breakdown);
        const csv = this.convertToCSV(rows, headers);

        return { headers, csv, rows };
    }

    async generateGradeAnalysis(data) {
        const headers = ['Grade', 'Count', 'Percentage', 'Avg Battery Health', 'Est. Total Value'];
        const gradeStats = {};

        data.forEach(item => {
            const grade = item.GRADE || 'Unknown';
            if (!gradeStats[grade]) {
                gradeStats[grade] = {
                    'Grade': grade,
                    'Count': 0,
                    'Percentage': 0,
                    'Avg Battery Health': 0,
                    batteryTotal: 0,
                    batteryCount: 0
                };
            }

            gradeStats[grade]['Count']++;
            gradeStats[grade].items = gradeStats[grade].items || [];
            gradeStats[grade].items.push(item);

            const battery = parseInt(item['BATTERY HEALTH']);
            if (!isNaN(battery)) {
                gradeStats[grade].batteryTotal += battery;
                gradeStats[grade].batteryCount++;
            }
        });

        // Calculate estimated values for each grade
        if (window.pricingDB) {
            for (const grade of Object.keys(gradeStats)) {
                const stat = gradeStats[grade];
                let totalValue = 0;
                
                for (const item of stat.items) {
                    if (item.MODEL && item.STORAGE) {
                        try {
                            const pricing = await pricingDB.getModelPrice(item.MODEL, item.STORAGE);
                            if (pricing) {
                                const gradeMap = {
                                    'A': pricing.gradeA,
                                    'B': pricing.gradeB,
                                    'C': pricing.gradeC,
                                    'C (AMZ)': pricing.gradeCAMZ,
                                    'D': pricing.gradeD,
                                    'Defective': pricing.defective
                                };
                                totalValue += gradeMap[grade] || 0;
                            }
                        } catch (error) {
                            console.error('Error fetching pricing:', error);
                        }
                    }
                }
                
                stat['Est. Total Value'] = totalValue > 0 ? `$${totalValue.toFixed(2)}` : '-';
                delete stat.items;
            }
        }

        // Calculate percentages and averages
        const rows = Object.values(gradeStats).map(stat => {
            stat['Percentage'] = ((stat['Count'] / data.length) * 100).toFixed(2) + '%';
            stat['Avg Battery Health'] = stat.batteryCount > 0 
                ? (stat.batteryTotal / stat.batteryCount).toFixed(0) + '%'
                : 'N/A';
            if (!stat['Est. Total Value']) stat['Est. Total Value'] = 'N/A';
            delete stat.batteryTotal;
            delete stat.batteryCount;
            return stat;
        });

        const csv = this.convertToCSV(rows, headers);
        return { headers, csv, rows };
    }

    generateModelStatistics(data) {
        const headers = ['Model', 'Total Count', 'Grade A', 'Grade B', 'Grade C', 'Grade D', 'Avg Battery'];
        const modelStats = {};

        data.forEach(item => {
            const model = item.MODEL || 'Unknown';
            if (!modelStats[model]) {
                modelStats[model] = {
                    'Model': model,
                    'Total Count': 0,
                    'Grade A': 0,
                    'Grade B': 0,
                    'Grade C': 0,
                    'Grade D': 0,
                    'Avg Battery': 0,
                    batteryTotal: 0,
                    batteryCount: 0
                };
            }

            modelStats[model]['Total Count']++;

            const grade = (item.GRADE || '').toUpperCase();
            if (grade === 'A') modelStats[model]['Grade A']++;
            else if (grade === 'B') modelStats[model]['Grade B']++;
            else if (grade === 'C' || grade === 'C (AMZ)') modelStats[model]['Grade C']++;
            else if (grade === 'D' || grade === 'DEFECTIVE') modelStats[model]['Grade D']++;

            const battery = parseInt(item['BATTERY HEALTH']);
            if (!isNaN(battery)) {
                modelStats[model].batteryTotal += battery;
                modelStats[model].batteryCount++;
            }
        });

        const rows = Object.values(modelStats)
            .map(stat => {
                stat['Avg Battery'] = stat.batteryCount > 0 
                    ? (stat.batteryTotal / stat.batteryCount).toFixed(0) + '%'
                    : 'N/A';
                delete stat.batteryTotal;
                delete stat.batteryCount;
                return stat;
            })
            .sort((a, b) => b['Total Count'] - a['Total Count']);

        const csv = this.convertToCSV(rows, headers);
        return { headers, csv, rows };
    }

    generateSummaryReport(data) {
        const headers = ['Metric', 'Value'];
        const totalItems = data.length;
        const grades = {};
        const statuses = {};
        let batteryTotal = 0;
        let batteryCount = 0;

        data.forEach(item => {
            grades[item.GRADE] = (grades[item.GRADE] || 0) + 1;
            statuses[item.STATUS] = (statuses[item.STATUS] || 0) + 1;

            const battery = parseInt(item['BATTERY HEALTH']);
            if (!isNaN(battery)) {
                batteryTotal += battery;
                batteryCount++;
            }
        });

        const rows = [
            { 'Metric': 'Total Items', 'Value': totalItems },
            { 'Metric': 'Unique Models', 'Value': new Set(data.map(i => i.MODEL)).size },
            { 'Metric': 'Avg Battery Health', 'Value': batteryCount > 0 ? (batteryTotal / batteryCount).toFixed(0) + '%' : 'N/A' },
            { 'Metric': '---', 'Value': '---' },
            { 'Metric': 'Grade Distribution', 'Value': '' }
        ];

        Object.entries(grades).forEach(([grade, count]) => {
            rows.push({
                'Metric': `  ${grade}`,
                'Value': `${count} (${((count / totalItems) * 100).toFixed(1)}%)`
            });
        });

        rows.push({ 'Metric': '---', 'Value': '---' });
        rows.push({ 'Metric': 'Status Distribution', 'Value': '' });

        Object.entries(statuses).forEach(([status, count]) => {
            rows.push({
                'Metric': `  ${status}`,
                'Value': `${count} (${((count / totalItems) * 100).toFixed(1)}%)`
            });
        });

        const csv = this.convertToCSV(rows, headers);
        return { headers, csv, rows };
    }

    /**
     * Universal Summary - Complete inventory overview with all metrics
     */
    async generateUniversalSummary(data) {
        const headers = [
            'MODEL', 'STORAGE', 'MANUFACTURER', 'NETWORK',
            'GRADE A', 'GRADE B', 'GRADE C', 'GRADE C (AMZ)', 'GRADE D', 'DEFECTIVE', 'LOCKED',
            'TOTAL QTY', 'AVAILABLE', 'SOLD', 'PROCESSING',
            'PRICE A', 'PRICE B', 'PRICE C', 'PRICE C(AMZ)', 'PRICE D', 'PRICE DEF',
            'EST. VALUE', 'AVG AGE (DAYS)', 'LOCATIONS'
        ];

        const breakdown = {};
        const now = new Date();

        data.forEach(item => {
            const model = item.MODEL || 'Unknown';
            const storage = item.STORAGE || 'Unknown';
            const key = `${model}_${storage}`;

            if (!breakdown[key]) {
                breakdown[key] = {
                    'MODEL': model,
                    'STORAGE': storage,
                    'MANUFACTURER': item.manufacturer || 'Unknown',
                    'NETWORK': item.NETWORK || 'Unknown',
                    'GRADE A': 0, 'GRADE B': 0, 'GRADE C': 0, 'GRADE C (AMZ)': 0, 
                    'GRADE D': 0, 'DEFECTIVE': 0, 'LOCKED': 0,
                    'TOTAL QTY': 0, 'AVAILABLE': 0, 'SOLD': 0, 'PROCESSING': 0,
                    locations: new Set(),
                    totalAge: 0,
                    ageCount: 0
                };
            }

            const grade = (item.GRADE || '').trim();
            const status = (item.STATUS || '').toUpperCase();

            // Count by grade
            if (grade === 'A') breakdown[key]['GRADE A']++;
            else if (grade === 'B') breakdown[key]['GRADE B']++;
            else if (grade === 'C') breakdown[key]['GRADE C']++;
            else if (grade === 'C (AMZ)' || grade === 'C-AMZ' || grade === 'C(AMZ)') breakdown[key]['GRADE C (AMZ)']++;
            else if (grade === 'D') breakdown[key]['GRADE D']++;
            else if (grade.toUpperCase() === 'DEFECTIVE') breakdown[key]['DEFECTIVE']++;

            // Count by status
            if (status.includes('LOCK')) breakdown[key]['LOCKED']++;
            if (status === 'AVAILABLE') breakdown[key]['AVAILABLE']++;
            if (status === 'SOLD') breakdown[key]['SOLD']++;
            if (status === 'PROCESSING') breakdown[key]['PROCESSING']++;

            breakdown[key]['TOTAL QTY']++;

            // Track locations
            if (item.location) breakdown[key].locations.add(item.location);

            // Calculate age
            const createdAt = new Date(item.created_at);
            if (!isNaN(createdAt.getTime())) {
                const ageInDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
                breakdown[key].totalAge += ageInDays;
                breakdown[key].ageCount++;
            }
        });

        // Fetch pricing and finalize rows
        for (const key of Object.keys(breakdown)) {
            const row = breakdown[key];
            
            // Calculate average age
            row['AVG AGE (DAYS)'] = row.ageCount > 0 
                ? Math.round(row.totalAge / row.ageCount) 
                : 'N/A';
            
            // Convert locations set to string
            row['LOCATIONS'] = Array.from(row.locations).join(', ') || 'N/A';
            delete row.locations;
            delete row.totalAge;
            delete row.ageCount;

            // Fetch pricing
            if (window.pricingDB) {
                try {
                    const pricing = await pricingDB.getModelPrice(row['MODEL'], row['STORAGE']);
                    if (pricing) {
                        row['PRICE A'] = pricing.gradeA.toFixed(2);
                        row['PRICE B'] = pricing.gradeB.toFixed(2);
                        row['PRICE C'] = pricing.gradeC.toFixed(2);
                        row['PRICE C(AMZ)'] = pricing.gradeCAMZ.toFixed(2);
                        row['PRICE D'] = pricing.gradeD.toFixed(2);
                        row['PRICE DEF'] = pricing.defective.toFixed(2);
                        
                        const estValue = 
                            (row['GRADE A'] * pricing.gradeA) +
                            (row['GRADE B'] * pricing.gradeB) +
                            (row['GRADE C'] * pricing.gradeC) +
                            (row['GRADE C (AMZ)'] * pricing.gradeCAMZ) +
                            (row['GRADE D'] * pricing.gradeD) +
                            (row['DEFECTIVE'] * pricing.defective);
                        row['EST. VALUE'] = estValue.toFixed(2);
                    } else {
                        row['PRICE A'] = row['PRICE B'] = row['PRICE C'] = row['PRICE C(AMZ)'] = row['PRICE D'] = row['PRICE DEF'] = '-';
                        row['EST. VALUE'] = '-';
                    }
                } catch (error) {
                    row['PRICE A'] = row['PRICE B'] = row['PRICE C'] = row['PRICE C(AMZ)'] = row['PRICE D'] = row['PRICE DEF'] = '-';
                    row['EST. VALUE'] = '-';
                }
            } else {
                row['PRICE A'] = row['PRICE B'] = row['PRICE C'] = row['PRICE C(AMZ)'] = row['PRICE D'] = row['PRICE DEF'] = 'N/A';
                row['EST. VALUE'] = 'N/A';
            }
        }

        const rows = Object.values(breakdown).sort((a, b) => b['TOTAL QTY'] - a['TOTAL QTY']);
        const csv = this.convertToCSV(rows, headers);
        return { headers, csv, rows };
    }

    /**
     * Blueberry Regrade - Special regrade analysis sheet
     * Shows items that might need regrading based on grade distribution and age
     */
    async generateBlueberryRegrade(data) {
        const headers = [
            'MODEL', 'STORAGE', 
            'TOTAL', 'A', 'B', 'C', 'C (AMZ)', 'D', 'DEFECTIVE',
            'A%', 'B%', 'C%', 'D%',
            'AVG AGE', 'OLDEST (DAYS)', 'NEWEST (DAYS)',
            'REGRADE POTENTIAL', 'SUGGESTED ACTION',
            'PRICE A', 'PRICE B', 'PRICE DIFF',
            'POTENTIAL VALUE GAIN'
        ];

        const breakdown = {};
        const now = new Date();

        data.forEach(item => {
            const model = item.MODEL || 'Unknown';
            const storage = item.STORAGE || 'Unknown';
            const key = `${model}_${storage}`;

            if (!breakdown[key]) {
                breakdown[key] = {
                    'MODEL': model,
                    'STORAGE': storage,
                    'TOTAL': 0, 'A': 0, 'B': 0, 'C': 0, 'C (AMZ)': 0, 'D': 0, 'DEFECTIVE': 0,
                    ages: [],
                    items: []
                };
            }

            const grade = (item.GRADE || '').trim();
            breakdown[key]['TOTAL']++;
            breakdown[key].items.push(item);

            if (grade === 'A') breakdown[key]['A']++;
            else if (grade === 'B') breakdown[key]['B']++;
            else if (grade === 'C') breakdown[key]['C']++;
            else if (grade === 'C (AMZ)' || grade === 'C-AMZ' || grade === 'C(AMZ)') breakdown[key]['C (AMZ)']++;
            else if (grade === 'D') breakdown[key]['D']++;
            else if (grade.toUpperCase() === 'DEFECTIVE') breakdown[key]['DEFECTIVE']++;

            // Track ages
            const createdAt = new Date(item.created_at);
            if (!isNaN(createdAt.getTime())) {
                const ageInDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
                breakdown[key].ages.push(ageInDays);
            }
        });

        // Calculate metrics and regrade potential
        for (const key of Object.keys(breakdown)) {
            const row = breakdown[key];
            const total = row['TOTAL'];
            
            // Calculate percentages
            row['A%'] = ((row['A'] / total) * 100).toFixed(1) + '%';
            row['B%'] = ((row['B'] / total) * 100).toFixed(1) + '%';
            row['C%'] = ((row['C'] / total) * 100).toFixed(1) + '%';
            row['D%'] = ((row['D'] / total) * 100).toFixed(1) + '%';

            // Age stats
            if (row.ages.length > 0) {
                row['AVG AGE'] = Math.round(row.ages.reduce((a, b) => a + b, 0) / row.ages.length);
                row['OLDEST (DAYS)'] = Math.max(...row.ages);
                row['NEWEST (DAYS)'] = Math.min(...row.ages);
            } else {
                row['AVG AGE'] = 'N/A';
                row['OLDEST (DAYS)'] = 'N/A';
                row['NEWEST (DAYS)'] = 'N/A';
            }

            // Calculate regrade potential
            // High potential if many B/C grades and older inventory
            const bcCount = row['B'] + row['C'] + row['C (AMZ)'];
            const bcPercent = (bcCount / total) * 100;
            const avgAge = typeof row['AVG AGE'] === 'number' ? row['AVG AGE'] : 0;

            if (bcPercent > 50 && avgAge > 30) {
                row['REGRADE POTENTIAL'] = 'HIGH';
                row['SUGGESTED ACTION'] = 'Review for upgrade to A';
            } else if (bcPercent > 30 && avgAge > 14) {
                row['REGRADE POTENTIAL'] = 'MEDIUM';
                row['SUGGESTED ACTION'] = 'Consider spot-check review';
            } else if (row['D'] + row['DEFECTIVE'] > total * 0.3) {
                row['REGRADE POTENTIAL'] = 'LOW';
                row['SUGGESTED ACTION'] = 'Review defective items';
            } else {
                row['REGRADE POTENTIAL'] = 'NONE';
                row['SUGGESTED ACTION'] = 'No action needed';
            }

            // Fetch pricing for value gain calculation
            if (window.pricingDB) {
                try {
                    const pricing = await pricingDB.getModelPrice(row['MODEL'], row['STORAGE']);
                    if (pricing) {
                        row['PRICE A'] = '$' + pricing.gradeA.toFixed(2);
                        row['PRICE B'] = '$' + pricing.gradeB.toFixed(2);
                        row['PRICE DIFF'] = '$' + (pricing.gradeA - pricing.gradeB).toFixed(2);
                        
                        // Potential value gain if B items upgraded to A
                        const potentialGain = row['B'] * (pricing.gradeA - pricing.gradeB);
                        row['POTENTIAL VALUE GAIN'] = '$' + potentialGain.toFixed(2);
                    } else {
                        row['PRICE A'] = row['PRICE B'] = row['PRICE DIFF'] = row['POTENTIAL VALUE GAIN'] = '-';
                    }
                } catch (error) {
                    row['PRICE A'] = row['PRICE B'] = row['PRICE DIFF'] = row['POTENTIAL VALUE GAIN'] = '-';
                }
            } else {
                row['PRICE A'] = row['PRICE B'] = row['PRICE DIFF'] = row['POTENTIAL VALUE GAIN'] = 'N/A';
            }

            delete row.ages;
            delete row.items;
        }

        const rows = Object.values(breakdown)
            .filter(row => row['TOTAL'] > 0)
            .sort((a, b) => {
                // Sort by regrade potential (HIGH > MEDIUM > LOW > NONE)
                const potentialOrder = { 'HIGH': 0, 'MEDIUM': 1, 'LOW': 2, 'NONE': 3 };
                return potentialOrder[a['REGRADE POTENTIAL']] - potentialOrder[b['REGRADE POTENTIAL']];
            });

        const csv = this.convertToCSV(rows, headers);
        return { headers, csv, rows };
    }

    /**
     * Location Report - Breakdown by room/location
     */
    generateLocationReport(data) {
        const headers = [
            'LOCATION', 
            'TOTAL ITEMS', 
            'GRADE A', 'GRADE B', 'GRADE C', 'GRADE D', 'DEFECTIVE',
            'AVAILABLE', 'SOLD', 'PROCESSING', 'LOCKED',
            'UNIQUE MODELS',
            'AVG AGE (DAYS)',
            'OLDEST ITEM (DAYS)'
        ];

        const breakdown = {};
        const now = new Date();

        data.forEach(item => {
            const location = item.location || 'Unknown';
            
            if (!breakdown[location]) {
                breakdown[location] = {
                    'LOCATION': location,
                    'TOTAL ITEMS': 0,
                    'GRADE A': 0, 'GRADE B': 0, 'GRADE C': 0, 'GRADE D': 0, 'DEFECTIVE': 0,
                    'AVAILABLE': 0, 'SOLD': 0, 'PROCESSING': 0, 'LOCKED': 0,
                    models: new Set(),
                    ages: []
                };
            }

            breakdown[location]['TOTAL ITEMS']++;
            breakdown[location].models.add(item.MODEL);

            const grade = (item.GRADE || '').trim();
            if (grade === 'A') breakdown[location]['GRADE A']++;
            else if (grade === 'B') breakdown[location]['GRADE B']++;
            else if (grade === 'C' || grade === 'C (AMZ)') breakdown[location]['GRADE C']++;
            else if (grade === 'D') breakdown[location]['GRADE D']++;
            else if (grade.toUpperCase() === 'DEFECTIVE') breakdown[location]['DEFECTIVE']++;

            const status = (item.STATUS || '').toUpperCase();
            if (status === 'AVAILABLE') breakdown[location]['AVAILABLE']++;
            if (status === 'SOLD') breakdown[location]['SOLD']++;
            if (status === 'PROCESSING') breakdown[location]['PROCESSING']++;
            if (status.includes('LOCK')) breakdown[location]['LOCKED']++;

            const createdAt = new Date(item.created_at);
            if (!isNaN(createdAt.getTime())) {
                const ageInDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
                breakdown[location].ages.push(ageInDays);
            }
        });

        // Finalize calculations
        Object.keys(breakdown).forEach(location => {
            const row = breakdown[location];
            row['UNIQUE MODELS'] = row.models.size;
            row['AVG AGE (DAYS)'] = row.ages.length > 0 
                ? Math.round(row.ages.reduce((a, b) => a + b, 0) / row.ages.length)
                : 'N/A';
            row['OLDEST ITEM (DAYS)'] = row.ages.length > 0 
                ? Math.max(...row.ages)
                : 'N/A';
            delete row.models;
            delete row.ages;
        });

        const rows = Object.values(breakdown).sort((a, b) => b['TOTAL ITEMS'] - a['TOTAL ITEMS']);
        const csv = this.convertToCSV(rows, headers);
        return { headers, csv, rows };
    }

    /**
     * Age Analysis - Inventory aging report
     */
    generateAgeAnalysis(data) {
        const headers = [
            'AGE BUCKET',
            'TOTAL ITEMS', 'PERCENTAGE',
            'GRADE A', 'GRADE B', 'GRADE C', 'GRADE D', 'DEFECTIVE',
            'AVAILABLE', 'PROCESSING',
            'UNIQUE MODELS',
            'TOP 3 MODELS'
        ];

        const buckets = {
            '0-7 days': { min: 0, max: 7 },
            '8-14 days': { min: 8, max: 14 },
            '15-30 days': { min: 15, max: 30 },
            '31-60 days': { min: 31, max: 60 },
            '61-90 days': { min: 61, max: 90 },
            '90+ days': { min: 91, max: Infinity }
        };

        const breakdown = {};
        const now = new Date();
        const totalItems = data.length;

        // Initialize buckets
        Object.keys(buckets).forEach(bucket => {
            breakdown[bucket] = {
                'AGE BUCKET': bucket,
                'TOTAL ITEMS': 0, 'PERCENTAGE': '0%',
                'GRADE A': 0, 'GRADE B': 0, 'GRADE C': 0, 'GRADE D': 0, 'DEFECTIVE': 0,
                'AVAILABLE': 0, 'PROCESSING': 0,
                models: {},
                modelSet: new Set()
            };
        });

        data.forEach(item => {
            const createdAt = new Date(item.created_at);
            let ageInDays = 0;
            
            if (!isNaN(createdAt.getTime())) {
                ageInDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
            }

            // Find the right bucket
            let targetBucket = '90+ days';
            for (const [bucket, range] of Object.entries(buckets)) {
                if (ageInDays >= range.min && ageInDays <= range.max) {
                    targetBucket = bucket;
                    break;
                }
            }

            breakdown[targetBucket]['TOTAL ITEMS']++;
            breakdown[targetBucket].modelSet.add(item.MODEL);
            breakdown[targetBucket].models[item.MODEL] = (breakdown[targetBucket].models[item.MODEL] || 0) + 1;

            const grade = (item.GRADE || '').trim();
            if (grade === 'A') breakdown[targetBucket]['GRADE A']++;
            else if (grade === 'B') breakdown[targetBucket]['GRADE B']++;
            else if (grade === 'C' || grade === 'C (AMZ)') breakdown[targetBucket]['GRADE C']++;
            else if (grade === 'D') breakdown[targetBucket]['GRADE D']++;
            else if (grade.toUpperCase() === 'DEFECTIVE') breakdown[targetBucket]['DEFECTIVE']++;

            const status = (item.STATUS || '').toUpperCase();
            if (status === 'AVAILABLE') breakdown[targetBucket]['AVAILABLE']++;
            if (status === 'PROCESSING') breakdown[targetBucket]['PROCESSING']++;
        });

        // Finalize calculations
        Object.keys(breakdown).forEach(bucket => {
            const row = breakdown[bucket];
            row['PERCENTAGE'] = totalItems > 0 
                ? ((row['TOTAL ITEMS'] / totalItems) * 100).toFixed(1) + '%'
                : '0%';
            row['UNIQUE MODELS'] = row.modelSet.size;
            
            // Get top 3 models
            const sortedModels = Object.entries(row.models)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([model, count]) => `${model} (${count})`)
                .join(', ');
            row['TOP 3 MODELS'] = sortedModels || 'N/A';
            
            delete row.models;
            delete row.modelSet;
        });

        const rows = Object.values(breakdown);
        const csv = this.convertToCSV(rows, headers);
        return { headers, csv, rows };
    }

    calculateSuggestedGrade(row) {
        const total = row['TOTAL'];
        if (total === 0) return 'N/A';

        const gradeA = row['A'];
        const gradeB = row['B'];
        const gradeCAMZ = row['C (AMZ)'];
        const gradeC = row['C'];
        const gradeD = row['D'];
        const defectives = row['Defectives'];

        const aPercent = (gradeA / total) * 100;
        const bPercent = (gradeB / total) * 100;
        const cAmzPercent = (gradeCAMZ / total) * 100;
        const cPercent = (gradeC / total) * 100;
        const dPercent = (gradeD / total) * 100;
        const defectPercent = (defectives / total) * 100;

        if (aPercent >= 40) return 'A';
        if (bPercent >= 40) return 'B';
        if (cAmzPercent >= 30) return 'C (AMZ)';
        if (cPercent >= 30) return 'C';
        if (dPercent >= 30) return 'D';
        if (defectPercent >= 30) return 'Defective';

        const maxCount = Math.max(gradeA, gradeB, gradeCAMZ, gradeC, gradeD, defectives);
        if (maxCount === gradeA) return 'A';
        if (maxCount === gradeB) return 'B';
        if (maxCount === gradeCAMZ) return 'C (AMZ)';
        if (maxCount === gradeC) return 'C';
        if (maxCount === gradeD) return 'D';
        if (maxCount === defectives) return 'Defective';

        return 'B';
    }

    convertToCSV(rows, headers) {
        let csv = headers.join(',') + '\n';

        rows.forEach(row => {
            const values = headers.map(header => {
                const value = row[header] !== undefined ? row[header] : '';
                const strValue = value.toString();
                if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
                    return `"${strValue.replace(/"/g, '""')}"`;
                }
                return strValue;
            });
            csv += values.join(',') + '\n';
        });

        return csv;
    }

    downloadCSV(csvContent, headers, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');

        if (navigator.msSaveBlob) {
            navigator.msSaveBlob(blob, filename);
        } else {
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    showExportSuccess() {
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 bg-green-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 flex items-center gap-3';
        notification.innerHTML = `
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <div>
                <p class="font-semibold">Export Successful!</p>
                <p class="text-sm">Your file has been downloaded.</p>
            </div>
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.transition = 'opacity 0.5s';
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 500);
        }, 4000);
    }
}

// Initialize the export manager
const excelExportManager = new ExcelExportManager();

// Legacy functions for compatibility
function openExcelExport() {
    const modal = document.getElementById('excelExportModal');
    if (modal) {
        modal.classList.remove('hidden');
        excelExportManager.updateExportSummary();
    }
}

function closeExcelExport() {
    const modal = document.getElementById('excelExportModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function exportToExcel() {
    excelExportManager.export();
}

function selectAllColumns() {
    document.querySelectorAll('.export-column').forEach(cb => cb.checked = true);
    excelExportManager.updateExportSummary();
}

function deselectAllColumns() {
    document.querySelectorAll('.export-column').forEach(cb => cb.checked = false);
    excelExportManager.updateExportSummary();
}

/**
 * Quick Export - One-click export for common report types
 */
async function quickExport(reportType) {
    // Set the report type
    excelExportManager.selectedReportType = reportType;
    
    // Reset filters to "all"
    excelExportManager.selectedLocationFilter = 'all';
    excelExportManager.selectedAgeFilter = 'all';
    excelExportManager.selectedGrades = [];
    excelExportManager.selectedStatuses = [];
    
    // Trigger export directly
    await excelExportManager.export();
}

/**
 * Toggle all grades checkbox
 */
function toggleAllGrades(checkbox) {
    const gradeCheckboxes = document.querySelectorAll('.grade-checkbox');
    if (checkbox.checked) {
        gradeCheckboxes.forEach(cb => cb.checked = false);
        excelExportManager.selectedGrades = [];
    }
    excelExportManager.updateExportSummary();
    excelExportManager.updatePreviewStats();
}

/**
 * Toggle all statuses checkbox
 */
function toggleAllStatuses(checkbox) {
    const statusCheckboxes = document.querySelectorAll('.status-checkbox');
    if (checkbox.checked) {
        statusCheckboxes.forEach(cb => cb.checked = false);
        excelExportManager.selectedStatuses = [];
    }
    excelExportManager.updateExportSummary();
    excelExportManager.updatePreviewStats();
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Re-initialize event listeners after DOM is ready
    setTimeout(() => {
        excelExportManager.setupEventListeners();
        excelExportManager.updatePreviewStats();
    }, 500);
});

