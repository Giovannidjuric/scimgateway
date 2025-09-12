# SCIM Gateway Production Changes Summary

## Overview
This document summarizes the significant functional changes made to the SCIM Gateway LDAP plugin during development and testing phases.

## Key Functional Changes

### 1. Enhanced ETag Implementation with Member Unhashing
**Files Modified:** `lib/utils.ts`, `lib/plugin-ldap.ts`

#### What Changed:
- **Enhanced ETag calculation** to use original member DNs before hashing for semantic correctness
- **Member unhashing functionality** preserves original member DNs using `_originalMembers` property
- **URL decoding support** for proper DN representation in ETag calculations

#### Technical Details:
- Groups now store original member DNs in `_originalMembers` before hashing member IDs for external API responses
- ETag calculation uses unhashed member DNs for consistent hash generation
- Added URL decoding (`decodeURIComponent`) for member DNs when needed

#### Specific Functions Added/Modified:

**`lib/plugin-ldap.ts`:**
- **Lines ~752-773**: Group processing enhancement in `getGroups()` function
  ```javascript
  // Store original member DNs for ETag calculation before hashing
  let originalMembers: any[] | undefined
  if (scimGroup.members && Array.isArray(scimGroup.members)) {
    originalMembers = scimGroup.members.map((member: any) => ({
      ...member,
      value: member.value // Keep original DN
    }))
    // Hash member DNs for external API response
    scimGroup.members = scimGroup.members.map((member: any) => {
      if (member.value && typeof member.value === 'string') {
        return { ...member, value: hashId(member.value) }
      }
      return member
    })
  }
  // Set _originalMembers for enhanced ETag generation
  if (originalMembers) {
    scimGroup._originalMembers = originalMembers
  }
  ```

**`lib/utils.ts`:**
- **`prepareHashObject()` function**: Enhanced to handle member unhashing
  ```javascript
  // Use original members for ETag calculation if available
  if (obj._originalMembers && Array.isArray(obj._originalMembers)) {
    // Create a copy with original members for hashing
    const objForHashing = { ...obj, members: obj._originalMembers }
    delete objForHashing._originalMembers
    // URL decode member DNs for semantic correctness
    if (objForHashing.members) {
      objForHashing.members = objForHashing.members.map((member: any) => ({
        ...member,
        value: typeof member.value === 'string' && member.value.includes('%') 
          ? decodeURIComponent(member.value) 
          : member.value
      }))
    }
    return objForHashing
  }
  ```

### 2. ID Hashing Functions for Security
**Files Modified:** `lib/plugin-ldap.ts`

#### What Changed:
- **ID hashing functionality** to obfuscate LDAP Distinguished Names (DNs) in external API responses
- **Unhashing functionality** to convert hashed IDs back to original DNs for internal LDAP operations
- **Cross-entity protection** to prevent unauthorized access between users and groups

#### Specific Functions Added:

**`hashId()` function:**
```javascript
function hashId(id: string): string {
  return crypto.createHash('sha256')
    .update(id, 'utf8')
    .digest('base64url')
    .substring(0, 43) // Standard base64url length for URL safety
}
```

**`unhashUserIdOnly()` function:**
```javascript
async function unhashUserIdOnly(baseEntity: string, hashedId: string, ctx: any): Promise<string> {
  // Search through users only to find matching hashed ID
  // Prevents cross-entity access (users accessing group data)
  const filter = createAndFilter(baseEntity, 'user', [])
  const users: any = await doRequest(baseEntity, 'search', userBase, { filter, scope: 'sub' }, ctx)
  
  for (const user of users) {
    const scimObj = scimgateway.endpointMapper('inbound', user, config.map.user)[0]
    if (scimObj.id && typeof scimObj.id === 'string') {
      const userIdHash = hashId(scimObj.id)
      if (userIdHash === hashedId) {
        return scimObj.id // Return original DN
      }
    }
  }
  throw new Error(`User with hashed ID ${hashedId} not found`)
}
```

**`unhashGroupIdOnly()` function:**
```javascript
async function unhashGroupIdOnly(baseEntity: string, hashedId: string, ctx: any): Promise<string> {
  // Search through groups only to find matching hashed ID
  // Prevents cross-entity access (groups accessing user data)
  const filter = createAndFilter(baseEntity, 'group', [])
  const groups: any = await doRequest(baseEntity, 'search', groupBase, { filter, scope: 'sub' }, ctx)
  
  for (const group of groups) {
    const scimObj = scimgateway.endpointMapper('inbound', group, config.map.group)[0]
    if (scimObj.id && typeof scimObj.id === 'string') {
      const groupIdHash = hashId(scimObj.id)
      if (groupIdHash === hashedId) {
        return scimObj.id // Return original DN
      }
    }
  }
  throw new Error(`Group with hashed ID ${hashedId} not found`)
}
```

#### Security Features:
- **Base64URL encoding**: Safe for use in URLs and HTTP headers
- **SHA-256 hashing**: Cryptographically secure, irreversible transformation
- **43-character length**: Consistent, URL-safe identifier length
- **Cross-entity protection**: Users cannot access group operations via ID manipulation
- **Original DN preservation**: Internal operations use real DNs, external APIs see hashed IDs

#### Usage Pattern:
1. **Outbound (LDAP → API)**: Original DN → Hash → External API response
2. **Inbound (API → LDAP)**: Hashed ID → Unhash → Original DN → LDAP operation
3. **ETag calculation**: Uses original DN for semantic correctness before hashing for response

### 3. Expanded Group Discovery Configuration
**File Modified:** `config/plugin-ldap.json`

