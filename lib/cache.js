'use strict'

const Shard = require('./shard')

class Cache {
  constructor (adapter, cipher, verifier) {
    this._adapter = adapter
    this._cipher = cipher
    this._verifier = verifier
    this._shards = new Map()
  }

  async read (id) {
    if (!this._shards.has(id)) this._fetch(id)

    let { shard } = await this._shards.get(id)
    return shard
  }

  async write (id) {
    try {
      let record = await this._shards.get(id)
      let value = await record.shard.serialize()
      let response = await this._adapter.write(id, value, record.rev)

      record.shard.getCounters().commit()
      record.rev = response.rev

    } catch (error) {
      if (error.code === 'ERR_CONFLICT') this._reload(id)
      throw error
    }
  }

  async _reload (id) {
    let record = this._shards.get(id)
    this._shards.delete(id)

    let read = this.read(id)

    let { shard: oldShard } = await record
    let newShard = await read

    newShard.getCounters().merge(oldShard.getCounters())
  }

  _fetch (id) {
    let request = this._request(id)
    request.catch(() => this._shards.delete(id))
    this._shards.set(id, request)
  }

  async _request (id) {
    let response = await this._adapter.read(id)

    if (response) {
      let shard = await Shard.parse(response.value, this._cipher, this._verifier)
      return { shard, rev: response.rev }
    } else {
      let shard = await Shard.parse(null, this._cipher, this._verifier)
      return { shard, rev: null }
    }
  }
}

module.exports = Cache
