'use strict'

const Config = require('../lib/config')

const { assert } = require('chai')
const { testWithAdapters } = require('./adapters/utils')

testWithAdapters('Config', (impl) => {
  let adapter, config
  let password = 'hello'
  let createKey = { password, iterations: 10 }

  beforeEach(() => {
    adapter = impl.createAdapter()
  })

  afterEach(impl.cleanup)

  it('writes initial config to the storage', async () => {
    await Config.create(adapter, { key: createKey })

    let { value } = await adapter.read('config')
    let config = JSON.parse(value)

    assert.equal(config.version, 1)

    assert.match(config.password.salt, /^[a-z0-9/+]+=*$/i)
    assert.typeOf(config.password.iterations, 'number')

    assert.match(config.cipher.key, /^[a-z0-9/+]+=*$/i)

    assert.match(config.sharding.key, /^[a-z0-9/+]+=*$/i)
    assert.equal(config.sharding.level, 2)
  })

  it('sets the key iterations', async () => {
    await Config.create(adapter, { key: { password, iterations: 50 } })

    let { value } = await adapter.read('config')
    let config = JSON.parse(value)

    assert.equal(config.password.iterations, 50)
  })

  it('sets the sharding level', async () => {
    await Config.create(adapter, { key: createKey, sharding: { level: 3 } })

    let { value } = await adapter.read('config')
    let config = JSON.parse(value)

    assert.equal(config.sharding.level, 3)
  })

  it('sets the sharding level to zero', async () => {
    await Config.create(adapter, { key: createKey, sharding: { level: 0 } })

    let { value } = await adapter.read('config')
    let config = JSON.parse(value)

    assert.equal(config.sharding.level, 0)
  })

  async function open (...args) {
    try {
      return await Config.open(...args)
    } catch (error) {
      if (error.code !== 'ERR_MISSING') throw error

      try {
        return await Config.create(...args)
      } catch (error) {
        if (error.code === 'ERR_EXIST') {
          return open(...args)
        } else {
          throw error
        }
      }
    }
  }

  it('makes concurrently created clients agree on the config', async () => {
    let configs = []

    for (let i = 0; i < 10; i++) {
      configs.push(open(adapter, { key: createKey }))
    }
    configs = await Promise.all(configs)

    let keys = new Set(configs.map((c) => c._data.cipher.key))
    assert.equal(keys.size, 1)
  })
})
