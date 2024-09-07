'use strict'

const HEADER = { version: 1 }

class Shard {
  static parse (string) {
    if (!string) {
      let index = new Item().set([])
      return new Shard(index, [])
    }

    let [header, index, ...items] = string.split('\n')
    index = new Item(index)
    items = items.map((item) => new Item(item))

    return new Shard(index, items)
  }

  constructor (index, items) {
    this._index = index
    this._items = items
  }

  async serialize () {
    let items = [this._index, ...this._items]
    items = await Promise.all(items.map((item) => item.serialize()))

    let header = JSON.stringify(HEADER)
    return [header, ...items].join('\n')
  }

  async size () {
    let index = await this._index.get()
    return index.length
  }

  async list (path, options = {}) {
    return this._read(path, options)
  }

  async link (path, name) {
    let [_, item] = await this._getOr(path, [])

    await item.update((dir) => {
      let idx = binarySearch(dir, name)

      if (idx < 0) {
        idx = Math.abs(idx) - 1
        dir.splice(idx, 0, name)
      }
      return dir
    })
  }

  async unlink (path, name) {
    let idx = await this._indexOf(path)
    if (idx < 0) return

    await this._items[idx].update(async (dir) => {
      let ofs = binarySearch(dir, name)

      if (ofs >= 0) {
        dir.splice(ofs, 1)
      }
      if (dir.length === 0) {
        await this._removeAt(idx)
      }
      return dir
    })
  }

  async get (path) {
    return this._read(path)
  }

  async put (path, fn) {
    let [idx, item] = await this._getOr(path, null)
    await item.update(fn)
  }

  async rm (path) {
    let idx = await this._indexOf(path)
    if (idx >= 0) await this._removeAt(idx)
  }

  async _read (path, options = {}) {
    let idx = await this._indexOf(path)
    if (idx < 0) return null

    let value = await this._items[idx].get()
    if (!options.shared) value = clone(value)
    return value
  }

  async _getOr (path, init) {
    let idx = await this._indexOf(path)

    if (idx < 0) {
      idx = Math.abs(idx) - 1

      await this._index.update((index) => {
        index.splice(idx, 0, path)
        return index
      })

      let item = new Item().set(init)
      this._items.splice(idx, 0, item)
    }

    return [idx, this._items[idx]]
  }

  async _removeAt (idx) {
    await this._index.update((index) => {
      index.splice(idx, 1)
      return index
    })

    this._items.splice(idx, 1)
  }

  async _indexOf (path) {
    return binarySearch(await this._index.get(), path)
  }
}

class Item {
  constructor (data) {
    this._encrypted = data || null
    this._decrypted = null
    this._modified = false
  }

  async serialize () {
    if (this._modified) {
      let json = JSON.stringify(this._decrypted)
      this._encrypted = json
      this._modified = false
    }

    return this._encrypted
  }

  get () {
    this._decrypted = this._decrypted || this._decrypt()
    return this._decrypted
  }

  async _decrypt () {
    if (this._encrypted === null) return null

    let json = JSON.parse(this._encrypted)
    return json
  }

  set (value) {
    this._decrypted = value
    this._modified = true
    return this
  }

  async update (fn) {
    let value = await this.get()
    this.set(await fn(value))
  }
}

function binarySearch (array, target) {
  let low = 0
  let high = array.length - 1

  while (low <= high) {
    let mid = Math.floor((low + high) / 2)
    let value = array[mid]

    if (value < target) {
      low = mid + 1
    } else if (value > target) {
      high = mid - 1
    } else {
      return mid
    }
  }

  return -1 - low
}

function clone (value) {
  if (value === null) return null

  if (Array.isArray(value)) {
    return value.map((item) => clone(item))
  }

  if (typeof value === 'object') {
    let copy = {}
    for (let key in value) {
      copy[key] = clone(value[key])
    }
    return copy
  }

  return value
}

module.exports = Shard
