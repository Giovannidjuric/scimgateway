curl -X POST http://localhost:8883/users \
-u gwadmin:password \
-d '{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "userName": "johndoe",
  "name": {
    "givenName": "john",
    "familyName": "doe"
  },
  "displayName": "test user",
  "emails": [
    {
    "type": "work",
    "value": "test@domain.com"
    },
    {
    "type": "home",
    "value": "test@domain.com"
    }
  ],
  "uidNumber": 65100,
  "gidNumber": 65100,
  "entitlements": [
    {
      "type": "homeDirectory",
      "value": "/home/usertest"
    },
    {
      "type": "secret",
      "value": "{CRYPT}XT954OcTlPNeI"
    }
  ]
}'