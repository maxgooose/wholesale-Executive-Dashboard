# Data Loading Flow - Quick Reference

## Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     PAGE LOAD (DOMContentLoaded)             │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │  loadInventoryData() │
                  └──────────┬───────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │ Check: window.__PRELOADED__? │
              └──────┬───────────────┬───────┘
                     │ YES           │ NO
                     ▼               ▼
          ┌─────────────────┐  ┌──────────────────┐
          │ Use Preloaded   │  │ loadFromWholecell│
          │ (instant load)  │  └────────┬─────────┘
          └────────┬────────┘           │
                   │                    ▼
                   │         ┌──────────────────────┐
                   │         │ Health Check Proxy   │
                   │         └─────┬──────────┬─────┘
                   │               │ OK       │ FAIL
                   │               ▼          ▼
                   │      ┌──────────────┐  ┌──────────────────┐
                   │      │ Check Cache  │  │ Show Error       │
                   │      └──┬──────┬────┘  │ - Error details  │
                   │         │FOUND │MISS   │ - Troubleshoot   │
                   │         ▼      ▼       │ - Retry button   │
                   │    ┌────────┐ ┌────────▼─────────────────┐
                   │    │Use Cache│ │ Load All Pages (18 min) │
                   │    └───┬────┘ └────────┬─────────────────┘
                   │        │               │
                   │        └───────┬───────┘
                   │                ▼
                   │    ┌───────────────────────┐
                   │    │ Transform Data        │
                   │    │ - Normalize fields    │
                   │    │ - Validate structure  │
                   │    └───────────┬───────────┘
                   │                │
                   └────────────────┼────────────────┐
                                    ▼                │
                          ┌─────────────────────┐   │
                          │ hydrateInventoryData│◄──┘
                          └──────────┬──────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │ Update UI            │
                          │ - Categorize by room │
                          │ - Update counts      │
                          │ - Render tables      │
                          │ - Hide loading       │
                          └──────────────────────┘
```

---

## Simple Decision Tree

**Q: Is there preloaded data?**
- ✅ YES → Use it (fastest)
- ❌ NO → Continue to Wholecell check

**Q: Is Wholecell proxy healthy?**
- ✅ YES → Continue to cache check
- ❌ NO → Show error, stop

**Q: Is there valid cache?**
- ✅ YES → Use cache (~5 seconds)
- ❌ NO → Full load (~18 minutes)

**Q: Did data load successfully?**
- ✅ YES → Transform and display
- ❌ NO → Show error with retry

---

## What Happens at Each Stage

### 1. Preloaded Data Check (Optional)
```javascript
window.__PRELOADED_INVENTORY__
```
- **Time**: Instant
- **Source**: Embedded in HTML
- **When used**: For optimization when data pre-embedded
- **Fallback**: Proceeds to Wholecell if not found

### 2. Health Check (Required)
```javascript
await window.wholecellAPI.checkHealth()
```
- **Time**: <1 second
- **Tests**: Proxy server reachability
- **Success**: Continues to cache check
- **Failure**: Shows connection error

### 3. Cache Check (Automatic)
```javascript
await window.wholecellCache.getCacheStats()
```
- **Time**: <1 second
- **Checks**: LocalStorage for recent data
- **Found**: Shows age, item count
- **Not found**: Warns about 18-minute load

### 4. Smart Load (Cache-aware)
```javascript
await window.wholecellCache.smartLoad(window.wholecellAPI, progressCallback)
```
- **With cache**: ~5 seconds
- **Without cache**: ~18 minutes (2,167 pages @ 2/sec)
- **Shows**: Real-time progress, elapsed time, remaining time

### 5. Data Transformation (Always)
```javascript
WholecellTransformer.transformAll(wholecellData)
```
- **Time**: 2-3 seconds
- **Does**: Normalizes Wholecell format to internal format
- **Validates**: Field structure, data types
- **Returns**: Statistics on transformation

### 6. Data Hydration (Always)
```javascript
hydrateInventoryData(transformedData)
```
- **Time**: <1 second
- **Does**: 
  - Validates array structure
  - Normalizes field names
  - Sets defaults for missing fields
  - Updates global inventory
  - Triggers UI updates

### 7. UI Update (Always)
- Categorizes items by room status
- Updates room counts
- Renders summary tables
- Hides loading indicators
- Shows success notification

---

## Data Validation Rules

All data passes through validation in `hydrateInventoryData()`:

| Field | Source Fields | Default | Type |
|-------|---------------|---------|------|
| IMEI/SERIAL NO. | `['IMEI/ SERIAL NO.']`, `IMEI`, `imei` | `''` | String |
| STATUS | `STATUS`, `status` | `''` | String (trimmed) |
| lastUpdated | `lastUpdated` | Current timestamp | ISO String |
| qcNotes | `qcNotes` | `''` | String |
| updateHistory | `updateHistory` | `[]` | Array |

**Safety Features:**
- Null coalescing for missing fields
- Type coercion to prevent type errors
- Trimming to remove whitespace
- Default values for required structures

---

## Error Messages & Meanings

### "Unable to Connect to Wholecell API"
**Cause**: Health check failed
**Meaning**: Proxy server not responding
**Action**: 
1. Check if proxy is running: `./status.sh`
2. Verify port 5050 is accessible
3. Check network connectivity

### "Wholecell proxy server is not reachable"
**Cause**: Network request failed during health check
**Meaning**: Cannot communicate with proxy
**Action**:
1. Start proxy: `./start-production.sh`
2. Check firewall settings
3. Verify localhost/5050 is not blocked

### "Inventory data must be an array"
**Cause**: Hydration received non-array data
**Meaning**: Data structure corruption
**Action**:
1. Check API response format
2. Verify transformation logic
3. Review recent API changes

### "Transform validation failed"
**Cause**: Wholecell data doesn't match expected format
**Meaning**: API version mismatch or corrupt data
**Action**:
1. Check Wholecell API version
2. Review transformation logs
3. Verify API credentials

---

## Performance Metrics

### First Load (No Cache)
| Step | Time | Bottleneck |
|------|------|------------|
| Health check | 0.5s | Network latency |
| Cache check | 0.2s | LocalStorage read |
| API load | ~18 min | **Rate limiting (2 req/sec)** |
| Transform | 2-3s | CPU processing |
| Hydrate | 0.5s | JavaScript execution |
| UI update | 0.5s | DOM manipulation |
| **TOTAL** | **~18 min** | API rate limits |

### Subsequent Loads (With Cache)
| Step | Time | Bottleneck |
|------|------|------------|
| Health check | 0.5s | Network latency |
| Cache check | 0.2s | LocalStorage read |
| Cache load | 1-2s | LocalStorage read (large data) |
| Transform | 2-3s | CPU processing |
| Hydrate | 0.5s | JavaScript execution |
| UI update | 0.5s | DOM manipulation |
| **TOTAL** | **~5-7s** | Transform processing |

### With Preloaded Data
| Step | Time | Bottleneck |
|------|------|------------|
| Preload check | 0.1s | Memory access |
| Hydrate | 0.5s | JavaScript execution |
| UI update | 0.5s | DOM manipulation |
| **TOTAL** | **~1s** | UI rendering |

**Key Takeaway**: Caching reduces load time by **~200x** (18 min → 5 sec)

---

## Cache Strategy Details

### Cache Storage
- **Location**: Browser LocalStorage
- **Key**: `wholecell_cache`
- **Max size**: ~5-10 MB (browser dependent)
- **Persistence**: Until cleared or expired

### Cache Validation
- **Age check**: Shows hours since last cache
- **Integrity check**: Validates JSON structure
- **Item count**: Shows number of cached items
- **Auto-clear**: Removes corrupt cache automatically

### Cache Lifecycle
```
Load → Check Age → Use if Recent → Display Age
                 ↓
              Too Old or Missing
                 ↓
           Full API Load → Save to Cache → Use
