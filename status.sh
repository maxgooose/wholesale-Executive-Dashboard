#!/bin/bash
# Wholecell System Status
# =======================

LOG_DIR="logs"
PID_FILE="$LOG_DIR/proxy.pid"
PORT=${PORT:-5001}

echo "📊 Wholecell System Status"
echo "=========================="
echo ""

# Check proxy server
echo "🔌 Proxy Server:"
if [ -f "$PID_FILE" ]; then
    PID=$(cat $PID_FILE)
    if ps -p $PID > /dev/null 2>&1; then
        echo "  Status: ✅ Running"
        echo "  PID: $PID"
        echo "  Port: $PORT"
        
        # Memory usage
        MEM=$(ps -p $PID -o rss= 2>/dev/null)
        if [ -n "$MEM" ]; then
            MEM_MB=$((MEM / 1024))
            echo "  Memory: ${MEM_MB}MB"
        fi
        
        # Uptime
        START_TIME=$(ps -p $PID -o lstart= 2>/dev/null)
        if [ -n "$START_TIME" ]; then
            echo "  Started: $START_TIME"
        fi
    else
        echo "  Status: ❌ Not running (stale PID)"
    fi
else
    echo "  Status: ❌ Not running"
fi

echo ""

# Health check
echo "🏥 Health Check:"
if ./healthcheck.sh > /dev/null 2>&1; then
    echo "  ✅ Healthy"
else
    echo "  ❌ Unhealthy or not responding"
fi

echo ""

# Check frontend
echo "🌐 Frontend:"
if [ -f "data-manager.html" ]; then
    echo "  ✅ data-manager.html exists"
    echo "  Path: file://$(pwd)/data-manager.html"
else
    echo "  ❌ data-manager.html not found"
fi

echo ""

# Logs
echo "📝 Recent Logs (last 5 lines):"
if [ -f "$LOG_DIR/proxy.log" ]; then
    tail -5 $LOG_DIR/proxy.log
else
    echo "  No logs found"
fi

echo ""
echo "=========================="
echo ""
echo "💡 Commands:"
echo "  Start: ./start-production.sh"
echo "  Stop: ./stop-production.sh"
echo "  Restart: ./restart-production.sh"
echo "  Health: ./healthcheck.sh"
echo "  Logs: tail -f $LOG_DIR/proxy.log"

