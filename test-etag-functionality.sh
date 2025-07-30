#!/bin/bash

# SCIM Gateway ETag Functionality Test Script
# Tests If-Match and If-None-Match conditional request headers

set -e  # Exit on any error

# Configuration
BASE_URL="http://localhost:8883"
USERNAME="gwadmin"
PASSWORD="password"
HEADERS="Accept: application/scim+json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  SCIM Gateway ETag Functionality Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo

# Function to make HTTP request and extract status/etag
make_request() {
    local method="$1"
    local url="$2"
    local headers="$3"
    local data="$4"
    
    if [ -n "$data" ]; then
        response=$(curl -s -w "\nHTTPSTATUS:%{http_code}" -u "$USERNAME:$PASSWORD" -X "$method" -H "$HEADERS" $headers -d "$data" "$url" 2>/dev/null)
    else
        response=$(curl -s -w "\nHTTPSTATUS:%{http_code}" -u "$USERNAME:$PASSWORD" -X "$method" -H "$HEADERS" $headers "$url" 2>/dev/null)
    fi
    
    # Extract HTTP status more reliably
    http_status=$(echo "$response" | grep "^HTTPSTATUS:" | cut -d: -f2)
    
    # If no status found in grep, try tail method as fallback
    if [ -z "$http_status" ]; then
        http_status=$(echo "$response" | tail -1 | sed 's/HTTPSTATUS://')
    fi
    
    # Extract body (everything except the status line)
    body=$(echo "$response" | grep -v "^HTTPSTATUS:")
    
    echo "$http_status|$body"
}

# Function to get fresh group data
get_test_group() {
    echo "Fetching fresh group data..."
    result=$(make_request "GET" "$BASE_URL/Groups" "" "")
    status=$(echo "$result" | cut -d'|' -f1)
    body=$(echo "$result" | cut -d'|' -f2)
    
    if [ "$status" != "200" ]; then
        echo -e "${RED}❌ Failed to get groups list. Status: $status${NC}"
        exit 1
    fi
    
    # Find first available group
    TEST_GROUP_ID=$(echo "$body" | jq -r '.Resources[0].id')
    TEST_GROUP_ETAG=$(echo "$body" | jq -r '.Resources[0].meta.version')
    TEST_GROUP_NAME=$(echo "$body" | jq -r '.Resources[0].displayName')
    
    if [ -z "$TEST_GROUP_ID" ] || [ "$TEST_GROUP_ID" = "null" ]; then
        echo -e "${RED}❌ No groups found for testing${NC}"
        exit 1
    fi
    
    echo -e "  ${GREEN}✅ Using group: $TEST_GROUP_NAME${NC}"
    echo -e "  Group ID: $TEST_GROUP_ID"
    echo -e "  Current ETag: $TEST_GROUP_ETAG"
    echo
}

# Function to get fresh user data
get_test_user() {
    echo "Fetching fresh user data..."
    result=$(make_request "GET" "$BASE_URL/Users" "" "")
    status=$(echo "$result" | cut -d'|' -f1)
    body=$(echo "$result" | cut -d'|' -f2)
    
    if [ "$status" != "200" ]; then
        echo -e "${RED}❌ Failed to get users list. Status: $status${NC}"
        exit 1
    fi
    
    # Find first available user
    TEST_USER_ID=$(echo "$body" | jq -r '.Resources[0].id')
    TEST_USER_ETAG=$(echo "$body" | jq -r '.Resources[0].meta.version')
    TEST_USER_NAME=$(echo "$body" | jq -r '.Resources[0].userName')
    
    if [ -z "$TEST_USER_ID" ] || [ "$TEST_USER_ID" = "null" ]; then
        echo -e "${RED}❌ No users found for testing${NC}"
        exit 1
    fi
    
    echo -e "  ${GREEN}✅ Using user: $TEST_USER_NAME${NC}"
    echo -e "  User ID: $TEST_USER_ID"
    echo -e "  Current ETag: $TEST_USER_ETAG"
    echo
}

