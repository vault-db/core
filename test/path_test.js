'use strict'

const { Path } = require('../lib/path')
const { assert } = require('chai')

describe('Path', () => {
  describe('isValid()', () => {
    it('returns true if the path begins with a slash', () => {
      let path = Path.parse('/foo')
      assert(path.isValid())
    })

    it('returns false if the path does not begin with a slash', () => {
      let path = Path.parse('foo')
      assert(!path.isValid())
    })
  })

  describe('isDir()', () => {
    it('returns true if the path is a directory', () => {
      let path = Path.parse('/foo/')
      assert(path.isDir())
    })

    it('returns false if the path is not a directory', () => {
      let path = Path.parse('/foo')
      assert(!path.isDir())
    })
  })

  describe('isDoc()', () => {
    it('returns true if the path is a document', () => {
      let path = Path.parse('/foo')
      assert(path.isDoc())
    })

    it('returns false if the path is not a document', () => {
      let path = Path.parse('/foo/')
      assert(!path.isDoc())
    })
  })

  describe('full()', () => {
    it('returns the full path for a document', () => {
      let path = Path.parse('/path/to/x.json')
      assert.equal(path.full(), '/path/to/x.json')
    })

    it('returns the full path for a directory', () => {
      let path = Path.parse('/path/to/')
      assert.equal(path.full(), '/path/to/')
    })
  })

  describe('dirs()', () => {
    it('returns the parent directories for a document', () => {
      let path = Path.parse('/path/to/x.json')
      assert.deepEqual(path.dirs(), ['/', '/path/', '/path/to/'])
    })

    it('returns the parent directories for a directory', () => {
      let path = Path.parse('/path/to/')
      assert.deepEqual(path.dirs(), ['/', '/path/'])
    })
  })

  describe('links()', () => {
    it('returns the required links for a document', () => {
      let path = Path.parse('/path/to/x.json')
      assert.deepEqual(path.links(), [['/', 'path/'], ['/path/', 'to/'], ['/path/to/', 'x.json']])
    })

    it('returns the required links for a directory', () => {
      let path = Path.parse('/path/to/')
      assert.deepEqual(path.links(), [['/', 'path/'], ['/path/', 'to/']])
    })
  })

  describe('join()', () => {
    it('joins a directory with a document name', () => {
      let path = Path.parse('/path/to/')
      let joined = path.join('x')
      assert.equal(joined.full(), '/path/to/x')
      assert.deepEqual(joined.links(), [['/', 'path/'], ['/path/', 'to/'], ['/path/to/', 'x']])
    })

    it('joins a directory with a directory name', () => {
      let path = Path.parse('/path/to/')
      let joined = path.join('x/')
      assert.equal(joined.full(), '/path/to/x/')
      assert.deepEqual(joined.links(), [['/', 'path/'], ['/path/', 'to/'], ['/path/to/', 'x/']])
    })

    it('does not affect the original path', () => {
      let path = Path.parse('/path/to/')
      let joined = path.join('x')
      assert.equal(path.full(), '/path/to/')
      assert.deepEqual(path.links(), [['/', 'path/'], ['/path/', 'to/']])
    })

    it('throws an error trying to join a document path', () => {
      let path = Path.parse('/path/to')
      assert.throws(() => path.join('x'))
    })
  })
})
