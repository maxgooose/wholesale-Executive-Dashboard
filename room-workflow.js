/**
 * Room Workflow Management
 * 
 * Data Source: Wholecell Inventory System
 * - In production, this will receive data from Wholecell API
 * - Currently using combined_details.json as Wholecell data
 * - Wholecell will provide real-time inventory status and updates
 */
let inventoryData = [];
let roomData = {
    ready: [],
    processing: []
};
let selectedItems = new Set();
let updateHistory = [];

// Grouping state
let isGroupedView = true;
let expandedGroups = new Set();
let expandedSubGroups = new Set();

// Expose globally for inventory updater and HTML access
window.inventoryData = inventoryData;
window.categorizeItemsByRoom = categorizeItemsByRoom;
window.updateRoomCounts = updateRoomCounts;
window.renderRooms = renderRooms;
window.updateDataTable = updateDataTable;
window.clearInventorySummary = clearInventorySummary;
window.saveBatchInfo = saveBatchInfo;
window.updateBatchInfoBanner = updateBatchInfoBanner;
window.toggleExpandAll = toggleExpandAll;
window.toggleDeviceGroup = toggleDeviceGroup;
window.toggleSubGroup = toggleSubGroup;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadInventoryData();
    initializeDragDrop();
    initializeSearch();
});

// Listen for inventory updates from the updater
document.addEventListener('inventoryUpdate', function(event) {
    // Sync the local variable with the global one
    inventoryData = window.inventoryData || [];
    
    // Refresh the UI
    categorizeItemsByRoom();
    updateRoomCounts();
    renderRooms();
    updateDataTable();
    
    console.log('Inventory data updated:', event.detail);
});

// Load inventory data
async function loadInventoryData() {
    // PRIORITY 1: Load from Vercel Blob cache via API route (instant, always fresh)
    try {
        const loaded = await loadFromCachedAPI();
        if (loaded) return;
    } catch (apiError) {
        console.warn('Could not load from /api/inventory:', apiError.message);
    }

    // PRIORITY 2: Load from Wholecell API directly via proxy (slow fallback for local dev)
    try {
        await loadFromWholecell();
    } catch (wholecellError) {
        console.error('Failed to load from Wholecell API:', wholecellError);
        showConnectionError(wholecellError);
    }
}

// Load from Vercel Blob cache via the API route
async function loadFromCachedAPI() {
    console.log('Fetching from /api/inventory...');

    const response = await fetch('/api/inventory');
    if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
    }

    const rawData = await response.json();

    if (!rawData.items || !Array.isArray(rawData.items)) {
        throw new Error('API response does not contain valid items array');
    }

    console.log(`Loaded ${rawData.items.length} items from cached API`);

    // Transform using WholecellTransformer
    const transformedData = WholecellTransformer.transformAll(rawData.items);
    const stats = WholecellTransformer.getTransformStats(rawData.items, transformedData);

    // Hydrate inventory
    hydrateInventoryData(transformedData);

    // Update sync status
    const syncStatus = document.getElementById('wholecellSyncStatus');
    if (syncStatus) {
        const date = rawData.metadata?.timestamp
            ? new Date(rawData.metadata.timestamp).toLocaleString()
            : 'Unknown';
        syncStatus.innerHTML = `
            <span class="status-dot online"></span>
            <span>Synced: ${date}</span>
        `;
    }

    saveBatchInfo('cached_api');
    showNotification(`Loaded ${stats.valid} items (synced ${rawData.metadata?.timestamp?.split('T')[0] || 'recently'})`);

    return true;
}

// Load from Wholecell API with INCREMENTAL SYNC (⚡ SUPER FAST)
async function loadFromWholecell() {
    // Initialize Wholecell API client
    if (!window.wholecellAPI) {
        window.wholecellAPI = new WholecellAPI();
    }

    // Check if proxy is healthy
    const isHealthy = await window.wholecellAPI.checkHealth();
    if (!isHealthy) {
        throw new Error('Wholecell proxy server is not reachable');
    }

    console.log('🚀 Loading with Incremental Sync (instant after first load)...');
    
    // Initialize incremental sync
    if (!window.wholecellIncrementalSync) {
        window.wholecellIncrementalSync = new WholecellIncrementalSync();
    }

    // Check cache status
    const cacheStats = await window.wholecellIncrementalSync.getCacheStats();
    if (cacheStats.exists) {
        console.log(`⚡ Cache found: ${cacheStats.itemCount} items, ${cacheStats.ageMinutes} min old`);
        updateLoadingMessage(`⚡ Loading from cache (${cacheStats.itemCount} items)...`);
    } else {
        console.log('⚠️ First load: ~18 minutes (builds cache for instant future loads)');
        updateLoadingMessage('First load: ~18 minutes (one-time, future loads instant)...');
    }

    // Smart sync: Load from cache immediately, then sync changes in background
    const wholecellData = await window.wholecellIncrementalSync.smartSync(
        window.wholecellAPI,
        {
            onProgress: (status) => {
                switch(status.stage) {
                    case 'cache_loaded':
                        updateLoadingMessage(`⚡ Loaded ${status.itemCount} items from cache instantly!`);
                        break;
                    case 'full_sync':
                        const percent = Math.round(status.percent);
                        updateLoadingMessage(
                            `Building cache: ${percent}% (page ${status.current}/${status.total})<br>` +
                            `Elapsed: ${status.elapsed}s | Remaining: ~${status.remaining}s`
                        );
                        break;
                    case 'incremental_check':
                    case 'incremental_fetch':
                        updateLoadingMessage(status.message);
                        break;
                }
            },
            onComplete: (result) => {
                if (result.success) {
                    const totalChanges = (result.changes?.new || 0) + (result.changes?.modified || 0);
                    if (totalChanges > 0) {
                        showNotification(`🔄 ${totalChanges} items updated`);
                    }
                }
            }
        }
    );

    console.log(`Loaded ${wholecellData.length} items from Wholecell`);

    // Transform data
    updateLoadingMessage('Transforming data...');
    const transformedData = WholecellTransformer.transformAll(wholecellData);

    // Get transform stats
    const stats = WholecellTransformer.getTransformStats(wholecellData, transformedData);
    console.log('Transform stats:', stats);

    // Hydrate inventory
    hydrateInventoryData(transformedData);
    
    // Save batch info
    saveBatchInfo('wholecell_incremental_sync');

    console.log('✅ Successfully loaded from Wholecell API');
    
    // Show success notification
    showNotification(`⚡ Loaded ${stats.valid} items from Wholecell`);
}
// Update loading message in the sync status indicator
function updateLoadingMessage(message) {
    const syncStatus = document.getElementById('wholecellSyncStatus');
    if (syncStatus) {
        syncStatus.innerHTML = `
            <span class="status-dot syncing"></span>
            <span>${message}</span>
        `;
    }
}

