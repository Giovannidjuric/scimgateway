#!/usr/bin/env bun
// Test script to simulate counter increment failure and verify rollback behavior

import { LdapCounterClient } from './lib/ldap-counter-client'

// Modified Counter Client that simulates failure on increment
class FailingCounterClient extends LdapCounterClient {
  async incrementCounter(currentUid: number): Promise<void> {
    // Simulate counter increment failure
    throw new Error('Simulated counter increment failure for testing')
  }
}

// Mock the createUser logic to test rollback
async function simulateCreateUserWithFailure() {
  console.log('🧪 Testing rollback scenario...\n')

  const counterClient = new FailingCounterClient()
  let assignedUid: number
  let userCreated = false
  const baseEntity = 'test'
  const userObj = { userName: 'testuser123' }

  try {
    // Step 1: Get next UID from counter
    console.log('1. Getting next UID from counter...')
    assignedUid = await counterClient.getNextUid()
    console.log(`Retrieved UID from counter: ${assignedUid}`)

    // Step 2: Simulate user creation success
    console.log('2. Simulating user creation...')
    console.log(`✅ User ${userObj.userName} created successfully with UID: ${assignedUid}`)
    userCreated = true

    // Step 3: Try to increment counter (this will fail)
    console.log('3. Attempting counter increment...')
    try {
      await counterClient.incrementCounter(assignedUid)
      console.log(`Successfully incremented UID counter from ${assignedUid} to ${assignedUid + 1}`)
    } catch (counterErr: any) {
      // Counter increment failed - attempt rollback
      console.log(`❌ Counter increment failed: ${counterErr.message}`)
      console.log('📝 Attempting user rollback...')
      
      let deletionSucceeded = false
      try {
        // Simulate user deletion (this would normally be: await doRequest(baseEntity, 'del', base, {}, ctx))
        console.log(`🗑️  Deleting user ${userObj.userName}...`)
        // For simulation, we'll assume deletion succeeds
        console.log(`✅ Successfully rolled back user ${userObj.userName} due to counter failure`)
        userCreated = false // Mark as deleted
        deletionSucceeded = true
      } catch (deletionErr: any) {
        console.log(`❌ CRITICAL: User ${userObj.userName} created with UID ${assignedUid} but counter increment AND rollback both failed`)
        console.log(`Counter error: ${counterErr.message}`)
        console.log(`Rollback error: ${deletionErr.message}`)
        throw new Error(`Critical consistency error: User exists but counter is out of sync. Manual intervention required for ${userObj.userName} (UID: ${assignedUid})`)
      }

      if (deletionSucceeded) {
        throw new Error(`User creation aborted: ${counterErr.message}`)
      }
    }

  } catch (error: any) {
    console.log(`\n🚨 Final result: ${error.message}`)
    console.log(`👤 User exists: ${userCreated}`)
    
    // Check if counter was incremented
    try {
      const currentCounterValue = await counterClient.getNextUid()
      console.log(`📊 Counter value after test: ${currentCounterValue}`)
      console.log(`📈 Counter was ${currentCounterValue === assignedUid ? 'NOT incremented (correct)' : 'incremented (incorrect)'}`)
    } catch (err) {
      console.log('❌ Could not check counter value')
    }
    
  } finally {
    await counterClient.disconnect()
  }
}

// Also test a scenario where rollback fails
async function simulateRollbackFailure() {
  console.log('\n\n🧪 Testing rollback failure scenario...\n')

  const counterClient = new FailingCounterClient()
  let assignedUid: number
  const userObj = { userName: 'testuser456' }

  try {
    assignedUid = await counterClient.getNextUid()
    console.log(`Retrieved UID from counter: ${assignedUid}`)
    
    console.log('✅ User created successfully')
    
    try {
      await counterClient.incrementCounter(assignedUid)
    } catch (counterErr: any) {
      console.log(`❌ Counter increment failed: ${counterErr.message}`)
      
      try {
        // Simulate rollback failure
        throw new Error('Simulated user deletion failure')
      } catch (deletionErr: any) {
        console.log(`❌ CRITICAL: User created with UID ${assignedUid} but counter increment AND rollback both failed`)
        console.log(`Counter error: ${counterErr.message}`)
        console.log(`Rollback error: ${deletionErr.message}`)
        throw new Error(`Critical consistency error: User exists but counter is out of sync. Manual intervention required for ${userObj.userName} (UID: ${assignedUid})`)
      }
    }
    
  } catch (error: any) {
    console.log(`\n🚨 Critical scenario result: ${error.message}`)
    console.log('⚠️  This would require manual intervention to fix the inconsistent state')
  } finally {
    await counterClient.disconnect()
  }
}

// Run tests
console.log('='.repeat(60))
console.log('TESTING ROLLBACK SCENARIOS FOR UID COUNTER')
console.log('='.repeat(60))

simulateCreateUserWithFailure().then(() => {
  return simulateRollbackFailure()
}).then(() => {
  console.log('\n✅ All rollback tests completed!')
})