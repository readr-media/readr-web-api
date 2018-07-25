const bodyParser = require('body-parser')
const config = require('./config')
const debug = require('debug')('READR-API:index')
const dotenv = require('dotenv')
const express = require('express')
const fs = require('fs')
const jwtExpress = require('express-jwt')
const path = require('path')
const superagent = require('superagent')
const { camelizeKeys, } = require('humps')
const { authorize, constructScope, fetchPermissions, } = require('./services/perm')
const { fetchFromRedis, insertIntoRedis, redisFetching, } = require('./middle/redis')
const { handlerError, } = require('./comm')
const { initBucket, makeFilePublic, uploadFileToBucket, deleteFilesInFolder, } = require('./comm/gcs.js')
const { processImage, } = require('./comm/sharp.js')
const { setupClientCache } = require('./middle/comm')
const { verifyToken, } = require('./middle/member/comm')

/**
 * For uploading pic to gcs.
 */
const multer  = require('multer')
const upload = multer({ dest: 'tmp/', })

const apiHost = config.API_PROTOCOL + '://' + config.API_HOST + ':' + config.API_PORT
const router = express.Router()

// parse application/x-www-form-urlencoded
router.use(bodyParser.urlencoded({ extended: false, }))
// parse application/json
router.use(bodyParser.json())

const authVerify = jwtExpress({
  secret: config.JWT_SECRET,
  isRevoked: (req, payload, done) => {
    const token = req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer' && req.headers.authorization.split(' ')[1]
    redisFetching(token, ({ error, data, }) => {
      error && console.error('Error occurred during fetching token from redis.')
      error && console.error(error)
      done(null, !!data)
    })
  },
})

const basicGetRequst = (url, req, res, cb) => {
  superagent
  .get(url)
  .end((err, response) => {
    cb && cb(err, response)
  })
}

const basicPostRequst = (url, req, res, cb) => {
  superagent
  .post(url)
  .send(req.body)
  .end((err, response) => {
    cb && cb(err, response)
  })
}

const basicPutRequst = (url, req, res, cb) => {
  superagent
  .put(url)
  .send(req.body)
  .end((err, response) => {
    cb && cb(err, response)
  })
}

const basicDeleteRequst = (url, req, res, cb) => {
  superagent
  .delete(url)
  .send(req.body)
  .end((err, response) => {
    cb && cb(err, response)
  })
}

const fetchPromise = (url) => {
  return new Promise((resolve, reject) => {
    superagent
    .get(`${apiHost}${url}`)
    .end((err, res) => {
      if (!err && res) {
        resolve(camelizeKeys(res.body))
      } else {
        reject(err)
        console.error(`Error occurred when fetching data from : ${url}`)
        console.error(err) 
      }
    })
  })
}

router.use('/activate', verifyToken, require('./middle/member/activation'))
router.use('/comment', [ authVerify, authorize, ], require('./middle/comment'))
router.use('/emotion', [ authVerify, authorize, ], require('./middle/emotion'))
router.use('/following', [ authVerify, authorize, ], require('./middle/following'))
router.use('/initmember', authVerify, require('./middle/member/initMember'))
router.use('/invitation', authVerify, require('./middle/member/invitation'))
router.use('/member/notification', authVerify, require('./middle/member/notification'))
router.use('/memos', [ authVerify, authorize, setupClientCache, ], require('./middle/memo'))
router.use('/memo', [ authVerify, authorize, setupClientCache, ], require('./middle/memo'))
router.use('/member', [ authVerify, authorize, ], require('./middle/member'))
router.use('/meta', [ authVerify, authorize, ], require('./middle/meta'))
router.use('/register', authVerify, require('./middle/member/register'))
router.use('/recoverpwd', require('./middle/member/recover'))
router.use('/points', [ authVerify, authorize, ], require('./middle/points'))
router.use('/public', require('./middle/public'))
router.use('/search', require('./middle/search'))
router.use('/token', require('./middle/services/token'))
router.use('/trace', (req, res, next) => {
  debug('trace', req.url)
  if  (config.GCP_PROJECT_ID && config.GCP_KEYFILE && config.GCP_STACKDRIVER_LOG_NAME) {
    next()
  } else {
    /**
     * have to setup config GCP_PROJECT_ID, GCP_KEYFILE and GCP_STACKDRIVER_LOG_NAME to activate tracing.
     */
    res.status(404).send('Not found.').end()
  }
}, require('./middle/gcLogger'))


/**
 * 
 * METHOD ALL
 * 
 */

router.all('/members', [ authVerify, authorize, ], function(req, res, next) {
  debug('Got a /members request.')
  debug('User payload:')
  debug(req.user)
  next()
})
router.all('/post', [ authVerify, authorize, ], function(req, res, next) {
  next()
})
router.all('/posts', [ authVerify, authorize, ], function(req, res, next) {
  next()
})
router.all('/tags', [ authVerify, authorize, ], function(req, res, next) {
  next()
})

/**
 * 
 * METHOD GET
 * 
 */

