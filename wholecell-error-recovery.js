/**
 * Wholecell Error Recovery System
 * ================================
 * Handles errors gracefully and provides recovery mechanisms
 */

class WholecellErrorRecovery {
    constructor() {
        this.errorLog = [];
        this.maxRetries = 3;
        this.retryDelay = 2000; // 2 seconds
        this.errorHandlers = new Map();
        
        this.initializeErrorHandlers();
    }

    /**
     * Initialize error handlers for common scenarios
     */
    initializeErrorHandlers() {
        // Rate limit error (429)
        this.registerHandler('rate_limit', {
            detect: (error) => error.message.includes('429') || error.message.includes('rate limit'),
            recover: async () => {
                console.log('⏰ Rate limit detected, waiting 5 seconds...');
                await this.delay(5000);
                return 'retry';
            },
            message: 'Wholecell API rate limit reached. Waiting before retry...'
        });

        // Network error
        this.registerHandler('network', {
            detect: (error) => error.message.includes('network') || error.message.includes('fetch'),
            recover: async () => {
                console.log('🌐 Network error, checking connection...');
                const online = navigator.onLine;
                if (online) {
                    await this.delay(this.retryDelay);
                    return 'retry';
                } else {
                    return 'fallback';
                }
            },
            message: 'Network connection issue detected. Retrying...'
        });

        // Proxy not available
        this.registerHandler('proxy_unavailable', {
            detect: (error) => error.message.includes('proxy') || error.message.includes('not reachable'),
            recover: async () => {
                console.log('🔌 Proxy unavailable, using fallback...');
                return 'fallback';
            },
            message: 'Wholecell proxy server not available. Using fallback data.'
        });

        // Authentication error
        this.registerHandler('auth', {
            detect: (error) => error.message.includes('401') || error.message.includes('auth'),
            recover: async () => {
                console.log('🔐 Authentication error detected');
                return 'fail'; // Can't recover from auth errors
            },
            message: 'Authentication failed. Please check Wholecell credentials.'
        });

        // Data corruption
        this.registerHandler('data_corruption', {
            detect: (error) => error.message.includes('parse') || error.message.includes('invalid'),
            recover: async () => {
                console.log('📊 Data corruption detected, clearing cache...');
                if (window.wholecellAPI) {
                    window.wholecellAPI.clearCache();
                }
                return 'retry';
            },
            message: 'Data corruption detected. Cache cleared.'
        });
    }

    /**
     * Register a custom error handler
     */
    registerHandler(name, handler) {
        this.errorHandlers.set(name, handler);
    }

    /**
     * Handle an error with recovery attempts
     */
    async handleError(error, context = {}) {
        console.error('🚨 Error occurred:', error);
        
        // Log the error
        this.logError(error, context);
        
        // Find matching handler
        for (const [name, handler] of this.errorHandlers) {
            if (handler.detect(error)) {
                console.log(`🔧 Using ${name} handler`);
                
                // Show user-friendly message
                this.showUserMessage(handler.message, 'warning');
                
                // Attempt recovery
                const action = await handler.recover();
                
                return {
                    handlerName: name,
                    action: action,
                    error: error
                };
            }
        }
        
        // No specific handler found, use generic recovery
        return await this.genericRecovery(error, context);
    }

    /**
     * Generic recovery for unhandled errors
     */
    async genericRecovery(error, context) {
        console.log('🔧 Using generic recovery');
        
        const retries = context.retries || 0;
        
        if (retries < this.maxRetries) {
            console.log(`Retry attempt ${retries + 1}/${this.maxRetries}`);
            await this.delay(this.retryDelay);
            return { action: 'retry', retries: retries + 1 };
        } else {
            console.log('Max retries reached, using fallback');
            return { action: 'fallback' };
        }
    }

    /**
     * Log error for debugging
     */
    logError(error, context) {
        const errorEntry = {
            timestamp: new Date().toISOString(),
            error: {
                message: error.message,
                stack: error.stack
            },
            context: context
        };
        
        this.errorLog.push(errorEntry);
        
        // Keep only last 50 errors
        if (this.errorLog.length > 50) {
            this.errorLog.shift();
        }
        
        // Store in localStorage for debugging
        try {
            localStorage.setItem('wholecell_errors', JSON.stringify(this.errorLog.slice(-10)));
        } catch (e) {
            console.warn('Could not save error log to localStorage');
        }
    }

    /**
     * Show user-friendly error message
     */
    showUserMessage(message, type = 'error') {
        // Try to use existing notification system
        if (typeof showNotification === 'function') {
            showNotification(message);
        } else {
            // Fallback to console
            const icon = type === 'error' ? '❌' : '⚠️';
            console.log(`${icon} ${message}`);
        }
        
        // Update UI status if available
        if (window.wholecellSync) {
            window.wholecellSync.updateSyncStatus('error', message);
        }
    }

    /**
     * Get error statistics
     */
    getErrorStats() {
        const errorTypes = {};
        
        this.errorLog.forEach(entry => {
            const type = this.classifyError(entry.error);
            errorTypes[type] = (errorTypes[type] || 0) + 1;
        });
        
        return {
            totalErrors: this.errorLog.length,
            errorTypes: errorTypes,
            lastError: this.errorLog[this.errorLog.length - 1] || null
        };
    }

    /**
     * Classify error type
     */
    classifyError(error) {
        const message = error.message.toLowerCase();
        
        if (message.includes('429') || message.includes('rate')) return 'rate_limit';
        if (message.includes('401') || message.includes('auth')) return 'authentication';
        if (message.includes('network') || message.includes('fetch')) return 'network';
        if (message.includes('proxy')) return 'proxy';
        if (message.includes('parse') || message.includes('invalid')) return 'data';
        
        return 'unknown';
    }

    /**
     * Clear error log
     */
    clearErrorLog() {
        this.errorLog = [];
        try {
            localStorage.removeItem('wholecell_errors');
        } catch (e) {
            console.warn('Could not clear error log from localStorage');
        }
    }

    /**
     * Export error log for debugging
     */
    exportErrorLog() {
        const data = JSON.stringify(this.errorLog, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `wholecell_errors_${new Date().toISOString()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }

    /**
     * Helper: delay execution
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Test recovery system
     */
    async testRecovery() {
        console.log('🧪 Testing error recovery system...');
        
        // Test different error types
        const testErrors = [
            new Error('HTTP 429: Rate limit exceeded'),
            new Error('Network fetch failed'),
            new Error('Proxy server not reachable'),
            new Error('HTTP 401: Unauthorized')
        ];
        
        for (const error of testErrors) {
            console.log(`\nTesting: ${error.message}`);
            const result = await this.handleError(error, { test: true });
            console.log(`Result: ${result.action}`);
        }
        
        console.log('\n✅ Recovery system test complete');
    }
}

// Initialize globally
window.wholecellErrorRecovery = new WholecellErrorRecovery();

// Integrate with existing API client
if (window.WholecellAPI) {
    const originalFetch = WholecellAPI.prototype._fetchPage;
    WholecellAPI.prototype._fetchPage = async function(url) {
        let retries = 0;
        
        while (retries < 3) {
            try {
                return await originalFetch.call(this, url);
            } catch (error) {
                const recovery = await window.wholecellErrorRecovery.handleError(error, { url, retries });
                
                if (recovery.action === 'retry') {
                    retries++;
                    continue;
                } else if (recovery.action === 'fallback') {
                    throw new Error('Fallback to JSON data');
                } else {
                    throw error;
                }
            }
        }
        
        throw new Error('Max retries exceeded');
    };
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WholecellErrorRecovery;
}

