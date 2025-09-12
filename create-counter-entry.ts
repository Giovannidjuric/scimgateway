#!/usr/bin/env bun
// Script to create the uidNext counter entry in LDAP

import ldap from 'ldapjs'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const client = ldap.createClient({
  url: process.env.COUNTER_LDAP_URL || 'ldap://localhost:389',
  timeout: 5000,
  connectTimeout: 10000
})

async function createCounterEntry() {
  try {
    console.log('Connecting to LDAP server...')
    
    // Bind as admin
    await new Promise<void>((resolve, reject) => {
      client.bind(
        process.env.COUNTER_LDAP_BIND_DN || 'cn=admin,dc=iam,dc=asml,dc=com',
        process.env.COUNTER_LDAP_BIND_PASSWORD || 'adminpassword',
        (err) => {
          if (err) {
            console.error('Bind failed:', err.message)
            reject(err)
          } else {
            console.log('✅ Successfully bound to LDAP')
            resolve()
          }
        }
      )
    })

    // Create the counter entry
    const counterDN = process.env.COUNTER_LDAP_COUNTER_DN || 'cn=uidNext,ou=users,dc=iam,dc=asml,dc=com'
    const counterEntry = {
      cn: 'uidNext',
      objectClass: ['top', 'organizationalRole', 'extensibleObject'],
      uidNumber: '10000',
      description: 'Counter for automatic POSIX UID assignment'
    }

    console.log(`Creating counter entry: ${counterDN}`)
    console.log('Entry attributes:', JSON.stringify(counterEntry, null, 2))

    await new Promise<void>((resolve, reject) => {
      client.add(counterDN, counterEntry, (err) => {
        if (err) {
          if (err.message?.includes('ENTRY_EXISTS') || err.code === 68) {
            console.log('⚠️  Counter entry already exists')
            resolve()
          } else {
            console.error('Add failed:', err.message)
            reject(err)
          }
        } else {
          console.log('✅ Successfully created counter entry')
          resolve()
        }
      })
    })

    // Verify the entry was created by searching for it
    console.log('\n🔍 Verifying counter entry...')
    await new Promise<void>((resolve, reject) => {
      client.search(counterDN, {
        scope: 'base',
        attributes: ['cn', 'uidNumber', 'description', 'objectClass']
      }, (err, res) => {
        if (err) {
          console.error('Search failed:', err.message)
          reject(err)
          return
        }

        res.on('searchEntry', (entry) => {
          console.log('✅ Found counter entry:')
          console.log('DN:', entry.objectName)
          entry.attributes.forEach(attr => {
            console.log(`${attr.type}:`, attr.values)
          })
        })

        res.on('error', (err) => {
          console.error('Search error:', err.message)
          reject(err)
        })

        res.on('end', () => {
          console.log('✅ Counter entry verification complete')
          resolve()
        })
      })
    })

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    client.unbind()
    console.log('LDAP connection closed')
  }
}

createCounterEntry()