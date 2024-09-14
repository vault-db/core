'use strict'

const { OpenOptions, CreateOptions } = require('../lib/config')
const { assert } = require('chai')

describe('OpenOptions', () => {
  it('parses a valid set of options', () => {
    let options = OpenOptions.parse({ key: { password: 'hello' } })

    assert.deepEqual(options, {
      key: { password: 'hello' }
    })
  })

  it('fails if password is the wrong type', () => {
    assert.throws(() => OpenOptions.parse({ key: { password: 42 } }))
  })

  it('fails if password is missing', () => {
    assert.throws(() => OpenOptions.parse({ key: {} }))
  })

  it('fails if password parent section is missing', () => {
    assert.throws(() => OpenOptions.parse({}))
  })

  it('fails if unrecognised options are given', () => {
    assert.throws(() => OpenOptions.parse({ key: { password: 'a', nope: 1 } }))
  })
})

describe('CreateOptions', () => {
  it('sets default options', () => {
    let options = CreateOptions.parse({ key: { password: 'hi' } })

    assert.equal(options.key.password, 'hi')
    assert.equal(options.key.iterations, 600000)
    assert.equal(options.shards.n, 2)
  })

  it('sets optional parameters', () => {
    let options = CreateOptions.parse({
      key: { password: 'hi', iterations: 4200 },
      shards: { n: 5 }
    })

    assert.equal(options.key.iterations, 4200)
    assert.equal(options.shards.n, 5)
  })

  it('fails if key.iterations is negative', () => {
    assert.throws(() => CreateOptions.parse({ key: { password: 'a', iterations: -1 } }))
  })

  it('fails if shards.n is negative', () => {
    assert.throws(() => CreateOptions.parse({ key: { password: 'a' }, shards: { n: -1 } }))
  })
})
