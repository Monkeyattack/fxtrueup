#!/bin/bash
# Run all cTrader tests
# This script runs all test suites for the cTrader integration

set -e

echo "🧪 Running cTrader Integration Test Suite"
echo "========================================"
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

# Function to run a test
run_test() {
    local test_name=$1
    local test_script=$2
    local require_env=$3

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Running: $test_name"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Check if environment variables are required
    if [ ! -z "$require_env" ]; then
        if [ -z "${!require_env}" ]; then
            echo -e "${YELLOW}⚠️  Skipping - Missing $require_env environment variable${NC}"
            echo
            ((SKIPPED++))
            return
        fi
    fi

    # Run the test
    if $test_script; then
        echo -e "${GREEN}✅ PASSED: $test_name${NC}"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAILED: $test_name${NC}"
        ((FAILED++))
    fi
    echo
    echo
}

# Navigate to test directory
cd "$(dirname "$0")"

# Run tests in order
echo "Test Environment:"
echo "- Node.js: $(node --version)"
echo "- Python: $(python3 --version)"
echo "- Working Directory: $(pwd)"
echo

# 1. Data Mapper Test (no external dependencies)
run_test "Data Mapper Tests" "node test-data-mapper.js" ""

# 2. Python Pool Service Test
run_test "Python Pool Service Tests" "./test-python-pool.sh" ""

# 3. Authentication Test (requires cTrader credentials)
run_test "Authentication Tests" "node test-auth.js" "CTRADER_CLIENT_ID"

# 4. Pool Client Test (requires running Python service)
run_test "Pool Client Tests" "node test-pool.js" ""

# 5. Streaming Handler Test (requires running services)
run_test "Streaming Handler Tests" "node test-streaming.js" ""

# 6. Unified Interface Test (integration test)
run_test "Unified Interface Tests" "node test-unified.js" ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Summary"
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
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
fi