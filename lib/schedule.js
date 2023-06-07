'use strict'

const PREFIX_OP    = 'w'
const PREFIX_GROUP = 'G'

const EQ = 1
const GT = 2

const DEFAULT_DEPTH_LIMIT = 2

const AVAILABLE = 1
const STARTED   = 2
const COMPLETED = 3

class Schedule {
  constructor (options = {}) {
    this._depthLimit = options.depthLimit || DEFAULT_DEPTH_LIMIT

    this._operations = new Map()
    this._groups = new Map()
    this._shards = new Map()

    this._counters = { operation: 0, group: 0 }
  }

  add (shard, deps, value = null) {
    let op = this._createOp(shard, deps, value)

    let depGroups = op.deps.map((id) => {
      let dep = this._operations.get(id)
      return this._groups.get(dep.group)
    })

    let group = this._findGroup(op, depGroups) || this._createGroup(op.shard)
    this._placeOpInGroup(op, group, depGroups)

    return op.id
  }

  shards () {
    return this._shards.keys()
  }

  nextGroup () {
    for (let group of this._groups.values()) {
      if (group.state === AVAILABLE && group.ancestors.size === 0) {
        return new GroupHandle(this, group)
      }
    }
    return null
  }

  _findGroup (op, depGroups) {
    if (!this._shards.has(op.shard)) return null
    let groups = this._getGroups(this._shards.get(op.shard))

    let [type, idx] = new LowerBound(this, op, depGroups).get()
    if (type === GT) idx += 1

    let depth = depGroups
        .filter((depGroup) => depGroup.shard !== op.shard)
        .reduce((d, g) => Math.max(d, g.depth + 1), 0)

    let delayed = false
    let limit = this._depthLimit

    while (idx < groups.length && groups[idx].state !== AVAILABLE) {
      delayed = true
      idx += 1
    }

    while (idx + 1 < groups.length && depth - groups[idx].depth >= groups[idx + 1].depth - depth) {
      idx += 1
    }

    let group = groups[idx]
    if (!group) return null

    if (!delayed && type === GT && depth <= group.depth - limit) {
      group = this._createGroup(op.shard, idx)
    }

    if (depth >= group.depth + limit + 2) {
      return null
    }

    return group
  }

  _placeOpInGroup (op, group, depGroups) {
    group.ops.add(op.id)
    op.group = group.id

    for (let depGroup of depGroups) {
      if (depGroup.id === group.id) continue

      group.parents.add(depGroup.id)
      this._buildAncestors(group, depGroup)
    }

    this._updateDepth(group)
  }

  _buildAncestors (target, dep) {
    let ancestors = this._getGroups([dep.id, ...dep.ancestors])
    let descendants = this._getGroups([target.id, ...target.descendants])

    for (let anc of ancestors) {
      for (let desc of descendants) {
        anc.descendants.add(desc.id)
        desc.ancestors.add(anc.id)
      }
    }
  }

  _updateDepth (group) {
    let descendants = this._getGroups([group.id, ...group.descendants])
    this._sortTopological(descendants)

    for (let desc of descendants) {
      let parents = this._getGroups([...desc.parents])
      desc.depth = parents.reduce((d, g) => Math.max(d, g.depth + 1), 0)
    }
  }

  _sortTopological (groups) {
    groups.sort((a, b) => {
      if (b.ancestors.has(a.id)) {
        return -1
      } else if (a.ancestors.has(b.id)) {
        return 1
      } else {
        return 0
      }
    })
  }

  _createOp (shard, deps, value) {
    let id = PREFIX_OP + (++ this._counters.operation)
    let op = { id, shard, deps, value }
    this._operations.set(id, op)

    return op
  }

  _createGroup (shard, idx = null) {
    if (!this._shards.has(shard)) {
      this._shards.set(shard, [])
    }
    let shardGroups = this._shards.get(shard)
    if (idx === null) idx = shardGroups.length

    for (let i = idx; i < shardGroups.length; i++) {
      let group = this._groups.get(shardGroups[i])
      group.idx += 1
    }

    let group = {
      id: PREFIX_GROUP + (++ this._counters.group),
      shard,
      idx,
      ops: new Set(),
      depth: 0,
      parents: new Set(),
      ancestors: new Set(),
      descendants: new Set(),
      state: AVAILABLE
    }

    this._groups.set(group.id, group)
    shardGroups.splice(idx, 0, group.id)

    return group
  }

  _getGroups (ids) {
    return ids.map((id) => this._groups.get(id))
  }

  _handleGroupCompleted (group) {
    this._removeGroup(group)
  }

  _removeGroup (group) {
    this._groups.delete(group.id)

    for (let op of group.ops) {
      this._operations.delete(op)
    }

    for (let id of group.descendants) {
      let other = this._groups.get(id)

      other.parents.delete(group.id)
      other.ancestors.delete(group.id)
    }

    for (let groups of this._shards.values()) {
      let idx = groups.indexOf(group.id)
      if (idx >= 0) groups.splice(idx, 1)
    }
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
      return this._schedule._getGroups([...group.ancestors])
    })

    this._findIndex(this._depGroups, EQ)
    this._findIndex(groupAncestors, GT)

    return this._bound
  }

  _findIndex (groups, type) {
    for (let group of groups) {
      if (group.shard === this._op.shard) {
        this._bound = this._maxBound(this._bound, [type, group.idx])
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

class GroupHandle {
  constructor (schedule, group) {
    this._schedule = schedule
    this._group = group
  }

  values () {
    return [...this._group.ops].map((id) => {
      return this._schedule._operations.get(id).value
    })
  }

  started () {
    this._changeState(AVAILABLE, STARTED)
  }

  completed () {
    this._changeState(STARTED, COMPLETED)
    this._schedule._handleGroupCompleted(this._group)
  }

  _changeState (before, after) {
    if (this._group.state === before) {
      this._group.state = after
    } else {
      let msg = `group cannot be moved from state ${before} to state ${after}`
      throw new Error(msg)
    }
  }
}

module.exports = Schedule