router.get('/posts', authVerify, (req, res) => {
  if (req.user.role !== config.ROLE_MAP.ADMIN && req.user.role !== config.ROLE_MAP.EDITOR) {
    if (!req.query.author) {
      return res.status(403).send('Forbidden. No right to access.').end()
    } else {
      const author = _.get(JSON.parse(req.query.author), [ '$in', 0, ])
      if (author !== req.user.id) {
        return res.status(403).send('Forbidden. No right to access.').end()
      }
    }
  }
  const url = `${apiHost}${req.url}`
  basicGetRequst(url, req, res, (err, resp) => {
    if (!err && resp) {
      const resData = JSON.parse(resp.text)
      return res.json(resData)
    } else {
      const err_wrapper = handlerError(err, resp)
      if (err_wrapper.status == 404) {
        res.status(200).json([])
      } else {
        res.status(err_wrapper.status).json(err_wrapper.text)      
        console.error(`Error occurred during fetch posts data from : ${req.url}`)
        console.error(err)      
      }
    }
  })
})

router.get('/profile', [ authVerify, setupClientCache, ], (req, res) => {
  debug('req.user')
  debug(req.user)
  const targetProfile = req.user.id
  const roleSetInToken = req.user.role

  /**
   * 'cause there's some logged-user's cookie token constructed with id which is in old type,
   * we have to redirect them to login again.
   */
  if (typeof(targetProfile) === 'string') {
    res.status(401).json({ message: 'Should Authorized Again.', })
    return
  }

  const url = `/member/${targetProfile}`
  Promise.all([
    fetchPromise(url, req),
    fetchPermissions(),
  ]).then((response) => {
    const profile = response[ 0 ][ 'items' ][ 0 ]
    const perms = response[ 1 ]
    const scopes = constructScope(perms, profile.role)

    if (roleSetInToken !== profile.role) {
      /**
       * This statement means this user's role has been changed. At this moment, we need to force user to login again.
       */
      res.status(401).json({ message: 'Should Authorized Again.', })
      return
    }

    res.json({
      name: profile.name,
      nickname: profile.nickname,
      mail: profile.mail,
      description: profile.description,
      id: profile.id,
      uuid: profile.uuid,
      role: profile.role,
      scopes,
      profileImage: profile.profileImage,
      points: profile.points,
    })
  }).catch((err) => {
    res.status(500).send(err)
    console.error(`Error occurred when fetching data from : ${url}`)
    console.error(err)
  })
})

router.get('/status', [ authVerify, setupClientCache, ], function(req, res) {
  res.status(200).send(true)
})

/**
 * 
 * METHOD POST
 * 
 */

router.post('/verify-recaptcha-token', (req, res) => {
  let url = 'https://www.google.com/recaptcha/api/siteverify'
  superagent
  .post(url)
  .set('Content-Type', 'application/x-www-form-urlencoded; charset=utf-8')
  .send({
    secret: config.GOOGLE_RECAPTCHA_SECRET,
    response: req.body.token,
  })
  .end((err, response) => {
    if (err) {
      res.status(400).send(err)
    } else {
      res.send(response.body)
    }
  })
})

router.post('/login', authVerify, require('./middle/member/login'))

router.post('/post', authVerify, (req, res) => {
  if (req.body.publish_status === config.POST_PUBLISH_STATUS.PUBLISHED && req.user.role !== config.ROLE_MAP.ADMIN && req.user.role !== config.ROLE_MAP.EDITOR) {
    return res.status(403).send('Forbidden. No right to access.').end()
  }
  if ((req.body.og_description || req.body.og_image || req.body.og_title || req.body.published_at) && req.user.role !== config.ROLE_MAP.ADMIN && req.user.role !== config.ROLE_MAP.EDITOR) {
    return res.status(403).send('Forbidden. No right to access.').end()
  }
  if (req.body.author !== req.user.id) {
    req.body.author = req.user.id
  }
  const url = `${apiHost}${req.url}`
  basicPostRequst(url, req, res, (err, resp) => {
    if (!err && resp) {
      return res.status(200).end()
    } else {
      return res.status(400).json(_.get(err, [ 'response', 'body', ], { Error: 'Error occured.', }))
    }
  })
})

router.post('/image/:sourceType', authVerify, upload.single('image'), (req, res) => {
  const url = `${apiHost}${req.url}`
  const bucket = initBucket(config.GCP_FILE_BUCKET)
  const file = req.file
  const destination = req.params.sourceType === 'member' ? `${config.GCS_IMG_MEMBER_PATH}/${file.originalname}` : config.GCS_IMG_POST_PATH
  
  processImage(file, req.params.sourceType)
    .then((images) => {
      const origImg = _.trim(images[0], 'tmp/')
      Promise.all(images.map((path) => {
        const fileName = _.trim(path, 'tmp/')
        return uploadFileToBucket(bucket, path, {
          destination: `${destination}/${fileName}`,
          metadata: {
            contentType: file.mimetype,
          },
        }).then((bucketFile) => {
          console.info(`file ${fileName}(${path}) completed uploading to bucket `)
          fs.unlink(path, (err) => {
            if (err) {
              console.error(`Error: delete ${path} fail`)
            }
            console.info(`successfully deleted ${path}`)
          })
          makeFilePublic(bucketFile)
        })
      }))
      .then(() => {
        debug(`${destination}/${origImg}`)
        res.status(200).send({url: `${destination}/${origImg}`,})
      })
    })
    .catch((err) => {
      res.status(500).send(err)
      console.error(`error during fetch data from : ${url}`)
      console.error(err)
    })
})

