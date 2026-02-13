/**
 * Wholecell API Client
 * =====================
 * Frontend module for fetching data from Wholecell API via our proxy server.
 * Based on Phase 1 test results - we know the API structure and can fetch everything!
 */

class WholecellAPI {
    constructor() {
        // Default to proxy server on port 5001 (5000 was in use during testing)
        this.proxyUrl = 'http://localhost:5001';
        this.cache = {
            data: null,
            timestamp: null,
            expiresIn: 15 * 60 * 1000 // 15 minutes
        };
        this.isFetching = false;
        this.fetchPromise = null;
    }

    /**
     * Configure the proxy URL
     */
    setProxyUrl(url) {
        this.proxyUrl = url;
    }

    /**
     * Check if cached data is still valid
     */
    isCacheValid() {
        if (!this.cache.data || !this.cache.timestamp) {
            return false;
        }
        const age = Date.now() - this.cache.timestamp;
        return age < this.cache.expiresIn;
    }

    /**
     * Fetch all inventory from Wholecell API
     * 
     * Results from Phase 1 testing:
     * - 2,167 pages total
     * - 100 items per page
     * - ~216,700 total items
     * 
     * Strategy: Fetch first page, then fetch remaining pages in batches
     * 
     * @param {Object} options - Fetch options
     * @param {boolean} options.useCache - Use cached data if available (default: true)
     * @param {boolean} options.statusFilter - Filter by status (e.g., 'Available')
     * @param {Function} options.onProgress - Progress callback (current, total)
     * @returns {Promise<Array>} Array of inventory items
     */
    async fetchAllInventory(options = {}) {
        const {
            useCache = true,
            statusFilter = 'Available',
            onProgress = null,
            maxPages = null  // null = fetch all pages
        } = options;

        // Return cached data if valid
        if (useCache && this.isCacheValid()) {
            console.log('Returning cached Wholecell data');
            return this.cache.data;
        }

        // If already fetching, return the existing promise
        if (this.isFetching && this.fetchPromise) {
            console.log('Fetch already in progress, waiting...');
            return this.fetchPromise;
        }

        // Start fetching
        this.isFetching = true;
        this.fetchPromise = this._fetchAllPages(statusFilter, onProgress, maxPages);

        try {
            const data = await this.fetchPromise;
            
            // Cache the results
            this.cache.data = data;
            this.cache.timestamp = Date.now();
            
            return data;
        } finally {
            this.isFetching = false;
            this.fetchPromise = null;
        }
    }

