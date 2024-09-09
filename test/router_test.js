'use strict'

const Router = require('../lib/router')
const { assert } = require('chai')

describe('Router', () => {
  it('returns shard IDs at level 0', async () => {
    let key = Buffer.from('dPKDVtT72E2hZd5shFi+iRCBCjBdXaP26EcsX+9PpgGG+WK8rGtU6ZPAz1AtL1B8tm88Wyp3I5dVflUMg0IY7Q==', 'base64')
    let router = new Router({ key, level: 0 })

    for (let n of 'abcdefghijklmnopqrstuvwxyz'.split('')) {
      assert.equal(await router.getShardId('/' + n), 'shard-0')
    }
  })

  it('returns shard IDs at level 1', async () => {
    let key = Buffer.from('frjOsNUsLE9VfIM7vtN5Yk/gdlYUpb8lZezpf9ES/NJTUYaeMuAysGGOvtzwVbv7ZdrSIbDDHYJi5+pDlDLsFA==', 'base64')
    let router = new Router({ key, level: 1 })

    assert.equal(await router.getShardId('/a'), 'shard-0')
    assert.equal(await router.getShardId('/b'), 'shard-0')
    assert.equal(await router.getShardId('/d'), 'shard-1')
    assert.equal(await router.getShardId('/g'), 'shard-1')
  })

  it('returns shard IDs at level 2', async () => {
    let key = Buffer.from('yNIdoAbi9oJtFuxsWw4lWxa82bQMrOs4VYtXTIc+tiNGE2W4gnaqsdbCLedoj2VA4oUtb24wgkFTow8Pol2Hig==', 'base64')
    let router = new Router({ key, level: 2 })

    assert.equal(await router.getShardId('/a'), 'shard-1')
    assert.equal(await router.getShardId('/b'), 'shard-3')
    assert.equal(await router.getShardId('/c'), 'shard-2')
    assert.equal(await router.getShardId('/g'), 'shard-0')
  })

  it('returns shard IDs at level 3', async () => {
    let key = Buffer.from('r6dXMLaJhaPcBK7u98fNHSr2SUrP9QItuwr+eZFXFJvVgRnS9xdBV4h2FkZHG1/cm6Eweg6BnppC7ueeeMweEg==', 'base64')
    let router = new Router({ key, level: 3 })

    assert.equal(await router.getShardId('/a'), 'shard-4')
    assert.equal(await router.getShardId('/b'), 'shard-7')
    assert.equal(await router.getShardId('/d'), 'shard-2')
    assert.equal(await router.getShardId('/e'), 'shard-6')
    assert.equal(await router.getShardId('/h'), 'shard-1')
    assert.equal(await router.getShardId('/i'), 'shard-5')
    assert.equal(await router.getShardId('/l'), 'shard-0')
    assert.equal(await router.getShardId('/p'), 'shard-3')
  })

  it('returns shard IDs at level 5', async () => {
    let key = Buffer.from('v91VlCeE3rit6LGjhfW+Cc0Lv6kK0lwkg4cxZXDmDQ/VSCrvzd8pyZ4DpuOT6NGqxTOGQ7gc20NteLMbjWxGGA==', 'base64')
    let router = new Router({ key, level: 5 })

    assert.equal(await router.getShardId('/a'), 'shard-1d')
    assert.equal(await router.getShardId('/b'), 'shard-11')
    assert.equal(await router.getShardId('/d'), 'shard-1d')
    assert.equal(await router.getShardId('/e'), 'shard-0e')
    assert.equal(await router.getShardId('/h'), 'shard-07')
    assert.equal(await router.getShardId('/i'), 'shard-04')
    assert.equal(await router.getShardId('/l'), 'shard-0f')
    assert.equal(await router.getShardId('/p'), 'shard-0a')
  })
})
