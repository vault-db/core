'use strict'

class ConflictError extends Error {
  constructor (message) {
    super(message)
    this.code = 'ERR_CONFLICT'
    this.name = 'ConflictError'
  }
}

module.exports = ConflictError
