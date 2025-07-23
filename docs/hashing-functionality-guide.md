# SCIM LDAP Plugin: ID Hashing and Unhashing Guide

## Overview

The SCIM LDAP plugin implements a secure ID hashing system that converts LDAP Distinguished Names (DNs) into URL-safe, opaque identifiers for external API use. This prevents DN structure exposure while maintaining deterministic mapping between DNs and hashed IDs.

## Why Hashing is Used

1. **Security**: Prevents exposure of internal LDAP structure and DN patterns
2. **URL Safety**: Creates identifiers safe for use in REST API paths
3. **Consistency**: Same DN always produces the same hash across requests
4. **Obfuscation**: Makes it harder to guess or enumerate entity IDs

## Hashing Algorithm

### Components
- **Hash Function**: SHA-256 (256-bit cryptographic hash)
- **Encoding**: base64url (URL-safe base64 without padding)
- **Normalization**: Lowercase conversion and whitespace trimming

### Process Flow
```
LDAP DN → Normalize → SHA-256 → base64url → Hashed ID
```

## Implementation Details

### Step-by-Step Process

1. **Input**: LDAP Distinguished Name (DN)
   ```
   cn=johndoe,ou=users,dc=iam,dc=asml,dc=com
   ```

2. **Normalization**: 
   - Convert to lowercase: `dn.toLowerCase()`
   - Trim whitespace: `.trim()`
   ```
   cn=johndoe,ou=users,dc=iam,dc=asml,dc=com
   ```

3. **SHA-256 Hashing**:
   - Hash the normalized string as UTF-8 bytes
   - Produces 32-byte (256-bit) binary hash

4. **base64url Encoding**:
   - Convert binary hash to base64url string
   - Uses alphabet: `A-Za-z0-9-_` (no `+/=`)
   - No padding characters

5. **Result**: 
   ```
   0GOVozFLd3csNqPYItMwpCKE4ydJ7LySWG5wiPjalMU
   ```

## Code Examples

### Node.js/JavaScript (Current Implementation)
```javascript
const crypto = require('crypto');

function hashId(dn) {
  if (!dn || typeof dn !== 'string') {
    throw new Error('hashId() requires a valid DN string');
  }
  
  // Normalize DN to lowercase for consistent hashing
  const normalizedDn = dn.toLowerCase().trim();
  
  // Create SHA-256 hash
  const hash = crypto.createHash('sha256');
  hash.update(normalizedDn, 'utf8');
  
  // Use base64url encoding (URL-safe, no padding)
  return hash.digest('base64url');
}

// Example usage
const dn = 'cn=johndoe,ou=users,dc=iam,dc=asml,dc=com';
const hashedId = hashId(dn);
console.log(hashedId); // 0GOVozFLd3csNqPYItMwpCKE4ydJ7LySWG5wiPjalMU
```

### Go Implementation
```go
package main

import (
    "crypto/sha256"
    "encoding/base64"
    "strings"
)

func HashId(dn string) (string, error) {
    if dn == "" {
        return "", fmt.Errorf("hashId() requires a valid DN string")
    }
    
    // Normalize DN to lowercase for consistent hashing
    normalizedDn := strings.ToLower(strings.TrimSpace(dn))
    
    // Create SHA-256 hash
    hasher := sha256.New()
    hasher.Write([]byte(normalizedDn))
    hashBytes := hasher.Sum(nil)
    
    // Use base64url encoding (URL-safe, no padding)
    hashedId := base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(hashBytes)
    
    return hashedId, nil
}

// Example usage
func main() {
    dn := "cn=johndoe,ou=users,dc=iam,dc=asml,dc=com"
    hashedId, err := HashId(dn)
    if err != nil {
        panic(err)
    }
    fmt.Println(hashedId) // 0GOVozFLd3csNqPYItMwpCKE4ydJ7LySWG5wiPjalMU
}
```

### Python Implementation
```python
import hashlib
import base64

def hash_id(dn):
    if not dn or not isinstance(dn, str):
        raise ValueError("hash_id() requires a valid DN string")
    
    # Normalize DN to lowercase for consistent hashing
    normalized_dn = dn.lower().strip()
    
    # Create SHA-256 hash
    hash_bytes = hashlib.sha256(normalized_dn.encode('utf-8')).digest()
    
    # Use base64url encoding (URL-safe, no padding)
    hashed_id = base64.urlsafe_b64encode(hash_bytes).decode('ascii').rstrip('=')
    
    return hashed_id

# Example usage
dn = "cn=johndoe,ou=users,dc=iam,dc=asml,dc=com"
hashed_id = hash_id(dn)
print(hashed_id)  # 0GOVozFLd3csNqPYItMwpCKE4ydJ7LySWG5wiPjalMU
```

