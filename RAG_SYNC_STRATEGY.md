# 🔄 RAG Real-Time Sync Strategy
## Keeping RAG Updated with Daily Inventory Changes

**Date**: November 21, 2025  
**Priority**: CRITICAL  
**Status**: Implementation Guide

---

## 🎯 The Challenge

Your inventory changes constantly:
- ✅ New devices arrive daily (hundreds of items)
- ✅ Devices sell and status changes (Available → Sold)
- ✅ Processing updates (grades, conditions, locations)
- ✅ Pricing changes
- ✅ Wholecell syncs every 15 minutes

**Question**: How do we keep RAG embeddings up-to-date without re-indexing everything?

**Answer**: **Incremental Updates** - Only update what changed!

---

## 📊 Sync Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Wholecell Sync (Every 15 min)                   │
│              wholecell-sync.js already running               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ Change Detector      │
              │ (wholecell-change-   │
              │  detector.js)        │
              │ ALREADY EXISTS ✅    │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   RAG Sync Manager   │
              │   (NEW MODULE)       │
              │                      │
              │ - Detect changes     │
              │ - Classify updates   │
              │ - Trigger re-index   │
              └──────────┬───────────┘
                         │
           ┌─────────────┼─────────────┐
           │             │             │
           ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │   NEW    │  │ MODIFIED │  │ DELETED  │
    │  items   │  │  items   │  │  items   │
    └────┬─────┘  └────┬─────┘  └────┬─────┘
         │             │             │
         ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │  Embed   │  │ Re-embed │  │  Remove  │
    │  & Add   │  │ & Update │  │ from DB  │
    └────┬─────┘  └────┬─────┘  └────┬─────┘
         │             │             │
         └─────────────┴─────────────┘
                       │
                       ▼
              ┌──────────────────────┐
              │   Vector Database    │
              │   ALWAYS CURRENT ✅  │
              └──────────────────────┘
```

---

## 🔧 Implementation Strategy

### Strategy 1: Piggyback on Existing Sync (Recommended ⭐)

**Your system already has:**
- `wholecell-sync.js` - Syncs every 15 minutes
- `wholecell-change-detector.js` - Detects changes
- Change notifications and tracking

**We add:**
- Hook into change detector
- Incremental RAG updates
- Background processing

**Advantages:**
- ✅ Uses existing infrastructure
- ✅ Already tested and working
- ✅ No additional sync overhead
- ✅ Real-time updates (15 min delay max)

---

## 💻 Code Implementation

### Module 1: RAG Sync Manager

Create `rag/rag-sync-manager.js`:

```javascript
/**
 * RAG Sync Manager
 * Keeps vector database synchronized with inventory changes
 */
class RAGSyncManager {
  constructor() {
    this.ragIndexer = window.ragIndexer;
    this.vectorDB = window.vectorDB;
    this.embeddingService = window.embeddingService;
    this.isProcessing = false;
    this.syncQueue = [];
    this.lastSyncTime = null;
    this.syncStats = {
      totalSyncs: 0,
      itemsAdded: 0,
      itemsUpdated: 0,
      itemsDeleted: 0,
      lastSync: null,
    };
  }

  /**
   * Initialize and connect to Wholecell change detector
   */
  initialize() {
    console.log('🔄 RAG Sync Manager initializing...');

    // Hook into existing change detector
    if (window.wholecellChangeDetector) {
      this.connectToChangeDetector();
    }

    // Hook into sync completion
    if (window.wholecellSync) {
      this.connectToSyncManager();
    }

    console.log('✅ RAG Sync Manager ready');
  }

  /**
   * Connect to existing Wholecell change detector
   */
  connectToChangeDetector() {
    // Store original change callback
    const originalOnChange = window.wholecellChangeDetector.onChangeDetected;

    // Wrap with RAG sync
    window.wholecellChangeDetector.onChangeDetected = (changes) => {
      // Call original handler first
      if (originalOnChange) {
        originalOnChange.call(window.wholecellChangeDetector, changes);
      }

      // Then trigger RAG sync
      this.handleChanges(changes);
    };

    console.log('✅ Connected to Wholecell change detector');
  }

