/**
 * Pricing Database Manager
 * Server-backed store with in-memory cache.
 * All data persists in Neon Postgres via /api/model-prices.
 * The public interface is identical to the old IndexedDB version
 * so all consumers (breakdown-modal, room-workflow, excel-export, data-manager) work unchanged.
 */

class PricingDatabase {
    constructor() {
        this.cache = new Map();
        this.marketCache = new Map();
        this.ready = false;
        this.initPromise = this._hydrate();
    }

    async _hydrate() {
        const maxRetries = 2;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const res = await fetch('/api/model-prices');
                if (!res.ok) throw new Error(`Server returned ${res.status}`);
                const data = await res.json();
                const prices = data.prices || [];
                prices.forEach(row => {
                    const obj = this._rowToPrice(row);
                    this.cache.set(`${obj.model}_${obj.storage}`, obj);
                });
                this.ready = true;
                console.log(`Pricing DB: loaded ${prices.length} prices from server`);
                return;
            } catch (err) {
                if (attempt < maxRetries) {
                    console.warn(`Pricing DB: hydrate attempt ${attempt + 1} failed, retrying...`);
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                } else {
                    console.warn('Pricing DB: server hydrate failed after retries, starting empty cache:', err.message);
                    this.ready = true;
                }
            }
        }
    }

    _rowToPrice(row) {
        return {
            id: row.id,
            model: row.model,
            storage: row.storage,
            gradeA: parseFloat(row.grade_a) || 0,
            gradeB: parseFloat(row.grade_b) || 0,
            gradeC: parseFloat(row.grade_c) || 0,
            gradeCAMZ: parseFloat(row.grade_c_amz) || 0,
            gradeD: parseFloat(row.grade_d) || 0,
            defective: parseFloat(row.defective) || 0,
            lastUpdated: row.updated_at || new Date().toISOString(),
            updatedBy: row.updated_by || 'System',
            get total() {
                return this.gradeA + this.gradeB + this.gradeC + this.gradeCAMZ + this.gradeD + this.defective;
            }
        };
    }

    async ensureReady() {
        if (!this.ready) await this.initPromise;
    }

    async saveModelPrice(priceData) {
        await this.ensureReady();

        const body = {
            model: priceData.model,
            storage: priceData.storage,
            grade_a: parseFloat(priceData.gradeA || 0),
            grade_b: parseFloat(priceData.gradeB || 0),
            grade_c: parseFloat(priceData.gradeC || 0),
            grade_c_amz: parseFloat(priceData.gradeCAMZ || 0),
            grade_d: parseFloat(priceData.gradeD || 0),
            defective: parseFloat(priceData.defective || 0),
            updated_by: priceData.userId || 'System'
        };

        const res = await fetch('/api/model-prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(err.error || `Server error ${res.status}`);
        }

        const data = await res.json();
        const priceObj = this._rowToPrice(data.price);
        this.cache.set(`${priceObj.model}_${priceObj.storage}`, priceObj);

        // Append to audit log (fire-and-forget, non-critical)
        fetch('/api/prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: priceData.model, storage: priceData.storage, price: body.grade_a })
        }).catch(() => {});

        console.log('Price saved:', priceObj.model, priceObj.storage);
        return priceObj;
    }

    async getModelPrice(model, storage) {
        await this.ensureReady();
        return this.cache.get(`${model}_${storage}`) || null;
    }

    async getAllPrices() {
        await this.ensureReady();
        return Array.from(this.cache.values());
    }

    async getModelPrices(model) {
        await this.ensureReady();
        return Array.from(this.cache.values()).filter(p => p.model === model);
    }

    async getPriceHistory(modelId, limit = 10) {
        // Price history now lives server-side only; return empty for cache-based callers
        return [];
    }

    async saveMarketPrice(marketData) {
        const marketPrice = {
            modelId: `${marketData.model}_${marketData.storage}`,
            model: marketData.model,
            storage: marketData.storage,
            wholesalePrice: parseFloat(marketData.wholesalePrice || 0),
            retailPrice: parseFloat(marketData.retailPrice || 0),
            source: marketData.source || 'Manual',
            lastUpdated: new Date().toISOString()
        };
        this.marketCache.set(marketPrice.modelId, marketPrice);
        try { localStorage.setItem('marketPrices', JSON.stringify(Array.from(this.marketCache.values()))); } catch {}
        return marketPrice;
    }

    async getMarketPrice(model, storage) {
        if (this.marketCache.size === 0) {
            try {
                const stored = localStorage.getItem('marketPrices');
                if (stored) JSON.parse(stored).forEach(m => this.marketCache.set(m.modelId, m));
            } catch {}
        }
        return this.marketCache.get(`${model}_${storage}`) || null;
    }

    async getSmartSuggestions(model, storage, grade) {
        const suggestions = { historical: null, market: null, recommended: null, confidence: 0 };

        try {
            const currentPrice = await this.getModelPrice(model, storage);
            if (currentPrice) {
                const gradeFieldMap = { 'A': 'gradeA', 'B': 'gradeB', 'C': 'gradeC', 'CAMZ': 'gradeCAMZ', 'D': 'gradeD', 'defective': 'defective' };
                suggestions.historical = currentPrice[gradeFieldMap[grade] || 'gradeA'] || 0;
            }

            const marketPrice = await this.getMarketPrice(model, storage);
            if (marketPrice) {
                const multipliers = { 'A': 1.0, 'APlus': 1.1, 'B': 0.85, 'C': 0.70, 'CAMZ': 0.65, 'D': 0.50, 'defective': 0.35 };
                suggestions.market = marketPrice.wholesalePrice * (multipliers[grade] || 1.0);
            }

            if (suggestions.historical && suggestions.market) {
                suggestions.recommended = (suggestions.market * 0.6) + (suggestions.historical * 0.4);
                suggestions.confidence = 85;
            } else if (suggestions.market) {
                suggestions.recommended = suggestions.market;
                suggestions.confidence = 70;
            } else if (suggestions.historical) {
                suggestions.recommended = suggestions.historical;
                suggestions.confidence = 60;
            }
        } catch (error) {
            console.error('Smart suggestions error:', error);
        }

        return suggestions;
    }

    analyzePriceTrend(history, grade) {
        if (!history || history.length < 2) return { direction: 'stable', change: 0 };
        const gradeKey = `grade${grade}`;
        const prices = history.map(h => h.newPrices?.[gradeKey] || 0).filter(p => p > 0);
        if (prices.length < 2) return { direction: 'stable', change: 0 };
        const recent = prices[0];
        const older = prices[prices.length - 1];
        const change = ((recent - older) / older) * 100;
        let direction = 'stable';
        if (change > 5) direction = 'increasing';
        else if (change < -5) direction = 'decreasing';
        return { direction, change: change.toFixed(2) };
    }

    calculateTotal(priceData) {
        return (parseFloat(priceData.gradeA || 0)) + (parseFloat(priceData.gradeB || 0)) +
               (parseFloat(priceData.gradeC || 0)) + (parseFloat(priceData.gradeCAMZ || 0)) +
               (parseFloat(priceData.gradeD || 0)) + (parseFloat(priceData.defective || 0));
    }

    async searchPrices(searchTerm) {
        const all = await this.getAllPrices();
        if (!searchTerm) return all;
        const term = searchTerm.toLowerCase();
        return all.filter(p => p.model.toLowerCase().includes(term) || p.storage.toLowerCase().includes(term));
    }

    async getPricingStats() {
        const allPrices = await this.getAllPrices();
        const stats = {
            totalModels: allPrices.length,
            lastUpdated: null,
            averagePrices: { gradeA: 0, gradeB: 0, gradeC: 0, gradeCAMZ: 0, gradeD: 0, defective: 0 },
            modelsWithPrices: new Set(),
            priceRanges: {
                gradeA: { min: Infinity, max: -Infinity }, gradeB: { min: Infinity, max: -Infinity },
                gradeC: { min: Infinity, max: -Infinity }, gradeCAMZ: { min: Infinity, max: -Infinity },
                gradeD: { min: Infinity, max: -Infinity }, defective: { min: Infinity, max: -Infinity }
            }
        };
        if (allPrices.length === 0) return stats;

        const sums = { A: 0, B: 0, C: 0, CAMZ: 0, D: 0, def: 0 };
        const counts = { A: 0, B: 0, C: 0, CAMZ: 0, D: 0, def: 0 };

        allPrices.forEach(price => {
            stats.modelsWithPrices.add(price.model);
            const grades = [
                ['gradeA', 'A'], ['gradeB', 'B'], ['gradeC', 'C'],
                ['gradeCAMZ', 'CAMZ'], ['gradeD', 'D'], ['defective', 'def']
            ];
            grades.forEach(([field, key]) => {
                if (price[field] > 0) {
                    sums[key] += price[field]; counts[key]++;
                    const range = stats.priceRanges[field];
                    range.min = Math.min(range.min, price[field]);
                    range.max = Math.max(range.max, price[field]);
                }
            });
            if (!stats.lastUpdated || price.lastUpdated > stats.lastUpdated) {
                stats.lastUpdated = price.lastUpdated;
            }
        });

        stats.averagePrices.gradeA = counts.A > 0 ? (sums.A / counts.A).toFixed(2) : 0;
        stats.averagePrices.gradeB = counts.B > 0 ? (sums.B / counts.B).toFixed(2) : 0;
        stats.averagePrices.gradeC = counts.C > 0 ? (sums.C / counts.C).toFixed(2) : 0;
        stats.averagePrices.gradeCAMZ = counts.CAMZ > 0 ? (sums.CAMZ / counts.CAMZ).toFixed(2) : 0;
        stats.averagePrices.gradeD = counts.D > 0 ? (sums.D / counts.D).toFixed(2) : 0;
        stats.averagePrices.defective = counts.def > 0 ? (sums.def / counts.def).toFixed(2) : 0;
        stats.uniqueModels = stats.modelsWithPrices.size;
        return stats;
    }

    async saveBreakdownSheet(sheetData) {
        const sheet = {
            id: Date.now(),
            name: sheetData.name || `Breakdown_${new Date().toISOString()}`,
            columns: sheetData.columns || ['PHONE/MODEL', 'STORAGE', 'A', 'B', 'C', 'C (AMZ)', 'D', 'DEFECTIVE', 'TOTAL'],
            data: sheetData.data,
            createdAt: new Date().toISOString(),
            createdBy: sheetData.userId || 'System',
            filters: sheetData.filters || {}
        };
        try {
            const existing = JSON.parse(localStorage.getItem('breakdownSheets') || '[]');
            existing.unshift(sheet);
            localStorage.setItem('breakdownSheets', JSON.stringify(existing.slice(0, 50)));
        } catch {}
        return sheet;
    }

    async getBreakdownSheets(limit = 20) {
        try {
            const sheets = JSON.parse(localStorage.getItem('breakdownSheets') || '[]');
            return sheets.slice(0, limit);
        } catch { return []; }
    }

    async exportData() {
        const exportPayload = {
            version: 2,
            exportDate: new Date().toISOString(),
            modelPrices: await this.getAllPrices(),
            marketPrices: Array.from(this.marketCache.values())
        };
        try { localStorage.setItem('pricingBackup', JSON.stringify(exportPayload)); } catch {}
        return exportPayload;
    }

    async importData(importPayload) {
        if (importPayload.modelPrices && importPayload.modelPrices.length > 0) {
            for (const price of importPayload.modelPrices) {
                await this.saveModelPrice(price);
            }
        }
        if (importPayload.marketPrices && importPayload.marketPrices.length > 0) {
            importPayload.marketPrices.forEach(m => this.marketCache.set(m.modelId, m));
            try { localStorage.setItem('marketPrices', JSON.stringify(Array.from(this.marketCache.values()))); } catch {}
        }
        console.log('Import completed');
        return true;
    }

    async clearAllData() {
        this.cache.clear();
        this.marketCache.clear();
        try {
            localStorage.removeItem('marketPrices');
            localStorage.removeItem('breakdownSheets');
            localStorage.removeItem('pricingBackup');
        } catch {}
        console.log('All local pricing data cleared');
    }
}

const pricingDB = new PricingDatabase();
window.pricingDB = pricingDB;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = pricingDB;
}
