'use strict'

const OP_PREFIX = 'w'
const GROUP_PREFIX = 'G'

class Schedule {
  constructor () {
    this._operations = new Map()
    this._groups = new Map()
    this._shards = new Map()
  }

  add (shard, deps, value = null) {
    let op = this._createOp(shard, deps, value)

    let group = this._findGroup(op) || this._createGroup(op.shard)
    this._placeOpInGroup(op, group)

    return op.id
  }

  _findGroup (op) {
    let groups = this._shards.get(op.shard)
    if (!groups) return null

    let indirectDeps = this._indirectDeps(op)
    let minIndex = 0

    for (let depId of op.deps) {
      let dep = this._operations.get(depId)
      minIndex = Math.max(minIndex, dep.index)
    }
    for (let depId of indirectDeps) {
      let dep = this._operations.get(depId)
      minIndex = Math.max(minIndex, dep.index + 1)
    }

    if (minIndex < groups.length) {
      return this._groups.get(groups[minIndex])
    }
  }

  _placeOpInGroup (op, group) {
    group.ops.add(op.id)
    Object.assign(op, { group: group.id, index: group.index })

    for (let depId of op.deps) {
      let dep = this._operations.get(depId)
      if (dep.group !== group.id) {
        group.deps.add(dep.group)
      }
    }
  }

  _indirectDeps (op) {
    return op.deps.flatMap((depId) => {
      let dep = this._operations.get(depId)

      return (dep.shard === op.shard)
          ? []
          : [...dep.ancestors]
    })
  }

  _createOp (shard, deps, value) {
    let id = OP_PREFIX + (this._operations.size + 1)
    let op = { id, shard, deps, value, ancestors: new Set() }
    this._operations.set(id, op)

    for (let depId of op.deps) {
      let dep = this._operations.get(depId)
      op.ancestors.add(dep.id)

      for (let ancId of dep.ancestors) {
        op.ancestors.add(ancId)
      }
    }

    return op
  }

  _createGroup (shard) {
    if (!this._shards.has(shard)) {
      this._shards.set(shard, [])
    }
    let shardGroups = this._shards.get(shard)
    let index = shardGroups.length

    let id = GROUP_PREFIX + (this._groups.size + 1)
    let group = { id, shard, index, ops: new Set(), deps: new Set() }
    this._groups.set(group.id, group)

    shardGroups.push(group.id)

    return group
  }
}

module.exports = Schedule
