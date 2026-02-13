/**
 * Pricing Analytics Module
 * Provides comprehensive reporting and analytics for inventory and pricing data
 */

class PricingAnalytics {
    constructor() {
        this.charts = new Map();
        this.reportCache = new Map();
        this.initChartColors();
    }

    /**
     * Initialize chart color palette
     */
    initChartColors() {
        this.colors = {
            primary: '#374151',
            success: '#10b981',
            warning: '#f59e0b',
            danger: '#ef4444',
            info: '#3b82f6',
            gradeA: '#22c55e',
            gradeB: '#eab308',
            gradeC: '#f97316',
            defectives: '#ef4444'
        };
    }

    /**
     * Generate comprehensive pricing report
     */
    async generatePricingReport(dateRange = 30) {
        const report = {
            generatedAt: new Date().toISOString(),
            dateRange: dateRange,
            summary: await this.generateSummaryStats(),
            inventoryAnalysis: await this.analyzeInventory(),
            pricingAnalysis: await this.analyzePricing(),
            profitAnalysis: await this.analyzeProfitMargins(),
            trends: await this.analyzeTrends(dateRange),
            recommendations: await this.generateRecommendations()
        };

        // Cache report
        this.reportCache.set(Date.now(), report);
        
        return report;
    }

    /**
     * Generate summary statistics
     */
    async generateSummaryStats() {
        const inventory = window.inventoryData || [];
        const prices = await pricingDB.getAllPrices();
        
        // Calculate inventory value
        let totalValue = 0;
        let valuedItems = 0;
        
        for (const item of inventory) {
            if (item.MODEL && item.STORAGE) {
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
                    const value = gradeMap[item.GRADE] || 0;
                    if (value > 0) {
                        totalValue += value;
                        valuedItems++;
                    }
                }
            }
        }