function hydrateInventoryData(rawData) {
    try {
        if (!Array.isArray(rawData)) {
            throw new Error('Inventory data must be an array');
        }

        inventoryData = rawData.map(item => ({
            ...item,
            ['IMEI/ SERIAL NO.']: String(item['IMEI/ SERIAL NO.'] ?? item.IMEI ?? item.imei ?? ''),
            STATUS: (item.STATUS || item.status || '').toString().trim(),
            lastUpdated: item.lastUpdated || new Date().toISOString(),
            qcNotes: item.qcNotes || '',
            updateHistory: item.updateHistory || []
        }));

        // Update global reference for inventory updater
        window.inventoryData = inventoryData;
        console.warn(`✅ Inventory data set globally: ${inventoryData.length} items`);

        // Save batch info
        saveBatchInfo('loaded');

        categorizeItemsByRoom();
        console.warn('✅ categorizeItemsByRoom complete');
        
        updateRoomCounts();
        console.warn('✅ updateRoomCounts complete');
        
        renderRooms();
        console.warn('✅ renderRooms complete');
        
        updateDataTable();
        console.warn('✅ updateDataTable complete');
        
        // Hide connection error banner - data is now loaded
        hideConnectionError();
        
    } catch (error) {
        console.error('❌ Error in hydrateInventoryData:', error);
        // Still try to hide the loader even if there's an error
        hideConnectionError();
    }
}

// Show connection error when Wholecell API fails
function showConnectionError(error) {
    const banner = document.getElementById('connectionBanner');
    const messageEl = document.getElementById('connectionBannerMessage');

    if (messageEl) {
        const errorMessage = error?.message || 'Unknown error';
        messageEl.textContent = errorMessage;
    }

    if (banner) {
        banner.classList.remove('hidden');
    }
}

function hideConnectionError() {
    const banner = document.getElementById('connectionBanner');
    if (banner) {
        banner.classList.add('hidden');
    }
}

// Categorize items by room
function categorizeItemsByRoom() {
    roomData.ready = inventoryData.filter(item => {
        const status = (item.STATUS || item.status || '').toUpperCase();
        return status === 'AVAILABLE';
    });
    
    roomData.processing = inventoryData.filter(item => {
        const status = (item.STATUS || item.status || '').toUpperCase();
        return status === 'PROCESSING' || !status;
    });
}

// Update room counts
function updateRoomCounts() {
    const processingCountEl = document.getElementById('processingCount');
    const pendingUpdatesEl = document.getElementById('pendingUpdates');

    if (processingCountEl) processingCountEl.textContent = roomData.processing.length;
    if (pendingUpdatesEl) pendingUpdatesEl.textContent = updateHistory.length;
}

// Render room items
function renderRooms() {
    // Room rendering removed as per phase 2 requirements
}

