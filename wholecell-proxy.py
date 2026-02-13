#!/usr/bin/env python3
"""
Wholecell API Proxy Server
===========================
Secure backend proxy that handles Wholecell API authentication and requests.
Keeps credentials server-side and provides clean endpoints for the frontend.
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import requests
import base64
import os
import logging
import sys
from datetime import datetime

# Load .env file
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Wholecell API Configuration
WHOLECELL_APP_ID = os.environ.get('WHOLECELL_APP_ID')
WHOLECELL_APP_SECRET = os.environ.get('WHOLECELL_APP_SECRET')
WHOLECELL_API_BASE = os.environ.get('WHOLECELL_API_BASE', 'https://api.wholecell.io/api/v1/inventories')

if not WHOLECELL_APP_ID or not WHOLECELL_APP_SECRET:
    logger.error("WHOLECELL_APP_ID and WHOLECELL_APP_SECRET must be set. Copy .env.example to .env and fill in your credentials.")
    sys.exit(1)

# Create Basic Auth header
auth_string = f"{WHOLECELL_APP_ID}:{WHOLECELL_APP_SECRET}"
auth_bytes = auth_string.encode('ascii')
auth_b64 = base64.b64encode(auth_bytes).decode('ascii')

# Default headers for Wholecell API
WHOLECELL_HEADERS = {
    'Authorization': f'Basic {auth_b64}',
    'X-App-Id': WHOLECELL_APP_ID,
    'Accept': 'application/json'
}


def make_wholecell_request(url, params=None):
    """
    Make a request to Wholecell API with proper authentication.
    
    Args:
        url: Full URL to request
        params: Optional query parameters
        
    Returns:
        tuple: (success: bool, data: dict/list, error: str)
    """
    try:
        logger.info(f"Making request to Wholecell: {url}")
        if params:
            logger.info(f"Parameters: {params}")
            
        response = requests.get(
            url,
            headers=WHOLECELL_HEADERS,
            params=params,
            timeout=30
        )
        
        logger.info(f"Response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            logger.info(f"Response received: {len(str(data))} characters")
            return True, data, None
        elif response.status_code == 401:
            logger.error("Authentication failed - check credentials")
            return False, None, "Authentication failed"
        elif response.status_code == 404:
            logger.warning("Resource not found")
            return False, None, "Not found"
        else:
            logger.error(f"Unexpected status code: {response.status_code}")
            return False, None, f"API error: {response.status_code}"
            
    except requests.exceptions.Timeout:
        logger.error("Request timed out")
        return False, None, "Request timed out"
    except requests.exceptions.ConnectionError:
        logger.error("Connection error")
        return False, None, "Could not connect to Wholecell API"
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return False, None, str(e)


@app.route('/')
def home():
    """API status endpoint"""
    return jsonify({
        'status': 'running',
        'service': 'Wholecell API Proxy',
        'version': '1.0.0',
        'endpoints': [
            '/api/inventory',
            '/api/inventory/<esn>',
            '/api/test/<esn>',
            '/api/test/known-imeis',
            '/api/health'
        ]
    })


@app.route('/api/health')
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'api_configured': bool(WHOLECELL_APP_ID and WHOLECELL_APP_SECRET)
    })


@app.route('/api/inventory')
def get_all_inventory():
    """
    Fetch all inventory from Wholecell.
    Forwards all query params to the API (page, status, location, warehouse, etc.)

    Returns Wholecell response directly: {data: [...], pages: N, page: N}
    """
    # Forward ALL query params to Wholecell API
    params = dict(request.args)

    url = WHOLECELL_API_BASE
    if params:
        query_string = '&'.join(f"{k}={v}" for k, v in params.items())
        url = f"{url}?{query_string}"

    logger.info(f"Fetching inventory from Wholecell (params={params})")
    
    success, data, error = make_wholecell_request(url)
    
    if success:
        # Return Wholecell response directly (don't wrap it)
        return jsonify(data)
    else:
        return jsonify({
            'success': False,
            'error': error,
            'timestamp': datetime.utcnow().isoformat()
        }), 500


@app.route('/api/inventory/<esn>')
def get_inventory_by_esn(esn):
    """
    Fetch specific inventory item by IMEI/ESN.
    
    Args:
        esn: IMEI or ESN number to query
    """
    logger.info(f"Fetching inventory for ESN: {esn}")
    
    url = f"{WHOLECELL_API_BASE}?esn={esn}"
    success, data, error = make_wholecell_request(url)
    
    if success:
        return jsonify({
            'success': True,
            'data': data,
            'esn': esn,
            'timestamp': datetime.utcnow().isoformat()
        })
    else:
        return jsonify({
            'success': False,
            'error': error,
            'esn': esn,
            'timestamp': datetime.utcnow().isoformat()
        }), 404 if error == "Not found" else 500


@app.route('/api/test/<esn>')
def test_esn_detailed(esn):
    """
    Test endpoint that fetches an ESN and logs the full response structure.
    This helps us understand exactly what Wholecell returns.
    
    Args:
        esn: IMEI or ESN number to query
    """
    logger.info(f"TEST MODE: Fetching ESN {esn} with detailed logging")
    
    url = f"{WHOLECELL_API_BASE}?esn={esn}"
    success, data, error = make_wholecell_request(url)
    
    if success:
        # Log the full structure for analysis
        logger.info("=" * 80)
        logger.info("FULL RESPONSE STRUCTURE:")
        logger.info(f"{data}")
        logger.info("=" * 80)
        
        # Try to analyze structure
        analysis = {
            'response_type': type(data).__name__,
            'is_list': isinstance(data, list),
            'is_dict': isinstance(data, dict),
        }
        
        if isinstance(data, list):
            analysis['list_length'] = len(data)
            if len(data) > 0:
                analysis['first_item_keys'] = list(data[0].keys()) if isinstance(data[0], dict) else None
        elif isinstance(data, dict):
            analysis['keys'] = list(data.keys())
            
        logger.info(f"STRUCTURE ANALYSIS: {analysis}")
        
        return jsonify({
            'success': True,
            'data': data,
            'analysis': analysis,
            'esn': esn,
            'timestamp': datetime.utcnow().isoformat(),
            'message': 'Check server logs for detailed response structure'
        })
    else:
        return jsonify({
            'success': False,
            'error': error,
            'esn': esn,
            'timestamp': datetime.utcnow().isoformat()
        }), 404 if error == "Not found" else 500


@app.route('/api/test/known-imeis')
def test_known_imeis():
    """
    Test endpoint that tries the known IMEIs from the VBA test data.
    This helps verify our connection works with real data.
    """
    # From WholeCellModule.bas TestKnownIMEIs()
    known_imeis = ["H95DHMF9Q1GC", "F9FG5XAJQ1GC", "F9GG5BXXQ1GC"]
    
    logger.info("Testing known IMEIs from VBA test data")
    results = []
    
    for imei in known_imeis:
        logger.info(f"Testing IMEI: {imei}")
        url = f"{WHOLECELL_API_BASE}?esn={imei}"
        success, data, error = make_wholecell_request(url)
        
        result = {
            'imei': imei,
            'success': success,
        }
        
        if success:
            result['found'] = True
            result['data'] = data
            
            # Try to extract key fields based on VBA parsing
            if isinstance(data, list) and len(data) > 0:
                item = data[0]
            elif isinstance(data, dict):
                item = data
            else:
                item = None
                
            if item:
                result['extracted'] = {
                    'esn': item.get('esn'),
                    'model': item.get('product', {}).get('model') if isinstance(item.get('product'), dict) else None,
                    'grade': item.get('product_variation', {}).get('grade') if isinstance(item.get('product_variation'), dict) else None,
                    'total_price_paid': item.get('total_price_paid')
                }
        else:
            result['found'] = False
            result['error'] = error
            
        results.append(result)
    
    success_count = sum(1 for r in results if r['success'])
    
    return jsonify({
        'total_tested': len(known_imeis),
        'successful': success_count,
        'failed': len(known_imeis) - success_count,
        'results': results,
        'timestamp': datetime.utcnow().isoformat()
    })


@app.route('/api/config')
def get_config():
    """
    Return configuration status (without exposing secrets).
    Useful for debugging.
    """
    return jsonify({
        'api_base': WHOLECELL_API_BASE,
        'app_id_configured': bool(WHOLECELL_APP_ID),
        'app_secret_configured': bool(WHOLECELL_APP_SECRET)
    })


if __name__ == '__main__':
    logger.info("Starting Wholecell API Proxy Server")
    logger.info(f"API Base: {WHOLECELL_API_BASE}")
    logger.info(f"App ID configured: {bool(WHOLECELL_APP_ID)}")
    logger.info(f"App Secret configured: {bool(WHOLECELL_APP_SECRET)}")
    
    port = int(os.environ.get('PORT', 5001))
    debug = os.environ.get('DEBUG', 'false').lower() == 'true'
    logger.info(f"Starting server on port {port}")
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=debug
    )

