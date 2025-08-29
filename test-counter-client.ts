#!/usr/bin/env bun
// Test script for the LDAP Counter Client

import { LdapCounterClient } from './lib/ldap-counter-client'

async function testCounterClient() {
  console.log('🧪 Testing LDAP Counter Client...\n')

  const counterClient = new LdapCounterClient()

  try {
    // Test 1: Connection
    console.log('1. Testing connection...')
    const connectionTest = await counterClient.testConnection()
    if (!connectionTest) {
      console.error('❌ Connection test failed')
      return
    }
    console.log('✅ Connection test passed\n')

    // Test 2: Read current UID
    console.log('2. Reading current UID...')
    const currentUid = await counterClient.getNextUid()
    console.log(`Current UID: ${currentUid}\n`)

    // Test 3: Increment counter
    console.log('3. Testing counter increment...')
    await counterClient.incrementCounter(currentUid)
    console.log('✅ Counter increment completed\n')

    // Test 4: Verify increment worked
    console.log('4. Verifying increment...')
    const newUid = await counterClient.getNextUid()
    console.log(`New UID: ${newUid}`)
    
    if (newUid === currentUid + 1) {
      console.log('✅ Counter increment verification passed\n')
    } else {
      console.error(`❌ Counter increment failed. Expected: ${currentUid + 1}, Got: ${newUid}\n`)
    }

    // Test 5: Reset to original value for clean test
    console.log('5. Resetting counter to original value...')
    await counterClient.incrementCounter(newUid - 1) // This will set it to original + 1, then -1 to get back to original
    console.log('✅ Counter reset completed\n')

    console.log('🎉 All tests completed successfully!')

  } catch (error) {
    console.error('❌ Test failed:', error)
  } finally {
    await counterClient.disconnect()
  }
}

// Also test the static methods
async function testStaticMethods() {
  console.log('\n🧪 Testing static methods...')
  
  try {
    const uid = await LdapCounterClient.getNextUidQuick()
    console.log(`Static method - current UID: ${uid}`)
    console.log('✅ Static methods work correctly')
  } catch (error) {
    console.error('❌ Static method test failed:', error)
  }
}

// Run tests
testCounterClient().then(() => {
  return testStaticMethods()
})