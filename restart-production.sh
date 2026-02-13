#!/bin/bash
# Restart Wholecell System
# ========================

echo "🔄 Restarting Wholecell System"
echo "=============================="
echo ""

# Stop first
./stop-production.sh

echo ""
echo "⏳ Waiting 2 seconds..."
sleep 2
echo ""

# Start again
./start-production.sh

