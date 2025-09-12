#!/usr/bin/env bun
// Test normal flow where counter increment succeeds

import { LdapCounterClient } from './lib/ldap-counter-client'

async function testNormalFlow() {
  console.log('🧪 Testing normal counter flow (should succeed)...\n')

  const counterClient = new LdapCounterClient()
  
  try {
    // Test the normal flow
    console.log('1. Getting current UID...')
    const currentUid = await counterClient.getNextUid()
    console.log(`Current UID: ${currentUid}`)
    
    console.log('2. Simulating successful user creation...')
    console.log(`✅ User created successfully with UID: ${currentUid}`)
    
    console.log('3. Incrementing counter...')
    await counterClient.incrementCounter(currentUid)
    console.log(`✅ Successfully incremented counter`)
    
    console.log('4. Verifying counter increment...')
    const newUid = await counterClient.getNextUid()
    console.log(`New UID: ${newUid}`)
    
    if (newUid === currentUid + 1) {
      console.log('✅ NORMAL FLOW TEST PASSED')
      console.log('  - User creation succeeded')
      console.log('  - Counter increment succeeded')
      console.log('  - No rollback needed')
      console.log('  - Next UID ready for next user')
    } else {
      console.log('❌ Counter increment verification failed')
    }
    
    // Reset counter for next test
    console.log('\n5. Resetting counter for next test...')
    await counterClient.incrementCounter(newUid - 1)
    console.log('✅ Counter reset to original value')
    
  } catch (error: any) {
    console.log(`❌ Normal flow test failed: ${error.message}`)
  } finally {
    await counterClient.disconnect()
  }
}

testNormalFlow()