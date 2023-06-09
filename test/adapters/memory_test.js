'use strict'

const MemoryAdapter = require('../../lib/adapters/memory')
const { assert } = require('chai')

describe('MemoryAdapter', () => {
  let adapter

  beforeEach(() => {
    adapter = new MemoryAdapter()
  })

  it('returns null for an unknown key', async () => {
    let result = await adapter.read('x')
    assert.isNull(result)
  })

  it('allows creation with no rev', async () => {
    await adapter.write('x', 'hello')

    let result = await adapter.read('x')
    assert.deepEqual(result, { value: 'hello', rev: 1 })
  })

  it('allows creation with null rev', async () => {
    await adapter.write('x', 'hello', null)

    let result = await adapter.read('x')
    assert.deepEqual(result, { value: 'hello', rev: 1 })
  })

  it('does not allow creation with a bad rev', async () => {
    let error = await adapter.write('x', 'hello', 1).catch(e => e)
    assert.equal(error.code, 'ERR_CONFLICT')
  })

  it('allows updating using the rev from write()', async () => {
    let { rev } = await adapter.write('x', 'hello')
    await adapter.write('x', 'world', rev)

    let result = await adapter.read('x')
    assert.deepEqual(result, { value: 'world', rev: 2 })
  })

  it('allows updating using the rev from read()', async () => {
    await adapter.write('x', 'hello')

    let { rev } = await adapter.read('x')
    await adapter.write('x', 'world', rev)

    let result = await adapter.read('x')
    assert.deepEqual(result, { value: 'world', rev: 2 })
  })

  it('does not allow updating with no rev', async () => {
    await adapter.write('x', 'hello')

    let error = await adapter.write('x', 'world').catch(e => e)
    assert.equal(error.code, 'ERR_CONFLICT')
  })

  it('does not allow updating with a bad rev', async () => {
    await adapter.write('x', 'hello')

    let error = await adapter.write('x', 'world', 2).catch(e => e)
    assert.equal(error.code, 'ERR_CONFLICT')
  })
})
