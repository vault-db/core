'use strict'

const Counters = require('../lib/counters')
const Verifier = require('../lib/verifier')

const { assert } = require('chai')

describe('Counters', () => {
  let verifier, counters

  beforeEach(async () => {
    verifier = new Verifier({ key: await Verifier.generateKey() })
    counters = new Counters(verifier)
  })

  it('returns zero for an unknown ID', () => {
    let ctr = counters.get('x')
    assert.equal(ctr, 0)
  })

  it('refuses to increment an unknown ID', () => {
    assert.throws(() => counters.incr('x'))
  })

  it('increments an initialised ID', () => {
    counters.init('x')
    counters.incr('x')
    assert.equal(counters.get('x'), 1)
  })

  it('refuses to re-initialise an existing ID', () => {
    counters.init('x')
    assert.throws(() => counters.init('x'))
  })

  it('allows an ID to be initialised with a non-zero number', () => {
    counters.init('x', 2)
    for (let i = 0; i < 3; i++) counters.incr('x')
    assert.equal(counters.get('x'), 5)
  })

  describe('with some non-zero counters stored', () => {
    beforeEach(() => {
      counters.init('x')
      for (let i = 0; i < 3; i++) counters.incr('x')

      counters.init('y')
      for (let i = 0; i < 5; i++) counters.incr('y')
    })

    it('stores the number of times incr() is called for each ID', () => {
      assert.equal(counters.get('y'), 5)
      assert.equal(counters.get('x'), 3)
    })

    it('can be de/serialised', async () => {
      let state = await counters.serialize()
      let copy = await Counters.parse(state, ['x', 'y'], verifier)

      assert.equal(copy.get('y'), 5)
      assert.equal(copy.get('x'), 3)
    })
  })
})
