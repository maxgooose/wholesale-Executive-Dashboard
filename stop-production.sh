#!/bin/bash
# Stop Wholecell System
# =====================

LOG_DIR="logs"
PID_FILE="$LOG_DIR/proxy.pid"

echo "🛑 Stopping Wholecell System"
echo "============================"
echo ""

# Check if PID file exists
if [ ! -f "$PID_FILE" ]; then
    echo "⚠️  No PID file found"
    echo "Checking for running processes..."
    
    # Try to find process anyway
    PIDS=$(pgrep -f "wholecell-proxy.py")
    if [ -n "$PIDS" ]; then
        echo "Found running proxy processes: $PIDS"
        read -p "Kill these processes? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            kill $PIDS
            echo "✅ Processes killed"
        fi
    else
        echo "✅ No proxy processes running"
    fi
    exit 0
fi

# Read PID
PID=$(cat $PID_FILE)

# Check if process is running
if ps -p $PID > /dev/null 2>&1; then
    echo "🛑 Stopping proxy server (PID: $PID)..."
    kill $PID
    
    # Wait for process to stop
    for i in {1..10}; do
        if ! ps -p $PID > /dev/null 2>&1; then
            echo "✅ Proxy server stopped"
            rm -f $PID_FILE
            exit 0
        fi
        sleep 1
    done
    
    # Force kill if still running
    echo "⚠️  Process not responding, force killing..."
    kill -9 $PID 2>/dev/null
    rm -f $PID_FILE
    echo "✅ Proxy server force stopped"
else
    echo "⚠️  Process not running (PID: $PID)"
    rm -f $PID_FILE
    echo "✅ Cleaned up PID file"
fi

