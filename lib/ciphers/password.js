'use strict'

const { pbkdf2 } = require('../crypto')
const AesGcmSingleKeyCipher = require('./aes_gcm_single_key')

const { AES_KEY_SIZE } = require('../crypto/constants')

class PasswordCipher extends AesGcmSingleKeyCipher {
  static async create ({ password, salt, iterations }) {
    let size = AES_KEY_SIZE
    let key = await pbkdf2.digest(password, salt, iterations, size)
    return new PasswordCipher({ key })
  }
}

module.exports = PasswordCipher
