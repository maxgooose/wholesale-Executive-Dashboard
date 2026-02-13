# 🔧 RAG Technical Architecture
## Detailed Implementation Specifications

**Date**: November 21, 2025  
**Version**: 1.0  
**Status**: Technical Specification

---

## 🏗️ System Architecture Layers

### Layer 1: Data Ingestion & Preprocessing

```javascript
// Data sources to be indexed
const DATA_SOURCES = {
  inventory: {
    source: 'wholecell-api',
    count: 216700,
    refreshRate: '15min',
    fields: 26
  },
  documentation: {
    source: 'markdown-files',
    count: 12,
    refreshRate: 'onUpdate',
    types: ['guides', 'api-docs', 'summaries']
  },
  pricing: {
    source: 'pricing-db',
    count: 500,
    refreshRate: 'daily',
    structure: 'hierarchical'
  },
  history: {
    source: 'update-history',
    count: 'dynamic',
    refreshRate: 'realtime'
  }
};
```

---

## 📦 Module 1: Vector Database (ChromaDB)

### Installation & Setup

```bash
# Install ChromaDB client
npm install chromadb

# Or for browser-based implementation
<script src="https://cdn.jsdelivr.net/npm/chromadb@latest/dist/chromadb.min.js"></script>
```

### Configuration File: `rag/rag-config.js`

```javascript
/**
 * RAG System Configuration
 */
const RAGConfig = {
  // Vector Database
  vectorDB: {
    provider: 'chromadb', // 'chromadb', 'pinecone', 'supabase'
    host: 'http://localhost:8000', // For ChromaDB server
    collection: 'ued_inventory',
    embeddingDimension: 768, // Gemini embedding size
    distanceMetric: 'cosine', // 'cosine', 'euclidean', 'dotproduct'
  },

  // Embeddings
  embeddings: {
    provider: 'gemini', // 'gemini', 'openai', 'local'
    model: 'text-embedding-004',
    apiKey: null, // Set via localStorage or env
    batchSize: 100, // Embed 100 docs at a time
    cacheEnabled: true,
  },

  // Retrieval
  retrieval: {
    topK: 20, // Initial candidates
    finalK: 10, // After re-ranking
    minScore: 0.7, // Minimum similarity score
    hybridWeights: {
      semantic: 0.7,
      metadata: 0.3,
    },
    enableReranking: true,
  },

  // Context Building
  context: {
    maxTokens: 8000, // Reserve space in context window
    includeMetadata: true,
    includeSources: true,
    format: 'structured', // 'structured', 'narrative', 'json'
  },

  // Performance
  performance: {
    cacheQueries: true,
    cacheTTL: 300000, // 5 minutes
    enablePrefetch: true,
    parallelQueries: 3,
  },

  // Monitoring
  monitoring: {
    enabled: true,
    logQueries: true,
    logResults: true,
    trackLatency: true,
    trackAccuracy: true,
  },
};

// Export configuration
window.RAGConfig = RAGConfig;

// Helper to load API keys from localStorage
function loadAPIKeys() {
  const saved = localStorage.getItem('ragSettings');
  if (saved) {
    const settings = JSON.parse(saved);
    RAGConfig.embeddings.apiKey = settings.embeddingApiKey || null;
  }
}

loadAPIKeys();
```

---

### Vector Database Client: `rag/rag-vector-db.js`