// Render individual room
function renderRoom(elementId, items, roomType) {
    const container = document.getElementById(elementId);
    if (!container) return;
    
    if (items.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center">No items in this room</p>';
        return;
    }
    
    container.innerHTML = items.slice(0, 10).map(item => `
        <div class="draggable-item bg-gray-50 p-3 rounded-lg mb-2 border border-gray-200 hover:border-blue-400" 
             draggable="true" 
             data-imei="${item['IMEI/ SERIAL NO.']}">
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <p class="font-semibold text-sm">${item.MODEL}</p>
                    <p class="text-xs text-gray-600">${item['IMEI/ SERIAL NO.']}</p>
                    <p class="text-xs text-gray-500">${item.COLOR} - ${item.STORAGE}</p>
                    ${item.NETWORK ? `<div class="mt-1">
                        <span class="inline-block px-1.5 py-0.5 text-xs rounded ${
                            item.IS_UNLOCKED ? 'bg-green-100 text-green-700 font-medium' : 'bg-gray-100 text-gray-700'
                        }">${item.NETWORK}</span>
                    </div>` : ''}
                    ${item.warehouse || item.location ? `<p class="text-xs text-gray-400 mt-1">
                        ${item.warehouse ? '📍 ' + item.warehouse : ''}${item.location ? ' › ' + item.location : ''}
                    </p>` : ''}
                </div>
                <div class="text-right">
                    <span class="inline-block px-2 py-1 text-xs rounded-full ${
                        item.GRADE === 'A' ? 'bg-green-100 text-green-800' :
                        item.GRADE === 'B' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-orange-100 text-orange-800'
                    }">Grade ${item.GRADE}</span>
                    ${item['BATTERY HEALTH'] ? '<p class="text-xs text-gray-500 mt-1">🔋 ' + item['BATTERY HEALTH'] + '</p>' : ''}
                    ${item.BATTERY_PERCENTAGE ? '<p class="text-xs text-gray-500">(' + item.BATTERY_PERCENTAGE + ')</p>' : ''}
                    ${item.IMEI_STATUS && item.IMEI_STATUS !== 'CLEAN' ? '<p class="text-xs text-red-600 mt-1">⚠️ ' + item.IMEI_STATUS + '</p>' : ''}
                    ${item.qcNotes ? '<p class="text-xs text-amber-600 mt-1">QC: ' + item.qcNotes + '</p>' : ''}
                </div>
            </div>
        </div>
    `).join('');
    
    if (items.length > 10) {
        container.innerHTML += `<p class="text-center text-gray-500 text-sm mt-3">+${items.length - 10} more items</p>`;
    }
}

