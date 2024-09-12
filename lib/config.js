'use strict'

const Cipher = require('./cipher')
const Router = require('./router')

const { aes256gcm, pbkdf2 } = require('./crypto')
const { AES_KEY_SIZE, AES_IV_SIZE } = require('./crypto/constants')

const VERSION = 1
const SHARD_ID = 'config'
const KEY_FORMAT = 'base64'
const DEFAULT_SHARDS = 2
const PBKDF2_ITERATIONS = 600000

class Config {
  static async create (adapter, options = {}) {
    let data = await buildInitialConfig(options)
    let json = JSON.stringify(data, true, 2)

    try {
      await adapter.write(SHARD_ID, json, null)
      return new Config(data, options)
    } catch (error) {
      if (error.code === 'ERR_CONFLICT') {
        throw new ExistingStore('store already exists; use Store.open() to access it')
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
      throw new MissingStore('store does not exist; use Store.create() to initialise it')
    }
  }

  constructor (data, options) {
    this._data = data

    let password = (options.key || {}).password || ''
    this._pwKey = this._deriveKey(password)
  }

  async _deriveKey (password) {
    let { salt, iterations } = this._data.password
    salt = Buffer.from(salt, KEY_FORMAT)
    return pbkdf2.digest(password, salt, iterations, AES_KEY_SIZE)
  }

  async buildCipher () {
    let { key, ...rest } = this._data.cipher
    let pwKey = await this._pwKey
    key = await decrypt(pwKey, key)
    return new Cipher({ key, ...rest })
  }

  async buildRouter () {
    let { key, ...rest } = this._data.shards
    let pwKey = await this._pwKey
    key = await decrypt(pwKey, key)
    return new Router({ key, ...rest })
  }
}

async function buildInitialConfig (options) {
  let pw = (options.key || {}).password
  if (!pw) throw new ConfigError('key.password must be a non-empty string')

  let salt = await pbkdf2.generateSalt()
  let iterations = options.key.iterations || PBKDF2_ITERATIONS
  let pwKey = await pbkdf2.digest(pw, salt, iterations, AES_KEY_SIZE)

  let cipherKey = await Cipher.generateKey()
  let routerKey = await Router.generateKey()

  let numShards = (options.shards || {}).n
  if (numShards === undefined) numShards = DEFAULT_SHARDS

  if (typeof numShards !== 'number' || numShards < 1) {
    throw new ConfigError('shards.n must be a positive integer')
  }

  return {
    version: VERSION,

    password: {
      salt: salt.toString(KEY_FORMAT),
      iterations
    },

    cipher: {
      key: await encrypt(pwKey, cipherKey)
    },

    shards: {
      key: await encrypt(pwKey, routerKey),
      n: numShards
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
    throw new AccessDenied('could not unlock the store; make sure the password is correct')
  }
}

class ConfigError extends Error {
  constructor (message) {
    super(message)
    this.code = 'ERR_CONFIG'
    this.name = 'ConfigError'
  }
}

class MissingStore extends Error {
  constructor (message) {
    super(message)
    this.code = 'ERR_MISSING'
    this.name = 'MissingStore'
  }
}

class ExistingStore extends Error {
  constructor (message) {
    super(message)
    this.code = 'ERR_EXISTS'
    this.name = 'ExistingStore'
  }
}

class AccessDenied extends Error {
  constructor (message) {
    super(message)
    this.code = 'ERR_ACCESS'
    this.name = 'AccessDenied'
  }
}

module.exports = Config
