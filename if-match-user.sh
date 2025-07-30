USER_DATA=$(curl -X GET http://localhost:8883/Users/0GOVozFLd3csNqPYItMwpCKE4ydJ7LySWG5wiPjalMU -u gwadmin:password | jq)
USER_ETAG=$(echo "$USER_DATA" | jq -r '.meta.version')

echo $USER_DATA | jq 
echo ""
echo "ETag: $USER_ETAG"
echo ""

echo "Testing If-Match with correct ETag..."
curl -v -X GET http://localhost:8883/Users/0GOVozFLd3csNqPYItMwpCKE4ydJ7LySWG5wiPjalMU \
-u gwadmin:password \
-H "If-Match: $USER_ETAG" > /dev/null

echo ""
echo "Testing If-Match with wrong ETag..."
curl -v -X GET http://localhost:8883/Users/0GOVozFLd3csNqPYItMwpCKE4ydJ7LySWG5wiPjalMU \
-u gwadmin:password \
-H "If-Match: W/\"wrong-etag-123\"" > /dev/null

