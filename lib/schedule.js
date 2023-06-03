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

    let [type, index] = new LowerBound(this, op, depGroups).get()
    if (type === GT) index += 1

    let group = this._groups.get(groups[index])
    if (!group) return null

    let depth = depGroups.reduce((d, g) => Math.max(d, g.depth + 1), 0)

    if (type === GT && depth <= group.depth - this._depthLimit) {
      group = this._createGroup(op.shard, index)
    }

    return group
  }

  _placeOpInGroup (op, group, depGroups) {
    group.ops.add(op.id)
    op.group = group.id

    let oldDepth = group.depth

    for (let depGroup of depGroups) {
      if (depGroup.id === group.id) continue

      group.depth = Math.max(group.depth, depGroup.depth + 1)
      group.parents.add(depGroup.id)
      this._buildAncestors(group, depGroup)
    }

    for (let id of group.descendants) {
      let desc = this._groups.get(id)
      desc.depth += group.depth - oldDepth
    }
  }

  _buildAncestors (target, dep) {
    let ancestors = [dep.id, ...dep.ancestors].map((id) => {
      return this._groups.get(id)
    })

    let descendants = [target.id, ...target.descendants].map((id) => {
      return this._groups.get(id)
    })

    for (let anc of ancestors) {
      for (let desc of descendants) {
        anc.descendants.add(desc.id)
        desc.ancestors.add(anc.id)
      }
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
      ancestors: new Set(),
      descendants: new Set()
    }

    this._groups.set(group.id, group)
    shardGroups.splice(index, 0, group.id)

    return group
  }
}

class LowerBound {
  constructor (schedule, op, depGroups) {
    this._schedule = schedule
    this._op = op
    this._depGroups = depGroups
    this._bound = [GT, -1]
  }

  get () {
    let groupAncestors = this._depGroups.flatMap((group) => {
      return [...group.ancestors].map((ancId) => this._schedule._groups.get(ancId))
    })

    this._findIndex(this._depGroups, EQ)
    this._findIndex(groupAncestors, GT)

    return this._bound
  }

  _findIndex (groups, type) {
    for (let group of groups) {
      if (group.shard === this._op.shard) {
        this._bound = this._maxBound(this._bound, [type, group.index])
      }
    }
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
}

module.exports = Schedule