```javascript
/**
 * Vector Database Client (ChromaDB)
 */
class VectorDatabase {
  constructor(config = RAGConfig.vectorDB) {
    this.config = config;
    this.client = null;
    this.collection = null;
    this.isInitialized = false;
  }

  /**
   * Initialize connection to ChromaDB
   */
  async initialize() {
    try {
      // Import ChromaDB client
      const { ChromaClient } = await import('chromadb');
      
      // Create client
      this.client = new ChromaClient({
        path: this.config.host,
      });

      // Get or create collection
      try {
        this.collection = await this.client.getCollection({
          name: this.config.collection,
        });
        console.log('✅ Connected to existing collection');
      } catch (error) {
        // Collection doesn't exist, create it
        this.collection = await this.client.createCollection({
          name: this.config.collection,
          metadata: {
            description: 'UED Inventory RAG Collection',
            'hnsw:space': this.config.distanceMetric,
          },
        });
        console.log('✅ Created new collection');
      }

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize vector DB:', error);
      throw error;
    }
  }

  /**
   * Add documents to vector database
   * @param {Array} documents - Array of {id, content, embedding, metadata}
   */
  async addDocuments(documents) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const ids = documents.map(doc => doc.id);
      const embeddings = documents.map(doc => doc.embedding);
      const metadatas = documents.map(doc => doc.metadata);
      const documents_text = documents.map(doc => doc.content);

      await this.collection.add({
        ids,
        embeddings,
        metadatas,
        documents: documents_text,
      });

      console.log(`✅ Added ${documents.length} documents to vector DB`);
      return { success: true, count: documents.length };
    } catch (error) {
      console.error('❌ Failed to add documents:', error);
      throw error;
    }
  }

  /**
   * Update documents in vector database
   */
  async updateDocuments(documents) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const ids = documents.map(doc => doc.id);
      const embeddings = documents.map(doc => doc.embedding);
      const metadatas = documents.map(doc => doc.metadata);
      const documents_text = documents.map(doc => doc.content);

      await this.collection.update({
        ids,
        embeddings,
        metadatas,
        documents: documents_text,
      });

      console.log(`✅ Updated ${documents.length} documents`);
      return { success: true, count: documents.length };
    } catch (error) {
      console.error('❌ Failed to update documents:', error);
      throw error;
    }
  }

  /**
   * Query vector database
   * @param {Array} queryEmbedding - Query embedding vector
   * @param {Object} options - Query options {topK, where, include}
   */
  async query(queryEmbedding, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const {
      topK = RAGConfig.retrieval.topK,
      where = null,
      include = ['documents', 'metadatas', 'distances'],
    } = options;

    try {
      const results = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topK,
        where,
        include,
      });

      // Transform results to friendly format
      const documents = [];
      for (let i = 0; i < results.ids[0].length; i++) {
        documents.push({
          id: results.ids[0][i],
          content: results.documents[0][i],
          metadata: results.metadatas[0][i],
          score: 1 - results.distances[0][i], // Convert distance to similarity
        });
      }

      return documents;
    } catch (error) {
      console.error('❌ Query failed:', error);
      throw error;
    }
  }

  /**
   * Delete documents by ID
   */
  async deleteDocuments(ids) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await this.collection.delete({
        ids,
      });
      console.log(`✅ Deleted ${ids.length} documents`);
      return { success: true, count: ids.length };
    } catch (error) {
      console.error('❌ Failed to delete documents:', error);
      throw error;
    }
  }

  /**
   * Get collection statistics
   */
  async getStats() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const count = await this.collection.count();
      return {
        totalDocuments: count,
        collection: this.config.collection,
        isInitialized: this.isInitialized,
      };
    } catch (error) {
      console.error('❌ Failed to get stats:', error);
      return null;
    }
  }

  /**
   * Clear entire collection (use with caution!)
   */
  async clearCollection() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await this.client.deleteCollection({
        name: this.config.collection,
      });
      console.log('✅ Collection cleared');
      
      // Recreate collection
      await this.initialize();
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to clear collection:', error);
      throw error;
    }
  }
}

// Create global instance
window.vectorDB = new VectorDatabase();
```

---

## 🧬 Module 2: Embedding Generation

### Embedding Service: `rag/rag-embeddings.js`

