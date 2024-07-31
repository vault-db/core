'use strict'

const SEP = '/'

function parse (path) {
  let parts = path.split(SEP)
  let links = []

  for (let i = 0; i < parts.length - 1; i++) {
    parts[i] += SEP
  }
  if (parts[parts.length - 1] === '') {
    parts.pop()
  }
  for (let i = 1; i < parts.length; i++) {
    let link = [parts.slice(0, i).join(''), parts[i]]
    links.push(link)
  }
  return links
}

class PathError extends Error {
  constructor (message) {
    super(message)
    this.code = 'ERR_INVALID_PATH'
    this.name = 'PathError'
  }
}

class Path {
  static parse (pathStr) {
    if (pathStr instanceof Path) {
      return pathStr
    } else {
      return new Path(pathStr)
    }
  }

  constructor (path, parts = null) {
    this._path = path
    this._parts = parts || parse(path)
  }

  isValid () {
    return this._path.startsWith(SEP)
  }

  isDir () {
    return this._path.endsWith(SEP)
  }

  isDoc () {
    return !this._path.endsWith(SEP)
  }

  full () {
    return this._path
  }

  dirs () {
    return this._parts.map(([dir]) => dir)
  }

  links () {
    return this._parts.slice()
  }

  join (name) {
    if (this.isDir()) {
      let parts = [...this._parts, [this._path, name]]
      return new Path(this._path + name, parts)
    } else {
      throw new PathError(`cannot join() a non-directory path: '${this._path}'`)
    }
  }
}

module.exports = {
  Path,
  PathError
}
