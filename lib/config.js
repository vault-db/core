'use strict'

const Cipher = require('./cipher')
const Router = require('./router')

const { aes256gcm, pbkdf2 } = require('./crypto')
const { AES_KEY_SIZE, AES_IV_SIZE } = require('./crypto/constants')

const VERSION = 1
const SHARD_ID = 'config'
const KEY_FORMAT = 'base64'
const SHARDING_LEVEL = 2
const PBKDF2_ITERATIONS = 1000

class Config {
  static async create (adapter, options = {}) {
    let data = await buildInitialConfig(options)
    let json = JSON.stringify(data, true, 2)

    try {
      await adapter.write(SHARD_ID, json, null)
      return new Config(data, options)
    } catch (error) {
      if (error.code === 'ERR_CONFLICT') {
        throw new ExistingStore()
      } else {
        throw error
      }
    }
  }

  static async open (adapter, options = {}) {
    let response = await adapter.read(SHARD_ID)

    if (response) {
      let data = JSON.parse(response.value)
      return new Config(data, options)
    } else {
      throw new MissingStore()
    }
  }

  constructor (data, options) {
    this._data = data

    let password = (options.key || {}).password || ''
    this._pwKey = this._deriveKey(password)
  }

  async _deriveKey (password) {
    let { salt, iter } = this._data.password
    salt = Buffer.from(salt, KEY_FORMAT)
    return pbkdf2.digest(password, salt, iter, AES_KEY_SIZE)
  }

  async buildCipher () {
    let { key, ...rest } = this._data.cipher
    let pwKey = await this._pwKey
    key = await decrypt(pwKey, key)
    return new Cipher({ key, ...rest })
  }

  async buildRouter () {
    let { key, ...rest } = this._data.sharding
    let pwKey = await this._pwKey
    key = await decrypt(pwKey, key)
    return new Router({ key, ...rest })
  }
}

async function buildInitialConfig (options) {
  let pw = (options.key || {}).password
  if (!pw) throw new ConfigError()

  let salt = await pbkdf2.generateSalt()
  let pwKey = await pbkdf2.digest(pw, salt, PBKDF2_ITERATIONS, AES_KEY_SIZE)

  let cipherKey = await Cipher.generateKey()
  let routerKey = await Router.generateKey()

  let shardLevel = (options.sharding || {}).level
  if (typeof shardLevel !== 'number') shardLevel = SHARDING_LEVEL

  return {
    version: VERSION,

    password: {
      salt: salt.toString(KEY_FORMAT),
      iter: PBKDF2_ITERATIONS
    },

    cipher: {
      key: await encrypt(pwKey, cipherKey)
    },

    sharding: {
      key: await encrypt(pwKey, routerKey),
      level: shardLevel
    }
  }
}

async function encrypt (key, data) {
  let iv = await aes256gcm.generateIv()
  let enc = await aes256gcm.encrypt(key, iv, data)
  return Buffer.concat([iv, enc]).toString(KEY_FORMAT)
}

async function decrypt (key, data) {
  data = Buffer.from(data, KEY_FORMAT)

  let a = AES_IV_SIZE / 8
  let iv = data.slice(0, a)
  let enc = data.slice(a, data.length)

  try {
    return await aes256gcm.decrypt(key, iv, enc)
  } catch (error) {
    throw new AccessDenied()
  }
}

class ConfigError extends Error {
  constructor () {
    super('store does not exist')
    this.code = 'ERR_CONFIG'
    this.name = 'ConfigError'
  }
}

class MissingStore extends Error {
  constructor () {
    super('store does not exist')
    this.code = 'ERR_MISSING'
    this.name = 'MissingStore'
  }
}

class ExistingStore extends Error {
  constructor () {
    super('store already exists')
    this.code = 'ERR_EXIST'
    this.name = 'ExistingStore'
  }
}

class AccessDenied extends Error {
  constructor () {
    super('store requires a valid password to unlock')
    this.code = 'ERR_ACCESS'
    this.name = 'AccessDenied'
  }
}

module.exports = Config