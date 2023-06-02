'use strict'

const PREFIX_OP    = 'w'
const PREFIX_GROUP = 'G'

const EQ = 1
const GT = 2

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

    let [type, index] = this._getLowerBound(op)
    if (type === GT) index += 1

    if (index < groups.length) {
      return this._groups.get(groups[index])
    }
  }

  _getLowerBound (op) {
    let depGroups = op.deps.map((depId) => {
      let dep = this._operations.get(depId)
      return this._groups.get(dep.group)
    })

    let groupAncestors = depGroups.flatMap((group) => {
      return [...group.ancestors].map((ancId) => this._groups.get(ancId))
    })

    let bound = this._findIndex([EQ, 0], op.shard, depGroups, EQ)
    return this._findIndex(bound, op.shard, groupAncestors, GT)
  }

  _findIndex (bound, shard, groups, type) {
    for (let group of groups) {
      if (group.shard === shard) {
        bound = this._maxBound(bound, [type, group.index])
      }
    }
    return bound
  }

  _maxBound ([type1, idx1], [type2, idx2]) {
    if (type1 === type2) return [type1, Math.max(idx1, idx2)]

    let [eqIdx, gtIdx] = (type1 === EQ) ? [idx1, idx2] : [idx2, idx1]

    if (gtIdx < eqIdx) {
      return [EQ, eqIdx]
    } else {
      return [GT, gtIdx]
    }
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
    let id = PREFIX_OP + (this._operations.size + 1)
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
      id: PREFIX_GROUP + (this._groups.size + 1),
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
