'use strict'

// TODO: fix this import for the browser
const crypto = require('crypto').webcrypto

const HMAC_PARAMS = { name: 'HMAC', hash: 'SHA-256' }
const KEY_SIZE = 256
const KEY_FORMAT = 'base64'

class Router {
  static async generateKey () {
    let key = Buffer.alloc(KEY_SIZE / 8)
    crypto.getRandomValues(key)
    return key.toString(KEY_FORMAT)
  }

  constructor (config) {
    this._config = config
  }

  async getShardId (pathStr) {
    let pathBuf = Buffer.from(pathStr, 'utf8')
    let key = await this._getShardKey()
    let hash = await crypto.subtle.sign('HMAC', key, pathBuf)
    hash = Buffer.from(hash)

    return this._shardIdFromHash(hash)
  }

  _getShardKey () {
    let material = Buffer.from(this._config.key, KEY_FORMAT)
    return crypto.subtle.importKey('raw', material, HMAC_PARAMS, false, ['sign'])
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
