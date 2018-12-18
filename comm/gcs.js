const PubSub = require('@google-cloud/pubsub')
const debug = require('debug')('READR-API:gcs')
const storage = require('@google-cloud/storage')
const { GCP_KEYFILE, GCP_PROJECT_ID, GCP_PUBSUB_TOPIC_NAME, } = require('../config')

const initBucket = (bucket) => {
  const gcs = storage({
    projectId: GCP_PROJECT_ID,
    keyFilename: GCP_KEYFILE,
  })
	return gcs.bucket(bucket);
}

const getFileMd5Hash = (bucketFile) => {
  return new Promise((resolve, reject) => {
    bucketFile.getMetadata().then(results => {
      const metadata = results[0]
      resolve(metadata.md5Hash)
    }).catch(err => {
      reject(err)
    })
  })
}

const renameFile = (bucket, srcFilename, destFilename) => {
  return new Promise((resolve, reject) => {
    bucket.file(srcFilename)
    .move(bucket.file(destFilename))
    .then(() => {
      resolve(bucket.file(destFilename))
    })
    .catch(err => {
      reject(err)
    })
  })
}

const makeFilePublic = (bucketFile) => {
	return new Promise((resolve, reject) => {
		bucketFile.makePublic()
		.then(() => { resolve(bucketFile) })
		.catch(err => { reject(err) })
	})
}

const uploadFileToBucket = (bucket, filePath, options) => {
  return new Promise((resolve, reject) => {
		const opts = options || {}
		const bucketFile = bucket.file(opts.destination)
		const metadata = {}
		
    if (opts.filetype) {
      metadata.contentType = opts.filetype
    }
       
    if (opts.cacheControl) {
        metadata.cacheControl = opts.cacheControl
    }

		bucket.upload(filePath, options)
		.then(() => { resolve(bucketFile) })
		.catch(err => { reject(err) })
	})
}

const deleteFileFromBucket = (bucket, options) => {
  return new Promise((resolve, reject) => {
    const opts = options || {}
		const bucketFile = bucket.file(opts.destination)
		
		bucketFile.delete()
		.then(() => { resolve(bucketFile) })
		.catch(err => { reject(err) })
	})
}

const deleteFilesInFolder = (bucket, options) => {
  return new Promise((resolve, reject) => {
    const opts = options || {}
    bucket.deleteFiles({
      prefix: opts.folder,
      force: true,
    })
		.then(() => { resolve() })
		.catch(err => { reject(err) })
  })
}

const publishAction = (data, action_attr, topicName = GCP_PUBSUB_TOPIC_NAME) => {
  // process.env['GOOGLE_APPLICATION_CREDENTIALS'] = GCP_KEYFILE
  // debug('GCP_KEYFILE', GCP_KEYFILE)
  // debug(`process.env['GOOGLE_APPLICATION_CREDENTIALS']`, process.env['GOOGLE_APPLICATION_CREDENTIALS'])
  const pubsubClient = PubSub({ projectId: GCP_PROJECT_ID, keyFilename: GCP_KEYFILE, })
  const topic = pubsubClient.topic(topicName)
  const publisher = topic.publisher()

  const customAttrs = action_attr
  const dataBuffer = Buffer.from(JSON.stringify(data))

  debug('action_attr:')
  debug(action_attr)
  debug('data:')
  debug(data)

  return new Promise((resolve, reject) => {
    publisher.publish(dataBuffer, customAttrs)
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
  getFileMd5Hash,
  renameFile,
	makeFilePublic,
  uploadFileToBucket,
  deleteFileFromBucket,
  deleteFilesInFolder,
  publishAction,
}