```javascript
/**
 * Embedding Generation Service
 * Supports Gemini, OpenAI, and local embeddings
 */
class EmbeddingService {
  constructor(config = RAGConfig.embeddings) {
    this.config = config;
    this.cache = new Map();
    this.batchQueue = [];
    this.isProcessing = false;
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text) {
    // Check cache first
    const cacheKey = this.hashText(text);
    if (this.config.cacheEnabled && this.cache.has(cacheKey)) {
      console.log('📦 Using cached embedding');
      return this.cache.get(cacheKey);
    }

    let embedding;
    switch (this.config.provider) {
      case 'gemini':
        embedding = await this.generateGeminiEmbedding(text);
        break;
      case 'openai':
        embedding = await this.generateOpenAIEmbedding(text);
        break;
      case 'local':
        embedding = await this.generateLocalEmbedding(text);
        break;
      default:
        throw new Error(`Unknown embedding provider: ${this.config.provider}`);
    }

    // Cache the result
    if (this.config.cacheEnabled) {
      this.cache.set(cacheKey, embedding);
    }

    return embedding;
  }

  /**
   * Generate embeddings for multiple texts (batched)
   */
  async generateEmbeddings(texts) {
    const embeddings = [];
    
    // Process in batches
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);
      console.log(`📊 Processing batch ${Math.floor(i / this.config.batchSize) + 1}/${Math.ceil(texts.length / this.config.batchSize)}`);
      
      const batchEmbeddings = await Promise.all(
        batch.map(text => this.generateEmbedding(text))
      );
      
      embeddings.push(...batchEmbeddings);
      
      // Small delay to respect rate limits
      if (i + this.config.batchSize < texts.length) {
        await this.sleep(100);
      }
    }

    return embeddings;
  }

  /**
   * Gemini Embedding API
   */
  async generateGeminiEmbedding(text) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:embedContent?key=${this.config.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: `models/${this.config.model}`,
            content: {
              parts: [{ text }],
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      return data.embedding.values;
    } catch (error) {
      console.error('❌ Gemini embedding failed:', error);
      throw error;
    }
  }

  /**
   * OpenAI Embedding API
   */
  async generateOpenAIEmbedding(text) {
    try {
      const response = await fetch(
        'https://api.openai.com/v1/embeddings',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.model,
            input: text,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error('❌ OpenAI embedding failed:', error);
      throw error;
    }
  }

  /**
   * Local embedding generation (using Transformers.js)
   * Note: Requires @xenova/transformers library
   */
  async generateLocalEmbedding(text) {
    try {
      // Lazy load transformers
      if (!this.pipeline) {
        const { pipeline } = await import('@xenova/transformers');
        this.pipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      }

      const output = await this.pipeline(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    } catch (error) {
      console.error('❌ Local embedding failed:', error);
      throw error;
    }
  }

  /**
   * Simple hash function for caching
   */
  hashText(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 Embedding cache cleared');
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      enabled: this.config.cacheEnabled,
    };
  }
}

// Create global instance
window.embeddingService = new EmbeddingService();
```

---

## 📇 Module 3: Data Indexing

### Indexing Pipeline: `rag/rag-indexer.js`

