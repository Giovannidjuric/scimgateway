// Dedicated LDAP client for UID counter operations
// Uses shared configuration from plugin-ldap.json

import ldap from 'ldapjs'
import * as utils from './utils'

export interface CounterConfig {
  url: string
  bindDN: string
  bindPassword: string
  counterDN: string
  timeout?: number
}

export class LdapCounterClient {
  private client: ldap.Client | null = null
  private config: CounterConfig
  private isConnected = false

  constructor(config: CounterConfig) {
    this.config = {
      timeout: 5000,
      ...config
    }
  }

  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return
    }

    this.client = ldap.createClient({
      url: this.config.url,
      timeout: this.config.timeout,
      connectTimeout: this.config.timeout
    })

    return new Promise<void>((resolve, reject) => {
      this.client!.bind(this.config.bindDN, this.config.bindPassword, (err) => {
        if (err) {
          console.error('LDAP Counter Client: Bind failed:', err.message)
          reject(new Error(`Counter LDAP bind failed: ${err.message}`))
        } else {
          this.isConnected = true
          resolve()
        }
      })
    })
  }

  async getNextUid(): Promise<number> {
    if (!this.isConnected || !this.client) {
      await this.connect()
    }

    return new Promise<number>((resolve, reject) => {
      this.client!.search(this.config.counterDN, {
        scope: 'base',
        attributes: ['uidNumber']
      }, (err, res) => {
        if (err) {
          console.error('Counter Client: Search failed:', err.message)
          reject(new Error(`Counter search failed: ${err.message}`))
          return
        }

        let uidNumber: number | null = null

        res.on('searchEntry', (entry) => {
          const uidAttr = entry.attributes.find(attr => attr.type === 'uidNumber')
          if (uidAttr && uidAttr.values.length > 0) {
            uidNumber = parseInt(uidAttr.values[0] as string, 10)
          }
        })

        res.on('error', (err) => {
          console.error('Counter Client: Search error:', err.message)
          reject(new Error(`Counter search error: ${err.message}`))
        })

        res.on('end', () => {
          if (uidNumber === null) {
            reject(new Error('Counter entry found but no uidNumber attribute'))
          } else {
            resolve(uidNumber)
          }
        })
      })
    })
  }

  async incrementCounter(currentUid: number): Promise<void> {
    if (!this.isConnected || !this.client) {
      await this.connect()
    }

    const nextUid = currentUid + 1

    return new Promise<void>((resolve, reject) => {
      // Create modify operation to update uidNumber
      const change = new ldap.Change({
        operation: 'replace',
        modification: new ldap.Attribute({
          type: 'uidNumber',
          values: [nextUid.toString()]
        })
      })

      this.client!.modify(this.config.counterDN, change, (err) => {
        if (err) {
          console.error('Counter Client: Counter update failed:', err.message)
          reject(new Error(`Counter update failed: ${err.message}`))
        } else {
          resolve()
        }
      })
    })
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect()
      await this.getNextUid()
      return true
    } catch (error) {
      return false
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.unbind()
      this.client = null
      this.isConnected = false
    }
  }

  // Static method for quick operations
  static async getNextUidQuick(config: CounterConfig): Promise<number> {
    const client = new LdapCounterClient(config)
    try {
      return await client.getNextUid()
    } finally {
      await client.disconnect()
    }
  }

  static async incrementCounterQuick(config: CounterConfig, currentUid: number): Promise<void> {
    const client = new LdapCounterClient(config)
    try {
      await client.incrementCounter(currentUid)
    } finally {
      await client.disconnect()
    }
  }
}