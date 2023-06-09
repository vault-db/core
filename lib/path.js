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

class Path {
  constructor (path) {
    this._path = path
    this._parts = parse(path)
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
}

module.exports = Path
