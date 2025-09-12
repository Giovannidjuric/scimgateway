# Making Email Mandatory for posixAccount Users

## What Are Auxiliary Classes?

Auxiliary classes in LDAP are additional objectClasses that can be added to entries to extend their functionality. Unlike structural objectClasses (like `posixAccount` or `inetOrgPerson`), auxiliary classes:

- Don't define the core structure of an entry
- Can be added or removed from existing entries
- Are used to add optional attributes or requirements
- Multiple auxiliary classes can be applied to a single entry

## Implementation Steps

### 1. Created Custom Auxiliary Schema
Created an auxiliary objectClass that requires the `mail` attribute:

```bash
# Connect to LDAP container
docker exec ldapserver sh -c "cat > /tmp/emailRequired.ldif << 'EOF'
dn: cn=emailRequired,cn=schema,cn=config
objectClass: olcSchemaConfig
cn: emailRequired
olcObjectClasses: ( 1.3.6.1.4.1.99999.1.2.1 NAME 'emailRequired' DESC 'Auxiliary class requiring email address' AUXILIARY MUST ( mail ) )
EOF"

# Add schema to OpenLDAP
docker exec ldapserver ldapadd -Y EXTERNAL -H ldapi:/// -f /tmp/emailRequired.ldif
```

### 2. Updated SCIM Configuration
Modified `config/plugin-ldap.json` to include the new auxiliary class:

```json
"userObjectClasses": [
  "inetOrgPerson",
  "organizationalPerson", 
  "top",
  "person",
  "posixAccount",
]
```

## Result

- OpenLDAP now enforces email requirement at the directory level
- Any attempt to create a posixAccount user without email fails with: `Object class violation (65)`
- This validation happens regardless of whether users are created via SCIM or directly through LDAP
- The `posixAccount` objectClass still provides all UNIX/Linux functionality (uidNumber, gidNumber, etc.)
- The `emailRequired` auxiliary class simply adds the email validation rule

## Why This Approach?

- **Non-destructive**: Doesn't modify standard schemas
- **Flexible**: Can be applied selectively to users who need email validation
- **Standards-compliant**: Follows LDAP best practices for extending functionality
- **Reversible**: Easy to remove if requirements change