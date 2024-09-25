'use strict'

const AesGcmKeySequenceCipher = require('../../lib/ciphers/aes_gcm_key_sequence')
const crypto = require('../../lib/crypto')

const testCipherBehaviour = require('./behaviour')
const { assert } = require('chai')

const LIMIT = 10

describe('AesGcmKeySequenceCipher', () => {
  testCipherBehaviour({
    createCipher () {
      return new AesGcmKeySequenceCipher()
    }
  })

  describe('key rotation', () => {
    let cipher

    beforeEach(() => {
      cipher = new AesGcmKeySequenceCipher({ limit: LIMIT })
    })

    it('encrypts up to the limit with a single key', async () => {
      for (let i = 0; i < LIMIT; i++) {
        await cipher.encrypt(Buffer.from('a message', 'utf8'))
      }
      assert.equal(cipher.size(), 1)
    })

    it('rejects ciphertexts with bad sequence numbers', async () => {
      let enc = await cipher.encrypt(Buffer.from('hi', 'utf8'))
      enc.writeUInt32BE(42)
      let error = await cipher.decrypt(enc).catch(e => e)
      assert.equal(error.code, 'ERR_MISSING_KEY')
    })

    it('creates a new key each time the limit is reached', async () => {
      let message = Buffer.from('a message', 'utf8')

      for (let i = 0; i < 3 * LIMIT + 1; i++) {
        await cipher.encrypt(message)
      }
      assert.equal(cipher.size(), 4)
    })

    it('creates new keys correctly during concurrent encryptions', async () => {
      let message = Buffer.from('a message', 'utf8')
      let ops = []

      for (let i = 0; i < 3 * LIMIT + 1; i++) {
        ops.push(cipher.encrypt(message))
      }

      await Promise.all(ops)
      assert.equal(cipher.size(), 4)
    })

    it('decrypts ciphertexts made with any previous key', async () => {
      let messages = []

      for (let i = 0; i < 3 * LIMIT + 1; i++) {
        messages.push(crypto.randomBytes(16))
      }

      let encs = await Promise.all(messages.map((msg) => cipher.encrypt(msg)))
      let decs = await Promise.all(encs.map((enc) => cipher.decrypt(enc)))

      assert(messages.length > 0)
      assert.equal(messages.length, decs.length)

      for (let i = 0; i < messages.length; i++) {
        assert.equal(messages[i].toString('base64'), decs[i].toString('base64'))
      }
    })
  })
})
