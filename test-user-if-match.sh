#!/bin/bash

# Simple User If-Match Test Script
echo "=== User If-Match Test ==="

# Get first user
echo "1. Getting first user..."
USER_DATA=$(curl -s -u gwadmin:password -H "Accept: application/scim+json" http://localhost:8883/Users | jq '.Resources[0]')
USER_ID=$(echo "$USER_DATA" | jq -r '.id')
USER_ETAG=$(echo "$USER_DATA" | jq -r '.meta.version')
USER_NAME=$(echo "$USER_DATA" | jq -r '.userName')

echo "   User: $USER_NAME"
echo "   ID: $USER_ID"
echo "   ETag: $USER_ETAG"
echo

# Test 1: If-Match with correct ETag (should return 200)
echo "2. Testing If-Match with correct ETag (should return 200)..."
curl -s -w \
  -u gwadmin:password \
  -H "Accept: application/scim+json" \
  -H "If-Match: $USER_ETAG" \
  http://localhost:8883/Users/$USER_ID > /dev/null

echo

# Test 2: If-Match with wrong ETag (should return 412)
echo "3. Testing If-Match with wrong ETag (should return 412)..."
curl -s -w "Status: %{http_code}\n" \
  -u gwadmin:password \
  -H "Accept: application/scim+json" \
  -H "If-Match: W/\"wrong-etag-123\"" \
  http://localhost:8883/Users/$USER_ID > /dev/null

echo

# Test 3: If-None-Match with correct ETag (should return 304)
echo "4. Testing If-None-Match with correct ETag (should return 304)..."
curl -s -w "Status: %{http_code}\n" \
  -u gwadmin:password \
  -H "Accept: application/scim+json" \
  -H "If-None-Match: $USER_ETAG" \
  http://localhost:8883/Users/$USER_ID > /dev/null

echo

echo "=== User Test Complete ==="