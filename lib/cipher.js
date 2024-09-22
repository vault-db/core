'use strict'

const { aes256gcm } = require('./crypto')

const { AES_GCM_IV_SIZE } = require('./crypto/constants')
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
    let iv = await aes256gcm.generateIv()
    let enc = await aes256gcm.encrypt(key, iv, data)
    return Buffer.concat([iv, enc])
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
    let a = AES_GCM_IV_SIZE / 8
    let iv = data.slice(0, a)
    let enc = data.slice(a, data.length)

    return aes256gcm.decrypt(key, iv, enc)
  }
}

module.exports = Cipher