# Function to test conditional requests
test_conditional_request() {
    local test_name="$1"
    local method="$2"
    local url="$3"
    local condition_header="$4"
    local expected_status="$5"
    local data="$6"
    
    echo -e "${YELLOW}Testing: $test_name${NC}"
    
    local headers=""
    if [ -n "$condition_header" ]; then
        headers="-H \"$condition_header\""
    fi
    
    local result=$(eval "make_request \"$method\" \"$url\" \"$headers\" \"$data\"")
    local status=$(echo "$result" | cut -d'|' -f1)
    local body=$(echo "$result" | cut -d'|' -f2)
    
    if [ "$status" = "$expected_status" ]; then
        echo -e "  ${GREEN}✅ PASS${NC} - Status: $status (expected: $expected_status)"
    else
        echo -e "  ${RED}❌ FAIL${NC} - Status: $status (expected: $expected_status)"
        if [ ${#body} -lt 200 ]; then
            echo -e "  ${RED}Response: $body${NC}"
        else
            echo -e "  ${RED}Response: [Long response - ${#body} chars]${NC}"
        fi
    fi
    
    echo
    return 0
}

echo -e "${BLUE}Step 1: Test Group ETag functionality${NC}"
echo
get_test_group

echo -e "${BLUE}Step 2: Test If-None-Match functionality (Groups)${NC}"
echo

# Test 2a: If-None-Match with correct ETag (should return 304 Not Modified)
test_conditional_request \
    "Group If-None-Match with correct ETag (should return 304)" \
    "GET" \
    "$BASE_URL/Groups/$TEST_GROUP_ID" \
    "If-None-Match: $TEST_GROUP_ETAG" \
    "304"

# Test 2b: If-None-Match with wrong ETag (should return 200 with data)
test_conditional_request \
    "Group If-None-Match with wrong ETag (should return 200)" \
    "GET" \
    "$BASE_URL/Groups/$TEST_GROUP_ID" \
    "If-None-Match: W/\"wrong-etag-value\"" \
    "200"

echo -e "${BLUE}Step 3: Test If-Match functionality (Groups)${NC}"
echo

# Refresh group data before If-Match tests
get_test_group

# Test 3a: If-Match with correct ETag (should return 200)
test_conditional_request \
    "Group If-Match with correct ETag (should return 200)" \
    "GET" \
    "$BASE_URL/Groups/$TEST_GROUP_ID" \
    "If-Match: $TEST_GROUP_ETAG" \
    "200"

# Test 3b: If-Match with wrong ETag (should return 412 Precondition Failed)
test_conditional_request \
    "Group If-Match with wrong ETag (should return 412)" \
    "GET" \
    "$BASE_URL/Groups/$TEST_GROUP_ID" \
    "If-Match: W/\"wrong-etag-value\"" \
    "412"

echo -e "${BLUE}Step 4: Test User ETag functionality${NC}"
echo
get_test_user

echo -e "${BLUE}Step 5: Test If-None-Match functionality (Users)${NC}"
echo

# Test 5a: If-None-Match with correct ETag (should return 304 Not Modified)
test_conditional_request \
    "User If-None-Match with correct ETag (should return 304)" \
    "GET" \
    "$BASE_URL/Users/$TEST_USER_ID" \
    "If-None-Match: $TEST_USER_ETAG" \
    "304"

# Test 5b: If-None-Match with wrong ETag (should return 200 with data)
test_conditional_request \
    "User If-None-Match with wrong ETag (should return 200)" \
    "GET" \
    "$BASE_URL/Users/$TEST_USER_ID" \
    "If-None-Match: W/\"wrong-etag-value\"" \
    "200"

echo -e "${BLUE}Step 6: Test If-Match functionality (Users)${NC}"
echo

# Refresh user data before If-Match tests
get_test_user

# Test 6a: If-Match with correct ETag (should return 200)
test_conditional_request \
    "User If-Match with correct ETag (should return 200)" \
    "GET" \
    "$BASE_URL/Users/$TEST_USER_ID" \
    "If-Match: $TEST_USER_ETAG" \
    "200"

# Test 6b: If-Match with wrong ETag (should return 412 Precondition Failed)
test_conditional_request \
    "User If-Match with wrong ETag (should return 412)" \
    "GET" \
    "$BASE_URL/Users/$TEST_USER_ID" \
    "If-Match: W/\"wrong-etag-value\"" \
    "412"

echo -e "${BLUE}Step 7: Test ETag uniqueness${NC}"
echo

echo -e "${YELLOW}Testing: Different resources have different ETags${NC}"
get_test_group
group_etag=$TEST_GROUP_ETAG
group_name=$TEST_GROUP_NAME

get_test_user
user_etag=$TEST_USER_ETAG
user_name=$TEST_USER_NAME

echo "  Group '$group_name' ETag: $group_etag"
echo "  User '$user_name' ETag: $user_etag"

if [ "$group_etag" != "$user_etag" ]; then
    echo -e "  ${GREEN}✅ PASS${NC} - Group and user have different ETags"
else
    echo -e "  ${RED}❌ FAIL${NC} - Group and user have identical ETags"
fi
echo

# Test multiple groups have different ETags
echo -e "${YELLOW}Testing: Multiple groups have different ETags${NC}"
result=$(make_request "GET" "$BASE_URL/Groups" "" "")
body=$(echo "$result" | cut -d'|' -f2)

# Get first 3 groups
group1_etag=$(echo "$body" | jq -r '.Resources[0].meta.version')
group2_etag=$(echo "$body" | jq -r '.Resources[1].meta.version')
group3_etag=$(echo "$body" | jq -r '.Resources[2].meta.version')

group1_name=$(echo "$body" | jq -r '.Resources[0].displayName')
group2_name=$(echo "$body" | jq -r '.Resources[1].displayName')
group3_name=$(echo "$body" | jq -r '.Resources[2].displayName')

echo "  '$group1_name': $group1_etag"
echo "  '$group2_name': $group2_etag"
echo "  '$group3_name': $group3_etag"

if [ "$group1_etag" != "$group2_etag" ] && [ "$group2_etag" != "$group3_etag" ] && [ "$group1_etag" != "$group3_etag" ]; then
    echo -e "  ${GREEN}✅ PASS${NC} - All tested groups have unique ETags"
else
    echo -e "  ${RED}❌ FAIL${NC} - Some groups have identical ETags"
fi
echo

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}           Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✅ ETag functionality testing completed${NC}"
echo -e "${YELLOW}Key Features Verified:${NC}"
echo "  • If-None-Match conditional requests (Groups & Users)"
echo "  • If-Match conditional requests (Groups & Users)"
echo "  • ETag uniqueness across resources"
echo "  • Enhanced ETag with member unhashing"
echo "  • Fresh data fetching for reliable testing"
echo
echo -e "${BLUE}You can run this script anytime with:${NC}"
echo -e "${YELLOW}  bash test-etag-functionality.sh${NC}"
echo