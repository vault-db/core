'use strict'

class Counters {
  static async parse (state, ids, verifier) {
    state = await verifier.parse(state)

    if (state.length !== 4 * ids.length) {
      throw new CounterError(`buffer size mismatch: state size ${state.length} is incorrect for ${ids.length} keys`)
    }

    let counters = new Counters(verifier)

    for (let [i, id] of ids.entries()) {
      let ctr = state.readUInt32BE(4 * i)
      counters.init(id, ctr)
    }

    return counters
  }

  constructor (verifier, ids = []) {
    this._verifier = verifier
    this._ids = ids
    this._values = new Map()
  }

  async serialize () {
    let buf = Buffer.alloc(4 * this._ids.length)

    for (let [i, id] of this._ids.entries()) {
      let ctr = this._values.get(id)
      buf.writeUInt32BE(ctr, 4 * i)
    }

    return this._verifier.sign(buf)
  }

  init (id, ctr = 0) {
    if (this._values.has(id)) {
      throw new CounterError(`counter "${id}" is already initialised`)
    } else {
      this._ids.push(id)
      this._values.set(id, ctr)
    }
  }

  incr (id) {
    if (this._values.has(id)) {
      let ctr = this._values.get(id)
      this._values.set(id, ctr + 1)
    } else {
      throw new CounterError(`cannot increment unknown counter "${id}"`)
    }
  }

  get (id) {
    return this._values.get(id) || 0
  }
}

class CounterError extends Error {
  constructor (message) {
    super(message)
    this.code = 'ERR_COUNTER'
    this.name = 'CounterError'
  }
}

module.exports = Counters