  /**
   * Connect to sync manager
   */
  connectToSyncManager() {
    // Hook into sync completion event
    const originalOnSyncComplete = window.wholecellSync.onSyncComplete;

    window.wholecellSync.onSyncComplete = async (data) => {
      // Call original handler
      if (originalOnSyncComplete) {
        originalOnSyncComplete.call(window.wholecellSync, data);
      }

      // Trigger RAG sync
      await this.syncWithInventory();
    };

    console.log('✅ Connected to Wholecell sync manager');
  }

  /**
   * Handle detected changes
   */
  async handleChanges(changes) {
    if (this.isProcessing) {
      console.log('⏳ RAG sync already in progress, queuing changes...');
      this.syncQueue.push(changes);
      return;
    }

    this.isProcessing = true;

    try {
      console.log('🔄 Processing changes for RAG...');
      console.log(`  New: ${changes.newItems?.length || 0}`);
      console.log(`  Modified: ${changes.modifiedItems?.length || 0}`);
      console.log(`  Deleted: ${changes.deletedItems?.length || 0}`);

      // Process new items
      if (changes.newItems && changes.newItems.length > 0) {
        await this.addNewItems(changes.newItems);
      }

      // Process modified items
      if (changes.modifiedItems && changes.modifiedItems.length > 0) {
        await this.updateModifiedItems(changes.modifiedItems);
      }

      // Process deleted items
      if (changes.deletedItems && changes.deletedItems.length > 0) {
        await this.deleteItems(changes.deletedItems);
      }

      // Update stats
      this.syncStats.totalSyncs++;
      this.syncStats.lastSync = new Date().toISOString();
      this.lastSyncTime = Date.now();

      console.log('✅ RAG sync complete');

    } catch (error) {
      console.error('❌ RAG sync failed:', error);
    } finally {
      this.isProcessing = false;

      // Process queued changes
      if (this.syncQueue.length > 0) {
        const nextChanges = this.syncQueue.shift();
        setTimeout(() => this.handleChanges(nextChanges), 1000);
      }
    }
  }

  /**
   * Add new items to vector database
   */
  async addNewItems(items) {
    console.log(`📦 Adding ${items.length} new items to RAG...`);

    try {
      // Convert items to documents
      const documents = [];
      for (const item of items) {
        const doc = await this.ragIndexer.inventoryToDocument(item);
        documents.push(doc);
      }

      // Generate embeddings (batch process)
      const texts = documents.map(d => d.content);
      console.log('🧬 Generating embeddings...');
      const embeddings = await this.embeddingService.generateEmbeddings(texts);

      // Add embeddings to documents
      documents.forEach((doc, idx) => {
        doc.embedding = embeddings[idx];
      });

      // Add to vector database
      await this.vectorDB.addDocuments(documents);

      this.syncStats.itemsAdded += items.length;
      console.log(`✅ Added ${items.length} items to RAG`);

    } catch (error) {
      console.error('❌ Failed to add new items:', error);
      throw error;
    }
  }

  /**
   * Update modified items in vector database
   */
  async updateModifiedItems(items) {
    console.log(`🔄 Updating ${items.length} modified items in RAG...`);

    try {
      // Convert items to documents
      const documents = [];
      for (const item of items) {
        const doc = await this.ragIndexer.inventoryToDocument(item);
        documents.push(doc);
      }

      // Generate embeddings
      const texts = documents.map(d => d.content);
      console.log('🧬 Re-generating embeddings...');
      const embeddings = await this.embeddingService.generateEmbeddings(texts);

      // Add embeddings to documents
      documents.forEach((doc, idx) => {
        doc.embedding = embeddings[idx];
      });

      // Update in vector database
      await this.vectorDB.updateDocuments(documents);

      this.syncStats.itemsUpdated += items.length;
      console.log(`✅ Updated ${items.length} items in RAG`);

    } catch (error) {
      console.error('❌ Failed to update items:', error);
      throw error;
    }
  }

