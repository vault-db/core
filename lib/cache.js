'use strict'

const Shard = require('./shard')

class Cache {
  constructor (adapter) {
    this._adapter = adapter
    this._shards = new Map()
  }

  async read (id) {
    if (!this._shards.has(id)) this._fetch(id)

    let { shard } = await this._shards.get(id)
    return shard
  }

  async reload (id) {
    this._shards.delete(id)
    return this.read(id)
  }

  async write (id) {
    try {
      let record = await this._shards.get(id)
      let value = await record.shard.serialize()
      let response = await this._adapter.write(id, value, record.rev)
      record.rev = response.rev
    } catch (error) {
      if (error.code === 'ERR_CONFLICT') this.reload(id)
      throw error
    }
  }

  _fetch (id) {
    let request = this._request(id)
    request.catch(() => this._shards.delete(id))
    this._shards.set(id, request)
  }

  async _request (id) {
    let response = await this._adapter.read(id)

    if (response) {
      let shard = Shard.parse(response.value)
      return { shard, rev: response.rev }
    } else {
      let shard = Shard.parse(null)
      return { shard, rev: null }
    }
  }
}

module.exports = Cache
