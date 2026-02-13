/**
 * Gemini AI Assistant for Universal Inventory Management
 * Integrates Google Gemini 2.0 Flash with real-time inventory data
 */

class GeminiInventoryAssistant {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.apiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';
        this.inventoryData = [];
        this.conversationHistory = [];
        this.contextCache = null;
        this.maxHistoryLength = 10;
    }

    /**
     * Initialize with inventory data
     */
    setInventoryData(data) {
        this.inventoryData = data;
        console.log(`Gemini assistant loaded with ${data.length} inventory items`);
    }

    /**
     * Build comprehensive system instruction
     */
    buildSystemInstruction() {
        return `You are an expert AI assistant for UED (Universal Executive Dashboard), a phone wholesale and refurbishment business. The business owner's name is Yossi.

YOUR ROLE:
You help analyze inventory, track sales, provide pricing recommendations, and offer strategic business insights.

YOUR KNOWLEDGE:
- Complete real-time inventory database (${this.inventoryData.length} devices)
- Phone models, grades, storage variants, colors
- Status tracking (Available, Processing, Sold)
- Batch information and processing history

YOUR CAPABILITIES:
1. Inventory Analysis - Search, filter, and analyze stock levels
2. Sales Intelligence - Track what sells, identify trends
3. Pricing Strategy - Recommend optimal pricing
4. Liquidation Planning - Identify slow-moving inventory
5. Business Insights - Profit margins, ROI, cash flow
6. Customer Analysis - Track purchases and preferences

RESPONSE STYLE:
- Be specific with numbers and data
- Format with clear headers and bullet points
- Provide actionable recommendations
- Always calculate profit/margin when relevant
- Compare current vs historical when possible
- ONLY use "Yossi" when the user greets you or in personalized contexts (like responding to "hi", "hello", etc.)
- Do NOT use "Yossi" in general responses or welcome messages
- Do NOT use emojis in your responses

BUSINESS CONTEXT:
- This is UED, a wholesale phone refurbishment business
- Grades: A (best), B, C, C (AMZ), D, Defective
- Focus on profit margins and inventory turnover
- Quick sales are preferred to reduce holding costs

When asked questions:
1. Analyze the actual inventory data
2. Provide specific numbers
3. Offer strategic recommendations
4. Suggest concrete next actions`;
    }

    /**
     * Generate inventory context summary
     */
    generateInventoryContext() {
        if (this.inventoryData.length === 0) {
            return "No inventory data available.";
        }

        console.log(`Generating context from ${this.inventoryData.length} real inventory items`);
        
        const total = this.inventoryData.length;
        const modelCounts = {};
        const gradeCounts = {};
        const statusCounts = {};
        const storageCounts = {};

        this.inventoryData.forEach(item => {
            const model = item.MODEL || 'Unknown';
            const grade = item.GRADE || 'Unknown';
            const status = item.STATUS || 'Unknown';
            const storage = item.STORAGE || 'Unknown';

            modelCounts[model] = (modelCounts[model] || 0) + 1;
            gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;
            statusCounts[status] = (statusCounts[status] || 0) + 1;
            storageCounts[storage] = (storageCounts[storage] || 0) + 1;
        });

        let context = `CURRENT INVENTORY DATABASE\n`;
        context += `Total Items: ${total.toLocaleString()}\n\n`;

        context += `TOP MODELS (Top 15):\n`;
        Object.entries(modelCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .forEach(([model, count]) => {
                const percentage = ((count / total) * 100).toFixed(1);
                context += `• ${model}: ${count} units (${percentage}%)\n`;
            });

        context += `\nGRADE DISTRIBUTION:\n`;
        Object.entries(gradeCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([grade, count]) => {
                const percentage = ((count / total) * 100).toFixed(1);
                context += `• Grade ${grade}: ${count} units (${percentage}%)\n`;
            });

        context += `\nSTATUS BREAKDOWN:\n`;
        Object.entries(statusCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([status, count]) => {
                const percentage = ((count / total) * 100).toFixed(1);
                context += `• ${status}: ${count} units (${percentage}%)\n`;
            });

        context += `\nSTORAGE VARIANTS:\n`;
        Object.entries(storageCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .forEach(([storage, count]) => {
                context += `• ${storage}: ${count} units\n`;
            });

        return context;
    }

    /**
     * Find relevant inventory items for query
     */
    findRelevantItems(query, limit = 50) {
        const lowerQuery = query.toLowerCase();
        const keywords = lowerQuery.split(' ').filter(w => w.length > 2);

        const scored = this.inventoryData.map(item => {
            const itemString = JSON.stringify(item).toLowerCase();
            let score = 0;
            
            keywords.forEach(keyword => {
                if (itemString.includes(keyword)) {
                    score += 1;
                }
            });

            return { item, score };
        });

        return scored
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(s => s.item);
    }

    /**
     * Main query method - chat with Gemini
     */
    async query(userMessage) {
        try {
            console.log('Gemini processing:', userMessage);

            // Build context - FRESH DATA EVERY TIME
            const inventoryContext = this.generateInventoryContext();
            const relevantItems = this.findRelevantItems(userMessage, 50);

            console.log(`Using ${this.inventoryData.length} total items, ${relevantItems.length} relevant to query`);

            // Build conversation history for Gemini format
            const contents = [];

            // Add system context as first user message if starting new
            if (this.conversationHistory.length === 0) {
                contents.push({
                    role: "user",
                    parts: [{
                        text: `${this.buildSystemInstruction()}\n\n${inventoryContext}\n\nRelevant inventory items for this query:\n${JSON.stringify(relevantItems, null, 2)}`
                    }]
                });
                contents.push({
                    role: "model",
                    parts: [{
                        text: "I've loaded and analyzed your inventory database. I can now help you with inventory analysis, sales insights, pricing strategies, and business recommendations. What would you like to know?"
                    }]
                });
            } else {
                // For follow-up queries, include fresh inventory context
                contents.push({
                    role: "user",
                    parts: [{
                        text: `CURRENT INVENTORY CONTEXT (Updated):\n${inventoryContext}\n\nRelevant items for this query:\n${JSON.stringify(relevantItems.slice(0, 30), null, 2)}`
                    }]
                });
                contents.push({
                    role: "model",
                    parts: [{
                        text: "Understood. I have the updated inventory context."
                    }]
                });
            }

            // Add recent conversation history (last 4 exchanges to save tokens)
            const recentHistory = this.conversationHistory.slice(-8);
            recentHistory.forEach(msg => {
                contents.push({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content }]
                });
            });

            // Add current message
            contents.push({
                role: "user",
                parts: [{ text: userMessage }]
            });

            // Call Gemini API
            const response = await fetch(`${this.apiEndpoint}?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: contents,
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 2048,
                        topP: 0.95,
                        topK: 40
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Gemini API error: ${response.status} - ${JSON.stringify(errorData)}`);
            }

            const data = await response.json();
            
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Invalid response from Gemini API');
            }

            const assistantResponse = data.candidates[0].content.parts[0].text;

            // Save to conversation history
            this.conversationHistory.push(
                { role: 'user', content: userMessage },
                { role: 'assistant', content: assistantResponse }
            );

            // Limit history length
            if (this.conversationHistory.length > this.maxHistoryLength * 2) {
                this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength * 2);
            }

            console.log('Gemini response received');
            return assistantResponse;

        } catch (error) {
            console.error('Gemini query error:', error);
            return `Error communicating with Gemini: ${error.message}\n\nPlease check:\n- Your API key is valid\n- You have internet connection\n- Gemini API is accessible`;
        }
    }

    /**
     * Clear conversation history
     */
    clearHistory() {
        this.conversationHistory = [];
        console.log('Conversation history cleared');
    }

    /**
     * Get conversation history
     */
    getHistory() {
        return this.conversationHistory;
    }

    /**
     * Export conversation
     */
    exportConversation() {
        return {
            provider: 'gemini',
            model: 'gemini-2.0-flash-exp',
            timestamp: new Date().toISOString(),
            messages: this.conversationHistory
        };
    }
}

// Create global instance (will be initialized with API key)
window.geminiAssistant = null;

// Initialize function
window.initializeGeminiAssistant = function(apiKey) {
    window.geminiAssistant = new GeminiInventoryAssistant(apiKey);
    console.log('Gemini Assistant initialized');
    return window.geminiAssistant;
};

