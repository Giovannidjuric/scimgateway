#!/bin/bash


JWKS_URL="https://${KEYCLOAK_ADDRESS}${KEYCLOAK_SUBPATH}/realms/${INSTANCE}/protocol/openid-connect/certs"
TEMP_CERT_FILE="/dev/shm/pubkey_$$_$(date +%s).pem"

cleanup() {
    [[ -f "$TEMP_CERT_FILE" ]] && rm -f "$TEMP_CERT_FILE"
}
trap cleanup EXIT

# Get access token
ACCESS_TOKEN=$(curl -k -s -X POST "https://${KEYCLOAK_ADDRESS}${KEYCLOAK_SUBPATH}/realms/${INSTANCE}/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=${CLIENT_NAME}" \
    -d "client_secret=${CLIENT_SECRET}" \
    -d "grant_type=client_credentials" 2>/dev/null | jq -r '.access_token // empty' 2>/dev/null)

if [[ -z "$ACCESS_TOKEN" || "$ACCESS_TOKEN" == "null" ]]; then
    echo '{"result": 1, "error": "failed to obtain access token"}'
    exit 1
fi

# # Extract KID from token header
# JWT_KID=$(jwt decode --json "$ACCESS_TOKEN" 2>/dev/null | jq -r '.header.kid // empty' 2>/dev/null)
# if [[ -z "$JWT_KID" ]]; then
#     echo '{"result": 1, "error": "failed to extract kid from token"}'
#     exit 1
# fi

# # Get X.509 certificate from JWKS endpoint
# X509_CERT=$(curl -sk "$JWKS_URL" 2>/dev/null | jq -r --arg kid "$JWT_KID" '.keys[] | select(.kid == $kid) | .x5c[0] // empty' 2>/dev/null)
# if [[ -z "$X509_CERT" ]]; then
#     echo '{"result": 1, "error": "failed to retrieve certificate from jwks"}'
#     exit 1
# fi

# # Create certificate in RAM
# {
#     echo "-----BEGIN CERTIFICATE-----"
#     echo "$X509_CERT"
#     echo "-----END CERTIFICATE-----"
# } > "$TEMP_CERT_FILE" 2>/dev/null

# # Verify token signature
# if ! jwt decode --secret "@$TEMP_CERT_FILE" "$ACCESS_TOKEN" >/dev/null 2>&1; then
#     echo '{"result": 1, "error": "token signature verification failed"}'
#     exit 1
# fi

# # Check token expiration
# EXP_TIME=$(jwt decode --json "$ACCESS_TOKEN" 2>/dev/null | jq -r '.payload.exp // empty' 2>/dev/null)
# if [[ -n "$EXP_TIME" ]]; then
#     CURRENT_TIME=$(date +%s)
#     if [[ $EXP_TIME -le $CURRENT_TIME ]]; then
#         echo '{"result": 1, "error": "token has expired"}'
#         exit 1
#     fi
# fi

echo "{\"result\": \"$ACCESS_TOKEN\", \"error\": null}"