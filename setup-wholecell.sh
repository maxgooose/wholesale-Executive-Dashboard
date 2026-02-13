#!/bin/bash
# Wholecell API Proxy Setup Script
# Run this to set up the Python environment and start the proxy server

echo "🔧 Wholecell API Proxy Setup"
echo "=============================="
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3 first."
    exit 1
fi

echo "✅ Python 3 found: $(python3 --version)"
echo ""

# Install dependencies
echo "📦 Installing Python dependencies..."
pip3 install -r requirements.txt

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""

# Load environment variables from .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "❌ .env file not found. Copy .env.example to .env and fill in your credentials."
    echo "   cp .env.example .env"
    exit 1
fi

if [ -z "$WHOLECELL_APP_ID" ] || [ -z "$WHOLECELL_APP_SECRET" ]; then
    echo "❌ WHOLECELL_APP_ID and WHOLECELL_APP_SECRET must be set in .env"
    exit 1
fi

echo "🚀 Starting Wholecell API Proxy Server..."
echo ""
echo "Server will run on: http://localhost:5000"
echo ""
echo "Test endpoints:"
echo "  - Health check: http://localhost:5000/api/health"
echo "  - Test known IMEIs: http://localhost:5000/api/test/known-imeis"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
python3 wholecell-proxy.py

