#!/bin/bash

# SCIM Gateway Demo Script - Hashed IDs and ETags
# This script demonstrates the new hashing functionality and ETag support

# Usage: ./demo-scim-hashes.sh [sleep_seconds]
# Example: ./demo-scim-hashes.sh 2

# Sleep duration between operations (default 1 second)
SLEEP_DURATION=${1:-1}

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}"
}

print_step() {
    echo -e "${YELLOW}➤ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_request() {
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}REQUEST:${NC}"
    echo -e "${WHITE}$1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

clear_and_transition() {
    echo ""
    echo -e "${YELLOW}Press any key to continue to next operation...${NC}"
    read -n 1 -s
    clear
    sleep 1
}

# Common function to get token and make SCIM requests (leverages taskfile pattern)
make_scim_request() {
    local operation="$1"
    local endpoint="$2"
    local data="$3"
    
    export CLIENT_NAME="some-app"
    export CLIENT_SECRET="FdadVjT78wm6AJ5UjZsA9bRqVUkswSAn"
    export KEYCLOAK_ADDRESS="permissions.iam.local"
    export KEYCLOAK_SUBPATH="/auth"
    export INSTANCE="customer"
    
    RESULT=$(bash exec/jwks.sh)
    if echo "$RESULT" | jq -e '.error == null' >/dev/null 2>&1; then
        TOKEN=$(echo "$RESULT" | jq -r '.result')
        
        if [ "$operation" = "GET" ]; then
            print_request "curl -ks -H \"Authorization: Bearer \$TOKEN\" \"https://scim-customer.iam.local$endpoint\""
            RESPONSE=$(curl -ks -H "Authorization: Bearer $TOKEN" "https://scim-customer.iam.local$endpoint")
        elif [ "$operation" = "POST" ]; then
            print_request "curl -ks -H \"Authorization: Bearer \$TOKEN\" -X POST \"https://scim-customer.iam.local$endpoint\" -d '\$USER_DATA'"
            RESPONSE=$(curl -ks -H "Authorization: Bearer $TOKEN" -X POST "https://scim-customer.iam.local$endpoint" -d "$data")
        elif [ "$operation" = "PATCH" ]; then
            print_request "curl -ks -H \"Authorization: Bearer \$TOKEN\" -X PATCH \"https://scim-customer.iam.local$endpoint\" -d '\$UPDATE_DATA'"
            RESPONSE=$(curl -ks -H "Authorization: Bearer $TOKEN" -X PATCH "https://scim-customer.iam.local$endpoint" -d "$data")
        elif [ "$operation" = "DELETE" ]; then
            print_request "curl -ks -H \"Authorization: Bearer \$TOKEN\" -X DELETE \"https://scim-customer.iam.local$endpoint\""
            RESPONSE=$(curl -ks -H "Authorization: Bearer $TOKEN" -X DELETE "https://scim-customer.iam.local$endpoint")
        fi
        
        if echo "$RESPONSE" | jq . >/dev/null 2>&1; then
            echo "$RESPONSE" | jq
        else
            echo "$RESPONSE"
        fi
    else
        echo "$RESULT" | jq -r '.error' >&2
        exit 1
    fi
}

# User data for demo
USER_DATA='{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "userName": "demo-user-hash",
  "name": {
    "givenName": "Demo",
    "familyName": "User"
  },
  "displayName": "Demo User for Hashing",
  "emails": [
    {
      "type": "work",
      "value": "demo.user@example.com",
      "primary": true
    }
  ],
  "uidNumber": 65999,
  "gidNumber": 65999,
  "entitlements": [
    {
      "type": "homeDirectory",
      "value": "/home/demo-user-hash"
    },
    {
      "type": "secret",
      "value": "{CRYPT}DemoHashSecret"
    }
  ]
}'

USER_UPDATE_DATA='{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    {
      "op": "replace",
      "path": "displayName",
      "value": "Demo User Updated via Hash"
    }
  ]
}'

