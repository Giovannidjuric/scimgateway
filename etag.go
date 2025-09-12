package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
)

// UserSchema defines the fields that should be included when hashing user objects
type UserSchema struct {
	UserName     string              `json:"userName,omitempty"`
	Name         *NameSchema         `json:"name,omitempty"`
	Emails       []EmailSchema       `json:"emails,omitempty"`
	Entitlements []EntitlementSchema `json:"entitlements,omitempty"`
}

// NameSchema represents the name object structure
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

// EntitlementSchema represents entitlement objects (only type="secret" are included)
type EntitlementSchema struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}

// PermissionSchema defines the fields that should be included when hashing group/permission objects
type PermissionSchema struct {
	DisplayName string         `json:"displayName,omitempty"`
	Members     []MemberSchema `json:"members,omitempty"`
}

// MemberSchema represents member objects
type MemberSchema struct {
	Value string `json:"value,omitempty"`
}

// getOrganizationalUnit extracts the organizational unit from a Distinguished Name (DN)
// This determines which schema to apply for selective field hashing
func getOrganizationalUnit(objectId string) string {
	// URL decode the DN if it's encoded
	decodedId := strings.ReplaceAll(objectId, "%3D", "=")
	decodedId = strings.ReplaceAll(decodedId, "%2C", ",")
	
	// Split DN by comma and look for organizational unit
	parts := strings.Split(decodedId, ",")
	
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "ou=") {
			return part
		}
	}
	
	// Default to permissions if no OU found
	return "ou=permissions"
}

// isUser checks if the organizational unit represents a user entity
func isUser(ou string) bool {
	return ou == "ou=users"
}

// isPermission checks if the organizational unit represents a permission/group entity
func isPermission(ou string) bool {
	return ou != "ou=users"
}

// prepareHashObjectForUser applies UserSchema to extract only relevant fields for hashing
// This implements selective field hashing for user objects
func prepareHashObjectForUser(obj map[string]interface{}) (*UserSchema, error) {
	userSchema := &UserSchema{}
	
	// Extract userName field
	if userName, ok := obj["userName"].(string); ok {
		userSchema.UserName = userName
	}
	
	// Extract name object with nested fields
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
	
	// Extract entitlements array, but only include those with type="secret"
	// This filters out non-sensitive entitlements like homeDirectory
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
	
	return userSchema, nil
}

// prepareHashObjectForPermission applies PermissionSchema to extract only relevant fields for hashing
// This implements selective field hashing for group/permission objects
func prepareHashObjectForPermission(obj map[string]interface{}) (*PermissionSchema, error) {
	permissionSchema := &PermissionSchema{}
	
	// Extract displayName field
	if displayName, ok := obj["displayName"].(string); ok {
		permissionSchema.DisplayName = displayName
	}
	
	// Use original members if available (for semantic ETag calculation)
	// otherwise fall back to regular members
	var membersToUse []interface{}
	if originalMembers, ok := obj["_originalMembers"].([]interface{}); ok {
		membersToUse = originalMembers
	} else if members, ok := obj["members"].([]interface{}); ok {
		membersToUse = members
	}
	
	// Extract and decode member values
	for _, memberItem := range membersToUse {
		if memberObj, ok := memberItem.(map[string]interface{}); ok {
			member := MemberSchema{}
			if memberValue, ok := memberObj["value"].(string); ok {
				// URL decode member DNs for semantic correctness in hashing
				decodedValue, err := url.QueryUnescape(memberValue)
				if err != nil {
					// Use original if decoding fails
					decodedValue = memberValue
				}
				member.Value = decodedValue
			}
			permissionSchema.Members = append(permissionSchema.Members, member)
		}
	}
	
	return permissionSchema, nil
}

// GetEtag generates an ETag for a SCIM object using enhanced selective field hashing
// This reproduces the ETag generation logic from the SCIM Gateway
//
// Parameter format:
// obj: map[string]interface{} containing SCIM object data with these required fields:
//   - "id" (required): string - The object identifier (can be hashed or plain DN)
//
// For User objects, obj should contain:
//   - "userName": string
//   - "name": map[string]interface{} with "givenName", "familyName", "formatted"
//   - "emails": []interface{} with objects containing "type" and "value" fields
//   - "entitlements": []interface{} with objects containing "type" and "value" fields
//
// For Group/Permission objects, obj should contain:
//   - "displayName": string
//   - "members": []interface{} with objects containing "value" field
//   - "_originalMembers": []interface{} (optional) with objects containing unhashed "value" field
//
// Usage examples:
//   // User object - OU detection from DN in "id" field
//   userObj := map[string]interface{}{
//       "id": "cn=johndoe,ou=users,dc=iam,dc=asml,dc=com",
//       "userName": "johndoe",
//       "name": map[string]interface{}{"givenName": "John", "familyName": "Doe"},
//       "emails": []interface{}{map[string]interface{}{"type": "work", "value": "john@company.com"}},
//   }
//   etag, err := GetEtag(userObj)
//
//   // Group object - OU detection from DN in "id" field
//   groupObj := map[string]interface{}{
//       "id": "cn=admin,ou=groups,dc=iam,dc=asml,dc=com", 
//       "displayName": "admin",
//       "members": []interface{}{map[string]interface{}{"value": "memberDN"}},
//   }
//   etag, err := GetEtag(groupObj)
//
// Returns: ETag string in format `W/"22-character-hash"` or error
func GetEtag(obj map[string]interface{}) (string, error) {
	// Validate input object
	if len(obj) == 0 {
		return "", nil
	}
	
	if _, ok := obj["id"]; !ok {
		return "", fmt.Errorf("Requested object has no Id")
	}
	
	// Use the "id" field for organizational unit detection
	// The id can be either a hashed ID or original DN depending on context
	var idToAnalyze string
	if id, ok := obj["id"].(string); ok {
		idToAnalyze = id
	}
	
	// Determine organizational unit to select appropriate schema
	organizationalUnit := getOrganizationalUnit(idToAnalyze)
	
	// Apply appropriate schema based on organizational unit
	var hashInput interface{}
	var err error
	
	if isUser(organizationalUnit) {
		// Apply UserSchema for selective field hashing
		hashInput, err = prepareHashObjectForUser(obj)
	} else if isPermission(organizationalUnit) {
		// Apply PermissionSchema for selective field hashing
		hashInput, err = prepareHashObjectForPermission(obj)
	} else {
		return "", fmt.Errorf("Unknown organizational unit")
	}
	
	if err != nil {
		return "", err
	}
	
	// Convert schema-filtered object to JSON string for consistent hashing
	hashInputBytes, err := json.Marshal(hashInput)
	if err != nil {
		return "", fmt.Errorf("Failed to marshal hash input: %v", err)
	}
	
	hashInputString := string(hashInputBytes)
	
	// Generate SHA-256 hash of the JSON string
	hasher := sha256.New()
	hasher.Write([]byte(hashInputString))
	hashBytes := hasher.Sum(nil)
	
	// Encode hash using base64url (URL-safe, no padding) and truncate to 22 characters
	hash := base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(hashBytes)
	if len(hash) > 22 {
		hash = hash[:22]
	}
	
	// Return standard HTTP ETag format with weak validator prefix
	eTag := fmt.Sprintf(`W/"%s"`, hash)
	
	return eTag, nil
}