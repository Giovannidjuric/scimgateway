# SCIM Gateway Permissions Route Documentation

## Overview

The `/permissions` route provides SCIM 2.0 compliant access to permission objects stored under `ou=permissions,ou=groups,dc=iam,dc=asml,dc=com` in the LDAP directory. This route was implemented to separate permissions from regular groups while maintaining full CRUD functionality.

## Architecture

### Route Configuration

**File**: `lib/scimgateway.ts`

The permissions route is configured in the handlers array:

```typescript
handler.Permissions = handler.permissions = {
  description: 'Permission',
  getMethod: 'getPermissions',
  modifyMethod: 'modifyPermission', 
  createMethod: 'createPermission',
  deleteMethod: 'deletePermission',
}
```

### LDAP Configuration

**File**: `config/plugin-ldap.json`

```json
{
  "endpoint": {
    "entity": {
      "undefined": {
        "ldap": {
          "permissionBase": "ou=permissions,ou=groups,dc=iam,dc=asml,dc=com",
          "groupBase": "ou=groups,dc=iam,dc=asml,dc=com"
        }
      }
    },
    "map": {
      "permission": {
        "dn": {
          "mapTo": "id",
          "type": "string"
        },
        "cn": {
          "mapTo": "displayName",
          "type": "string"
        },
        "gidNumber": {
          "mapTo": "gidNumber",
          "type": "integer"
        },
        "member": {
          "mapTo": "members.value",
          "type": "array"
        }
      }
    }
  }
}
```

## Implementation Details

### Core Functions

**File**: `lib/plugin-ldap.ts`

#### 1. getPermissions (lines ~1065+)
- **Purpose**: Retrieve permissions from LDAP
- **Base DN**: `ou=permissions,ou=groups,dc=iam,dc=asml,dc=com`
- **Scope**: `sub` (searches all levels under permissions OU)
- **Filter**: `(&(cn=*)(objectClass=groupOfNames)(objectClass=top))`
- **Features**:
  - ID hashing for security using `hashId()`
  - ETag generation for version control
  - Member ID hashing (DNs converted to secure hashed IDs)

#### 2. createPermission (lines ~1281+)
- **Purpose**: Create new permission in LDAP
- **Process**:
  1. Generate next UID using counter client
  2. Build LDAP entry with required attributes
  3. Hash DN before calling `getPermissions` to avoid "unhashGroupIdOnly error"
- **Attributes**: `cn`, `objectClass`, `gidNumber`, `member`

#### 3. deletePermission (lines ~1339+)
- **Purpose**: Delete permission from LDAP
- **Uses**: Standard `unhashId` function (not `unhashGroupIdOnly`)

#### 4. modifyPermission (lines ~1365+)
- **Purpose**: Modify permission members and attributes
- **Pattern**: Follows exact same logic as `modifyGroup` for consistency
- **Process**:
  1. Resolve member attribute using `endpointMapper`
  2. Process members array directly (before transformation)
  3. Unhash member IDs to original DNs
  4. Build separate add/remove arrays
  5. Execute LDAP operations (add, delete, replace)

## Key Design Decisions

### 1. Separation from Groups
- **Groups Base**: `ou=groups,dc=iam,dc=asml,dc=com`
- **Permissions Base**: `ou=permissions,ou=groups,dc=iam,dc=asml,dc=com`
- **Groups Scope**: `one` (prevents descending into permissions subtree)
- **Permissions Scope**: `sub` (searches within permissions subtree)

### 2. ID Management
- Uses `unhashId()` instead of `unhashGroupIdOnly()` to support cross-entity access
- All DNs are hashed using `hashId(encodeURIComponent(dn))` for security
- Member IDs are properly unhashed before LDAP operations

### 3. PATCH Operations Support
Both ADD and DELETE operations work via SCIM 2.0 PATCH:

**Add Member**:
```json
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [{
    "op": "add",
    "path": "members", 
    "value": [{"value": "HASHED_USER_ID"}]
  }]
}
```

**Remove Member**:
```json
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [{
    "op": "remove",
    "path": "members",
    "value": [{"value": "HASHED_USER_ID", "operation": "delete"}]
  }]
}
```

## API Endpoints

### GET /permissions
- **Purpose**: List all permissions
- **Returns**: Array of permission objects with hashed IDs
- **Features**: Pagination, filtering, ETag support

### GET /permissions/{id}
- **Purpose**: Get specific permission by ID
- **ID Format**: Base64-encoded hashed DN
- **Returns**: Single permission object

### POST /permissions
- **Purpose**: Create new permission
- **Required**: `displayName`
- **Optional**: `members`, `gidNumber`
- **Returns**: Created permission object

### PATCH /permissions/{id}
- **Purpose**: Modify permission (add/remove members, update attributes)
- **Supports**: SCIM 2.0 PATCH operations
- **Returns**: Modified permission object or 204 No Content

### DELETE /permissions/{id}
- **Purpose**: Delete permission
- **Returns**: 204 No Content

## Security Features

### 1. ID Hashing
- All LDAP DNs are converted to secure hashed IDs
- Uses URL encoding before hashing: `hashId(encodeURIComponent(dn))`
- Prevents direct DN exposure in API responses

### 2. ETag Support
- Each permission has version control via ETag
- ETag changes when permission is modified
- Supports optimistic locking

### 3. Access Control
- Uses same authentication as groups (basic auth, JWT, etc.)
- Respects `readOnly` and `baseEntities` configuration

## Testing

### Successful Test Cases
1. **List Permissions**: `GET /permissions` ✅
2. **Get Permission**: `GET /permissions/{id}` ✅
3. **Create Permission**: `POST /permissions` ✅
4. **Add Member**: `PATCH /permissions/{id}` with add operation ✅
5. **Remove Member**: `PATCH /permissions/{id}` with remove operation ✅
6. **Delete Permission**: `DELETE /permissions/{id}` ✅

### Example Test Commands

```bash
# List all permissions
curl -X GET "http://localhost:8883/permissions" \
  -H "Authorization: Basic Z3dhZG1pbjpwYXNzd29yZA=="

# Add member to permission
curl -X PATCH "http://localhost:8883/permissions/PERMISSION_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic Z3dhZG1pbjpwYXNzd29yZA==" \
  -d '{
    "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
    "Operations": [{
      "op": "add",
      "path": "members",
      "value": [{"value": "USER_HASHED_ID"}]
    }]
  }'
```

## Troubleshooting

### Common Issues

1. **"unhashGroupIdOnly error"**: 
   - **Cause**: Using wrong unhashing function
   - **Solution**: Use `unhashId()` instead of `unhashGroupIdOnly()`

2. **"modification must be an Attribute"**:
   - **Cause**: Wrong LDAP attribute structure
   - **Solution**: Follow `modifyGroup` pattern exactly

3. **Empty members array**:
   - **Cause**: Member IDs not being unhashed properly
   - **Solution**: Process members before `endpointMapper` transformation

### Debug Logging
- Enable debug logging in `plugin-ldap.json`: `"loglevel": {"console": "debug"}`
- Look for `unhashId`, `doRequest`, and `modifyPermission` log entries

## Dependencies

- **Counter Client**: `lib/ldap-counter-client.ts` for UID generation
- **Utils**: `lib/utils.ts` for hashing functions
- **LDAP Client**: `ldapjs` for LDAP operations
- **SCIM Gateway**: Core SCIM 2.0 compliance

## Future Enhancements

1. **Bulk Operations**: Support for bulk member add/remove
2. **Advanced Filtering**: More sophisticated query capabilities  
3. **Nested Groups**: Support for permission hierarchies
4. **Audit Logging**: Track permission changes
5. **Performance**: Caching for frequently accessed permissions

---
