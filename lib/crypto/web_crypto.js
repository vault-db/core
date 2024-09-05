'use strict'

// TODO: fix this import for the browser
const crypto = require('crypto').webcrypto
const { subtle } = crypto

const HMAC_PARAMS = { name: 'HMAC', hash: 'SHA-256', length: 512 }

module.exports = {
  sha256: {
    async digest (data) {
      let hash = await subtle.digest({ name: 'SHA-256' }, data)
      return Buffer.from(hash)
    }
  },

  hmacSha256: {
    async generateKey () {
      let key = await subtle.generateKey(HMAC_PARAMS, true, ['sign'])
      key = await subtle.exportKey('raw', key)
      return Buffer.from(key)
    },

    async digest (key, data) {
      key = await subtle.importKey('raw', key, HMAC_PARAMS, false, ['sign'])
      let hash = await subtle.sign('HMAC', key, data)
      return Buffer.from(hash)
    }
  }
}