```

### Cache Invalidation
**Automatic:**
- On data corruption
- On transformation failure
- On version mismatch

**Manual:**
- Clear browser data
- Developer tools → LocalStorage → Delete key

---

## Retry Strategy

### Current Behavior
- Single attempt to load
- Manual retry via button on error
- No automatic retries

### User Actions on Failure
1. **Check Prerequisites**
   - Proxy status
   - Network connection
   - API credentials

2. **Fix Issues**
   - Start proxy if down
   - Reconnect network
   - Update credentials

3. **Retry**
   - Click "Retry Connection" button
   - Or refresh page (F5)

---

## Data Source Transparency

### Always Know Your Source

**Indicator**: Batch Info Banner
```
📦 [X] items across [Y] models
   Uploaded [time] ago
```

**Source Indicators:**
- `Just now` - Fresh from API
- `5 minutes ago` - Recent cache
- `2 hours ago` - Older cache
- Specific date - Very old cache

### Batch Metadata
Stored in LocalStorage as `lastBatchInfo`:
```json
{
  "timestamp": "2024-11-13T10:30:00.000Z",
  "itemCount": 2167,
  "strategy": "wholecell_cached"
}
```

**Strategies:**
- `wholecell_cached` - Loaded from Wholecell with cache
- `preloaded` - Used embedded preloaded data
- `loaded` - Generic load completion

---

## Troubleshooting Checklist

### Before Starting
- [ ] Proxy server running (`./status.sh`)
- [ ] Network connection active
- [ ] Browser LocalStorage enabled
- [ ] API credentials configured

### First Load Taking Long?
- [ ] Expected: 18 minutes on first load
- [ ] Check progress indicator
- [ ] Verify rate limiting (2 req/sec)
- [ ] Don't interrupt - will need to restart

### Subsequent Loads Slow?
- [ ] Check cache status in console
- [ ] Look for cache invalidation messages
- [ ] Verify LocalStorage not full
- [ ] Try clearing old cache manually

### Data Looks Wrong?
- [ ] Check batch timestamp
- [ ] Verify data source (Wholecell vs cache)
- [ ] Compare with Wholecell directly
- [ ] Clear cache and reload

### Error Won't Go Away?
- [ ] Read full error message
- [ ] Check browser console for details
- [ ] Verify proxy logs
- [ ] Test health endpoint manually
- [ ] Contact support with error details

---

## Summary: Safe & Logical ✅

### What Makes It Safe
1. **Single data source** - No conflicts
2. **Health checks** - Fail fast if issues
3. **Data validation** - Every field checked
4. **Error visibility** - Never silently fails
5. **User control** - Manual retry available

### What Makes It Logical
1. **Performance optimization** - Check cache first
2. **Progressive enhancement** - Use preload if available
3. **Clear fallbacks** - Each step has defined outcome
4. **Transparent operation** - User sees what's happening
5. **Predictable behavior** - Same flow every time

### What's Been Removed
- ❌ Multiple data sources
- ❌ Silent fallbacks
- ❌ Fake data generation
- ❌ Unvalidated file uploads
- ❌ Hidden complexity

### What Remains
- ✅ Wholecell API (primary source)
- ✅ Smart caching (performance)
- ✅ Data validation (safety)
- ✅ Error handling (reliability)
- ✅ User feedback (transparency)

**Result**: Clean, maintainable, trustworthy data loading. 🎯

