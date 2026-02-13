/**
 * Pricing Database Manager
 * Handles all pricing data storage and retrieval using IndexedDB
 */

class PricingDatabase {
    constructor() {
        this.dbName = 'InventoryPricingDB';
        this.dbVersion = 1;
        this.db = null;
        this.cache = new Map(); // In-memory cache for frequently accessed data
        this.initPromise = this.initDatabase();
    }

    /**
     * Initialize IndexedDB database with all required object stores
     */
    async initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('Failed to open database:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('Database opened successfully');
                this.loadCacheFromDB();
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create modelPrices store
                if (!db.objectStoreNames.contains('modelPrices')) {
                    const pricesStore = db.createObjectStore('modelPrices', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    pricesStore.createIndex('modelStorage', ['model', 'storage'], { unique: true });
                    pricesStore.createIndex('model', 'model', { unique: false });
                    pricesStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
                }

                // Create priceHistory store
                if (!db.objectStoreNames.contains('priceHistory')) {
                    const historyStore = db.createObjectStore('priceHistory', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    historyStore.createIndex('modelId', 'modelId', { unique: false });
                    historyStore.createIndex('timestamp', 'timestamp', { unique: false });
                    historyStore.createIndex('userId', 'userId', { unique: false });
                }

                // Create breakdownSheets store
                if (!db.objectStoreNames.contains('breakdownSheets')) {
                    const sheetsStore = db.createObjectStore('breakdownSheets', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    sheetsStore.createIndex('createdAt', 'createdAt', { unique: false });
                    sheetsStore.createIndex('name', 'name', { unique: false });
                }

                // Create marketPrices store
                if (!db.objectStoreNames.contains('marketPrices')) {
                    const marketStore = db.createObjectStore('marketPrices', { 
                        keyPath: 'modelId' 
                    });
                    marketStore.createIndex('model', 'model', { unique: false });
                    marketStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
                }

                // Create wholesalePrices store for smart suggestions
                if (!db.objectStoreNames.contains('wholesalePrices')) {
                    const wholesaleStore = db.createObjectStore('wholesalePrices', { 
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    wholesaleStore.createIndex('model', 'model', { unique: false });
                    wholesaleStore.createIndex('source', 'source', { unique: false });
                    wholesaleStore.createIndex('date', 'date', { unique: false });
                }

                console.log('Database schema created/updated successfully');
            };
        });
    }

    /**
     * Ensure database is ready before operations
     */
    async ensureReady() {
        if (!this.db) {
            await this.initPromise;
        }
        return this.db;
    }

    /**
     * Load frequently accessed prices into cache
     */
    async loadCacheFromDB() {
        try {
            const db = await this.ensureReady();
            const transaction = db.transaction(['modelPrices'], 'readonly');
            const store = transaction.objectStore('modelPrices');
            const request = store.getAll();

            request.onsuccess = () => {
                const prices = request.result;
                prices.forEach(price => {
                    const cacheKey = `${price.model}_${price.storage}`;
                    this.cache.set(cacheKey, price);
                });
                console.log(`Loaded ${prices.length} prices into cache`);
            };
        } catch (error) {
            console.error('Failed to load cache:', error);
        }
    }

    /**
     * Save or update model pricing
     */
    async saveModelPrice(priceData) {
        const db = await this.ensureReady();
        
        // Prepare the price object
        const priceObject = {
            model: priceData.model,
            storage: priceData.storage,
            gradeA: parseFloat(priceData.gradeA || 0),
            gradeB: parseFloat(priceData.gradeB || 0),
            gradeC: parseFloat(priceData.gradeC || 0),
            gradeCAMZ: parseFloat(priceData.gradeCAMZ || 0),
            gradeD: parseFloat(priceData.gradeD || 0),
            defective: parseFloat(priceData.defective || 0),
            total: this.calculateTotal(priceData),
            lastUpdated: new Date().toISOString(),
            updatedBy: priceData.userId || 'System'
        };

        // Check if price exists
        const existingPrice = await this.getModelPrice(priceData.model, priceData.storage);
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['modelPrices', 'priceHistory'], 'readwrite');
            const priceStore = transaction.objectStore('modelPrices');
            const historyStore = transaction.objectStore('priceHistory');

            // Save to history if updating existing price
            if (existingPrice) {
                priceObject.id = existingPrice.id;
                
                const historyEntry = {
                    modelId: existingPrice.id,
                    model: priceData.model,
                    storage: priceData.storage,
                    oldPrices: {
                        gradeA: existingPrice.gradeA,
                        gradeB: existingPrice.gradeB,
                        gradeC: existingPrice.gradeC,
                        gradeCAMZ: existingPrice.gradeCAMZ,
                        gradeD: existingPrice.gradeD,
                        defective: existingPrice.defective
                    },
                    newPrices: {
                        gradeA: priceObject.gradeA,
                        gradeB: priceObject.gradeB,
                        gradeC: priceObject.gradeC,
                        gradeCAMZ: priceObject.gradeCAMZ,
                        gradeD: priceObject.gradeD,
                        defective: priceObject.defective
                    },
                    timestamp: new Date().toISOString(),
                    userId: priceData.userId || 'System'
                };
                
                historyStore.add(historyEntry);
            }

            // Save/update the price
            const request = existingPrice ? 
                priceStore.put(priceObject) : 
                priceStore.add(priceObject);

            request.onsuccess = () => {
                // Update cache
                const cacheKey = `${priceObject.model}_${priceObject.storage}`;
                this.cache.set(cacheKey, priceObject);
                
                resolve(priceObject);
                console.log('Price saved successfully:', priceObject);
            };

            request.onerror = () => {
                reject(request.error);
                console.error('Failed to save price:', request.error);
            };
        });
    }

    /**
     * Get pricing for a specific model and storage
     */
    async getModelPrice(model, storage) {
        // Check cache first
        const cacheKey = `${model}_${storage}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const db = await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['modelPrices'], 'readonly');
            const store = transaction.objectStore('modelPrices');
            const index = store.index('modelStorage');
            const request = index.get([model, storage]);

            request.onsuccess = () => {
                const price = request.result;
                if (price) {
                    this.cache.set(cacheKey, price);
                }
                resolve(price);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get all prices for a specific model (all storage variants)
     */
    async getModelPrices(model) {
        const db = await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['modelPrices'], 'readonly');
            const store = transaction.objectStore('modelPrices');
            const index = store.index('model');
            const request = index.getAll(model);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get all stored prices
     */
    async getAllPrices() {
        const db = await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['modelPrices'], 'readonly');
            const store = transaction.objectStore('modelPrices');
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get price history for a model
     */
    async getPriceHistory(modelId, limit = 10) {
        const db = await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['priceHistory'], 'readonly');
            const store = transaction.objectStore('priceHistory');
            const index = store.index('modelId');
            const request = index.getAll(modelId);

            request.onsuccess = () => {
                const history = request.result
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                    .slice(0, limit);
                resolve(history);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Save market/wholesale price for smart suggestions
     */
    async saveMarketPrice(marketData) {
        const db = await this.ensureReady();
        
        const marketPrice = {
            modelId: `${marketData.model}_${marketData.storage}`,
            model: marketData.model,
            storage: marketData.storage,
            wholesalePrice: parseFloat(marketData.wholesalePrice || 0),
            retailPrice: parseFloat(marketData.retailPrice || 0),
            source: marketData.source || 'Manual',
            lastUpdated: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['marketPrices'], 'readwrite');
            const store = transaction.objectStore('marketPrices');
            const request = store.put(marketPrice);

            request.onsuccess = () => {
                resolve(marketPrice);
                console.log('Market price saved:', marketPrice);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get smart pricing suggestions based on history and market data
     */
    async getSmartSuggestions(model, storage, grade) {
        const suggestions = {
            historical: null,
            market: null,
            recommended: null,
            confidence: 0
        };

        try {
            // Get historical pricing
            const currentPrice = await this.getModelPrice(model, storage);
            if (currentPrice) {
                // Map grade parameter to actual field name
                const gradeFieldMap = {
                    'A': 'gradeA',
                    'B': 'gradeB',
                    'C': 'gradeC',
                    'CAMZ': 'gradeCAMZ',
                    'D': 'gradeD',
                    'defective': 'defective'
                };
                const fieldName = gradeFieldMap[grade] || 'gradeA';
                suggestions.historical = currentPrice[fieldName] || 0;
            }

            // Get market pricing
            const marketPrice = await this.getMarketPrice(model, storage);
            if (marketPrice) {
                // Apply grade multipliers
                const gradeMultipliers = {
                    'A': 1.0,
                    'APlus': 1.1,
                    'B': 0.85,
                    'C': 0.70,
                    'CAMZ': 0.65,
                    'D': 0.50,
                    'defective': 0.35
                };
                
                suggestions.market = marketPrice.wholesalePrice * (gradeMultipliers[grade] || 1.0);
            }

            // Get recent price trends
            const history = await this.getPriceHistory(`${model}_${storage}`, 5);
            
            // Calculate recommended price
            if (suggestions.historical && suggestions.market) {
                // Weighted average: 60% market, 40% historical
                suggestions.recommended = (suggestions.market * 0.6) + (suggestions.historical * 0.4);
                suggestions.confidence = 85;
            } else if (suggestions.market) {
                suggestions.recommended = suggestions.market;
                suggestions.confidence = 70;
            } else if (suggestions.historical) {
                suggestions.recommended = suggestions.historical;
                suggestions.confidence = 60;
            }

            // Analyze price trends
            if (history.length > 2) {
                const trend = this.analyzePriceTrend(history, grade);
                suggestions.trend = trend;
                
                // Adjust recommendation based on trend
                if (trend.direction === 'increasing' && suggestions.recommended) {
                    suggestions.recommended *= 1.02; // 2% increase
                } else if (trend.direction === 'decreasing' && suggestions.recommended) {
                    suggestions.recommended *= 0.98; // 2% decrease
                }
            }

        } catch (error) {
            console.error('Error generating smart suggestions:', error);
        }

        return suggestions;
    }

    /**
     * Get market price for a model
     */
    async getMarketPrice(model, storage) {
        const db = await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['marketPrices'], 'readonly');
            const store = transaction.objectStore('marketPrices');
            const request = store.get(`${model}_${storage}`);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Analyze price trend from history
     */
    analyzePriceTrend(history, grade) {
        if (history.length < 2) {
            return { direction: 'stable', change: 0 };
        }

        const gradeKey = `grade${grade}`;
        const prices = history.map(h => h.newPrices?.[gradeKey] || 0).filter(p => p > 0);
        
        if (prices.length < 2) {
            return { direction: 'stable', change: 0 };
        }

        const recent = prices[0];
        const older = prices[prices.length - 1];
        const change = ((recent - older) / older) * 100;

        let direction = 'stable';
        if (change > 5) direction = 'increasing';
        else if (change < -5) direction = 'decreasing';

        return { direction, change: change.toFixed(2) };
    }

    /**
     * Save breakdown sheet configuration
     */
    async saveBreakdownSheet(sheetData) {
        const db = await this.ensureReady();
        
        const sheet = {
            name: sheetData.name || `Breakdown_${new Date().toISOString()}`,
            columns: sheetData.columns || ['PHONE/MODEL', 'STORAGE', 'A', 'B', 'C', 'C (AMZ)', 'D', 'DEFECTIVE', 'TOTAL'],
            data: sheetData.data,
            createdAt: new Date().toISOString(),
            createdBy: sheetData.userId || 'System',
            filters: sheetData.filters || {}
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['breakdownSheets'], 'readwrite');
            const store = transaction.objectStore('breakdownSheets');
            const request = store.add(sheet);

            request.onsuccess = () => {
                sheet.id = request.result;
                resolve(sheet);
                console.log('Breakdown sheet saved:', sheet);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get all breakdown sheets
     */
    async getBreakdownSheets(limit = 20) {
        const db = await this.ensureReady();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['breakdownSheets'], 'readonly');
            const store = transaction.objectStore('breakdownSheets');
            const index = store.index('createdAt');
            const request = index.openCursor(null, 'prev');
            
            const sheets = [];
            let count = 0;

            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor && count < limit) {
                    sheets.push(cursor.value);
                    count++;
                    cursor.continue();
                } else {
                    resolve(sheets);
                }
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Calculate total for pricing data
     */
    calculateTotal(priceData) {
        const gradeA = parseFloat(priceData.gradeA || 0);
        const gradeB = parseFloat(priceData.gradeB || 0);
        const gradeC = parseFloat(priceData.gradeC || 0);
        const gradeCAMZ = parseFloat(priceData.gradeCAMZ || 0);
        const gradeD = parseFloat(priceData.gradeD || 0);
        const defective = parseFloat(priceData.defective || 0);
        
        // You can adjust this formula based on business logic
        return gradeA + gradeB + gradeC + gradeCAMZ + gradeD + defective;
    }

    /**
     * Export all pricing data for backup
     */
    async exportData() {
        const db = await this.ensureReady();
        const exportData = {
            version: this.dbVersion,
            exportDate: new Date().toISOString(),
            modelPrices: [],
            priceHistory: [],
            marketPrices: [],
            breakdownSheets: []
        };

        try {
            // Export model prices
            exportData.modelPrices = await this.getAllPrices();
            
            // Export price history
            const historyTransaction = db.transaction(['priceHistory'], 'readonly');
            const historyStore = historyTransaction.objectStore('priceHistory');
            exportData.priceHistory = await new Promise((resolve) => {
                const request = historyStore.getAll();
                request.onsuccess = () => resolve(request.result);
            });

            // Export market prices
            const marketTransaction = db.transaction(['marketPrices'], 'readonly');
            const marketStore = marketTransaction.objectStore('marketPrices');
            exportData.marketPrices = await new Promise((resolve) => {
                const request = marketStore.getAll();
                request.onsuccess = () => resolve(request.result);
            });

            // Export breakdown sheets
            exportData.breakdownSheets = await this.getBreakdownSheets(100);

            // Save to localStorage as backup
            localStorage.setItem('pricingBackup', JSON.stringify(exportData));
            
            return exportData;
        } catch (error) {
            console.error('Export failed:', error);
            throw error;
        }
    }

    /**
     * Import pricing data from backup
     */
    async importData(importData) {
        const db = await this.ensureReady();
        
        try {
            // Import model prices
            if (importData.modelPrices && importData.modelPrices.length > 0) {
                const transaction = db.transaction(['modelPrices'], 'readwrite');
                const store = transaction.objectStore('modelPrices');
                
                for (const price of importData.modelPrices) {
                    await new Promise((resolve, reject) => {
                        const request = store.put(price);
                        request.onsuccess = resolve;
                        request.onerror = reject;
                    });
                }
            }

            // Import market prices
            if (importData.marketPrices && importData.marketPrices.length > 0) {
                const transaction = db.transaction(['marketPrices'], 'readwrite');
                const store = transaction.objectStore('marketPrices');
                
                for (const price of importData.marketPrices) {
                    await new Promise((resolve, reject) => {
                        const request = store.put(price);
                        request.onsuccess = resolve;
                        request.onerror = reject;
                    });
                }
            }

            // Reload cache
            await this.loadCacheFromDB();
            
            console.log('Import completed successfully');
            return true;
        } catch (error) {
            console.error('Import failed:', error);
            throw error;
        }
    }

    /**
     * Clear all pricing data (use with caution)
     */
    async clearAllData() {
        const db = await this.ensureReady();
        
        const stores = ['modelPrices', 'priceHistory', 'marketPrices', 'breakdownSheets', 'wholesalePrices'];
        
        for (const storeName of stores) {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            await new Promise((resolve, reject) => {
                const request = store.clear();
                request.onsuccess = resolve;
                request.onerror = reject;
            });
        }
        
        this.cache.clear();
        console.log('All pricing data cleared');
    }

    /**
     * Search prices by model name
     */
    async searchPrices(searchTerm) {
        const allPrices = await this.getAllPrices();
        
        if (!searchTerm) {
            return allPrices;
        }
        
        const term = searchTerm.toLowerCase();
        return allPrices.filter(price => 
            price.model.toLowerCase().includes(term) ||
            price.storage.toLowerCase().includes(term)
        );
    }

    /**
     * Get pricing statistics
     */
    async getPricingStats() {
        const allPrices = await this.getAllPrices();
        
        const stats = {
            totalModels: allPrices.length,
            lastUpdated: null,
            averagePrices: {
                gradeA: 0,
                gradeB: 0,
                gradeC: 0,
                gradeCAMZ: 0,
                gradeD: 0,
                defective: 0
            },
            modelsWithPrices: new Set(),
            priceRanges: {
                gradeA: { min: Infinity, max: -Infinity },
                gradeB: { min: Infinity, max: -Infinity },
                gradeC: { min: Infinity, max: -Infinity },
                gradeCAMZ: { min: Infinity, max: -Infinity },
                gradeD: { min: Infinity, max: -Infinity },
                defective: { min: Infinity, max: -Infinity }
            }
        };

        if (allPrices.length === 0) {
            return stats;
        }

        let sumA = 0, sumB = 0, sumC = 0, sumCAMZ = 0, sumD = 0, sumDefective = 0;
        let countA = 0, countB = 0, countC = 0, countCAMZ = 0, countD = 0, countDefective = 0;

        allPrices.forEach(price => {
            stats.modelsWithPrices.add(price.model);
            
            if (price.gradeA > 0) {
                sumA += price.gradeA;
                countA++;
                stats.priceRanges.gradeA.min = Math.min(stats.priceRanges.gradeA.min, price.gradeA);
                stats.priceRanges.gradeA.max = Math.max(stats.priceRanges.gradeA.max, price.gradeA);
            }
            
            if (price.gradeB > 0) {
                sumB += price.gradeB;
                countB++;
                stats.priceRanges.gradeB.min = Math.min(stats.priceRanges.gradeB.min, price.gradeB);
                stats.priceRanges.gradeB.max = Math.max(stats.priceRanges.gradeB.max, price.gradeB);
            }
            
            if (price.gradeC > 0) {
                sumC += price.gradeC;
                countC++;
                stats.priceRanges.gradeC.min = Math.min(stats.priceRanges.gradeC.min, price.gradeC);
                stats.priceRanges.gradeC.max = Math.max(stats.priceRanges.gradeC.max, price.gradeC);
            }
            
            if (price.gradeCAMZ > 0) {
                sumCAMZ += price.gradeCAMZ;
                countCAMZ++;
                stats.priceRanges.gradeCAMZ.min = Math.min(stats.priceRanges.gradeCAMZ.min, price.gradeCAMZ);
                stats.priceRanges.gradeCAMZ.max = Math.max(stats.priceRanges.gradeCAMZ.max, price.gradeCAMZ);
            }
            
            if (price.gradeD > 0) {
                sumD += price.gradeD;
                countD++;
                stats.priceRanges.gradeD.min = Math.min(stats.priceRanges.gradeD.min, price.gradeD);
                stats.priceRanges.gradeD.max = Math.max(stats.priceRanges.gradeD.max, price.gradeD);
            }
            
            if (price.defective > 0) {
                sumDefective += price.defective;
                countDefective++;
                stats.priceRanges.defective.min = Math.min(stats.priceRanges.defective.min, price.defective);
                stats.priceRanges.defective.max = Math.max(stats.priceRanges.defective.max, price.defective);
            }

            if (!stats.lastUpdated || price.lastUpdated > stats.lastUpdated) {
                stats.lastUpdated = price.lastUpdated;
            }
        });

        stats.averagePrices.gradeA = countA > 0 ? (sumA / countA).toFixed(2) : 0;
        stats.averagePrices.gradeB = countB > 0 ? (sumB / countB).toFixed(2) : 0;
        stats.averagePrices.gradeC = countC > 0 ? (sumC / countC).toFixed(2) : 0;
        stats.averagePrices.gradeCAMZ = countCAMZ > 0 ? (sumCAMZ / countCAMZ).toFixed(2) : 0;
        stats.averagePrices.gradeD = countD > 0 ? (sumD / countD).toFixed(2) : 0;
        stats.averagePrices.defective = countDefective > 0 ? (sumDefective / countDefective).toFixed(2) : 0;
        
        stats.uniqueModels = stats.modelsWithPrices.size;
        
        return stats;
    }
}

// Create and export singleton instance
const pricingDB = new PricingDatabase();

// Make it globally available for debugging
window.pricingDB = pricingDB;

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = pricingDB;
}
