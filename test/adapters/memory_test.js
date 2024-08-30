'use strict'

const MemoryAdapter = require('../../lib/adapters/memory')
const testAdapterBehaviour = require('./behaviour')

describe('MemoryAdapter', () => {
  testAdapterBehaviour({
    createAdapter () {
      return new MemoryAdapter()
    }
  })
})
