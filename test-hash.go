package main

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strings"
)

func hashId(dn string) (string, error) {
	if dn == "" {
		return "", fmt.Errorf("hashId() requires a valid DN string")
	}

	// Normalize DN to lowercase for consistent hashing
	normalizedDn := strings.ToLower(strings.TrimSpace(dn))

	fmt.Printf("Original DN: %s\n", dn)
	fmt.Printf("Normalized DN: %s\n", normalizedDn)

	// Create SHA-256 hash
	hasher := sha256.New()
	hasher.Write([]byte(normalizedDn))
	hashBytes := hasher.Sum(nil)

	// Use base64url encoding (URL-safe, no padding)
	hashedId := base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(hashBytes)

	fmt.Printf("Hashed ID: %s\n", hashedId)
	fmt.Printf("Length: %d\n", len(hashedId))

	return hashedId, nil
}

func main() {
	// Test cases - including groups from different OUs
	testDNs := []string{
		"cn=johndoe,ou=users,dc=iam,dc=asml,dc=com",
		"cn=finance-updated,ou=groups,dc=iam,dc=asml,dc=com",
		"cn=administrators,ou=groups,dc=iam,dc=asml,dc=com",
		"cn=read-access,ou=permissions,dc=iam,dc=asml,dc=com",
		"cn=write-access,ou=permissions,dc=iam,dc=asml,dc=com",
		"cn=admin-access,ou=permissions,dc=iam,dc=asml,dc=com",
	}

	fmt.Println("=== Go Results ===")
	for i, dn := range testDNs {
		fmt.Printf("\nTest %d:\n", i+1)
		_, err := hashId(dn)
		if err != nil {
			fmt.Printf("Error: %v\n", err)
		}
	}
}