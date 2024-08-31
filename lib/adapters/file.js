'use strict'

const crypto = require('crypto')
const fs = require('fs').promises
const path = require('path')

const ConflictError = require('./conflict_error')

const { O_CREAT, O_EXCL, O_RDWR } = require('fs').constants

const HASH_ALGO = 'sha256'
const HASH_FORMAT = 'base64'

function hash (value) {
  let hash = crypto.createHash(HASH_ALGO)
  hash.update(value)
  return hash.digest(HASH_FORMAT)
}

class FileAdapter {
  constructor (dir) {
    this._dir = dir
  }

  async read (id) {
    let filepath = path.resolve(this._dir, id)

    try {
      let value = await fs.readFile(filepath, 'utf8')
      let rev = hash(value)

      return { value, rev }

    } catch (error) {
      if (error.code === 'ENOENT') {
        return null
      } else {
        throw error
      }
    }
  }

  async write (id, value, rev = null) {
    let filepath = path.resolve(this._dir, id)
    let lockpath = filepath + '.lock'

    let file = await this._openFile(lockpath)

    let record = await this.read(id)
    let expect = record ? record.rev : null

    if (rev !== expect) {
      await file.close()
      await fs.unlink(lockpath)
      throw new ConflictError()
    }

    await file.write(value, 0, 'utf8')
    await file.close()
    await fs.rename(lockpath, filepath)

    rev = hash(value)
    return { rev }
  }

  async _openFile (lockpath) {
    try {
      await fs.mkdir(path.dirname(lockpath), { recursive: true })
      let file = await fs.open(lockpath, O_RDWR | O_CREAT | O_EXCL)
      return file

    } catch (error) {
      if (error.code === 'EEXIST') {
        throw new ConflictError()
      } else {
        throw error
      }
    }
  }
}

module.exports = FileAdapter