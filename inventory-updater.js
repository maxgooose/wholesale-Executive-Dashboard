/**
 * Inventory Update Manager
 * Handles smart updates of inventory data from daily Excel/JSON uploads
 */

class InventoryUpdater {
    constructor() {
        this.updateStrategies = {
            INCREMENTAL: 'incremental',
            SMART_MERGE: 'smart_merge',
            FULL_REPLACE: 'full_replace'
        };
        this.worker = null;
        this.diffCache = new Map();
        this.updateQueue = [];
        this.isProcessing = false;
    }

    /**
     * Initialize Web Worker for heavy processing
     */
    initWorker() {
        if (!this.worker) {
            // Create inline worker for processing
            const workerCode = `
                self.addEventListener('message', function(e) {
                    const { action, data } = e.data;
                    
                    switch(action) {
                        case 'processLargeFile':
                            const result = processInventoryFile(data);
                            self.postMessage({ action: 'fileProcessed', result });
                            break;
                        case 'calculateDiff':
                            const diff = calculateInventoryDiff(data.existing, data.newData);
                            self.postMessage({ action: 'diffCalculated', diff });
                            break;
                        case 'mergeInventories':
                            const merged = mergeInventoryData(data.existing, data.newData);
                            self.postMessage({ action: 'mergeComplete', merged });
                            break;
                    }
                });

                function processInventoryFile(fileData) {
                    try {
                        // Parse and normalize inventory data
                        const inventory = new Map();
                        let processedCount = 0;
                        
                        fileData.forEach(item => {
                            const key = item['IMEI/ SERIAL NO.'] || item.IMEI || item.imei;
                            if (key) {
                                inventory.set(String(key), {
                                    ...item,
                                    'IMEI/ SERIAL NO.': String(key),
                                    lastUpdated: new Date().toISOString(),
                                    source: 'upload'
                                });
                                processedCount++;
                                
                                // Send progress updates
                                if (processedCount % 1000 === 0) {
                                    self.postMessage({ 
                                        action: 'progress', 
                                        processed: processedCount, 
                                        total: fileData.length 
                                    });
                                }
                            }
                        });
                        
                        return {
                            success: true,
                            data: Array.from(inventory.values()),
                            totalItems: inventory.size,
                            duplicatesRemoved: fileData.length - inventory.size
                        };
                    } catch (error) {
                        return {
                            success: false,
                            error: error.message
                        };
                    }
                }

                function calculateInventoryDiff(existing, newData) {
                    const existingMap = new Map(existing.map(item => [item['IMEI/ SERIAL NO.'], item]));
                    const newMap = new Map(newData.map(item => [item['IMEI/ SERIAL NO.'], item]));
                    
                    const added = [];
                    const updated = [];
                    const removed = [];
                    const unchanged = [];
                    
                    // Find added and updated items
                    newMap.forEach((newItem, key) => {
                        const existingItem = existingMap.get(key);
                        if (!existingItem) {
                            added.push(newItem);
                        } else if (JSON.stringify(existingItem) !== JSON.stringify(newItem)) {
                            updated.push({
                                old: existingItem,
                                new: newItem,
                                changes: detectChanges(existingItem, newItem)
                            });
                        } else {
                            unchanged.push(key);
                        }
                    });
                    
                    // Find removed items
                    existingMap.forEach((item, key) => {
                        if (!newMap.has(key)) {
                            removed.push(item);
                        }
                    });
                    
                    return {
                        added,
                        updated,
                        removed,
                        unchanged,
                        summary: {
                            totalNew: newMap.size,
                            totalExisting: existingMap.size,
                            addedCount: added.length,
                            updatedCount: updated.length,
                            removedCount: removed.length,
                            unchangedCount: unchanged.length
                        }
                    };
                }

                function detectChanges(oldItem, newItem) {
                    const changes = {};
                    Object.keys(newItem).forEach(key => {
                        if (oldItem[key] !== newItem[key]) {
                            changes[key] = {
                                old: oldItem[key],
                                new: newItem[key]
                            };
                        }
                    });
                    return changes;
                }

                function mergeInventoryData(existing, newData) {
                    const merged = new Map();
                    
                    // Add all existing items
                    existing.forEach(item => {
                        merged.set(item['IMEI/ SERIAL NO.'], item);
                    });
                    
                    // Merge or add new items
                    newData.forEach(item => {
                        const key = item['IMEI/ SERIAL NO.'];
                        const existingItem = merged.get(key);
                        
                        if (existingItem) {
                            // Merge with priority to new data
                            merged.set(key, {
                                ...existingItem,
                                ...item,
                                mergedAt: new Date().toISOString(),
                                previousData: existingItem
                            });
                        } else {
                            merged.set(key, {
                                ...item,
                                addedAt: new Date().toISOString()
                            });
                        }
                    });
                    
                    return Array.from(merged.values());
                }
            `;

            const blob = new Blob([workerCode], { type: 'application/javascript' });
            this.worker = new Worker(URL.createObjectURL(blob));
            
            // Set up worker message handling
            this.worker.addEventListener('message', (e) => this.handleWorkerMessage(e));
        }
        return this.worker;
    }

