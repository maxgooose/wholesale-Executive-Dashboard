/**
 * Wholecell UI Enhancements
 * ==========================
 * Enhanced UI features for Wholecell integration
 */

class WholecellUIEnhancements {
    constructor() {
        this.highlightDuration = 5000; // 5 seconds
        this.init();
    }

    /**
     * Initialize UI enhancements
     */
    init() {
        this.setupChangeHighlighting();
        this.setupSyncNotifications();
        this.setupChangeReportModal();
        
        console.log('Wholecell UI Enhancements initialized');
    }

    /**
     * Setup change highlighting in data table
     */
    setupChangeHighlighting() {
        document.addEventListener('wholecellChangesDetected', (event) => {
            const { changes, summary } = event.detail;
            
            console.log(`Highlighting ${summary.totalChanges} changes`);
            
            // Highlight new items
            changes.new.forEach(change => {
                this.highlightItem(change.imei, 'new');
            });

            // Highlight modified items
            changes.modified.forEach(change => {
                this.highlightItem(change.imei, 'modified');
            });
        });
    }

    /**
     * Highlight a specific item in the UI
     */
    highlightItem(imei, changeType) {
        // This would highlight the item in the data table
        // Implementation depends on your table structure
        
        const colors = {
            'new': 'bg-green-100 border-green-500',
            'modified': 'bg-blue-100 border-blue-500',
            'removed': 'bg-red-100 border-red-500'
        };

        // Find item in DOM (if visible)
        const itemElements = document.querySelectorAll(`[data-imei="${imei}"]`);
        itemElements.forEach(element => {
            // Add highlight class
            const highlightClass = colors[changeType] || colors['modified'];
            element.classList.add(...highlightClass.split(' '));

            // Remove highlight after duration
            setTimeout(() => {
                element.classList.remove(...highlightClass.split(' '));
            }, this.highlightDuration);
        });
    }

    /**
     * Setup sync notifications
     */
    setupSyncNotifications() {
        // Listen for sync events
        if (window.wholecellSync) {
            window.wholecellSync.onSync((status, error) => {
                if (status === 'success') {
                    this.showSyncSuccessNotification();
                } else if (status === 'error') {
                    this.showSyncErrorNotification(error);
                }
            });
        }
    }

    /**
     * Show sync success notification
     */
    showSyncSuccessNotification() {
        const changeReport = window.wholecellChangeDetector?.getChangeReport();
        
        if (changeReport) {
            this.showFloatingNotification(
                `✅ Synced: ${changeReport.message}`,
                'success'
            );
        } else {
            this.showFloatingNotification(
                '✅ Synced: No changes',
                'success'
            );
        }
    }

    /**
     * Show sync error notification
     */
    showSyncErrorNotification(error) {
        this.showFloatingNotification(
            `❌ Sync failed: ${error?.message || 'Unknown error'}`,
            'error'
        );
    }

    /**
     * Show floating notification
     */
    showFloatingNotification(message, type = 'info') {
        // Check if notification function exists
        if (typeof showNotification === 'function') {
            showNotification(message);
            return;
        }

        // Fallback: Create our own notification
        const notification = document.createElement('div');
        notification.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transition-all ${
            type === 'success' ? 'bg-green-600 text-white' :
            type === 'error' ? 'bg-red-600 text-white' :
            'bg-blue-600 text-white'
        }`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Fade out and remove
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    /**
     * Setup change report modal
     */
    setupChangeReportModal() {
        // Add event listener to show change report
        document.addEventListener('showChangeReport', () => {
            this.showChangeReportModal();
        });
    }

    /**
     * Show change report modal
     */
    showChangeReportModal() {
        const report = window.wholecellChangeDetector?.getChangeReport();
        
        if (!report) {
            this.showFloatingNotification('No changes to report', 'info');
            return;
        }

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-96 overflow-auto">
                <div class="p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-2xl font-bold">Sync Changes Report</h2>
                        <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    
                    <div class="mb-4">
                        <p class="text-gray-600">${report.message}</p>
                        <p class="text-sm text-gray-500 mt-1">Last sync: ${new Date(report.timestamp).toLocaleString()}</p>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4 mb-4">
                        <div class="bg-green-50 p-4 rounded-lg">
                            <div class="text-2xl font-bold text-green-700">${report.summary.newItems}</div>
                            <div class="text-sm text-green-600">New Items</div>
                        </div>
                        <div class="bg-blue-50 p-4 rounded-lg">
                            <div class="text-2xl font-bold text-blue-700">${report.summary.modifiedItems}</div>
                            <div class="text-sm text-blue-600">Modified Items</div>
                        </div>
                        <div class="bg-yellow-50 p-4 rounded-lg">
                            <div class="text-2xl font-bold text-yellow-700">${report.summary.statusChanges}</div>
                            <div class="text-sm text-yellow-600">Status Changes</div>
                        </div>
                        <div class="bg-red-50 p-4 rounded-lg">
                            <div class="text-2xl font-bold text-red-700">${report.summary.removedItems}</div>
                            <div class="text-sm text-red-600">Removed Items</div>
                        </div>
                    </div>
                    
                    ${this.generateChangeDetails(report.details)}
                    
                    <div class="flex justify-end gap-3 mt-4">
                        <button onclick="wholecellChangeDetector.exportChanges()" class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
                            Export Report
                        </button>
                        <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    /**
     * Generate change details HTML
     */
    generateChangeDetails(details) {
        let html = '<div class="space-y-4">';
        
        if (details.new.length > 0) {
            html += `
                <div>
                    <h3 class="font-semibold text-green-700 mb-2">New Items (showing first 10)</h3>
                    <div class="space-y-1">
                        ${details.new.map(change => `
                            <div class="text-sm text-gray-600">
                                ${change.imei} - ${change.item.MODEL || 'Unknown'}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        if (details.modified.length > 0) {
            html += `
                <div>
                    <h3 class="font-semibold text-blue-700 mb-2">Modified Items (showing first 10)</h3>
                    <div class="space-y-1">
                        ${details.modified.map(change => `
                            <div class="text-sm text-gray-600">
                                ${change.imei} - ${change.modifications.length} field${change.modifications.length > 1 ? 's' : ''} changed
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        if (details.statusChanged.length > 0) {
            html += `
                <div>
                    <h3 class="font-semibold text-yellow-700 mb-2">Status Changes (showing first 10)</h3>
                    <div class="space-y-1">
                        ${details.statusChanged.map(change => `
                            <div class="text-sm text-gray-600">
                                ${change.imei}: ${change.oldStatus} → ${change.newStatus}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        return html;
    }

    /**
     * Add "View Changes" button to UI
     */
    addViewChangesButton() {
        const header = document.querySelector('header .flex.items-center.gap-3');
        if (!header) return;

        const button = document.createElement('button');
        button.className = 'bg-white bg-opacity-20 hover:bg-opacity-30 px-4 py-2 rounded-lg font-semibold transition flex items-center gap-2';
        button.title = 'View recent changes';
        button.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
            </svg>
            Changes
        `;
        button.onclick = () => this.showChangeReportModal();

        // Insert after refresh button
        const refreshButton = document.querySelector('button[onclick="refreshWholecellData()"]');
        if (refreshButton && refreshButton.parentNode) {
            refreshButton.parentNode.insertBefore(button, refreshButton.nextSibling);
        } else {
            header.appendChild(button);
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.wholecellUI = new WholecellUIEnhancements();
        window.wholecellUI.addViewChangesButton();
    });
} else {
    window.wholecellUI = new WholecellUIEnhancements();
    window.wholecellUI.addViewChangesButton();
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WholecellUIEnhancements;
}

