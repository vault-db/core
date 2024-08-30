'use strict'

const { assert } = require('chai')

function testAdapterBehaviour (config) {
  let adapter

  beforeEach(() => {
    adapter = config.createAdapter()
  })

  it('returns null for an unknown key', async () => {
    let result = await adapter.read('x')
    assert.isNull(result)
  })

  it('allows creation with no rev', async () => {
    await adapter.write('x', 'hello')

    let result = await adapter.read('x')
    assert.strictEqual(result.value, 'hello')
  })

  it('allows creation with null rev', async () => {
    await adapter.write('x', 'hello', null)

    let result = await adapter.read('x')
    assert.strictEqual(result.value, 'hello')
  })

  it('does not allow creation with a bad rev', async () => {
    let error = await adapter.write('x', 'hello', 64).catch(e => e)
    assert.strictEqual(error.code, 'ERR_CONFLICT')
  })

  it('allows updating using the rev from write()', async () => {
    let { rev } = await adapter.write('x', 'hello')
    await adapter.write('x', 'world', rev)

    let result = await adapter.read('x')
    assert.strictEqual(result.value, 'world')
    assert.notEqual(result.rev, rev)
  })

  it('allows updating using the rev from read()', async () => {
    await adapter.write('x', 'hello')

    let { rev } = await adapter.read('x')
    await adapter.write('x', 'world', rev)

    let result = await adapter.read('x')
    assert.strictEqual(result.value, 'world')
    assert.notEqual(result.rev, rev)
  })

  it('does not allow updating with no rev', async () => {
    await adapter.write('x', 'hello')

    let error = await adapter.write('x', 'world').catch(e => e)
    assert.strictEqual(error.code, 'ERR_CONFLICT')
  })

  it('does not allow updating with a bad rev', async () => {
    await adapter.write('x', 'hello')

    let error = await adapter.write('x', 'world', 64).catch(e => e)
    assert.strictEqual(error.code, 'ERR_CONFLICT')
  })
}

module.exports = testAdapterBehaviour
