#!/bin/bash

# Simple Group If-Match Test Script
echo "=== Group If-Match Test ==="

# Get first group
echo "1. Getting first group..."
GROUP_DATA=$(curl -s -u gwadmin:password -H "Accept: application/scim+json" http://localhost:8883/Groups | jq '.Resources[0]')
GROUP_ID=$(echo "$GROUP_DATA" | jq -r '.id')
GROUP_ETAG=$(echo "$GROUP_DATA" | jq -r '.meta.version')
GROUP_NAME=$(echo "$GROUP_DATA" | jq -r '.displayName')

echo "   Group: $GROUP_NAME"
echo "   ID: $GROUP_ID"
echo "   ETag: $GROUP_ETAG"
echo

# Test 1: If-Match with correct ETag (should return 200)
echo "2. Testing If-Match with correct ETag (should return 200)..."
curl -s -w "Status: %{http_code}\n" \
  -u gwladmin:password \
  -H "Accept: application/scim+json" \
  -H "If-Match: $GROUP_ETAG" \
  http://localhost:8883/Groups/$GROUP_ID > /dev/null

echo

# Test 2: If-Match with wrong ETag (should return 412)
echo "3. Testing If-Match with wrong ETag (should return 412)..."
curl -s -w "Status: %{http_code}\n" \
  -u gwladmin:password \
  -H "Accept: application/scim+json" \
  -H "If-Match: W/\"wrong-etag-123\"" \
  http://localhost:8883/Groups/$GROUP_ID > /dev/null

echo

# Test 3: If-None-Match with correct ETag (should return 304)
echo "4. Testing If-None-Match with correct ETag (should return 304)..."
curl -s -w "Status: %{http_code}\n" \
  -u gwladmin:password \
  -H "Accept: application/scim+json" \
  -H "If-None-Match: $GROUP_ETAG" \
  http://localhost:8883/Groups/$GROUP_ID > /dev/null

echo

echo "=== Group Test Complete ==="