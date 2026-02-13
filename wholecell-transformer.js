/**
 * Wholecell Data Transformer
 * ============================
 * Transforms Wholecell API response format to our application's data structure.
 * Based on Phase 1 test results showing actual Wholecell response format.
 */

class WholecellTransformer {
    /**
     * Transform a single Wholecell item to our format
     * 
     * Wholecell structure (from Phase 1 tests):
     * {
     *   esn: "352439780829507",
     *   status: "Available",
     *   product_variation: {
     *     product: {
     *       manufacturer: "SAMSUNG",
     *       model: "GALAXY TAB ACTIVE 5 (X308U)",
     *       capacity: "128GB",
     *       color: "GREEN"
     *     },
     *     grade: "B"
     *   },
     *   custom_field_values: {
     *     "Battery Health": "GOOD"
     *   },
     *   location: { name: "Processing" },
     *   warehouse: { name: "Main Warehouse" },
     *   updated_at: "2025-11-13T11:42:47.674-05:00",
     *   total_price_paid: 9500
     * }
     * 
     * @param {Object} wholecellItem - Raw item from Wholecell API
     * @returns {Object} Transformed item in our format
     */
    static transformItem(wholecellItem) {
        if (!wholecellItem) {
            return null;
        }

        // Extract product info
        const product = wholecellItem.product_variation?.product || {};
        const productVariation = wholecellItem.product_variation || {};
        const customFields = wholecellItem.custom_field_values || {};

        // Build model string (excluding manufacturer as per VBA code)
        const model = this.buildModelString(
            product.manufacturer,
            product.model,
            product.capacity,
            product.color
        );

        // Map status
        const status = this.mapStatus(wholecellItem.status);

        // Generate batch identifier
        const batch = this.generateBatchIdentifier(wholecellItem.created_at);

        // Transform to our format
        return {
            // Core fields
            'IMEI/ SERIAL NO.': String(wholecellItem.esn || ''),
            'MODEL': model,
            'STORAGE': product.capacity || '',
            'COLOR': product.color || '',
            'GRADE': productVariation.grade || '',
            'STATUS': status,
            'BATCH': batch,
            
            // === NEW: Network/Carrier Information (CRITICAL for pricing) ===
            'NETWORK': product.network || 'Unknown',
            'IS_UNLOCKED': product.network === 'UNLOCKED',
            
            // === NEW: Purchase & Order Tracking ===
            'PURCHASE_ORDER_ID': wholecellItem.purchase_order_id || null,
            'ORDER_ID': wholecellItem.order_id || null,
            'HEX_ID': wholecellItem.hex_id || null,
            
            // === NEW: Product Details ===
            'VARIANT': product.variant || null,
            'SKU': productVariation.sku || null,
            'CONDITIONS': productVariation.conditions || [],
            
            // Additional fields
            'BATTERY HEALTH': customFields['Battery Health'] || null,
            'DESCRIPTION': `${product.capacity || ''}-${product.color || ''}`.replace(/^-|-$/g, ''),
            'MODEL w/STORAGE': `${product.model || ''} ${product.capacity || ''}`.trim(),
            'REMARKS': null,
            
            // === NEW: Promoted Custom Fields (if they exist) ===
            'BATTERY_PERCENTAGE': customFields['Battery Percentage'] || null,
            'SCREEN_CONDITION': customFields['Screen Condition'] || null,
            'IMEI_STATUS': customFields['IMEI Check Status'] || null,
            'CARRIER_STATUS': customFields['Carrier Status'] || null,
            'ICLOUD_STATUS': customFields['iCloud Status'] || null,
            'FRP_STATUS': customFields['Google Lock Status'] || customFields['FRP Status'] || null,
            'FUNCTIONAL_TEST': customFields['Functional Test'] || null,
            'POWER_ON_TEST': customFields['Power On Test'] || null,
            
            // === NEW: Store ALL Custom Fields Dynamically ===
            'CUSTOM_FIELDS': customFields,
            
            // Wholecell-specific fields (bonus data!)
            'location': wholecellItem.location?.name || null,
            'location_id': wholecellItem.location?.id || null,
            'warehouse': wholecellItem.warehouse?.name || null,
            'warehouse_id': wholecellItem.warehouse?.id || null,
            'wholecell_id': wholecellItem.id,
            'wholecell_hex_id': wholecellItem.hex_id,
            'manufacturer': product.manufacturer || '',
            
            // Timestamps
            'created_at': wholecellItem.created_at,
            'lastUpdated': wholecellItem.updated_at || new Date().toISOString(),
            
            // Pricing
            'cost': wholecellItem.total_price_paid ? (wholecellItem.total_price_paid / 100) : null,
            'initial_cost': wholecellItem.initial_price_paid ? (wholecellItem.initial_price_paid / 100) : null,
            'sale_price': wholecellItem.sale_price ? (wholecellItem.sale_price / 100) : null,
            
            // Metadata
            'source': 'WHOLECELL',
            'updateHistory': []
        };
    }

