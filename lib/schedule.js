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

    if (this._shards.has(op.shard)) {
      this._addToExistingGroup(op)
    } else {
      this._startNewGroup(op)
    }

    return op.id
  }

  _startNewGroup (op) {
    let group = this._createGroup(op.shard)
    this._shards.set(op.shard, [group.id])

    this._placeOpInGroup(op, group)
  }

  _addToExistingGroup (op) {
    let group = this._selectEarliestGroup(op)
    this._placeOpInGroup(op, group)
  }

  _selectEarliestGroup (op) {
    let groups = this._shards.get(op.shard).map((id) => this._groups.get(id))
    let indirectDeps = this._indirectDeps(op)

    let group = groups.find((g) => {
      return !indirectDeps.some((depId) => g.ops.has(depId))
    })

    if (!group) {
      group = this._createGroup(op.shard)
      groups.push(group)
    }

    return group
  }

  _placeOpInGroup (op, group) {
    group.ops.add(op.id)
    op.group = group.id

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
      return [...dep.deps]
    })
  }

  _createOp (shard, deps, value) {
    let id = OP_PREFIX + (this._operations.size + 1)
    let op = { id, shard, deps, value }
    this._operations.set(id, op)

    return op
  }

  _createGroup (shard) {
    let id = GROUP_PREFIX + (this._groups.size + 1)
    let group = { id, shard, ops: new Set(), deps: new Set() }
    this._groups.set(group.id, group)

    return group
  }
}

module.exports = Schedule
