'use strict'

const Config = require('./config')
const Task = require('./task')

class Store {
  static async open (adapter, options = {}) {
    let config = await Config.open(adapter, options)
    let cipher = await config.buildCipher()
    let router = await config.buildRouter()

    return new Store(adapter, router, cipher)
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

const TASK_METHODS = ['get', 'list', 'find', 'update', 'remove', 'prune']

for (let method of TASK_METHODS) {
  Store.prototype[method] = function (...args) {
    let task = this.task()
    return task[method](...args)
  }
}

module.exports = Store
