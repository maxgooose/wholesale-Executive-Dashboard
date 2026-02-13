# Phase 1 Testing Guide - Wholecell API Integration

## 🎯 Goal
Test the backend proxy and explore the Wholecell API to understand its structure.

---

## ⚡ Quick Start

### Option 1: Using Setup Script (Easiest)
```bash
cd /Users/hamza/Desktop/data
chmod +x setup-wholecell.sh
./setup-wholecell.sh
```

### Option 2: Manual Setup
```bash
cd /Users/hamza/Desktop/data

# Install dependencies
pip3 install -r requirements.txt

# Start server
python3 wholecell-proxy.py
```

The server will start on **http://localhost:5000**

---

## 🧪 Test Sequence

### Test 1: Verify Server is Running ✅
```bash
curl http://localhost:5000/
```

**Expected Output:**
```json
{
  "status": "running",
  "service": "Wholecell API Proxy",
  "version": "1.0.0",
  "endpoints": [...]
}
```

---

### Test 2: Health Check ✅
```bash
curl http://localhost:5000/api/health
```

**Expected Output:**
```json
{
  "status": "healthy",
  "timestamp": "2024-11-13T...",
  "api_configured": true
}
```

---

### Test 3: Check Configuration ✅
```bash
curl http://localhost:5000/api/config
```

**Expected Output:**
```json
{
  "api_base": "https://api.wholecell.io/api/v1/inventories",
  "app_id_configured": true,
  "app_secret_configured": true
}
```

---

### Test 4: Test Known IMEIs (CRITICAL) 🔥
This is the most important test - it will tell us if we can actually connect to Wholecell.

```bash
curl http://localhost:5000/api/test/known-imeis
```

**What to look for:**
- `"successful": 3` means all 3 test IMEIs were found ✅
- `"successful": 0` means connection issues ❌
- Check the `results` array for each IMEI's data

**Expected Output:**
```json
{
  "total_tested": 3,
  "successful": 3,
  "failed": 0,
  "results": [
    {
      "imei": "H95DHMF9Q1GC",
      "success": true,
      "found": true,
      "data": {...},
      "extracted": {
        "esn": "H95DHMF9Q1GC",
        "model": "iPhone 13 Pro",
        "grade": "A",
        "total_price_paid": 15000
      }
    },
    ...
  ]
}
```

---

### Test 5: Test Individual IMEI with Detailed Logging 🔍
```bash
curl http://localhost:5000/api/test/H95DHMF9Q1GC
```

**Important**: Check both:
1. The curl response (JSON)
2. The server terminal output (full response logged)

This will show us the **complete structure** of what Wholecell returns.

---

### Test 6: Try to Fetch All Inventory (Exploratory) 🤔
```bash
curl http://localhost:5000/api/inventory
```

**Possible outcomes:**
1. ✅ Returns array of all inventory → We can use this!
2. ❌ Returns error "ESN required" → Need different strategy
3. ❌ Returns empty array → No inventory or auth issue

---

### Test 7: Query Specific IMEI from Your Data 📱
Pick an IMEI from your `combined_details.json` and test it:

```bash
curl http://localhost:5000/api/inventory/13426006140547
```

Replace `13426006140547` with an actual IMEI from your data.

**This tells us**: Do your existing IMEIs exist in Wholecell?

---

## 📊 What We're Learning

### From Test Results, We'll Know:

1. **Authentication Works?**
   - ✅ Yes: Tests return data
   - ❌ No: Tests return 401 errors

2. **Response Structure**
   - Is it an object or array?
   - What fields are available?
   - How is data nested?

3. **Can We Get All Inventory?**
   - ✅ Yes: `/api/inventory` returns everything
   - ❌ No: Need to query individual IMEIs

4. **Do Our IMEIs Exist in Wholecell?**
   - Test some from `combined_details.json`
   - See if they're found

5. **What Additional Data is Available?**
   - Timestamps?
   - Location?
   - Status?
   - Pricing history?

---

## 🐛 Troubleshooting

### Problem: Cannot connect to server
```bash
# Check if Python is installed
python3 --version

# Check if dependencies are installed
pip3 list | grep Flask
```

### Problem: Port 5000 already in use
```bash
# Use different port
PORT=5001 python3 wholecell-proxy.py

# Then use http://localhost:5001 in tests
```

### Problem: Module not found errors
```bash
# Install dependencies again
pip3 install -r requirements.txt
```

### Problem: All IMEIs return "Not found"
Possible reasons:
1. Credentials are wrong
2. IMEIs don't exist in Wholecell
3. Wholecell API changed
4. Network/firewall blocking request

Check server logs for error messages.

---

## 📝 Document Your Findings

After running tests, note:

### Question 1: Can we authenticate successfully?
- [ ] Yes, all tests work
- [ ] No, getting 401 errors
- [ ] Partial - some work, some don't

### Question 2: Response structure when querying by ESN?
- [ ] Single object
- [ ] Array with one object
- [ ] Array with multiple objects
- [ ] Other: ___________

### Question 3: Can we list all inventory?
- [ ] Yes, `/api/inventory` returns all
- [ ] No, requires ESN parameter
- [ ] Unknown - need to investigate more

### Question 4: Fields available in Wholecell response?
List all fields you see: ___________

### Question 5: Do our existing IMEIs exist in Wholecell?
- [ ] Yes, all found
- [ ] Some found, some missing
- [ ] None found
- [ ] Haven't tested yet

---

## ✅ Phase 1 Success Criteria

Phase 1 is complete when you can answer:

1. ✅ Backend proxy connects to Wholecell
2. ✅ We can authenticate successfully
3. ✅ We understand the response structure
4. ✅ We know if "list all" is possible
5. ✅ We've documented all available fields

---

## 🎬 Next Steps

After Phase 1 testing:

1. **Review findings** in `WHOLECELL_API_DOCUMENTATION.md`
2. **Update documentation** with actual response structure
3. **Decide on fetching strategy** (list all vs individual queries)
4. **Move to Phase 2**: Implement data fetching in frontend

---

## 💡 Tips

- Keep the server running in one terminal
- Run curl tests in another terminal
- Watch server logs for detailed information
- Copy/paste response examples for documentation
- Take screenshots of successful tests

---

## 🆘 Need Help?

If tests fail:
1. Check server terminal for error messages
2. Verify credentials are correct
3. Test Wholecell API directly in browser/Postman
4. Check if Wholecell API documentation has changed
5. Contact Wholecell support if needed

---

**Ready to test?** Start with Test 1 and work your way through! 🚀

