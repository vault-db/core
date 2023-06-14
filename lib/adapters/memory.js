'use strict'

class MemoryAdapter {
  constructor () {
    this._shards = new Map()
  }

  async read (id) {
    let record = this._shards.get(id)

    if (record) {
      return { value: record.value, rev: record.rev }
    } else {
      return null
    }
  }

  async write (id, value, rev = null) {
    let record = this._shards.get(id)
    let expect = record ? record.rev : null

    if (rev !== expect) throw new Conflict()

    rev = (rev || 0) + 1
    this._shards.set(id, { value, rev })

    return { rev }
  }
}

class Conflict extends Error {
  constructor (message) {
    super(message)
    this.code = 'ERR_CONFLICT'
    this.name = 'Conflict'
  }
}

module.exports = MemoryAdapter
