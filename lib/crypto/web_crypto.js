'use strict'

// TODO: fix this import for the browser
const crypto = require('crypto').webcrypto
const { subtle } = crypto

const {
  HMAC_KEY_SIZE,
  AES_KEY_SIZE,
  AES_IV_SIZE,
  GCM_TAG_SIZE
} = require('./constants')

const HMAC_PARAMS = { name: 'HMAC', hash: 'SHA-256', length: HMAC_KEY_SIZE }
const HMAC_USAGES = ['sign']

const AES_GCM_PARAMS = { name: 'AES-GCM', length: AES_KEY_SIZE }
const AES_GCM_USAGES = ['encrypt', 'decrypt']

module.exports = {
  sha256: {
    async digest (data) {
      let hash = await subtle.digest({ name: 'SHA-256' }, data)
      return Buffer.from(hash)
    }
  },

  hmacSha256: {
    async generateKey () {
      let key = await subtle.generateKey(HMAC_PARAMS, true, HMAC_USAGES)
      key = await subtle.exportKey('raw', key)
      return Buffer.from(key)
    },

    async digest (key, data) {
      key = await subtle.importKey('raw', key, HMAC_PARAMS, false, HMAC_USAGES)
      let hash = await subtle.sign('HMAC', key, data)
      return Buffer.from(hash)
    }
  },

  aes256gcm: {
    async generateKey () {
      let key = await subtle.generateKey(AES_GCM_PARAMS, true, AES_GCM_USAGES)
      key = await subtle.exportKey('raw', key)
      return Buffer.from(key)
    },

    async generateIv () {
      let iv = Buffer.alloc(AES_IV_SIZE / 8)
      crypto.getRandomValues(iv)
      return iv
    },

    async encrypt (key, iv, data) {
      key = await this._importKey(key)
      let params = this._getParams(iv)
      let enc = await subtle.encrypt(params, key, data)
      return Buffer.from(enc)
    },

    async decrypt (key, iv, data) {
      key = await this._importKey(key)
      let params = this._getParams(iv)
      let msg = await subtle.decrypt(params, key, data)
      return Buffer.from(msg)
    },

    _importKey (key) {
      return subtle.importKey('raw', key, AES_GCM_PARAMS, false, AES_GCM_USAGES)
    },

    _getParams (iv) {
      return { ...AES_GCM_PARAMS, iv, tagLength: GCM_TAG_SIZE }
    }
  }
}