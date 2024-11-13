'use strict'

class Cell {
  constructor (cipher, codec, data) {
    this._cipher = cipher
    this._codec = codec
    this._encrypted = data || null
    this._decrypted = null
    this._modified = false
  }

  async serialize () {
    if (this._modified) {
      let data = this._codec.encode(this._decrypted)
      this._encrypted = await this._cipher.encrypt(data)
      this._modified = false
    }

    return this._encrypted
  }

  get () {
    this._decrypted = this._decrypted || this._decrypt()
    return this._decrypted
  }

  async _decrypt () {
    if (this._encrypted === null) return null

    let data = await this._cipher.decrypt(this._encrypted)
    return this._codec.decode(data)
  }

  set (value) {
    this._decrypted = value
    this._modified = true
    return this
  }

  async update (fn) {
    let value = await this.get()
    this.set(await fn(value))
  }
}

const JsonCodec = {
  encode (value) {
    let json = JSON.stringify(value)
    return Buffer.from(json, 'utf8')
  },

  decode (buffer) {
    let string = buffer.toString('utf8')
    return JSON.parse(string)
  }
}

const NullCodec = {
  encode (value) {
    return value
  },

  decode (buffer) {
    return buffer
  }
}

module.exports = {
  Cell,
  JsonCodec,
  NullCodec
}