```javascript
/**
 * RAG Indexing Pipeline
 * Converts inventory, docs, and pricing into vector embeddings
 */
class RAGIndexer {
  constructor() {
    this.vectorDB = window.vectorDB;
    this.embeddingService = window.embeddingService;
    this.indexStats = {
      inventory: { total: 0, indexed: 0, failed: 0 },
      documentation: { total: 0, indexed: 0, failed: 0 },
      pricing: { total: 0, indexed: 0, failed: 0 },
    };
  }

  /**
   * Index all data sources
   */
  async indexAll(options = {}) {
    const {
      includeInventory = true,
      includeDocumentation = true,
      includePricing = true,
      onProgress = null,
    } = options;

    console.log('🚀 Starting full indexing...');
    const startTime = Date.now();

    try {
      // Initialize vector DB
      await this.vectorDB.initialize();

      // Index each data source
      if (includeInventory) {
        await this.indexInventory(onProgress);
      }

      if (includeDocumentation) {
        await this.indexDocumentation(onProgress);
      }

      if (includePricing) {
        await this.indexPricing(onProgress);
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Indexing complete in ${(duration / 1000).toFixed(2)}s`);
      
      return {
        success: true,
        duration,
        stats: this.indexStats,
      };
    } catch (error) {
      console.error('❌ Indexing failed:', error);
      throw error;
    }
  }

  /**
   * Index inventory items
   */
  async indexInventory(onProgress = null) {
    console.log('📦 Indexing inventory...');
    
    const inventory = window.inventoryData || [];
    this.indexStats.inventory.total = inventory.length;

    // Process in batches
    const batchSize = 100;
    const documents = [];

    for (let i = 0; i < inventory.length; i += batchSize) {
      const batch = inventory.slice(i, i + batchSize);
      
      // Convert items to documents
      for (const item of batch) {
        try {
          const doc = await this.inventoryToDocument(item);
          documents.push(doc);
          this.indexStats.inventory.indexed++;
        } catch (error) {
          console.error(`Failed to process item ${item.IMEI}:`, error);
          this.indexStats.inventory.failed++;
        }
      }

      // Report progress
      if (onProgress) {
        onProgress({
          type: 'inventory',
          current: Math.min(i + batchSize, inventory.length),
          total: inventory.length,
          percentage: ((i + batchSize) / inventory.length * 100).toFixed(1),
        });
      }

      // Embed batch
      const texts = documents.map(d => d.content);
      const embeddings = await this.embeddingService.generateEmbeddings(texts);
      
      // Add embeddings to documents
      documents.forEach((doc, idx) => {
        doc.embedding = embeddings[idx];
      });

      // Add to vector DB
      await this.vectorDB.addDocuments(documents);
      
      // Clear batch
      documents.length = 0;
    }

    console.log(`✅ Indexed ${this.indexStats.inventory.indexed} inventory items`);
  }

  /**
   * Convert inventory item to searchable document
   */
  async inventoryToDocument(item) {
    // Build searchable content string
    const content = [
      item.MODEL || '',
      item.STORAGE || '',
      item.COLOR || '',
      `Grade ${item.GRADE}` || '',
      item.STATUS || '',
      item.NETWORK || '',
      item.IS_UNLOCKED ? 'UNLOCKED' : 'LOCKED',
      item.WAREHOUSE || '',
      item.LOCATION || '',
      item.BATTERY_PERCENT ? `${item.BATTERY_PERCENT}% battery` : '',
      item.IMEI_STATUS || '',
      item.SKU || '',
    ].filter(Boolean).join(' ');

    // Build metadata for filtering
    const metadata = {
      type: 'inventory',
      imei: item['IMEI/ SERIAL NO.'] || item.IMEI || '',
      model: item.MODEL || '',
      storage: item.STORAGE || '',
      color: item.COLOR || '',
      grade: item.GRADE || '',
      status: item.STATUS || '',
      network: item.NETWORK || '',
      isUnlocked: item.IS_UNLOCKED || false,
      warehouse: item.WAREHOUSE || '',
      location: item.LOCATION || '',
      battery: item.BATTERY_PERCENT || 0,
      cost: item.COST || 0,
      lastUpdated: item.lastUpdated || new Date().toISOString(),
    };

    return {
      id: `inv_${item['IMEI/ SERIAL NO.'] || item.IMEI || Math.random()}`,
      type: 'inventory',
      content,
      embedding: null, // Will be filled by embedder
      metadata,
    };
  }

  /**
   * Index documentation files
   */
  async indexDocumentation(onProgress = null) {
    console.log('📄 Indexing documentation...');
    
    // Documentation files to index
    const docFiles = [
      'README.md',
      'GEMINI_INTEGRATION_GUIDE.md',
      'ENHANCED_FILTERING_IMPLEMENTATION_SUMMARY.md',
      'WHOLECELL_INTEGRATION_COMPLETE.md',
      'DATA_FLOW_REFERENCE.md',
      'EXPORT_GUIDE.md',
      'MIGRATION_GUIDE.md',
      'PHASE1_TEST_RESULTS.md',
      'PHASE2_COMPLETE_SUMMARY.md',
      'PHASE3_COMPLETE_SUMMARY.md',
      'PHASE4_COMPLETE_SUMMARY.md',
      'PHASE5_COMPLETE_SUMMARY.md',
    ];

    this.indexStats.documentation.total = docFiles.length;

    for (const filename of docFiles) {
      try {
        // In real implementation, fetch file content
        // For now, we'll use a placeholder
        const content = `Documentation: ${filename}`;
        
        const doc = {
          id: `doc_${filename.replace(/\./g, '_')}`,
          type: 'documentation',
          content,
          embedding: null,
          metadata: {
            type: 'documentation',
            filename,
            category: this.categorizeDoc(filename),
            lastUpdated: new Date().toISOString(),
          },
        };

        // Generate embedding
        const embedding = await this.embeddingService.generateEmbedding(content);
        doc.embedding = embedding;

        // Add to vector DB
        await this.vectorDB.addDocuments([doc]);
        
        this.indexStats.documentation.indexed++;
      } catch (error) {
        console.error(`Failed to index ${filename}:`, error);
        this.indexStats.documentation.failed++;
      }

      // Report progress
      if (onProgress) {
        onProgress({
          type: 'documentation',
          current: this.indexStats.documentation.indexed,
          total: docFiles.length,
        });
      }
    }

    console.log(`✅ Indexed ${this.indexStats.documentation.indexed} documentation files`);
  }

  /**
   * Categorize documentation file
   */
  categorizeDoc(filename) {
    if (filename.includes('GUIDE')) return 'guide';
    if (filename.includes('PHASE')) return 'phase-summary';
    if (filename.includes('SUMMARY')) return 'summary';
    if (filename.includes('TEST')) return 'testing';
    if (filename.includes('README')) return 'overview';
    return 'other';
  }

  /**
   * Index pricing data
   */
  async indexPricing(onProgress = null) {
    console.log('💰 Indexing pricing...');
    
    // Get all pricing entries from pricing DB
    const pricingData = await window.pricingDB.getAllPrices();
    this.indexStats.pricing.total = pricingData.length;

    const documents = [];

    for (const priceEntry of pricingData) {
      try {
        const doc = await this.pricingToDocument(priceEntry);
        documents.push(doc);
        this.indexStats.pricing.indexed++;
      } catch (error) {
        console.error(`Failed to process pricing:`, error);
        this.indexStats.pricing.failed++;
      }
    }

    // Generate embeddings
    const texts = documents.map(d => d.content);
    const embeddings = await this.embeddingService.generateEmbeddings(texts);
    
    documents.forEach((doc, idx) => {
      doc.embedding = embeddings[idx];
    });

    // Add to vector DB
    await this.vectorDB.addDocuments(documents);

    console.log(`✅ Indexed ${this.indexStats.pricing.indexed} pricing entries`);
  }

  /**
   * Convert pricing entry to document
   */
  async pricingToDocument(priceEntry) {
    const content = `${priceEntry.model} ${priceEntry.storage} pricing: Grade A+ $${priceEntry.gradeAPlus}, Grade A $${priceEntry.gradeA}, Grade B $${priceEntry.gradeB}, Grade C $${priceEntry.gradeC}`;

    return {
      id: `price_${priceEntry.model}_${priceEntry.storage}`.replace(/\s/g, '_'),
      type: 'pricing',
      content,
      embedding: null,
      metadata: {
        type: 'pricing',
        model: priceEntry.model,
        storage: priceEntry.storage,
        gradeAPlus: priceEntry.gradeAPlus || 0,
        gradeA: priceEntry.gradeA || 0,
        gradeB: priceEntry.gradeB || 0,
        gradeC: priceEntry.gradeC || 0,
        lastUpdated: priceEntry.lastUpdated || new Date().toISOString(),
      },
    };
  }

  /**
   * Incremental update (for new/changed items)
   */
  async updateDocuments(documents) {
    console.log(`🔄 Updating ${documents.length} documents...`);
    
    try {
      // Generate embeddings
      const texts = documents.map(d => d.content);
      const embeddings = await this.embeddingService.generateEmbeddings(texts);
      
      documents.forEach((doc, idx) => {
        doc.embedding = embeddings[idx];
      });

      // Update in vector DB
      await this.vectorDB.updateDocuments(documents);
      
      console.log(`✅ Updated ${documents.length} documents`);
      return { success: true, count: documents.length };
    } catch (error) {
      console.error('❌ Update failed:', error);
      throw error;
    }
  }

  /**
   * Delete documents
   */
  async deleteDocuments(ids) {
    return await this.vectorDB.deleteDocuments(ids);
  }

  /**
   * Get indexing statistics
   */
  getStats() {
    return this.indexStats;
  }
}

