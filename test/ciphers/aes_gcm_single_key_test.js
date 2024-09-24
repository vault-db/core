'use strict'

const AesGcmSingleKeyCipher = require('../../lib/ciphers/aes_gcm_single_key')

const testCipherBehaviour = require('./behaviour')

describe('AesGcmSingleKeyCipher', () => {
  testCipherBehaviour({
    createCipher () {
      return AesGcmSingleKeyCipher.generate()
    }
  })
})
