# qiniu-assets-uploader

[![Build Status](https://circleci.com/gh/WEBuster/qiniu-assets-uploader/tree/master.svg?style=shield)](https://circleci.com/gh/WEBuster/qiniu-assets-uploader/tree/master)
[![Version](https://img.shields.io/npm/v/qiniu-assets-uploader.svg)](https://www.npmjs.com/package/qiniu-assets-uploader)
[![License](https://img.shields.io/npm/l/qiniu-assets-uploader.svg)](LICENSE)

> 七牛网站静态资源上传工具

## 安装

```bash
npm i -D qiniu-assets-uploader
```

## 使用

```js
const uploader = require('qiniu-assets-uploader')

uploader.set({
  host: '<host>',
  bucket: '<bucket>',
  prefix: '<prefix>',
  accessKey: '<accessKey>',
  secretKey: '<secretKey>',
  assetsDir: '<assetsDir>',
  poolPrefix: '<poolPrefix>',
  computeKey: (root, file, prefix) => '<key>',
  limit: 8192,
  retry: 3
})

uploader.upload()
.then(() => {
  console.log('upload complete.')
})
.catch(err => {
  console.error(err)
})
```

## 配置

#### host: String

对应于 [Qinu Node.js SDK](https://github.com/qiniu/nodejs-sdk) 中的 `conf.UP_HOST` ，部分存储区域可能需要配置。

#### bucket: String

空间名。

#### prefix: String

资源 `key` 的前缀。

#### accessKey: String

凭证秘钥。

#### secretKey: String

凭证秘钥。

#### assetsDir: String

本地静态资源目录路径。

#### poolPrefix: String

资源池前缀。

#### computeKey: Function

资源 `key` 的计算方法，传入参数：

  - root - 资源目录的全路径
  - file - 资源的全路径
  - prefix - 前缀

返回值即作为此资源的 `key` 值。默认值为前缀加上资源相对于资源目录的路径。

#### limit: Number

哈希查重的资源数量，默认为无限。

#### retry: Number

操作失败后的重试次数，默认不重试。


## 方法

#### upload

上传资源。

#### clearPool

清空资源池中的内容。

#### clearAssets

清空资源中的内容。注意，若 `prefix` 为空，这个操作会删除 bucket 内所有池外资源。

#### clearAll

清空资源池和资源中的内容。

## 如何工作

### 目的

- 在网站部署时自动完成静态资源的上传。
- 提高上传效率。
- 提高上传的原子性。

### 前提

- 网站部署时，静态资源有巨大变动的几率很小。
- 静态资源数量不会持续增多。
- 七牛没有提供批量上传的接口。
- 复制操作比上传操作更快速更可靠。

### 存储空间结构

```js
bucket: {
  pool: {}, // 以 poolPrefix 开头的资源
  assets: {} // 以 prefix 开头的资源
}
```

### 上传逻辑

通过内容 hash 来判断文件是否已在资源池里，若存在，则直接复制到目标位置，否则上传到资源池后再复制。

### 如何满足目的

因为复制比上传更快速更可靠，并且七牛提供批量复制的接口，所以要满足效率与原子性的要求，就需要尽量减少上传操作数，用批量复制取代。以上上传逻辑所带来的优势是：

- 当有多份内容相同的文件时，只会上传一份。
- 文件粒度的增量上传，只上传修改过的文件。
- 多文件上传过程中失败不会影响到现有内容。

并没有真正实现原子操作，因为复制中途失败不会回滚，只会重试，重试次数由 `retry` 配置决定，但批量复制接口的可靠性一般情况下可以满足原子性要求。

### 建议

最好一个项目对应一个 bucket 。若多个项目使用同一个 bucket ，则需要分别设置 `prefix` 和 `poolPrefix` 以隔离作用域，如果项目间共享了多数的文件，可以尝试使用同一个 `poolPrefix` 。
