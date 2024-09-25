'use strict'

const AesGcmSingleKeyCipher = require('./aes_gcm_single_key')
const Mutex = require('../sync/mutex')

const KEY_USAGE_LIMIT = 2 ** 30

class AesGcmKeySequenceCipher {
  constructor (config = {}) {
    this._limit = config.limit || KEY_USAGE_LIMIT
    this._keys = []
    this._mutex = new Mutex()
  }

  size () {
    return this._keys.length
  }

  async encrypt (data) {
    return this._mutex.lock(async () => {
      let key = await this._getLatestKey()

      key.ctr += 1
      let enc = await key.cipher.encrypt(data)

      let buf = Buffer.alloc(4 + enc.length)
      buf.writeUInt32BE(key.seq)
      enc.copy(buf, 4)

      return buf
    })
  }

  async decrypt (data) {
    return this._mutex.lock(() => {
      let seq = data.readUInt32BE()
      let enc = data.slice(4, data.length)

      let key = this._keys.find((key) => key.seq === seq)

      if (key) {
        return key.cipher.decrypt(enc)
      } else {
        throw new MissingKeyError(`no key found with sequence number #${seq}`)
      }
    })
  }

  async _getLatestKey () {
    let len = this._keys.length

    if (len > 0) {
      let last = this._keys[len - 1]
      if (last.ctr < this._limit) return last
    }

    let cipher = await AesGcmSingleKeyCipher.generate()
    let key = { seq: len + 1, cipher, ctr: 0 }
    this._keys.push(key)

    return key
  }
}

class MissingKeyError extends Error {
  constructor (message) {
    super(message)
    this.code = 'ERR_MISSING_KEY'
    this.name = 'MissingKeyError'
  }
}

module.exports = AesGcmKeySequenceCipher