// Create global instance
window.ragIndexer = new RAGIndexer();
```

---

## 🔍 Module 4: Retrieval Engine

### Retrieval System: `rag/rag-retriever.js`

```javascript
/**
 * RAG Retrieval Engine
 * Implements hybrid search with semantic + metadata filtering
 */
class RAGRetriever {
  constructor() {
    this.vectorDB = window.vectorDB;
    this.embeddingService = window.embeddingService;
    this.queryCache = new Map();
  }

  /**
   * Main retrieval method
   */
  async retrieve(query, options = {}) {
    const {
      topK = RAGConfig.retrieval.topK,
      filters = {},
      enableReranking = RAGConfig.retrieval.enableReranking,
      cacheResults = true,
    } = options;

    // Check cache
    const cacheKey = this.getCacheKey(query, filters);
    if (cacheResults && this.queryCache.has(cacheKey)) {
      console.log('📦 Using cached retrieval results');
      return this.queryCache.get(cacheKey);
    }

    console.log('🔍 Retrieving relevant documents for:', query);
    const startTime = Date.now();

    try {
      // 1. Generate query embedding
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // 2. Build metadata filter
      const whereClause = this.buildWhereClause(filters);

      // 3. Query vector database
      let results = await this.vectorDB.query(queryEmbedding, {
        topK: topK * 2, // Get more candidates for re-ranking
        where: whereClause,
      });

      // 4. Re-rank results
      if (enableReranking) {
        results = await this.rerankResults(query, results);
      }

      // 5. Limit to topK
      results = results.slice(0, topK);

      // 6. Filter by minimum score
      results = results.filter(r => r.score >= RAGConfig.retrieval.minScore);

      const duration = Date.now() - startTime;
      console.log(`✅ Retrieved ${results.length} documents in ${duration}ms`);

      // Cache results
      if (cacheResults) {
        this.queryCache.set(cacheKey, results);
        
        // Clear old cache entries after 5 minutes
        setTimeout(() => {
          this.queryCache.delete(cacheKey);
        }, RAGConfig.performance.cacheTTL);
      }

      return results;
    } catch (error) {
      console.error('❌ Retrieval failed:', error);
      throw error;
    }
  }