// Initialize drag and drop
function initializeDragDrop() {
    // Make items draggable
    document.addEventListener('dragstart', function(e) {
        if (e.target.classList.contains('draggable-item')) {
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', e.target.innerHTML);
            e.dataTransfer.setData('imei', e.target.dataset.imei);
        }
    });
    
    document.addEventListener('dragend', function(e) {
        if (e.target.classList.contains('draggable-item')) {
            e.target.classList.remove('dragging');
        }
    });
    
    // Setup drop zones
    const dropZones = document.querySelectorAll('.drop-zone');
    dropZones.forEach(zone => {
        zone.addEventListener('dragover', function(e) {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        
        zone.addEventListener('dragleave', function(e) {
            zone.classList.remove('drag-over');
        });
        
        zone.addEventListener('drop', function(e) {
            e.preventDefault();
            zone.classList.remove('drag-over');
            
            const imei = e.dataTransfer.getData('imei');
            const targetRoom = 'PROCESSING';
            
            moveItemToRoom(imei, targetRoom);
        });
    });
}

// Move item to room
function moveItemToRoom(imei, targetRoom) {
    const item = inventoryData.find(i => i['IMEI/ SERIAL NO.'] === imei);
    if (!item) return;
    
    const oldStatus = item.STATUS;
    // Update STATUS based on target room
    if (targetRoom === 'READY') {
        item.STATUS = 'AVAILABLE';
    } else if (targetRoom === 'PRO_DETAILS') {
        item.STATUS = 'PS';
    } else if (targetRoom === 'PROCESSING') {
        item.STATUS = 'PROCESSING';
    }
    item.lastUpdated = new Date().toISOString();
    
    // Add to update history
    addUpdateHistory({
        imei: imei,
        action: 'Room Transfer',
        from: oldStatus,
        to: item.STATUS,
        timestamp: new Date().toISOString(),
        user: 'Current User'
    });
    
    // Recategorize and refresh
    categorizeItemsByRoom();
    renderRooms();
    updateRoomCounts();
    updateDataTable();
    
    // Show success notification
    showNotification(`Item ${imei} moved to ${targetRoom.replace('_', ' ')} room`);
}

// Add to update history
function addUpdateHistory(update) {
    updateHistory.unshift(update);
    const pendingUpdatesEl = document.getElementById('pendingUpdates');
    if (pendingUpdatesEl) {
        pendingUpdatesEl.textContent = updateHistory.length;
    }
    renderUpdateHistory();
}

// Render update history
function renderUpdateHistory() {
    const historyContainer = document.getElementById('updateHistory');
    if (!historyContainer) return;
    
    historyContainer.innerHTML = updateHistory.slice(0, 20).map((update, index) => `
        <div class="update-item relative">
            ${index < updateHistory.length - 1 ? '<div class="timeline-line"></div>' : ''}
            <div class="timeline-dot"></div>
            <div class="pl-12">
                <p class="font-semibold text-sm">${update.action}</p>
                <p class="text-xs text-gray-600">${update.imei}</p>
                <p class="text-xs text-gray-500">${update.from} → ${update.to}</p>
                <p class="text-xs text-gray-400">${new Date(update.timestamp).toLocaleString()}</p>
            </div>
        </div>
    `).join('');
}

// Attach pricing data to summary items
async function attachPricingToSummary(summaryItems) {
    for (const item of summaryItems) {
        try {
            const pricing = await pricingDB.getModelPrice(item.model, item.storage);
            if (pricing) {
                item.suggestedPrices = {
                    gradeA: pricing.gradeA,
                    gradeB: pricing.gradeB,
                    gradeC: pricing.gradeC,
                    gradeCAMZ: pricing.gradeCAMZ,
                    gradeD: pricing.gradeD,
                    defective: pricing.defective
                };
                item.hasPricing = true;
                item.lastPriceUpdate = pricing.lastUpdated;
            } else {
                item.hasPricing = false;
                item.suggestedPrices = null;
            }
        } catch (error) {
            console.error('Error fetching pricing for', item.model, item.storage, error);
            item.hasPricing = false;
            item.suggestedPrices = null;
        }
    }
    return summaryItems;
}

// Update data table with summary view
async function updateDataTable() {
    const tbody = document.getElementById('dataTableBody');
    const emptyState = document.getElementById('emptySummaryState');
    const summaryContainer = document.getElementById('summaryTableContainer');
    
    if (!tbody) return;
    
    // Check if inventory is empty
    if (!inventoryData || inventoryData.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (summaryContainer) summaryContainer.classList.add('hidden');
        return;
    }
    
    // Hide empty state and show summary
    if (emptyState) emptyState.classList.add('hidden');
    if (summaryContainer) summaryContainer.classList.remove('hidden');
    
    // Update batch info banner
    updateBatchInfoBanner();
    
    // Generate summary data
    let summary = generateInventorySummary();
    
    // Attach pricing data to summary
    summary = await attachPricingToSummary(summary);
    
    // Store summary globally for pricing breakdown access
    window.lastProcessedSummary = summary;
    
    // Apply search filter if any
    const searchInput = document.getElementById('searchInput')?.value.toLowerCase();
    let filteredSummary = summary;
    if (searchInput) {
        filteredSummary = summary.filter(item => 
            item.model.toLowerCase().includes(searchInput) ||
            item.storage.toLowerCase().includes(searchInput)
        );
    }
    
    // Render summary rows
    if (filteredSummary.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-gray-500">
                    No items match your search
                </td>
            </tr>
        `;
        return;
    }
    
    // Render based on view mode
    if (isGroupedView) {
        renderGroupedView(tbody, filteredSummary);
    } else {
        renderFlatView(tbody, filteredSummary);
    }
    
    // Update pricing coverage indicator
    updatePricingCoverageIndicator(summary);
}

// Render grouped view by device type with sub-groups
function renderGroupedView(tbody, summary) {
    // Group items by device type, then by base model
    const grouped = {};
    summary.forEach(item => {
        if (!grouped[item.deviceType]) {
            grouped[item.deviceType] = {};
        }
        if (!grouped[item.deviceType][item.baseModel]) {
            grouped[item.deviceType][item.baseModel] = [];
        }
        grouped[item.deviceType][item.baseModel].push(item);
    });
    
    let html = '';
    
    Object.keys(grouped).sort().forEach(deviceType => {
        const baseModels = grouped[deviceType];
        const isDeviceExpanded = expandedGroups.has(deviceType);
        
        // Calculate total for this device type
        let deviceTotal = 0;
        let totalVariants = 0;
        Object.values(baseModels).forEach(items => {
            totalVariants += items.length;
            items.forEach(item => {
                const gradeA = item.grades['A'];
                const gradeB = item.grades['B'];
                const gradeC = item.grades['C'] + item.grades['C (AMZ)'];
                const gradeD = item.grades['D'];
                const defective = item.grades['Defective'];
                deviceTotal += gradeA + gradeB + gradeC + gradeD + defective;
            });
        });
        
        const baseModelCount = Object.keys(baseModels).length;
        
        // Device type header
        html += `
            <tr class="device-group-header bg-gradient-to-r from-gray-50 to-gray-100 border-t-2 border-gray-300" onclick="toggleDeviceGroup('${deviceType}')">
                <td colspan="8" class="py-4 px-6">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <svg class="w-5 h-5 chevron-icon ${isDeviceExpanded ? 'rotated' : ''} text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                            </svg>
                            <span class="text-gray-800 font-bold text-base">${deviceType}</span>
                            <span class="text-xs text-gray-500 bg-white px-2 py-1 rounded-full">${baseModelCount} series • ${totalVariants} variants</span>
                        </div>
                        <span class="text-sm text-gray-700 font-semibold bg-white px-3 py-1 rounded-full">${deviceTotal} items</span>
                    </div>
                </td>
            </tr>
        `;
        
        // Sub-groups (base models)
        if (isDeviceExpanded) {
            Object.keys(baseModels).sort().forEach(baseModel => {
                const items = baseModels[baseModel];
                const subGroupKey = `${deviceType}|${baseModel}`;
                const isSubExpanded = expandedSubGroups.has(subGroupKey);
                
                // Calculate total for this base model
                let subGroupTotal = 0;
                items.forEach(item => {
                    const gradeA = item.grades['A'];
                    const gradeB = item.grades['B'];
                    const gradeC = item.grades['C'] + item.grades['C (AMZ)'];
                    const gradeD = item.grades['D'];
                    const defective = item.grades['Defective'];
                    subGroupTotal += gradeA + gradeB + gradeC + gradeD + defective;
                });
                
                // Sub-group header
                html += `
                    <tr class="device-group-header bg-gray-50 border-t border-gray-200" onclick="event.stopPropagation(); toggleSubGroup('${deviceType}', '${baseModel.replace(/'/g, "\\'")}')">
                        <td colspan="8" class="py-3 px-5">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-2 pl-8">
                                    <svg class="w-4 h-4 chevron-icon ${isSubExpanded ? 'rotated' : ''} text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                                    </svg>
                                    <span class="text-gray-700 font-semibold text-sm">${baseModel}</span>
                                    <span class="text-xs text-gray-400">${items.length} variant${items.length !== 1 ? 's' : ''}</span>
                                </div>
                                <span class="text-xs text-gray-600 font-medium">${subGroupTotal} items</span>
                            </div>
                        </td>
                    </tr>
                `;
                
                // Model boxes
                if (isSubExpanded) {
                    html += `
                        <tr class="device-group-content expanded">
                            <td colspan="8" class="py-4 px-6 bg-gradient-to-br from-white to-gray-50">
                                <div class="flex flex-wrap gap-3 pl-16">
                    `;
                    
                    items.forEach(item => {
                        const gradeA = item.grades['A'];
                        const gradeB = item.grades['B'];
                        const gradeC = item.grades['C'] + item.grades['C (AMZ)'];
                        const gradeD = item.grades['D'];
                        const defective = item.grades['Defective'];
                        const total = gradeA + gradeB + gradeC + gradeD + defective;
                        
                        // Calculate estimated value if pricing is available
                        let estimatedValue = 0;
                        if (item.hasPricing && item.suggestedPrices) {
                            const gradeCCount = item.grades['C'] || 0;
                            const gradeCAMZCount = item.grades['C (AMZ)'] || 0;
                            
                            estimatedValue = 
                                (gradeA * item.suggestedPrices.gradeA) +
                                (gradeB * item.suggestedPrices.gradeB) +
                                (gradeCCount * item.suggestedPrices.gradeC) +
                                (gradeCAMZCount * item.suggestedPrices.gradeCAMZ) +
                                (gradeD * item.suggestedPrices.gradeD) +
                                (defective * item.suggestedPrices.defective);
                        }
                        
                        html += `
                            <div class="model-box border border-gray-200 rounded-lg px-4 py-3 text-xs hover:border-gray-400 hover:shadow-md transition-all bg-white">
                                <div class="mb-3">
                                    <div class="text-gray-700 font-medium text-sm">${item.storage}</div>
                                </div>
                                <div class="text-gray-600 text-xs mb-3 flex flex-wrap gap-x-3 gap-y-1">
                                    ${gradeA > 0 ? `<span>A: ${gradeA}</span>` : ''}
                                    ${gradeB > 0 ? `<span>B: ${gradeB}</span>` : ''}
                                    ${gradeC > 0 ? `<span>C: ${gradeC}</span>` : ''}
                                    ${gradeD > 0 ? `<span>D: ${gradeD}</span>` : ''}
                                    ${defective > 0 ? `<span>Def: ${defective}</span>` : ''}
                                </div>
                                <div class="text-gray-700 font-semibold text-xs mb-2">Total: ${total}</div>
                                ${item.hasPricing ? `
                                    <div class="mt-3 pt-3 border-t border-gray-100">
                                        <div class="flex items-center justify-between mb-1.5">
                                            <span class="text-xs text-green-700 font-medium">Priced</span>
                                            <button onclick="openPriceModalWithGrades('${item.model.replace(/'/g, "\\'")}', '${item.storage}', {gradeA: ${item.grades['A'] > 0}, gradeB: ${item.grades['B'] > 0}, gradeC: ${item.grades['C'] > 0}, gradeCAMZ: ${item.grades['C (AMZ)'] > 0}, gradeD: ${item.grades['D'] > 0}, defective: ${item.grades['Defective'] > 0}})" 
                                                    class="text-xs text-blue-600 hover:text-blue-800 hover:underline">
                                                Edit
                                            </button>
                                        </div>
                                        <div class="text-xs text-gray-600 space-y-0.5">
                                            <div>A: $${item.suggestedPrices.gradeA.toFixed(2)} | B: $${item.suggestedPrices.gradeB.toFixed(2)}</div>
                                            <div>C: $${item.suggestedPrices.gradeC.toFixed(2)} | C(AMZ): $${item.suggestedPrices.gradeCAMZ.toFixed(2)}</div>
                                            <div>D: $${item.suggestedPrices.gradeD.toFixed(2)} | Def: $${item.suggestedPrices.defective.toFixed(2)}</div>
                                        </div>
                                        ${estimatedValue > 0 ? `
                                            <div class="mt-2 pt-2 border-t border-gray-100">
                                                <div class="text-xs font-semibold text-gray-700">
                                                    Est. Value: <span class="text-blue-600">$${estimatedValue.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        ` : ''}
                                    </div>
                                ` : `
                                    <div class="mt-3 pt-3 border-t border-gray-100">
                                        <button onclick="openPriceModalWithGrades('${item.model.replace(/'/g, "\\'")}', '${item.storage}', {gradeA: ${item.grades['A'] > 0}, gradeB: ${item.grades['B'] > 0}, gradeC: ${item.grades['C'] > 0}, gradeCAMZ: ${item.grades['C (AMZ)'] > 0}, gradeD: ${item.grades['D'] > 0}, defective: ${item.grades['Defective'] > 0}})" 
                                                class="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 hover:underline">
                                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                                            </svg>
                                            Set Price
                                        </button>
                                    </div>
                                `}
                            </div>
                        `;
                    });
                    
                    html += `
                                </div>
                            </td>
                        </tr>
                    `;
                }
            });
        }
    });
    
    tbody.innerHTML = html;
}

// Render flat view (traditional table)
function renderFlatView(tbody, summary) {
    tbody.innerHTML = summary.map(item => {
        const gradeA = item.grades['A'];
        const gradeB = item.grades['B'];
        const gradeC = item.grades['C'] + item.grades['C (AMZ)'];
        const gradeD = item.grades['D'];
        const defective = item.grades['Defective'];
        const total = gradeA + gradeB + gradeC + gradeD + defective;
        
        return `
        <tr class="hover:bg-gray-50 border-b">
            <td class="py-3 px-4 text-gray-900">${item.model}</td>
            <td class="py-3 px-4 text-center text-gray-700">${item.storage}</td>
            <td class="py-3 px-4 text-center">
                ${gradeA > 0 ? `<span class="inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full">${gradeA}</span>` : '<span class="text-gray-300">-</span>'}
            </td>
            <td class="py-3 px-4 text-center">
                ${gradeB > 0 ? `<span class="inline-block px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full">${gradeB}</span>` : '<span class="text-gray-300">-</span>'}
            </td>
            <td class="py-3 px-4 text-center">
                ${gradeC > 0 ? `<span class="inline-block px-3 py-1 bg-orange-100 text-orange-800 rounded-full">${gradeC}</span>` : '<span class="text-gray-300">-</span>'}
            </td>
            <td class="py-3 px-4 text-center">
                ${gradeD > 0 ? `<span class="inline-block px-3 py-1 bg-red-100 text-red-800 rounded-full">${gradeD}</span>` : '<span class="text-gray-300">-</span>'}
            </td>
            <td class="py-3 px-4 text-center">
                ${defective > 0 ? `<span class="inline-block px-3 py-1 bg-gray-100 text-gray-800 rounded-full">${defective}</span>` : '<span class="text-gray-300">-</span>'}
            </td>
            <td class="py-3 px-4 text-center">
                <span class="inline-block px-3 py-1 bg-blue-100 text-blue-900 rounded-full">${total}</span>
            </td>
        </tr>
    `}).join('');
}

// Categorize device type based on model name
function categorizeDeviceType(model) {
    const modelLower = model.toLowerCase();
    
    if (modelLower.includes('iphone')) return 'iPhone';
    if (modelLower.includes('ipad')) return 'iPad';
    if (modelLower.includes('watch') || modelLower.includes('apple watch')) return 'Apple Watch';
    if (modelLower.includes('airpods') || modelLower.includes('airpod')) return 'AirPods';
    if (modelLower.includes('macbook') || modelLower.includes('imac') || modelLower.includes('mac ')) return 'Mac';
    
    // Samsung devices
    if (modelLower.includes('galaxy s') || modelLower.includes('galaxy z') || modelLower.includes('galaxy note')) return 'Galaxy';
    if (modelLower.includes('galaxy tab') || modelLower.includes('galaxy tablet')) return 'Galaxy Tab';
    if (modelLower.includes('galaxy watch') || modelLower.includes('galaxy buds')) return 'Galaxy Wearables';
    
    // Other brands
    if (modelLower.includes('pixel')) return 'Google Pixel';
    if (modelLower.includes('surface')) return 'Microsoft Surface';
    if (modelLower.includes('kindle')) return 'Kindle';
    
    return 'Other';
}

// Extract base model name (without storage) for sub-grouping
function getBaseModelName(model) {
    // Remove storage sizes (128GB, 256GB, 512GB, 1TB, etc.)
    let baseName = model.replace(/\b\d+GB\b/gi, '').replace(/\b\d+TB\b/gi, '');
    // Remove extra spaces
    baseName = baseName.replace(/\s+/g, ' ').trim();
    return baseName;
}

// Get device type icon (removed - no longer using emojis)
function getDeviceIcon(deviceType) {
    return '';
}

// Toggle expand/collapse all groups
function toggleExpandAll() {
    const allGrouped = isGroupedView && expandedGroups.size > 0;
    
    if (allGrouped) {
        // Collapse all - switch to flat view
        isGroupedView = false;
        expandedGroups.clear();
        expandedSubGroups.clear();
        document.getElementById('expandAllText').textContent = 'Group View';
    } else {
        // Expand all - switch to grouped view
        isGroupedView = true;
        // Get all device types and expand them
        const summary = generateInventorySummary();
        const deviceTypes = new Set(summary.map(item => item.deviceType));
        expandedGroups = new Set(deviceTypes);
        
        // Also expand all sub-groups
        const subGroups = new Set(summary.map(item => `${item.deviceType}|${item.baseModel}`));
        expandedSubGroups = new Set(subGroups);
        
        document.getElementById('expandAllText').textContent = 'Expand All';
    }
    
    updateDataTable();
}

// Toggle individual device group
function toggleDeviceGroup(deviceType) {
    if (expandedGroups.has(deviceType)) {
        expandedGroups.delete(deviceType);
        // Also collapse all sub-groups for this device type
        const summary = generateInventorySummary();
        summary.forEach(item => {
            if (item.deviceType === deviceType) {
                expandedSubGroups.delete(`${item.deviceType}|${item.baseModel}`);
            }
        });
    } else {
        expandedGroups.add(deviceType);
    }
    updateDataTable();
}

// Toggle individual sub-group (model series)
function toggleSubGroup(deviceType, baseModel) {
    const key = `${deviceType}|${baseModel}`;
    if (expandedSubGroups.has(key)) {
        expandedSubGroups.delete(key);
    } else {
        expandedSubGroups.add(key);
    }
    updateDataTable();
}

// Generate inventory summary grouped by model and storage
function generateInventorySummary() {
    const summaryMap = new Map();
    
    inventoryData.forEach(item => {
        const model = item.MODEL || 'Unknown Model';
        const storage = item.STORAGE || 'Unknown';
        const grade = item.GRADE || 'Unknown';
        
        const key = `${model}|${storage}`;
        
        if (!summaryMap.has(key)) {
            summaryMap.set(key, {
                model: model,
                storage: storage,
                deviceType: categorizeDeviceType(model),
                baseModel: getBaseModelName(model),
                grades: {
                    'A': 0,
                    'B': 0,
                    'C': 0,
                    'C (AMZ)': 0,
                    'D': 0,
                    'Defective': 0
                }
            });
        }
        
        const summary = summaryMap.get(key);
        if (summary.grades.hasOwnProperty(grade)) {
            summary.grades[grade]++;
        } else {
            // Handle unknown grades
            if (grade.toUpperCase().includes('DEFECTIVE')) {
                summary.grades['Defective']++;
            } else {
                // Default to grade C for unknown
                summary.grades['C']++;
            }
        }
    });
    
    // Convert to array and sort by device type, base model, then storage
    return Array.from(summaryMap.values()).sort((a, b) => {
        if (a.deviceType !== b.deviceType) {
            return a.deviceType.localeCompare(b.deviceType);
        }
        if (a.baseModel !== b.baseModel) {
            return a.baseModel.localeCompare(b.baseModel);
        }
        return a.storage.localeCompare(b.storage);
    });
}

// Clear inventory summary
function clearInventorySummary() {
    if (!confirm('Are you sure you want to clear all inventory data? This will remove all current data from the summary.')) {
        return;
    }
    
    // Clear inventory data
    inventoryData = [];
    window.inventoryData = [];
    
    // Update room data
    roomData.ready = [];
    roomData.processing = [];
    
    // Clear localStorage backup
    localStorage.removeItem('inventoryBackup');
    localStorage.removeItem('lastBatchInfo');
    
    // Update UI
    updateDataTable();
    updateRoomCounts();
    renderRooms();
    
    // Show notification
    showNotification('Inventory data cleared successfully');
}

// Update batch info banner
function updateBatchInfoBanner() {
    const banner = document.getElementById('batchInfoBanner');
    const batchInfo = document.getElementById('batchInfo');
    const batchTimestamp = document.getElementById('batchTimestamp');
    
    if (!banner || !batchInfo || !batchTimestamp) return;
    
    if (!inventoryData || inventoryData.length === 0) {
        banner.classList.add('hidden');
        return;
    }
    
    // Show banner
    banner.classList.remove('hidden');
    
    // Calculate batch statistics
    const totalItems = inventoryData.length;
    const uniqueModels = new Set(inventoryData.map(item => item.MODEL)).size;
    
    // Get last upload info from localStorage or use current data
    const lastBatchInfo = localStorage.getItem('lastBatchInfo');
    let uploadTime = new Date();
    let updateStrategy = 'loaded';
    
    if (lastBatchInfo) {
        try {
            const info = JSON.parse(lastBatchInfo);
            uploadTime = new Date(info.timestamp);
            updateStrategy = info.strategy || 'loaded';
        } catch (e) {
            console.error('Error parsing batch info:', e);
        }
    }
    
    // Format batch info
    batchInfo.textContent = `${totalItems} items across ${uniqueModels} models`;
    
    // Format timestamp
    const now = new Date();
    const diffMinutes = Math.floor((now - uploadTime) / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    let timeText = '';
    if (diffMinutes < 1) {
        timeText = 'Just now';
    } else if (diffMinutes < 60) {
        timeText = `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
        timeText = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
        timeText = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else {
        timeText = uploadTime.toLocaleDateString();
    }
    
    batchTimestamp.textContent = `Uploaded ${timeText}`;
}

// Save batch info when data is uploaded
function saveBatchInfo(strategy = 'loaded') {
    const batchInfo = {
        timestamp: new Date().toISOString(),
        itemCount: inventoryData.length,
        strategy: strategy
    };
    localStorage.setItem('lastBatchInfo', JSON.stringify(batchInfo));
}

// Update pricing coverage indicator
function updatePricingCoverageIndicator(summary) {
    const indicator = document.getElementById('pricingCoverageIndicator');
    if (!indicator) return;
    
    if (!summary || summary.length === 0) {
        indicator.classList.add('hidden');
        return;
    }
    
    const totalModels = summary.length;
    const pricedModels = summary.filter(item => item.hasPricing).length;
    const coveragePercent = ((pricedModels / totalModels) * 100).toFixed(0);
    
    // Determine color based on coverage
    let colorClass = 'text-red-600 bg-red-50';
    if (coveragePercent >= 80) {
        colorClass = 'text-green-600 bg-green-50';
    } else if (coveragePercent >= 50) {
        colorClass = 'text-amber-600 bg-amber-50';
    }
    
    indicator.className = `inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${colorClass}`;
    indicator.innerHTML = `Pricing: ${pricedModels}/${totalModels} (${coveragePercent}%)`;
    indicator.classList.remove('hidden');
}

// Get filtered data
function getFilteredData() {
    const roomFilter = document.getElementById('roomFilter')?.value;
    const searchInput = document.getElementById('searchInput')?.value.toLowerCase();
    
    let filtered = inventoryData;
    
    if (roomFilter) {
        filtered = filtered.filter(item => {
            const status = (item.STATUS || '').toUpperCase();
            if (roomFilter === 'READY') {
                return status === 'AVAILABLE';
            } else if (roomFilter === 'PRO_DETAILS') {
                return status && status !== 'AVAILABLE' && status !== 'PROCESSING';
            } else if (roomFilter === 'PROCESSING') {
                return status === 'PROCESSING' || !status;
            }
            return true;
        });
    }
    
    if (searchInput) {
        filtered = filtered.filter(item => 
            item['IMEI/ SERIAL NO.'].toLowerCase().includes(searchInput) ||
            item.MODEL.toLowerCase().includes(searchInput) ||
            item.COLOR?.toLowerCase().includes(searchInput) ||
            item.STORAGE?.toLowerCase().includes(searchInput)
        );
    }
    
    return filtered;
}

// Initialize search
function initializeSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', updateDataTable);
    }
}

// Filter by room
function filterByRoom() {
    updateDataTable();
}

// Toggle item selection
function toggleItemSelection(imei) {
    if (selectedItems.has(imei)) {
        selectedItems.delete(imei);
    } else {
        selectedItems.add(imei);
    }
    updateSelectionCount();
}

// Update selection count
function updateSelectionCount() {
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.checked = selectedItems.size === inventoryData.length;
    }
}

