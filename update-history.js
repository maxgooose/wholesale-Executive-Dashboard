// Update History Panel Management
class UpdateHistoryManager {
    constructor() {
        this.updates = [];
        this.maxHistory = 100;
        this.notificationQueue = [];
        this.init();
    }
    
    init() {
        this.loadHistoryFromStorage();
        this.setupEventListeners();
        this.startAutoSave();
    }
    
    loadHistoryFromStorage() {
        const stored = localStorage.getItem('inventoryUpdateHistory');
        if (stored) {
            try {
                this.updates = JSON.parse(stored);
            } catch (e) {
                console.error('Failed to load update history:', e);
                this.updates = [];
            }
        }
    }
    
    saveHistoryToStorage() {
        try {
            localStorage.setItem('inventoryUpdateHistory', JSON.stringify(this.updates.slice(0, this.maxHistory)));
        } catch (e) {
            console.error('Failed to save update history:', e);
        }
    }
    
    addUpdate(update) {
        const enrichedUpdate = {
            ...update,
            id: this.generateUpdateId(),
            timestamp: update.timestamp || new Date().toISOString(),
            user: update.user || this.getCurrentUser(),
            status: 'pending'
        };
        
        this.updates.unshift(enrichedUpdate);
        
        if (this.updates.length > this.maxHistory) {
            this.updates = this.updates.slice(0, this.maxHistory);
        }
        
        this.saveHistoryToStorage();
        this.renderUpdate(enrichedUpdate);
        this.showNotification(enrichedUpdate);
        this.updateBadges();
        
        return enrichedUpdate;
    }
    
    generateUpdateId() {
        return 'update_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    getCurrentUser() {
        return localStorage.getItem('currentUser') || 'System User';
    }
    
    renderUpdate(update) {
        const container = document.getElementById('updateHistory');
        if (!container) return;
        
        const updateElement = document.createElement('div');
        updateElement.className = 'update-item relative';
        updateElement.dataset.updateId = update.id;
        
        updateElement.innerHTML = `
            <div class="timeline-line"></div>
            <div class="timeline-dot ${this.getStatusColor(update.status)}"></div>
            <div class="pl-12">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <p class="font-semibold text-sm">${this.getUpdateTitle(update)}</p>
                        <p class="text-xs text-gray-600">${this.getUpdateDescription(update)}</p>
                        <p class="text-xs text-gray-400">${this.formatTimestamp(update.timestamp)}</p>
                    </div>
                    <div class="flex gap-1">
                        ${this.getActionButtons(update)}
                    </div>
                </div>
                ${update.notes ? `<p class="text-xs text-gray-500 mt-1">${update.notes}</p>` : ''}
            </div>
        `;
        
        // Insert at the beginning
        container.insertBefore(updateElement, container.firstChild);
        
        // Animate entry
        updateElement.style.opacity = '0';
        updateElement.style.transform = 'translateX(20px)';
        setTimeout(() => {
            updateElement.style.transition = 'all 0.3s ease';
            updateElement.style.opacity = '1';
            updateElement.style.transform = 'translateX(0)';
        }, 10);
    }
    
    getStatusColor(status) {
        switch(status) {
            case 'completed': return 'bg-green-500';
            case 'pending': return 'bg-amber-500';
            case 'error': return 'bg-red-500';
            default: return 'bg-gray-500';
        }
    }
    
    getUpdateTitle(update) {
        switch(update.action) {
            case 'Room Transfer':
                return `Room Transfer: ${update.from} → ${update.to}`;
            case 'Grade Change':
                return `Grade Updated: ${update.oldGrade} → ${update.newGrade}`;
            case 'QC Update':
                return 'Quality Check Updated';
            case 'Bulk Action':
                return `Bulk ${update.type}: ${update.count} items`;
            case 'Data Import':
                return `Data Import: ${update.count} items`;
            case 'Export':
                return `Export: ${update.format} format`;
            default:
                return update.action || 'Update';
        }
    }
    
    getUpdateDescription(update) {
        if (update.imei) {
            return `IMEI: ${update.imei}`;
        }
        if (update.items) {
            return `${update.items.length} items affected`;
        }
        return update.description || '';
    }
    
    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        // Less than 1 minute
        if (diff < 60000) {
            return 'Just now';
        }
        
        // Less than 1 hour
        if (diff < 3600000) {
            const minutes = Math.floor(diff / 60000);
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        }
        
        // Less than 24 hours
        if (diff < 86400000) {
            const hours = Math.floor(diff / 3600000);
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        }
        
        // Less than 7 days
        if (diff < 604800000) {
            const days = Math.floor(diff / 86400000);
            return `${days} day${days > 1 ? 's' : ''} ago`;
        }
        
