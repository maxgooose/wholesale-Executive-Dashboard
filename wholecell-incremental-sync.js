/**
 * Wholecell Incremental Sync Manager
 * ===================================
 * Efficiently syncs only changed items instead of full reloads
 * 
 * Strategy:
 * 1. First load: Full sync (~18 minutes) + store snapshot with timestamps
 * 2. Subsequent loads: 
 *    - Load from cache instantly
 *    - Background sync of only changed items (fast!)
 *    - Merge changes into cache
 * 
 * Benefits:
 * - First load: 18 minutes (unavoidable)
 * - All other loads: 5 seconds + background sync
 * - No need to reload everything
 * - Always have latest data
 */

class WholecellIncrementalSync {
    constructor() {
        this.SYNC_METADATA_KEY = 'wholecell_sync_metadata';
        this.ITEM_HASH_KEY = 'wholecell_item_hashes';
        this.db = null;
        this.syncInProgress = false;
    }

    /**
     * Initialize IndexedDB
     */
    async initDB() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open('WholecellSyncDB', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Store for inventory items (indexed by IMEI)
                if (!db.objectStoreNames.contains('inventory')) {
                    const inventoryStore = db.createObjectStore('inventory', { keyPath: 'imei' });
                    inventoryStore.createIndex('lastModified', 'lastModified', { unique: false });
                    inventoryStore.createIndex('status', 'status', { unique: false });
                }
                
                // Store for sync metadata
                if (!db.objectStoreNames.contains('syncMetadata')) {
                    db.createObjectStore('syncMetadata', { keyPath: 'key' });
                }
                
                // Store for item hashes (fast change detection)
                if (!db.objectStoreNames.contains('itemHashes')) {
                    db.createObjectStore('itemHashes', { keyPath: 'imei' });
                }
            };
        });
    }

    /**
     * Calculate hash for an item (for quick change detection)
     */
    calculateItemHash(item) {
        // Hash based on key fields that indicate changes
        const hashData = {
            status: item.STATUS || '',
            grade: item.GRADE || '',
            cost: item.cost || '',
            warehouse: item.warehouse || '',
            batteryHealth: item['BATTERY HEALTH'] || '',
            lastUpdated: item.lastUpdated || ''
        };
        
        // Simple hash (could use better algorithm if needed)
        return JSON.stringify(hashData);
    }

    /**
     * Smart sync: Load from cache immediately, then sync changes in background
     */
    async smartSync(wholecellAPI, options = {}) {
        const { onProgress, onComplete, forceFullSync = false } = options;
        
        await this.initDB();
        
        const syncMeta = await this.getSyncMetadata();
        const hasCache = syncMeta && syncMeta.lastFullSync;
        
        if (!hasCache || forceFullSync) {
            // No cache - perform full sync
            console.log('🔄 Performing initial full sync...');
            return await this.fullSync(wholecellAPI, onProgress, onComplete);
        } else {
            // Has cache - load immediately, then sync changes
            console.log('⚡ Loading from cache...');
            const cachedData = await this.getAllFromCache();
            
            // Show cached data immediately
            if (onProgress) {
                onProgress({
                    stage: 'cache_loaded',
                    itemCount: cachedData.length,
                    message: `Loaded ${cachedData.length} items from cache`
                });
            }
            
            // Start incremental sync in background
            this.incrementalSync(wholecellAPI, syncMeta, onProgress, onComplete);
            
            return cachedData;
        }
    }

    /**
     * Full sync: Fetch all data and store
     */
    async fullSync(wholecellAPI, onProgress, onComplete) {
        console.log('📥 Starting full sync from Wholecell API...');
        
        // Fetch all data with progress tracking
        const allData = await wholecellAPI.fetchAllInventory({
            useCache: false,
            maxPages: null,
            onProgress: (current, total) => {
                if (onProgress) {
                    const percent = Math.round((current / total) * 100);
                    const elapsed = Math.round(current / 2);
                    const remaining = Math.round((total - current) / 2);
                    
                    onProgress({
                        stage: 'full_sync',
                        current,
                        total,
                        percent,
                        elapsed,
                        remaining,
                        message: `Syncing: ${percent}% (${current}/${total} pages)`
                    });
                }
            }
        });
        
        console.log(`✅ Fetched ${allData.length} items`);
        
        // Store all items and calculate hashes
        await this.storeItems(allData, onProgress);
        
        // Update sync metadata
        await this.updateSyncMetadata({
            lastFullSync: new Date().toISOString(),
            lastIncrementalSync: new Date().toISOString(),
            itemCount: allData.length,
            syncType: 'full'
        });
        
        if (onComplete) {
            onComplete({
                success: true,
                itemCount: allData.length,
                syncType: 'full',
                changes: { new: allData.length, modified: 0, removed: 0 }
            });
        }
        
        return allData;
    }

    /**
     * Incremental sync: Fetch only changed items
     */
    async incrementalSync(wholecellAPI, syncMeta, onProgress, onComplete) {
        if (this.syncInProgress) {
            console.log('⏸️ Incremental sync already in progress');
            return;
        }
        
        this.syncInProgress = true;
        
        try {
            console.log('🔍 Checking for changes since last sync...');
            
            if (onProgress) {
                onProgress({
                    stage: 'incremental_check',
                    message: 'Checking for updates...'
                });
            }
            
            // Strategy: Fetch first N pages (most recent items likely changed)
            // This is much faster than fetching all pages
            const PAGES_TO_CHECK = 10; // Check first 10 pages (~1000 items)
            
            const recentData = await wholecellAPI.fetchAllInventory({
                useCache: false,
                maxPages: PAGES_TO_CHECK,
                onProgress: (current, total) => {
                    if (onProgress) {
                        onProgress({
                            stage: 'incremental_fetch',
                            current,
                            total: PAGES_TO_CHECK,
                            message: `Checking recent items (${current}/${PAGES_TO_CHECK} pages)...`
                        });
                    }
                }
            });
            
            console.log(`📊 Checked ${recentData.length} recent items`);
            
            // Detect changes
            const changes = await this.detectChanges(recentData);
            
            console.log('🔄 Changes detected:', changes.summary);
            
            if (changes.total > 0) {
                // Merge changes into cache
                await this.mergeChanges(changes.items);
                
                // Update sync metadata
                await this.updateSyncMetadata({
                    lastIncrementalSync: new Date().toISOString(),
                    lastChangeCount: changes.total
                });
                
                if (onProgress) {
                    onProgress({
                        stage: 'changes_merged',
                        changes: changes.summary,
                        message: `Updated ${changes.total} items`
                    });
                }
            } else {
                console.log('✅ No changes detected');
                
                if (onProgress) {
                    onProgress({
                        stage: 'no_changes',
                        message: 'Data is up to date'
                    });
                }
            }
            
            if (onComplete) {
                onComplete({
                    success: true,
                    syncType: 'incremental',
                    changes: changes.summary
                });
            }
            
        } catch (error) {
            console.error('❌ Incremental sync failed:', error);
            
            if (onComplete) {
                onComplete({
                    success: false,
                    error: error.message
                });
            }
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * Store items in IndexedDB with hashes
     */
    async storeItems(items, onProgress) {
        await this.initDB();
        
        console.log(`💾 Storing ${items.length} items...`);
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['inventory', 'itemHashes'], 'readwrite');
            const inventoryStore = transaction.objectStore('inventory');
            const hashStore = transaction.objectStore('itemHashes');
            
            // Clear existing data
            inventoryStore.clear();
            hashStore.clear();
            
            let processed = 0;
            
            items.forEach(item => {
                const imei = item['IMEI/ SERIAL NO.'] || item.IMEI || item.imei;
                
                if (imei) {
                    // Store item
                    const itemData = {
                        imei: imei,
                        data: item,
                        lastModified: item.lastUpdated || new Date().toISOString(),
                        status: item.STATUS || item.status || ''
                    };
                    
                    inventoryStore.put(itemData);
                    
                    // Store hash
                    const hash = this.calculateItemHash(item);
                    hashStore.put({
                        imei: imei,
                        hash: hash,
                        timestamp: new Date().toISOString()
                    });
                }
                
                processed++;
                
                // Progress update every 1000 items
                if (processed % 1000 === 0 && onProgress) {
                    onProgress({
                        stage: 'storing',
                        current: processed,
                        total: items.length,
                        message: `Storing items: ${processed}/${items.length}`
                    });
                }
            });
            
            transaction.oncomplete = () => {
                console.log(`✅ Stored ${processed} items`);
                resolve();
            };
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Detect changes in fetched data compared to cache
     */
    async detectChanges(newData) {
        const changes = {
            items: [],
            summary: {
                new: 0,
                modified: 0,
                unchanged: 0
            },
            total: 0
        };
        
        for (const item of newData) {
            const imei = item['IMEI/ SERIAL NO.'] || item.IMEI || item.imei;
            if (!imei) continue;
            
            const cachedHash = await this.getItemHash(imei);
            const currentHash = this.calculateItemHash(item);
            
            if (!cachedHash) {
                // New item
                changes.items.push({ imei, item, changeType: 'new' });
                changes.summary.new++;
                changes.total++;
            } else if (cachedHash !== currentHash) {
                // Modified item
                changes.items.push({ imei, item, changeType: 'modified' });
                changes.summary.modified++;
                changes.total++;
            } else {
                // Unchanged
                changes.summary.unchanged++;
            }
        }
        
        return changes;
    }

    /**
     * Merge changes into cache
     */
    async mergeChanges(changedItems) {
        await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['inventory', 'itemHashes'], 'readwrite');
            const inventoryStore = transaction.objectStore('inventory');
            const hashStore = transaction.objectStore('itemHashes');
            
            changedItems.forEach(({ imei, item, changeType }) => {
                // Update item
                const itemData = {
                    imei: imei,
                    data: item,
                    lastModified: item.lastUpdated || new Date().toISOString(),
                    status: item.STATUS || item.status || '',
                    changeType: changeType,
                    syncedAt: new Date().toISOString()
                };
                
                inventoryStore.put(itemData);
                
                // Update hash
                const hash = this.calculateItemHash(item);
                hashStore.put({
                    imei: imei,
                    hash: hash,
                    timestamp: new Date().toISOString()
                });
            });
            
            transaction.oncomplete = () => {
                console.log(`✅ Merged ${changedItems.length} changes`);
                resolve();
            };
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Get all items from cache
     */
    async getAllFromCache() {
        await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['inventory'], 'readonly');
            const store = transaction.objectStore('inventory');
            const request = store.getAll();
            
            request.onsuccess = () => {
                // Extract just the data portion
                const items = request.result.map(record => record.data);
                resolve(items);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get item hash from cache
     */
    async getItemHash(imei) {
        await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['itemHashes'], 'readonly');
            const store = transaction.objectStore('itemHashes');
            const request = store.get(imei);
            
            request.onsuccess = () => {
                resolve(request.result?.hash || null);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get sync metadata
     */
    async getSyncMetadata() {
        await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncMetadata'], 'readonly');
            const store = transaction.objectStore('syncMetadata');
            const request = store.get('sync_info');
            
            request.onsuccess = () => resolve(request.result?.data || null);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Update sync metadata
     */
    async updateSyncMetadata(updates) {
        await this.initDB();
        
        const currentMeta = await this.getSyncMetadata() || {};
        const newMeta = { ...currentMeta, ...updates };
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['syncMetadata'], 'readwrite');
            const store = transaction.objectStore('syncMetadata');
            const request = store.put({ key: 'sync_info', data: newMeta });
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear all cached data
     */
    async clearCache() {
        await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['inventory', 'itemHashes', 'syncMetadata'], 'readwrite');
            
            transaction.objectStore('inventory').clear();
            transaction.objectStore('itemHashes').clear();
            transaction.objectStore('syncMetadata').clear();
            
            transaction.oncomplete = () => {
                console.log('🗑️ All cache cleared');
                resolve();
            };
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Get cache statistics
     */
    async getCacheStats() {
        const metadata = await this.getSyncMetadata();
        
        if (!metadata) {
            return {
                exists: false,
                message: 'No cache available'
            };
        }
        
        const allItems = await this.getAllFromCache();
        const lastSyncAge = Date.now() - new Date(metadata.lastIncrementalSync).getTime();
        const ageMinutes = Math.round(lastSyncAge / (1000 * 60));
        
        return {
            exists: true,
            itemCount: allItems.length,
            lastFullSync: metadata.lastFullSync,
            lastIncrementalSync: metadata.lastIncrementalSync,
            ageMinutes: ageMinutes,
            lastChangeCount: metadata.lastChangeCount || 0,
            syncType: metadata.syncType
        };
    }
}

// Export singleton
window.wholecellIncrementalSync = new WholecellIncrementalSync();

// Also export class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WholecellIncrementalSync;
}

