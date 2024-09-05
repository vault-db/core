'use strict'

const crypto = require('./crypto')

const KEY_FORMAT = 'base64'

class Router {
  static async generateKey () {
    let key = await crypto.hmacSha256.generateKey()
    return key.toString(KEY_FORMAT)
  }

  constructor (config) {
    this._config = config
  }

  async getShardId (pathStr) {
    let pathBuf = Buffer.from(pathStr, 'utf8')
    let key = Buffer.from(this._config.key, KEY_FORMAT)
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
