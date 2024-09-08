'use strict'

const crypto = require('./crypto')

class Cipher {
  static async generateKey () {
    return crypto.aes256gcm.generateKey()
  }

  constructor (config) {
    this._config = config
  }

  async encrypt (data) {
    return data
  }

  async decrypt (data) {
    return data
  }
}

module.exports = Cipher
