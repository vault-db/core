'use strict'

const { aes256gcm } = require('./crypto')
const AesGcmSingleKeyCipher = require('./ciphers/aes_gcm_single_key')

const OUTPUT_FORMAT = 'base64'
const ENCRYPTED_KEY_SIZE = 480

const VERSION = 1
const HEADER = Buffer.alloc(2)
HEADER.writeUInt16BE(VERSION)

class Cipher {
  static async generateKey () {
    return aes256gcm.generateKey()
  }

  constructor (config) {
    this._config = config
  }

  async encrypt (data) {
    let key = this._config.key
    if (key === null) return data

    let itemKey = await Cipher.generateKey()
    data = Buffer.from(data, 'utf8')

    let [encKey, encData] = await Promise.all([
      this._encryptSingle(key, itemKey),
      this._encryptSingle(itemKey, data)
    ])

    let chunks = [HEADER, encKey, encData]
    return Buffer.concat(chunks).toString(OUTPUT_FORMAT)
  }

  async _encryptSingle (key, data) {
    return new AesGcmSingleKeyCipher({ key }).encrypt(data)
  }

  async decrypt (data) {
    let key = this._config.key
    if (key === null) return data

    data = Buffer.from(data, OUTPUT_FORMAT)

    let a = HEADER.length
    let b = a + ENCRYPTED_KEY_SIZE / 8

    let encKey = data.slice(a, b)
    let encData = data.slice(b, data.length)

    let itemKey = await this._decryptSingle(key, encKey)
    let msg = await this._decryptSingle(itemKey, encData)

    return msg.toString('utf8')
  }

  async _decryptSingle (key, data) {
    return new AesGcmSingleKeyCipher({ key }).decrypt(data)
  }
}

module.exports = Cipher
