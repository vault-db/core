'use strict'

const NodeCrypto = require('../lib/crypto/node_crypto')
const WebCrypto = require('../lib/crypto/web_crypto')

const { assert } = require('chai')

function testCrypto (impl) {
  describe('SHA-256', () => {
    it('computes digests', async () => {
      let data = Buffer.from('some data', 'utf8')
      let hash = await impl.sha256.digest(data)

      assert.equal(
        hash.toString('base64'),
        'EweZDmulyhRes16ZGCqb7EZTG8VN32VqYCx4D6AkDe4=')
    })
  })

  describe('HMAC-SHA-256', () => {
    it('generates keys', async () => {
      let key = await impl.hmacSha256.generateKey()
      assert.instanceOf(key, Buffer)
      assert.equal(key.length, 64)
    })

    it('computes digests', async () => {
      let key = Buffer.from('wtznHJpRyQ1731UMy7JZD6JVO3w/siiGb8s9wyVZSGK+U/BVR1DqqOIccCmkfsPRtHhgbbcNSr5wi6eaNWBzFQ==', 'base64')
      let data = Buffer.from('hello world', 'utf8')
      let hash = await impl.hmacSha256.digest(key, data)

      assert.equal(
        hash.toString('base64'),
        'yyfAwelMFCQzZ/+q/2aymE5bGH7H29urJMY3ui5Y9ig=')
    })
  })

  describe('AES-256-GCM', () => {
    it('generates a key', async () => {
      let key = await impl.aes256gcm.generateKey()
      assert.instanceOf(key, Buffer)
      assert.equal(key.length, 32)
    })

    it('generates an IV', async () => {
      let iv = await impl.aes256gcm.generateIv()
      assert.instanceOf(iv, Buffer)
      assert.equal(iv.length, 16)
    })

    it('encrypts a message', async () => {
      let key = Buffer.from('jam1+7s+qyvQfaBZtIfS35/KSlt3QWlyr7OjsT6rp8E=', 'base64')
      let iv = Buffer.from('vzI0dsZR/rdkmYflzpOJwA==', 'base64')
      let msg = Buffer.from('the quick brown fox jumps over the lazy dog', 'utf8')

      let data = await impl.aes256gcm.encrypt(key, iv, msg)

      assert.equal(
        data.toString('base64'),
        'YJG5PBzwVW57j/w1N7lIDAN+w7TgsY5+GOzYuso6+Q0ptS8pwleLNDigJ4OEZ6A5tuseLNjX7FURi74=')
    })

    describe('decrypt()', () => {
      let key = Buffer.from('hSZO6x/ffuPhW1aNmeSUB5vBV/ocTDtlbGeODN26Ovw=', 'base64')
      let iv = Buffer.from('uvN7ZnNI6Ob3c/Of10K5tw==', 'base64')

      it('decrypts a message', async () => {
        let msg = Buffer.from('jqicVSHoa+ggSTOIv7KlCDVrsykiMX0+krljMx72HVAq11zh3RNG', 'base64')

        let data = await impl.aes256gcm.decrypt(key, iv, msg)
        assert.equal(data.toString('utf8'), 'very secret information')
      })

      it('fails to decrypt a modified ciphertext', async () => {
        let msg = Buffer.from('kqicVSHoa+ggSTOIv7KlCDVrsykiMX0+krljMx72HVAq11zh3RNG', 'base64')
        let error

        try {
          await impl.aes256gcm.decrypt(key, iv, msg)
        } catch (e) {
          error = e
        }

        assert(error)
      })

      it('fails to decrypt a modified auth tag', async () => {
        let msg = Buffer.from('jqicVSHoa+ggSTOIv7KlCDVrsykiMX0+krljMx72HVAq11zh3RNX', 'base64')
        let error

        try {
          await impl.aes256gcm.decrypt(key, iv, msg)
        } catch (e) {
          error = e
        }

        assert(error)
      })
    })
  })
}

describe('crypto (node)', () => {
  testCrypto(NodeCrypto)
})

describe('crypto (web)', () => {
  testCrypto(WebCrypto)
})