  /**
   * Build WHERE clause for metadata filtering
   */
  buildWhereClause(filters) {
    if (!filters || Object.keys(filters).length === 0) {
      return null;
    }

    const conditions = {};

    // Type filter
    if (filters.type) {
      conditions.type = filters.type;
    }

    // Inventory-specific filters
    if (filters.model) {
      conditions.model = filters.model;
    }

    if (filters.storage) {
      conditions.storage = filters.storage;
    }

    if (filters.grade) {
      conditions.grade = filters.grade;
    }

    if (filters.status) {
      conditions.status = filters.status;
    }

    if (filters.isUnlocked !== undefined) {
      conditions.isUnlocked = filters.isUnlocked;
    }

    if (filters.warehouse) {
      conditions.warehouse = filters.warehouse;
    }

    // Numeric range filters
    if (filters.minBattery) {
      conditions.battery = { $gte: filters.minBattery };
    }

    if (filters.maxCost) {
      conditions.cost = { $lte: filters.maxCost };
    }

    return Object.keys(conditions).length > 0 ? conditions : null;
  }

  /**
   * Re-rank results based on additional criteria
   */
  async rerankResults(query, results) {
    console.log('🎯 Re-ranking results...');

    // Score adjustments based on business rules
    results.forEach(result => {
      let adjustedScore = result.score;

      // Boost unlocked devices
      if (result.metadata.isUnlocked) {
        adjustedScore *= 1.1;
      }

      // Boost higher grades
      const gradeBoost = {
        'A+': 1.15,
        'A': 1.10,
        'B': 1.05,
        'C': 1.0,
        'D': 0.95,
      };
      adjustedScore *= gradeBoost[result.metadata.grade] || 1.0;

      // Boost recent updates
      if (result.metadata.lastUpdated) {
        const age = Date.now() - new Date(result.metadata.lastUpdated).getTime();
        const daysSinceUpdate = age / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate < 7) {
          adjustedScore *= 1.05; // Recent items slightly boosted
        }
      }

      result.adjustedScore = adjustedScore;
    });