// Select all items
document.getElementById('selectAll')?.addEventListener('change', function(e) {
    if (e.target.checked) {
        inventoryData.forEach(item => selectedItems.add(item['IMEI/ SERIAL NO.']));
    } else {
        selectedItems.clear();
    }
    updateDataTable();
});

// Quick actions
function bulkMoveToReady() {
    if (selectedItems.size === 0) {
        alert('Please select items to move');
        return;
    }
    
    selectedItems.forEach(imei => {
        moveItemToRoom(imei, 'READY');
    });
    
    selectedItems.clear();
    updateSelectionCount();
}


function clearRoom(room) {
    if (!confirm(`Are you sure you want to clear all items from the ${room} room?`)) {
        return;
    }
    
    const roomKey = room === 'ready' ? 'READY' : 'PRO_DETAILS';
    inventoryData.forEach(item => {
        const status = (item.STATUS || '').toUpperCase();
        if (roomKey === 'READY' && status === 'AVAILABLE') {
            item.STATUS = 'PROCESSING';
        } else if (roomKey === 'PRO_DETAILS' && status !== 'AVAILABLE' && status !== 'PROCESSING') {
            item.STATUS = 'PROCESSING';
        }
    });
    
    categorizeItemsByRoom();
    renderRooms();
    updateRoomCounts();
    updateDataTable();
}

