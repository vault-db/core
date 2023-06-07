'use strict'

const PREFIX_OP    = 'w'
const PREFIX_GROUP = 'G'

const EQ = 1
const GT = 2
const NO = 3

const DEFAULT_DEPTH_LIMIT = 2

const AVAILABLE = 1
const STARTED   = 2
const COMPLETED = 3
const FAILED    = 4

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
      this._buildAncestors('_getOperations', op, dep)
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

    let { type, idx } = this._getLowerBound(op, groups, depGroups)

    let depth = depGroups
        .filter((depGroup) => depGroup.shard !== op.shard)
        .reduce((d, g) => Math.max(d, g.depth + 1), 0)

    while (idx + 1 < groups.length && depth - groups[idx].depth >= groups[idx + 1].depth - depth) {
      idx += 1
    }

    let limit = this._depthLimit
    let group = groups[idx]
    if (!group) return null

    if (type === GT && depth <= group.depth - limit) {
      group = this._createGroup(op.shard, idx)
    }

    if (depth >= group.depth + limit + 2) {
      return null
    }

    return group
  }

  _getLowerBound (op, groups, depGroups) {
    let groupAncestors = depGroups.flatMap((group) => [...group.ancestors])

    let depIds = new Set(depGroups.map((group) => group.id))
    let ancIds = new Set(groupAncestors)
    let idx = groups.length

    while (idx--) {
      let { id, state } = groups[idx]

      if (state !== AVAILABLE) return { type: NO, idx: idx + 1 }
      if (ancIds.has(id)) return { type: GT, idx: idx + 1 }
      if (depIds.has(id)) return { type: EQ, idx }
    }

    return { type: GT, idx: 0 }
  }

  _placeOpInGroup (op, group, depGroups) {
    group.ops.add(op.id)
    op.group = group.id

    for (let depGroup of depGroups) {
      if (depGroup.id === group.id) continue

      group.parents.add(depGroup.id)
      this._buildAncestors('_getGroups', group, depGroup)
    }

    this._updateDepth(group)
  }

  _buildAncestors (type, target, dep) {
    let ancestors = this[type]([dep.id, ...dep.ancestors])
    let descendants = this[type]([target.id, ...target.descendants])

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
    let op = {
      id: PREFIX_OP + (++ this._counters.operation),
      shard,
      deps,
      ancestors: new Set(),
      descendants: new Set(),
      value
    }

    this._operations.set(op.id, op)

    return op
  }

  _createGroup (shard, idx = null) {
    if (!this._shards.has(shard)) {
      this._shards.set(shard, [])
    }

    let group = {
      id: PREFIX_GROUP + (++ this._counters.group),
      shard,
      ops: new Set(),
      depth: 0,
      parents: new Set(),
      ancestors: new Set(),
      descendants: new Set(),
      state: AVAILABLE
    }

    this._groups.set(group.id, group)
    let shardGroups = this._shards.get(shard)

    if (idx === null) {
      shardGroups.push(group.id)
    } else {
      shardGroups.splice(idx, 0, group.id)
    }

    return group
  }

  _getOperations (ids) {
    return ids.map((id) => this._operations.get(id))
  }

  _getGroups (ids) {
    return ids.map((id) => this._groups.get(id))
  }

  _handleGroupCompleted (group) {
    this._removeGroup(group)
  }

  _handleGroupFailed (group) {
    let ops = this._getOperations([...group.ops])
    let descendants = ops.flatMap((op) => [...op.descendants])

    for (let id of new Set(descendants)) {
      let op = this._operations.get(id)
      this._removeOp(op)
    }

    this._removeGroup(group)
  }

  _removeOp (op) {
    if (!this._operations.delete(op.id)) return

    let group = this._groups.get(op.group)
    group.ops.delete(op.id)
  }

  _removeGroup (group) {
    if (!this._groups.delete(group.id)) return

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

class GroupHandle {
  constructor (schedule, group) {
    this._schedule = schedule
    this._group = group
  }

  * values () {
    for (let id of this._group.ops) {
      yield this._schedule._operations.get(id).value
    }
  }

  started () {
    this._changeState(AVAILABLE, STARTED)
  }

  completed () {
    this._changeState(STARTED, COMPLETED)
    this._schedule._handleGroupCompleted(this._group)
  }

  failed () {
    this._changeState(STARTED, FAILED)
    this._schedule._handleGroupFailed(this._group)
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
