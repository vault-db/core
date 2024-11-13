'use strict'

const { aes256gcm } = require('../crypto')
const { AES_GCM_IV_SIZE } = require('../crypto/constants')

class AesGcmSingleKeyCipher {
  static async generate () {
    let key = await aes256gcm.generateKey()
    return new AesGcmSingleKeyCipher({ key })
  }

  static async generateKey () {
    return aes256gcm.generateKey()
  }

  constructor (config) {
    this._config = config
  }

  getKey () {
    return this._config.key
  }

  async encrypt (data) {
    let { key } = this._config

    let iv = await aes256gcm.generateIv()
    let enc = await aes256gcm.encrypt(key, iv, data)

    return Buffer.concat([iv, enc])
  }

  async decrypt (data) {
    let { key } = this._config

    let a = AES_GCM_IV_SIZE / 8
    let iv = data.slice(0, a)
    let enc = data.slice(a, data.length)

    return aes256gcm.decrypt(key, iv, enc)
  }
}

module.exports = AesGcmSingleKeyCipher
