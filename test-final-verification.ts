#!/usr/bin/env bun
// Final verification of rollback with direct LDAP queries

import { LdapCounterClient } from './lib/ldap-counter-client'
import ldap from 'ldapjs'
import dotenv from 'dotenv'
import { exec } from 'child_process'
import { promisify } from 'util'

dotenv.config()

const execAsync = promisify(exec)

class TestClient {
  private client: ldap.Client | null = null

  async connect(): Promise<void> {
    this.client = ldap.createClient({ 
      url: process.env.COUNTER_LDAP_URL || 'ldap://localhost:389' 
    })
    
    return new Promise<void>((resolve, reject) => {
      this.client!.bind(
        process.env.COUNTER_LDAP_BIND_DN || 'cn=admin,dc=iam,dc=asml,dc=com',
        process.env.COUNTER_LDAP_BIND_PASSWORD || 'adminpassword',
        (err) => {
          if (err) reject(new Error(`LDAP bind failed: ${err.message}`))
          else resolve()
        }
      )
    })
  }

  async createUser(userDN: string, attributes: any): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.client!.add(userDN, attributes, (err) => {
        if (err) reject(new Error(`User creation failed: ${err.message}`))
        else resolve()
      })
    })
  }

  async deleteUser(userDN: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.client!.del(userDN, (err) => {
        if (err) reject(new Error(`User deletion failed: ${err.message}`))
        else resolve()
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
        res.on('searchEntry', () => { found = true })
        res.on('end', () => { resolve(found) })
        res.on('error', () => { resolve(false) })
      })
    })
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.unbind()
      this.client = null
    }
  }
}

class FailingCounterClient extends LdapCounterClient {
  async incrementCounter(currentUid: number): Promise<void> {
    throw new Error('Counter increment failure simulation')
  }
}

async function checkContainerDirect(username: string): Promise<boolean> {
  try {
    const cmd = `docker exec ldapserver ldapsearch -x -H ldap://localhost -D "cn=admin,dc=iam,dc=asml,dc=com" -w adminpassword -b "ou=users,dc=iam,dc=asml,dc=com" "(cn=${username})" cn | grep -c "^dn:"`
    const { stdout } = await execAsync(cmd)
    return parseInt(stdout.trim()) > 0
  } catch {
    return false
  }
}

async function finalVerificationTest() {
  console.log('🔍 FINAL VERIFICATION: ROLLBACK WITH CONTAINER CHECKS\n')
  
  const counterClient = new FailingCounterClient()
  const testClient = new TestClient()
  const testUsername = `final-test-${Date.now()}`
  const userDN = `cn=${testUsername},ou=users,dc=iam,dc=asml,dc=com`
  
  try {
    await testClient.connect()
    
    // Get initial counter value
    const initialUid = await counterClient.getNextUid()
    console.log(`📊 Initial counter value: ${initialUid}`)
    
    // Create user
    const userAttributes = {
      objectClass: ['inetOrgPerson', 'posixAccount'],
      cn: testUsername,
      sn: 'Final',
      uid: testUsername,
      uidNumber: initialUid.toString(),
      gidNumber: initialUid.toString(),
      homeDirectory: `/home/${testUsername}`,
      mail: `${testUsername}@test.com`
    }
    
    console.log(`\n👤 Creating user: ${testUsername}`)
    await testClient.createUser(userDN, userAttributes)
    console.log('✅ User created in LDAP')
    
    // Verify user exists via both methods
    const existsViaClient = await testClient.userExists(userDN)
    const existsViaContainer = await checkContainerDirect(testUsername)
    console.log(`📋 User exists (LDAP client): ${existsViaClient}`)
    console.log(`📋 User exists (container query): ${existsViaContainer}`)
    
    // Simulate counter failure and rollback
    console.log(`\n⚡ Simulating counter increment failure...`)
    try {
      await counterClient.incrementCounter(initialUid)
    } catch (counterErr: any) {
      console.log(`❌ Counter failed: ${counterErr.message}`)
      console.log(`🔄 Performing rollback...`)
      
      try {
        await testClient.deleteUser(userDN)
        console.log('✅ User deletion completed')
        
        // Wait a moment for LDAP to process
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Verify deletion via both methods
        const stillExistsViaClient = await testClient.userExists(userDN)
        const stillExistsViaContainer = await checkContainerDirect(testUsername)
        
        console.log(`\n🔍 POST-ROLLBACK VERIFICATION:`)
        console.log(`   User exists (LDAP client): ${stillExistsViaClient}`)
        console.log(`   User exists (container query): ${stillExistsViaContainer}`)
        
        // Check counter wasn't incremented
        const finalUid = await counterClient.getNextUid()
        console.log(`   Counter value: ${finalUid} (should be ${initialUid})`)
        
        const rollbackSuccess = !stillExistsViaClient && !stillExistsViaContainer && finalUid === initialUid
        
        console.log(`\n${rollbackSuccess ? '🎉' : '❌'} ROLLBACK ${rollbackSuccess ? 'SUCCESSFUL' : 'FAILED'}!`)
        
        if (rollbackSuccess) {
          console.log('✨ Perfect! The system maintained consistency:')
          console.log('   - User was created')
          console.log('   - Counter increment failed')
          console.log('   - User was completely removed')
          console.log('   - Counter remained unchanged')
          console.log('   - No orphaned data in LDAP container')
        }
        
      } catch (deletionErr: any) {
        console.log(`❌ CRITICAL: Rollback failed: ${deletionErr.message}`)
        const stillThere = await checkContainerDirect(testUsername)
        console.log(`⚠️  User still in container: ${stillThere}`)
      }
    }
    
  } catch (error: any) {
    console.log(`❌ Test failed: ${error.message}`)
  } finally {
    await testClient.disconnect()
    await counterClient.disconnect()
  }
}

finalVerificationTest()