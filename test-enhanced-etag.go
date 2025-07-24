package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
)

// UserSchema represents the fields that should be hashed for users
type UserSchema struct {
	UserName     string        `json:"userName,omitempty"`
	Name         *NameSchema   `json:"name,omitempty"`
	Emails       []EmailSchema `json:"emails,omitempty"`
	Entitlements []EntitlementSchema `json:"entitlements,omitempty"`
}

// NameSchema represents the name object
type NameSchema struct {
	GivenName  string `json:"givenName,omitempty"`
	FamilyName string `json:"familyName,omitempty"`
	Formatted  string `json:"formatted,omitempty"`
}

// EmailSchema represents email objects
type EmailSchema struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}

// EntitlementSchema represents entitlement objects
type EntitlementSchema struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}

// PermissionSchema represents the fields that should be hashed for groups/permissions
type PermissionSchema struct {
	DisplayName string         `json:"displayName,omitempty"`
	Members     []MemberSchema `json:"members,omitempty"`
}

// MemberSchema represents member objects
type MemberSchema struct {
	Value string `json:"value,omitempty"`
}

// hashId replicates the DN hashing logic
func hashId(dn string) (string, error) {
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

// getOrganizationalUnit extracts the organizational unit from a DN
func getOrganizationalUnit(objectId string) string {
	fmt.Printf("getOrganizationalUnit input: %s\n", objectId)
	
	// URL decode if needed (basic implementation)
	decodedId := strings.ReplaceAll(objectId, "%3D", "=")
	decodedId = strings.ReplaceAll(decodedId, "%2C", ",")
	fmt.Printf("decodedId: %s\n", decodedId)
	
	parts := strings.Split(decodedId, ",")
	fmt.Printf("DN parts: %v\n", parts)
	
	for _, part := range parts {
		if strings.Contains(part, "ou=permissions") || 
		   strings.Contains(part, "ou=users") || 
		   strings.Contains(part, "ou=groups") {
			fmt.Printf("found organizationalUnit: %s\n", part)
			return part
		}
	}
	
	fmt.Println("No organizational unit found, defaulting to ou=permissions")
	return "ou=permissions"
}

// isUser checks if the organizational unit represents a user
func isUser(ou string) bool {
	return ou == "ou=users"
}

// isPermission checks if the organizational unit represents a permission/group
func isPermission(ou string) bool {
	return ou != "ou=users"
}

// prepareHashObjectForUser prepares user data for hashing using UserSchema
func prepareHashObjectForUser(obj map[string]interface{}) (*UserSchema, error) {
	fmt.Println("Detected as USER - applying UserSchema")
	
	userSchema := &UserSchema{}
	
	// Extract userName
	if userName, ok := obj["userName"].(string); ok {
		userSchema.UserName = userName
	}
	
	// Extract name object
	if nameObj, ok := obj["name"].(map[string]interface{}); ok {
		userSchema.Name = &NameSchema{}
		if givenName, ok := nameObj["givenName"].(string); ok {
			userSchema.Name.GivenName = givenName
		}
		if familyName, ok := nameObj["familyName"].(string); ok {
			userSchema.Name.FamilyName = familyName
		}
		if formatted, ok := nameObj["formatted"].(string); ok {
			userSchema.Name.Formatted = formatted
		}
	}
	
	// Extract emails array
	if emailsArray, ok := obj["emails"].([]interface{}); ok {
		for _, emailItem := range emailsArray {
			if emailObj, ok := emailItem.(map[string]interface{}); ok {
				email := EmailSchema{}
				if emailType, ok := emailObj["type"].(string); ok {
					email.Type = emailType
				}
				if emailValue, ok := emailObj["value"].(string); ok {
					email.Value = emailValue
				}
				userSchema.Emails = append(userSchema.Emails, email)
			}
		}
	}
	
	// Extract entitlements array (filter for type="secret")
	if entitlementsArray, ok := obj["entitlements"].([]interface{}); ok {
		for _, entitlementItem := range entitlementsArray {
			if entitlementObj, ok := entitlementItem.(map[string]interface{}); ok {
				if entitlementType, ok := entitlementObj["type"].(string); ok && entitlementType == "secret" {
					entitlement := EntitlementSchema{}
					entitlement.Type = entitlementType
					if entitlementValue, ok := entitlementObj["value"].(string); ok {
						entitlement.Value = entitlementValue
					}
					userSchema.Entitlements = append(userSchema.Entitlements, entitlement)
				}
			}
		}
	}
	
	fmt.Printf("UserSchema parsing successful: %+v\n", userSchema)
	return userSchema, nil
}

// prepareHashObjectForPermission prepares group/permission data for hashing using PermissionSchema
func prepareHashObjectForPermission(obj map[string]interface{}) (*PermissionSchema, error) {
	fmt.Println("Detected as PERMISSION/GROUP - applying PermissionSchema")
	
	permissionSchema := &PermissionSchema{}
	
	// Extract displayName
	if displayName, ok := obj["displayName"].(string); ok {
		permissionSchema.DisplayName = displayName
	}
	
	// Extract members array
	if membersArray, ok := obj["members"].([]interface{}); ok {
		for _, memberItem := range membersArray {
			if memberObj, ok := memberItem.(map[string]interface{}); ok {
				member := MemberSchema{}
				if memberValue, ok := memberObj["value"].(string); ok {
					member.Value = memberValue
				}
				permissionSchema.Members = append(permissionSchema.Members, member)
			}
		}
	}
	
	fmt.Printf("PermissionSchema parsing successful: %+v\n", permissionSchema)
	return permissionSchema, nil
}

// getEtag replicates the enhanced ETag generation logic
func getEtag(obj map[string]interface{}) (string, error) {
	fmt.Println("=== getEtag ENTRY ===")
	fmt.Printf("Input object keys: %v\n", getMapKeys(obj))
	fmt.Printf("obj.id: %v\n", obj["id"])
	fmt.Printf("obj.plainId: %v\n", obj["plainId"])
	
	if len(obj) == 0 {
		fmt.Println("getEtag: Invalid object, returning empty string")
		return "", nil
	}
	
	if _, ok := obj["id"]; !ok {
		fmt.Println("getEtag: No ID found, throwing error")
		return "", fmt.Errorf("Requested object has no Id")
	}
	
	// Use plainId (original DN) if provided, otherwise fall back to id
	var idToAnalyze string
	if plainId, ok := obj["plainId"].(string); ok && plainId != "" {
		idToAnalyze = plainId
	} else if id, ok := obj["id"].(string); ok {
		idToAnalyze = id
	}
	fmt.Printf("idToAnalyze: %s\n", idToAnalyze)
	
	organizationalUnit := getOrganizationalUnit(idToAnalyze)
	fmt.Printf("organizationalUnit: %s\n", organizationalUnit)
	
	var hashInput interface{}
	var err error
	
	if isUser(organizationalUnit) {
		hashInput, err = prepareHashObjectForUser(obj)
	} else if isPermission(organizationalUnit) {
		hashInput, err = prepareHashObjectForPermission(obj)
	} else {
		fmt.Println("Unknown organizational unit, returning undefined")
		return "", fmt.Errorf("Unknown organizational unit")
	}
	
	if err != nil {
		fmt.Printf("Schema parsing failed: %v\n", err)
		return "", err
	}
	
	fmt.Printf("hashInput after schema parsing: %+v\n", hashInput)
	
	// Convert to JSON string for hashing
	hashInputBytes, err := json.Marshal(hashInput)
	if err != nil {
		return "", fmt.Errorf("Failed to marshal hash input: %v", err)
	}
	
	hashInputString := string(hashInputBytes)
	fmt.Printf("hashInputString (for hashing): %s\n", hashInputString)
	
	// Create SHA-256 hash
	hasher := sha256.New()
	hasher.Write([]byte(hashInputString))
	hashBytes := hasher.Sum(nil)
	
	// Use base64url encoding and truncate to 22 characters
	hash := base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(hashBytes)
	if len(hash) > 22 {
		hash = hash[:22]
	}
	fmt.Printf("generated hash: %s\n", hash)
	
	eTag := fmt.Sprintf(`W/"%s"`, hash)
	fmt.Printf("Generated ETag: %s\n", eTag)
	
	fmt.Println("=== getEtag EXIT ===")
	fmt.Printf("Final ETag: %s\n", eTag)
	
	return eTag, nil
}

// Helper function to get map keys
func getMapKeys(m map[string]interface{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

func main() {
	fmt.Println("=== Enhanced ETag Testing ===")
	
	// Test User Object
	fmt.Println("\n--- Test 1: User Object ---")
	userObj := map[string]interface{}{
		"id": "0GOVozFLd3csNqPYItMwpCKE4ydJ7LySWG5wiPjalMU",
		"plainId": "cn=johndoe,ou=users,dc=iam,dc=asml,dc=com",
		"userName": "johndoe",
		"uidNumber": "65100",
		"gidNumber": "65100",
		"name": map[string]interface{}{
			"familyName": "DoeUpdated",
			"formatted": "john doe",
			"givenName": "JohnWildcard",
		},
		"entitlements": []interface{}{
			map[string]interface{}{
				"type": "homeDirectory",
				"value": "/home/usertest",
			},
			map[string]interface{}{
				"type": "secret",
				"value": "{CRYPT}XT954OcTlPNeI",
			},
		},
		"emails": []interface{}{
			map[string]interface{}{
				"type": "work",
				"value": "john.newemail@company.com",
			},
		},
	}
	
	userETag, err := getEtag(userObj)
	if err != nil {
		fmt.Printf("Error generating user ETag: %v\n", err)
	} else {
		fmt.Printf("User ETag: %s\n", userETag)
	}
	
	// Test Group Object
	fmt.Println("\n--- Test 2: Group Object ---")
	groupObj := map[string]interface{}{
		"id": "eRnAO4IRsOgCuXJhkx9SOb5yRFdK1lduqqosZFO2VDk",
		"plainId": "cn=finance,ou=groups,dc=iam,dc=asml,dc=com",
		"displayName": "finance",
		"members": []interface{}{
			map[string]interface{}{
				"value": "0GOVozFLd3csNqPYItMwpCKE4ydJ7LySWG5wiPjalMU",
			},
			map[string]interface{}{
				"value": "dFtxqa-QoKZWS4YG9LrbDO6C--580kfDlYMce-35V3c",
			},
			map[string]interface{}{
				"value": "B5t313m6v0E0BTxsykrngNZaUz6B4ttFX7_JHrT1fhQ",
			},
		},
	}
	
	groupETag, err := getEtag(groupObj)
	if err != nil {
		fmt.Printf("Error generating group ETag: %v\n", err)
	} else {
		fmt.Printf("Group ETag: %s\n", groupETag)
	}
	
	// Test DN Hashing separately
	fmt.Println("\n--- Test 3: DN Hashing ---")
	testDNs := []string{
		"cn=johndoe,ou=users,dc=iam,dc=asml,dc=com",
		"cn=finance,ou=groups,dc=iam,dc=asml,dc=com",
	}
	
	for i, dn := range testDNs {
		fmt.Printf("\nDN Test %d: %s\n", i+1, dn)
		hashedDN, err := hashId(dn)
		if err != nil {
			fmt.Printf("Error: %v\n", err)
		} else {
			fmt.Printf("Hashed DN: %s\n", hashedDN)
		}
	}
}