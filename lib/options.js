'use strict'

class Options {
  constructor (config, parent = new Map()) {
    this._rules = new Map([...parent])
    this._buildRules(config)
  }

  _buildRules (config, path = []) {
    if (typeof config.valid === 'function') {
      this._rules.set(path.join('.'), { path, ...config })
    } else {
      for (let key in config) {
        this._buildRules(config[key], [...path, key])
      }
    }
  }

  extend (config) {
    return new Options(config, this._rules)
  }

  parse (input) {
    let output = {}

    for (let rule of this._rules.values()) {
      this._applyRule(rule, input, output)
    }
    this._checkUnknownKeys(input)

    return output
  }

  _applyRule (rule, input, output) {
    let path = rule.path
    let value = path.reduce((obj, key) => (obj || {})[key], input)

    if (value === undefined) {
      if (rule.required) {
        throw new ConfigError(`option '${path.join('.')}' is required`)
      } else {
        value = rule.default
      }
    }

    if (!rule.valid(value)) {
      throw new ConfigError(`option '${path.join('.')}' ${rule.msg}`)
    }

    for (let [idx, key] of path.entries()) {
      output[key] = (idx === path.length - 1) ? value : (output[key] || {})
      output = output[key]
    }
  }

  _checkUnknownKeys (input, path = []) {
    if (typeof input === 'object' && input !== null) {
      for (let key in input) {
        this._checkUnknownKeys(input[key], [...path, key])
      }
    } else {
      path = path.join('.')
      if (!this._rules.has(path)) {
        throw new ConfigError(`unrecognised option: '${path}'`)
      }
    }
  }
}

class ConfigError extends Error {
  constructor (message) {
    super(message)
    this.code = 'ERR_CONFIG'
    this.name = 'ConfigError'
  }
}

module.exports = Options
