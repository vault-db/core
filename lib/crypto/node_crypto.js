'use strict'

const crypto = require('crypto')
const { promisify } = require('util')

module.exports = {
  sha256: {
    async digest (data) {
      let hash = crypto.createHash('sha256')
      hash.update(data)
      return hash.digest()
    }
  },

  hmacSha256: {
    async generateKey () {
      let key = await promisify(crypto.generateKey)('hmac', { length: 512 })
      return key.export({ format: 'buffer' })
    },

    async digest (key, data) {
      let hmac = crypto.createHmac('sha256', key)
      hmac.update(data)
      return hmac.digest()
    }
  }
}
