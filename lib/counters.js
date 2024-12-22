'use strict'

const CTR_BYTES = 8

class Counters {
  static async parse (state, ids, verifier) {
    state = await verifier.parse(state)

    if (state.length !== CTR_BYTES * ids.length) {
      throw new CounterError(`buffer size mismatch: state size ${state.length} is incorrect for ${ids.length} keys`)
    }

    let counters = new Counters(verifier)

    for (let [i, id] of ids.entries()) {
      let ctr = state.readBigUInt64BE(CTR_BYTES * i)
      counters.init(id, ctr)
    }

    return counters
  }

  constructor (verifier, ids = []) {
    this._verifier = verifier
    this._ids = ids
    this._inits = new Map()
    this._values = new Map()
  }

  async serialize () {
    let buf = Buffer.alloc(CTR_BYTES * this._ids.length)

    for (let [i, id] of this._ids.entries()) {
      let ctr = this._values.get(id)
      buf.writeBigUInt64BE(ctr, CTR_BYTES * i)
    }

    return this._verifier.sign(buf)
  }

  init (id, ctr = 0n) {
    if (this._values.has(id)) {
      throw new CounterError(`counter "${id}" is already initialised`)
    } else {
      this._ids.push(id)
      this._inits.set(id, BigInt(ctr))
      this._values.set(id, BigInt(ctr))
    }
  }

  incr (id) {
    if (this._values.has(id)) {
      let ctr = this._values.get(id)
      this._values.set(id, ctr + 1n)
    } else {
      throw new CounterError(`cannot increment unknown counter "${id}"`)
    }
  }

  get (id) {
    return this._values.get(id) || 0n
  }

  merge (other) {
    for (let id of other._ids) {
      if (!this._values.has(id)) continue

      let init = other._inits.get(id)
      if (init === 0n) continue

      let value = other._values.get(id)
      let diff = value - init

      let ctr = this._values.get(id)
      this._values.set(id, ctr + diff)
    }
  }

  commit () {
    for (let [id, value] of this._values) {
      this._inits.set(id, value)
    }
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
