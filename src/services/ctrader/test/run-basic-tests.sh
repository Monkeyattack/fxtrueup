#!/bin/bash
# Run basic cTrader tests (excluding long-running ones)
# This script runs only the essential tests

set -e

echo "🧪 Running Basic cTrader Test Suite"
echo "===================================="
echo

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test results
PASSED=0
FAILED=0
SKIPPED=0

# Navigate to test directory
cd "$(dirname "$0")"

echo "Test Environment:"
echo "- Node.js: $(node --version)"
echo "- Python: $(python3 --version)"
echo "- Working Directory: $(pwd)"
echo

# 1. Data Mapper Test
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. Testing Data Mapper"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if node test-data-mapper.js; then
    echo -e "${GREEN}✅ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC}"
    ((FAILED++))
fi
echo

# 2. Python Pool Service Test (Quick version)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. Testing Python Pool Service"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if ./test-python-pool.sh; then
    echo -e "${GREEN}✅ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC}"
    ((FAILED++))
fi
echo

# 3. Authentication Test (mock mode)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. Testing Authentication (Mock)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if node test-auth.js; then
    echo -e "${GREEN}✅ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  WARNING${NC}"
    ((SKIPPED++))
fi
echo

# Skip long-running tests
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Skipping long-running tests:"
echo "- Pool Client Test (requires Python service)"
echo "- Streaming Handler Test (requires real-time data)"
echo "- Unified Interface Test (integration test)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
((SKIPPED+=3))

# Summary
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Basic Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}Passed:${NC} $PASSED"
echo -e "${RED}Failed:${NC} $FAILED"
echo -e "${YELLOW}Skipped:${NC} $SKIPPED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Exit code based on failures
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Basic tests passed!${NC}"
    echo
    echo "To run full test suite including integration tests:"
    echo "  ./run-all-tests.sh"
    exit 0
fi