'use strict'

const Router = require('../lib/router')
const { assert } = require('chai')

describe('Router', () => {
  it('returns shard IDs at level 0', async () => {
    let key = Buffer.from('dPKDVtT72E2hZd5shFi+iRCBCjBdXaP26EcsX+9PpgGG+WK8rGtU6ZPAz1AtL1B8tm88Wyp3I5dVflUMg0IY7Q==', 'base64')
    let router = new Router({ key, level: 0 })

    for (let n of 'abcdefghijklmnopqrstuvwxyz'.split('')) {
      assert.equal(await router.getShardId('/' + n), 'shard-0000-ffff')
    }
  })

  it('returns shard IDs at level 1', async () => {
    let key = Buffer.from('frjOsNUsLE9VfIM7vtN5Yk/gdlYUpb8lZezpf9ES/NJTUYaeMuAysGGOvtzwVbv7ZdrSIbDDHYJi5+pDlDLsFA==', 'base64')
    let router = new Router({ key, level: 1 })

    assert.equal(await router.getShardId('/a'), 'shard-8000-ffff')
    assert.equal(await router.getShardId('/b'), 'shard-0000-7fff')
    assert.equal(await router.getShardId('/c'), 'shard-0000-7fff')
    assert.equal(await router.getShardId('/d'), 'shard-8000-ffff')
  })

  it('returns shard IDs at level 2', async () => {
    let key = Buffer.from('yNIdoAbi9oJtFuxsWw4lWxa82bQMrOs4VYtXTIc+tiNGE2W4gnaqsdbCLedoj2VA4oUtb24wgkFTow8Pol2Hig==', 'base64')
    let router = new Router({ key, level: 2 })

    assert.equal(await router.getShardId('/a'), 'shard-0000-3fff')
    assert.equal(await router.getShardId('/b'), 'shard-c000-ffff')
    assert.equal(await router.getShardId('/d'), 'shard-8000-bfff')
    assert.equal(await router.getShardId('/j'), 'shard-4000-7fff')
  })

  it('returns shard IDs at level 3', async () => {
    let key = Buffer.from('r6dXMLaJhaPcBK7u98fNHSr2SUrP9QItuwr+eZFXFJvVgRnS9xdBV4h2FkZHG1/cm6Eweg6BnppC7ueeeMweEg==', 'base64')
    let router = new Router({ key, level: 3 })

    assert.equal(await router.getShardId('/a'), 'shard-0000-1fff')
    assert.equal(await router.getShardId('/b'), 'shard-6000-7fff')
    assert.equal(await router.getShardId('/c'), 'shard-e000-ffff')
    assert.equal(await router.getShardId('/d'), 'shard-2000-3fff')
    assert.equal(await router.getShardId('/e'), 'shard-a000-bfff')
    assert.equal(await router.getShardId('/f'), 'shard-8000-9fff')
    assert.equal(await router.getShardId('/g'), 'shard-c000-dfff')
    assert.equal(await router.getShardId('/n'), 'shard-4000-5fff')
  })

  it('returns shard IDs at level 5', async () => {
    let key = Buffer.from('v91VlCeE3rit6LGjhfW+Cc0Lv6kK0lwkg4cxZXDmDQ/VSCrvzd8pyZ4DpuOT6NGqxTOGQ7gc20NteLMbjWxGGA==', 'base64')
    let router = new Router({ key, level: 5 })

    assert.equal(await router.getShardId('/a'), 'shard-6000-67ff')
    assert.equal(await router.getShardId('/b'), 'shard-6800-6fff')
    assert.equal(await router.getShardId('/c'), 'shard-f800-ffff')
    assert.equal(await router.getShardId('/d'), 'shard-1000-17ff')
    assert.equal(await router.getShardId('/e'), 'shard-1000-17ff')
    assert.equal(await router.getShardId('/f'), 'shard-6000-67ff')
    assert.equal(await router.getShardId('/g'), 'shard-b800-bfff')
    assert.equal(await router.getShardId('/h'), 'shard-3800-3fff')
  })
})
