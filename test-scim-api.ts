#!/usr/bin/env bun
// Comprehensive SCIM API test for counter integration

import dotenv from 'dotenv'
import { exec } from 'child_process'
import { promisify } from 'util'

dotenv.config()

const execAsync = promisify(exec)

// SCIM Gateway configuration
const SCIM_CONFIG = {
  baseUrl: 'http://localhost:8883',
  auth: {
    username: 'gwadmin',
    password: 'password'
  },
  headers: {
    'Content-Type': 'application/scim+json',
    'Authorization': 'Basic ' + Buffer.from('gwadmin:password').toString('base64')
  }
}

// Helper to query LDAP container directly
async function queryLdapUser(username: string): Promise<{ exists: boolean; uidNumber?: string; gidNumber?: string }> {
  try {
    const cmd = `docker exec ldapserver ldapsearch -x -H ldap://localhost -D "cn=admin,dc=iam,dc=asml,dc=com" -w adminpassword -b "ou=users,dc=iam,dc=asml,dc=com" "(uid=${username})" uid uidNumber gidNumber`
    const { stdout } = await execAsync(cmd)
    
    if (stdout.includes(`uid: ${username}`)) {
      const uidMatch = stdout.match(/uidNumber: (\d+)/)
      const gidMatch = stdout.match(/gidNumber: (\d+)/)
      return {
        exists: true,
        uidNumber: uidMatch?.[1],
        gidNumber: gidMatch?.[1]
      }
    }
    return { exists: false }
  } catch {
    return { exists: false }
  }
}

// Helper to get current counter value
async function getCurrentCounterValue(): Promise<number> {
  try {
    const cmd = `docker exec ldapserver ldapsearch -x -H ldap://localhost -D "cn=admin,dc=iam,dc=asml,dc=com" -w adminpassword -b "cn=uidNext,ou=users,dc=iam,dc=asml,dc=com" -s base uidNumber`
    const { stdout } = await execAsync(cmd)
    const match = stdout.match(/uidNumber: (\d+)/)
    return match ? parseInt(match[1]) : 0
  } catch {
    return 0
  }
}

// Helper to make SCIM API calls
async function scimRequest(method: string, endpoint: string, body?: any): Promise<{ status: number; data: any; error?: string }> {
  try {
    const url = `${SCIM_CONFIG.baseUrl}${endpoint}`
    console.log(`📡 ${method} ${url}`)
    if (body) console.log(`   Body: ${JSON.stringify(body, null, 2)}`)
    
    const response = await fetch(url, {
      method,
      headers: SCIM_CONFIG.headers,
      body: body ? JSON.stringify(body) : undefined
    })
    
    const responseText = await response.text()
    let data
    try {
      data = JSON.parse(responseText)
    } catch {
      data = responseText
    }
    
    console.log(`   Response: ${response.status} ${response.statusText}`)
    if (!response.ok) {
      console.log(`   Error: ${responseText}`)
    }
    
    return {
      status: response.status,
      data,
      error: response.ok ? undefined : responseText
    }
  } catch (error: any) {
    return {
      status: 0,
      data: null,
      error: error.message
    }
  }
}

// Test 1: Successful user creation with counter assignment
async function testSuccessfulUserCreation() {
  console.log('\n🧪 TEST 1: Successful User Creation with Counter Assignment')
  console.log('=' * 60)
  
  const timestamp = Date.now()
  const testUser = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    userName: `scim-test-${timestamp}`,
    name: {
      givenName: "SCIM",
      familyName: "Test",
      formatted: "SCIM Test"
    },
    emails: [
      {
        type: "work",
        value: `scim-test-${timestamp}@example.com`
      }
    ],
    entitlements: [
      {
        type: "homeDirectory",
        value: `/home/scim-test-${timestamp}`
      }
    ]
  }
  
  console.log(`👤 Creating user: ${testUser.userName}`)
  
  // Get counter value before creation
  const counterBefore = await getCurrentCounterValue()
  console.log(`📊 Counter before: ${counterBefore}`)
  
  // Create user via SCIM API
  const createResult = await scimRequest('POST', '/Users', testUser)
  
  if (createResult.status === 201) {
    console.log('✅ User creation successful')
    console.log(`   SCIM ID: ${createResult.data.id}`)
    console.log(`   userName: ${createResult.data.userName}`)
    
    // Check if uidNumber was assigned
    if (createResult.data.uidNumber) {
      console.log(`   uidNumber: ${createResult.data.uidNumber}`)
      console.log(`   gidNumber: ${createResult.data.gidNumber}`)
    }
    
    // Verify user in LDAP
    console.log('\n🔍 Verifying user in LDAP container...')
    await new Promise(resolve => setTimeout(resolve, 500)) // Wait for LDAP sync
    
    const ldapResult = await queryLdapUser(testUser.userName)
    if (ldapResult.exists) {
      console.log('✅ User found in LDAP')
      console.log(`   uidNumber: ${ldapResult.uidNumber}`)
      console.log(`   gidNumber: ${ldapResult.gidNumber}`)
      
      // Check counter was incremented
      const counterAfter = await getCurrentCounterValue()
      console.log(`📊 Counter after: ${counterAfter}`)
      console.log(`📈 Counter incremented: ${counterAfter > counterBefore ? '✅ Yes' : '❌ No'}`)
      
      // Verify UID assignment
      if (ldapResult.uidNumber === counterBefore.toString()) {
        console.log('✅ UID correctly assigned from counter')
      } else {
        console.log(`❌ UID mismatch: expected ${counterBefore}, got ${ldapResult.uidNumber}`)
      }
      
    } else {
      console.log('❌ User not found in LDAP')
    }
    
    // Clean up - delete the test user
    console.log('\n🧹 Cleaning up test user...')
    const deleteResult = await scimRequest('DELETE', `/Users/${createResult.data.id}`)
    console.log(`   Delete status: ${deleteResult.status}`)
    
  } else {
    console.log(`❌ User creation failed: ${createResult.status}`)
    console.log(`   Error: ${createResult.error}`)
  }
}

