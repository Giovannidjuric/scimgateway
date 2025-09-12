# Atomic Counter Solutions for Race Condition Prevention

## Problem Statement

Current implementation has a critical race condition:
1. Read counter: `10001`
2. Create user with UID `10001` ✅
3. Atomic increment fails (another process incremented first) ❌
4. Result: User exists with UID but counter increment failed

This can lead to:
- UID sequence gaps
- Potential duplicate UIDs if multiple processes read same counter value
- Inconsistent state between created users and counter value

## Solution Options

### Option 1: Atomic Increment FIRST (Preferred)
**Approach:** Reserve UID by incrementing counter first, then create user.

```typescript
// 1. Atomically increment counter and get the NEW value
const assignedUid = await counterClient.getAndIncrementAtomic() // Returns 10001, sets counter to 10002

// 2. Create user with the reserved UID
endpointObj.uidNumber = assignedUid.toString()
await doRequest(baseEntity, method, base, ldapOptions, ctx)

// 3. If user creation fails, we've "wasted" a UID but no duplicates possible
```

**Pros:**
- Eliminates race conditions completely
- Simple implementation
- No rollback complexity

**Cons:**
- "Wastes" UIDs when user creation fails
- UID gaps in sequence (but this is acceptable in most systems)

### Option 2: Two-Phase with Rollback (Complex)
**Approach:** Create user first, then increment. If increment fails, rollback user creation.

```typescript
// 1. Create user first
await doRequest(baseEntity, method, base, ldapOptions, ctx)

// 2. Try atomic increment
try {
  await counterClient.incrementCounterAtomic(currentUid)
} catch (error) {
  // 3. Rollback: Delete the user we just created
  await doRequest(baseEntity, 'del', base, {}, ctx)
  throw new Error('Counter increment failed, user creation rolled back')
}
```

**Pros:**
- No UID waste
- Maintains perfect sequence

**Cons:**
- Complex rollback logic
- Risk of partial failures (user deleted but counter still wrong)
- More error-prone

### Option 3: Modify User UID on Conflict
**Approach:** If counter increment fails, read new counter and modify user's UID.

```typescript
// 1. Create user with UID 10001
await doRequest(baseEntity, method, base, ldapOptions, ctx)

// 2. Try increment, if fails get new counter value
try {
  await counterClient.incrementCounterAtomic(currentUid)
} catch (error) {
  // 3. Read new counter value: e.g. 10005
  const newUid = await counterClient.getNextUid()
  
  // 4. Modify user's UID from 10001 to 10005
  await doRequest(baseEntity, 'modify', base, {uidNumber: newUid}, ctx)
  
  // 5. Try increment again with new value
  await counterClient.incrementCounterAtomic(newUid)
}
```

**Pros:**
- No user deletion needed
- Recovers from conflicts gracefully

**Cons:**
- Complex multi-step process
- Multiple LDAP operations per user
- Still potential for nested race conditions

## Implementation Considerations

### Atomic Compare-and-Swap in LDAP
Using LDAP's atomic modify operations:

```typescript
async incrementCounterAtomic(expectedCurrentUid: number): Promise<void> {
  const nextUid = expectedCurrentUid + 1
  
  // Atomic operation: delete old value, add new value
  const deleteChange = new ldap.Change({
    operation: 'delete',
    modification: new ldap.Attribute({
      type: 'uidNumber', 
      values: [expectedCurrentUid.toString()] // Must match exactly
    })
  })
  
  const addChange = new ldap.Change({
    operation: 'add',
    modification: new ldap.Attribute({
      type: 'uidNumber',
      values: [nextUid.toString()]
    })
  })
  
  // If expectedCurrentUid doesn't match actual value, operation fails
  await this.client.modify(this.config.counterDN, [deleteChange, addChange])
}
```

## Recommendation

**Option 1 (Increment First)** is recommended for production because:
- Eliminates all race conditions
- Simple and reliable
- UID gaps are acceptable in Unix systems
- Matches behavior of many production systems (PostgreSQL sequences, etc.)

## Current Implementation Decision

For initial implementation, we'll use a simpler non-atomic approach:
1. Fetch counter
2. Assign UID/GID (throw error if either is provided)
3. Create user
4. Update counter

This will be optimized to atomic operations in a future iteration once basic functionality is proven.