    /**
     * Load inventory from the local JSON snapshot file
     */
    async _loadLocalData() {
        try {
            console.log('Loading local available-inventory.json...');
            const response = await fetch('data/available-inventory.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const json = await response.json();
            console.log(`Loaded ${json.count} items from local snapshot`);
            return json.data;
        } catch (error) {
            console.warn('Local data not available:', error.message);
            return null;
        }
    }

    /**
     * Internal method to fetch all pages
     */
    async _fetchAllPages(statusFilter, onProgress, maxPages = null) {
        try {
            // Try proxy first, fall back to local JSON snapshot
            const proxyHealthy = await this.checkHealth();
            if (!proxyHealthy) {
                console.log('Proxy not available, trying local data snapshot...');
                const localData = await this._loadLocalData();
                if (localData) {
                    if (onProgress) onProgress(1, 1);
                    return localData;
                }
                throw new Error('Proxy is down and no local data available');
            }

            // Build URL with filters
            let url = `${this.proxyUrl}/api/inventory`;
            if (statusFilter) {
                url += `?status=${encodeURIComponent(statusFilter)}`;
            }

            // Fetch first page to get total pages
            console.log('Fetching first page from Wholecell...');
            const firstPage = await this._fetchPage(url);
            
            if (!firstPage || !firstPage.data) {
                throw new Error('Invalid response from Wholecell API');
            }

            // Proxy returns Wholecell response directly: {data: [...], pages: N, page: N}
            const totalPages = firstPage.pages || 1;
            const allData = [...firstPage.data];

            console.log(`Wholecell has ${totalPages} pages (${allData.length} items per page)`);

            // Update progress
            if (onProgress) {
                onProgress(1, totalPages);
            }

            // If only one page, return early
            if (totalPages === 1) {
                return allData;
            }

            // Fetch remaining pages respecting rate limit (2 requests/second)
            const remainingPages = Array.from(
                { length: totalPages - 1 }, 
                (_, i) => i + 2 // Pages 2 to totalPages
            );

            // Rate limiting: 500ms between requests = 2 req/sec
            const RATE_LIMIT_DELAY = 500;
            
            for (let i = 0; i < remainingPages.length; i++) {
                const pageNum = remainingPages[i];
                
                // Log progress every 50 pages
                if (pageNum % 50 === 0) {
                    console.log(`Fetching page ${pageNum} of ${totalPages}...`);
                }
                
                const pageUrl = statusFilter 
                    ? `${url}&page=${pageNum}`
                    : `${url}?page=${pageNum}`;
                
                try {
                    const result = await this._fetchPage(pageUrl);
                    
                    if (result && result.data) {
                        allData.push(...result.data);
                    }
                } catch (error) {
                    console.error(`Error fetching page ${pageNum}:`, error);
                }

                // Update progress
                if (onProgress) {
                    onProgress(i + 2, totalPages); // +2 because we already fetched page 1
                }

                // Check maxPages limit
                if (maxPages && (i + 2) >= maxPages) {
                    console.log(`Reached maxPages limit (${maxPages})`);
                    break;
                }

                // Rate limiting delay (except last page)
                if (i < remainingPages.length - 1) {
                    await this._sleep(RATE_LIMIT_DELAY);
                }
            }

            console.log(`Fetched ${allData.length} items from Wholecell`);
            return allData;

        } catch (error) {
            console.error('Error fetching from Wholecell:', error);
            throw error;
        }
    }

    /**
     * Fetch a single page from the API
     */
    async _fetchPage(url) {
        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            // Handle proxy response format
            if (data.success === false) {
                throw new Error(data.error || 'Unknown error from proxy');
            }

            return data;
        } catch (error) {
            console.error(`Error fetching page: ${url}`, error);
            throw error;
        }
    }

    /**
     * Sleep helper for rate limiting
     */
    async _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Fetch a specific item by IMEI/ESN
     * 
     * @param {string} esn - IMEI or ESN number
     * @returns {Promise<Object|null>} Item or null if not found
     */
    async fetchByESN(esn) {
        try {
            const url = `${this.proxyUrl}/api/inventory/${encodeURIComponent(esn)}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.success && result.data && result.data.data) {
                return result.data.data[0] || null;
            }
            
            return null;
        } catch (error) {
            console.error(`Error fetching ESN ${esn}:`, error);
            return null;
        }
    }

    /**
     * Fetch only available inventory
     * This is optimized - uses Wholecell's status filter
     * 
     * @param {Object} options - Fetch options
     * @returns {Promise<Array>} Array of available items
     */
    async fetchAvailableOnly(options = {}) {
        return this.fetchAllInventory({
            ...options,
            statusFilter: 'Available'
        });
    }

    /**
     * Check if proxy server is reachable
     * 
     * @returns {Promise<boolean>} True if healthy
     */
    async checkHealth() {
        try {
            const response = await fetch(`${this.proxyUrl}/api/health`, {
                timeout: 5000
            });
            
            if (!response.ok) {
                return false;
            }

            const data = await response.json();
            return data.status === 'healthy';
        } catch (error) {
            console.error('Health check failed:', error);
            return false;
        }
    }

    /**
     * Clear cached data
     */
    clearCache() {
        this.cache.data = null;
        this.cache.timestamp = null;
        console.log('Wholecell cache cleared');
    }

    /**
     * Get cache info
     */
    getCacheInfo() {
        return {
            hasCache: !!this.cache.data,
            timestamp: this.cache.timestamp,
            age: this.cache.timestamp ? Date.now() - this.cache.timestamp : null,
            expiresIn: this.cache.expiresIn,
            itemCount: this.cache.data ? this.cache.data.length : 0
        };
    }

    /**
     * Helper to delay execution
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WholecellAPI;
}

// Make available globally
window.WholecellAPI = WholecellAPI;

