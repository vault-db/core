'use strict'

const Config = require('../lib/config')

const { assert } = require('chai')

function testConfigBehaviour (impl) {
  let adapter, config

  beforeEach(() => {
    adapter = impl.createAdapter()
  })

  afterEach(async () => {
    if (impl.cleanup) await impl.cleanup()
  })

  it('writes initial config to the storage', async () => {
    await Config.open(adapter)

    let { value } = await adapter.read('config')
    let config = JSON.parse(value)

    assert.equal(config.version, 1)

    assert.match(config.cipher.key, /^[a-z0-9/+]+=*$/i)

    assert.match(config.sharding.key, /^[a-z0-9/+]+=*$/i)
    assert.equal(config.sharding.level, 2)
  })

  it('lets the sharding level be set', async () => {
    await Config.open(adapter, { sharding: 3 })

    let { value } = await adapter.read('config')
    let config = JSON.parse(value)

    assert.equal(config.sharding.level, 3)
  })

  it('lets the sharding level be set to zero', async () => {
    await Config.open(adapter, { sharding: 0 })

    let { value } = await adapter.read('config')
    let config = JSON.parse(value)

    assert.equal(config.sharding.level, 0)
  })

  it('makes concurrently created clients agree on the config', async () => {
    let configs = []

    for (let i = 0; i < 10; i++) {
      configs.push(Config.open(adapter))
    }
    configs = await Promise.all(configs)

    let keys = new Set(configs.map((c) => c._data.cipher.key))
    assert.equal(keys.size, 1)
  })
}

describe('Config (Memory)', () => {
  const MemoryAdapter = require('../lib/adapters/memory')

  testConfigBehaviour({
    createAdapter () {
      return new MemoryAdapter()
    }
  })
})

describe('Config (File)', () => {
  const fs = require('fs').promises
  const path = require('path')
  const FileAdapter = require('../lib/adapters/file')

  const STORE_PATH = path.resolve(__dirname, '..', 'tmp', 'config-file')

  testConfigBehaviour({
    createAdapter () {
      return new FileAdapter(STORE_PATH)
    },

    async cleanup () {
      let fn = fs.rm ? 'rm' : 'rmdir'
      await fs[fn](STORE_PATH, { recursive: true }).catch(e => e)
    }
  })
})