    /**
     * Handle messages from Web Worker
     */
    handleWorkerMessage(event) {
        const { action, result, diff, merged, processed, total } = event.data;
        
        switch(action) {
            case 'progress':
                this.onProgress(processed, total);
                break;
            case 'fileProcessed':
                this.onFileProcessed(result);
                break;
            case 'diffCalculated':
                this.onDiffCalculated(diff);
                break;
            case 'mergeComplete':
                this.onMergeComplete(merged);
                break;
        }
    }

    /**
     * Process uploaded inventory file
     */
    async processUploadedFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    let data;
                    
                    // Parse based on file type
                    if (file.name.endsWith('.json')) {
                        data = JSON.parse(e.target.result);
                    } else if (file.name.endsWith('.csv')) {
                        data = this.parseCSV(e.target.result);
                    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                        data = await this.parseExcel(e.target.result);
                    } else {
                        throw new Error('Unsupported file format');
                    }
                    
                    // Determine update strategy
                    const strategy = this.determineUpdateStrategy(data);
                    console.log(`Using ${strategy} strategy for ${data.length} items`);
                    
                    // Process based on strategy
                    const result = await this.applyUpdateStrategy(strategy, data);
                    resolve(result);
                    
                } catch (error) {
                    console.error('Error processing file:', error);
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(reader.error);
            
            if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                reader.readAsArrayBuffer(file);
            } else {
                reader.readAsText(file);
            }
        });
    }

    /**
     * Determine optimal update strategy based on file size and content
     */
    determineUpdateStrategy(newData) {
        const newItemCount = newData.length;
        const existingItemCount = window.inventoryData ? window.inventoryData.length : 0;
        
        // Strategy selection logic
        if (newItemCount < 100) {
            // Small file - likely additions only
            return this.updateStrategies.INCREMENTAL;
        } else if (newItemCount < 1000 || newItemCount < existingItemCount * 0.5) {
            // Medium file or partial update
            return this.updateStrategies.SMART_MERGE;
        } else {
            // Large file or complete replacement
            return this.updateStrategies.FULL_REPLACE;
        }
    }

    /**
     * Apply the selected update strategy
     */
    async applyUpdateStrategy(strategy, newData) {
        this.isProcessing = true;
        const startTime = Date.now();
        let result;
        
        try {
            switch(strategy) {
                case this.updateStrategies.INCREMENTAL:
                    result = await this.incrementalUpdate(newData);
                    break;
                case this.updateStrategies.SMART_MERGE:
                    result = await this.smartMerge(newData);
                    break;
                case this.updateStrategies.FULL_REPLACE:
                    result = await this.fullReplace(newData);
                    break;
                default:
                    throw new Error('Invalid update strategy');
            }
            
            const processingTime = Date.now() - startTime;
            console.log(`Update completed in ${processingTime}ms`);
            
            // Save update history
            await this.saveUpdateHistory({
                strategy,
                itemsProcessed: newData.length,
                processingTime,
                timestamp: new Date().toISOString(),
                result
            });
            
            return result;
            
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Incremental update - for small additions
     */
    async incrementalUpdate(newData) {
        const existing = window.inventoryData || [];
        const existingMap = new Map(existing.map(item => [item['IMEI/ SERIAL NO.'], item]));
        
        let added = 0;
        let updated = 0;
        let skipped = 0;
        
        newData.forEach(newItem => {
            const key = newItem['IMEI/ SERIAL NO.'];
            const existingItem = existingMap.get(key);
            
            if (!existingItem) {
                // Add new item
                existing.push({
                    ...newItem,
                    addedAt: new Date().toISOString(),
                    source: 'incremental_update'
                });
                added++;
            } else if (this.shouldUpdate(existingItem, newItem)) {
                // Update existing item
                Object.assign(existingItem, {
                    ...newItem,
                    updatedAt: new Date().toISOString(),
                    previousData: { ...existingItem }
                });
                updated++;
            } else {
                skipped++;
            }
        });
        
        // Update global inventory
        window.inventoryData = existing;
        inventoryData = existing; // Update local reference
        
        // Update room categorization and summary
        if (window.categorizeItemsByRoom) {
            window.categorizeItemsByRoom();
            window.updateRoomCounts();
            window.renderRooms();
            window.updateDataTable();
        }
        
        // Trigger analytics update
        if (typeof updateAnalyticsOverview === 'function') {
            updateAnalyticsOverview();
        }
        
        // Save batch info
        if (typeof saveBatchInfo === 'function') {
            saveBatchInfo('incremental');
        }
        
        return {
            strategy: 'incremental',
            added,
            updated,
            skipped,
            total: existing.length
        };
    }

    /**
     * Smart merge - for medium updates
     */
    async smartMerge(newData) {
        // Use Web Worker for processing if data is large
        if (newData.length > 500) {
            this.initWorker();
            
            return new Promise((resolve) => {
                this.onMergeComplete = (merged) => {
                    window.inventoryData = merged;
                    
                    // Update UI
                    if (window.categorizeItemsByRoom) {
                        window.categorizeItemsByRoom();
                        window.updateRoomCounts();
                        window.renderRooms();
                        window.updateDataTable();
                    }
                    
                    // Save batch info
                    if (typeof saveBatchInfo === 'function') {
                        saveBatchInfo('smart_merge');
                    }
                    
                    resolve({
                        strategy: 'smart_merge',
                        total: merged.length,
                        processed: newData.length
                    });
                };
                
                this.worker.postMessage({
                    action: 'mergeInventories',
                    data: {
                        existing: window.inventoryData || [],
                        newData
                    }
                });
            });
        } else {
            // Process synchronously for small data
            return this.syncSmartMerge(newData);
        }
    }

    /**
     * Synchronous smart merge for smaller datasets
     */
    syncSmartMerge(newData) {
        const existing = window.inventoryData || [];
        const merged = new Map();
        
        // Build index of existing items
        existing.forEach(item => {
            merged.set(item['IMEI/ SERIAL NO.'], item);
        });
        
        // Merge new data with conflict resolution
        newData.forEach(newItem => {
            const key = newItem['IMEI/ SERIAL NO.'];
            const existingItem = merged.get(key);
            
            if (existingItem) {
                // Resolve conflicts - newer data takes precedence
                const mergedItem = this.resolveConflicts(existingItem, newItem);
                merged.set(key, mergedItem);
            } else {
                merged.set(key, {
                    ...newItem,
                    addedAt: new Date().toISOString(),
                    source: 'smart_merge'
                });
            }
        });
        
        // Convert back to array
        const mergedArray = Array.from(merged.values());
        window.inventoryData = mergedArray;
        inventoryData = mergedArray; // Update local reference
        
        // Update UI and summary
        if (window.categorizeItemsByRoom) {
            window.categorizeItemsByRoom();
            window.updateRoomCounts();
            window.renderRooms();
            window.updateDataTable();
        }
        
        // Trigger analytics update
        if (typeof updateAnalyticsOverview === 'function') {
            updateAnalyticsOverview();
        }
        
        // Save batch info
        if (typeof saveBatchInfo === 'function') {
            saveBatchInfo('smart_merge');
        }
        
        return {
            strategy: 'smart_merge',
            originalCount: existing.length,
            newCount: newData.length,
            mergedCount: mergedArray.length
        };
    }

    /**
     * Full replace - for complete inventory refresh
     */
    async fullReplace(newData) {
        // Backup existing data
        const backup = window.inventoryData || [];
        localStorage.setItem('inventoryBackup', JSON.stringify({
            data: backup,
            timestamp: new Date().toISOString()
        }));
        
        // Process new data with Web Worker if large
        if (newData.length > 1000) {
            this.initWorker();
            
            return new Promise((resolve) => {
                this.onFileProcessed = (result) => {
                    if (result.success) {
                        window.inventoryData = result.data;
                        
                        // Update UI
                        if (window.categorizeItemsByRoom) {
                            window.categorizeItemsByRoom();
                            window.updateRoomCounts();
                            window.renderRooms();
                            window.updateDataTable();
                        }
                        
                        // Save batch info
                        if (typeof saveBatchInfo === 'function') {
                            saveBatchInfo('full_replace');
                        }
                        
                        resolve({
                            strategy: 'full_replace',
                            previousCount: backup.length,
                            newCount: result.totalItems,
                            duplicatesRemoved: result.duplicatesRemoved
                        });
                    } else {
                        // Restore backup on error
                        window.inventoryData = backup;
                        throw new Error(result.error);
                    }
                };
                
                this.worker.postMessage({
                    action: 'processLargeFile',
                    data: newData
                });
            });
        } else {
            // Direct replacement for small data
            window.inventoryData = newData.map(item => ({
                ...item,
                'IMEI/ SERIAL NO.': String(item['IMEI/ SERIAL NO.'] || item.IMEI || item.imei || ''),
                replacedAt: new Date().toISOString(),
                source: 'full_replace'
            }));
            inventoryData = window.inventoryData; // Update local reference
            
            // Update UI and summary
            if (window.categorizeItemsByRoom) {
                window.categorizeItemsByRoom();
                window.updateRoomCounts();
                window.renderRooms();
                window.updateDataTable();
            }
            
            // Trigger analytics update
            if (typeof updateAnalyticsOverview === 'function') {
                updateAnalyticsOverview();
            }
            
            // Save batch info
            if (typeof saveBatchInfo === 'function') {
                saveBatchInfo('full_replace');
            }
            
            return {
                strategy: 'full_replace',
                previousCount: backup.length,
                newCount: newData.length
            };
        }
    }

    /**
     * Resolve conflicts between existing and new items
     */
    resolveConflicts(existingItem, newItem) {
        // Priority rules for conflict resolution
        const merged = { ...existingItem };
        
        // Update fields that have changed
        Object.keys(newItem).forEach(key => {
            if (newItem[key] !== undefined && newItem[key] !== null && newItem[key] !== '') {
                // Special handling for specific fields
                if (key === 'STATUS' || key === 'GRADE') {
                    // Always take newer status/grade
                    merged[key] = newItem[key];
                } else if (key === 'QUANTITY' || key === 'QTY') {
                    // Add quantities instead of replacing
                    merged[key] = (parseInt(existingItem[key] || 0) + parseInt(newItem[key] || 0)).toString();
                } else if (existingItem[key] !== newItem[key]) {
                    // For other fields, take newer value if different
                    merged[key] = newItem[key];
                    merged.previousValues = merged.previousValues || {};
                    merged.previousValues[key] = existingItem[key];
                }
            }
        });
        
        merged.lastMerged = new Date().toISOString();
        return merged;
    }

    /**
     * Check if an item should be updated
     */
    shouldUpdate(existingItem, newItem) {
        // Update if any important field has changed
        const importantFields = ['STATUS', 'GRADE', 'BATCH', 'DESCRIPTION', 'COLOR', 'STORAGE'];
        
        for (const field of importantFields) {
            if (existingItem[field] !== newItem[field]) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Parse CSV data
     */
    parseCSV(csvText) {
        const lines = csvText.split('\n').filter(line => line.trim());
        if (lines.length === 0) return [];
        
        // Parse headers
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        // Parse rows
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            const item = {};
            headers.forEach((header, index) => {
                item[header] = values[index] || '';
            });
            data.push(item);
        }
        
        return data;
    }

    /**
     * Parse Excel data (requires additional library in production)
     */
    async parseExcel(arrayBuffer) {
        // This would use a library like SheetJS in production
        // For now, we'll return a placeholder
        console.warn('Excel parsing requires SheetJS library. Using mock data.');
        return [];
    }

    /**
     * Save update history
     */
    async saveUpdateHistory(update) {
        try {
            // Get existing history
            const historyStr = localStorage.getItem('inventoryUpdateHistory');
            const history = historyStr ? JSON.parse(historyStr) : [];
            
            // Add new update
            history.unshift(update);
            
            // Keep only last 50 updates
            if (history.length > 50) {
                history.length = 50;
            }
            
            // Save back
            localStorage.setItem('inventoryUpdateHistory', JSON.stringify(history));
            
            // Trigger update event
            document.dispatchEvent(new CustomEvent('inventoryUpdate', {
                detail: update
            }));
            
        } catch (error) {
            console.error('Error saving update history:', error);
        }
    }

    /**
     * Get update history
     */
    getUpdateHistory(limit = 10) {
        try {
            const historyStr = localStorage.getItem('inventoryUpdateHistory');
            const history = historyStr ? JSON.parse(historyStr) : [];
            return history.slice(0, limit);
        } catch (error) {
            console.error('Error getting update history:', error);
            return [];
        }
    }

    /**
     * Calculate inventory diff (for UI display)
     */
    async calculateDiff(newData) {
        const existing = window.inventoryData || [];
        
        if (newData.length > 500 || existing.length > 500) {
            // Use Web Worker for large datasets
            this.initWorker();
            
            return new Promise((resolve) => {
                this.onDiffCalculated = (diff) => {
                    this.diffCache.set(Date.now(), diff);
                    resolve(diff);
                };
                
                this.worker.postMessage({
                    action: 'calculateDiff',
                    data: { existing, newData }
                });
            });
        } else {
            // Calculate synchronously for small datasets
            return this.syncCalculateDiff(existing, newData);
        }
    }

    /**
     * Synchronous diff calculation
     */
    syncCalculateDiff(existing, newData) {
        const existingMap = new Map(existing.map(item => [item['IMEI/ SERIAL NO.'], item]));
        const newMap = new Map(newData.map(item => [item['IMEI/ SERIAL NO.'], item]));
        
        const diff = {
            added: [],
            updated: [],
            removed: [],
            unchanged: []
        };
        
        // Find added and updated
        newMap.forEach((newItem, key) => {
            const existingItem = existingMap.get(key);
            if (!existingItem) {
                diff.added.push(newItem);
            } else if (JSON.stringify(existingItem) !== JSON.stringify(newItem)) {
                diff.updated.push({
                    key,
                    old: existingItem,
                    new: newItem
                });
            } else {
                diff.unchanged.push(key);
            }
        });
        
        // Find removed
        existingMap.forEach((item, key) => {
            if (!newMap.has(key)) {
                diff.removed.push(item);
            }
        });
        
        diff.summary = {
            added: diff.added.length,
            updated: diff.updated.length,
            removed: diff.removed.length,
            unchanged: diff.unchanged.length,
            total: newMap.size
        };
        
        return diff;
    }

    /**
     * Restore from backup
     */
    restoreFromBackup() {
        try {
            const backupStr = localStorage.getItem('inventoryBackup');
            if (!backupStr) {
                throw new Error('No backup found');
            }
            
            const backup = JSON.parse(backupStr);
            window.inventoryData = backup.data;
            
            // Update UI
            if (window.categorizeItemsByRoom) {
                window.categorizeItemsByRoom();
                window.updateRoomCounts();
                window.renderRooms();
                window.updateDataTable();
            }
            
            return {
                success: true,
                itemsRestored: backup.data.length,
                backupDate: backup.timestamp
            };
        } catch (error) {
            console.error('Error restoring backup:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Progress callback
     */
    onProgress(processed, total) {
        const percent = Math.round((processed / total) * 100);
        console.log(`Processing: ${percent}% (${processed}/${total})`);
        
        // Update UI progress if available
        const progressBar = document.getElementById('updateProgress');
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
            progressBar.textContent = `${percent}%`;
        }
    }

    /**
     * Clean up resources
     */
    cleanup() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.diffCache.clear();
        this.updateQueue = [];
    }
}

// Create and export singleton instance
const inventoryUpdater = new InventoryUpdater();

// Make it globally available
window.inventoryUpdater = inventoryUpdater;

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = inventoryUpdater;
}
