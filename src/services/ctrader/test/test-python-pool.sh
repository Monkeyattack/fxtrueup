#!/bin/bash
# Test Python cTrader Pool Service
# This tests the Python FastAPI service that manages cTrader connections

set -e

echo "🐍 Testing Python cTrader Pool Service..."
echo

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
POOL_PORT=8088
POOL_URL="http://localhost:$POOL_PORT"

# Function to check if service is running
check_service() {
    if curl -s -o /dev/null -w "%{http_code}" "$POOL_URL/health" | grep -q "200"; then
        echo -e "${GREEN}✅ Pool service is running on port $POOL_PORT${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  Pool service not running on port $POOL_PORT${NC}"
        return 1
    fi
}

# Function to start the service
start_service() {
    echo "Starting cTrader pool service..."
    cd ..  # Go up from test directory to ctrader directory
    python3 ctrader_pool_api.py &
    POOL_PID=$!
    echo "Pool service PID: $POOL_PID"
    sleep 3  # Wait for service to start
    cd - > /dev/null  # Go back to original directory
}

# Function to test endpoints
test_endpoints() {
    echo
    echo "Testing API endpoints:"
    echo

    # Test 1: Root endpoint
    echo "1. Testing root endpoint:"
    curl -s "$POOL_URL/" | jq . || echo -e "${RED}Failed${NC}"
    echo

    # Test 2: Health check
    echo "2. Testing health check:"
    curl -s "$POOL_URL/health" | jq . || echo -e "${RED}Failed${NC}"
    echo

    # Test 3: Pool stats
    echo "3. Testing pool statistics:"
    curl -s "$POOL_URL/pool/stats" | jq . || echo -e "${RED}Failed${NC}"
    echo

    # Test 4: Account info (will fail without valid account)
    echo "4. Testing account info (expected to fail without valid account):"
    curl -s "$POOL_URL/account/12345?environment=demo" | jq . || echo -e "${YELLOW}Expected failure${NC}"
    echo

    # Test 5: Symbol mapping
    echo "5. Testing symbol mapping:"
    curl -s "$POOL_URL/symbols/mapping/EURUSD" | jq . || echo -e "${RED}Failed${NC}"
    echo

    # Test 6: Get all prices
    echo "6. Testing price retrieval:"
    curl -s "$POOL_URL/prices" | jq . || echo -e "${RED}Failed${NC}"
    echo

    # Test 7: Subscribe to symbol
    echo "7. Testing symbol subscription:"
    curl -s -X POST "$POOL_URL/streaming/subscribe" \
        -H "Content-Type: application/json" \
        -d '{"symbol": "EURUSD", "account_id": "12345"}' | jq . || echo -e "${RED}Failed${NC}"
    echo

    # Test 8: Test trade execution endpoint
    echo "8. Testing trade execution endpoint (dry run):"
    curl -s -X POST "$POOL_URL/trade/execute" \
        -H "Content-Type: application/json" \
        -d '{
            "account_id": "12345",
            "environment": "demo",
            "symbol": "EURUSD",
            "actionType": "ORDER_TYPE_BUY",
            "volume": 0.01,
            "comment": "Test trade"
        }' | jq . || echo -e "${RED}Failed${NC}"
    echo
}

# Function to test Python data mapper
test_data_mapper() {
    echo
    echo "Testing Python data mapper:"
    echo

    cd ../services
    python3 -c "
from ctrader_data_mapper import CTraderDataMapper
mapper = CTraderDataMapper()
print('✅ Data mapper initialized')
print(f'✅ Loaded {len(mapper.symbol_mapping)} symbol mappings')

# Test symbol mapping
eurusd = mapper.get_symbol_mapping('EURUSD')
if eurusd:
    print(f'✅ EURUSD maps to cTrader ID: {eurusd[\"cTraderId\"]}')
else:
    print('⚠️  No mapping for EURUSD')

# Test all symbols
symbols = mapper.get_all_symbols()
print(f'✅ Total symbols available: {len(symbols)}')
print(f'   Sample symbols: {symbols[:5]}')
"
    cd - > /dev/null
    echo
}

# Main test flow
echo "═══════════════════════════════════════════════"
echo "  cTrader Python Pool Service Test Suite"
echo "═══════════════════════════════════════════════"
echo

# Check if service is already running
if check_service; then
    echo -e "${GREEN}Using existing pool service${NC}"
else
    echo -e "${YELLOW}Starting new pool service...${NC}"
    start_service
    if check_service; then
        echo -e "${GREEN}Service started successfully${NC}"
    else
        echo -e "${RED}Failed to start service${NC}"
        exit 1
    fi
fi

# Run tests
test_endpoints
test_data_mapper

# Cleanup if we started the service
if [ ! -z "$POOL_PID" ]; then
    echo
    echo "Stopping pool service (PID: $POOL_PID)..."
    kill $POOL_PID 2>/dev/null || true
    echo -e "${GREEN}✅ Service stopped${NC}"
fi

echo
echo -e "${GREEN}✅ Python pool tests completed!${NC}"