# How to Add New Routes to SCIM Gateway

## Overview

This guide provides step-by-step instructions for adding new SCIM 2.0 compliant routes to the SCIM Gateway, using the implementation of `/permissions` as a reference. This process allows you to expose different LDAP organizational units as separate API endpoints.

## Example: Adding a `/roles` Route

We'll use adding a `/roles` route as a concrete example, assuming roles are stored under `ou=roles,ou=groups,dc=iam,dc=asml,dc=com`.

---

## Step 1: Update Route Handler Configuration

**File**: `lib/scimgateway.ts`

### 1.1 Add Handler Definition

Find the handlers array and add your new route handler:

```typescript
// Around line where other handlers are defined
handler.Roles = handler.roles = {
  description: 'Role',
  getMethod: 'getRoles',
  modifyMethod: 'modifyRole', 
  createMethod: 'createRole',
  deleteMethod: 'deleteRole',
}
```

### 1.2 Verify HTTP Method Routing

Ensure all HTTP methods include your new route. Look for these sections and verify they handle your route:

- `app.get('/:baseEntity?/:id?/:attribute?', ...)` - Should handle `/roles`
- `app.post('/:baseEntity', ...)` - Should handle `POST /roles`
- `app.patch('/:baseEntity/:id', ...)` - Should handle `PATCH /roles/{id}`
- `app.put('/:baseEntity/:id', ...)` - Should handle `PUT /roles/{id}`
- `app.delete('/:baseEntity/:id', ...)` - Should handle `DELETE /roles/{id}`

The existing generic routing should automatically pick up your new handler.

---

## Step 2: Update LDAP Configuration

**File**: `config/plugin-ldap.json`

### 2.1 Add Base DN Configuration

In the `ldap` section, add your role base:

```json
{
  "endpoint": {
    "entity": {
      "undefined": {
        "ldap": {
          "userBase": "ou=users,dc=iam,dc=asml,dc=com",
          "groupBase": "ou=groups,dc=iam,dc=asml,dc=com",
          "permissionBase": "ou=permissions,ou=groups,dc=iam,dc=asml,dc=com",
          "roleBase": "ou=roles,ou=groups,dc=iam,dc=asml,dc=com"
        }
      }
    }
  }
}
```

### 2.2 Add Attribute Mapping

In the `map` section, add your role mapping:

```json
{
  "endpoint": {
    "map": {
      "user": { /* existing user mapping */ },
      "group": { /* existing group mapping */ },
      "permission": { /* existing permission mapping */ },
      "role": {
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

---

## Step 3: Implement LDAP Functions

**File**: `lib/plugin-ldap.ts`

### 3.1 Implement getRoles Function

Add this function after the existing get functions:

```typescript
// =================================================
// getRoles
// =================================================
scimgateway.getRoles = async (baseEntity, getObj, attributes, ctx) => {
  const action = 'getRoles'
  scimgateway.logDebug(baseEntity, `handling ${action} getObj=${JSON.stringify(getObj)} attributes=${attributes}`)

  if (!config.entity[baseEntity]) throw new Error(`unsupported baseEntity: ${baseEntity}`)
  if (!config.entity[baseEntity].ldap?.roleBase) {
    throw new Error(`${action} error: missing configuration ldap.roleBase`)
  }

  const method = 'search'
  const base = config.entity[baseEntity].ldap.roleBase
  const scope = 'sub'
  const [attrs] = scimgateway.endpointMapper('outbound', attributes, config.map.role)
  const filter = getObj?.attribute && getObj?.value
    ? `(&(${getObj.attribute}=${getObj.value})(objectClass=groupOfNames)(objectClass=top))`
    : '(&(cn=*)(objectClass=groupOfNames)(objectClass=top))'

  try {
    const ldapOptions = {
      filter,
      scope,
      attributes: attrs,
    }
    const result = await doRequest(baseEntity, method, base, ldapOptions, ctx)
    if (!result || !Array.isArray(result)) {
      return { Resources: [], totalResults: 0 }
    }

    const roles = result.map(role => {
      const scimRole = scimgateway.endpointMapper('inbound', role, config.map.role)[0]
      
      // Hash the DN for security
      if (scimRole.id) {
        scimRole.id = hashId(encodeURIComponent(scimRole.id))
      }

      // Hash member DNs
      if (scimRole.members && Array.isArray(scimRole.members)) {
        scimRole.members = scimRole.members.map(member => ({
          value: typeof member === 'string' ? hashId(encodeURIComponent(member)) : 
                 member.value ? hashId(encodeURIComponent(member.value)) : member
        }))
      }

      // Add metadata
      scimRole.meta = {
        location: scimRole.id ? `${ctx.protocol}://${ctx.host}:${ctx.port}/roles/${scimRole.id}` : undefined
      }

      return scimRole
    })

    return {
      Resources: roles,
      totalResults: roles.length
    }
  } catch (err: any) {
    throw new Error(`${action} error: ${err.message}`)
  }
}
```

### 3.2 Implement createRole Function

```typescript
// =================================================
// createRole
// =================================================
scimgateway.createRole = async (baseEntity, roleObj, ctx) => {
  const action = 'createRole'
  scimgateway.logDebug(baseEntity, `handling ${action} roleObj=${JSON.stringify(roleObj)}`)

  if (!config.entity[baseEntity]) throw new Error(`unsupported baseEntity: ${baseEntity}`)
  if (!config.entity[baseEntity].ldap?.roleBase) {
    throw new Error(`${action} error: missing configuration ldap.roleBase`)
  }

  const method = 'add'
  const base = `cn=${roleObj.displayName},${config.entity[baseEntity].ldap.roleBase}`

  try {
    // Get next UID
    const counterClient = new LdapCounterClient({
      url: config.entity[baseEntity].baseUrls[0],
      bindDN: config.entity[baseEntity].username,
      bindPassword: await utils.getPassword(`scimgateway.${baseEntity}.password`, configFile),
      counterDN: config.entity[baseEntity].ldap.counterDN
    })
    
    const nextUid = await counterClient.getNextUid()
    await counterClient.incrementCounter(nextUid)
    await counterClient.disconnect()

    const ldapObj = {
      cn: roleObj.displayName,
      objectClass: ['groupOfNames', 'top'],
      gidNumber: nextUid.toString(),
      member: roleObj.members ? roleObj.members.map(m => m.value || m) : ['cn=admin,dc=iam,dc=asml,dc=com']
    }

    await doRequest(baseEntity, method, base, ldapObj, ctx)
    
    // Return the created role
    const hashedId = hashId(encodeURIComponent(base))
    const res = await scimgateway.getRoles(baseEntity, { attribute: 'id', operator: 'eq', value: hashedId }, [], ctx)
    if (res && Array.isArray(res.Resources) && res.Resources.length === 1) return res.Resources[0]
    else return null
  } catch (err: any) {
    throw new Error(`${action} error: ${err.message}`)
  }
}
```

### 3.3 Implement deleteRole Function

```typescript
// =================================================
// deleteRole
// =================================================
scimgateway.deleteRole = async (baseEntity, id, ctx) => {
  const action = 'deleteRole'
  scimgateway.logDebug(baseEntity, `handling ${action} id=${id}`)

  let base
  if (config.useSID_id || config.useGUID_id) base = id
  else {
    base = await unhashId(baseEntity, id, ctx)
    if (typeof base === 'string' && base.includes('%')) {
      base = decodeURIComponent(base)
    }
  }

  const method = 'del'

  try {
    await doRequest(baseEntity, method, base, {}, ctx)
    return null
  } catch (err: any) {
    throw new Error(`${action} error: ${err.message}`)
  }
}
```

### 3.4 Implement modifyRole Function

```typescript
// =================================================
// modifyRole
// =================================================
scimgateway.modifyRole = async (baseEntity, id, attrObj, ctx) => {
  const action = 'modifyRole'
  scimgateway.logDebug(baseEntity, `handling ${action} id=${id} attrObj=${JSON.stringify(attrObj)}`)

  if (!config.map.role) throw new Error(`${action} error: missing configuration endpoint.map.role`)
  if (attrObj.members && !Array.isArray(attrObj.members)) {
    throw new Error(`${action} error: ${JSON.stringify(attrObj)} - correct syntax is { "members": [...] }`)
  }

  const [memberAttr] = scimgateway.endpointMapper('outbound', 'members.value', config.map.role)
  if (!memberAttr && attrObj.members) throw new Error(`${action} error: missing attribute mapping configuration for role members`)

  const role: any = { add: {}, remove: {} }
  role.add[memberAttr] = []
  role.remove[memberAttr] = []

  for (let i = 0; i < attrObj?.members?.length; i++) {
    const el = attrObj.members[i]
    if (config.useSID_id || config.useGUID_id) {
      const dn = await sidGuidToDn(baseEntity, el.value, ctx)
      if (!dn) throw new Error(`${action} error: sidGuidToDn() did not return any objectGUID value for dn=${el.value}`)
      el.value = dn
    } else {
      // For OpenLDAP with DN-based IDs, unhash the member ID to get the original DN
      el.value = await unhashId(baseEntity, el.value, ctx)
      if (typeof el.value === 'string' && el.value.includes('%')) {
        el.value = decodeURIComponent(el.value)
      }
    }
    if (el.operation && el.operation === 'delete') {
      role.remove[memberAttr].push(el.value)
    } else {
      role.add[memberAttr].push(el.value)
    }
  }

  const method = 'modify'
  let base
  if (config.useSID_id) base = `<SID=${id}>`
  else if (config.useGUID_id) base = `<GUID=${id}>`
  else {
    base = await unhashId(baseEntity, id, ctx)
    if (typeof base === 'string' && base.includes('%')) {
      base = decodeURIComponent(base)
    }
  }

  try {
    delete attrObj.members
    const [endpointObj] = scimgateway.endpointMapper('outbound', attrObj, config.map.role)
    const newDN = checkIfNewDN(baseEntity, base, 'role', attrObj, endpointObj)
    
    if (Object.keys(endpointObj).length > 0) {
      const ldapOptions = {
        operation: 'replace',
        modification: endpointObj,
      }
      await doRequest(baseEntity, method, base, ldapOptions, ctx)
    }
    
    if (role.add[memberAttr].length > 0) {
      const ldapOptions = {
        operation: 'add',
        modification: role.add,
      }
      await doRequest(baseEntity, method, base, ldapOptions, ctx)
    }
    
    if (role.remove[memberAttr].length > 0) {
      const ldapOptions = {
        operation: 'delete',
        modification: role.remove,
      }
      await doRequest(baseEntity, method, base, ldapOptions, ctx)
    }
    
    if (newDN && config.entity[baseEntity].ldap.allowModifyDN) {
      await doRequest(baseEntity, 'modifyDN', base, { modification: { newDN } }, ctx)
      const getObj = { attribute: 'id', operator: 'eq', value: newDN }
      const res = await scimgateway.getRoles(baseEntity, getObj, [], ctx)
      return res
    }
    return null
  } catch (err: any) {
    throw new Error(`${action} error: ${err.message}`)
  }
}
```

---

## Step 4: Add Helper Functions (If Needed)

If your new route needs specific helper functions (like permissions had `getMemberOfPermissions`), add them after your main functions:

```typescript
// Helper function for getting member-of roles (if needed)
const getMemberOfRoles = async (baseEntity: string, userDn: string, ctx?: any): Promise<any[]> => {
  if (!config.entity[baseEntity]?.ldap?.roleBase) {
    return []
  }
  
  try {
    const method = 'search'
    const base = config.entity[baseEntity].ldap.roleBase
    const scope = 'sub'
    const [attrs] = scimgateway.endpointMapper('outbound', ['id', 'displayName'], config.map.role)
    const filter = `(&(member=${userDn})(objectClass=*))`

    const result = await doRequest(baseEntity, method, base, { filter, scope, attributes: attrs }, ctx)
    return result || []
  } catch (err: any) {
    scimgateway.logDebug(baseEntity, `getMemberOfRoles error: ${err.message}`)
    return []
  }
}
```

---

## Step 5: Testing Your New Route

### 5.1 Restart the Server

```bash
# Kill existing server and restart
cd /Users/giovanni.djuric/scimgateway
bun run index.ts
```

### 5.2 Test Basic Operations

```bash
# List all roles
curl -X GET "http://localhost:8883/roles" \
  -H "Authorization: Basic Z3dhZG1pbjpwYXNzd29yZA=="