router.post('/deleteMemberProfileThumbnails', authVerify, (req, res) => {
  const bucket = initBucket(config.GCP_FILE_BUCKET)
  const id = req.body.id
  const gcsImgPathTrim = config.GCS_IMG_MEMBER_PATH.replace('/', '')
  deleteFilesInFolder(bucket, {
    folder: `${gcsImgPathTrim}/${id}`,
  }).then(() => {
    res.status(200).send(`Files in folder ${id} completely delete from /assets/images/members/ in bucket`)
  })
  .catch(() => {
    res.status(400).send('Delete Fail').end()
  })
})

/**
 * 
 * METHOD PUT
 * 
 */

router.put('/post', authVerify, (req, res) => {
  if (!req.body.author) {
    return res.status(403).send('Forbidden. No right to access.').end()
  }
  if (req.body.author !== req.user.id && req.user.role !== config.ROLE_MAP.ADMIN && req.user.role !== config.ROLE_MAP.EDITOR) {
    return res.status(403).send('Forbidden. No right to access.').end()
  }
  const url = `${apiHost}${req.url}`
  basicPutRequst(url, req, res, (err, resp) => {
    if (!err && resp) {
      return res.status(200).end()
    } else {
      return res.status(500).json(err)
    }
  })
})

/**
 * 
 * METHOD DELETE
 * 
 */

router.delete('/post-self/:id', authVerify, (req, res) => {
  const url = `${apiHost}/post/${req.params.id}`
  basicDeleteRequst(url, req, res, (err, resp) => {
    if (!err && resp) {
      return res.status(200).end()
    } else {
      return res.status(500).json(err)
    }
  })
})

/**
 * 
 * ERROR HANDLER
 * 
 */


router.route('*')
  .get(fetchFromRedis, function (req, res, next) {
    const url = `${apiHost}${req.url}`
    if (res.redis) {
      console.error('fetch data from Redis.', req.url)
      const resData = JSON.parse(res.redis)
      res.json(resData)
    } else {
      superagent
        .get(url)
        .timeout(
          {
            response: config.API_TIMEOUT,  // Wait 5 seconds for the server to start sending,
            deadline: config.API_DEADLINE || 60000, // but allow 1 minute for the file to finish loading.
          }
        )
        .end((e, r) => {
          if (!e && r) {
            const dt = JSON.parse(r.text)
            if (Object.keys(dt).length !== 0 && dt.constructor === Object) {
              res.dataString = r.text
              /**
               * if data not empty, go next to save data to redis
               * if endpoint is not /members, go next to save data to redis
               */
              if (req.url.indexOf('/members') === -1
                && req.url.indexOf('/points') === -1
                && req.url.indexOf('/post') === -1
                && req.url.indexOf('/posts') === -1
                && req.url.indexOf('/tags') === -1
                && req.url.indexOf('/following/byuser') === -1) {
                next()
              }
            }
            const resData = JSON.parse(r.text)
            res.json(resData)
          } else {
            const err_wrapper = handlerError(e, r)
            res.status(err_wrapper.status).json(err_wrapper.text)
            console.error(`error during fetch data from : ${url}`)
            console.error(e)  
          }
        })
      }
  }, insertIntoRedis)
  .post(authVerify, (req, res) => {
    const url = `${apiHost}${req.url}`
     superagent
    .post(url)
    .send(req.body)
    .end((err, response) => {
      if (!err && response) {
        const resData = JSON.parse(response.text)
        res.status(200).json(resData).end()
      } else {
        const err_wrapper = handlerError(err, response)
        res.status(err_wrapper.status).json(err_wrapper.text)      
        console.error(`Error occurred when handling a post req: ${req.url}`)
        console.error(err)        
      }
    })
  })
  .put(authVerify, function (req, res) {
    const url = `${apiHost}${req.url}`
    debug('Got a put req', req.url)
    superagent
    .put(url)
    .send(req.body)
    .end((err, response) => {
      if (!err && response) {
        res.status(200).end()
      } else {
        res.status(500).json(err)
      }
    })
  })
  .delete(authVerify, function (req, res) {
    const url = `${apiHost}${req.url}`
    // const params = req.body || {}
    superagent
    .delete(url)
    .end((err, response) => {
      if (!err && response) {
        res.status(200).end()
      } else {
        console.error('Error occurred when deleting stuff', err)
        res.status(500).json(err)
      }
    })
  })

router.use(function (err, req, res, next) {
  if (err.name === 'UnauthorizedError' && req.url.indexOf('/status') === -1) {
    res.status(401).send('invalid token...')
  } else if (err && req.url.indexOf('/status') > -1) {
    if (err.name === 'UnauthorizedError') {
      res.status(200).send(false)
    } else {
      console.error('Error occurred when checking login status', err)
    }
  }
  next()
})

module.exports = router