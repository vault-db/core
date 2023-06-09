'use strict'

const MemoryAdapter = require('../lib/adapters/memory')
const Task = require('../lib/task')

const { assert } = require('chai')
const crypto = require('crypto')

describe('Task', () => {
  let store, task, checker

  function newTask () {
    return new Task(store, router)
  }

  function router (path) {
    let hash = crypto.createHash('sha256')
    hash.update(path)
    return 'shard-' + (hash.digest()[0] % 4)
  }

  beforeEach(() => {
    store = new MemoryAdapter()
    task = newTask()
    checker = newTask()
  })

  it('throws an error for getting an invalid path', async () => {
    let error = await task.get('x').catch(e => e)
    assert.equal(error.code, 'ERR_INVALID_PATH')
  })

  it('throws an error for getting a non-doc path', async () => {
    let error = await task.get('/x/').catch(e => e)
    assert.equal(error.code, 'ERR_INVALID_PATH')
  })

  it('throws an error for listing an invalid path', async () => {
    let error = await task.list('x').catch(e => e)
    assert.equal(error.code, 'ERR_INVALID_PATH')
  })

  it('throws an error for listing a non-dir path', async () => {
    let error = await task.list('/x').catch(e => e)
    assert.equal(error.code, 'ERR_INVALID_PATH')
  })

  it('returns null for a missing document', async () => {
    let doc = await task.get('/doc')
    assert.isNull(doc)
  })

  it('returns null for an empty directory', async () => {
    let dir = await task.list('/')
    assert.isNull(dir)
  })

  describe('update()', () => {
    it('exposes an error when writing a shard', async () => {
      store.write = () => Promise.reject(new Error('oh no'))

      let error = await task.update('/doc', () => ({ a: 1 })).catch(e => e)
      assert.equal(error.message, 'oh no')

      assert.isNull(await checker.list('/'))
      assert.isNull(await checker.get('/doc'))
    })

    it('creates a document', async () => {
      await task.update('/doc', () => ({ a: 1 }))

      assert.deepEqual(await checker.list('/'), ['doc'])
      assert.deepEqual(await checker.get('/doc'), { a: 1 })
    })

    it('creates a document in a nested directory', async () => {
      await task.update('/path/to/doc', () => ({ a: 1 }))

      assert.deepEqual(await checker.list('/'), ['path/'])
      assert.deepEqual(await checker.list('/path/'), ['to/'])
      assert.deepEqual(await checker.list('/path/to/'), ['doc'])
      assert.deepEqual(await checker.get('/path/to/doc'), { a: 1 })
    })

    it('creates two documents with common ancestors', async () => {
      await Promise.all([
        task.update('/path/to/doc', () => ({ a: 1 })),
        task.update('/path/of/val', () => ({ b: 2 }))
      ])

      assert.deepEqual(await checker.list('/'), ['path/'])
      assert.deepEqual(await checker.list('/path/'), ['of/', 'to/'])
      assert.deepEqual(await checker.list('/path/to/'), ['doc'])

      assert.deepEqual(await checker.get('/path/to/doc'), { a: 1 })
      assert.deepEqual(await checker.get('/path/of/val'), { b: 2 })
    })

    it('updates a document', async () => {
      await task.update('/doc', () => ({ a: 1 }))
      await task.update('/doc', (doc) => ({ ...doc, b: 2 }))

      let doc = await checker.get('/doc')
      assert.deepEqual(doc, { a: 1, b: 2 })
    })

    it('applies concurrent updates from different tasks', async () => {
      await task.update('/doc', () => ({ a: 1 }))

      await Promise.all([
        newTask().update('/doc', (doc) => ({ ...doc, b: 2 })),
        newTask().update('/doc', (doc) => ({ ...doc, c: 3 }))
      ])

      let doc = await checker.get('/doc')
      assert.deepEqual(doc, { a: 1, b: 2, c: 3 })
    })
  })

  describe('remove()', () => {
    beforeEach(async () => {
      let writer = newTask()

      await Promise.all([
        writer.update('/path/to/x', () => ({ a: 1 })),
        writer.update('/path/to/y', () => ({ b: 2 })),
        writer.update('/path/nested/to/z', () => ({ c: 3 }))
      ])
    })

    it('removes a document', async () => {
      await task.remove('/path/to/x')

      let doc = await checker.get('/path/to/x')
      assert.isNull(doc)
    })

    it('removes a document from its parent directory', async () => {
      await task.remove('/path/to/x')

      let dir = await checker.list('/path/to/')
      assert.deepEqual(dir, ['y'])
    })

    it('leaves non-empty parent directories in place', async () => {
      await task.remove('/path/to/x')

      let dir = await checker.list('/path/')
      assert.deepEqual(dir, ['nested/', 'to/'])
    })

    it('removes empty parent directories', async () => {
      await task.remove('/path/nested/to/z')

      assert.isNull(await checker.list('/path/nested/to/'))
      assert.isNull(await checker.list('/path/nested/'))
      assert.deepEqual(await checker.list('/path/'), ['to/'])
      assert.deepEqual(await checker.list('/'), ['path/'])
    })

    it('removes a parent directory if two clients independently remove its items', async () => {
      await Promise.all([
        newTask().remove('/path/to/x'),
        newTask().remove('/path/to/y')
      ])

      assert.isNull(await checker.list('/path/to/'))
      assert.deepEqual(await checker.list('/path/'), ['nested/'])
      assert.deepEqual(await checker.list('/'), ['path/'])
    })

    it('lets several tasks fully empty the storage', async () => {
      await Promise.all([
        newTask().remove('/path/to/x'),
        newTask().remove('/path/to/y'),
        newTask().remove('/path/nested/to/z')
      ])

      for (let dir of ['/', '/path/', '/path/nested/', '/path/to/']) {
        assert.isNull(await checker.list(dir))
      }
    })
  })
})
