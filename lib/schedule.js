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

    let depGroups = op.deps.map((depId) => {
      let dep = this._operations.get(depId)
      return this._groups.get(dep.group)
    })

    let groupAncestors = depGroups.flatMap((group) => {
      return [...group.ancestors].map((ancId) => this._groups.get(ancId))
    })

    let minIndex = this._findIndex(0, op.shard, depGroups, 0)
    minIndex = this._findIndex(minIndex, op.shard, groupAncestors, 1)

    if (minIndex < groups.length) {
      return this._groups.get(groups[minIndex])
    }
  }

  _findIndex (minIndex, shard, groups, offset) {
    for (let group of groups) {
      if (group.shard === shard) {
        minIndex = Math.max(minIndex, group.index + offset)
      }
    }
    return minIndex
  }

  _placeOpInGroup (op, group) {
    group.ops.add(op.id)
    op.group = group.id

    for (let depId of op.deps) {
      let dep = this._operations.get(depId)
      if (dep.group === group.id) continue

      let depGroup = this._groups.get(dep.group)
      group.parents.add(depGroup.id)
      this._buildAncestors(group, depGroup)
    }
  }

  _buildAncestors (target, dep) {
    target.ancestors.add(dep.id)

    for (let id of dep.ancestors) {
      target.ancestors.add(id)
    }
  }

  _createOp (shard, deps, value) {
    let id = OP_PREFIX + (this._operations.size + 1)
    let op = { id, shard, deps, value }
    this._operations.set(id, op)

    return op
  }

  _createGroup (shard) {
    if (!this._shards.has(shard)) {
      this._shards.set(shard, [])
    }
    let shardGroups = this._shards.get(shard)

    let group = {
      id: GROUP_PREFIX + (this._groups.size + 1),
      shard,
      index: shardGroups.length,
      ops: new Set(),
      parents: new Set(),
      ancestors: new Set()
    }

    this._groups.set(group.id, group)
    shardGroups.push(group.id)

    return group
  }
}

module.exports = Schedule
