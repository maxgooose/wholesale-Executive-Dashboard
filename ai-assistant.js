/**
 * AI Assistant with Real Model Integration
 * Supports OpenAI GPT-4 and Anthropic Claude
 */

class AIAssistant {
    constructor() {
        this.apiKey = null;
        this.provider = 'demo'; // 'openai', 'anthropic', 'gemini', or 'demo'
        this.model = 'gpt-4'; // or 'claude-3-5-sonnet-20241022' or 'gemini-2.0-flash-exp'
        this.inventoryData = [];
        this.conversationHistory = [];
        this.maxContextItems = 500; // Limit inventory items sent to AI
        
        // Load settings from localStorage
        this.loadSettings();
    }

    /**
     * Load API settings from localStorage
     */
    loadSettings() {
        const savedSettings = localStorage.getItem('aiSettings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            this.provider = settings.provider || 'demo';
            this.apiKey = settings.apiKey || null;
            this.model = settings.model || this.getDefaultModel(this.provider);
        }
    }

    /**
     * Save API settings to localStorage
     */
    saveSettings(provider, apiKey, model = null) {
        this.provider = provider;
        this.apiKey = apiKey;
        this.model = model || this.getDefaultModel(provider);
        
        localStorage.setItem('aiSettings', JSON.stringify({
            provider: this.provider,
            apiKey: this.apiKey,
            model: this.model
        }));
    }

    /**
     * Get default model for provider
     */
    getDefaultModel(provider) {
        switch(provider) {
            case 'openai':
                return 'gpt-4-turbo-preview';
            case 'anthropic':
                return 'claude-3-5-sonnet-20241022';
            case 'gemini':
                return 'gemini-2.0-flash-exp';
            default:
                return 'demo';
        }
    }

    /**
     * Set inventory data
     */
    setInventoryData(data) {
        this.inventoryData = data;
    }

