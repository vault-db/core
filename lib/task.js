'use strict'

const Cache = require('./cache')
const Executor = require('./executor')
const { Path, PathError } = require('./path')

class Task {
  constructor (adapter, router) {
    this._cache = new Cache(adapter)
    this._executor = new Executor(this._cache)
    this._router = router
    this._unlinks = new Map()
  }

  async list (pathStr) {
    let path = this._parsePath(pathStr, 'isDir')
    let shard = await this._loadShard(path)
    return shard.list(path.full())
  }

  async get (pathStr) {
    let path = this._parsePath(pathStr, 'isDoc')
    let shard = await this._loadShard(path)
    return shard.get(path.full())
  }

  async * find (pathStr) {
    let path = this._parsePath(pathStr, 'isDir')

    let dir = await this.list(path)
    if (dir === null) return

    let items = dir.map((name) => path.join(name))
    let subdirs = items.filter((item) => item.isDir())

    await Promise.all(subdirs.map((dir) => this._loadShard(dir)))

    for (let item of items) {
      if (item.isDir()) {
        for await (let doc of this.find(item)) {
          yield doc
        }
      } else if (item.isDoc()) {
        yield item.full()
      }
    }
  }

  _loadShard (path) {
    let key = this._router(path.full())
    return this._cache.read(key)
  }

  update (pathStr, fn) {
    let path = this._parsePath(pathStr, 'isDoc')
    let pathKey = this._router(path.full())

    return this._retryOnConflict(() => {
      let links = path.links().map(([dir, name]) => {
        let key = this._router(dir)
        return this._executor.add(key, [], (shard) => shard.link(dir, name))
      })

      let linkIds = links.map((link) => link.id)
      let put = this._executor.add(pathKey, linkIds, (shard) => shard.put(path.full(), fn))

      return [...links, put]
    })
  }

  remove (pathStr) {
    let path = this._parsePath(pathStr, 'isDoc')
    let pathKey = this._router(path.full())

    return this._retryOnConflict(async () => {
      let dirStates = await this._getDirStates(path)

      let rm = this._executor.add(pathKey, [], (shard) => shard.rm(path.full()))
      let ops = [rm]

      for (let [dir, name] of path.links().reverse()) {
        let item = Path.parse(dir).join(name)
        let key = this._router(dir)

        if (item.isDoc()) {
          let unlink = this._executor.add(key, [rm.id], (shard) => shard.unlink(dir, name))
          ops.push(unlink)
          this._storeUnlink(item, unlink)
          continue
        }

        let children = dirStates.get(item.full()) || []
        let unlinks = children.map((name) => this._unlinks.get(item.join(name).full()))

        if (unlinks.some((u) => !u)) break

        let unlinkIds = unlinks.map((un) => un.id)

        let unlink = this._executor.add(key, unlinkIds, async (shard) => {
          let list = await this.list(item.full())
          if (list === null) shard.unlink(dir, name)
        })

        ops.push(unlink)
        this._storeUnlink(item, unlink)
      }

      return ops
    })
  }

  async _getDirStates (path) {
    let states = path.dirs().map(async (dir) => [dir, await this.list(dir)])
    return new Map(await Promise.all(states))
  }

  _storeUnlink (item, unlink) {
    this._unlinks.set(item.full(), unlink)

    unlink.promise.finally(() => {
      let stored = this._unlinks.get(item.full())

      if (stored.id === unlink.id) {
        this._unlinks.delete(item.full())
      }
    })
  }

  _parsePath (pathStr, type) {
    let path = Path.parse(pathStr)

    if (!path.isValid() || !path[type]()) {
      throw new PathError(`'${pathStr}' is not a valid path`)
    }
    return path
  }

  async _retryOnConflict (planner) {
    let ops = await planner()

    queueMicrotask(() => this._executor.poll())

    try {
      await Promise.all(ops.map((op) => op.promise))
    } catch (error) {
      if (error.code === 'ERR_CONFLICT') {
        return this._retryOnConflict(planner)
      } else {
        throw error
      }
    }
  }
}

module.exports = Task