#!/bin/bash

# Simple authentication test script

CLIENT_NAME="some-app"
CLIENT_SECRET="FdadVjT78wm6AJ5UjZsA9bRqVUkswSAn"
KEYCLOAK_ADDRESS="https://permissions.iam.local"
KEYCLOAK_SUBPATH="/auth"
INSTANCE="customer"

echo "Testing authentication..."
echo "Endpoint: ${KEYCLOAK_ADDRESS}${KEYCLOAK_SUBPATH}/realms/${INSTANCE}/protocol/openid-connect/token"
echo "Client: ${CLIENT_NAME}"
echo ""

# Test basic connectivity first
echo "1. Testing basic connectivity..."
curl -k -s --connect-timeout 10 "${KEYCLOAK_ADDRESS}" > /dev/null
if [ $? -eq 0 ]; then
    echo "✓ Can reach ${KEYCLOAK_ADDRESS}"
else
    echo "✗ Cannot reach ${KEYCLOAK_ADDRESS}"
    exit 1
fi

# Test token endpoint
echo ""
echo "2. Testing token request..."
response=$(curl -k -s -w "\nHTTP_CODE:%{http_code}" -X POST "${KEYCLOAK_ADDRESS}${KEYCLOAK_SUBPATH}/realms/${INSTANCE}/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=${CLIENT_NAME}" \
    -d "client_secret=${CLIENT_SECRET}" \
    -d "grant_type=client_credentials")

echo "Full response:"
echo "$response"

# Parse response
body=$(echo "$response" | sed '$d')
http_code=$(echo "$response" | tail -n1 | sed 's/HTTP_CODE://')

echo ""
echo "HTTP Code: $http_code"

if [ "$http_code" = "200" ]; then
    token=$(echo "$body" | jq -r '.access_token // empty' 2>/dev/null)
    if [ -n "$token" ] && [ "$token" != "null" ] && [ "$token" != "empty" ]; then
        echo "✓ Successfully obtained access token"
        echo "Token (first 50 chars): ${token:0:50}..."
    else
        echo "✗ No access token in response"
    fi
else
    echo "✗ HTTP error $http_code"
    error=$(echo "$body" | jq -r '.error // empty' 2>/dev/null)
    error_desc=$(echo "$body" | jq -r '.error_description // empty' 2>/dev/null)
    if [ -n "$error" ] && [ "$error" != "empty" ]; then
        echo "Error: $error"
    fi
    if [ -n "$error_desc" ] && [ "$error_desc" != "empty" ]; then
        echo "Description: $error_desc"
    fi
fi