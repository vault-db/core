'use strict'

const KeySequence = require('../lib/key_sequence')
const AesGcmSingleKeyCipher = require('../lib/ciphers/aes_gcm_single_key')

const { assert } = require('chai')

describe('KeySequence', () => {
  let root, sequence

  beforeEach(async () => {
    root = await AesGcmSingleKeyCipher.generate()
    sequence = new KeySequence(root)
  })

  it('stores a key and returns its seq', async () => {
    let alice = await AesGcmSingleKeyCipher.generate()
    let { seq: aliceSeq } = sequence.push({ algo: 1, key: alice.getKey() })
    assert.equal(aliceSeq, 1)

    let bob = await AesGcmSingleKeyCipher.generate()
    let { seq: bobSeq } = sequence.push({ algo: 1, key: bob.getKey() })
    assert.equal(bobSeq, 2)
  })

  it('throws an error if no latest key exists', async () => {
    let error = await sequence.getLatest().catch(e => e)
    assert.equal(error.code, 'ERR_MISSING_KEY')
  })

  describe('with some stored keys', () => {
    let alice, bob, messages

    beforeEach(async () => {
      alice = await AesGcmSingleKeyCipher.generate()
      sequence.push({ algo: 1, key: alice.getKey() })

      bob = await AesGcmSingleKeyCipher.generate()
      sequence.push({ algo: 99, key: bob.getKey() })

      messages = [
        await alice.encrypt(Buffer.from('alice says hello')),
        await bob.encrypt(Buffer.from('bob responds hi'))
      ]
    })

    it('retrieves the latest key', async () => {
      let { algo, key } = await sequence.getLatest()

      assert.equal(algo, 99)
      assert.instanceOf(key, Buffer)

      let cipher = new AesGcmSingleKeyCipher({ key })
      let decrypted = await cipher.decrypt(messages[1])
      assert.equal(decrypted.toString(), 'bob responds hi')
    })

    it('retrieves the first key by seq', async () => {
      let { algo, key } = await sequence.getBySeq(1)

      assert.equal(algo, 1)
      assert.instanceOf(key, Buffer)

      let cipher = new AesGcmSingleKeyCipher({ key })
      let decrypted = await cipher.decrypt(messages[0])
      assert.equal(decrypted.toString(), 'alice says hello')
    })

    it('retrieves the second key by seq', async () => {
      let { algo, key } = await sequence.getBySeq(2)

      assert.equal(algo, 99)
      assert.instanceOf(key, Buffer)

      let cipher = new AesGcmSingleKeyCipher({ key })
      let decrypted = await cipher.decrypt(messages[1])
      assert.equal(decrypted.toString(), 'bob responds hi')
    })

    it('throws an error if no key exists with the given seq', async () => {
      let error = await sequence.getBySeq(3).catch(e => e)
      assert.equal(error.code, 'ERR_MISSING_KEY')
    })

    it('can be serialized and restored', async () => {
      let serial = await sequence.serialize()
      let copy = await KeySequence.parse(serial, root)

      let { algo, key } = await copy.getBySeq(2)
      assert.equal(algo, 99)
      assert.instanceOf(key, Buffer)

      let cipher = new AesGcmSingleKeyCipher({ key })
      let decrypted = await cipher.decrypt(messages[1])
      assert.equal(decrypted.toString(), 'bob responds hi')
    })
  })
})