        return {
            totalInventoryItems: inventory.length,
            totalInventoryValue: totalValue,
            averageItemValue: valuedItems > 0 ? totalValue / valuedItems : 0,
            itemsWithPricing: valuedItems,
            itemsWithoutPricing: inventory.length - valuedItems,
            uniqueModels: new Set(inventory.map(i => i.MODEL)).size,
            pricingCoverage: ((valuedItems / inventory.length) * 100).toFixed(2) + '%'
        };
    }

    /**
     * Analyze inventory distribution
     */
    async analyzeInventory() {
        const inventory = window.inventoryData || [];
        
        // Group by various categories
        const byGrade = this.groupBy(inventory, 'GRADE');
        const byModel = this.groupBy(inventory, 'MODEL');
        const byStorage = this.groupBy(inventory, 'STORAGE');
        const byStatus = this.groupBy(inventory, 'STATUS');
        const byRoom = this.groupBy(inventory, 'source');
        
        // Calculate grade distribution with values
        const gradeAnalysis = {};
        for (const [grade, items] of Object.entries(byGrade)) {
            let totalValue = 0;
            for (const item of items) {
                if (item.MODEL && item.STORAGE) {
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
                }
            }
            
            gradeAnalysis[grade] = {
                count: items.length,
                percentage: ((items.length / inventory.length) * 100).toFixed(2),
                totalValue: totalValue,
                averageValue: items.length > 0 ? totalValue / items.length : 0
            };
        }

        // Top models by quantity
        const topModels = Object.entries(byModel)
            .map(([model, items]) => ({
                model,
                count: items.length,
                percentage: ((items.length / inventory.length) * 100).toFixed(2)
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        return {
            gradeDistribution: gradeAnalysis,
            topModels,
            storageDistribution: this.calculateDistribution(byStorage, inventory.length),
            statusDistribution: this.calculateDistribution(byStatus, inventory.length),
            roomDistribution: this.calculateDistribution(byRoom, inventory.length),
            inventoryHealth: this.calculateInventoryHealth(gradeAnalysis)
        };
    }

    /**
     * Analyze pricing data
     */
    async analyzePricing() {
        const prices = await pricingDB.getAllPrices();
        const stats = await pricingDB.getPricingStats();
        
        // Calculate price ranges and averages by model type
        const modelPriceRanges = {};
        
        prices.forEach(price => {
            const modelBase = price.model.replace(/\d+/g, '').trim(); // Remove numbers to get base model
            
            if (!modelPriceRanges[modelBase]) {
                modelPriceRanges[modelBase] = {
                    gradeA: { min: Infinity, max: -Infinity, sum: 0, count: 0 },
                    gradeB: { min: Infinity, max: -Infinity, sum: 0, count: 0 },
                    gradeC: { min: Infinity, max: -Infinity, sum: 0, count: 0 },
                    gradeCAMZ: { min: Infinity, max: -Infinity, sum: 0, count: 0 },
                    gradeD: { min: Infinity, max: -Infinity, sum: 0, count: 0 },
                    defective: { min: Infinity, max: -Infinity, sum: 0, count: 0 }
                };
            }
            
            // Update ranges
            ['gradeA', 'gradeB', 'gradeC', 'gradeCAMZ', 'gradeD', 'defective'].forEach(grade => {
                const value = price[grade];
                
                if (value > 0) {
                    modelPriceRanges[modelBase][grade].min = Math.min(modelPriceRanges[modelBase][grade].min, value);
                    modelPriceRanges[modelBase][grade].max = Math.max(modelPriceRanges[modelBase][grade].max, value);
                    modelPriceRanges[modelBase][grade].sum += value;
                    modelPriceRanges[modelBase][grade].count++;
                }
            });
        });
        
        // Calculate averages
        Object.keys(modelPriceRanges).forEach(model => {
            ['gradeA', 'gradeB', 'gradeC', 'gradeCAMZ', 'gradeD', 'defective'].forEach(grade => {
                const range = modelPriceRanges[model][grade];
                range.average = range.count > 0 ? range.sum / range.count : 0;
                if (range.min === Infinity) range.min = 0;
                if (range.max === -Infinity) range.max = 0;
            });
        });

        // Price competitiveness analysis
        const marketComparison = await this.compareWithMarket(prices);

        return {
            totalPricedModels: stats.uniqueModels,
            averagePrices: stats.averagePrices,
            priceRanges: stats.priceRanges,
            modelPriceRanges,
            lastPriceUpdate: stats.lastUpdated,
            marketComparison,
            pricingConsistency: this.calculatePricingConsistency(prices)
        };
    }

    /**
     * Analyze profit margins
     */
    async analyzeProfitMargins() {
        const inventory = window.inventoryData || [];
        const margins = {
            byGrade: {},
            byModel: {},
            overall: {
                totalCost: 0,
                totalRevenue: 0,
                totalMargin: 0,
                marginPercentage: 0
            }
        };

        // Calculate margins by grade
        const grades = ['A', 'B', 'C', 'D'];
        for (const grade of grades) {
            const gradeItems = inventory.filter(item => item.GRADE === grade);
            let totalCost = 0;
            let totalRevenue = 0;
            
            for (const item of gradeItems) {
                if (item.MODEL && item.STORAGE) {
                    const pricing = await pricingDB.getModelPrice(item.MODEL, item.STORAGE);
                    const marketPrice = await pricingDB.getMarketPrice(item.MODEL, item.STORAGE);
                    
                    if (pricing && marketPrice) {
                        const gradeMap = {
                            'A': 'gradeA',
                            'B': 'gradeB',
                            'C': 'gradeC',
                            'C (AMZ)': 'gradeCAMZ',
                            'D': 'gradeD',
                            'Defective': 'defective'
                        };
                        
                        const sellPrice = pricing[gradeMap[grade]] || 0;
                        const costPrice = marketPrice.wholesalePrice || 0;
                        
                        totalRevenue += sellPrice;
                        totalCost += costPrice;
                    }
                }
            }
            
            margins.byGrade[grade] = {
                items: gradeItems.length,
                totalCost,
                totalRevenue,
                margin: totalRevenue - totalCost,
                marginPercentage: totalCost > 0 ? ((totalRevenue - totalCost) / totalCost * 100).toFixed(2) : 0
            };
            
            margins.overall.totalCost += totalCost;
            margins.overall.totalRevenue += totalRevenue;
        }
        
        margins.overall.totalMargin = margins.overall.totalRevenue - margins.overall.totalCost;
        margins.overall.marginPercentage = margins.overall.totalCost > 0 ? 
            ((margins.overall.totalMargin / margins.overall.totalCost) * 100).toFixed(2) : 0;

        return margins;
    }

    /**
     * Analyze trends over time
     */
    async analyzeTrends(days = 30) {
        const history = await this.getHistoricalData(days);
        
        const trends = {
            priceChanges: [],
            inventoryMovement: [],
            demandPatterns: [],
            seasonality: []
        };

        // Analyze price changes
        const priceHistory = await this.getPriceHistoryTrends(days);
        trends.priceChanges = priceHistory;

        // Analyze inventory movement
        const updateHistory = inventoryUpdater.getUpdateHistory(50);
        trends.inventoryMovement = this.analyzeInventoryMovement(updateHistory);

        // Identify high-demand items
        trends.demandPatterns = this.identifyDemandPatterns(history);

        return trends;
    }

    /**
     * Generate recommendations based on analysis
     */
    async generateRecommendations() {
        const recommendations = [];
        const summary = await this.generateSummaryStats();
        const inventory = await this.analyzeInventory();
        const pricing = await this.analyzePricing();
        
        // Pricing coverage recommendations
        if (parseFloat(summary.pricingCoverage) < 80) {
            recommendations.push({
                type: 'warning',
                category: 'pricing',
                title: 'Low Pricing Coverage',
                description: `Only ${summary.pricingCoverage} of inventory items have pricing. Consider setting prices for remaining items.`,
                priority: 'high',
                action: 'Set prices for unpriced models'
            });
        }

        // Grade distribution recommendations
        const gradeAPercentage = parseFloat(inventory.gradeDistribution['A']?.percentage || 0);
        const gradeCPercentage = parseFloat(inventory.gradeDistribution['C']?.percentage || 0);
        
        if (gradeAPercentage < 30) {
            recommendations.push({
                type: 'info',
                category: 'inventory',
                title: 'Low Grade A Inventory',
                description: `Grade A items represent only ${gradeAPercentage}% of inventory. Consider sourcing more premium items.`,
                priority: 'medium',
                action: 'Increase Grade A inventory procurement'
            });
        }
        
        if (gradeCPercentage > 40) {
            recommendations.push({
                type: 'warning',
                category: 'inventory',
                title: 'High Grade C Inventory',
                description: `Grade C items represent ${gradeCPercentage}% of inventory. Consider promotional strategies to move lower-grade inventory.`,
                priority: 'medium',
                action: 'Create promotions for Grade C items'
            });
        }

        // Price optimization recommendations
        if (pricing.marketComparison) {
            const overpriced = pricing.marketComparison.filter(item => item.difference > 20);
            const underpriced = pricing.marketComparison.filter(item => item.difference < -20);
            
            if (overpriced.length > 0) {
                recommendations.push({
                    type: 'warning',
                    category: 'pricing',
                    title: 'Overpriced Items Detected',
                    description: `${overpriced.length} items are priced >20% above market rates.`,
                    priority: 'high',
                    action: 'Review and adjust overpriced items',
                    items: overpriced.slice(0, 5)
                });
            }
            
            if (underpriced.length > 0) {
                recommendations.push({
                    type: 'opportunity',
                    category: 'pricing',
                    title: 'Potential Revenue Opportunity',
                    description: `${underpriced.length} items are priced >20% below market rates.`,
                    priority: 'medium',
                    action: 'Consider increasing prices for underpriced items',
                    items: underpriced.slice(0, 5)
                });
            }
        }

        // Inventory age recommendations (if data available)
        const oldInventory = this.identifyAgedInventory(window.inventoryData);
        if (oldInventory.length > 0) {
            recommendations.push({
                type: 'warning',
                category: 'inventory',
                title: 'Aged Inventory Alert',
                description: `${oldInventory.length} items have been in inventory >90 days.`,
                priority: 'high',
                action: 'Consider discounting or bundling aged inventory',
                items: oldInventory.slice(0, 10)
            });
        }

        return recommendations;
    }

    /**
     * Generate visual charts (returns chart data for visualization libraries)
     */
    generateChartData() {
        const charts = {};

        // Grade distribution pie chart
        charts.gradeDistribution = {
            type: 'pie',
            data: {
                labels: ['Grade A', 'Grade B', 'Grade C', 'Defectives'],
                datasets: [{
                    data: [], // Will be populated with actual data
                    backgroundColor: [
                        this.colors.gradeA,
                        this.colors.gradeB,
                        this.colors.gradeC,
                        this.colors.defectives
                    ]
                }]
            }
        };

        // Inventory value bar chart
        charts.inventoryValue = {
            type: 'bar',
            data: {
                labels: [], // Model names
                datasets: [{
                    label: 'Inventory Value',
                    data: [], // Values
                    backgroundColor: this.colors.primary
                }]
            }
        };

        // Price trends line chart
        charts.priceTrends = {
            type: 'line',
            data: {
                labels: [], // Dates
                datasets: [
                    {
                        label: 'Grade A',
                        data: [],
                        borderColor: this.colors.gradeA,
                        fill: false
                    },
                    {
                        label: 'Grade B',
                        data: [],
                        borderColor: this.colors.gradeB,
                        fill: false
                    },
                    {
                        label: 'Grade C',
                        data: [],
                        borderColor: this.colors.gradeC,
                        fill: false
                    }
                ]
            }
        };

        return charts;
    }

    /**
     * Export analytics report
     */
    async exportAnalyticsReport(format = 'pdf') {
        const report = await this.generatePricingReport();
        
        switch(format) {
            case 'json':
                this.downloadJSON(report);
                break;
            case 'csv':
                this.exportReportAsCSV(report);
                break;
            case 'pdf':
                // Would require a PDF library
                console.log('PDF export would require a library like jsPDF');
                this.downloadJSON(report); // Fallback to JSON
                break;
            default:
                this.downloadJSON(report);
        }
    }

    /**
     * Helper functions
     */
    
    groupBy(array, key) {
        return array.reduce((result, item) => {
            const group = item[key] || 'Unknown';
            if (!result[group]) result[group] = [];
            result[group].push(item);
            return result;
        }, {});
    }

    calculateDistribution(grouped, total) {
        const distribution = {};
        for (const [key, items] of Object.entries(grouped)) {
            distribution[key] = {
                count: items.length,
                percentage: ((items.length / total) * 100).toFixed(2)
            };
        }
        return distribution;
    }

    calculateInventoryHealth(gradeAnalysis) {
        // Calculate health score based on grade distribution
        let score = 0;
        const weights = { 'A': 1, 'B': 0.8, 'C': 0.6, 'D': 0.3 };
        
        for (const [grade, data] of Object.entries(gradeAnalysis)) {
            const weight = weights[grade] || 0.5;
            score += parseFloat(data.percentage) * weight;
        }
        
        return {
            score: (score / 100).toFixed(2),
            status: score > 80 ? 'Excellent' : score > 60 ? 'Good' : score > 40 ? 'Fair' : 'Poor'
        };
    }

    calculatePricingConsistency(prices) {
        // Check for consistency in pricing across similar models
        const modelGroups = {};
        
        prices.forEach(price => {
            const baseModel = price.model.replace(/\d+/g, '').trim();
            if (!modelGroups[baseModel]) modelGroups[baseModel] = [];
            modelGroups[baseModel].push(price);
        });
        
        let consistencyScore = 100;
        
        for (const [model, group] of Object.entries(modelGroups)) {
            if (group.length > 1) {
                // Calculate variance in pricing
                const gradeAValues = group.map(p => p.gradeA).filter(v => v > 0);
                if (gradeAValues.length > 1) {
                    const avg = gradeAValues.reduce((a, b) => a + b, 0) / gradeAValues.length;
                    const variance = gradeAValues.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / gradeAValues.length;
                    const stdDev = Math.sqrt(variance);
                    const cv = (stdDev / avg) * 100; // Coefficient of variation
                    
                    if (cv > 30) consistencyScore -= 10; // High variation penalty
                }
            }
        }
        
        return {
            score: Math.max(0, consistencyScore),
            status: consistencyScore > 80 ? 'Consistent' : consistencyScore > 60 ? 'Moderate' : 'Inconsistent'
        };
    }

    async compareWithMarket(prices) {
        const comparison = [];
        
        for (const price of prices) {
            const marketPrice = await pricingDB.getMarketPrice(price.model, price.storage);
            if (marketPrice && marketPrice.retailPrice > 0) {
                const difference = ((price.gradeA - marketPrice.retailPrice) / marketPrice.retailPrice) * 100;
                comparison.push({
                    model: price.model,
                    storage: price.storage,
                    ourPrice: price.gradeA,
                    marketPrice: marketPrice.retailPrice,
                    difference: difference.toFixed(2),
                    status: Math.abs(difference) < 10 ? 'competitive' : difference > 0 ? 'above-market' : 'below-market'
                });
            }
        }
        
        return comparison;
    }

    analyzeInventoryMovement(updateHistory) {
        const movement = {
            totalUpdates: updateHistory.length,
            updateFrequency: 'daily', // Could be calculated based on timestamps
            recentActivity: []
        };
        
        updateHistory.slice(0, 10).forEach(update => {
            movement.recentActivity.push({
                date: update.timestamp,
                type: update.strategy,
                itemsAffected: update.itemsProcessed,
                result: update.result
            });
        });
        
        return movement;
    }

    identifyDemandPatterns(history) {
        // Identify which models are moving fastest
        const modelMovement = {};
        
        // This would analyze sales/movement data
        // For now, return a placeholder
        return {
            fastMoving: [],
            slowMoving: [],
            seasonal: []
        };
    }

    identifyAgedInventory(inventory) {
        const aged = [];
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        
        inventory.forEach(item => {
            if (item.lastUpdated) {
                const itemDate = new Date(item.lastUpdated);
                if (itemDate < ninetyDaysAgo) {
                    aged.push({
                        imei: item['IMEI/ SERIAL NO.'],
                        model: item.MODEL,
                        grade: item.GRADE,
                        daysInInventory: Math.floor((new Date() - itemDate) / (1000 * 60 * 60 * 24))
                    });
                }
            }
        });
        
        return aged.sort((a, b) => b.daysInInventory - a.daysInInventory);
    }

    async getHistoricalData(days) {
        // Would fetch historical data from database
        // For now, return current data as placeholder
        return window.inventoryData || [];
    }

    async getPriceHistoryTrends(days) {
        const trends = [];
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        // Would fetch actual price history
        // For now, return sample trend data
        return trends;
    }

    downloadJSON(data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `analytics_report_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
    }

    exportReportAsCSV(report) {
        // Convert report to CSV format
        let csv = 'Analytics Report\\n';
        csv += `Generated: ${report.generatedAt}\\n\\n`;
        
        // Summary section
        csv += 'SUMMARY\\n';
        csv += 'Metric,Value\\n';
        Object.entries(report.summary).forEach(([key, value]) => {
            csv += `${key},${value}\\n`;
        });
        
        // Recommendations section
        csv += '\\nRECOMMENDATIONS\\n';
        csv += 'Priority,Category,Title,Description\\n';
        report.recommendations.forEach(rec => {
            csv += `${rec.priority},${rec.category},"${rec.title}","${rec.description}"\\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `analytics_report_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    }
}

// Create and export singleton instance
const pricingAnalytics = new PricingAnalytics();

// Make it globally available
window.pricingAnalytics = pricingAnalytics;

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = pricingAnalytics;
}
