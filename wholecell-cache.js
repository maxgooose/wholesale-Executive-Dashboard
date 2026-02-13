/**
 * Wholecell Data Cache Manager
 * ==============================
 * Handles intelligent caching and incremental updates
 * - First load: Fetch all data (one-time, takes ~18 min for 2,167 pages at 2 req/sec)
 * - Subsequent loads: Use cache + fetch only recent changes
 * - Updates: Incremental, not full reload
 */

class WholecellCache {
    constructor() {
        this.CACHE_KEY = 'wholecell_inventory_cache';
        this.METADATA_KEY = 'wholecell_cache_metadata';
        this.VERSION = '1.0';
        
        // Use IndexedDB for large datasets (better than localStorage)
        this.db = null;
        this.initDB();
    }

    /**
     * Initialize IndexedDB for large data storage
     */
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('WholecellDB', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('inventory')) {
                    db.createObjectStore('inventory', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }
            };
        });
    }

    /**
     * Get cache metadata
     */
    async getMetadata() {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['metadata'], 'readonly');
            const store = transaction.objectStore('metadata');
            const request = store.get('cache_info');
            
            request.onsuccess = () => resolve(request.result?.data || null);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Save cache metadata
     */
    async saveMetadata(metadata) {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['metadata'], 'readwrite');
            const store = transaction.objectStore('metadata');
            const request = store.put({ key: 'cache_info', data: metadata });
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Check if we have a valid cache
     */
    async hasValidCache() {
        const metadata = await this.getMetadata();
        
        if (!metadata) return false;
        
        // Cache valid for 24 hours (adjust as needed)
        const cacheAge = Date.now() - new Date(metadata.timestamp).getTime();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        return cacheAge < maxAge && metadata.version === this.VERSION;
    }

    /**
     * Get all cached data
     */
    async getAllCached() {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['inventory'], 'readonly');
            const store = transaction.objectStore('inventory');
            const request = store.getAll();
            
            request.onsuccess = () => {
                console.log(`📦 Loaded ${request.result.length} items from cache`);
                resolve(request.result);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Save all data to cache
     */
    async saveAll(items) {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['inventory'], 'readwrite');
            const store = transaction.objectStore('inventory');
            
            // Clear existing data
            store.clear();
            
            // Add all items
            items.forEach(item => store.put(item));
            
            transaction.oncomplete = () => {
                console.log(`💾 Saved ${items.length} items to cache`);
                resolve();
            };
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Smart load: Use cache if available, otherwise fetch all
     */
    async smartLoad(api, onProgress) {
        const hasCache = await this.hasValidCache();
        const metadata = await this.getMetadata();
        
        if (hasCache) {
            console.log('✅ Valid cache found! Loading from cache...');
            const cachedData = await this.getAllCached();
            
            // Show cached data immediately
            console.log(`📊 Displaying ${cachedData.length} cached items`);
            
            // Optional: Fetch only recent changes in background
            this.fetchRecentChanges(api, metadata.lastUpdate);
            
            return cachedData;
        } else {
            console.log('❌ No valid cache. Performing initial full load...');
            console.log('⏳ This will take ~18 minutes due to API rate limits (2 req/sec)');
            return await this.fullLoad(api, onProgress);
        }
    }

    /**
     * Full load: Fetch all pages (respecting rate limit)
     */
    async fullLoad(api, onProgress) {
        console.log('🔄 Starting full data load from Wholecell API...');
        
        // Fetch with rate limiting (no maxPages limit - fetch everything)
        const allData = await api.fetchAllInventory({
            useCache: false,
            maxPages: null,  // Fetch all pages
            onProgress: (current, total) => {
                if (onProgress) onProgress(current, total);
                
                // Log progress every 50 pages
                if (current % 50 === 0) {
                    const percent = Math.round((current / total) * 100);
                    const elapsed = Math.round((current / 2)); // 2 req/sec
                    const remaining = Math.round(((total - current) / 2));
                    console.log(`📥 Progress: ${percent}% (${current}/${total} pages) | Elapsed: ${elapsed}s | Remaining: ~${remaining}s`);
                }
            }
        });
        
        // Save to IndexedDB cache
        await this.saveAll(allData);
        
        const metadata = {
            timestamp: new Date().toISOString(),
            itemCount: allData.length,
            version: this.VERSION,
            lastUpdate: new Date().toISOString()
        };
        await this.saveMetadata(metadata);
        
        // ALSO save to JSON format for safe storage and future smart updates
        console.log('💾 Saving data to JSON format for safe storage...');
        await this.exportToJSON(allData, metadata);
        
        console.log('✅ Full load complete and cached!');
        return allData;
    }

    /**
     * Export data to JSON format for safe storage
     * This will be used for future smart update feature
     */
    async exportToJSON(data, metadata) {
        try {
            const exportData = {
                metadata: metadata,
                version: this.VERSION,
                exportDate: new Date().toISOString(),
                itemCount: data.length,
                items: data
            };
            
            // Create downloadable JSON file
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `wholecell-data-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            console.log(`✅ Data exported to JSON: ${data.length} items`);
            console.log('📁 File will be downloaded automatically');
            
            // Also save a compressed version metadata-only for quick reference
            const metadataOnly = {
                metadata: metadata,
                version: this.VERSION,
                exportDate: new Date().toISOString(),
                itemCount: data.length,
                note: 'Full data available in the complete backup file'
            };
            
            // Store summary in localStorage for quick reference
            localStorage.setItem('wholecell_last_export', JSON.stringify(metadataOnly));
            
        } catch (error) {
            console.error('❌ Error exporting to JSON:', error);
            // Don't fail the whole operation if export fails
        }
    }

    /**
     * Get last export information
     */
    getLastExportInfo() {
        const info = localStorage.getItem('wholecell_last_export');
        return info ? JSON.parse(info) : null;
    }

    /**
     * Fetch only recent changes (much faster)
     */
    async fetchRecentChanges(api, since) {
        console.log(`🔍 Checking for changes since ${since}...`);
        
        try {
            // Fetch only first few pages to check for recent changes
            // Assumption: Recent changes are in first pages
            const recentData = await api.fetchAllInventory({
                useCache: false,
                maxPages: 5 // Only check first 5 pages
            });
            
            console.log(`📊 Checked ${recentData.length} recent items for changes`);
            
            // TODO: Compare with cache and update only changed items
            // For now, just log that we checked
            
        } catch (error) {
            console.error('Error fetching recent changes:', error);
        }
    }

    /**
     * Force refresh: Clear cache and reload
     */
    async forceRefresh(api, onProgress) {
        console.log('🔄 Force refresh: Clearing cache...');
        await this.clearCache();
        return await this.fullLoad(api, onProgress);
    }

    /**
     * Clear all cached data
     */
    async clearCache() {
        if (!this.db) await this.initDB();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['inventory', 'metadata'], 'readwrite');
            
            transaction.objectStore('inventory').clear();
            transaction.objectStore('metadata').clear();
            
            transaction.oncomplete = () => {
                console.log('🗑️ Cache cleared');
                resolve();
            };
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Get cache statistics
     */
    async getCacheStats() {
        const metadata = await this.getMetadata();
        
        if (!metadata) {
            return {
                exists: false,
                message: 'No cache available'
            };
        }
        
        const age = Date.now() - new Date(metadata.timestamp).getTime();
        const ageHours = Math.round(age / (1000 * 60 * 60));
        
        return {
            exists: true,
            itemCount: metadata.itemCount,
            lastCached: metadata.timestamp,
            ageHours: ageHours,
            isValid: await this.hasValidCache()
        };
    }
}

// Export singleton
window.wholecellCache = new WholecellCache();

