'use strict'

const { Cell } = require('./cell')

const KEY_FORMAT = 'base64'

const KeyCodec = {
  encode ({ algo, key }) {
    let buf = Buffer.alloc(2 + key.length)

    buf.writeUInt16BE(algo, 0)
    key.copy(buf, 2)

    return buf
  },

  decode (buf) {
    let algo = buf.readUInt16BE(0)
    let key = buf.slice(2, buf.length)

    return { algo, key }
  }
}

class KeySequence {
  static parse (keys, cipher) {
    keys = keys.map((str) => {
      let buf = Buffer.from(str, KEY_FORMAT)

      let seq = buf.readUInt32BE(0)
      let key = buf.slice(4, buf.length)
      let cell = new Cell(cipher, KeyCodec, key)

      return { seq, cell }
    })

    return new KeySequence(cipher, keys)
  }

  constructor (cipher, keys = []) {
    this._cipher = cipher
    this._keys = keys
  }

  size () {
    return this._keys.length
  }

  serialize () {
    let keys = this._keys.map(async ({ seq, cell }) => {
      let key = await cell.serialize()
      let buf = Buffer.alloc(4 + key.length)

      buf.writeUInt32BE(seq, 0)
      key.copy(buf, 4)

      return buf.toString(KEY_FORMAT)
    })

    return Promise.all(keys)
  }

  async getLatest () {
    let len = this._keys.length

    if (len > 0) {
      return this._keys[len - 1].cell.get()
    } else {
      throw new MissingKeyError('key sequence is empty')
    }
  }

  async getBySeq (seq) {
    let key = this._keys.find((key) => key.seq === seq)

    if (key) {
      return key.cell.get()
    } else {
      throw new MissingKeyError(`no key found with sequence number #${seq}`)
    }
  }

  push ({ algo, key }) {
    let len = this._keys.length
    let seq = (len === 0) ? 1 : this._keys[len - 1].seq + 1

    let cell = new Cell(this._cipher, KeyCodec).set({ algo, key })
    this._keys.push({ seq, cell })

    return { seq }
  }
}

class MissingKeyError extends Error {
  constructor (message) {
    super(message)
    this.code = 'ERR_MISSING_KEY'
    this.name = 'MissingKeyError'
  }
}

module.exports = KeySequence
