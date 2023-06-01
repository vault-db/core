'use strict'

const Schedule = require('../lib/schedule')
const { assert } = require('chai')

function assertGraph (schedule, spec) {
  let { _groups } = schedule

  let groupIds = Object.keys(spec)
  let mapping = new Map()

  assert.equal(_groups.size, groupIds.length,
    `schedule expected to contain ${groupIds.length} groups but contained ${_groups.size}`)

  for (let [id, [shard, ops, deps = []]] of Object.entries(spec)) {
    let group = findGroup(_groups, shard, ops)

    if (!group) {
      assert.fail(`no group found matching shard and operations for '${id}'`)
    }

    mapping.set(id, group.id)
    let mappedDeps = deps.map((dep) => mapping.get(dep))
    assert.sameMembers([...group.deps], mappedDeps)
  }
}

function findGroup (groups, shard, ops) {
  return [...groups.values()].find((group) => {
    if (group.shard !== shard || group.ops.size !== ops.length) {
      return false
    }
    if (ops.every((op) => group.ops.has(op))) {
      return true
    }
    return false
  })
}

describe('Schedule', () => {
  let schedule

  beforeEach(() => {
    schedule = new Schedule()
  })

  describe('basic planning', () => {

    //      |   +----+
    //    A |   | w1 |
    //      |   +----+
    //
    it('places a single operation', () => {
      let w1 = schedule.add('A', [])

      assertGraph(schedule, {
        g1: ['A', [w1]]
      })
    })

    //      |   +------------+
    //    A |   | w1      w2 |
    //      |   +------------+
    //
    it('places two independent operations for the same shard', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('A', [])

      assertGraph(schedule, {
        g1: ['A', [w1, w2]]
      })
    })

    //      |   +------------+
    //    A |   | w1 ---- w2 |
    //      |   +------------+
    //
    it('places two dependent operations for the same shard', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('A', [w1])

      assertGraph(schedule, {
        g1: ['A', [w1, w2]]
      })
    })

    //      |   +----------------------------+
    //    A |   | w1 ---- w2 ---- w3 ---- w4 |
    //      |   +----------------------------+
    //
    it('groups a chain of operations on the same shard', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('A', [w1])
      let w3 = schedule.add('A', [w2])
      let w4 = schedule.add('A', [w3])

      assertGraph(schedule, {
        g1: ['A', [w1, w2, w3, w4]]
      })
    })

    //      |   +----+
    //    A |   | w1 |
    //      |   +----+
    //      |
    //      |   +----+
    //    B |   | w2 |
    //      |   +----+
    //
    it('places two independent operations for different shards', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2]]
      })
    })

    //      |   +----+
    //    A |   | w1 |
    //      |   +---\+
    //      |        \
    //      |        +\---+
    //    B |        | w2 |
    //      |        +----+
    //
    it('places two dependent operations for different shards', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2], ['g1']]
      })
    })

    //      |   +------------+
    //    A |   | w1 ---- w3 |
    //      |   +---\--------+
    //      |        \
    //      |        +\---+
    //    B |        | w2 |
    //      |        +----+
    //
    it('places two directly dependent operations in the same group', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('A', [w1])

      assertGraph(schedule, {
        g1: ['A', [w1, w3]],
        g2: ['B', [w2], ['g1']]
      })
    })

    //      |   +----+    +----+
    //    A |   | w1 |    | w3 |
    //      |   +---\+    +/---+
    //      |        \    /
    //      |        +\--/+
    //    B |        | w2 |
    //      |        +----+
    //
    it('places two indirectly dependent operations in different groups', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('A', [w2])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2], ['g1']],
        g3: ['A', [w3], ['g2']]
      })
    })

    //      |   +----+    +----+
    //    A |   | w1 ------ w3 |
    //      |   +---\+    +/---+
    //      |        \    /
    //      |        +\--/+
    //    B |        | w2 |
    //      |        +----+
    //
    it('places an op in its own group if any of its deps are indirect', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('A', [w1, w2])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2], ['g1']],
        g3: ['A', [w3], ['g1', 'g2']]
      })
    })

    //      |   +----+            +----+
    //    A |   | w1 |            | w4 |
    //      |   +---\+            +/---+
    //      |        \            /
    //      |        +\----------/+
    //    B |        | w2 ---- w3 |
    //      |        +------------+
    //
    it('tracks an indirect dependency through multiple hops', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('B', [w2])
      let w4 = schedule.add('A', [w3])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2, w3], ['g1']],
        g3: ['A', [w4], ['g2']]
      })
    })
  })
})
