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

    if (mapping.has(group.id)) {
      assert.fail(`duplicate group definitions: '${mapping.get(group.id)}' and '${id}'`)
    }

    mapping.set(group.id, id)
    let mappedDeps = [...group.parents].map((dep) => mapping.get(dep))
    assert.sameMembers(mappedDeps, deps)
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

function assertShardList (schedule, shard, ...expected) {
  let groups = schedule._shards.get(shard)

  assert.equal(groups.length, expected.length,
    `shard '${shard}' expected to have ${expected.length} groups but had ${groups.length}`)

  for (let [idx, groupId] of groups.entries()) {
    let group = schedule._groups.get(groupId)
    assert.sameMembers([...group.ops], expected[idx])
  }
}

describe('Schedule', () => {
  let schedule

  describe('basic planning', () => {
    beforeEach(() => {
      schedule = new Schedule()
    })

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

    //      |   +----+            +----+
    //    A |   | w1 |            | w4 |
    //      |   +---\+            +/---+
    //      |        \            /
    //      |        +\----------/+
    //    B |        | w2      w3 |
    //      |        +------------+
    //
    it('tracks an indirect dependency via operations in the same group', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('B', [])
      let w4 = schedule.add('A', [w3])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2, w3], ['g1']],
        g3: ['A', [w4], ['g2']]
      })
    })

    //      |   +----+             +----+
    //    A |   | w1 |             | w4 |
    //      |   +---\+             +/---+
    //      |        \             /
    //      |        +\---+       /
    //    B |        | w2 |      /
    //      |        +---\+     /
    //      |             \    /
    //      |             +\--/+
    //    C |             | w3 |
    //      |             +----+
    //
    it('tracks an indirect dependency via a chain of groups', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('C', [w2])
      let w4 = schedule.add('A', [w3])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2], ['g1']],
        g3: ['C', [w3], ['g2']],
        g4: ['A', [w4], ['g3']]
      })
    })

    //      |   +------------+    +----+
    //    A |   | w1      w4 |    | w3 |
    //      |   +---\--------+    +/---+
    //      |        \            /
    //      |        +\---+      /
    //    B |        | w2 ------'
    //      |        +----+
    //
    it('places an indepdendent operation in the earliest group', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('A', [w2])
      let w4 = schedule.add('A', [])

      assertGraph(schedule, {
        g1: ['A', [w1, w4]],
        g2: ['B', [w2], ['g1']],
        g3: ['A', [w3], ['g2']]
      })
    })

    //      |   +----+    +------------+
    //    A |   | w1 |    | w3 ---- w4 |
    //      |   +---\+    +/-----------+
    //      |        \    /
    //      |        +\--/+
    //    B |        | w2 |
    //      |        +----+
    //
    it('places an operation no earlier than a direct dependency', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('A', [w2])
      let w4 = schedule.add('A', [w3])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2], ['g1']],
        g3: ['A', [w3, w4], ['g2']]
      })
    })

    //      |   +----+    +------------+
    //    A |   | w1 |    | w3      w4 |
    //      |   +---\+    +/-------/---+
    //      |        \    /       /
    //      |        +\--/+      /
    //    B |        | w2 ------'
    //      |        +----+
    //
    it('places an operation later than an indirect dependency', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('A', [w2])
      let w4 = schedule.add('A', [w2])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2], ['g1']],
        g3: ['A', [w3, w4], ['g2']]
      })
    })

    //      |        +----+
    //    A |        | w2 |
    //      |        +/--\+
    //      |        /    \
    //      |   +---/+    +\---+
    //    B |   | w1 |    | w3 |
    //      |   +----+    +---\+
    //      |                  \
    //      |          +--------\---+
    //    C |          | w4      w5 |
    //      |          +------------+
    //
    it('takes the group index from operations on the same shard', () => {
      let w1 = schedule.add('B', [])
      let w2 = schedule.add('A', [w1])
      let w3 = schedule.add('B', [w2])
      let w4 = schedule.add('C', [])
      let w5 = schedule.add('C', [w3])

      assertGraph(schedule, {
        g1: ['B', [w1]],
        g2: ['A', [w2], ['g1']],
        g3: ['B', [w3], ['g2']],
        g4: ['C', [w4, w5], ['g3']]
      })
    })

    //      |                +------------+
    //    A |          .------ w2      w7 ------.
    //      |         /      +--------/---+      \
    //      |        /               /            \
    //      |   +---/---------------/+    +--------\---+
    //    B |   | w1      w3      w6 |    | w5      w8 |
    //      |   +-----------\--------+    +/-------/---+
    //      |                \            /       /
    //      |                +\---+      /       /
    //    C |                | w4 ------'-------'
    //      |                +----+
    //
    it('places a dependent set of operations', () => {
      let w1 = schedule.add('B', [])
      let w2 = schedule.add('A', [w1])
      let w3 = schedule.add('B', [])
      let w4 = schedule.add('C', [w3])
      let w5 = schedule.add('B', [w4])
      let w6 = schedule.add('B', [])
      let w7 = schedule.add('A', [w6])
      let w8 = schedule.add('B', [w4, w7])

      assertGraph(schedule, {
        g1: ['B', [w1, w3, w6]],
        g2: ['A', [w2, w7], ['g1']],
        g3: ['C', [w4], ['g1']],
        g4: ['B', [w5, w8], ['g2', 'g3']]
      })
    })

    //      |   +----+                     +----+
    //    A |   | w3 |                     | w5 |
    //      |   +---\+                     +/---+
    //      |        \                     /
    //      |         \               +---/+
    //    B |          \              | w2 |
    //      |           \             +/---+
    //      |            \            /
    //      |            +\----------/+
    //    C |            | w4      w1 |
    //      |            +------------+
    //
    it('tracks indirect dependencies through group chains', () => {
      let w1 = schedule.add('C', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('A', [])
      let w4 = schedule.add('C', [w3])
      let w5 = schedule.add('A', [w2])

      assertGraph(schedule, {
        g1: ['A', [w3]],
        g2: ['C', [w4, w1], ['g1']],
        g3: ['B', [w2], ['g2']],
        g4: ['A', [w5], ['g3']]
      })
    })

    //      |   +----+
    //    A |   | w1 |
    //      |   +---\+
    //      |        \
    //      |        +\---+
    //    B |        | w2 ------.
    //      |        +---\+      \
    //      |             \       \
    //      |             +\-------\---+
    //    C |             | w3      w4 |
    //      |             +------------+
    //
    it('groups two operations with the same dependency', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('C', [w2])
      let w4 = schedule.add('C', [w2])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2], ['g1']],
        g3: ['C', [w3, w4], ['g2']]
      })
    })
  })

  describe('depth reduction', () => {
    beforeEach(() => {
      schedule = new Schedule({ depthLimit: 2 })
    })

    //      |   +----+
    //    A |   | w1 |
    //      |   +---\+
    //      |        \
    //      |        +\---+
    //    B |        | w2 |
    //      |        +---\+
    //      |             \
    //      |   +----+    +\---+
    //    C |   | w4 |    | w3 |
    //      |   +----+    +----+
    //
    it('places an independent op in a new group at the front of a shard list', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('C', [w2])
      let w4 = schedule.add('C', [])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2], ['g1']],
        g3: ['C', [w3], ['g2']],
        g4: ['C', [w4]]
      })

      assertShardList(schedule, 'C', [w4], [w3])
    })

    //      |   +----+    +----+    +----+
    //    A |   | w1 |    | w6 |    | w5 |
    //      |   +---\+    +/---+    +/---+
    //      |        \    /         /
    //      |        +\--/+    +---/+
    //    B |        | w2 |    | w4 |
    //      |        +---\+    +/---+
    //      |             \    /
    //      |             +\--/+
    //    C |             | w3 |
    //      |             +----+
    //
    it('places a dependent op in a new group in the middle of a shard list', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('C', [w2])
      let w4 = schedule.add('B', [w3])
      let w5 = schedule.add('A', [w4])
      let w6 = schedule.add('A', [w2])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2], ['g1']],
        g3: ['C', [w3], ['g2']],
        g4: ['B', [w4], ['g3']],
        g5: ['A', [w5], ['g4']],
        g6: ['A', [w6], ['g2']]
      })

      assertShardList(schedule, 'A', [w1], [w6], [w5])
      assertShardList(schedule, 'B', [w2], [w4])
    })

    //      |   +----+    +-------------+
    //    A |   | w1 |    | w5       w4 |
    //      |   +---\+    +/--------/---+
    //      |        \    /        /
    //      |        +\--/+       /
    //    B |        | w2 |      /
    //      |        +---\+     /
    //      |             \    /
    //      |             +\--/+
    //    C |             | w3 |
    //      |             +----+
    //
    it('does not create new groups if the depth saving is insufficient', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('C', [w2])
      let w4 = schedule.add('A', [w3])
      let w5 = schedule.add('A', [w2])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2], ['g1']],
        g3: ['C', [w3], ['g2']],
        g4: ['A', [w5, w4], ['g2', 'g3']],
      })

      assertShardList(schedule, 'A', [w1], [w5, w4])
    })

    //      |      +----+
    //    A |      | w1 |
    //      |      +---\+
    //      |           \
    //      |           +\---+
    //    B |           | w2 |
    //      |           +---\+
    //      |                \
    //      |        +--------\---+
    //    C |        | w5      w3 |
    //      |        +/----------\+
    //      |        /            \
    //      |   +---/+            +\---+
    //    D |   | w4 |            | w6 |
    //      |   +----+            +----+
    //
    it('places a depth-1 operation in a depth-2 group', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('C', [w2])
      let w4 = schedule.add('D', [])
      let w5 = schedule.add('C', [w4])
      let w6 = schedule.add('D', [w3])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2], ['g1']],
        g3: ['D', [w4]],
        g4: ['C', [w5, w3], ['g2', 'g3']],
        g5: ['D', [w6], ['g4']]
      })
    })

    //      |   +----+
    //    A |   | w1 |
    //      |   +---\+
    //      |        \
    //      |        +\---+
    //    B |        | w2 |
    //      |        +---\+
    //      |             \
    //      |             +\-----------+
    //    C |             | w3 ---- w4 |
    //      |             +------------+
    //
    it('places a dependent op no earlier than its direct dependency', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('C', [w2])
      let w4 = schedule.add('C', [w3])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2], ['g1']],
        g3: ['C', [w3, w4], ['g2']],
      })
    })

    //      |   +----+
    //    A |   | w1 |
    //      |   +---\+
    //      |        \
    //      |        +\---+
    //    B |        | w2 |
    //      |        +---\+
    //      |             \
    //      |   +----+    +\-----------+
    //    C |   | w4 |    | w3 ---- w5 |
    //      |   +----+    +------------+
    //
    it('places a dependent op in an index-shifted group', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('C', [w2])
      let w4 = schedule.add('C', [])
      let w5 = schedule.add('C', [w3])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2], ['g1']],
        g3: ['C', [w3, w5], ['g2']],
        g4: ['C', [w4]]
      })

      assertShardList(schedule, 'C', [w4], [w3, w5])
    })

    //      |   +----+
    //    A |   | w3 |
    //      |   +---\+
    //      |        \
    //      |        +\-----------+
    //    B |        | w4      w1 |
    //      |        +-----------\+
    //      |                     \
    //      |   +----+            +\---+
    //    C |   | w5 |            | w2 |
    //      |   +----+            +----+
    //
    it('adjusts the depth of downstream groups', () => {
      let w1 = schedule.add('B', [])
      let w2 = schedule.add('C', [w1])
      let w3 = schedule.add('A', [])
      let w4 = schedule.add('B', [w3])
      let w5 = schedule.add('C', [])

      assertGraph(schedule, {
        g1: ['A', [w3]],
        g2: ['B', [w4, w1], ['g1']],
        g3: ['C', [w2], ['g2']],
        g4: ['C', [w5]]
      })
    })

    //      |           +----+
    //    A |           | w1 |
    //      |           +---\+
    //      |                \
    //      |        +--------\---+
    //    B |        | w5      w2 |
    //      |        +/----------\+
    //      |        /            \
    //      |   +---/+            +\---+
    //    C |   | w4 |            | w3 |
    //      |   +----+            +----+
    //
    it('links two chains if it does not excessively increase the depth', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('C', [w2])
      let w4 = schedule.add('C', [])
      let w5 = schedule.add('B', [w4])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['C', [w4]],
        g3: ['B', [w5, w2], ['g1', 'g2']],
        g4: ['C', [w3], ['g3']],
      })

      assertShardList(schedule, 'C', [w4], [w3])
    })

    //      |        +------------+
    //    A |        | w2      w3 |
    //      |        +/----------\+
    //      |        /            \
    //      |   +---/+    +--------\---+
    //    B |   | w1 |    | w6      w4 |
    //      |   +----+    +/-----------+
    //      |             /
    //      |        +---/+
    //    C |        | w5 |
    //      |        +----+
    //
    it('places a dependent op avoiding increasing the graph depth', () => {
      let w1 = schedule.add('B', [])
      let w2 = schedule.add('A', [w1])
      let w3 = schedule.add('A', [])
      let w4 = schedule.add('B', [w3])
      let w5 = schedule.add('C', [])
      let w6 = schedule.add('B', [w5])

      assertGraph(schedule, {
        g1: ['B', [w1]],
        g2: ['A', [w2, w3], ['g1']],
        g3: ['C', [w5]],
        g4: ['B', [w6, w4], ['g2', 'g3']]
      })

      assertShardList(schedule, 'B', [w1], [w6, w4])
    })

    //      |        +------------+
    //    A |        | w2      w3 |
    //      |        +/----------\+
    //      |        /            \
    //      |   +---/--------+    +\---+
    //    B |   | w1 ---- w5 |    | w4 |
    //      |   +------------+    +----+
    //
    it('does not use direct dependencies to infer the op depth', () => {
      let w1 = schedule.add('B', [])
      let w2 = schedule.add('A', [w1])
      let w3 = schedule.add('A', [])
      let w4 = schedule.add('B', [w3])
      let w5 = schedule.add('B', [w1])

      assertGraph(schedule, {
        g1: ['B', [w1, w5]],
        g2: ['A', [w2, w3], ['g1']],
        g3: ['B', [w4], ['g2']]
      })

      assertShardList(schedule, 'B', [w1, w5], [w4])
    })

    //      |        +------------+
    //    A |        | w2      w3 |
    //      |        +/----------\+
    //      |        /            \
    //      |   +---/+            +\-----------+
    //    B |   | w1 |            | w5      w8 |
    //      |   +---\+            +/-------/---+
    //      |        \            /       /
    //      |        +\----------/+      /
    //    C |        | w6      w4 |     /
    //      |        +------------+    /
    //      |                         /
    //      |                    +---/+
    //    D |                    | w7 |
    //      |                    +----+
    //
    it('tracks the depth of groups with multiple parents', () => {
      let w1 = schedule.add('B', [])
      let w2 = schedule.add('A', [w1])
      let w3 = schedule.add('A', [])
      let w4 = schedule.add('C', [])
      let w5 = schedule.add('B', [w3, w4])
      let w6 = schedule.add('C', [w1])
      let w7 = schedule.add('D', [])
      let w8 = schedule.add('B', [w7])

      assertGraph(schedule, {
        g1: ['B', [w1]],
        g2: ['A', [w2, w3], ['g1']],
        g3: ['C', [w6, w4], ['g1']],
        g4: ['D', [w7]],
        g5: ['B', [w5, w8], ['g2', 'g3', 'g4']]
      })

      assertShardList(schedule, 'B', [w1], [w5, w8])
    })

    //      |                 +----+
    //    A |                 | w9 --------------.
    //      |                 +/---+              \
    //      |                 /                    \
    //      |   +----+       /    +-----------------\----+    +----+
    //    B |   | w5 |      /     | w2       w4      w10 |    | w8 |
    //      |   +---\+     /      +/--------/--\---------+    +/---+
    //      |        \    /       /        /    \             /
    //      |        +\--/-------/+       /     +\---+       /
    //    C |        | w6      w1 |      /      | w7 -------'
    //      |        +-----------\+     /       +----+
    //      |                     \    /
    //      |                     +\--/+
    //    D |                     | w3 |
    //      |                     +----+
    //
    it('updates depth of descendants in topological order', () => {
      let w1 = schedule.add('C', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('D', [w1])
      let w4 = schedule.add('B', [w3])
      let w5 = schedule.add('B', [])
      let w6 = schedule.add('C', [w5])
      let w7 = schedule.add('C', [w4])
      let w8 = schedule.add('B', [w7])
      let w9 = schedule.add('A', [w6])
      let w10 = schedule.add('B', [w9])

      assertGraph(schedule, {
        g1: ['B', [w5]],
        g2: ['C', [w6, w1], ['g1']],
        g3: ['A', [w9], ['g2']],
        g4: ['D', [w3], ['g2']],
        g5: ['B', [w2, w4, w10], ['g2', 'g3', 'g4']],
        g6: ['C', [w7], ['g5']],
        g7: ['B', [w8], ['g6']]
      })

      assertShardList(schedule, 'B', [w5], [w2, w4, w10], [w8])
      assertShardList(schedule, 'C', [w6, w1], [w7])
    })

    //      |   +----+
    //    A |   | w1 |
    //      |   +---\+
    //      |        \
    //      |        +\---+
    //    B |        | w2 ------.
    //      |        +---\+      \
    //      |             \       \
    //      |   +----+    +\-------\---+
    //    C |   | w4 |    | w3      w5 |
    //      |   +----+    +------------+
    //
    it('groups two operations with the same dependency', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('C', [w2])
      let w4 = schedule.add('C', [])
      let w5 = schedule.add('C', [w2])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2], ['g1']],
        g3: ['C', [w3, w5], ['g2']],
        g4: ['C', [w4]]
      })

      assertShardList(schedule, 'C', [w4], [w3, w5])
    })

    //      |           +----+
    //    A |           | w1 |
    //      |           +---\+
    //      |                \
    //      |                +\---+
    //    B |                | w2 |
    //      |                +---\+
    //      |                     \
    //      |   +------------+    +\---+
    //    C |   | w5      w4 |    | w3 |
    //      |   +------------+    +----+
    //
    it('places an independent op into the earliest group', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('C', [w2])
      let w4 = schedule.add('C', [])
      let w5 = schedule.add('C', [])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2], ['g1']],
        g3: ['C', [w3], ['g2']],
        g4: ['C', [w4, w5]]
      })

      assertShardList(schedule, 'C', [w4, w5], [w3])
    })

    //      |   +----+
    //    A |   | w1 |
    //      |   +---\+
    //      |        \
    //      |        +\---+
    //    B |        | w2 |
    //      |        +---\+
    //      |             \
    //      |   +----+    +\-----------+
    //    C |   | w4 |    | w3      w6 |
    //      |   +----+    +--------/---+
    //      |                     /
    //      |                +---/+
    //    D |                | w5 |
    //      |                +----+
    //
    it('avoids an inverted dependency in a shallow graph', () => {
      let w1 = schedule.add('A', [])
      let w2 = schedule.add('B', [w1])
      let w3 = schedule.add('C', [w2])
      let w4 = schedule.add('C', [])
      let w5 = schedule.add('D', [])
      let w6 = schedule.add('C', [w5])

      assertGraph(schedule, {
        g1: ['A', [w1]],
        g2: ['B', [w2], ['g1']],
        g3: ['C', [w4]],
        g4: ['D', [w5]],
        g5: ['C', [w3, w6], ['g2', 'g4']]
      })
    })

    //      |                +----+
    //    A |                | w2 |
    //      |                +/--\+
    //      |                /    \
    //      |           +---/+    +\---+
    //    B |           | w1 |    | w3 |
    //      |           +---\+    +---\+
    //      |                \         \
    //      |        +--------\---+    +\---+
    //    C |        | w7      w5 |    | w4 |
    //      |        +/-----------+    +----+
    //      |        /
    //      |   +---/+
    //    D |   | w6 |
    //      |   +----+
    //
    it('sets up a potential inverted dependency in a deeper graph', () => {
      let w1 = schedule.add('B', [])
      let w2 = schedule.add('A', [w1])
      let w3 = schedule.add('B', [w2])
      let w4 = schedule.add('C', [w3])
      let w5 = schedule.add('C', [w1])
      let w6 = schedule.add('D', [])
      let w7 = schedule.add('C', [w6])

      assertGraph(schedule, {
        g1: ['B', [w1], []],
        g2: ['A', [w2], ['g1']],
        g3: ['B', [w3], ['g2']],
        g4: ['C', [w4], ['g3']],
        g5: ['D', [w6], []],
        g6: ['C', [w7, w5], ['g1', 'g5']]
      })

      assertShardList(schedule, 'C', [w7, w5], [w4])
    })

    //      |                +----+
    //    A |                | w2 |
    //      |                +/--\+
    //      |                /    \
    //      |           +---/+    +\---+
    //    B |           | w1 |    | w3 |
    //      |           +---\+    +---\+
    //      |                \         \
    //      |        +--------\---+    +\---+
    //    C |        | w7      w5 |    | w4 |
    //      |        +/-----------+    +---\+
    //      |        /                      \
    //      |   +---/+                      +\---+
    //    D |   | w6 |                      | w8 |
    //      |   +----+                      +----+
    //
    it('places a dependent op in a new group at the end of the shard list', () => {
      let w1 = schedule.add('B', [])
      let w2 = schedule.add('A', [w1])
      let w3 = schedule.add('B', [w2])
      let w4 = schedule.add('C', [w3])
      let w5 = schedule.add('C', [w1])
      let w6 = schedule.add('D', [])
      let w7 = schedule.add('C', [w6])
      let w8 = schedule.add('D', [w4])

      assertGraph(schedule, {
        g1: ['B', [w1], []],
        g2: ['A', [w2], ['g1']],
        g3: ['B', [w3], ['g2']],
        g4: ['C', [w4], ['g3']],
        g5: ['D', [w6], []],
        g6: ['C', [w7, w5], ['g1', 'g5']],
        g7: ['D', [w8], ['g4']]
      })

      assertShardList(schedule, 'C', [w7, w5], [w4])
      assertShardList(schedule, 'D', [w6], [w8])
    })

    //      |                +----+
    //    A |                | w2 |
    //      |                +/--\+
    //      |                /    \
    //      |           +---/+    +\---+
    //    B |           | w1 |    | w3 |
    //      |           +---\+    +---\+
    //      |                \         \
    //      |        +--------\---+    +\---+
    //    C |        | w7      w8 |    | w4 |
    //      |        +/-----------+    +---\+
    //      |        /                      \
    //      |   +---/+                      +\---+
    //    D |   | w6 |                      | w5 |
    //      |   +----+                      +----+
    //
    it('gives the same result for a second order of operations', () => {
      let w1 = schedule.add('B', [])
      let w2 = schedule.add('A', [w1])
      let w3 = schedule.add('B', [w2])
      let w4 = schedule.add('C', [w3])
      let w5 = schedule.add('D', [w4])
      let w6 = schedule.add('D', [])
      let w7 = schedule.add('C', [w6])
      let w8 = schedule.add('C', [w1])

      assertGraph(schedule, {
        g1: ['B', [w1], []],
        g2: ['A', [w2], ['g1']],
        g3: ['B', [w3], ['g2']],
        g4: ['C', [w4], ['g3']],
        g5: ['D', [w6], []],
        g6: ['C', [w7, w8], ['g1', 'g5']],
        g7: ['D', [w5], ['g4']]
      })

      assertShardList(schedule, 'C', [w7, w8], [w4])
      assertShardList(schedule, 'D', [w6], [w5])
    })

    //      |                +----+
    //    A |                | w2 |
    //      |                +/--\+
    //      |                /    \
    //      |           +---/+    +\---+
    //    B |           | w1 |    | w3 |
    //      |           +---\+    +---\+
    //      |                \         \
    //      |        +--------\---+    +\---+
    //    C |        | w8      w7 |    | w4 |
    //      |        +/-----------+    +---\+
    //      |        /                      \
    //      |   +---/+                      +\---+
    //    D |   | w6 |                      | w5 |
    //      |   +----+                      +----+
    //
    it('gives the same result for a third order of operations', () => {
      let w1 = schedule.add('B', [])
      let w2 = schedule.add('A', [w1])
      let w3 = schedule.add('B', [w2])
      let w4 = schedule.add('C', [w3])
      let w5 = schedule.add('D', [w4])
      let w6 = schedule.add('D', [])
      let w7 = schedule.add('C', [w1])
      let w8 = schedule.add('C', [w6])

      assertGraph(schedule, {
        g1: ['B', [w1], []],
        g2: ['A', [w2], ['g1']],
        g3: ['B', [w3], ['g2']],
        g4: ['C', [w4], ['g3']],
        g5: ['D', [w6], []],
        g6: ['C', [w8, w7], ['g1', 'g5']],
        g7: ['D', [w5], ['g4']]
      })

      assertShardList(schedule, 'C', [w8, w7], [w4])
      assertShardList(schedule, 'D', [w6], [w5])
    })
  })
})
