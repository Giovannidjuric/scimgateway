# LDAP Counter Implementation for User Creation

## Overview
The SCIM Gateway now includes an automated UID/GID counter system that assigns sequential uidNumber and gidNumber values during user creation. This ensures unique Unix identifiers without manual intervention.

## Architecture

### Core Components
1. **LdapCounterClient** (`lib/ldap-counter-client.ts`) - Dedicated LDAP client for counter operations
2. **Integration in plugin-ldap.ts** - Counter usage during user creation with rollback support
3. **Configuration** - Counter DN specified in `plugin-ldap.json`

## Implementation Details

### Counter Client (`lib/ldap-counter-client.ts`)
- **Purpose**: Manages LDAP counter operations independently from main plugin connection
- **Key Methods**:
  - `getNextUid()`: Retrieves current uidNumber from counter entry
  - `incrementCounter()`: Updates counter with next value
  - `testConnection()`: Validates counter accessibility
- **Configuration**: Uses same LDAP connection details as main plugin but with dedicated counterDN

### Integration in User Creation (`plugin-ldap.ts:355-434`)
The counter integration follows this sequence:

1. **UID Retrieval** (lines 355-371):
   - Creates LdapCounterClient with config from plugin settings
   - Fetches next available UID from counter entry (`getNextUid()` - **does not increment yet**)
   - Assigns same value to both uidNumber and gidNumber (Unix standard)

2. **User Creation** (lines 398-399):
   - Proceeds with normal LDAP user creation including assigned UID

3. **Counter Update with Rollback** (lines 401-427):
   - **Success Path**: Increments counter after successful user creation
   - **Failure Path**: If counter increment fails, attempts to delete the newly created user
   - **Critical Error**: If both counter increment AND user deletion fail, throws error requiring manual intervention

### Consistency Model - Sequential Operations with Rollback

**Important**: The implementation is **NOT truly atomic**. The operations happen sequentially:

1. `counterClient.getNextUid()` - Gets next UID (line 370)
2. `doRequest('add', ...)` - Creates user with that UID (line 398) 
3. `counterClient.incrementCounter()` - Increments counter (line 403)

**Consistency Window**: There's a brief period after user creation but before counter increment where:
- The user exists in LDAP with the assigned UID
- The counter hasn't been incremented yet
- If the process crashes here, the counter would be out of sync

**Rollback Strategy**: The code uses compensation-based consistency rather than true atomicity:
- If counter increment fails, it attempts to delete the just-created user (lines 405-424)
- This restores consistency by removing the user rather than fixing the counter
- If rollback also fails, it throws a critical error requiring manual intervention

This approach prioritizes counter integrity over user creation success.

### Configuration
```json
{
  "entity": {
    "ldap": {
      "counterDN": "cn=uidNext,ou=users,dc=iam,dc=asml,dc=com"
    }
  }
}
```

## Benefits
- **Sequential Operations with Rollback**: User creation and counter increment happen in sequence, with rollback logic to maintain consistency if counter update fails
- **Independent Connection**: Counter operations don't interfere with main plugin LDAP connection
- **Unix Compliance**: Assigns both uidNumber and gidNumber automatically
- **Error Handling**: Comprehensive logging and error recovery
- **Counter Integrity**: Prioritizes keeping counter accurate over user creation success

## Error Scenarios
1. **Counter Unreachable**: User creation fails immediately (line 377-380)
2. **Counter Increment Failure**: User is rolled back, creation fails (lines 405-424)
3. **Critical Consistency Error**: User exists but counter out of sync - requires manual intervention (lines 416-419)

## Race Conditions & Limitations
- **Brief Inconsistency Window**: User exists before counter increment
- **Process Crash Risk**: If process dies between user creation and counter increment, manual cleanup needed
- **Not LDAP Transaction-Safe**: Relies on application-level rollback, not database-level atomicity