#### What Changed:
- **GroupBase expanded** from `"ou=groups,dc=iam,dc=asml,dc=com"` to `"dc=iam,dc=asml,dc=com"`
- Enables discovery of groups across multiple organizational units (ou=groups, ou=permissions)

#### Impact:
- SCIM Gateway now discovers groups from multiple organizational units
- Supports nested group structures with different base DNs
- Maintains existing ETag functionality across expanded group scope

### 3. Multiple Email Support Investigation
**Files Added:** `create-user.sh`, test scripts

#### What Was Discovered:
- **Standard LDAP object classes limitation**: `inetOrgPerson`, `posixAccount`, etc. only support single `mail` attribute
- **Current mapping**: Only `emails.work.value` is supported via `mail` attribute
- **Multiple email types** (home, personal, etc.) are **not supported** with current LDAP schema
- When creating users with multiple emails, only "work" email type is stored; others are discarded

#### Test Scripts Added:
- `create-user.sh` - Demonstrates multiple email creation attempt
- `test-etag-functionality.sh` - Comprehensive ETag testing
- `test-user-if-match.sh` - User If-Match conditional request testing
- `test-group-if-match.sh` - Group If-Match conditional request testing

## Current Limitations

### Email Support
- **Single email per user**: Only `emails.work.value` is supported
- **Multiple email types not supported**: home, personal, etc. emails are ignored during user creation
- **LDAP schema constraint**: Standard `inetOrgPerson` object class provides only one `mail` attribute

### Potential Solutions for Multiple Emails (Not Implemented)
1. **Extended LDAP object classes**: Add mail-supporting classes like `PostfixBookMailAccount`
2. **Custom LDAP schema**: Define additional email attributes (homeEmail, personalEmail)
3. **Accept limitation**: Use only work emails for SCIM compliance

## Testing and Validation

### ETag Functionality
- ✅ **If-Match conditional requests** working correctly
- ✅ **If-None-Match conditional requests** working correctly  
- ✅ **Member unhashing** for semantic ETag correctness
- ✅ **Cross-organizational unit groups** supported
- ✅ **Hash reproduction** verified in both JavaScript and Go implementations

### Email Functionality
- ✅ **Single work email** creation and retrieval working
- ❌ **Multiple email types** not supported by current LDAP schema
- ✅ **Existing email data** properly formatted in SCIM responses

## Deployment Notes

### Configuration Changes Required
1. **Group base expansion**: Update `groupBase` in plugin configuration if multiple OU group discovery is needed
2. **Email expectations**: Inform users that only work emails are supported
3. **Testing**: Run provided test scripts to validate functionality

### No Breaking Changes
- All existing functionality preserved
- Enhanced ETag calculation maintains backward compatibility
- Group discovery expansion is additive (discovers more groups, doesn't break existing ones)

## Files Modified Summary
- `lib/utils.ts` - Enhanced ETag calculation with member unhashing
- `lib/plugin-ldap.ts` - Member unhashing implementation, group processing improvements  
- `config/plugin-ldap.json` - Expanded groupBase configuration
- **Test scripts added** - Comprehensive testing suite for validation

## LDAP Mapper Function Documentation

### `scimgateway.endpointMapper()` Function
This critical function handles the bidirectional mapping between LDAP attributes and SCIM properties using the configuration in `config/plugin-ldap.json`.

#### Function Signature:
```javascript
scimgateway.endpointMapper(direction, object, mappingConfig)
```

#### Parameters:
- **`direction`**: `'inbound'` (LDAP → SCIM) or `'outbound'` (SCIM → LDAP)
- **`object`**: The data object to transform
- **`mappingConfig`**: Mapping configuration from `config.map.user` or `config.map.group`

#### Usage Examples:

**Inbound Mapping (LDAP → SCIM):**
```javascript
// Convert LDAP user object to SCIM format
const scimObj = scimgateway.endpointMapper('inbound', user, config.map.user)[0]
// LDAP: { cn: "john", mail: "john@example.com", sn: "doe" }
// SCIM: { userName: "john", emails: { work: { value: "john@example.com" }}, name: { familyName: "doe" } }
```

**Outbound Mapping (SCIM → LDAP):**
```javascript
// Convert SCIM user object to LDAP format  
const [endpointObj] = scimgateway.endpointMapper('outbound', userObj, config.map.user)
// SCIM: { userName: "john", emails: { work: { value: "john@example.com" }}}
// LDAP: { cn: "john", mail: "john@example.com" }
```

#### Configuration Mapping (from `config/plugin-ldap.json`):
```json
{
  "map": {
    "user": {
      "cn": { "mapTo": "userName", "type": "string" },
      "mail": { "mapTo": "emails.work.value", "type": "string" },
      "sn": { "mapTo": "name.familyName", "type": "string" },
      "givenName": { "mapTo": "name.givenName", "type": "string" },
      "member": { "mapTo": "members.value", "type": "array" }
    }
  }
}
```

#### Key Features:
- **Bidirectional transformation**: Same config handles both LDAP↔SCIM conversions
- **Type handling**: Supports string, array, integer types
- **Nested properties**: Maps to complex SCIM structures like `emails.work.value`
- **Array processing**: Handles multi-valued LDAP attributes (like group members)
- **Used extensively**: Called in `getUsers()`, `createUser()`, `modifyUser()`, `getGroups()`, etc.

#### Integration with Enhanced ETag:
The mapper function works seamlessly with the enhanced ETag implementation:
1. **Inbound**: LDAP data → SCIM format → ETag calculation with original members
2. **Outbound**: SCIM data → LDAP format → store in LDAP with proper attribute mapping

---
*This summary covers functional changes only. Authentication configurations, credentials, and environment-specific settings are excluded as they differ between development and production environments.*