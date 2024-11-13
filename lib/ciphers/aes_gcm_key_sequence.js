'use strict'

const AesGcmSingleKeyCipher = require('./aes_gcm_single_key')
const Mutex = require('../sync/mutex')

const KEY_USAGE_LIMIT = 2 ** 30

const ALGO = {
  AES_256_GCM: 1
}

class AesGcmKeySequenceCipher {
  static parse ({ keys, state }, config = {}) {
    keys = keys.map((buf) => {
      let seq = buf.readUInt32BE(0)
      let algo = buf.readUInt16BE(4)

      if (algo !== ALGO.AES_256_GCM) {
        throw new KeyParseError(`key #${seq} has unrecognised algorithm: ${algo}`)
      }

      let len = buf.readUInt16BE(6)
      let key = buf.slice(8, 8 + len)
      let cipher = new AesGcmSingleKeyCipher({ key })

      return { seq, cipher }
    })

    if (state.length !== 4 * keys.length) {
      throw new KeyParseError(`buffer size mismatch: state size ${state.length} is incorrect for ${keys.length} keys`)
    }

    for (let [i, key] of keys.entries()) {
      key.ctr = state.readUInt32BE(4 * i)
    }

    return new AesGcmKeySequenceCipher(config, keys)
  }

  constructor (config = {}, keys = []) {
    this._limit = config.limit || KEY_USAGE_LIMIT
    this._keys = keys
    this._mutex = new Mutex()
  }

  size () {
    return this._keys.length
  }

  serialize () {
    return { keys: this.getKeys(), state: this.getState() }
  }

  getKeys () {
    return this._keys.map(({ seq, cipher }) => {
      let key = cipher.getKey()
      let buf = Buffer.alloc(8 + key.length)

      buf.writeUInt32BE(seq, 0)
      buf.writeUInt16BE(ALGO.AES_256_GCM, 4)
      buf.writeUInt16BE(key.length, 6)
      key.copy(buf, 8)

      return buf
    })
  }

  getState () {
    let buf = Buffer.alloc(4 * this._keys.length)

    for (let [i, { ctr }] of this._keys.entries()) {
      buf.writeUInt32BE(ctr, 4 * i)
    }
    return buf
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

class KeyParseError extends Error {
  constructor (message) {
    super(message)
    this.code = 'ERR_PARSE_KEY'
    this.name = 'KeyParseError'
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
