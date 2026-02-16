#!/bin/bash
# Wholecell API Proxy - Production Deployment Script
# ===================================================
# This script sets up the Wholecell proxy for production use

set -e  # Exit on error

echo "🚀 Wholecell API Proxy - Production Deployment"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root (not recommended)
if [ "$EUID" -eq 0 ]; then 
    echo -e "${YELLOW}Warning: Running as root is not recommended${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check Python installation
echo "📋 Checking requirements..."
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 is not installed${NC}"
    echo "Please install Python 3.7 or higher"
    exit 1
fi

echo -e "${GREEN}✅ Python 3 found: $(python3 --version)${NC}"

# Check if virtualenv exists, create if not
VENV_DIR="venv"
if [ ! -d "$VENV_DIR" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv $VENV_DIR
    echo -e "${GREEN}✅ Virtual environment created${NC}"
else
    echo -e "${GREEN}✅ Virtual environment exists${NC}"
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source $VENV_DIR/bin/activate

# Install dependencies
echo "📦 Installing dependencies..."
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi

# Check if .env exists, create from example if not
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "⚙️  Creating .env file from example..."
        cp .env.example .env
        echo -e "${GREEN}✅ .env file created${NC}"
        echo -e "${YELLOW}⚠️  Please edit .env file with your credentials${NC}"
    fi
fi

# Test proxy server
echo ""
echo "🧪 Testing proxy server..."
python3 << 'PYTHON_TEST'
import sys
try:
    # Test import
    import flask
    import flask_cors
    import requests
    print("✅ All required modules can be imported")
    
    # Test basic functionality
    from wholecell_proxy import app
    print("✅ Proxy server module loads correctly")
    sys.exit(0)
except ImportError as e:
    print(f"❌ Import error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
PYTHON_TEST

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Proxy server test passed${NC}"
else
    echo -e "${RED}❌ Proxy server test failed${NC}"
    exit 1
fi

# Create systemd service file (optional)
read -p "📝 Create systemd service for auto-start? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    CURRENT_DIR=$(pwd)
    USER_NAME=$(whoami)
    
    cat > wholecell-proxy.service << EOF
[Unit]
Description=Wholecell API Proxy Server
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$CURRENT_DIR
Environment="PATH=$CURRENT_DIR/$VENV_DIR/bin"
ExecStart=$CURRENT_DIR/$VENV_DIR/bin/python3 $CURRENT_DIR/wholecell-proxy.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    echo -e "${GREEN}✅ Service file created: wholecell-proxy.service${NC}"
    echo ""
    echo "To install the service:"
    echo "  sudo cp wholecell-proxy.service /etc/systemd/system/"
    echo "  sudo systemctl daemon-reload"
    echo "  sudo systemctl enable wholecell-proxy"
    echo "  sudo systemctl start wholecell-proxy"
fi

# Create log directory
mkdir -p logs
echo -e "${GREEN}✅ Log directory created${NC}"

# Create backup script
cat > backup-proxy.sh << 'EOF'
#!/bin/bash
# Backup Wholecell proxy configuration and logs
BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR
cp .env $BACKUP_DIR/ 2>/dev/null || true
cp -r logs $BACKUP_DIR/ 2>/dev/null || true
echo "✅ Backup created: $BACKUP_DIR"
EOF
chmod +x backup-proxy.sh
echo -e "${GREEN}✅ Backup script created: backup-proxy.sh${NC}"

# Create monitoring script
cat > monitor-proxy.sh << 'EOF'
#!/bin/bash
# Monitor Wholecell proxy server health
PORT=${PORT:-5001}
URL="http://localhost:$PORT/api/health"

while true; do
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $URL 2>/dev/null)
    
    if [ "$RESPONSE" == "200" ]; then
        echo "$(date) ✅ Proxy server is healthy"
    else
        echo "$(date) ❌ Proxy server is down (HTTP $RESPONSE)"
        # Optional: Send alert or restart service
    fi
    
    sleep 60  # Check every minute
done
EOF
chmod +x monitor-proxy.sh
echo -e "${GREEN}✅ Monitoring script created: monitor-proxy.sh${NC}"

echo ""
echo "=============================================="
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo "=============================================="
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Start the proxy server:"
echo "   source venv/bin/activate"
echo "   PORT=5001 python3 wholecell-proxy.py"
echo ""
echo "2. Or run in background:"
echo "   source venv/bin/activate"
echo "   nohup python3 wholecell-proxy.py > logs/proxy.log 2>&1 &"
echo ""
echo "3. Test the server:"
echo "   curl http://localhost:5001/api/health"
echo ""
echo "4. Monitor the server:"
echo "   ./monitor-proxy.sh"
echo ""
echo "5. Create backups:"
echo "   ./backup-proxy.sh"
echo ""
echo "🎉 Happy deploying!"