    // Sort by adjusted score
    results.sort((a, b) => b.adjustedScore - a.adjustedScore);

    return results;
  }

  /**
   * Retrieve with multiple query variations
   */
  async retrieveMultiQuery(queries, options = {}) {
    console.log('🔄 Multi-query retrieval...');

    const allResults = [];
    const seen = new Set();

    for (const query of queries) {
      const results = await this.retrieve(query, options);
      
      // Deduplicate
      for (const result of results) {
        if (!seen.has(result.id)) {
          allResults.push(result);
          seen.add(result.id);
        }
      }
    }

    // Re-sort by score
    allResults.sort((a, b) => b.score - a.score);

    return allResults.slice(0, options.topK || RAGConfig.retrieval.topK);
  }

  /**
   * Hybrid search: Semantic + keyword
   */
  async hybridSearch(query, options = {}) {
    // 1. Semantic search
    const semanticResults = await this.retrieve(query, {
      ...options,
      topK: options.topK * 2,
    });

    // 2. Keyword search (simulated via metadata)
    // In production, this would use a separate keyword index
    const keywords = query.toLowerCase().split(' ');
    const keywordResults = semanticResults.filter(result => {
      const content = result.content.toLowerCase();
      return keywords.some(keyword => content.includes(keyword));
    });

    // 3. Merge results with weighted scores
    const weights = RAGConfig.retrieval.hybridWeights;
    const merged = new Map();

    semanticResults.forEach(result => {
      merged.set(result.id, {
        ...result,
        finalScore: result.score * weights.semantic,
      });
    });

    keywordResults.forEach(result => {
      if (merged.has(result.id)) {
        merged.get(result.id).finalScore += weights.metadata;
      } else {
        merged.set(result.id, {
          ...result,
          finalScore: weights.metadata,
        });
      }
    });

    // Convert to array and sort
    const results = Array.from(merged.values())
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, options.topK || RAGConfig.retrieval.topK);

    return results;
  }

  /**
   * Generate cache key
   */
  getCacheKey(query, filters) {
    return `${query}_${JSON.stringify(filters)}`;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.queryCache.clear();
    console.log('🧹 Retrieval cache cleared');
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      size: this.queryCache.size,
      enabled: RAGConfig.performance.cacheQueries,
    };
  }
}

// Create global instance
window.ragRetriever = new RAGRetriever();
```

---

## 🎯 Summary

This technical architecture provides:

1. **Vector Database (ChromaDB)**: Stores and queries embeddings
2. **Embedding Service**: Generates embeddings via Gemini/OpenAI/Local
3. **Indexing Pipeline**: Converts inventory/docs/pricing to vectors
4. **Retrieval Engine**: Hybrid search with re-ranking

**Next Steps:**
1. Implement Context Builder (formats results for LLM)
2. Integrate with existing AI assistant
3. Add UI controls
4. Test and optimize

**File Structure:**
```
rag/
├── rag-config.js          ✅ Complete
├── rag-vector-db.js       ✅ Complete
├── rag-embeddings.js      ✅ Complete
├── rag-indexer.js         ✅ Complete
├── rag-retriever.js       ✅ Complete
├── rag-context-builder.js ⏳ Next
├── rag-assistant.js       ⏳ Next
└── rag-monitor.js         ⏳ Next
```

---

*Document Complete*  
*Ready for Implementation*


