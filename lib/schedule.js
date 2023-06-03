'use strict'

const PREFIX_OP    = 'w'
const PREFIX_GROUP = 'G'

const EQ = 1
const GT = 2

const DEFAULT_DEPTH_LIMIT = 2

class Schedule {
  constructor (options = {}) {
    this._depthLimit = options.depthLimit || DEFAULT_DEPTH_LIMIT

    this._operations = new Map()
    this._groups = new Map()
    this._shards = new Map()
  }

  add (shard, deps, value = null) {
    let op = this._createOp(shard, deps, value)

    let depGroups = op.deps.map((depId) => {
      let dep = this._operations.get(depId)
      return this._groups.get(dep.group)
    })

    let group = this._findGroup(op, depGroups) || this._createGroup(op.shard)
    this._placeOpInGroup(op, group, depGroups)

    return op.id
  }

  _findGroup (op, depGroups) {
    let groups = this._shards.get(op.shard)
    if (!groups) return null

    let [type, index] = this._getLowerBound(op, depGroups)
    if (type === GT) index += 1

    let group = this._groups.get(groups[index])
    if (!group) return null

    let depth = depGroups.reduce((d, g) => Math.max(d, g.depth + 1), 0)

    if (type === GT && depth <= group.depth - this._depthLimit) {
      group = this._createGroup(op.shard, index)
    }

    return group
  }

  _getLowerBound (op, depGroups) {
    let groupAncestors = depGroups.flatMap((group) => {
      return [...group.ancestors].map((ancId) => this._groups.get(ancId))
    })

    let bound = [GT, -1]
    bound = this._findIndex(bound, op.shard, depGroups, EQ)
    bound = this._findIndex(bound, op.shard, groupAncestors, GT)

    return bound
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

  _placeOpInGroup (op, group, depGroups) {
    group.ops.add(op.id)
    op.group = group.id

    for (let depGroup of depGroups) {
      if (depGroup.id === group.id) continue

      group.depth = Math.max(group.depth, depGroup.depth + 1)
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

  _createGroup (shard, index = null) {
    if (!this._shards.has(shard)) {
      this._shards.set(shard, [])
    }
    let shardGroups = this._shards.get(shard)
    if (index === null) index = shardGroups.length

    for (let i = index; i < shardGroups.length; i++) {
      let group = this._groups.get(shardGroups[i])
      group.index += 1
    }

    let group = {
      id: PREFIX_GROUP + (this._groups.size + 1),
      shard,
      index,
      ops: new Set(),
      depth: 0,
      parents: new Set(),
      ancestors: new Set()
    }

    this._groups.set(group.id, group)
    shardGroups.splice(index, 0, group.id)

    return group
  }
}

module.exports = Schedule