# Create a new role
curl -X POST "http://localhost:8883/roles" \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic Z3dhZG1pbjpwYXNzd29yZA==" \
  -d '{
    "displayName": "admin-role",
    "members": [{"value": "USER_HASHED_ID"}]
  }'

# Get specific role
curl -X GET "http://localhost:8883/roles/ROLE_HASHED_ID" \
  -H "Authorization: Basic Z3dhZG1pbjpwYXNzd29yZA=="

# Add member to role
curl -X PATCH "http://localhost:8883/roles/ROLE_HASHED_ID" \
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

# Remove member from role
curl -X PATCH "http://localhost:8883/roles/ROLE_HASHED_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic Z3dhZG1pbjpwYXNzd29yZA==" \
  -d '{
    "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
    "Operations": [{
      "op": "remove",
      "path": "members",
      "value": [{"value": "USER_HASHED_ID", "operation": "delete"}]
    }]
  }'

# Delete role
curl -X DELETE "http://localhost:8883/roles/ROLE_HASHED_ID" \
  -H "Authorization: Basic Z3dhZG1pbjpwYXNzd29yZA=="
```

---

## Step 6: Common Customizations

### 6.1 Different LDAP Object Classes

If your roles use different object classes, update the filter in `getRoles`:

```typescript
// For roles with different object classes
const filter = getObj?.attribute && getObj?.value
  ? `(&(${getObj.attribute}=${getObj.value})(objectClass=organizationalRole)(objectClass=top))`
  : '(&(cn=*)(objectClass=organizationalRole)(objectClass=top))'