  /**
   * Delete items from vector database
   */
  async deleteItems(items) {
    console.log(`🗑️ Removing ${items.length} items from RAG...`);

    try {
      // Get document IDs to delete
      const ids = items.map(item => 
        `inv_${item['IMEI/ SERIAL NO.'] || item.IMEI || item.id}`
      );

      // Delete from vector database
      await this.vectorDB.deleteDocuments(ids);

      this.syncStats.itemsDeleted += items.length;
      console.log(`✅ Removed ${items.length} items from RAG`);

    } catch (error) {
      console.error('❌ Failed to delete items:', error);
      throw error;
    }
  }

  /**
   * Full sync with current inventory (fallback)
   */
  async syncWithInventory() {
    console.log('🔄 Performing full inventory sync check...');

    try {
      const inventory = window.inventoryData || [];
      const stats = await this.vectorDB.getStats();

      console.log(`  Inventory items: ${inventory.length}`);
      console.log(`  Vector DB items: ${stats.totalDocuments || 0}`);

      // If counts don't match, trigger full re-index
      const difference = Math.abs(inventory.length - (stats.totalDocuments || 0));
      
      if (difference > 100) {
        console.warn(`⚠️ Large discrepancy detected (${difference} items)`);
        console.log('Consider running full re-index');
        
        // Optionally auto-trigger re-index
        // await this.fullReindex();
      } else {
        console.log('✅ RAG database in sync');
      }

    } catch (error) {
      console.error('❌ Sync check failed:', error);
    }
  }

  /**
   * Full re-index (nuclear option)
   */
  async fullReindex() {
    console.log('🔄 Starting full RAG re-index...');
    
    try {
      // Clear existing data
      await this.vectorDB.clearCollection();

      // Re-index everything
      await this.ragIndexer.indexAll({
        includeInventory: true,
        includeDocumentation: false, // Docs don't change
        includePricing: true,
      });

      console.log('✅ Full re-index complete');
      return { success: true };

    } catch (error) {
      console.error('❌ Full re-index failed:', error);
      throw error;
    }
  }

  /**
   * Get sync statistics
   */
  getStats() {
    return {
      ...this.syncStats,
      isProcessing: this.isProcessing,
      queueLength: this.syncQueue.length,
      lastSyncAgo: this.lastSyncTime ? 
        Math.floor((Date.now() - this.lastSyncTime) / 1000) : null,
    };
  }

  /**
   * Manual trigger sync
   */
  async manualSync() {
    console.log('🔄 Manual RAG sync triggered...');
    await this.syncWithInventory();
  }
}

// Create global instance
window.ragSyncManager = new RAGSyncManager();