### Command Line (bash/zsh)
```bash
#!/bin/bash

hash_id() {
    local dn="$1"
    
    # Normalize (lowercase and trim)
    local normalized_dn=$(echo -n "$dn" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    
    # SHA-256 hash and base64url encode
    echo -n "$normalized_dn" | \
        shasum -a 256 -b | \
        cut -d' ' -f1 | \
        xxd -r -p | \
        base64 | \
        tr '+/' '-_' | \
        tr -d '='
}

# Example usage
dn="cn=johndoe,ou=users,dc=iam,dc=asml,dc=com"
hashed_id=$(hash_id "$dn")
echo "$hashed_id"  # 0GOVozFLd3csNqPYItMwpCKE4ydJ7LySWG5wiPjalMU
```

## Unhashing Process

### Important Note
**Hashing is a one-way operation** - you cannot reverse a hash to get the original DN. The plugin implements unhashing through **lookup mechanisms**:

1. **Direct DN Search**: Searches LDAP for objects and compares their hashed DNs
2. **SCIM Mapper Processing**: Retrieves all objects, processes through SCIM mapping, and finds matches
3. **Fallback Mechanisms**: Multiple search strategies for maximum compatibility

### Unhashing Functions in Plugin

```javascript
// Entity-specific unhashing (prevents cross-entity access)
const unhashUserIdOnly = async (baseEntity, hashedId, ctx) => {
  // 1. Try efficient DN-only search for users
  // 2. Fallback to full SCIM mapper processing
  // 3. Return matched user DN or throw error
}

const unhashGroupIdOnly = async (baseEntity, hashedId, ctx) => {
  // 1. Try efficient DN-only search for groups  
  // 2. Fallback to full SCIM mapper processing
  // 3. Return matched group DN or throw error
}

// Generic unhashing (for member operations supporting mixed types)
const unhashId = async (baseEntity, hashedId, ctx) => {
  // 1. Try user search
  // 2. Try group search  
  // 3. Try alternative search methods
  // 4. Return matched DN or throw error
}
```

## Real Examples

### User Examples
```
DN: cn=johndoe,ou=users,dc=iam,dc=asml,dc=com
Hash: 0GOVozFLd3csNqPYItMwpCKE4ydJ7LySWG5wiPjalMU
API URL: GET /users/0GOVozFLd3csNqPYItMwpCKE4ydJ7LySWG5wiPjalMU
```

### Group Examples  
```
DN: cn=finance,ou=groups,dc=iam,dc=asml,dc=com
Hash: eRnAO4IRsOgCuXJhkx9SOb5yRFdK1lduqqosZFO2VDk
API URL: GET /groups/eRnAO4IRsOgCuXJhkx9SOb5yRFdK1lduqqosZFO2VDk
```

## Validation

### Test Your Implementation
Use these known DN/hash pairs to validate your hashing implementation:

```javascript
const testCases = [
  {
    dn: "cn=johndoe,ou=users,dc=iam,dc=asml,dc=com",
    expectedHash: "0GOVozFLd3csNqPYItMwpCKE4ydJ7LySWG5wiPjalMU"
  },
  {
    dn: "cn=finance,ou=groups,dc=iam,dc=asml,dc=com", 
    expectedHash: "eRnAO4IRsOgCuXJhkx9SOb5yRFdK1lduqqosZFO2VDk"
  }
];

testCases.forEach(testCase => {
  const hash = hashId(testCase.dn);
  console.log(`DN: ${testCase.dn}`);
  console.log(`Expected: ${testCase.expectedHash}`);
  console.log(`Got: ${hash}`);
  console.log(`Match: ${hash === testCase.expectedHash ? '✅' : '❌'}`);
  console.log('---');
});
```

## Security Considerations

1. **One-way Operation**: Hashes cannot be reversed to reveal original DNs
2. **Deterministic**: Same DN always produces same hash (required for consistency)
3. **Collision Resistant**: SHA-256 provides strong collision resistance
4. **Length**: All hashes are exactly 43 characters (base64url encoded 256-bit hash)
5. **URL Safe**: No special characters requiring URL encoding

## Integration Notes

- **SCIM Compliance**: Hashed IDs are used as SCIM `id` attributes
- **ETag Support**: Used in conjunction with ETags for optimistic concurrency
- **REST API**: Safe for use in URL paths without additional encoding
- **Database Storage**: Can be stored directly without escaping special characters
- **Cross-Platform**: Consistent results across different programming languages and systems

## Troubleshooting

### Common Issues

1. **Case Sensitivity**: Ensure DN is normalized to lowercase
2. **Whitespace**: Trim leading/trailing spaces from DN
3. **Encoding**: Use UTF-8 encoding when hashing the normalized DN
4. **Base64 Variant**: Must use base64url (not standard base64)
5. **Padding**: Remove padding characters (`=`) from base64url output

### Debug Steps
1. Print normalized DN to verify correct preprocessing
2. Print raw hash bytes (hex) to verify SHA-256 calculation  
3. Print base64url result to verify encoding
4. Compare with known test cases for validation