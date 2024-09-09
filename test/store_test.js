'use strict'

const Store = require('../lib/store')

const { assert } = require('chai')

function testStoreBehaviour (impl) {
  let adapter, store, checker

  beforeEach(async () => {
    adapter = impl.createAdapter()
    store = await Store.open(adapter)
    checker = await Store.open(adapter)
  })

  afterEach(async () => {
    if (impl.cleanup) await impl.cleanup()
  })

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
}

describe('Store (Memory)', () => {
  const MemoryAdapter = require('../lib/adapters/memory')

  testStoreBehaviour({
    createAdapter () {
      return new MemoryAdapter()
    }
  })
})

describe('Store (File)', () => {
  const fs = require('fs').promises
  const path = require('path')
  const FileAdapter = require('../lib/adapters/file')

  const STORE_PATH = path.resolve(__dirname, '..', 'tmp', 'store-file')

  testStoreBehaviour({
    createAdapter () {
      return new FileAdapter(STORE_PATH)
    },

    async cleanup () {
      let fn = fs.rm ? 'rm' : 'rmdir'
      await fs[fn](STORE_PATH, { recursive: true }).catch(e => e)
    }
  })
})
