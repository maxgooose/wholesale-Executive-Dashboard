# 🚀 Wholecell API - Quick Start

## Start Server (One Command)
```bash
cd /Users/hamza/Desktop/data
./setup-wholecell.sh
```

## Run Tests
Open a **new terminal** and run:

```bash
# Test 1: Server running?
curl http://localhost:5000/

# Test 2: Can we connect to Wholecell? (CRITICAL TEST)
curl http://localhost:5000/api/test/known-imeis

# Test 3: Can we list all inventory?
curl http://localhost:5000/api/inventory

# Test 4: Check a specific IMEI (replace with your IMEI)
curl http://localhost:5000/api/inventory/YOUR_IMEI_HERE
```

## What to Look For

✅ **Success**: Test 2 shows `"successful": 3`  
❌ **Failed**: Test 2 shows errors or `"successful": 0`

## Next Steps

After tests work:
1. Share results with me
2. I'll build Phase 2 (data transformation)
3. Connect to your existing dashboard

## Need Help?
See `PHASE1_TESTING_GUIDE.md` for detailed instructions.

