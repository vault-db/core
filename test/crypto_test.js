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
      assert(key instanceof Buffer)
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
}

describe('crypto (node)', () => {
  testCrypto(NodeCrypto)
})

describe('crypto (web)', () => {
  testCrypto(WebCrypto)
})