function generateReport() {
    const report = {
        timestamp: new Date().toISOString(),
        processingRoom: roomData.processing.length,
        totalItems: inventoryData.length,
        gradeDistribution: getGradeDistribution(),
        modelDistribution: getModelDistribution()
    };
    
    console.log('Room Report:', report);
    alert('Report generated! Check console for details.');
}

function getGradeDistribution() {
    const distribution = {};
    inventoryData.forEach(item => {
        distribution[item.GRADE] = (distribution[item.GRADE] || 0) + 1;
    });
    return distribution;
}

function getModelDistribution() {
    const distribution = {};
    inventoryData.forEach(item => {
        distribution[item.MODEL] = (distribution[item.MODEL] || 0) + 1;
    });
    return distribution;
}

function editItem(imei) {
    const item = inventoryData.find(i => i['IMEI/ SERIAL NO.'] === imei);
    if (!item) return;
    
    const notes = prompt('Enter QC notes:', item.qcNotes || '');
    if (notes !== null) {
        item.qcNotes = notes;
        item.lastUpdated = new Date().toISOString();
        updateDataTable();
        renderRooms();
    }
}

function openQuickAdd() {
    openInventoryUploadModal();
}

function toggleUpdatePanel() {
    const panel = document.getElementById('updatePanel');
    if (panel) {
        panel.classList.toggle('open');
    }
}

function showNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'fixed bottom-4 left-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Open price modal with pre-filled model and storage
function openPriceModal(model, storage) {
    console.log('openPriceModal called with:', model, storage);
    console.log('breakdownModal exists:', typeof breakdownModal !== 'undefined');
    console.log('breakdownModal.openModal exists:', typeof breakdownModal?.openModal === 'function');
    
    // Check if breakdown modal exists
    if (typeof breakdownModal !== 'undefined' && breakdownModal && breakdownModal.openModal) {
        breakdownModal.openModal(model, storage);
    } else {
        console.error('Breakdown modal not available');
        console.error('breakdownModal value:', breakdownModal);
        alert('Price entry modal is not available. Please check the browser console for details.');
    }
}

// Open price modal with grade information
function openPriceModalWithGrades(model, storage, existingGrades) {
    console.log('openPriceModalWithGrades called with:', model, storage, existingGrades);
    console.log('breakdownModal exists:', typeof breakdownModal !== 'undefined');
    
    // Check if breakdown modal exists
    if (typeof breakdownModal !== 'undefined' && breakdownModal && breakdownModal.openModal) {
        breakdownModal.openModal(model, storage, existingGrades);
    } else {
        console.error('Breakdown modal not available');
        console.error('breakdownModal value:', breakdownModal);
        alert('Price entry modal is not available. Please check the browser console for details.');
    }
}