    /**
     * Generate inventory summary for AI context
     */
    generateInventoryContext(query) {
        if (this.inventoryData.length === 0) {
            return "No inventory data available.";
        }

        // Create summary statistics
        const total = this.inventoryData.length;
        const modelCounts = {};
        const gradeCounts = {};
        const statusCounts = {};
        const storageCounts = {};

        this.inventoryData.forEach(item => {
            // Count by model
            const model = item.MODEL || 'Unknown';
            modelCounts[model] = (modelCounts[model] || 0) + 1;

            // Count by grade
            const grade = item.GRADE || 'Unknown';
            gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;

            // Count by status
            const status = item.STATUS || 'Unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;

            // Count by storage
            const storage = item.STORAGE || 'Unknown';
            storageCounts[storage] = (storageCounts[storage] || 0) + 1;
        });

        // Build context
        let context = `INVENTORY DATABASE SUMMARY\n`;
        context += `Total Items: ${total}\n\n`;

        context += `MODEL DISTRIBUTION:\n`;
        Object.entries(modelCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .forEach(([model, count]) => {
                context += `- ${model}: ${count} units\n`;
            });

        context += `\nGRADE DISTRIBUTION:\n`;
        Object.entries(gradeCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([grade, count]) => {
                const percentage = ((count / total) * 100).toFixed(1);
                context += `- Grade ${grade}: ${count} units (${percentage}%)\n`;
            });

        context += `\nSTATUS BREAKDOWN:\n`;
        Object.entries(statusCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([status, count]) => {
                const percentage = ((count / total) * 100).toFixed(1);
                context += `- ${status}: ${count} units (${percentage}%)\n`;
            });

        context += `\nSTORAGE VARIANTS:\n`;
        Object.entries(storageCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([storage, count]) => {
                context += `- ${storage}: ${count} units\n`;
            });

        // Add relevant specific items based on query
        const relevantItems = this.findRelevantItems(query);
        if (relevantItems.length > 0) {
            context += `\nRELEVANT ITEMS (Sample):\n`;
            relevantItems.slice(0, 20).forEach((item, idx) => {
                context += `${idx + 1}. ${item.MODEL} ${item.STORAGE} ${item.COLOR || ''} - Grade ${item.GRADE} - ${item.STATUS}\n`;
            });
        }

        return context;
    }

    /**
     * Find items relevant to the query
     */
    findRelevantItems(query) {
        const lowerQuery = query.toLowerCase();
        const keywords = lowerQuery.split(' ');

        return this.inventoryData.filter(item => {
            const itemString = JSON.stringify(item).toLowerCase();
            return keywords.some(keyword => itemString.includes(keyword));
        });
    }

    /**
     * Build system prompt for AI
     */
    buildSystemPrompt() {
        return `You are an expert inventory management AI assistant for Universal, a phone refurbishment and resale business. The business owner's name is Yossi. You have access to real-time inventory data and can provide insights, analysis, and recommendations.

Your capabilities:
1. Analyze inventory data and provide detailed statistics
2. Identify trends and patterns in the inventory
3. Provide liquidation and pricing recommendations
4. Identify bottlenecks and processing issues
5. Generate reports and summaries
6. Answer specific queries about models, grades, and availability
7. Provide business insights and strategic recommendations
8. Read data from the inventory data and use it to answer questions

When analyzing data:
- Be specific with numbers and percentages
- Provide actionable recommendations
- Use clear formatting with headers and bullet points
- Highlight important insights
- Consider business context (margins, market demand, processing costs)
- ONLY use "Yossi" when the user greets you or in personalized contexts (like responding to "hi", "hello", etc.)
- Do NOT use "Yossi" in general responses or welcome messages
- Do NOT use emojis in your responses

Always base your responses on the actual inventory data provided, not assumptions.`;
    }

    /**
     * Send query to AI (OpenAI)
     */
    async queryOpenAI(userMessage, inventoryContext) {
        const messages = [
            {
                role: "system",
                content: this.buildSystemPrompt()
            },
            {
                role: "user",
                content: `INVENTORY DATA:\n${inventoryContext}\n\nUSER QUERY: ${userMessage}`
            }
        ];

        // Add conversation history (last 5 exchanges)
        const recentHistory = this.conversationHistory.slice(-10);
        recentHistory.forEach(msg => {
            messages.push({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            });
        });

        messages.push({
            role: "user",
            content: userMessage
        });

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: this.model,
                messages: messages,
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    /**
     * Send query to AI (Anthropic Claude)
     */
    async queryAnthropic(userMessage, inventoryContext) {
        const messages = [];

        // Add conversation history
        const recentHistory = this.conversationHistory.slice(-10);
        recentHistory.forEach(msg => {
            messages.push({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            });
        });

        // Add current message with inventory context
        messages.push({
            role: "user",
            content: `INVENTORY DATA:\n${inventoryContext}\n\nUSER QUERY: ${userMessage}`
        });

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.model,
                max_tokens: 4096,
                system: this.buildSystemPrompt(),
                messages: messages
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Anthropic API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        return data.content[0].text;
    }

    /**
     * Main query method - routes to appropriate AI provider
     */
    async query(userMessage) {
        try {
            // Generate inventory context
            const inventoryContext = this.generateInventoryContext(userMessage);

            let response;

            switch(this.provider) {
                case 'openai':
                    if (!this.apiKey) {
                        throw new Error('OpenAI API key not configured. Please add your API key in AI Settings.');
                    }
                    response = await this.queryOpenAI(userMessage, inventoryContext);
                    break;

                case 'anthropic':
                    if (!this.apiKey) {
                        throw new Error('Anthropic API key not configured. Please add your API key in AI Settings.');
                    }
                    response = await this.queryAnthropic(userMessage, inventoryContext);
                    break;

                case 'gemini':
                    if (!this.apiKey) {
                        throw new Error('Gemini API key not configured. Please add your API key in AI Settings.');
                    }
                    response = await this.queryGemini(userMessage);
                    break;

                case 'demo':
                default:
                    // Fall back to demo mode
                    response = this.demoResponse(userMessage);
                    break;
            }

            // Save to conversation history
            this.conversationHistory.push(
                { role: 'user', content: userMessage },
                { role: 'assistant', content: response }
            );

            // Limit conversation history
            if (this.conversationHistory.length > 20) {
                this.conversationHistory = this.conversationHistory.slice(-20);
            }

            return response;

        } catch (error) {
            console.error('AI Query Error:', error);
            return `Error: ${error.message}\n\nPlease check your API key and try again. You can update your settings by clicking "AI Settings" in the header.`;
        }
    }

    /**
     * Query Gemini AI
     */
    async queryGemini(userMessage) {
        // Use the dedicated Gemini assistant
        if (!window.geminiAssistant) {
            window.initializeGeminiAssistant(this.apiKey);
            window.geminiAssistant.setInventoryData(this.inventoryData);
        }
        
        return await window.geminiAssistant.query(userMessage);
    }

    /**
     * Demo mode response (fallback)
     */
    demoResponse(query) {
        return `**Demo Mode Active**\n\nTo get AI-powered responses, you need to:\n\n` +
               `1. Click "AI Settings" in the header\n` +
               `2. Select a provider (OpenAI, Anthropic, or Gemini)\n` +
               `3. Enter your API key\n` +
               `4. Save settings\n\n` +
               `**Get an API Key:**\n` +
               `• OpenAI: https://platform.openai.com/api-keys\n` +
               `• Anthropic: https://console.anthropic.com/\n` +
               `• Gemini: https://makersuite.google.com/app/apikey (FREE)\n\n` +
               `Your query: "${query}"\n` +
               `Inventory items available: ${this.inventoryData.length}`;
    }

    /**
     * Clear conversation history
     */
    clearHistory() {
        this.conversationHistory = [];
    }

    /**
     * Export conversation
     */
    exportConversation() {
        return {
            provider: this.provider,
            model: this.model,
            timestamp: new Date().toISOString(),
            messages: this.conversationHistory
        };
    }
}

// Create global instance
window.aiAssistant = new AIAssistant();







