#!/usr/bin/env bun
// Test the improved configuration integration

import { LdapCounterClient } from './lib/ldap-counter-client'
import * as utils from './lib/utils'
import fs from 'fs'

async function testConfigIntegration() {
  console.log('🧪 Testing improved configuration integration...\n')

  try {
    // Read the plugin configuration like the main plugin does
    const configPath = './config/plugin-ldap.json'
    const pluginConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    
    // Extract the configuration for the counter client with password decryption
    const baseEntity = 'undefined'
    const counterConfig = {
      url: pluginConfig.endpoint.entity[baseEntity].baseUrls[0],
      bindDN: pluginConfig.endpoint.entity[baseEntity].username,
      bindPassword: utils.getSecret(`endpoint.entity.${baseEntity}.password`, configPath),
      counterDN: pluginConfig.endpoint.entity[baseEntity].ldap.counterDN
    }
    
    console.log('📋 Configuration extracted from plugin-ldap.json:')
    console.log(`   URL: ${counterConfig.url}`)
    console.log(`   Bind DN: ${counterConfig.bindDN}`)
    console.log(`   Counter DN: ${counterConfig.counterDN}`)
    console.log(`   Password: [${counterConfig.bindPassword ? 'PROVIDED' : 'MISSING'}]`)
    
    // Test the counter client with the shared configuration
    console.log('\n🔗 Testing counter client with shared config...')
    const counterClient = new LdapCounterClient(counterConfig)
    
    // Test connection and get current UID
    const currentUid = await counterClient.getNextUid()
    console.log(`✅ Successfully retrieved UID: ${currentUid}`)
    
    // Test static method with config
    console.log('\n📊 Testing static method with config...')
    const staticUid = await LdapCounterClient.getNextUidQuick(counterConfig)
    console.log(`✅ Static method returned UID: ${staticUid}`)
    
    if (currentUid === staticUid) {
      console.log('✅ Both methods returned same UID (consistent)')
    } else {
      console.log('⚠️  Methods returned different UIDs (counter may have been incremented)')
    }
    
    await counterClient.disconnect()
    
    console.log('\n🎉 Configuration integration test PASSED!')
    console.log('✨ Benefits of this approach:')
    console.log('   ✓ Single source of truth for LDAP configuration')
    console.log('   ✓ No duplicate environment variables needed')
    console.log('   ✓ Consistent with main plugin configuration')
    console.log('   ✓ Counter DN configurable in plugin-ldap.json')
    
  } catch (error: any) {
    console.error('❌ Configuration integration test FAILED:', error.message)
  }
}

testConfigIntegration()