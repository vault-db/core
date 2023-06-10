'use strict'

const Shard = require('../lib/shard')
const { assert } = require('chai')

describe('Shard', () => {
  let shard

  beforeEach(() => {
    shard = new Shard()
  })

  it('returns null for a non-existent directory', async () => {
    assert.isNull(await shard.list('/'))
  })

  it('adds an item to a directory', async () => {
    await shard.link('/', 'doc.txt')
    assert.deepEqual(await shard.list('/'), ['doc.txt'])
  })

  it('keeps directory items in order', async () => {
    for (let item of ['z', 'd', 'a', 'b', 'c']) {
      await shard.link('/', item)
    }
    let dir = await shard.list('/')
    assert.deepEqual(dir, ['a', 'b', 'c', 'd', 'z'])
  })

  it('returns a copy of the directory contents', async () => {
    await shard.link('/', 'doc.txt')

    let dir = await shard.list('/')
    dir.push('extra')

    assert.deepEqual(await shard.list('/'), ['doc.txt'])
  })

  it('removes an item from a directory', async () => {
    await shard.link('/', 'a')
    await shard.link('/', 'b')
    await shard.unlink('/', 'a')

    assert.deepEqual(await shard.list('/'), ['b'])
  })

  it('removes all the items from a directory', async () => {
    await shard.link('/', 'a')
    await shard.unlink('/', 'a')

    assert.isNull(await shard.list('/'))
  })

  it('returns null for a non-existent document', async () => {
    assert.isNull(await shard.get('/doc.txt'))
  })

  it('creates a new document', async () => {
    await shard.put('/doc.txt', () => ({ x: 1 }))
    assert.deepEqual(await shard.get('/doc.txt'), { x: 1 })
  })

  it('updates an existing document', async () => {
    await shard.put('/doc.txt', () => ({ x: 1 }))
    await shard.put('/doc.txt', (doc) => ({ ...doc, y: 2 }))

    let doc = await shard.get('/doc.txt')
    assert.deepEqual(doc, { x: 1, y: 2 })
  })

  it('returns a copy of the document', async () => {
    await shard.put('/doc.txt', () => ({ a: 1 }))

    let doc = await shard.get('/doc.txt')
    doc.extra = true

    assert.deepEqual(await shard.get('/doc.txt'), { a: 1 })
  })

  it('removes a document', async () => {
    await shard.put('/doc.txt', () => ({ x: 1 }))
    await shard.rm('/doc.txt')

    assert.isNull(await shard.get('/doc.txt'))
  })

  it('can be de/serialised', async () => {
    await shard.link('/', 'doc.txt')
    await shard.put('/doc.txt', () => ({ a: 1 }))

    let copy = Shard.parse(shard.toString())

    assert.deepEqual(await copy.list('/'), ['doc.txt'])
    assert.deepEqual(await copy.get('/doc.txt'), { a: 1 })
  })
})
