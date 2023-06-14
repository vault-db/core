'use strict'

const Cache = require('./cache')
const Executor = require('./executor')
const { Path, PathError } = require('./path')

class Task {
  constructor (adapter, router) {
    this._cache = new Cache(adapter)
    this._executor = new Executor(this._cache)
    this._router = router
  }

  async list (pathStr) {
    let path = this._parsePath(pathStr, 'isDir')

    let key = this._router(path.full())
    let shard = await this._cache.read(key)
    return shard.list(path.full())
  }

  async get (pathStr) {
    let path = this._parsePath(pathStr, 'isDoc')

    let key = this._router(path.full())
    let shard = await this._cache.read(key)
    return shard.get(path.full())
  }

  async update (pathStr, fn) {
    let path = this._parsePath(pathStr, 'isDoc')

    let links = path.links().map(([dir, name]) => {
      let key = this._router(dir)
      return this._executor.add(key, [], (shard) => shard.link(dir, name))
    })

    let linkIds = links.map((link) => link.id)
    let key = this._router(path.full())
    let put = this._executor.add(key, linkIds, (shard) => shard.put(path.full(), fn))

    let ops = [...links, put]
    return this._waitFor(ops, () => this.update(pathStr, fn))
  }

  _parsePath (pathStr, type) {
    let path = new Path(pathStr)

    if (!path.isValid() || !path[type]()) {
      throw new PathError(`'${pathStr}' is not a valid path`)
    }
    return path
  }

  async _waitFor (ops, onConflict) {
    queueMicrotask(() => this._executor.poll())

    try {
      await Promise.all(ops.map((op) => op.promise))
    } catch (error) {
      if (error.code === 'ERR_CONFLICT') {
        return onConflict()
      } else {
        throw error
      }
    }
  }
}

module.exports = Task
