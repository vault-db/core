'use strict'

const crypto = require('./crypto')

const ID_SIZE = 16
const ID_MAX = 2 ** ID_SIZE

class Router {
  static async generateKey () {
    return crypto.hmacSha256.generateKey()
  }

  constructor (config) {
    this._config = config
    this._ranges = generateRanges(config.level)
  }

  async getShardId (pathStr) {
    let pathBuf = Buffer.from(pathStr, 'utf8')
    let key = this._config.key
    let hash = await crypto.hmacSha256.digest(key, pathBuf)

    return this._shardIdFromHash(hash)
  }

  _shardIdFromHash (hash) {
    let id = hash.readUint16BE()

    for (let [a, b, name] of this._ranges) {
      if (id >= a && id <= b) return name
    }
  }
}

function generateRanges (level) {
  let n = 2 ** level

  let boundary = (i) => Math.round(ID_MAX * i / n)

  let ranges = new Array(n).fill(null).map((_, i) => {
    let a = boundary(i)
    let b = boundary(i + 1) - 1
    return [a, b, `shard-${hex(a)}-${hex(b)}`]
  })

  return ranges
}

function hex (n) {
  let str = n.toString(16)
  while (str.length < ID_SIZE / 4) str = '0' + str
  return str
}

module.exports = Router
