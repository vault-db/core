'use strict'

const Cipher = require('../lib/cipher')

const { assert } = require('chai')

describe('Cipher', () => {
  let cipher

  describe('with no key', () => {
    beforeEach(async () => {
      cipher = new Cipher({ key: null })
    })

    it('returns the input unchanged', async () => {
      let enc = await cipher.encrypt('hello')
      assert.equal(enc, 'hello')
    })

    it('decrypts the unchanged input', async () => {
      let enc = await cipher.decrypt('hello')
      assert.equal(enc, 'hello')
    })
  })

  describe('with a key', () => {
    beforeEach(async () => {
      cipher = new Cipher({ key: await Cipher.generateKey() })
    })

    it('does not return the input', async () => {
      let enc = await cipher.encrypt('hello')
      assert.notEqual(enc, 'hello')
    })

    it('returns base64 output', async () => {
      let enc = await cipher.encrypt('hello')
      assert.match(enc, /^[a-z0-9/+]+=*$/i)
    })

    it('returns a different result each time', async () => {
      let a = await cipher.encrypt('the message')
      let b = await cipher.encrypt('the message')

      assert.notEqual(a, b)
    })

    it('decrypts the output', async () => {
      let enc = await cipher.encrypt('hello')
      let dec = await cipher.decrypt(enc)
      assert.equal(dec, 'hello')
    })
  })
})
