'use strict'

const Store = require('../lib/store')

const { assert } = require('chai')
const { testWithAdapters } = require('./adapters/utils')

testWithAdapters('Store', (impl) => {
  let adapter, store, checker
  let password = 'the password'

  beforeEach(async () => {
    adapter = impl.createAdapter()
    store = await Store.open(adapter, { password })
    checker = await Store.open(adapter, { password })
  })

  afterEach(impl.cleanup)

  it('updates several items', async () => {
    await Promise.all([
      store.update('/a', () => ({ a: 1 })),
      store.update('/path/b', () => ({ b: 2 })),
      store.update('/path/to/c', () => ({ c: 3 }))
    ])

    let docs = []

    for await (let doc of checker.find('/')) {
      docs.push(doc)
    }
    assert.deepEqual(docs, ['/a', '/path/b', '/path/to/c'])
  })

  it('updates the same doc multiple times', async () => {
    await Promise.all([
      store.update('/doc', (doc) => ({ ...doc, a: 1 })),
      store.update('/doc', (doc) => ({ ...doc, b: 2 })),
      store.update('/doc', (doc) => ({ ...doc, c: 3 }))
    ])

    let doc = await checker.get('/doc')
    assert.deepEqual(doc, { a: 1, b: 2, c: 3 })
  })

  it('fails to open with the incorrect password', async () => {
    let error = await Store.open(adapter, { password: 'wrong' }).catch(e => e)
    assert.equal(error.code, 'ERR_ACCESS')
  })

  it('fails to open with no password', async () => {
    let error = await Store.open(adapter).catch(e => e)
    assert.equal(error.code, 'ERR_ACCESS')
  })
})