// Test 2: Error when uidNumber is manually provided
async function testUidNumberError() {
  console.log('\n🧪 TEST 2: Error when uidNumber is manually provided')
  console.log('=' * 60)
  
  const timestamp = Date.now()
  const testUser = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    userName: `uid-error-test-${timestamp}`,
    name: {
      givenName: "UID",
      familyName: "Error",
      formatted: "UID Error"
    },
    uidNumber: 99999, // This should cause an error
    emails: [
      {
        type: "work", 
        value: `uid-error-${timestamp}@example.com`
      }
    ]
  }
  
  console.log(`👤 Attempting to create user with manual uidNumber: ${testUser.uidNumber}`)
  
  const result = await scimRequest('POST', '/Users', testUser)
  
  if (result.status >= 400) {
    console.log('✅ Request correctly rejected')
    console.log(`   Status: ${result.status}`)
    console.log(`   Error message: ${result.error}`)
    
    // Check if error message mentions uidNumber
    if (result.error && result.error.includes('uidNumber')) {
      console.log('✅ Error message correctly mentions uidNumber')
    } else {
      console.log('⚠️  Error message does not mention uidNumber specifically')
    }
  } else {
    console.log(`❌ Request should have been rejected but got status: ${result.status}`)
    // If user was created, clean it up
    if (result.data && result.data.id) {
      await scimRequest('DELETE', `/Users/${result.data.id}`)
    }
  }
}

// Test 3: Error when gidNumber is manually provided  
async function testGidNumberError() {
  console.log('\n🧪 TEST 3: Error when gidNumber is manually provided')
  console.log('=' * 60)
  
  const timestamp = Date.now()
  const testUser = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    userName: `gid-error-test-${timestamp}`,
    name: {
      givenName: "GID",
      familyName: "Error", 
      formatted: "GID Error"
    },
    gidNumber: 88888, // This should cause an error
    emails: [
      {
        type: "work",
        value: `gid-error-${timestamp}@example.com`
      }
    ]
  }
  
  console.log(`👤 Attempting to create user with manual gidNumber: ${testUser.gidNumber}`)
  
  const result = await scimRequest('POST', '/Users', testUser)
  
  if (result.status >= 400) {
    console.log('✅ Request correctly rejected')
    console.log(`   Status: ${result.status}`)
    console.log(`   Error message: ${result.error}`)
    
    // Check if error message mentions gidNumber
    if (result.error && result.error.includes('gidNumber')) {
      console.log('✅ Error message correctly mentions gidNumber')
    } else {
      console.log('⚠️  Error message does not mention gidNumber specifically')
    }
  } else {
    console.log(`❌ Request should have been rejected but got status: ${result.status}`)
    // If user was created, clean it up
    if (result.data && result.data.id) {
      await scimRequest('DELETE', `/Users/${result.data.id}`)
    }
  }
}

// Test 4: Error when both uidNumber and gidNumber are provided
async function testBothNumbersError() {
  console.log('\n🧪 TEST 4: Error when both uidNumber and gidNumber are provided')
  console.log('=' * 60)
  
  const timestamp = Date.now()
  const testUser = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    userName: `both-error-test-${timestamp}`,
    name: {
      givenName: "Both",
      familyName: "Error",
      formatted: "Both Error"
    },
    uidNumber: 77777, // This should cause an error
    gidNumber: 66666, // This should also cause an error
    emails: [
      {
        type: "work",
        value: `both-error-${timestamp}@example.com`
      }
    ]
  }
  
  console.log(`👤 Attempting to create user with both uidNumber: ${testUser.uidNumber} and gidNumber: ${testUser.gidNumber}`)
  
  const result = await scimRequest('POST', '/Users', testUser)
  
  if (result.status >= 400) {
    console.log('✅ Request correctly rejected')
    console.log(`   Status: ${result.status}`)
    console.log(`   Error message: ${result.error}`)
  } else {
    console.log(`❌ Request should have been rejected but got status: ${result.status}`)
    // If user was created, clean it up
    if (result.data && result.data.id) {
      await scimRequest('DELETE', `/Users/${result.data.id}`)
    }
  }
}

// Main test runner
async function runAllTests() {
  console.log('🚀 SCIM API COUNTER INTEGRATION TESTS')
  console.log('=' * 60)
  console.log(`📡 SCIM Gateway: ${SCIM_CONFIG.baseUrl}`)
  console.log(`🔐 Authentication: Basic (gwadmin)`)
  
  // Check if SCIM gateway is accessible
  console.log('\n🔍 Testing SCIM Gateway connectivity...')
  const healthCheck = await scimRequest('GET', '/Users?count=1')
  if (healthCheck.status === 200) {
    console.log('✅ SCIM Gateway is accessible')
  } else {
    console.log(`❌ SCIM Gateway not accessible: ${healthCheck.status}`)
    console.log('   Please ensure the SCIM Gateway is running on port 8883')
    return
  }
  
  // Run all tests
  try {
    await testSuccessfulUserCreation()
    await testUidNumberError() 
    await testGidNumberError()
    await testBothNumbersError()
    
    console.log('\n' + '=' * 60)
    console.log('🏆 ALL TESTS COMPLETED!')
    console.log('=' * 60)
    
  } catch (error) {
    console.error('\n❌ Test execution failed:', error)
  }
}

// Run the tests
runAllTests()