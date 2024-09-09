'use strict'

const Cipher = require('./cipher')
const Router = require('./router')

const VERSION = 1
const KEY_ID = 'config'
const KEY_FORMAT = 'base64'
const DEFAULT_SHARDING_LEVEL = 2

class Config {
  static async open (adapter, options = {}) {
    let data = await loadOrCreate(adapter, options)
    return new Config(data)
  }

  constructor (data) {
    this._data = data
  }

  async buildCipher () {
    let { key, ...rest } = this._data.cipher
    key = Buffer.from(key, KEY_FORMAT)
    return new Cipher({ key, ...rest })
  }

  async buildRouter () {
    let { key, ...rest } = this._data.sharding
    key = Buffer.from(key, KEY_FORMAT)
    return new Router({ key, ...rest })
  }
}

async function loadOrCreate (adapter, options) {
  let response = await adapter.read(KEY_ID)
  if (response) return JSON.parse(response.value)

  try {
    let config = await buildInitialConfig(options)
    let json = JSON.stringify(config, true, 2)
    await adapter.write(KEY_ID, json, null)
    return config

  } catch (error) {
    if (error.code === 'ERR_CONFLICT') {
      return loadOrCreate(adapter, options)
    } else {
      throw error
    }
  }
}

async function buildInitialConfig (options) {
  let cipherKey = await Cipher.generateKey()
  let routerKey = await Router.generateKey()

  let shardLevel = options.sharding
  if (typeof shardLevel !== 'number') shardLevel = DEFAULT_SHARDING_LEVEL

  return {
    version: 1,

    cipher: {
      key: cipherKey.toString(KEY_FORMAT),
    },

    sharding: {
      key: routerKey.toString(KEY_FORMAT),
      level: shardLevel
    }
  }
}

module.exports = Config
