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

  add (shard, deps, value = null, id = null) {
    let op = this._createOp(shard, deps, value, id)

    let depGroups = deps.map((id) => {
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
    for (let groups of this._shards.values()) {
      let group = groups[0] && this._groups.get(groups[0])

      if (group && group.state === AVAILABLE && group.ancestors.size === 0) {
        return new GroupHandle(this, group.id)
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

  _createOp (shard, deps, value, id = null) {
    let op = {
      id: id || PREFIX_OP + (++ this._counters.operation),
      shard,
      parents: new Set(deps),
      ancestors: new Set(),
      descendants: new Set(),
      value
    }

    this._operations.set(op.id, op)

    return op
  }

  _createGroup (shard, idx = null, id = null) {
    if (!this._shards.has(shard)) {
      this._shards.set(shard, [])
    }

    let group = {
      id: id || PREFIX_GROUP + (++ this._counters.group),
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
    return ids.map((id) => this._groups.get(id)).filter((group) => !!group)
  }

  _handleGroupCompleted (id) {
    let group = this._groups.get(id)
    let ops = this._getOperations([...group.ops])

    for (let op of ops) {
      this._removeOp(op)
    }
    this._removeGroup(group)
  }

  _removeOp (op) {
    if (!this._operations.delete(op.id)) return

    this._removeAncestor('_getOperations', op)

    let group = this._groups.get(op.group)
    group.ops.delete(op.id)
  }

  _removeGroup (group) {
    if (!this._groups.delete(group.id)) return

    this._removeAncestor('_getGroups', group)

    this._updateDepth(group)

    let groups = this._shards.get(group.shard)
    let idx = groups.indexOf(group.id)
    if (idx >= 0) groups.splice(idx, 1)
  }

  _removeAncestor (type, target) {
    let descendants = this[type]([...target.descendants])

    for (let desc of descendants) {
      desc.parents.delete(target.id)
      desc.ancestors.delete(target.id)
    }
  }

  _handleGroupFailed (id) {
    let group = this._groups.get(id)
    let ops = this._getOperations([...group.ops])

    let descendants = ops.flatMap((op) => [...op.descendants])
    let cancelled = new Set([...group.ops, ...descendants])

    this._rebalance(cancelled)
  }

  _rebalance (cancelled) {
    let plan = new Schedule({ depthLimit: this._depthLimit })
    plan._counters = this._counters

    let started = [...this._groups.values()].filter((g) => g.state === STARTED)

    for (let group of started) {
      let newGroup = plan._createGroup(group.shard, null, group.id)
      newGroup.state = STARTED

      let ops = this._getOperations([...group.ops])

      for (let op of ops) {
        let newOp = plan._createOp(op.shard, [], op.value, op.id)
        plan._placeOpInGroup(newOp, newGroup, [])
      }
    }

    for (let op of this._operations.values()) {
      if (cancelled.has(op.id)) continue
      if (plan._operations.has(op.id)) continue

      plan.add(op.shard, [...op.parents], op.value, op.id)
    }

    this._operations = plan._operations
    this._groups = plan._groups
    this._shards = plan._shards
  }
}

class GroupHandle {
  constructor (schedule, group) {
    this._schedule = schedule
    this._group = group
  }

  getShard () {
    return this._getGroup().shard
  }

  * values () {
    for (let id of this._getGroup().ops) {
      yield this._schedule._operations.get(id).value
    }
  }

  started () {
    this._changeState(AVAILABLE, STARTED)
    return this
  }

  completed () {
    this._changeState(STARTED, COMPLETED)
    this._schedule._handleGroupCompleted(this._group)
    return this
  }

  failed () {
    this._changeState(STARTED, FAILED)
    this._schedule._handleGroupFailed(this._group)
    return this
  }

  _changeState (before, after) {
    let group = this._getGroup()

    if (group.state === before) {
      group.state = after
    } else {
      let msg = `group cannot be moved from state ${before} to state ${after}`
      throw new Error(msg)
    }
  }

  _getGroup () {
    let group = this._schedule._groups.get(this._group)

    if (group) {
      return group
    } else {
      throw new Error('stale group handle')
    }
  }
}

module.exports = Schedule
