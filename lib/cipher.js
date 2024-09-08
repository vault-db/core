'use strict'

const crypto = require('./crypto')

const { AES_IV_SIZE } = require('./crypto/constants')
const OUTPUT_FORMAT = 'base64'
const VERSION = 1

const HEADER = Buffer.alloc(2)
HEADER.writeUInt16BE(VERSION)

class Cipher {
  static async generateKey () {
    return crypto.aes256gcm.generateKey()
  }

  constructor (config) {
    this._config = config
  }

  async encrypt (data) {
    let key = this._config.key
    if (key === null) return data

    data = Buffer.from(data, 'utf8')
    let iv = await crypto.aes256gcm.generateIv()

    let chunks = [
      HEADER,
      iv,
      await crypto.aes256gcm.encrypt(key, iv, data)
    ]

    return Buffer.concat(chunks).toString(OUTPUT_FORMAT)
  }

  async decrypt (data) {
    let key = this._config.key
    if (key === null) return data

    data = Buffer.from(data, OUTPUT_FORMAT)

    let a = HEADER.length
    let b = a + AES_IV_SIZE / 8

    let iv = data.slice(a, b)
    let enc = data.slice(b, data.length)

    let msg = await crypto.aes256gcm.decrypt(key, iv, enc)
    return msg.toString('utf8')
  }
}

module.exports = Cipher
