'use strict'

const Cache = require('../lib/cache')
const MemoryAdapter = require('../lib/adapters/memory')
const Shard = require('../lib/shard')

const { assert } = require('chai')

describe('Cache', () => {
  let adapter, cache

  beforeEach(() => {
    adapter = new MemoryAdapter()
    cache = new Cache(adapter)
  })

  async function readFromStore (id) {
    let { value } = await adapter.read(id)
    return Shard.parse(value)
  }

  describe('with no stored shards', () => {
    it('returns an new empty shard', async () => {
      let shard = await cache.read('x')
      assert.instanceOf(shard, Shard)
      assert.equal(shard.size(), 0)
    })

    it('writes a new shard to the adapter', async () => {
      let shard = await cache.read('x')
      await shard.link('/', 'doc.txt')
      await cache.write('x')

      let copy = await readFromStore('x')
      assert.deepEqual(await copy.list('/'), ['doc.txt'])
    })
  })

  describe('with a shard stored', () => {
    beforeEach(async () => {
      let shard = new Shard()

      await shard.link('/', 'path/')
      await shard.link('/path/', 'doc.txt')
      await shard.put('/path/doc.txt', () => ({ p: 1 }))

      await adapter.write('x', shard.toString())
    })

    it('returns an existing shard', async () => {
      let shard = await cache.read('x')

      assert.deepEqual(await shard.list('/'), ['path/'])
      assert.deepEqual(await shard.get('/path/doc.txt'), { p: 1 })
    })

    it('does not cache anything on a read error', async () => {
      let n = 0
      adapter.read = () => Promise.reject(new Error(`oh no: ${++ n}`))

      let error = await cache.read('x').catch(e => e)
      assert.equal(error.message, 'oh no: 1')

      error = await cache.read('x').catch(e => e)
      assert.equal(error.message, 'oh no: 2')
    })

    it('writes an updated shard to the adapter', async () => {
      let shard = await cache.read('x')
      await shard.put('/path/doc.txt', (doc) => ({ ...doc, q: 2 }))
      await cache.write('x')

      let copy = await readFromStore('x')
      assert.deepEqual(await copy.get('/path/doc.txt'), { p: 1, q: 2 })
    })

    it('returns the updated shard after writing', async () => {
      let shard = await cache.read('x')
      await shard.put('/path/doc.txt', (doc) => ({ ...doc, q: 2 }))
      await cache.write('x')

      shard = await cache.read('x')
      assert.deepEqual(await shard.get('/path/doc.txt'), { p: 1, q: 2 })
    })

    it('updates the same shard more than once', async () => {
      let shard = await cache.read('x')

      await shard.put('/path/doc.txt', (doc) => ({ ...doc, q: 2 }))
      await cache.write('x')

      await shard.put('/path/doc.txt', (doc) => ({ ...doc, r: 3 }))
      await cache.write('x')

      let copy = await readFromStore('x')
      assert.deepEqual(await copy.get('/path/doc.txt'), { p: 1, q: 2, r: 3 })
    })

    it('allows sequential updates from two clients', async () => {
      let other = new Cache(adapter)

      let copy = await other.read('x')
      await copy.put('/path/doc.txt', (doc) => ({ ...doc, q: 2 }))
      await other.write('x')

      let shard = await cache.read('x')
      await shard.put('/path/doc.txt', (doc) => ({ ...doc, r: 3 }))
      await cache.write('x')

      let check = await readFromStore('x')
      assert.deepEqual(await check.get('/path/doc.txt'), { p: 1, q: 2, r: 3 })
    })

    describe('when another client performs a concurrent update', () => {
      let other

      beforeEach(async () => {
        await cache.read('x')

        other = new Cache(adapter)
        let copy = await other.read('x')
        await copy.put('/path/doc.txt', (doc) => ({ ...doc, q: 2 }))
        await other.write('x')
      })

      it('returns its existing copy of the shard', async () => {
        let shard = await cache.read('x')
        assert.deepEqual(await shard.get('/path/doc.txt'), { p: 1 })
      })

      it('throws a conflict error', async () => {
        let error = await cache.write('x').catch(e => e)
        assert.equal(error.code, 'ERR_CONFLICT')
      })

      it('reloads the shard on detecting a conflict', async () => {
        await cache.write('x').catch(e => e)

        let shard = await cache.read('x')
        assert.deepEqual(await shard.get('/path/doc.txt'), { p: 1, q: 2 })
      })

      it('updates successfully after a conflict', async () => {
        await cache.write('x').catch(e => e)

        let shard = await cache.read('x')
        await shard.put('/path/doc.txt', (doc) => ({ ...doc, r: 3 }))
        await cache.write('x')

        let copy = await readFromStore('x')
        assert.deepEqual(await copy.get('/path/doc.txt'), { p: 1, q: 2, r: 3 })
      })

      it('does not reload a shard on a non-conflict error', async () => {
        adapter.write = () => Promise.reject(new Error('oh no'))

        let error = await cache.write('x').catch(e => e)
        assert.equal(error.message, 'oh no')

        let shard = await cache.read('x')
        assert.deepEqual(await shard.get('/path/doc.txt'), { p: 1 })
      })
    })
  })
})
