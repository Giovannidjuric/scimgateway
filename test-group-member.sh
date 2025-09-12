#!/bin/bash

# Test script for adding group member with plain text ID

set -e

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}Testing Group Member Addition with Plain Text ID${NC}"
echo "=============================================="
echo ""

# Step 1: List current groups
echo -e "${YELLOW}1. Listing current groups:${NC}"
echo "curl -s -u gwadmin:password http://localhost:8883/groups"
GROUPS_RESPONSE=$(curl -s -u gwadmin:password http://localhost:8883/groups)
echo "$GROUPS_RESPONSE" | jq .
echo ""

# Extract first group ID
GROUP_ID=$(echo "$GROUPS_RESPONSE" | jq -r '.Resources[0].id // empty')
if [ -z "$GROUP_ID" ] || [ "$GROUP_ID" = "null" ]; then
    echo -e "${RED}No groups found!${NC}"
    exit 1
fi

echo -e "${GREEN}Using group ID: $GROUP_ID${NC}"
echo ""

# Step 2: Show current members of the group
echo -e "${YELLOW}2. Current members of group $GROUP_ID:${NC}"
echo "curl -s -u gwadmin:password http://localhost:8883/groups/$GROUP_ID"
CURRENT_GROUP=$(curl -s -u gwadmin:password "http://localhost:8883/groups/$GROUP_ID")
echo "$CURRENT_GROUP" | jq .
echo ""

# Step 3: Add member with PLAIN TEXT ID
echo -e "${YELLOW}3. Adding member with PLAIN TEXT ID:${NC}"
PLAIN_USER_DN="cn=demo-user-hash,ou=users,dc=auth,dc=guest,dc=org"
echo "Plain DN to add: $PLAIN_USER_DN"
echo ""

MEMBER_ADD_BODY='{
    "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
    "Operations": [
        {
            "op": "add",
            "path": "members",
            "value": [
                {
                    "value": "'$PLAIN_USER_DN'"
                }
            ]
        }
    ]
}'

echo "Request body:"
echo "$MEMBER_ADD_BODY" | jq .
echo ""

echo "curl command:"
echo "curl -s -u gwadmin:password -X PATCH http://localhost:8883/groups/$GROUP_ID -H 'Content-Type: application/json' -d '\$MEMBER_ADD_BODY'"
echo ""

echo -e "${YELLOW}Executing PATCH request...${NC}"
PATCH_RESPONSE=$(curl -s -u gwadmin:password -X PATCH "http://localhost:8883/groups/$GROUP_ID" \
    -H "Content-Type: application/json" \
    -d "$MEMBER_ADD_BODY")

echo "Response:"
echo "$PATCH_RESPONSE" | jq .
echo ""

# Step 4: Verify - fetch group again to see if member was added (should show as hashed)
echo -e "${YELLOW}4. Verification - Fetching group again to see hashed member ID:${NC}"
echo "curl -s -u gwadmin:password http://localhost:8883/groups/$GROUP_ID"
UPDATED_GROUP=$(curl -s -u gwadmin:password "http://localhost:8883/groups/$GROUP_ID")
echo "$UPDATED_GROUP" | jq .
echo ""

# Check if member was added
MEMBER_COUNT=$(echo "$UPDATED_GROUP" | jq '.members | length')
echo -e "${GREEN}Current member count: $MEMBER_COUNT${NC}"

# Show members
echo -e "${YELLOW}Members (should show hashed IDs):${NC}"
echo "$UPDATED_GROUP" | jq '.members[]'
echo ""

echo -e "${BLUE}Test completed!${NC}"
echo ""
echo "Expected behavior:"
echo "  • PATCH request sends plain DN: $PLAIN_USER_DN"
echo "  • Response shows member added successfully"  
echo "  • When fetched, member appears as hashed ID"
echo "  • This demonstrates the plain → hashed conversion"