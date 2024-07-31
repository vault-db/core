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

    return this._retryOnConflict(() => {
      let rm = this._executor.add(pathKey, [], (shard) => shard.rm(path.full()))
      let ops = [rm]

      for (let [dir, name] of path.links().reverse()) {
        let key = this._router(dir)
        let last = ops[ops.length - 1]

        let unlink = this._executor.add(key, [last.id], async (shard) => {
          if (await this._isEmpty(dir, name)) {
            shard.unlink(dir, name)
          }
        })
        ops.push(unlink)
      }

      return ops
    })
  }

  async _isEmpty (dir, name) {
    let path = new Path(dir + name)
    let items = path.isDir() ? await this.list(path.full()) : null

    return items === null
  }

  _parsePath (pathStr, type) {
    let path = Path.parse(pathStr)

    if (!path.isValid() || !path[type]()) {
      throw new PathError(`'${pathStr}' is not a valid path`)
    }
    return path
  }

  async _retryOnConflict (planner) {
    let ops = planner()

    queueMicrotask(() => this._executor.poll())

    try {
      await Promise.all(ops.map((op) => op.promise))
    } catch (error) {
      if (error.code === 'ERR_CONFLICT') {
        await jitter()
        return this._retryOnConflict(planner)
      } else {
        throw error
      }
    }
  }
}

const JITTER_FRAMES = 10

async function jitter () {
  let n = Math.floor(Math.random() * JITTER_FRAMES)
  while (n--) await null
}

module.exports = Task