    /**
     * Build model string from product components
     * Based on VBA code: model + capacity + color (excluding manufacturer)
     */
    static buildModelString(manufacturer, model, capacity, color) {
        const parts = [];
        
        // Add model (but not manufacturer, as per VBA code)
        if (model) {
            parts.push(model.trim());
        }
        
        // Note: VBA code shows capacity and color are already in model sometimes
        // So we just use the model as-is
        
        return parts.join(' ') || 'Unknown Model';
    }

    /**
     * Map Wholecell status to our status format
     * 
     * Wholecell statuses observed in Phase 1:
     * - "Available" → "AVAILABLE"
     * - "Sold" → "SOLD"
     * - Others possible: "Processing", "Locked", etc.
     */
    static mapStatus(wholecellStatus) {
        if (!wholecellStatus) {
            return 'AVAILABLE'; // Default
        }

        const statusMap = {
            'Available': 'AVAILABLE',
            'Sold': 'SOLD',
            'Processing': 'PROCESSING',
            'Locked': 'LOCKED',
            'Reserved': 'RESERVED',
            'In Transit': 'IN_TRANSIT',
            'Damaged': 'DAMAGED',
            'Returned': 'RETURNED'
        };

        return statusMap[wholecellStatus] || wholecellStatus.toUpperCase();
    }

    /**
     * Generate batch identifier from creation date
     */
    static generateBatchIdentifier(createdAt) {
        if (!createdAt) {
            return `WHOLECELL_SYNC_${new Date().toISOString().split('T')[0]}`;
        }

        try {
            const date = new Date(createdAt);
            const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
            return `WHOLECELL_${dateStr}`;
        } catch (error) {
            return `WHOLECELL_SYNC_${new Date().toISOString().split('T')[0]}`;
        }
    }

    /**
     * Transform an array of Wholecell items
     * 
     * @param {Array} wholecellItems - Array of raw items
     * @returns {Array} Array of transformed items
     */
    static transformAll(wholecellItems) {
        if (!Array.isArray(wholecellItems)) {
            console.error('transformAll expects an array');
            return [];
        }

        return wholecellItems
            .map(item => this.transformItem(item))
            .filter(item => item !== null); // Remove any failed transformations
    }

    /**
     * Validate transformed data has required fields
     * 
     * @param {Object} item - Transformed item
     * @returns {boolean} True if valid
     */
    static validateItem(item) {
        const requiredFields = [
            'IMEI/ SERIAL NO.',
            'MODEL',
            'STORAGE',
            'GRADE',
            'STATUS'
        ];

        return requiredFields.every(field => {
            const value = item[field];
            return value !== undefined && value !== null && value !== '';
        });
    }

    /**
     * Get statistics about transformation
     * 
     * @param {Array} originalData - Original Wholecell data
     * @param {Array} transformedData - Transformed data
     * @returns {Object} Statistics
     */
    static getTransformStats(originalData, transformedData) {
        const totalOriginal = originalData.length;
        const totalTransformed = transformedData.length;
        const valid = transformedData.filter(item => this.validateItem(item)).length;
        const invalid = totalTransformed - valid;

        return {
            totalOriginal,
            totalTransformed,
            valid,
            invalid,
            successRate: totalOriginal > 0 ? (valid / totalOriginal * 100).toFixed(2) : 0
        };
    }

    /**
     * Extract unique values for a field (useful for filters)
     * 
     * @param {Array} transformedData - Transformed data
     * @param {string} field - Field name
     * @returns {Array} Unique values
     */
    static getUniqueValues(transformedData, field) {
        const values = transformedData
            .map(item => item[field])
            .filter(value => value !== null && value !== undefined && value !== '');
        
        return [...new Set(values)].sort();
    }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WholecellTransformer;
}

// Make available globally
window.WholecellTransformer = WholecellTransformer;

