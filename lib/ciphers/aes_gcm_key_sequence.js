'use strict'

const AesGcmSingleKeyCipher = require('./aes_gcm_single_key')
const Mutex = require('../sync/mutex')
const { aes256gcm } = require('../crypto')
const KeySequence = require('../key_sequence')

const KEY_USAGE_LIMIT = 2 ** 30
const STATE_FORMAT = 'base64'

const ALGO = {
  AES_256_GCM: 1
}

class AesGcmKeySequenceCipher {
  static parse ({ keys, state }, cipher, config = {}) {
    let sequence = KeySequence.parse(keys, cipher)
    let counters = new Map()

    state = Buffer.from(state, STATE_FORMAT)

    if (state.length !== 4 * sequence.size()) {
      throw new KeyParseError(`buffer size mismatch: state size ${state.length} is incorrect for ${sequence.size()} keys`)
    }

    for (let [i, { seq }] of sequence.entries()) {
      let ctr = state.readUInt32BE(4 * i)
      counters.set(seq, ctr)
    }

    return new AesGcmKeySequenceCipher(cipher, config, sequence, counters)
  }

  constructor (cipher, config = {}, keys = null, counters = null) {
    this._keys = keys || new KeySequence(cipher)
    this._counters = counters || new Map()
    this._limit = config.limit || KEY_USAGE_LIMIT
    this._mutex = new Mutex()
  }

  size () {
    return this._keys.size()
  }

  async serialize () {
    return {
      keys: await this._keys.serialize(),
      state: this.getState().toString(STATE_FORMAT)
    }
  }

  getState () {
    let buf = Buffer.alloc(4 * this._keys.size())

    for (let [i, { seq }] of this._keys.entries()) {
      let ctr = this._counters.get(seq)
      buf.writeUInt32BE(ctr, 4 * i)
    }

    return buf
  }

  async encrypt (data) {
    return this._mutex.lock(async () => {
      let { seq, key } = await this._getLatestKey()

      let ctr = this._counters.get(seq) || 0
      this._counters.set(seq, ctr + 1)

      let cipher = new AesGcmSingleKeyCipher({ key })
      let enc = await cipher.encrypt(data)

      let buf = Buffer.alloc(4 + enc.length)
      buf.writeUInt32BE(seq)
      enc.copy(buf, 4)

      return buf
    })
  }

  async decrypt (data) {
    return this._mutex.lock(async () => {
      let seq = data.readUInt32BE()
      let enc = data.slice(4, data.length)

      let { algo, key } = await this._keys.getBySeq(seq)

      if (algo !== ALGO.AES_256_GCM) {
        throw new KeyParseError(`unrecognised algorithm ID: #${algo}`)
      }

      let cipher = new AesGcmSingleKeyCipher({ key })
      return cipher.decrypt(enc)
    })
  }

  async _getLatestKey () {
    if (this._keys.size() === 0) return this._createKey()

    let { seq, key } = await this._keys.getLatest()
    let ctr = this._counters.get(seq)

    if (ctr >= this._limit) {
      return this._createKey()
    } else {
      return { seq, key }
    }
  }

  async _createKey () {
    let entry = {
      algo: ALGO.AES_256_GCM,
      key: await aes256gcm.generateKey()
    }

    let { seq } = this._keys.push(entry)
    return { seq, ...entry }
  }
}

class KeyParseError extends Error {
  constructor (message) {
    super(message)
    this.code = 'ERR_PARSE_KEY'
    this.name = 'KeyParseError'
  }
}

module.exports = AesGcmKeySequenceCipher
