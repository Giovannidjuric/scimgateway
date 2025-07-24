# ETag Integration Guide

## Overview

The enhanced ETag functionality requires caching the mapping between hashed IDs and plain DNs so that the ETag calculation can determine the organizational unit without exposing the plain DN to external consumers.

## Integration Steps

### 1. Import the Helper Functions

Add these imports to your `plugin-ldap.ts`:

```typescript
import { cacheDnMapping, hashId as utilHashId } from '../etag/unhash-helper'
import { getEtag } from '../etag/utils'
```

### 2. Update Your hashId Function

Replace your existing `hashId` function with the one from the helper, or modify it to cache the mappings:

```typescript
// In plugin-ldap.ts - replace existing hashId or add caching
const hashId = (dn: string): string => {
  if (!dn || typeof dn !== 'string') {
    throw new Error('hashId() requires a valid DN string')
  }
  const normalizedDn = dn.toLowerCase().trim()
  const hash = crypto.createHash('sha256')
  hash.update(normalizedDn, 'utf8')
  const hashedId = hash.digest('base64url')
  
  // Cache the mapping for ETag functionality
  cacheDnMapping(hashedId, normalizedDn)
  
  return hashedId
}
```

### 3. Update Your getUsers Function

Modify your getUsers function to use the enhanced ETag:

```typescript
// In getUsers function
const scimObj = scimgateway.endpointMapper('inbound', user, config.map.user)[0]

// Set the hashed ID (this automatically caches the mapping)
scimObj.id = hashId(user.dn)

// Calculate ETag using the enhanced function
const etag = getEtag(scimObj) // This will internally resolve the hashed ID to plain DN

// The scimObj.id remains hashed for external consumers
// The plainDn is NOT exposed in the response
```

### 4. Update Your getGroups Function

Similarly for groups:

```typescript
// In getGroups function  
const scimObj = scimgateway.endpointMapper('inbound', group, config.map.group)[0]

// Set the hashed ID (this automatically caches the mapping)
scimObj.id = hashId(group.dn)

// Calculate ETag using the enhanced function
const etag = getEtag(scimObj) // This will internally resolve the hashed ID to plain DN

// The scimObj.id remains hashed for external consumers
// The plainDn is NOT exposed in the response
```

## Example Usage

```typescript
// When processing a user from LDAP
const user = {
  dn: 'cn=johndoe,ou=users,dc=iam,dc=asml,dc=com',
  cn: 'johndoe',
  givenName: 'John',
  sn: 'Doe',
  mail: 'john@example.com'
}

// Create SCIM object
const scimObj = {
  userName: user.cn,
  name: {
    givenName: user.givenName,
    familyName: user.sn
  },
  emails: [{
    type: 'work',
    value: user.mail
  }]
}

// Set hashed ID (this caches the DN mapping)
scimObj.id = hashId(user.dn) // "0GOVozFLd3csNqPYItMwpCKE4ydJ7LySWG5wiPjalMU"

// Generate ETag using enhanced function
const etag = getEtag(scimObj) // Internally resolves hash to determine it's a user

// Response to client
return {
  id: "0GOVozFLd3csNqPYItMwpCKE4ydJ7LySWG5wiPjalMU", // Hashed - secure
  userName: "johndoe",
  name: { givenName: "John", familyName: "Doe" },
  emails: [{ type: "work", value: "john@example.com" }],
  meta: {
    version: 'W/"abc123def456789012345"', // ETag based on selected fields only
    resourceType: "User",
    location: "http://localhost:8883/users/0GOVozFLd3csNqPYItMwpCKE4ydJ7LySWG5wiPjalMU"
  }
}
// Note: Plain DN is NEVER exposed to external consumers
```

## Architecture Benefits

1. **🔒 Security**: Plain DNs are never exposed externally
2. **⚡ Performance**: ETag calculation only uses relevant fields
3. **🎯 Precision**: ETags only change when meaningful data changes
4. **🔧 Maintainable**: Clear separation between hashing and ETag logic
5. **🔄 Backward Compatible**: Works with existing API consumers

## Cache Management

The DN mapping cache is in-memory and will be cleared on server restart. For production:

1. Consider persisting the cache to disk/database
2. Implement cache expiration policies
3. Add cache cleanup for deleted entities

## Testing

Test the integration:

```bash
# Get user - should return hashed ID but correct ETag
curl -X GET http://localhost:8883/users/0GOVozFLd3csNqPYItMwpCKE4ydJ7LySWG5wiPjalMU -u gwadmin:password

# Response should show:
# - id: hashed value (secure)
# - meta.version: ETag based on userName, name, emails only
# - No plainId or DN exposed
```