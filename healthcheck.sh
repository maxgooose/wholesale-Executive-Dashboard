#!/bin/bash
# Wholecell Proxy Health Check Script
# =====================================
# Quick health check for the proxy server

PORT=${PORT:-5001}
URL="http://localhost:$PORT/api/health"

echo "🏥 Wholecell Proxy Health Check"
echo "================================"
echo "URL: $URL"
echo ""

# Check if server is responding
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" $URL 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)

if [ "$HTTP_CODE" == "200" ]; then
    echo "✅ Status: HEALTHY"
    echo ""
    echo "Response:"
    echo "$RESPONSE" | grep -v "HTTP_CODE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
    exit 0
else
    echo "❌ Status: UNHEALTHY"
    echo "HTTP Code: $HTTP_CODE"
    echo ""
    
    # Check if process is running
    if pgrep -f "wholecell-proxy.py" > /dev/null; then
        echo "⚠️  Process is running but not responding"
        echo "Suggestion: Restart the proxy server"
    else
        echo "❌ Process is not running"
        echo "Suggestion: Start the proxy server with:"
        echo "  PORT=5001 python3 wholecell-proxy.py"
    fi
    
    exit 1
fi