        // Default to date format
        return date.toLocaleDateString();
    }
    
    getActionButtons(update) {
        const buttons = [];
        
        if (update.status === 'pending') {
            buttons.push(`
                <button onclick="updateHistoryManager.confirmUpdate('${update.id}')" 
                        class="text-green-600 hover:text-green-800">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                    </svg>
                </button>
            `);
        }
        
        if (update.reversible) {
            buttons.push(`
                <button onclick="updateHistoryManager.revertUpdate('${update.id}')" 
                        class="text-amber-600 hover:text-amber-800">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
                    </svg>
                </button>
            `);
        }
        
        buttons.push(`
            <button onclick="updateHistoryManager.deleteUpdate('${update.id}')" 
                    class="text-gray-400 hover:text-red-600">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        `);
        
        return buttons.join('');
    }
    
    confirmUpdate(updateId) {
        const update = this.updates.find(u => u.id === updateId);
        if (update) {
            update.status = 'completed';
            this.saveHistoryToStorage();
            this.refreshUpdateElement(updateId);
        }
    }
    
    revertUpdate(updateId) {
        const update = this.updates.find(u => u.id === updateId);
        if (update && update.reversible) {
            // Implement revert logic based on update type
            console.log('Reverting update:', update);
            
            // Add a new update for the revert action
            this.addUpdate({
                action: 'Revert',
                revertedUpdate: updateId,
                description: `Reverted: ${this.getUpdateTitle(update)}`
            });
        }
    }
    
    deleteUpdate(updateId) {
        const index = this.updates.findIndex(u => u.id === updateId);
        if (index !== -1) {
            this.updates.splice(index, 1);
            this.saveHistoryToStorage();
            
            // Remove from DOM with animation
            const element = document.querySelector(`[data-update-id="${updateId}"]`);
            if (element) {
                element.style.transition = 'all 0.3s ease';
                element.style.opacity = '0';
                element.style.transform = 'translateX(-20px)';
                setTimeout(() => element.remove(), 300);
            }
            
            this.updateBadges();
        }
    }
    
    refreshUpdateElement(updateId) {
        const update = this.updates.find(u => u.id === updateId);
        const element = document.querySelector(`[data-update-id="${updateId}"]`);
        
        if (update && element) {
            // Update timeline dot color
            const dot = element.querySelector('.timeline-dot');
            if (dot) {
                dot.className = `timeline-dot ${this.getStatusColor(update.status)}`;
            }
            
            // Flash to indicate change
            element.style.background = '#eff6ff';
            setTimeout(() => {
                element.style.transition = 'background 0.5s ease';
                element.style.background = '';
            }, 100);
        }
    }
    
    showNotification(update) {
        const notification = document.createElement('div');
        notification.className = 'fixed bottom-4 right-4 bg-white shadow-lg rounded-lg p-4 z-50 max-w-sm border-l-4 border-blue-500';
        
        notification.innerHTML = `
            <div class="flex items-start gap-3">
                <div class="flex-shrink-0">
                    <svg class="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
                <div class="flex-1">
                    <p class="font-semibold text-gray-800">${this.getUpdateTitle(update)}</p>
                    <p class="text-sm text-gray-600">${this.getUpdateDescription(update)}</p>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" class="text-gray-400 hover:text-gray-600">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(20px)';
        setTimeout(() => {
            notification.style.transition = 'all 0.3s ease';
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        }, 10);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(20px)';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }
    
    updateBadges() {
        const pendingCount = this.updates.filter(u => u.status === 'pending').length;
        const badge = document.getElementById('pendingUpdates');
        if (badge) {
            badge.textContent = pendingCount;
            
            if (pendingCount > 0) {
                badge.classList.add('bg-red-500');
                badge.classList.remove('bg-white', 'bg-opacity-20');
            } else {
                badge.classList.remove('bg-red-500');
                badge.classList.add('bg-white', 'bg-opacity-20');
            }
        }
    }
    
    setupEventListeners() {
        // Listen for custom update events
        document.addEventListener('inventoryUpdate', (event) => {
            this.addUpdate(event.detail);
        });
        
        // Setup filter controls
        const filterButtons = document.querySelectorAll('[data-filter-updates]');
        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                const filter = button.dataset.filterUpdates;
                this.filterUpdates(filter);
            });
        });
    }
    
    filterUpdates(filter) {
        let filtered = this.updates;
        
        switch(filter) {
            case 'pending':
                filtered = this.updates.filter(u => u.status === 'pending');
                break;
            case 'completed':
                filtered = this.updates.filter(u => u.status === 'completed');
                break;
            case 'today':
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                filtered = this.updates.filter(u => new Date(u.timestamp) >= today);
                break;
            case 'room-transfers':
                filtered = this.updates.filter(u => u.action === 'Room Transfer');
                break;
        }
        
        this.renderFilteredUpdates(filtered);
    }
    
    renderFilteredUpdates(updates) {
        const container = document.getElementById('updateHistory');
        if (!container) return;
        
        container.innerHTML = '';
        updates.forEach(update => this.renderUpdate(update));
    }
    
    startAutoSave() {
        setInterval(() => {
            this.saveHistoryToStorage();
        }, 30000); // Auto-save every 30 seconds
    }
    
    exportHistory(format = 'json') {
        const data = this.updates;
        
        switch(format) {
            case 'json':
                this.downloadJSON(data);
                break;
            case 'csv':
                this.downloadCSV(data);
                break;
        }
    }
    
    downloadJSON(data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `update_history_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
    }
    
    downloadCSV(data) {
        const headers = ['ID', 'Action', 'Description', 'User', 'Timestamp', 'Status'];
        const csv = [
            headers.join(','),
            ...data.map(u => [
                u.id,
                u.action,
                this.getUpdateDescription(u).replace(/,/g, ';'),
                u.user,
                u.timestamp,
                u.status
            ].join(','))
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `update_history_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    }
}

// Initialize the update history manager
const updateHistoryManager = new UpdateHistoryManager();









