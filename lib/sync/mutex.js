'use strict'

class Mutex {
  constructor () {
    this._promise = Promise.resolve()
  }

  lock (fn) {
    this._promise = this._promise.then(fn, fn)
    return this._promise
  }
}

module.exports = Mutex