```

### 6.2 Additional Attributes

Add more attributes to your mapping in `plugin-ldap.json`:

```json
{
  "role": {
    "dn": {"mapTo": "id", "type": "string"},
    "cn": {"mapTo": "displayName", "type": "string"},
    "description": {"mapTo": "description", "type": "string"},
    "roleOccupant": {"mapTo": "members.value", "type": "array"},
    "businessCategory": {"mapTo": "category", "type": "string"}
  }
}
```

### 6.3 Different Base DN Structure

If your roles are in a different location:

```json
{
  "ldap": {
    "roleBase": "ou=roles,dc=iam,dc=asml,dc=com"
  }
}
```

---

## Step 7: Troubleshooting

### Common Issues and Solutions

1. **"unsupported baseEntity" Error**
   - **Cause**: Route not configured in `scimgateway.ts`
   - **Solution**: Add handler definition in Step 1.1

2. **"missing configuration ldap.roleBase" Error**
   - **Cause**: Missing base DN configuration
   - **Solution**: Add roleBase in `plugin-ldap.json` (Step 2.1)

3. **"modification must be an Attribute" Error**
   - **Cause**: Wrong LDAP structure in modify function
   - **Solution**: Follow the exact pattern from `modifyGroup`/`modifyPermission`

4. **Empty results**
   - **Cause**: Wrong LDAP filter or base DN
   - **Solution**: Check your LDAP directory structure and adjust filter

5. **"unhashId error" Messages**
   - **Cause**: ID hashing/unhashing issues
   - **Solution**: Ensure you're using `unhashId()` not `unhashGroupIdOnly()`

### Debug Steps

1. **Enable Debug Logging**: Set `"console": "debug"` in `plugin-ldap.json`
2. **Check LDAP Directory**: Verify your organizational structure matches config
3. **Test LDAP Connection**: Use `ldapsearch` to verify connectivity
4. **Check Error Logs**: Look for specific error messages in console output

---

## Step 8: Best Practices

### 8.1 Naming Conventions

- **Route names**: Use plural form (`/roles`, `/permissions`)
- **Function names**: Use singular form (`createRole`, `modifyRole`)
- **Configuration keys**: Use singular form (`roleBase`, `role` mapping)

### 8.2 Security Considerations

- Always hash DNs using `hashId(encodeURIComponent(dn))`
- Use `unhashId()` for cross-entity access
- Implement proper access controls
- Validate input data

### 8.3 Performance Optimization

- Use appropriate LDAP search scopes (`sub` vs `one`)
- Filter results at LDAP level when possible
- Consider caching for frequently accessed data
- Use pagination for large result sets

### 8.4 Error Handling

- Provide meaningful error messages
- Log debug information at appropriate levels
- Handle LDAP connection failures gracefully
- Validate configuration on startup

---

## Templates for Quick Setup

### Quick Route Handler Template

```typescript
// In lib/scimgateway.ts
handler.YourEntity = handler.yourentity = {
  description: 'YourEntity',
  getMethod: 'getYourEntities',
  modifyMethod: 'modifyYourEntity', 
  createMethod: 'createYourEntity',
  deleteMethod: 'deleteYourEntity',
}
```

### Quick Configuration Template

```json
{
  "ldap": {
    "yourEntityBase": "ou=yourentities,dc=domain,dc=com"
  },
  "map": {
    "yourentity": {
      "dn": {"mapTo": "id", "type": "string"},
      "cn": {"mapTo": "displayName", "type": "string"},
      "member": {"mapTo": "members.value", "type": "array"}
    }
  }
}
```

---

## Summary Checklist

When adding a new route, ensure you've completed:

- [ ] ✅ Added handler definition in `lib/scimgateway.ts`
- [ ] ✅ Added base DN configuration in `config/plugin-ldap.json`
- [ ] ✅ Added attribute mapping in `config/plugin-ldap.json`
- [ ] ✅ Implemented `getYourEntities` function
- [ ] ✅ Implemented `createYourEntity` function
- [ ] ✅ Implemented `modifyYourEntity` function (following exact pattern)
- [ ] ✅ Implemented `deleteYourEntity` function
- [ ] ✅ Added any helper functions if needed
- [ ] ✅ Tested all CRUD operations
- [ ] ✅ Verified PATCH add/remove operations
- [ ] ✅ Created documentation for your new route

---
