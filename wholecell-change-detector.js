/**
 * Wholecell Change Detector
 * ==========================
 * Detects changes between data syncs and highlights new/modified items
 */

class WholecellChangeDetector {
    constructor() {
        this.previousData = null;
        this.changes = {
            new: [],
            modified: [],
            removed: [],
            statusChanged: []
        };
        this.lastComparisonTime = null;
    }

    /**
     * Compare current data with previous data
     * 
     * @param {Array} currentData - Current inventory data
     * @returns {Object} Changes detected
     */
    detectChanges(currentData) {
        if (!this.previousData || this.previousData.length === 0) {
            // First load, no changes to detect
            this.previousData = this.cloneData(currentData);
            return { hasChanges: false, changes: this.changes };
        }

        this.resetChanges();

        // Create maps for faster lookup
        const previousMap = new Map();
        this.previousData.forEach(item => {
            const imei = item['IMEI/ SERIAL NO.'];
            if (imei) {
                previousMap.set(imei, item);
            }
        });

        const currentMap = new Map();
        currentData.forEach(item => {
            const imei = item['IMEI/ SERIAL NO.'];
            if (imei) {
                currentMap.set(imei, item);
            }
        });

        // Detect new items
        currentData.forEach(item => {
            const imei = item['IMEI/ SERIAL NO.'];
            if (!previousMap.has(imei)) {
                this.changes.new.push({
                    imei: imei,
                    item: item,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Detect removed items
        this.previousData.forEach(item => {
            const imei = item['IMEI/ SERIAL NO.'];
            if (!currentMap.has(imei)) {
                this.changes.removed.push({
                    imei: imei,
                    item: item,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Detect modified items
        currentData.forEach(item => {
            const imei = item['IMEI/ SERIAL NO.'];
            const previousItem = previousMap.get(imei);
            
            if (previousItem) {
                const modifications = this.compareItems(previousItem, item);
                
                if (modifications.length > 0) {
                    this.changes.modified.push({
                        imei: imei,
                        item: item,
                        modifications: modifications,
                        timestamp: new Date().toISOString()
                    });

                    // Special tracking for status changes
                    const statusMod = modifications.find(m => m.field === 'STATUS');
                    if (statusMod) {
                        this.changes.statusChanged.push({
                            imei: imei,
                            oldStatus: statusMod.oldValue,
                            newStatus: statusMod.newValue,
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            }
        });

        // Update previous data
        this.previousData = this.cloneData(currentData);
        this.lastComparisonTime = new Date().toISOString();

        const hasChanges = this.changes.new.length > 0 || 
                          this.changes.modified.length > 0 || 
                          this.changes.removed.length > 0;

        return {
            hasChanges: hasChanges,
            changes: this.getChanges(),
            summary: this.getChangeSummary()
        };
    }

    /**
     * Compare two items to find differences
     */
    compareItems(oldItem, newItem) {
        const modifications = [];
        const fieldsToCheck = [
            'STATUS',
            'GRADE',
            'location',
            'warehouse',
            'BATTERY HEALTH',
            'cost',
            'sale_price',
            'lastUpdated'
        ];

        fieldsToCheck.forEach(field => {
            const oldValue = oldItem[field];
            const newValue = newItem[field];

            if (oldValue !== newValue) {
                modifications.push({
                    field: field,
                    oldValue: oldValue,
                    newValue: newValue
                });
            }
        });

        return modifications;
    }

    /**
     * Get change summary
     */
    getChangeSummary() {
        return {
            newItems: this.changes.new.length,
            modifiedItems: this.changes.modified.length,
            removedItems: this.changes.removed.length,
            statusChanges: this.changes.statusChanged.length,
            totalChanges: this.changes.new.length + 
                         this.changes.modified.length + 
                         this.changes.removed.length
        };
    }

    /**
     * Get all changes
     */
    getChanges() {
        return {
            new: [...this.changes.new],
            modified: [...this.changes.modified],
            removed: [...this.changes.removed],
            statusChanged: [...this.changes.statusChanged]
        };
    }

    /**
     * Reset changes
     */
    resetChanges() {
        this.changes = {
            new: [],
            modified: [],
            removed: [],
            statusChanged: []
        };
    }

    /**
     * Clone data (deep copy)
     */
    cloneData(data) {
        return JSON.parse(JSON.stringify(data));
    }

    /**
     * Check if an item has changed since last sync
     */
    hasItemChanged(imei) {
        return this.changes.modified.some(change => change.imei === imei) ||
               this.changes.new.some(change => change.imei === imei);
    }

    /**
     * Get changes for a specific item
     */
    getItemChanges(imei) {
        const newChange = this.changes.new.find(c => c.imei === imei);
        if (newChange) {
            return { type: 'new', change: newChange };
        }

        const modifiedChange = this.changes.modified.find(c => c.imei === imei);
        if (modifiedChange) {
            return { type: 'modified', change: modifiedChange };
        }

        const removedChange = this.changes.removed.find(c => c.imei === imei);
        if (removedChange) {
            return { type: 'removed', change: removedChange };
        }

        return null;
    }

    /**
     * Generate change notification message
     */
    generateChangeNotification() {
        const summary = this.getChangeSummary();
        
        if (summary.totalChanges === 0) {
            return 'No changes detected';
        }

        const parts = [];
        
        if (summary.newItems > 0) {
            parts.push(`${summary.newItems} new item${summary.newItems > 1 ? 's' : ''}`);
        }
        
        if (summary.modifiedItems > 0) {
            parts.push(`${summary.modifiedItems} modified`);
        }
        
        if (summary.removedItems > 0) {
            parts.push(`${summary.removedItems} removed`);
        }

        return parts.join(', ');
    }

    /**
     * Get change report for display
     */
    getChangeReport() {
        const summary = this.getChangeSummary();
        
        if (summary.totalChanges === 0) {
            return null;
        }

        return {
            timestamp: this.lastComparisonTime,
            summary: summary,
            message: this.generateChangeNotification(),
            details: {
                new: this.changes.new.slice(0, 10), // First 10
                modified: this.changes.modified.slice(0, 10),
                removed: this.changes.removed.slice(0, 10),
                statusChanged: this.changes.statusChanged.slice(0, 10)
            }
        };
    }

    /**
     * Export changes to JSON
     */
    exportChanges() {
        const data = {
            timestamp: this.lastComparisonTime,
            summary: this.getChangeSummary(),
            changes: this.getChanges()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `wholecell_changes_${new Date().toISOString()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }

    /**
     * Clear all change history
     */
    clearHistory() {
        this.previousData = null;
        this.resetChanges();
        this.lastComparisonTime = null;
    }
}

// Initialize globally
window.wholecellChangeDetector = new WholecellChangeDetector();

// Integrate with sync manager
if (window.wholecellSync) {
    window.wholecellSync.onSync((status, error) => {
        if (status === 'success' && window.inventoryData) {
            const result = window.wholecellChangeDetector.detectChanges(window.inventoryData);
            
            if (result.hasChanges) {
                console.log('🔄 Changes detected:', result.summary);
                
                // Show notification
                const message = window.wholecellChangeDetector.generateChangeNotification();
                if (typeof showNotification === 'function') {
                    showNotification(`Sync complete: ${message}`);
                }

                // Trigger custom event for UI updates
                const event = new CustomEvent('wholecellChangesDetected', {
                    detail: result
                });
                document.dispatchEvent(event);
            } else {
                console.log('✅ No changes since last sync');
            }
        }
    });
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WholecellChangeDetector;
}

