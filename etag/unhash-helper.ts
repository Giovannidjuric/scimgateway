// Helper module to extract unhashing functions without circular dependencies
// This allows the ETag module to unhash IDs without importing the full plugin

import * as crypto from 'node:crypto';

// Extracted hashId function (copy from plugin-ldap.ts)
export const hashId = (dn: string): string => {
  if (!dn || typeof dn !== 'string') {
    throw new Error('hashId() requires a valid DN string')
  }
  // Normalize DN to lowercase for consistent hashing
  const normalizedDn = dn.toLowerCase().trim()
  const hash = crypto.createHash('sha256')
  hash.update(normalizedDn, 'utf8')
  // Use base64url encoding (URL-safe, no padding)
  return hash.digest('base64url')
}

// Simple in-memory cache for DN lookups (temporary solution)
// In production, this should integrate with your LDAP search functions
const dnCache = new Map<string, string>();

// Function to populate cache (called from plugin-ldap.ts)
export const cacheDnMapping = (hashedId: string, plainDn: string): void => {
  dnCache.set(hashedId, plainDn);
}

// Function to retrieve plain DN from hashed ID
export const getCachedDn = (hashedId: string): string | undefined => {
  return dnCache.get(hashedId);
}

// Function to check if an ID is already a plain DN (contains LDAP DN structure)
export const isPlainDn = (id: string): boolean => {
  // Check if it looks like a DN (contains '=' and ',' typical of LDAP DNs)
  return id.includes('=') && id.includes(',') && (id.includes('dc=') || id.includes('ou=') || id.includes('cn='));
}

// Helper to get plain DN from either hashed or plain ID
export const getPlainDn = (id: string): string | null => {
  // If it's already a plain DN, return it
  if (isPlainDn(id)) {
    return id;
  }
  
  // Otherwise, try to get it from cache
  return getCachedDn(id) || null;
}