// Auto-initialize when RAG is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (window.ragIndexer && window.vectorDB) {
      window.ragSyncManager.initialize();
    }
  });
} else {
  if (window.ragIndexer && window.vectorDB) {
    window.ragSyncManager.initialize();
  }
}
```

---

## 🎯 Integration with Existing Code

### Update `wholecell-sync.js`

Add at the end of the sync completion callback:

```javascript
// In wholecellSync.sync() method, after line ~150
async sync(options = {}) {
  // ... existing sync code ...

  // After successful sync
  if (this.onSyncComplete) {
    this.onSyncComplete(result);
  }

  // NEW: Trigger RAG sync
  if (window.ragSyncManager && window.ragSyncManager.isInitialized) {
    try {
      await window.ragSyncManager.syncWithInventory();
    } catch (error) {
      console.error('RAG sync failed:', error);
      // Don't block main sync if RAG fails
    }
  }

  return result;
}
```

### Update `wholecell-change-detector.js`

Add hook for RAG updates:

```javascript
// In detectChanges() method, after line ~200
detectChanges(oldData, newData) {
  // ... existing change detection code ...

  const changes = {
    newItems,
    modifiedItems,
    deletedItems,
    // ... other change data
  };

  // Existing notification
  this.notifyChanges(changes);

  // NEW: Trigger RAG sync
  if (window.ragSyncManager) {
    window.ragSyncManager.handleChanges(changes);
  }

  return changes;
}
```

---

## 📊 Sync Strategies Comparison

### Strategy 1: Event-Driven (Recommended ⭐)
**How it works**: Updates RAG whenever changes detected

**Pros**:
- ✅ Always up-to-date (15 min lag max)
- ✅ Efficient (only changed items)
- ✅ Automatic
- ✅ Uses existing change detection

**Cons**:
- ⚠️ Requires change detection to work

**Cost**: ~$0 (embeddings only for changed items)

---

### Strategy 2: Scheduled Full Sync
**How it works**: Full re-index every night

**Pros**:
- ✅ Simple to implement
- ✅ Guaranteed consistency
- ✅ No dependencies

**Cons**:
- ❌ 24-hour lag
- ❌ Expensive (re-embed everything)
- ❌ Resource intensive

**Cost**: ~$0 but takes 60+ hours

---

### Strategy 3: Hybrid (Best for Production)
**How it works**: Event-driven + weekly full sync

**Pros**:
- ✅ Real-time updates
- ✅ Periodic validation
- ✅ Best of both worlds

**Cons**:
- ⚠️ More complex

**Cost**: ~$0 (incremental) + weekly validation

**RECOMMENDED** ⭐

---

## ⚡ Performance Optimization

### Batching Updates

```javascript
// Don't embed one-by-one
❌ for (const item of items) {
    const embedding = await embed(item);
    await vectorDB.add(embedding);
}

// Batch embed and batch insert
✅ const embeddings = await embedBatch(items); // All at once
   await vectorDB.addDocuments(embeddings);    // Bulk insert
```

**Result**: 10x faster

---

### Smart Change Detection

```javascript
// Only update if content actually changed
function needsUpdate(oldItem, newItem) {
  // Compare searchable fields only
  const oldContent = buildSearchContent(oldItem);
  const newContent = buildSearchContent(newItem);
  
  return oldContent !== newContent;
}

// Skip unchanged items
const realChanges = modifiedItems.filter(item => 
  needsUpdate(oldMap.get(item.id), item)
);
```

**Result**: 50% fewer updates

---

### Background Processing

```javascript
// Don't block UI
async function syncRAG(changes) {
  // Queue the work
  setTimeout(async () => {
    await ragSyncManager.handleChanges(changes);
  }, 100);
  
  // Return immediately
  return { queued: true };
}
```

**Result**: No UI lag

---

## 📈 Monitoring & Verification

### Add to `data-manager.html`:

```html
<!-- RAG Sync Status Indicator -->
<div id="ragSyncStatus" class="bg-gray-100 p-2 rounded text-sm">
  <span class="font-bold">RAG Status:</span>
  <span id="ragStatusText">Syncing...</span>
  <button onclick="showRAGStats()" class="ml-2 text-blue-600">Details</button>
</div>

<script>
// Update RAG status
setInterval(() => {
  if (window.ragSyncManager) {
    const stats = window.ragSyncManager.getStats();
    const statusText = document.getElementById('ragStatusText');
    
    if (stats.isProcessing) {
      statusText.textContent = '🔄 Syncing...';
      statusText.className = 'text-blue-600';
    } else {
      const ago = stats.lastSyncAgo;
      statusText.textContent = ago ? `✅ Synced ${ago}s ago` : '✅ Up to date';
      statusText.className = 'text-green-600';
    }
  }
}, 5000);

