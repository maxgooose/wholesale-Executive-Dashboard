#!/bin/bash
# Simple HTTP server for testing Gemini AI integration
# This solves CORS issues when loading local JSON files

echo "🚀 Starting test server..."
echo ""
echo "Server URL: http://localhost:8000"
echo ""
echo "📱 Test pages:"
echo "  - AI Chat: http://localhost:8000/ai-chat.html"
echo "  - Test Page: http://localhost:8000/test-gemini-ai.html"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start Python HTTP server
python3 -m http.server 8000

