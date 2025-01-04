'use strict'

class RWLock {
  constructor () {
    this._counters = { read: 0, write: 0 }
    this._queue = []
  }

  read (fn) {
    return this._enqueue('read', fn)
  }

  write (fn) {
    return this._enqueue('write', fn)
  }

  _enqueue (type, f) {
    let fn = async () => f()

    return new Promise((resolve, reject) => {
      this._queue.push({ type, fn, resolve, reject })
      this._poll()
    })
  }

  _poll () {
    while (true) {
      let next = this._queue[0]
      if (!next) return

      if (this._counters.write > 0) return
      if (next.type === 'write' && this._counters.read > 0) return

      let { type, fn, resolve, reject } = this._queue.shift()

      this._counters[type] += 1

      let promise = fn()
      promise.then(resolve, reject)

      promise.finally(() => {
        this._counters[type] -= 1
        this._poll()
      })
    }
  }
}

module.exports = RWLock
