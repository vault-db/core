'use strict'

const Router = require('../lib/router')
const { assert } = require('chai')

describe('Router', () => {
  it('returns shard IDs at level 0', async () => {
    let router = new Router({
      level: 0,
      key: 'pbSO59kb7ia4d6VxDXnRveysqDhPronSwiSxvm79zLE='
    })

    for (let n of 'abcdefghijklmnopqrstuvwxyz'.split('')) {
      assert.equal(await router.getShardId('/' + n), 'shard-0')
    }
  })

  it('returns shard IDs at level 1', async () => {
    let router = new Router({
      level: 1,
      key: 'K7L7kakbCauJr8UJUBoLqJORJ5NAaZWVLcF+JbkWZuU='
    })

    assert.equal(await router.getShardId('/v'), 'shard-0')
    assert.equal(await router.getShardId('/e'), 'shard-0')
    assert.equal(await router.getShardId('/a'), 'shard-1')
    assert.equal(await router.getShardId('/i'), 'shard-1')
  })

  it('returns shard IDs at level 2', async () => {
    let router = new Router({
      level: 2,
      key: '6MayVsj5QANQ5m/Xi+6usDr9BDVWR1AMIAg+Hn5Hva8='
    })

    assert.equal(await router.getShardId('/v'), 'shard-0')
    assert.equal(await router.getShardId('/e'), 'shard-1')
    assert.equal(await router.getShardId('/a'), 'shard-2')
    assert.equal(await router.getShardId('/i'), 'shard-3')
  })

  it('returns shard IDs at level 3', async () => {
    let router = new Router({
      level: 3,
      key: 'FayHI3QaQHMZY2P4E/6+Ebqch8mOBWyk4Og1AcsAPGA='
    })

    assert.equal(await router.getShardId('/i'), 'shard-0')
    assert.equal(await router.getShardId('/v'), 'shard-1')
    assert.equal(await router.getShardId('/e'), 'shard-2')
    assert.equal(await router.getShardId('/l'), 'shard-3')
    assert.equal(await router.getShardId('/a'), 'shard-4')
    assert.equal(await router.getShardId('/c'), 'shard-5')
    assert.equal(await router.getShardId('/g'), 'shard-6')
    assert.equal(await router.getShardId('/f'), 'shard-7')
  })

  it('returns shard IDs at level 5', async () => {
    let router = new Router({
      level: 5,
      key: 'HbWo4+NpSzT9TQQ+4ntBf2EenisKzlCwpw/3ou3eTyM='
    })

    assert.equal(await router.getShardId('/a'), 'shard-1a')
    assert.equal(await router.getShardId('/c'), 'shard-1e')
    assert.equal(await router.getShardId('/e'), 'shard-14')
    assert.equal(await router.getShardId('/f'), 'shard-02')
    assert.equal(await router.getShardId('/g'), 'shard-00')
    assert.equal(await router.getShardId('/i'), 'shard-0a')
    assert.equal(await router.getShardId('/l'), 'shard-01')
    assert.equal(await router.getShardId('/v'), 'shard-16')
  })
})
