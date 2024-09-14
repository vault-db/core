'use strict'

const Cipher = require('./cipher')
const Options = require('./options')
const Router = require('./router')

const { aes256gcm, pbkdf2 } = require('./crypto')
const { AES_KEY_SIZE, AES_IV_SIZE } = require('./crypto/constants')

const VERSION = 1
const SHARD_ID = 'config'
const KEY_FORMAT = 'base64'
const DEFAULT_SHARDS = 2
const PBKDF2_ITERATIONS = 600000

const OpenOptions = new Options({
  key: {
    password: {
      required: true,
      valid: (val) => typeof val === 'string' && val.length > 0,
      msg: 'must be a non-empty string'
    }
  }
})

function isPositiveInt (val) {
  return typeof val === 'number' && val > 0 && val === Math.round(val)
}

const CreateOptions = OpenOptions.extend({
  key: {
    iterations: {
      required: false,
      default: PBKDF2_ITERATIONS,
      valid: isPositiveInt,
      msg: 'must be a positive integer'
    },
  },
  shards: {
    n: {
      required: false,
      default: DEFAULT_SHARDS,
      valid: isPositiveInt,
      msg: 'must be a positive integer'
    }
  }
})

class Config {
  static async create (adapter, options = {}) {
    options = CreateOptions.parse(options)
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
    options = OpenOptions.parse(options)
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

    let password = options.key.password
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
  let pw = options.key.password
  let salt = await pbkdf2.generateSalt()
  let iterations = options.key.iterations
  let pwKey = await pbkdf2.digest(pw, salt, iterations, AES_KEY_SIZE)

  let cipherKey = await Cipher.generateKey()
  let routerKey = await Router.generateKey()

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
      n: options.shards.n
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

module.exports = {
  Config,
  OpenOptions,
  CreateOptions
}
