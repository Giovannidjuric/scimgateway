import crypto from 'crypto';

function hashId(dn) {
  if (!dn || typeof dn !== 'string') {
    throw new Error('hashId() requires a valid DN string');
  }
  
  // Normalize DN to lowercase for consistent hashing
  const normalizedDn = dn.toLowerCase().trim();
  
  console.log(`Original DN: ${dn}`);
  console.log(`Normalized DN: ${normalizedDn}`);
  
  // Create SHA-256 hash
  const hash = crypto.createHash('sha256');
  hash.update(normalizedDn, 'utf8');
  
  // Use base64url encoding (URL-safe, no padding)
  const result = hash.digest('base64url');
  
  console.log(`Hashed ID: ${result}`);
  console.log(`Length: ${result.length}`);
  
  return result;
}

// Test cases - including groups from different OUs
const testDNs = [
  'cn=johndoe,ou=users,dc=iam,dc=asml,dc=com',
  'cn=finance-updated,ou=groups,dc=iam,dc=asml,dc=com',
  'cn=administrators,ou=groups,dc=iam,dc=asml,dc=com',
  'cn=read-access,ou=permissions,dc=iam,dc=asml,dc=com',
  'cn=write-access,ou=permissions,dc=iam,dc=asml,dc=com',
  'cn=admin-access,ou=permissions,dc=iam,dc=asml,dc=com'
];

console.log('=== TypeScript/Node.js Results ===');
testDNs.forEach((dn, index) => {
  console.log(`\nTest ${index + 1}:`);
  hashId(dn);
});