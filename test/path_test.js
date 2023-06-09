'use strict'

const Path = require('../lib/path')
const { assert } = require('chai')

describe('Path', () => {
  describe('isValid()', () => {
    it('returns true if the path begins with a slash', () => {
      let path = new Path('/foo')
      assert(path.isValid())
    })

    it('returns false if the path does not begin with a slash', () => {
      let path = new Path('foo')
      assert(!path.isValid())
    })
  })

  describe('isDir()', () => {
    it('returns true if the path is a directory', () => {
      let path = new Path('/foo/')
      assert(path.isDir())
    })

    it('returns false if the path is not a directory', () => {
      let path = new Path('/foo')
      assert(!path.isDir())
    })
  })

  describe('isDoc()', () => {
    it('returns true if the path is a document', () => {
      let path = new Path('/foo')
      assert(path.isDoc())
    })

    it('returns false if the path is not a document', () => {
      let path = new Path('/foo/')
      assert(!path.isDoc())
    })
  })

  describe('full()', () => {
    it('returns the full path for a document', () => {
      let path = new Path('/path/to/x.json')
      assert.equal(path.full(), '/path/to/x.json')
    })

    it('returns the full path for a directory', () => {
      let path = new Path('/path/to/')
      assert.equal(path.full(), '/path/to/')
    })
  })

  describe('dirs()', () => {
    it('returns the parent directories for a document', () => {
      let path = new Path('/path/to/x.json')
      assert.deepEqual(path.dirs(), ['/', '/path/', '/path/to/'])
    })

    it('returns the parent directories for a directory', () => {
      let path = new Path('/path/to/')
      assert.deepEqual(path.dirs(), ['/', '/path/'])
    })
  })

  describe('links()', () => {
    it('returns the required links for a document', () => {
      let path = new Path('/path/to/x.json')
      assert.deepEqual(path.links(), [['/', 'path/'], ['/path/', 'to/'], ['/path/to/', 'x.json']])
    })

    it('returns the required links for a directory', () => {
      let path = new Path('/path/to/')
      assert.deepEqual(path.links(), [['/', 'path/'], ['/path/', 'to/']])
    })
  })
})
