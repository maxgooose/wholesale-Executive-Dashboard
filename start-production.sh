#!/bin/bash
# Start Wholecell System in Production Mode
# ==========================================

set -e

echo "🚀 Starting Wholecell Integration (Production Mode)"
echo "===================================================="
echo ""

# Configuration
PORT=${PORT:-5001}
LOG_DIR="logs"
PID_FILE="$LOG_DIR/proxy.pid"

# Create log directory
mkdir -p $LOG_DIR

# Check if already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat $PID_FILE)
    if ps -p $PID > /dev/null 2>&1; then
        echo "⚠️  Proxy server is already running (PID: $PID)"
        echo ""
        echo "Options:"
        echo "  1. Stop: ./stop-production.sh"
        echo "  2. Restart: ./restart-production.sh"
        echo "  3. Status: ./healthcheck.sh"
        exit 1
    else
        echo "🧹 Cleaning up stale PID file"
        rm -f $PID_FILE
    fi
fi

# Activate virtual environment if exists
if [ -d "venv" ]; then
    echo "🔧 Activating virtual environment..."
    source venv/bin/activate
fi

# Check dependencies
echo "📋 Checking dependencies..."
python3 -c "import flask, flask_cors, requests" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "❌ Dependencies not installed"
    echo "Run: pip3 install -r requirements.txt"
    exit 1
fi
echo "✅ Dependencies OK"

# Start proxy server in background
echo "🚀 Starting proxy server on port $PORT..."
PORT=$PORT python3 wholecell-proxy.py > $LOG_DIR/proxy.log 2>&1 &
PROXY_PID=$!

# Save PID
echo $PROXY_PID > $PID_FILE
echo "✅ Proxy server started (PID: $PROXY_PID)"

# Wait for server to be ready
echo "⏳ Waiting for server to be ready..."
sleep 3

# Health check
if ./healthcheck.sh > /dev/null 2>&1; then
    echo "✅ Server is healthy and responding"
else
    echo "❌ Server started but health check failed"
    echo "Check logs: tail -f $LOG_DIR/proxy.log"
    exit 1
fi

echo ""
echo "=============================================="
echo "✅ Wholecell System Started Successfully!"
echo "=============================================="
echo ""
echo "📊 Status:"
echo "  Proxy PID: $PROXY_PID"
echo "  Port: $PORT"
echo "  Logs: $LOG_DIR/proxy.log"
echo ""
echo "🔍 Monitor:"
echo "  Health: ./healthcheck.sh"
echo "  Logs: tail -f $LOG_DIR/proxy.log"
echo ""
echo "🎯 Dashboard:"
echo "  Open: open data-manager.html"
echo "  URL: file://$(pwd)/data-manager.html"
echo ""
echo "🛑 Stop:"
echo "  Command: ./stop-production.sh"
echo ""