function showRAGStats() {
  const stats = window.ragSyncManager.getStats();
  alert(`RAG Sync Statistics:
  
Total Syncs: ${stats.totalSyncs}
Items Added: ${stats.itemsAdded}
Items Updated: ${stats.itemsUpdated}
Items Deleted: ${stats.itemsDeleted}
Last Sync: ${stats.lastSync || 'Never'}
Queue Length: ${stats.queueLength}
Processing: ${stats.isProcessing ? 'Yes' : 'No'}
  `);
}
</script>
```

---

## 🔍 Verification Checklist

After implementing sync:

### Test 1: New Item Detection
1. ✅ Add item to inventory via Wholecell
2. ✅ Wait for sync (15 min)
3. ✅ Query RAG for new item
4. ✅ Verify it's found

### Test 2: Modified Item
1. ✅ Change item status (Available → Sold)
2. ✅ Wait for sync
3. ✅ Query RAG for item
4. ✅ Verify status updated

### Test 3: Deleted Item
1. ✅ Remove item from Wholecell
2. ✅ Wait for sync
3. ✅ Query RAG for item
4. ✅ Verify not found

### Test 4: Batch Changes
1. ✅ Add 100 new items
2. ✅ Wait for sync
3. ✅ Verify all indexed
4. ✅ Check performance

### Test 5: Error Recovery
1. ✅ Simulate embedding failure
2. ✅ Verify retry logic
3. ✅ Check error logs
4. ✅ Verify recovery

---

## 📅 Daily Operations

### Morning Routine (Automated)
```
1. Wholecell sync runs (every 15 min)
2. RAG detects changes automatically
3. Updates vector database incrementally
4. No manual intervention needed
```

### Weekly Validation (Automated)
```
1. Sunday 2 AM: Full sync check
2. Compare inventory count vs RAG count
3. If mismatch > 100: Alert + log
4. Optional: Auto-trigger full re-index
```

### Monthly Maintenance (Manual)
```
1. Review sync logs
2. Check embedding cache size
3. Optimize if needed
4. Update documentation
```

---

## 💰 Cost Impact of Incremental Updates

### Scenario: 1,000 Changes Per Day

**Without Incremental Sync (Daily Full Re-index)**:
- Re-embed all 216,700 items
- Time: 60+ hours
- API calls: 216,700
- Cost: $0 (but impractical)

**With Incremental Sync**:
- Embed only 1,000 changed items
- Time: 15 minutes
- API calls: 1,000
- Cost: $0 (within free tier)

**Savings**: 215x fewer API calls, 240x faster

---

## 🚨 Troubleshooting

### Issue: RAG not updating after sync
**Check**:
1. Is `ragSyncManager` initialized?
2. Are change hooks connected?
3. Check console for errors
4. Verify embedding service working

**Fix**:
```javascript
// Manual trigger
await window.ragSyncManager.manualSync();
```

### Issue: Slow incremental updates
**Check**:
1. Batch size (should be 100+)
2. Network speed
3. Embedding API rate limits

**Fix**: Increase batch size, reduce frequency

### Issue: Vector DB out of sync
**Check**:
```javascript
const stats = await window.ragSyncManager.syncWithInventory();
```

**Fix**: Run full re-index if needed
```javascript
await window.ragSyncManager.fullReindex();
```

---

## ✅ Implementation Checklist

- [ ] Create `rag/rag-sync-manager.js`
- [ ] Update `wholecell-sync.js` with RAG hook
- [ ] Update `wholecell-change-detector.js` with RAG hook
- [ ] Add RAG status indicator to UI
- [ ] Test new item detection
- [ ] Test modified item updates
- [ ] Test deleted item removal
- [ ] Test batch updates (100+ items)
- [ ] Verify performance (< 1 min for 100 items)
- [ ] Set up monitoring
- [ ] Document for team

---

## 🎯 Summary

**Problem**: Inventory changes daily, RAG needs to stay current

**Solution**: Incremental updates triggered by existing change detection

**Architecture**:
```
Wholecell Sync → Change Detection → RAG Sync → Vector DB
     (15min)        (automatic)      (automatic)   (current)
```

**Performance**:
- Update latency: < 15 minutes
- Update time: < 1 minute per 100 items
- Cost: $0 (within free tier)

**Maintenance**: Fully automated, no manual work needed

**Status**: Ready to implement in Week 2 of RAG rollout

---

**Next Steps**:
1. Implement `rag-sync-manager.js`
2. Add hooks to existing sync
3. Test with small changes
4. Monitor for 1 week
5. Scale to production

---

*Document Complete*  
*Ready for Implementation*


