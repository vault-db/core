'use strict'

const HEADER = { version: 1 }

class Shard {
  static parse (string) {
    if (!string) return new Shard()

    let [header, index, ...items] = string.split('\n')
    index = JSON.parse(index)
    items = items.map((item) => JSON.parse(item))

    return new Shard(index, items)
  }

  constructor (index = [], items = []) {
    this._index = index
    this._items = items
  }

  toString () {
    let lines = [HEADER, this._index, ...this._items]
    return lines.map((line) => JSON.stringify(line)).join('\n')
  }

  size () {
    return this._index.length
  }

  async list (path) {
    return this._read(path)
  }

  async link (path, name) {
    let [_, dir] = this._getOr(path, [])

    let idx = binarySearch(dir, name)

    if (idx < 0) {
      idx = Math.abs(idx) - 1
      dir.splice(idx, 0, name)
    }
  }

  async unlink (path, name) {
    let idx = binarySearch(this._index, path)
    if (idx < 0) return

    let dir = this._items[idx]
    let ofs = binarySearch(dir, name)
    if (ofs < 0) return

    if (dir.length === 1) {
      this._removeAt(idx)
    } else {
      dir.splice(ofs, 1)
    }
  }

  async get (path) {
    return this._read(path)
  }

  async put (path, update) {
    let [idx, doc] = this._getOr(path, null)

    doc = await update(doc)
    this._items[idx] = doc
  }

  async rm (path) {
    let idx = binarySearch(this._index, path)
    if (idx >= 0) this._removeAt(idx)
  }

  _read (path) {
    let idx = binarySearch(this._index, path)
    return (idx < 0) ? null : clone(this._items[idx])
  }

  _getOr (path, init) {
    let idx = binarySearch(this._index, path)

    if (idx < 0) {
      idx = Math.abs(idx) - 1
      this._index.splice(idx, 0, path)
      this._items.splice(idx, 0, init)
    }
    return [idx, this._items[idx]]
  }

  _removeAt (idx) {
    this._index.splice(idx, 1)
    this._items.splice(idx, 1)
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
