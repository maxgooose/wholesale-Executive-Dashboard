#!/bin/bash

# ⚡ Quick Start Script - Avoid 18 Minute Wait
# ==============================================

echo "⚡ Quick Start - Data Loading Helper"
echo "====================================="
echo ""

# Navigate to script directory
cd "$(dirname "$0")"

# 1. Start proxy if not running
echo "1️⃣  Checking proxy server..."
if bash status.sh | grep -q "Not running"; then
    echo "   Starting proxy server..."
    bash start-production.sh
    sleep 2
else
    echo "   ✅ Proxy already running"
fi

# 2. Check if cache exists
echo ""
echo "2️⃣  Checking for cached data..."
echo "   Opening Quick Load Helper..."
echo ""

# 3. Open helper tool
open quick-load-helper.html

echo ""
echo "✅ Done!"
echo ""
echo "📝 What's Next:"
echo "   • Quick Helper tool opened - follow recommendations"
echo "   • If you have cache: Loads in < 1 second ⚡"
echo "   • If no cache: First load takes 18 min (one-time)"
echo "   • After first load: Always instant!"
echo ""
echo "📖 Need help? Read: AVOID_18MIN_WAIT_GUIDE.md"
echo ""

