/**
 * Breakdown Pricing Modal Component
 * Handles the UI for setting and managing model prices
 */

class BreakdownPricingModal {
    constructor() {
        this.modalElement = null;
        this.currentModel = null;
        
        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    /**
     * Initialize the modal component
     */
    init() {
        this.createModalHTML();
        this.attachEventListeners();
        console.log('Breakdown modal initialized successfully');
    }

    /**
     * Create the modal HTML structure
     */
    createModalHTML() {
        // Add styles for the modal
        if (!document.getElementById('pricingModalStyles')) {
            const styles = document.createElement('style');
            styles.id = 'pricingModalStyles';
            styles.textContent = `
                #pricingModal {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    z-index: 9999;
                    display: none;
                    align-items: center;
                    justify-content: center;
                    padding: 24px;
                }
                #pricingModal.visible {
                    display: flex;
                }
                #pricingModal .modal-content {
                    background: var(--bg-card, #fff);
                    border-radius: 20px;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                    width: 100%;
                    max-width: 480px;
                    transform: scale(0.9);
                    opacity: 0;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                #pricingModal.visible .modal-content {
                    transform: scale(1);
                    opacity: 1;
                }
                #pricingModal .modal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 24px;
                    border-bottom: 1px solid var(--border-subtle, #e5e7eb);
                    background: linear-gradient(180deg, var(--bg-secondary, #f9fafb) 0%, var(--bg-card, #fff) 100%);
                    border-radius: 20px 20px 0 0;
                }
                #pricingModal .modal-title {
                    font-size: 20px;
                    font-weight: 700;
                    color: var(--text-primary, #111);
                    margin: 0;
                }
                #pricingModal .modal-subtitle {
                    font-size: 14px;
                    color: var(--text-tertiary, #6b7280);
                    margin-top: 4px;
                }
                #pricingModal .modal-close {
                    width: 36px;
                    height: 36px;
                    border: none;
                    background: var(--bg-hover, #f3f4f6);
                    border-radius: 10px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-secondary, #4b5563);
                    transition: all 0.2s;
                }
                #pricingModal .modal-close:hover {
                    background: var(--bg-secondary, #e5e7eb);
                    color: var(--text-primary, #111);
                }
                #pricingModal .modal-body {
                    padding: 24px;
                }
                #pricingModal .price-row {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 12px 0;
                    border-bottom: 1px solid var(--border-subtle, #f3f4f6);
                }
                #pricingModal .price-row:last-child {
                    border-bottom: none;
                }
                #pricingModal .grade-dot {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                #pricingModal .grade-dot.grade-a { background: #22c55e; }
                #pricingModal .grade-dot.grade-b { background: #3b82f6; }
                #pricingModal .grade-dot.grade-c { background: #f97316; }
                #pricingModal .grade-dot.grade-camz { background: #eab308; }
                #pricingModal .grade-dot.grade-d { background: #ef4444; }
                #pricingModal .grade-dot.grade-def { background: #6b7280; }
                #pricingModal .grade-label {
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-primary, #111);
                    width: 100px;
                    flex-shrink: 0;
                }
                #pricingModal .price-input-wrapper {
                    flex: 1;
                    position: relative;
                }
                #pricingModal .price-input-wrapper .dollar-sign {
                    position: absolute;
                    left: 14px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: var(--text-muted, #9ca3af);
                    font-size: 14px;
                    font-weight: 500;
                }
                #pricingModal .price-input {
                    width: 100%;
                    padding: 12px 14px 12px 28px;
                    font-size: 15px;
                    font-weight: 600;
                    border: 2px solid var(--border-subtle, #e5e7eb);
                    border-radius: 12px;
                    background: var(--bg-card, #fff);
                    color: var(--text-primary, #111);
                    transition: all 0.2s;
                    font-family: var(--font-mono, monospace);
                }
                #pricingModal .price-input:focus {
                    outline: none;
                    border-color: var(--accent, #3b82f6);
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
                }
                #pricingModal .price-input::placeholder {
                    color: var(--text-muted, #d1d5db);
                }
                #pricingModal .modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    padding: 20px 24px;
                    border-top: 1px solid var(--border-subtle, #e5e7eb);
                    background: var(--bg-secondary, #f9fafb);
                    border-radius: 0 0 20px 20px;
                }
                #pricingModal .btn-cancel {
                    padding: 12px 20px;
                    font-size: 14px;
                    font-weight: 600;
                    border: none;
                    background: var(--bg-hover, #f3f4f6);
                    color: var(--text-secondary, #4b5563);
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                #pricingModal .btn-cancel:hover {
                    background: var(--bg-secondary, #e5e7eb);
                }
                #pricingModal .btn-save {
                    padding: 12px 24px;
                    font-size: 14px;
                    font-weight: 600;
                    border: none;
                    background: var(--accent, #3b82f6);
                    color: white;
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                #pricingModal .btn-save:hover {
                    background: var(--accent-hover, #2563eb);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px -2px rgba(59, 130, 246, 0.4);
                }
                #pricingModal .price-suggestion {
                    font-family: var(--font-mono, monospace);
                    font-size: 12px;
                    color: var(--text-muted, #9ca3af);
                    margin-top: 4px;
                    min-height: 18px;
                }
                #pricingModal .price-suggestion .suggestion-link {
                    color: var(--accent, #3b82f6);
                    cursor: pointer;
                    text-decoration: none;
                    font-weight: 500;
                }
                #pricingModal .price-suggestion .suggestion-link:hover {
                    text-decoration: underline;
                }
            `;
            document.head.appendChild(styles);
        }

        const modalHTML = `
            <div id="pricingModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <div>
                            <h3 class="modal-title">Set Pricing</h3>
                            <p class="modal-subtitle">
                                <span id="pricingModelName">Model</span> · 
                                <span id="pricingStorage">Storage</span>
                            </p>
                        </div>
                        <button class="modal-close" onclick="breakdownModal.closeModal()">
                            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    <div class="modal-body">
                        <div class="price-row" data-grade="gradeA">
                            <div class="grade-dot grade-a"></div>
                            <label class="grade-label">Grade A</label>
                            <div style="flex:1">
                                <div class="price-input-wrapper">
                                    <span class="dollar-sign">$</span>
                                    <input type="number" id="priceGradeA" class="price-input" placeholder="0.00" step="0.01">
                                </div>
                                <div class="price-suggestion" id="suggestionGradeA"></div>
                            </div>
                        </div>

                        <div class="price-row" data-grade="gradeB">
                            <div class="grade-dot grade-b"></div>
                            <label class="grade-label">Grade B</label>
                            <div style="flex:1">
                                <div class="price-input-wrapper">
                                    <span class="dollar-sign">$</span>
                                    <input type="number" id="priceGradeB" class="price-input" placeholder="0.00" step="0.01">
                                </div>
                                <div class="price-suggestion" id="suggestionGradeB"></div>
                            </div>
                        </div>

                        <div class="price-row" data-grade="gradeC">
                            <div class="grade-dot grade-c"></div>
                            <label class="grade-label">Grade C</label>
                            <div style="flex:1">
                                <div class="price-input-wrapper">
                                    <span class="dollar-sign">$</span>
                                    <input type="number" id="priceGradeC" class="price-input" placeholder="0.00" step="0.01">
                                </div>
                                <div class="price-suggestion" id="suggestionGradeC"></div>
                            </div>
                        </div>

                        <div class="price-row" data-grade="gradeCAMZ">
                            <div class="grade-dot grade-camz"></div>
                            <label class="grade-label">Grade C (AMZ)</label>
                            <div style="flex:1">
                                <div class="price-input-wrapper">
                                    <span class="dollar-sign">$</span>
                                    <input type="number" id="priceGradeCAMZ" class="price-input" placeholder="0.00" step="0.01">
                                </div>
                                <div class="price-suggestion" id="suggestionGradeCAMZ"></div>
                            </div>
                        </div>

                        <div class="price-row" data-grade="gradeD">
                            <div class="grade-dot grade-d"></div>
                            <label class="grade-label">Grade D</label>
                            <div style="flex:1">
                                <div class="price-input-wrapper">
                                    <span class="dollar-sign">$</span>
                                    <input type="number" id="priceGradeD" class="price-input" placeholder="0.00" step="0.01">
                                </div>
                                <div class="price-suggestion" id="suggestionGradeD"></div>
                            </div>
                        </div>

                        <div class="price-row" data-grade="defective">
                            <div class="grade-dot grade-def"></div>
                            <label class="grade-label">Defective</label>
                            <div style="flex:1">
                                <div class="price-input-wrapper">
                                    <span class="dollar-sign">$</span>
                                    <input type="number" id="priceDefective" class="price-input" placeholder="0.00" step="0.01">
                                </div>
                                <div class="price-suggestion" id="suggestionDefective"></div>
                            </div>
                        </div>
                    </div>

                    <div class="modal-footer">
                        <button class="btn-cancel" onclick="breakdownModal.closeModal()">Cancel</button>
                        <button class="btn-save" onclick="breakdownModal.savePrices()">Save Prices</button>
                    </div>
                </div>
            </div>
        `;

        // Add modal to body if it doesn't exist
        if (!document.getElementById('pricingModal')) {
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }
        
        this.modalElement = document.getElementById('pricingModal');
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Close modal on backdrop click
        this.modalElement?.addEventListener('click', (e) => {
            if (e.target === this.modalElement) {
                this.closeModal();
            }
        });
    }

    /**
     * Open modal for a specific model
     */
    async openModal(model, storage, existingGrades = null) {
        try {
            console.log('Opening modal for:', model, storage, 'with grades:', existingGrades);
            
            if (!this.modalElement) {
                console.error('Modal element not found. Reinitializing...');
                this.createModalHTML();
                this.attachEventListeners();
            }
            
            this.currentModel = { model, storage, existingGrades };
            
            // Update modal header
            const modelNameEl = document.getElementById('pricingModelName');
            const storageEl = document.getElementById('pricingStorage');
            
            if (!modelNameEl || !storageEl) {
                console.error('Modal header elements not found');
                return;
            }
            
            modelNameEl.textContent = model;
            storageEl.textContent = storage;
            
            // Show/hide fields based on existing grades
            this.updateFieldVisibility(existingGrades);
            
            // Load existing prices
            await this.loadExistingPrices(model, storage);

            // Load smart suggestions
            await this.loadSuggestions(model, storage);

            // Show modal
            this.modalElement.classList.add('visible');
            
            // Focus first visible input
            setTimeout(() => {
                const firstVisibleInput = this.modalElement.querySelector('.price-input:not([style*="display: none"])');
                if (firstVisibleInput) firstVisibleInput.focus();
            }, 100);
            
            console.log('Modal opened successfully');
        } catch (error) {
            console.error('Error opening modal:', error);
            alert('Failed to open pricing modal. Please check the console for details.');
        }
    }


    /**
     * Update field visibility based on existing grades
     */
    updateFieldVisibility(existingGrades) {
        // If no grade info provided, show all fields
        if (!existingGrades) {
            document.querySelectorAll('#pricingModal .price-row').forEach(row => {
                row.style.display = 'flex';
            });
            return;
        }

        // Map of data-grade attributes to existingGrades keys
        const fieldMap = {
            'gradeA': existingGrades.gradeA,
            'gradeB': existingGrades.gradeB,
            'gradeC': existingGrades.gradeC,
            'gradeCAMZ': existingGrades.gradeCAMZ,
            'gradeD': existingGrades.gradeD,
            'defective': existingGrades.defective
        };

        // Show/hide each field based on existence
        Object.entries(fieldMap).forEach(([gradeKey, shouldShow]) => {
            const row = document.querySelector(`#pricingModal .price-row[data-grade="${gradeKey}"]`);
            if (row) {
                row.style.display = shouldShow ? 'flex' : 'none';
            }
        });
    }

    /**
     * Close the modal
     */
    closeModal() {
        this.modalElement.classList.remove('visible');
        this.clearForm();
        this.currentModel = null;
        
        // Reset field visibility when closing
        this.updateFieldVisibility(null);
    }

    /**
     * Load existing prices for the model
     */
    async loadExistingPrices(model, storage) {
        try {
            const existingPrice = await pricingDB.getModelPrice(model, storage);
            
            if (existingPrice) {
                document.getElementById('priceGradeA').value = existingPrice.gradeA || '';
                document.getElementById('priceGradeB').value = existingPrice.gradeB || '';
                document.getElementById('priceGradeC').value = existingPrice.gradeC || '';
                document.getElementById('priceGradeCAMZ').value = existingPrice.gradeCAMZ || '';
                document.getElementById('priceGradeD').value = existingPrice.gradeD || '';
                document.getElementById('priceDefective').value = existingPrice.defective || '';
            } else {
                this.clearForm();
            }
        } catch (error) {
            console.error('Error loading existing prices:', error);
        }
    }


    /**
     * Load smart suggestions for each grade
     */
    async loadSuggestions(model, storage) {
        const gradeMap = {
            'A': { inputId: 'priceGradeA', suggestionId: 'suggestionGradeA' },
            'B': { inputId: 'priceGradeB', suggestionId: 'suggestionGradeB' },
            'C': { inputId: 'priceGradeC', suggestionId: 'suggestionGradeC' },
            'CAMZ': { inputId: 'priceGradeCAMZ', suggestionId: 'suggestionGradeCAMZ' },
            'D': { inputId: 'priceGradeD', suggestionId: 'suggestionGradeD' },
            'defective': { inputId: 'priceDefective', suggestionId: 'suggestionDefective' }
        };

        for (const [grade, ids] of Object.entries(gradeMap)) {
            const el = document.getElementById(ids.suggestionId);
            if (!el) continue;
            el.innerHTML = '';

            try {
                const suggestion = await pricingDB.getSmartSuggestions(model, storage, grade);
                if (suggestion && suggestion.recommended && suggestion.recommended > 0) {
                    const price = suggestion.recommended.toFixed(2);
                    el.innerHTML = `Suggested: <span class="suggestion-link" data-target="${ids.inputId}" data-value="${price}">$${price}</span>`;
                }
            } catch (err) {
                // Suggestions are optional, don't block on errors
            }
        }

        // Attach click handlers for suggestion links
        this.modalElement.querySelectorAll('.suggestion-link').forEach(link => {
            link.addEventListener('click', (e) => {
                const targetId = e.target.dataset.target;
                const value = e.target.dataset.value;
                const input = document.getElementById(targetId);
                if (input) {
                    input.value = value;
                    input.focus();
                }
            });
        });
    }

    /**
     * Save prices to database
     */
    async savePrices() {
        const { model, storage } = this.currentModel;
        
        const priceData = {
            model,
            storage,
            gradeA: parseFloat(document.getElementById('priceGradeA').value || 0),
            gradeB: parseFloat(document.getElementById('priceGradeB').value || 0),
            gradeC: parseFloat(document.getElementById('priceGradeC').value || 0),
            gradeCAMZ: parseFloat(document.getElementById('priceGradeCAMZ').value || 0),
            gradeD: parseFloat(document.getElementById('priceGradeD').value || 0),
            defective: parseFloat(document.getElementById('priceDefective').value || 0),
            userId: localStorage.getItem('currentUser') || 'User'
        };
        
        try {
            await pricingDB.saveModelPrice(priceData);
            this.showNotification('Prices saved successfully!', 'success');
            
            // Trigger update event
            document.dispatchEvent(new CustomEvent('pricesUpdated', { 
                detail: { model, storage, prices: priceData } 
            }));
            
            // Close modal after short delay
            setTimeout(() => this.closeModal(), 1000);
        } catch (error) {
            console.error('Error saving prices:', error);
            this.showNotification('Failed to save prices', 'error');
        }
    }

    /**
     * Clear form inputs
     */
    clearForm() {
        document.getElementById('priceGradeA').value = '';
        document.getElementById('priceGradeB').value = '';
        document.getElementById('priceGradeC').value = '';
        document.getElementById('priceGradeCAMZ').value = '';
        document.getElementById('priceGradeD').value = '';
        document.getElementById('priceDefective').value = '';
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        const colors = {
            success: '#22c55e',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 24px;
            right: 24px;
            background: ${colors[type]};
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 8px 24px -4px rgba(0,0,0,0.2);
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 14px;
            font-weight: 600;
            transform: translateX(120%);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        `;
        notification.innerHTML = `
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                ${type === 'success' ? 
                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>' :
                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'}
            </svg>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        // Slide in
        requestAnimationFrame(() => {
            notification.style.transform = 'translateX(0)';
        });
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(120%)';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Create and export singleton instance
const breakdownModal = new BreakdownPricingModal();

// Make it globally available
window.breakdownModal = breakdownModal;

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = breakdownModal;
}
