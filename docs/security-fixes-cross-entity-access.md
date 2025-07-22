# Security Fix: Cross-Entity Access Vulnerability Prevention

## Overview

Fixed critical security vulnerabilities in the SCIM LDAP plugin where cross-entity access was possible between users and groups. Previously, requesting `/groups/<userHashedId>` would incorrectly return user data formatted as a group, and `/users/<groupHashedId>` would return group data as a user.

## Vulnerability Description

**Issue**: The generic `unhashId()` function searched both users and groups, allowing cross-entity access:
- GET `/groups/userHashedId` → returned user data as group
- GET `/users/groupHashedId` → returned group data as user  
- DELETE/PATCH operations on wrong entity types could succeed

**Impact**: Data leakage, unauthorized access, potential security bypass

## Solution

Created entity-specific unhashing functions that maintain full functionality while restricting searches to appropriate entity types.

## Files Modified

### `/lib/plugin-ldap.ts`

#### 1. New Security Functions Added (lines 1166-1278)

```typescript
// Entity-specific unhashing functions for security
const unhashUserIdOnly = async (baseEntity: string, hashedId: string, ctx: any): Promise<string>
const unhashGroupIdOnly = async (baseEntity: string, hashedId: string, ctx: any): Promise<string>
```

**Purpose**: Replace generic `unhashId()` calls with entity-specific versions that only search within the correct entity type.

#### 2. User Operations Secured

**getUsers function (line 165)**:
```typescript
// Before: base = await unhashId(baseEntity, getObj.value, ctx)
// After:  base = await unhashUserIdOnly(baseEntity, getObj.value, ctx)
```

**deleteUser function (line 380)**:
```typescript
// Before: base = await unhashId(baseEntity, id, ctx)  
// After:  base = await unhashUserIdOnly(baseEntity, id, ctx)
```

**modifyUser function (lines 433, 477, 516)** - 3 locations:
```typescript
// Before: base = await unhashId(baseEntity, id, ctx)
// After:  base = await unhashUserIdOnly(baseEntity, id, ctx)
```

#### 3. Group Operations Secured  

**getGroups function (line 632)**:
```typescript
// Before: base = await unhashId(baseEntity, getObj.value, ctx)
// After:  base = await unhashGroupIdOnly(baseEntity, getObj.value, ctx)
```

**deleteGroup function (line 850)**:
```typescript
// Before: base = await unhashId(baseEntity, id, ctx)
// After:  base = await unhashGroupIdOnly(baseEntity, id, ctx)
```

**modifyGroup function (line 912)**:
```typescript
// Before: base = await unhashId(baseEntity, id, ctx)
// After:  base = await unhashGroupIdOnly(baseEntity, id, ctx)
```

#### 4. Member Operations (Preserved Generic Access)

**Maintained generic `unhashId()` for member operations to support OpenLDAP nested groups**:

- `createGroup` (line 790): Groups can contain both users and other groups
- `modifyGroup` member handling (line 895): Support mixed membership  
- `getGroups` getMemberOfGroups (line 712): Allow querying by user or group membership

## Security Model

### Protected Operations (Entity-Specific)
- ✅ **GET/DELETE/PATCH users** → Only searches user entities
- ✅ **GET/DELETE/PATCH groups** → Only searches group entities  
- ✅ **Cross-entity access attempts** → Return 404/500 errors

### Preserved Functionality (Generic Access)
- ✅ **Group membership** → Supports users and nested groups
- ✅ **OpenLDAP compliance** → Maintains nested group hierarchies
- ✅ **Member operations** → Full flexibility for group contents

## Testing Results

**Security Tests Passed**:
- ❌ GET `/groups/userHashedId` → Returns 404 (was: user data as group)
- ❌ GET `/users/groupHashedId` → Returns 404 (was: group data as user)  
- ❌ DELETE/PATCH wrong entity types → Properly rejected

**Functionality Tests Passed**:
- ✅ Normal user/group operations → Working correctly
- ✅ Nested groups → Users and groups can be group members
- ✅ Mixed membership → Groups containing both users and groups
- ✅ All CRUD operations → Maintain full legitimate functionality

## Implementation Details

- **Dual search approach**: Each entity-specific function tries efficient DN search first, then falls back to full SCIM mapper processing for maximum compatibility
- **Proper error handling**: Clear error messages indicating entity type mismatches
- **Backward compatibility**: All legitimate operations continue to work as before
- **Performance optimized**: Minimal overhead for security checks

## Verification Commands

```bash
# Test cross-entity access prevention (should fail)
curl -X GET http://localhost:8883/groups/userHashedId -u gwadmin:password
curl -X GET http://localhost:8883/users/groupHashedId -u gwadmin:password

# Test normal operations (should work)  
curl -X GET http://localhost:8883/users/userHashedId -u gwadmin:password
curl -X GET http://localhost:8883/groups/groupHashedId -u gwadmin:password

# Test nested groups (should work)
curl -X PATCH http://localhost:8883/groups/groupId -H "Content-Type: application/json" \
  -d '{"Operations":[{"op":"add","path":"members","value":[{"value":"anotherGroupId"}]}]}'
```

## Summary

This security fix eliminates cross-entity access vulnerabilities while preserving all legitimate SCIM LDAP functionality, including OpenLDAP's nested group capabilities. The implementation provides comprehensive protection without breaking existing workflows or reducing functionality.