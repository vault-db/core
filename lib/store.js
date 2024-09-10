'use strict'

const Config = require('./config')
const Task = require('./task')

class Store {
  static async create (adapter, options = {}) {
    let config = await Config.create(adapter, options)
    return newStore(adapter, config)
  }

  static async open (adapter, options = {}) {
    let config = await Config.open(adapter, options)
    return newStore(adapter, config)
  }

  constructor (adapter, router, cipher) {
    this._adapter = adapter
    this._router = router
    this._cipher = cipher
  }

  task () {
    return new Task(this._adapter, this._router, this._cipher)
  }
}

async function newStore (adapter, config) {
  let cipher = await config.buildCipher()
  let router = await config.buildRouter()

  return new Store(adapter, router, cipher)
}

const TASK_METHODS = ['get', 'list', 'find', 'update', 'remove', 'prune']

for (let method of TASK_METHODS) {
  Store.prototype[method] = function (...args) {
    let task = this.task()
    return task[method](...args)
  }
}

module.exports = Store