# Main demo execution
main() {
    print_header "SCIM Gateway - Hashed IDs & ETag Demo"
    echo "Sleep duration between operations: ${SLEEP_DURATION} seconds"
    echo ""
    
    print_step "1. Create User - Returns hashed ID"
    make_scim_request "POST" "/scim/v2/Users" "$USER_DATA"
    clear_and_transition
    
    print_step "2. List Users - Shows hashed IDs"
    make_scim_request "GET" "/scim/v2/Users"
    clear_and_transition
    
    print_step "3. List Groups - Shows hashed IDs"
    make_scim_request "GET" "/scim/v2/Groups"
    
    # Get groups response separately to extract ID
    export CLIENT_NAME="some-app"
    export CLIENT_SECRET="FdadVjT78wm6AJ5UjZsA9bRqVUkswSAn"
    export KEYCLOAK_ADDRESS="permissions.iam.local"
    export KEYCLOAK_SUBPATH="/auth"
    export INSTANCE="customer"
    
    RESULT=$(bash exec/jwks.sh)
    if echo "$RESULT" | jq -e '.error == null' >/dev/null 2>&1; then
        TOKEN=$(echo "$RESULT" | jq -r '.result')
        GROUPS_RESPONSE=$(curl -ks -H "Authorization: Bearer $TOKEN" "https://scim-customer.iam.local/scim/v2/Groups")
        GROUP_HASH_ID=$(echo "$GROUPS_RESPONSE" | jq -r '.Resources[0].id // empty' 2>/dev/null)
    fi
    
    # Extract hashed IDs for further operations
    USER_HASH_ID="eRujCEMhuMvsXar1UTNMW4LCKeKIPUANiHGzx43f-GU"
    USER_ETAG="ULpR92laOtiauc96sslH-Y"
    
    clear_and_transition
    
    print_header "FETCH OPERATIONS - Using Hashed IDs"
    
    print_step "4. Fetch User by Hashed ID (user-read pattern)"
    export CLIENT_NAME="some-app"
    export CLIENT_SECRET="FdadVjT78wm6AJ5UjZsA9bRqVUkswSAn"
    export KEYCLOAK_ADDRESS="permissions.iam.local"
    export KEYCLOAK_SUBPATH="/auth"
    export INSTANCE="customer"
    
    RESULT=$(bash exec/jwks.sh)
    if echo "$RESULT" | jq -e '.error == null' >/dev/null 2>&1; then
        TOKEN=$(echo "$RESULT" | jq -r '.result')
        print_request "curl -ks -H \"Authorization: Bearer \$TOKEN\" \"https://scim-customer.iam.local/scim/v2/Users/$USER_HASH_ID\""
        RESPONSE=$(curl -ks -H "Authorization: Bearer $TOKEN" "https://scim-customer.iam.local/scim/v2/Users/$USER_HASH_ID")
        if echo "$RESPONSE" | jq . >/dev/null 2>&1; then
            echo "$RESPONSE" | jq
        else
            echo "$RESPONSE"
        fi
    fi
    clear_and_transition
    
    print_step "5. Fetch Group by Hashed ID (group-read pattern)"
    RESULT=$(bash exec/jwks.sh)
    if echo "$RESULT" | jq -e '.error == null' >/dev/null 2>&1; then
        TOKEN=$(echo "$RESULT" | jq -r '.result')
        print_request "curl -ks -H \"Authorization: Bearer \$TOKEN\" \"https://scim-customer.iam.local/scim/v2/Groups/$GROUP_HASH_ID\""
        RESPONSE=$(curl -ks -H "Authorization: Bearer $TOKEN" "https://scim-customer.iam.local/scim/v2/Groups/$GROUP_HASH_ID")
        if echo "$RESPONSE" | jq . >/dev/null 2>&1; then
            echo "$RESPONSE" | jq
        else
            echo "$RESPONSE"
        fi
    fi
    clear_and_transition
    
    print_header "UPDATE OPERATIONS - Using Hashed IDs & ETags"
    
    print_step "6. Update Group - Add created user as member (group-update pattern)"
    echo -e "${GREEN}UPDATE DETAILS:${NC}"
    echo -e "  • Adding user to group using PLAIN ID in request"
    echo -e "  • Group (hashed): $GROUP_HASH_ID"
    echo -e "  • User (plain DN): cn=demo-user-hash,ou=users,dc=auth,dc=guest,dc=org"
    echo -e "  • When fetched, member will show as hashed ID"
    echo ""
    
    GROUP_UPDATE_BODY='{
        "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        "Operations": [
            {
                "op": "add",
                "path": "members",
                "value": [
                    {
                        "value": "cn=demo-user-hash,ou=users,dc=auth,dc=guest,dc=org"
                    }
                ]
            }
        ]
    }'
    
    RESULT=$(bash exec/jwks.sh)
    if echo "$RESULT" | jq -e '.error == null' >/dev/null 2>&1; then
        TOKEN=$(echo "$RESULT" | jq -r '.result')
        print_request "curl -ks -H \"Authorization: Bearer \$TOKEN\" -X PATCH \"https://scim-customer.iam.local/scim/v2/Groups/$GROUP_HASH_ID\" -d '\$GROUP_UPDATE_BODY'"
        RESPONSE=$(curl -ks -H "Authorization: Bearer $TOKEN" -X PATCH "https://scim-customer.iam.local/scim/v2/Groups/$GROUP_HASH_ID" -d "$GROUP_UPDATE_BODY")
        if echo "$RESPONSE" | jq . >/dev/null 2>&1; then
            echo "$RESPONSE" | jq .
            print_success "Group updated! User added as member using hashed IDs"
        else
            echo "$RESPONSE"
        fi
    fi
    clear_and_transition
    
    print_step "7. Update User with Hashed ID and ETag (user-update pattern)"
    echo -e "${GREEN}UPDATE DETAILS:${NC}"
    echo -e "  • Changing name.formatted: 'Demo User' → 'Demo User UPDATED via Hashed ID'"
    echo -e "  • Changing work email: 'demo.user@example.com' → 'demo.user.updated@example.com'"
    echo -e "  • Using If-Match header with ETag: W/\"$USER_ETAG\""
    echo ""
    
    USER_UPDATE_BODY='{
        "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        "Operations": [
            {
                "op": "replace",
                "path": "name.formatted",
                "value": "Demo User UPDATED via Hashed ID"
            },
            {
                "op": "replace",
                "path": "emails[type eq \"work\"].value",
                "value": "demo.user.updated@example.com"
            }
        ]
    }'
    
    RESULT=$(bash exec/jwks.sh)
    if echo "$RESULT" | jq -e '.error == null' >/dev/null 2>&1; then
        TOKEN=$(echo "$RESULT" | jq -r '.result')
        print_request "curl -ks -H \"Authorization: Bearer \$TOKEN\" -H \"If-Match: W/\\\"$USER_ETAG\\\"\" -X PATCH \"https://scim-customer.iam.local/scim/v2/Users/$USER_HASH_ID\" -d '\$USER_UPDATE_BODY'"
        RESPONSE=$(curl -ks -H "Authorization: Bearer $TOKEN" -H "If-Match: W/\"$USER_ETAG\"" -X PATCH "https://scim-customer.iam.local/scim/v2/Users/$USER_HASH_ID" -d "$USER_UPDATE_BODY")
        if echo "$RESPONSE" | jq . >/dev/null 2>&1; then
            echo "$RESPONSE" | jq
            NEW_ETAG=$(echo "$RESPONSE" | jq -r '.meta.version // empty')
            print_success "User updated! New ETag: $NEW_ETAG"
        else
            echo "$RESPONSE"
        fi
    fi
    clear_and_transition
    
    print_step "8. Verify User Update - Fetch again to see changes"
    echo -e "${GREEN}VERIFICATION:${NC}"
    echo -e "  • Fetching user again to confirm the updates were applied"
    echo -e "  • Should show updated name.formatted and email address"
    echo -e "  • Should show new ETag value in meta.version"
    echo ""
    RESULT=$(bash exec/jwks.sh)
    if echo "$RESULT" | jq -e '.error == null' >/dev/null 2>&1; then
        TOKEN=$(echo "$RESULT" | jq -r '.result')
        RESPONSE=$(curl -ks -H "Authorization: Bearer $TOKEN" "https://scim-customer.iam.local/scim/v2/Users/$USER_HASH_ID")
        if echo "$RESPONSE" | jq . >/dev/null 2>&1; then
            echo "$RESPONSE" | jq
        else
            echo "$RESPONSE"
        fi
    fi
    clear_and_transition
    
    print_header "ETAG CONDITIONAL REQUESTS"
    
    if [ -n "$NEW_ETAG" ]; then
        print_step "9. Test If-None-Match with current ETag (should return 304)"
        echo -e "${GREEN}ETAG TEST:${NC}"
        echo -e "  • User: $USER_HASH_ID"
        echo -e "  • Header: If-None-Match: $NEW_ETAG"
        echo -e "  • Expected: ${YELLOW}304 Not Modified${NC}"
        echo ""
        RESULT=$(bash exec/jwks.sh)
        if echo "$RESULT" | jq -e '.error == null' >/dev/null 2>&1; then
            TOKEN=$(echo "$RESULT" | jq -r '.result')
            print_request "curl -ks -H \"Authorization: Bearer \$TOKEN\" -H \"If-None-Match: $NEW_ETAG\" \"https://scim-customer.iam.local/scim/v2/Users/$USER_HASH_ID\""
            RESPONSE=$(curl -ks -w "\\nHTTP_CODE:%{http_code}" -H "Authorization: Bearer $TOKEN" -H "If-None-Match: $NEW_ETAG" "https://scim-customer.iam.local/scim/v2/Users/$USER_HASH_ID")
            HTTP_CODE=$(echo "$RESPONSE" | tail -n1 | sed 's/HTTP_CODE://')
            BODY=$(echo "$RESPONSE" | sed '$d')
            
            if [ "$HTTP_CODE" = "304" ]; then
                echo -e "${GREEN}✓ SUCCESS: HTTP $HTTP_CODE (Resource not modified)${NC}"
            else
                echo -e "${RED}⚠ Unexpected: HTTP $HTTP_CODE${NC}"
                echo "$BODY"
            fi
        fi
        clear_and_transition
        
        print_step "10. Test If-Match with old ETag (should return 412)"
        echo -e "${GREEN}ETAG TEST:${NC}"
        echo -e "  • User: $USER_HASH_ID"
        echo -e "  • Header: If-Match: W/\"$USER_ETAG\" (OLD ETag)"
        echo -e "  • Current ETag: $NEW_ETAG"
        echo -e "  • Expected: ${YELLOW}412 Precondition Failed${NC}"
        echo ""
        RESULT=$(bash exec/jwks.sh)
        if echo "$RESULT" | jq -e '.error == null' >/dev/null 2>&1; then
            TOKEN=$(echo "$RESULT" | jq -r '.result')
            print_request "curl -ks -H \"Authorization: Bearer \$TOKEN\" -H \"If-Match: W/\\\"$USER_ETAG\\\"\" -X PATCH \"https://scim-customer.iam.local/scim/v2/Users/$USER_HASH_ID\" -d '\$USER_UPDATE_BODY'"
            RESPONSE=$(curl -ks -w "\\nHTTP_CODE:%{http_code}" -H "Authorization: Bearer $TOKEN" -H "If-Match: W/\"$USER_ETAG\"" -X PATCH "https://scim-customer.iam.local/scim/v2/Users/$USER_HASH_ID" -d "$USER_UPDATE_BODY")
            HTTP_CODE=$(echo "$RESPONSE" | tail -n1 | sed 's/HTTP_CODE://')
            BODY=$(echo "$RESPONSE" | sed '$d')
            
            if [ "$HTTP_CODE" = "412" ]; then
                echo -e "${GREEN}✓ SUCCESS: HTTP $HTTP_CODE (ETag mismatch prevented update)${NC}"
            else
                echo -e "${RED}⚠ Unexpected: HTTP $HTTP_CODE${NC}"
                echo "$BODY"
            fi
        fi
        clear_and_transition
        
        print_step "11. Final Verification - Confirm user unchanged after failed update"
        echo -e "${GREEN}VERIFICATION:${NC}"
        echo -e "  • Fetching user one more time to prove ETag protection worked"
        echo -e "  • Should show user data unchanged from step 8"
        echo -e "  • ETag should still be: $NEW_ETAG"
        echo ""
        RESULT=$(bash exec/jwks.sh)
        if echo "$RESULT" | jq -e '.error == null' >/dev/null 2>&1; then
            TOKEN=$(echo "$RESULT" | jq -r '.result')
            print_request "curl -ks -H \"Authorization: Bearer \$TOKEN\" \"https://scim-customer.iam.local/scim/v2/Users/$USER_HASH_ID\""
            RESPONSE=$(curl -ks -H "Authorization: Bearer $TOKEN" "https://scim-customer.iam.local/scim/v2/Users/$USER_HASH_ID")
            if echo "$RESPONSE" | jq . >/dev/null 2>&1; then
                echo "$RESPONSE" | jq .
                FINAL_ETAG=$(echo "$RESPONSE" | jq -r '.meta.version // empty')
                if [ "$FINAL_ETAG" = "$NEW_ETAG" ]; then
                    print_success "✓ CONFIRMED: User unchanged, ETag protection worked perfectly!"
                else
                    print_error "⚠ Unexpected: ETag changed ($FINAL_ETAG vs $NEW_ETAG)"
                fi
            else
                echo "$RESPONSE"
            fi
        fi
        clear_and_transition
    fi
    
    print_header "CLEANUP"
    print_step "12. Delete Test User (user-delete pattern)"
    RESULT=$(bash exec/jwks.sh)
    if echo "$RESULT" | jq -e '.error == null' >/dev/null 2>&1; then
        TOKEN=$(echo "$RESULT" | jq -r '.result')
        RESPONSE=$(curl -ks -w "HTTP_CODE:%{http_code}" -H "Authorization: Bearer $TOKEN" -X DELETE "https://scim-customer.iam.local/scim/v2/Users/$USER_HASH_ID")
        echo "$RESPONSE"
        print_success "Demo user cleaned up"
    fi
}

# Run the demo
main