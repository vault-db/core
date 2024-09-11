'use strict'

const { Buffer } = require('buffer')
const crypto = require('./crypto')

class Router {
  static async generateKey () {
    return crypto.hmacSha256.generateKey()
  }

  constructor (config) {
    this._config = config
  }

  async getShardId (pathStr) {
    let pathBuf = Buffer.from(pathStr, 'utf8')
    let key = this._config.key
    let hash = await crypto.hmacSha256.digest(key, pathBuf)

    return this._shardIdFromHash(hash)
  }

  _shardIdFromHash (hash) {
    let level = this._config.level
    let shards = 2 ** level
    let digits = Math.ceil(level / 4)

    let id = (hash.readUint32BE() % shards).toString(16)
    while (id.length < digits) id = '0' + id

    return 'shard-' + id
  }
}

module.exports = Router
