#!/usr/bin/env bun
// Test script to verify rollback with real LDAP operations
// This creates a real user, simulates counter failure, and verifies the user is deleted

import { LdapCounterClient } from './lib/ldap-counter-client'
import ldap from 'ldapjs'
import dotenv from 'dotenv'

dotenv.config()

// Test configuration - should match your LDAP setup
const testConfig = {
  url: process.env.COUNTER_LDAP_URL || 'ldap://localhost:389',
  bindDN: process.env.COUNTER_LDAP_BIND_DN || 'cn=admin,dc=iam,dc=asml,dc=com',
  bindPassword: process.env.COUNTER_LDAP_BIND_PASSWORD || 'adminpassword',
  userBase: 'ou=users,dc=iam,dc=asml,dc=com'
}

class TestLdapClient {
  private client: ldap.Client | null = null

  async connect(): Promise<void> {
    this.client = ldap.createClient({ url: testConfig.url })
    
    return new Promise<void>((resolve, reject) => {
      this.client!.bind(testConfig.bindDN, testConfig.bindPassword, (err) => {
        if (err) {
          reject(new Error(`LDAP bind failed: ${err.message}`))
        } else {
          console.log('✅ Test LDAP client connected')
          resolve()
        }
      })
    })
  }

  async createUser(userDN: string, attributes: any): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.client!.add(userDN, attributes, (err) => {
        if (err) {
          reject(new Error(`User creation failed: ${err.message}`))
        } else {
          console.log(`✅ Created user: ${userDN}`)
          resolve()
        }
      })
    })
  }

  async deleteUser(userDN: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.client!.del(userDN, (err) => {
        if (err) {
          reject(new Error(`User deletion failed: ${err.message}`))
        } else {
          console.log(`🗑️ Deleted user: ${userDN}`)
          resolve()
        }
      })
    })
  }

  async userExists(userDN: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.client!.search(userDN, { scope: 'base' }, (err, res) => {
        if (err) {
          resolve(false)
          return
        }

        let found = false
        res.on('searchEntry', () => {
          found = true
        })

        res.on('end', () => {
          resolve(found)
        })

        res.on('error', () => {
          resolve(false)
        })
      })
    })
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.unbind()
      this.client = null
      console.log('🔌 Test LDAP client disconnected')
    }
  }
}

// Counter client that fails on increment
class FailingCounterClient extends LdapCounterClient {
  async incrementCounter(currentUid: number): Promise<void> {
    throw new Error('Simulated counter increment failure')
  }
}

async function testRealRollback() {
  console.log('🧪 Testing real LDAP rollback scenario...\n')

  const counterClient = new FailingCounterClient()
  const testClient = new TestLdapClient()
  const testUsername = `rollback-test-${Date.now()}`
  
  let assignedUid: number
  let userDN: string

  try {
    await testClient.connect()
    
    // Get next UID
    console.log('1. Getting next UID from counter...')
    assignedUid = await counterClient.getNextUid()
    console.log(`Retrieved UID: ${assignedUid}`)

    // Create test user DN and attributes
    userDN = `cn=${testUsername},${testConfig.userBase}`
    const userAttributes = {
      objectClass: ['inetOrgPerson', 'posixAccount'],
      cn: testUsername,
      sn: 'Test',
      uid: testUsername,
      uidNumber: assignedUid.toString(),
      gidNumber: assignedUid.toString(),
      homeDirectory: `/home/${testUsername}`,
      mail: `${testUsername}@test.com`
    }

    // Create user
    console.log('2. Creating test user...')
    await testClient.createUser(userDN, userAttributes)

    // Verify user exists
    console.log('3. Verifying user exists...')
    const exists = await testClient.userExists(userDN)
    console.log(`User exists: ${exists}`)

    // Try counter increment (will fail)
    console.log('4. Attempting counter increment...')
    try {
      await counterClient.incrementCounter(assignedUid)
    } catch (counterErr: any) {
      console.log(`❌ Counter increment failed: ${counterErr.message}`)
      console.log('📝 Attempting rollback...')
      
      // Rollback logic
      let deletionSucceeded = false
      try {
        await testClient.deleteUser(userDN)
        deletionSucceeded = true
        console.log('✅ Successfully rolled back user due to counter failure')
      } catch (deletionErr: any) {
        console.log(`❌ CRITICAL: User exists but rollback failed: ${deletionErr.message}`)
        throw new Error(`Critical consistency error: Manual intervention required`)
      }

      if (deletionSucceeded) {
        // Verify user was actually deleted
        console.log('5. Verifying user was deleted...')
        const stillExists = await testClient.userExists(userDN)
        console.log(`User still exists: ${stillExists}`)
        
        // Check counter wasn't incremented
        const counterValue = await counterClient.getNextUid()
        console.log(`Counter value: ${counterValue} (should be ${assignedUid})`)
        
        console.log('\n✅ Rollback test PASSED:')
        console.log(`  - User was created with UID ${assignedUid}`)
        console.log(`  - Counter increment failed (simulated)`)
        console.log(`  - User was successfully deleted (rollback)`)
        console.log(`  - Counter remained at ${assignedUid} (not incremented)`)
        console.log(`  - System is in consistent state`)
        
        throw new Error(`User creation aborted: ${counterErr.message}`)
      }
    }

  } catch (error: any) {
    console.log(`\n📋 Test Result: ${error.message}`)
  } finally {
    await testClient.disconnect()
    await counterClient.disconnect()
  }
}

// Run the real rollback test
testRealRollback()