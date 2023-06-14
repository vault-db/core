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

  async remove (pathStr) {
    let path = this._parsePath(pathStr, 'isDoc')
    let dirs = new Map()

    for (let dir of path.dirs()) {
      dirs.set(dir, await this.list(dir))
    }

    let key = this._router(path.full())
    let rm = this._executor.add(key, [], (shard) => shard.rm(path.full()))
    let ops = [rm]

    for (let [dir, name] of path.links().reverse()) {
      let key = this._router(dir)
      let last = ops[ops.length - 1]
      let unlink = this._executor.add(key, [last.id], (shard) => shard.unlink(dir, name))
      ops.push(unlink)

      let items = dirs.get(dir)

      if (items === null) continue
      if (items.length !== 1 || items[0] !== name) break
    }

    return this._waitFor(ops, () => this.remove(pathStr))
  }

  _parsePath (pathStr, type) {
    let path = Path.parse(pathStr)

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
