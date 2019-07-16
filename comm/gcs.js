const debug = require('debug')('READR-API:gcs')
const { GCP_KEYFILE, GCP_PROJECT_ID, GCP_PUBSUB_TOPIC_NAME, } = require('../config')
const { PubSub } = require('@google-cloud/pubsub')
const { Storage } = require('@google-cloud/storage')

const initBucket = (bucket) => {
  const storage = new Storage({
    projectId: GCP_PROJECT_ID,
    keyFilename: GCP_KEYFILE,
  })
	return storage.bucket(bucket);
}

const makeFilePublic = async (bucketFile) => {
  await bucketFile.makePublic()
}

const uploadFileToBucket = async (bucket, filePath, options = {}) => {
  const opts = options
  if (opts.filetype) {
    opts.metadata.contentType = opts.filetype
  }
  if (opts.cacheControl) {
    opts.metadata.cacheControl = opts.cacheControl
  }
  await bucket.upload(filePath, opts)
  console.log(`${filePath} uploaded.`)
  return bucket.file(opts.destination)
}

const deleteFilesInFolder = async (bucket, options) => {
  const opts = options || {}
  await bucket.deleteFiles({
    prefix: opts.folder,
    force: true
  })
}

const publishAction = (data, action_attr, topicName = GCP_PUBSUB_TOPIC_NAME) => {
  // process.env['GOOGLE_APPLICATION_CREDENTIALS'] = GCP_KEYFILE
  // debug('GCP_KEYFILE', GCP_KEYFILE)
  // debug(`process.env['GOOGLE_APPLICATION_CREDENTIALS']`, process.env['GOOGLE_APPLICATION_CREDENTIALS'])
  const pubsub = new PubSub({ projectId: GCP_PROJECT_ID, keyFilename: GCP_KEYFILE, })
  const topic = pubsub.topic(topicName)

  const customAttrs = action_attr
  const dataBuffer = Buffer.from(JSON.stringify(data))

  debug('action_attr:')
  debug(action_attr)
  debug('data:')
  debug(data)

  return new Promise((resolve, reject) => {
    topic.publish(dataBuffer, customAttrs)
    .then((results) => {
      console.warn(`Message ${results} published.`)
      resolve(results)
    })
    .catch((error) => {
      console.error('Error occurred during publishing a pubsub req.')
      console.error(error)
      reject(error)
    })
  })
}

module.exports = {
  initBucket,
	makeFilePublic,
  uploadFileToBucket,
  deleteFilesInFolder,
  publishAction,
}