var Promise = require('bluebird')
var qiniu = require('./qiniu')
var path = require('path')
var fs = require('fs')

var requiredOptions = [
  'bucket',
  'accessKey',
  'secretKey',
  'assetsDir',
  'poolPrefix'
]

var uploader = {

  _options: {},

  set: function (options) {
    Object.assign(this._options, options)
    this._options.poolPrefix = this._options.poolPrefix || '-pool-/'
    this._options.retry = this._options.retry || 0
    applyOptions(this._options)
    return this
  },

  upload: function () {
    var options = this._options
    checkOptions(options)
    return retry(function () {
      return upload(options)
    }, options.retry)
  },

  clearPool: function () {
    var options = this._options
    checkOptions(options)
    return retry(function () {
      return clear(options.bucket, options.poolPrefix)
    }, options.retry)
  },

  clearAssets: function () {
    var options = this._options
    checkOptions(options)
    return retry(function () {
      return options.prefix
        ? clear(options.bucket, options.prefix)
        : clear(options.bucket, options.poolPrefix, true)
    }, options.retry)
  },

  clearAll: function () {
    return this.clearPool()
    .then(this.clearAssets.bind(this))
  }

}

function checkOptions (options) {
  requiredOptions.forEach(function (name) {
    if (!options[name]) {
      throw new Error('required option "' + name + '" not found.')
    }
  })
}

function applyOptions (options) {
  qiniu.conf.UP_HOST = options.host || qiniu.conf.UP_HOST
  qiniu.conf.ACCESS_KEY = options.accessKey
  qiniu.conf.SECRET_KEY = options.secretKey
}

function retry (action, time) {
  return action()
  .catch(function (err) {
    if (time > 0) {
      console.log('retrying... (' + time + ')')
      return retry(action, time - 1)
    } else {
      return Promise.reject(err)
    }
  })
}

function clear (bucket, prefix, negated) {
  return qiniu.ext.clear(bucket, prefix, negated)
}

function upload (options) {
  var root = options.assetsDir
  var bucket = options.bucket
  var prefix = options.prefix
  var pool = options.poolPrefix
  var limit = options.limit
  var computeKey = options.computeKey
  var fileList = getFileList(root)
  var list = fileList.map(function (file) {
    return {
      file: file,
      key: (computeKey || getKey)(root, file, prefix)
    }
  })
  return qiniu.ext.upload(bucket, list, pool, limit)
}

function getFileList (root) {
  var fileList = []
  var list = fs.readdirSync(root)
  list.forEach(function (file) {
    var pathName = path.join(root, file)
    var stats = fs.statSync(pathName)
    fileList.push(stats.isDirectory() ? getFileList(pathName) : pathName)
  })
  return fileList.join().split(',').filter(function (file) { return file })
}

function getKey (root, file, prefix) {
  return prefix + path.relative(root, file).replace(/\\/g, '/')
}

module.exports = uploader
