/**
 * Wholecell Sync Manager
 * =======================
 * Manages automatic syncing and manual refresh of Wholecell data
 */

class WholecellSyncManager {
    constructor() {
        this.api = new WholecellAPI();
        this.isAutoRefreshEnabled = true;
        this.refreshInterval = 15 * 60 * 1000; // 15 minutes
        this.refreshTimer = null;
        this.lastSyncTime = null;
        this.isSyncing = false;
        this.syncListeners = [];
    }

    /**
     * Initialize sync manager
     */
    init() {
        // Load last sync time from localStorage
        const stored = localStorage.getItem('wholecell_last_sync');
        if (stored) {
            this.lastSyncTime = new Date(stored);
        }

        // Start auto-refresh if enabled
        if (this.isAutoRefreshEnabled) {
            this.startAutoRefresh();
        }

        // Listen for tab visibility to pause/resume refresh
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopAutoRefresh();
            } else if (this.isAutoRefreshEnabled) {
                this.startAutoRefresh();
            }
        });

        console.log('Wholecell Sync Manager initialized');
    }

    /**
     * Manually trigger a sync
     */
    async manualSync() {
        if (this.isSyncing) {
            console.log('Sync already in progress');
            return false;
        }

        try {
            this.isSyncing = true;
            this.updateSyncStatus('syncing');
            
            console.log('Manual sync started...');
            
            // Clear cache to force fresh fetch
            this.api.clearCache();
            
            // Reload inventory data
            if (typeof loadFromWholecell === 'function') {
                await loadFromWholecell();
            } else {
                console.warn('loadFromWholecell function not found');
            }
            
            this.lastSyncTime = new Date();
            localStorage.setItem('wholecell_last_sync', this.lastSyncTime.toISOString());
            
            this.updateSyncStatus('success');
            this.notifyListeners('success');
            
            console.log('✅ Manual sync completed');
            return true;
            
        } catch (error) {
            console.error('Sync failed:', error);
            this.updateSyncStatus('error', error.message);
            this.notifyListeners('error', error);
            return false;
            
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Start auto-refresh timer
     */
    startAutoRefresh() {
        if (this.refreshTimer) {
            return; // Already running
        }

        console.log(`Auto-refresh enabled (every ${this.refreshInterval / 60000} minutes)`);
        
        this.refreshTimer = setInterval(() => {
            console.log('Auto-refresh triggered');
            this.manualSync();
        }, this.refreshInterval);
    }

    /**
     * Stop auto-refresh timer
     */
    stopAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
            console.log('Auto-refresh stopped');
        }
    }

    /**
     * Set refresh interval
     */
    setRefreshInterval(minutes) {
        this.refreshInterval = minutes * 60 * 1000;
        
        if (this.refreshTimer) {
            this.stopAutoRefresh();
            this.startAutoRefresh();
        }
        
        console.log(`Refresh interval set to ${minutes} minutes`);
    }

    /**
     * Enable/disable auto-refresh
     */
    setAutoRefresh(enabled) {
        this.isAutoRefreshEnabled = enabled;
        
        if (enabled) {
            this.startAutoRefresh();
        } else {
            this.stopAutoRefresh();
        }
        
        console.log(`Auto-refresh ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Get time since last sync
     */
    getTimeSinceLastSync() {
        if (!this.lastSyncTime) {
            return null;
        }
        
        const now = new Date();
        const diff = now - this.lastSyncTime;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days} day${days > 1 ? 's' : ''} ago`;
        } else if (hours > 0) {
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else if (minutes > 0) {
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        } else {
            return 'Just now';
        }
    }

    /**
     * Update sync status indicator in UI
     */
    updateSyncStatus(status, message = '') {
        const statusEl = document.getElementById('wholecellSyncStatus');
        if (!statusEl) return;

        const statusConfig = {
            syncing: {
                color: 'bg-yellow-500',
                icon: '🔄',
                text: 'Syncing...',
                tooltip: 'Fetching latest data from Wholecell'
            },
            success: {
                color: 'bg-green-500',
                icon: '✓',
                text: 'Synced',
                tooltip: `Last synced: ${this.getTimeSinceLastSync()}`
            },
            error: {
                color: 'bg-red-500',
                icon: '⚠',
                text: 'Error',
                tooltip: message || 'Sync failed'
            },
            offline: {
                color: 'bg-gray-500',
                icon: '○',
                text: 'Offline',
                tooltip: 'Wholecell proxy not reachable'
            }
        };

        const config = statusConfig[status] || statusConfig.offline;
        
        statusEl.innerHTML = `
            <div class="flex items-center gap-2" title="${config.tooltip}">
                <span class="inline-block w-2 h-2 rounded-full ${config.color} animate-pulse"></span>
                <span class="text-sm text-gray-700">${config.text}</span>
            </div>
        `;
    }

    /**
     * Update last sync timestamp display
     */
    updateLastSyncDisplay() {
        const timeEl = document.getElementById('wholecellLastSync');
        if (!timeEl) return;

        const timeSince = this.getTimeSinceLastSync();
        if (timeSince) {
            timeEl.textContent = `Last synced: ${timeSince}`;
        } else {
            timeEl.textContent = 'Not synced yet';
        }
    }

    /**
     * Start updating the last sync display
     */
    startDisplayUpdates() {
        // Update every minute
        setInterval(() => {
            this.updateLastSyncDisplay();
        }, 60000);
        
        // Initial update
        this.updateLastSyncDisplay();
    }

    /**
     * Add sync event listener
     */
    onSync(callback) {
        this.syncListeners.push(callback);
    }

    /**
     * Notify listeners of sync events
     */
    notifyListeners(status, error = null) {
        this.syncListeners.forEach(callback => {
            try {
                callback(status, error);
            } catch (err) {
                console.error('Error in sync listener:', err);
            }
        });
    }

    /**
     * Get sync stats
     */
    getSyncStats() {
        const cacheInfo = this.api.getCacheInfo();
        
        return {
            lastSyncTime: this.lastSyncTime,
            timeSinceLastSync: this.getTimeSinceLastSync(),
            isSyncing: this.isSyncing,
            autoRefreshEnabled: this.isAutoRefreshEnabled,
            refreshInterval: this.refreshInterval / 60000, // in minutes
            cacheInfo: cacheInfo
        };
    }
}

// Initialize sync manager globally
window.wholecellSync = new WholecellSyncManager();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.wholecellSync.init();
        window.wholecellSync.startDisplayUpdates();
    });
} else {
    window.wholecellSync.init();
    window.wholecellSync.startDisplayUpdates();
}

// Expose manual sync function globally
window.refreshWholecellData = function() {
    return window.wholecellSync.manualSync();
};

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WholecellSyncManager;
}

