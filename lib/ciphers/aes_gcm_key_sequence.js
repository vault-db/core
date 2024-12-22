'use strict'

const AesGcmSingleKeyCipher = require('./aes_gcm_single_key')
const { Cell } = require('../cell')
const Counters = require('../counters')

const KEY_USAGE_LIMIT = 2 ** 30
const KEY_FORMAT = 'base64'
const SEQ_BYTES = 8

const ALGO = {
  AES_256_GCM: 1
}

const KeyCodec = {
  encode ({ algo, key }) {
    let buf = Buffer.alloc(2 + key.length)

    buf.writeUInt16BE(algo, 0)
    key.copy(buf, 2)

    return buf
  },

  decode (buf) {
    let algo = buf.readUInt16BE(0)
    let key = buf.subarray(2, buf.length)

    return { algo, key }
  }
}

class AesGcmKeySequenceCipher {
  static async parse ({ keys, state }, cipher, verifier, config = {}) {
    keys = keys.map((str) => {
      let buf = Buffer.from(str, KEY_FORMAT)

      let seq = buf.readBigUInt64BE(0)
      let key = buf.subarray(SEQ_BYTES, buf.length)
      let cell = new Cell(cipher, KeyCodec, null, key)

      return { seq, cell }
    })

    let ids = keys.map((key) => key.seq)
    let counters = await Counters.parse(state, ids, verifier)

    return new AesGcmKeySequenceCipher(cipher, verifier, config, keys, counters)
  }

  constructor (cipher, verifier, config = {}, keys = null, counters = null) {
    this._cipher = cipher
    this._limit = config.limit || KEY_USAGE_LIMIT
    this._keys = keys || []
    this._counters = counters || new Counters(verifier)
    this._mutex = new Mutex()

    this._bySeq = new Map()

    for (let [i, { seq }] of this._keys.entries()) {
      this._bySeq.set(seq, i)
    }
  }

  getCounters () {
    return this._counters
  }

  size () {
    return this._keys.length
  }

  async serialize () {
    return {
      keys: await this._getKeys(),
      state: await this._counters.serialize()
    }
  }

  _getKeys () {
    let keys = this._keys.map(async ({ seq, cell }) => {
      let key = await cell.serialize()
      let buf = Buffer.alloc(SEQ_BYTES + key.length)

      buf.writeBigUInt64BE(seq, 0)
      key.copy(buf, SEQ_BYTES)

      return buf.toString(KEY_FORMAT)
    })

    return Promise.all(keys)
  }

  async encrypt (data) {
    return this._mutex.lock(async () => {
      let { seq, cell } = await this._getLatestKey()
      let { key } = await cell.get()

      this._counters.incr(seq)

      let cipher = new AesGcmSingleKeyCipher({ key })
      let enc = await cipher.encrypt(data)

      let buf = Buffer.alloc(SEQ_BYTES + enc.length)
      buf.writeBigUInt64BE(seq)
      enc.copy(buf, SEQ_BYTES)

      return buf
    })
  }

  async decrypt (data) {
    return this._mutex.lock(async () => {
      let seq = data.readBigUInt64BE()
      let enc = data.subarray(SEQ_BYTES, data.length)

      let { algo, key } = await this._getKeyBySeq(seq)

      if (algo !== ALGO.AES_256_GCM) {
        throw new KeyParseError(`unrecognised algorithm ID: #${algo}`)
      }

      let cipher = new AesGcmSingleKeyCipher({ key })
      return cipher.decrypt(enc)
    })
  }

  async _getLatestKey () {
    let len = this._keys.length

    if (len > 0) {
      let last = this._keys[len - 1]
      let ctr = this._counters.get(last.seq)
      if (ctr < this._limit) return last
    }

    let cell = new Cell(this._cipher, KeyCodec, null).set({
      algo: ALGO.AES_256_GCM,
      key: await AesGcmSingleKeyCipher.generateKey()
    })

    let seq = (len === 0) ? 1n : this._keys[len - 1].seq + 1n

    this._keys.push({ seq, cell })
    this._bySeq.set(seq, len)
    this._counters.init(seq, 0n)

    return this._keys[len]
  }

  async _getKeyBySeq (seq) {
    if (!this._bySeq.has(seq)) {
      throw new MissingKeyError(`no key found with sequence number #${seq}`)
    }

    let idx = this._bySeq.get(seq)
    let key = this._keys[idx]

    return key.cell.get()
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

class Mutex {
  constructor () {
    this._current = Promise.resolve()
  }

  lock (fn) {
    this._current = this._current.then(fn, fn)
    return this._current
  }
}

module.exports = AesGcmKeySequenceCipher
