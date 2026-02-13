# Wholecell API Integration - Documentation

**Status**: Phase 1 - API Exploration Complete ✅

---

## What We Know from VBA Code Analysis

From `WholeCellModule.bas`, we've identified:

### API Endpoint
```
https://api.wholecell.io/api/v1/inventories?esn={IMEI}
```

### Authentication
- Method: HTTP Basic Authentication
- Header: `Authorization: Basic {base64(APP_ID:APP_SECRET)}`
- Additional Header: `X-App-Id: {APP_ID}`

### Request Method
- GET request with `esn` query parameter
- Example: `?esn=H95DHMF9Q1GC`

### Known Test IMEIs (from VBA)
```
H95DHMF9Q1GC
F9FG5XAJQ1GC
F9GG5BXXQ1GC
```

---

## Expected Response Structure

Based on VBA parsing logic:

```json
{
  "esn": "H95DHMF9Q1GC",
  "total_price_paid": 15000,  // in cents ($150.00)
  "product": {
    "manufacturer": "Apple",
    "model": "iPhone 13 Pro",
    "capacity": "256GB",
    "color": "Sierra Blue"
  },
  "product_variation": {
    "grade": "A"
  }
}
```

Or possibly an array:
```json
[
  {
    "esn": "...",
    "product": {...},
    ...
  }
]
```

---

## Data Mapping: Wholecell → Our Format

| Wholecell Field | Our Field | Transformation |
|----------------|-----------|----------------|
| `esn` | `IMEI/ SERIAL NO.` | Direct copy |
| `product.manufacturer` + `product.model` + `product.capacity` + `product.color` | `MODEL` | Concatenate (excluding manufacturer per VBA) |
| `product.capacity` | `STORAGE` | Direct copy (e.g., "256GB") |
| `product.color` | `COLOR` | Direct copy |
| `product_variation.grade` | `GRADE` | Direct copy |
| `total_price_paid / 100` | *(cost field)* | Convert cents to dollars |
| *(not in Wholecell)* | `STATUS` | Default: "AVAILABLE" |
| *(not in Wholecell)* | `BATCH` | Generate: "WHOLECELL_SYNC_{date}" |
| *(not in Wholecell)* | `BATTERY HEALTH` | Default: null or "UNKNOWN" |

---

## Critical Questions to Answer

### ❓ Question 1: List All Inventory
**Unknown**: Does Wholecell have an endpoint to list ALL inventory?

**VBA Observation**: Code only shows individual IMEI queries (`?esn={value}`)

**Options**:
1. ✅ API supports querying without `esn` parameter → returns all
2. ❌ API requires `esn` parameter → we need a registry of IMEIs
3. ❓ API has different endpoint (e.g., `/api/v1/inventories/list`)

**Test**: Call `/api/inventory` without parameters and see what happens

---

### ❓ Question 2: Response Format
**Unknown**: Is the response a single object or an array?

**Possibilities**:
1. Single object when querying by ESN
2. Array of objects when querying by ESN (if multiple matches)
3. Array of all objects when querying without ESN

**Test**: Query known IMEIs and log full response

---

### ❓ Question 3: Additional Fields
**Unknown**: What other fields does Wholecell provide that we're not using?

**VBA extracts only**:
- esn
- product (manufacturer, model, capacity, color)
- product_variation (grade)
- total_price_paid

**Possible additional fields**:
- timestamps
- status/availability
- warehouse location
- purchase date
- condition notes
- etc.

**Test**: Log full response and document all available fields

---

## Testing Strategy - Phase 1

### Test 1: Connection Verification
```bash
curl http://localhost:5000/api/health
```
Expected: `{"status": "healthy"}`

---

### Test 2: Known IMEIs Test
```bash
curl http://localhost:5000/api/test/known-imeis
```
Expected: Response showing which IMEIs were found in Wholecell

---

### Test 3: Individual ESN Query
```bash
curl http://localhost:5000/api/test/H95DHMF9Q1GC
```
Expected: Full JSON response with structure analysis

---

### Test 4: Bulk Inventory Query (Exploratory)
```bash
curl http://localhost:5000/api/inventory
```
Expected: Either full inventory list OR error indicating ESN required

---

## Next Steps After Testing

### If Wholecell supports "list all":
1. ✅ Use `/api/inventory` endpoint
2. Transform entire response at once
3. Simple implementation

### If Wholecell requires individual queries:
1. Need to maintain IMEI registry
2. Implement parallel fetching for performance
3. Cache results to minimize API calls
4. More complex implementation

---

## Security Notes

✅ **Credentials stored in**:
- Environment variables (preferred)
- `.env` file (not committed to git)
- Never exposed to browser

✅ **Backend proxy protects**:
- API credentials
- Rate limiting
- Request logging
- Error handling

---

## Setup Instructions

### 1. Install Python Dependencies
```bash
cd /Users/hamza/Desktop/data
pip install -r requirements.txt
```

### 2. Configure Environment (Optional)
```bash
# Copy example env file
cp .env.example .env

# Edit .env if you want to change any settings
# (Not necessary - defaults from VBA code are already set)
```

### 3. Start Proxy Server
```bash
python wholecell-proxy.py
```

Server will start on `http://localhost:5000`

### 4. Test Connection
```bash
# Check server health
curl http://localhost:5000/api/health

# Test known IMEIs
curl http://localhost:5000/api/test/known-imeis

# Test specific IMEI with detailed logging
curl http://localhost:5000/api/test/H95DHMF9Q1GC
```

---

## API Endpoints Created

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | API status and available endpoints |
| `/api/health` | GET | Health check |
| `/api/inventory` | GET | Fetch all inventory (exploratory) |
| `/api/inventory/<esn>` | GET | Fetch specific item by IMEI/ESN |
| `/api/test/<esn>` | GET | Test endpoint with detailed logging |
| `/api/test/known-imeis` | GET | Test all known IMEIs from VBA |
| `/api/config` | GET | Show configuration status |

---

## Troubleshooting

### Problem: "Connection error" or timeout
**Solution**: Check internet connection, verify Wholecell API is reachable

### Problem: "Authentication failed"
**Solution**: Verify APP_ID and APP_SECRET are correct in environment

### Problem: Port 5000 already in use
**Solution**: Change port with `PORT=5001 python wholecell-proxy.py`

### Problem: CORS errors in browser
**Solution**: Proxy has CORS enabled by default, check browser console for details

---

## Logging

Server logs all requests to console:
- Request URLs
- Response status codes
- Response sizes
- Errors and warnings

Check server terminal for detailed logs during testing.

---

## Files Created in Phase 1

1. ✅ `wholecell-proxy.py` - Backend proxy server
2. ✅ `requirements.txt` - Python dependencies
3. ✅ `.env.example` - Environment variable template
4. ✅ `WHOLECELL_API_DOCUMENTATION.md` - This file

---

## Ready for Phase 2

After testing Phase 1, we'll have answers to:
- ✅ Can we authenticate successfully?
- ✅ What does the actual response structure look like?
- ✅ Can we query individual items?
- ✅ Is there a "list all" endpoint?
- ✅ What additional fields are available?

Then we can proceed with confidence to Phase 2: Data Fetching Strategy

---

**Last Updated**: Phase 1 Implementation Complete
**Status**: Ready for Testing 🚀

