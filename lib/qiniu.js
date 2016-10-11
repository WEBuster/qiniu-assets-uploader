var Promise = require('bluebird')
var qiniu = require('qiniu')
var qetag = require('./qetag')

var EntryPath = qiniu.rs.EntryPath
var EntryPathPair = qiniu.rs.EntryPathPair

var client = new qiniu.rs.Client()

function upload (bucket, list, poolPrefix, limit) {
  var toUploadEntryList, toCopyEntryList, poolStatList
  return calcHash(list)
  .then(function () {
    return getStatList(bucket, poolPrefix, limit)
  })
  .then(function (statList) {
    poolStatList = statList
  })
  .then(function () {
    toUploadList = getToUploadList(poolPrefix, list, poolStatList)
    toCopyList = getToCopyList(poolPrefix, list)
  })
  .then(function () {
    return uploadFileList(bucket, toUploadList)
  })
  .then(function () {
    return copyFileList(bucket, toCopyList)
  })
}

function uploadFileList (bucket, list, index) {
  return Promise.resolve()
  .then(function () {
    index = index || 0
    if (list[index]) {
      console.log('upload', list[index].originalKey)
      return uploadFile(bucket, list[index].file, list[index].key)
      .then(function (ret) {
        return uploadFileList(bucket, list, index + 1)
      })
    }
  })
}

function uploadFile (bucket, file, key) {
  return new Promise(function (resolve, reject) {
    var extra = getExtra()
    var token = getToken(bucket, key)
    qiniu.io.putFile(token, key, file, extra, function (err, ret) {
      err ? reject(err) : resolve(ret)
    })
  })
}

function getExtra () {
  return new qiniu.io.PutExtra()
}

function getToken (bucket, key) {
  var putPolicy = new qiniu.rs.PutPolicy(bucket + ':' + key)
  return putPolicy.token()
}

function calcHash (list) {
  return new Promise(function (resolve, reject) {
    _calcHash(list, 0, function (err, list) {
      err ? reject(err) : resolve(list)
    })
  })
}

function _calcHash (list, index, cb) {
  if (list[index]) {
    try {
      qetag(list[index].file, function (hash) {
        list[index].hash = hash
        _calcHash(list, index + 1, cb)
      })
    } catch (err) {
      cb(err)
    }
  } else {
    cb(null, list)
  }
}

function getEntryPathList (bucket, list) {
  return list.map(function (item) {
    return new EntryPath(bucket, item.key)
  })
}

function getEntryPathPairList (bucket, list) {
  return list.map(function (item) {
    return new EntryPathPair(
      new EntryPath(bucket, item.from),
      new EntryPath(bucket, item.to)
    )
  })
}

function getStatList (bucket, prefix, limit) {
  return new Promise(function (resolve, reject) {
    _getStatList(bucket, prefix, limit, null, [], function (err, list) {
      err ? reject(err) : resolve(list)
    })
  })
}

function _getStatList (bucket, prefix, limit, marker, list, cb) {
  limit = !limit ? 1000 : limit
  qiniu.rsf.listPrefix(
    bucket, prefix, marker, Math.min(limit, 1000), null,
    function (err, ret) {
      if (err) { return cb(err) }
      list = list.concat(ret.items)
      if (limit > 1000 && ret.marker) {
        _getStatList(bucket, prefix, limit - 1000, ret.marker, list, cb)
      } else {
        cb(null, list)
      }
    }
  )
}

function getToUploadList (poolPrefix, list, poolStatList) {
  var poolHash = {}, hash = {}
  poolStatList.forEach(function (item) {
    poolHash[item.hash] = true
  })
  return list.filter(function (item) {
    if (hash[item.hash]) { return false }
    hash[item.hash] = true
    return !poolHash[item.hash]
  }).map(function (item) {
    return {
      file: item.file,
      key: poolPrefix + item.hash,
      originalKey: item.key
    }
  })
}

function getToCopyList (poolPrefix, list) {
  return list.map(function (item) {
    return {
      from: poolPrefix + item.hash,
      to: item.key
    }
  })
}

function copyFileList (bucket, list) {
  return new Promise(function (resolve, reject) {
    _copyFileList(bucket, list, 0, function (err) {
      err ? reject(err) : resolve()
    })
  })
}

function _copyFileList (bucket, list, index, cb) {
  var entryList = getEntryPathPairList(bucket, list.slice(index, index + 1000))
  if (entryList.length) {
    client.forceBatchCopy(entryList, true, function (err, ret) {
      if (err) {
        return cb(err)
      }
      if (!allSuccess(ret, [200, 614])) {
        return cb(new Error('copy file error.'))
      }
      _copyFileList(bucket, list, index + 1000, cb)
    })
  } else {
    cb()
  }
}

function allSuccess (retList, validCodeList) {
  return !retList.filter(function (ret) {
    return validCodeList.indexOf(ret.code) === -1
  }).length
}

function clear (bucket, prefix, negated) {
  prefix = prefix || ''
  if (negated) {
    return getStatList(bucket, prefix)
    .then(function (list) {
      var keyList = list.map(function (item) { return item.key })
      return getStatList(bucket, '')
      .then(function (allFileList) {
        return allFileList.filter(function (item) {
          return keyList.indexOf(item.key) === -1
        })
      })
    })
    .then(function (list) {
      return deleteFileList(bucket, list)
    })
  } else {
    return getStatList(bucket, prefix)
    .then(function (list) {
      return deleteFileList(bucket, list)
    })
  }
}

function deleteFileList (bucket, list) {
  return new Promise(function (resolve, reject) {
    _deleteFileList(bucket, list, 0, function (err) {
      err ? reject(err) : resolve()
    })
  })
}

function _deleteFileList (bucket, list, index, cb) {
  var entryList = getEntryPathList(bucket, list.slice(index, index + 1000))
  if (entryList.length) {
    client.batchDelete(entryList, function (err, ret) {
      if (err) {
        return cb(err)
      }
      if (!allSuccess(ret, [200, 612])) {
        return cb(new Error('delete file error.'))
      }
      _deleteFileList(bucket, list, index + 1000, cb)
    })
  } else {
    cb()
  }
}

qiniu.ext = {
  upload: upload,
  clear: clear
}

module.exports = qiniu
