'use strict'

const Cache = require('./cache')
const Executor = require('./executor')
const { Path, PathError } = require('./path')

class Task {
  constructor (adapter, router, cipher) {
    this._cache = new Cache(adapter, cipher)
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

  async _loadShard (path) {
    let key = await this._getShardId(path.full())
    return this._cache.read(key)
  }

  async update (pathStr, fn) {
    let path = this._parsePath(pathStr, 'isDoc')
    let pathKey = await this._getShardId(path.full())
    let dirKeys = await this._getDirKeys(path)

    return this._retryOnConflict(() => {
      let links = path.links().map(([dir, name]) => {
        let key = dirKeys.get(dir)
        return this._executor.add(key, [], (shard) => shard.link(dir, name))
      })

      let linkIds = links.map((link) => link.id)
      let put = this._executor.add(pathKey, linkIds, (shard) => shard.put(path.full(), fn))

      return [...links, put]
    })
  }

  async remove (pathStr) {
    let path = this._parsePath(pathStr, 'isDoc')
    let pathKey = await this._getShardId(path.full())
    let dirKeys = await this._getDirKeys(path)

    return this._retryOnConflict(async () => {
      let dirStates = await this._getDirStates(path, dirKeys)

      let rm = this._executor.add(pathKey, [], (shard) => shard.rm(path.full()))
      let ops = [rm]

      for (let [dir, name] of path.links().reverse()) {
        let item = Path.parse(dir).join(name)
        let key = dirKeys.get(dir)

        if (item.isDoc()) {
          let unlink = this._executor.add(key, [rm.id], (shard) => shard.unlink(dir, name))
          ops.push(unlink)
          this._storeUnlink(item, unlink)
          continue
        }

        let children = dirStates.get(item.full()) || []
        let unlinks = children.map((name) => this._unlinks.get(item.join(name).full()))

        if (unlinks.some((u) => !u)) break

        let lastOp = ops[ops.length - 1]
        let unlinkIds = [lastOp, ...unlinks].map((op) => op.id)

        let unlink = this._executor.add(key, unlinkIds, async (shard) => {
          let list = await this._listRouted(item.full(), dirKeys)
          if (list === null) await shard.unlink(dir, name)
        })

        ops.push(unlink)
        this._storeUnlink(item, unlink)
      }

      return ops
    })
  }

  async _getDirInfo (path, fn) {
    let infos = path.dirs().map(async (dir) => [dir, await fn(dir)])
    return new Map(await Promise.all(infos))
  }

  _getDirKeys (path) {
    return this._getDirInfo(path, (dir) => this._getShardId(dir))
  }

  _getDirStates (path, dirKeys) {
    return this._getDirInfo(path, (dir) => this._listRouted(dir, dirKeys))
  }

  async _listRouted (dir, dirKeys) {
    let key = dirKeys.get(dir)
    let shard = await this._cache.read(key)
    return shard.list(dir, { shared: true })
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

  async prune (pathStr) {
    let docs = []

    for await (let doc of this.find(pathStr)) {
      docs.push(doc)
    }

    let rms = docs.map((doc) => this.remove(doc))
    return Promise.all(rms)
  }

  _parsePath (pathStr, type) {
    let path = Path.parse(pathStr)

    if (!path.isValid() || !path[type]()) {
      throw new PathError(`'${pathStr}' is not a valid path`)
    }
    return path
  }

  _getShardId (pathStr) {
    return this._router.getShardId(pathStr)
  }

  async _retryOnConflict (planner) {
    let ops = await planner()

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

const MAX_JITTER = 100

async function jitter () {
  let n = Math.floor(Math.random() * MAX_JITTER)
  while (n--) await null
}

module.exports = Task
