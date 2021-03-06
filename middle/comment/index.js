const { get, } = require('lodash')
const { handlerError, } = require('../../comm')
const { publishAction, } = require('../../comm/gcs.js')
const { setupClientCache, } = require('../comm')
const { getComment, getCommentFromApi, sendComment, } = require('./comm.js')
const { checkPerm, } = require('../memo/qulification')
const config = require('../../config')
const debug = require('debug')('READR-API:api:comment')
const express = require('express')
const superagent = require('superagent')
const router = express.Router()

const apiHost = config.API_PROTOCOL + '://' + config.API_HOST + ':' + config.API_PORT

const getCommentSingle = (req, res, next) => {
  debug('Going to fetch this comment first.', req.body.id)
  const url = `${apiHost}/comment/${req.body.id}`
  superagent
  .get(url)
  .timeout(config.API_TIMEOUT)
  .end((e, r) => {
    req.comment = { e, r, }
    next()
  })
}
const goUpdateRedis = req => {
  setTimeout(() => {
    const url = `${apiHost}/comment${req.url}`
    getCommentFromApi(url).then(() => {
      debug('Setupped comment to Redis successfuly!!')
      debug(`> ${url}`)
    })
  }, 1000)
}

// router.get('/count', fetchFromRedis, (req, res, next) => {
//   res.header("Cache-Control", "public, max-age=3600")
//   if (res.redis) {
//     console.error('fetch data from Redis.', req.url)
//     const resData = JSON.parse(res.redis)
//     res.json(resData)
//   } else {
//     const paramsStr = req.url.split('?')[1]
//     const params = paramsStr ? paramsStr.split('&') : []
//     let asset_url = find(params, (p) => (p.indexOf('asset_url') > -1))
//     asset_url = asset_url ? asset_url.split('=')[ 1 ] : ''
//     debug('About to fetch comment count of asset_url')
//     debug('paramsStr', paramsStr)
//     debug('params', params)
//     debug('asset_url', asset_url)
//     debug('url', `${config.TALK_SERVER}/api/v1/graph/ql/graphql?query={commentCount(query:{asset_url:"${asset_url}"})}`)
  
//     const client = new GraphQLClient(`${config.TALK_SERVER}/api/v1/graph/ql`, { headers: {}, })
//     const query = `query { count: commentCount(query:{ asset_url:"${asset_url}" })}`
//     client.request(query).then(data => {
//       debug(data)

//       if (data['count'] !== undefined && data.constructor === Object) {
//         const dt = JSON.stringify(data)
//         res.dataString = dt
//         /**
//          * if data not empty, go next to save data to redis
//          */
//         next()
//       }

//       res.send(data)
//     }).catch(err => {
//       debug('err', err)
//       const err_wrapper = handlerError(err)
//       res.status(err_wrapper.status).json(err_wrapper.text)
//     })
//   }
// }, insertIntoRedis)

router.get('/', setupClientCache, (req, res, next) => {
  /**
   * Going to check if the resource is type of "memo"
   */
  const resource = get(req, 'query.resource')
  const exp = /(?:\/series\/([A-Za-z0-9.\-_]*)\/([0-9]+))/
  const checkedResource = resource && resource.match(exp)

  if (checkedResource) {
    /**
     * The resource is "memo", so we're gonna check the permission of read.
     */
    const member = get(req, 'user.id')
    const proj = get(req, 'query.resource_id')
    const proj_numberized = !isNaN(proj)
      ? typeof(proj) === 'number'
      ? proj
      : Number(get(req, 'query.resource_id'))
      : false
    debug('Got you! memo comment!', member, proj_numberized)
    if (proj_numberized) {
      checkPerm(member, [ proj_numberized, ])
        .then(isAnyUnauthorized => {
          debug('Permission:', `${proj_numberized}-${isAnyUnauthorized}`)
          if (isAnyUnauthorized) {
            next()
          } else {
            res.status(403).send('No permission to fetch comment.')
          }
        })
        .catch(err => {
          const err_wrapper = handlerError(err)
          res.status(err_wrapper.status).json(err_wrapper.text)      
          console.error(`Error occurred during fetching comment: ${proj_numberized}(project)-${member}(member)`)
          console.error(err)            
        })
    } else {
      res.status(400).send('Bad Request.')
    }
  } else {
    next()
  }
}, [ getComment(`${apiHost}/comment`), sendComment, ])

router.delete('/', (req, res, next) => {
  req.body.id = req.body.ids[ 0 ]
  next()
}, getCommentSingle, (req, res, next) => {
  debug('Got a comment del call!', req.url)
  debug(req.params)
  debug(req.body)

  const { e, r, } = req.comment
  if (!e) {
    const author = get(r, 'body._items.author')
    const userId = get(req, 'user.id')
    const userRole = get(req, 'user.role')
    debug('author', author)
    debug('user', userId)
    if (userId !== author && config.ROLE_MAP.ADMIN !== userRole) { return res.status(403).send(`Forbidden.`) }

    delete req.body.id
    publishAction(req.body, {
      type: 'comment',
      action: 'delete',
    }).then(result => {
      debug('result:')
      debug(result)
      res.send({ status: 200, text: 'deleting a comment successfully.', })
      next()
    }).catch(error => {
      const err_wrapper = handlerError(error)
      res.status(err_wrapper.status).json(err_wrapper.text)      
      console.error(`Error occurred during deleting comment: ${req.body.id}`)
      console.error(error)    
    })
  } else {
    const err_wrapper = handlerError(e, r)
    res.status(err_wrapper.status).json(err_wrapper.text)      
    console.error(`Error occurred during Updating comment: ${req.body.ids}`)
    console.error(e)   
  }
  
}, goUpdateRedis)

router.post('/', (req, res, next) => {
  debug('Got a comment post call!', req.url)
  debug(req.body)
  const author = req.user.id
  const payload = Object.assign({}, req.body, {
    author,
    status: 1,
    active: 1,
  })
  const url = `${apiHost}/comment`
  publishAction(payload, {
    type: 'comment',
    action: 'post',
  }).then(result => {
    debug('result:')
    debug(result)
    res.send({ status: 200, text: 'Adding a new comment successfully.', })
    /**
     * Go next to update comment data in Redis.
     */
    next()
  }).catch(error => {
    const err_wrapper = handlerError(error)
    res.status(err_wrapper.status).json(err_wrapper.text)      
    console.error(`Error occurred during adding comment: ${url}`)
    console.error(error)    
  })
}, goUpdateRedis)

router.post('/report', (req, res) => {
  debug('Got a comment report post call!', req.url)
  debug(req.body)
  const reporter = req.user.id
  const payload = Object.assign({}, req.body, {
    reporter,
  })
  const url = `${apiHost}/reported_comment`
  superagent
  .post(url)
  .send(payload)
  .timeout(config.API_TIMEOUT)
  .end((e, r) => {
    if (!e && r) {
      res.send({ status: 200, text: 'Adding a new comment report successfully.', })
    } else {
      const err_wrapper = handlerError(e, r)
      res.status(err_wrapper.status).json(err_wrapper.text)      
      console.error(`Error occurred during adding comment report: ${url}`)
      console.error(e)
    }
  })  
})

router.put('/', getCommentSingle, (req, res, next) => {
  debug('Got a comment put call!', req.url)
  debug(req.body)

  const { e, r, } = req.comment
  if (!e) {
    const author = get(r, 'body._items.author')
    const userId = get(req, 'user.id')
    const userRole = get(req, 'user.role')
    debug('author', author)
    debug('user', userId)
    if (userId !== author && config.ROLE_MAP.ADMIN !== userRole) { return res.status(403).send(`Forbidden.`) }

    const url = `${apiHost}/comment`
    publishAction(req.body, {
      type: 'comment',
      action: 'put',
    }).then(result => {
      debug('result:')
      debug(result)
      res.send({ status: 200, text: 'Updating a comment successfully.', })
      next()
    }).catch(error => {
      const err_wrapper = handlerError(error)
      res.status(err_wrapper.status).json(err_wrapper.text)      
      console.error(`Error occurred during Updating comment: ${url}`)
      console.error(error)    
    })
  } else {
    const err_wrapper = handlerError(e, r)
    res.status(err_wrapper.status).json(err_wrapper.text)      
    console.error(`Error occurred during Updating comment: ${req.body.id}`)
    console.error(e)      
  }
}, goUpdateRedis)

router.put('/hide', (req, res, next) => {
  debug('Got a comment hide call!', req.url)
  debug(req.body)
  const userRole = get(req, 'user.role')

  debug('userRole', userRole)
  if (config.ROLE_MAP.ADMIN !== userRole) { return res.status(403).send(`Forbidden.`) }

  const payload = Object.assign({}, req.body, {
    status: 0,
  })
  publishAction(payload, {
    type: 'comment',
    action: 'putstatus',
  }).then(result => {
    debug('result:')
    debug(result)
    res.send({ status: 200, text: 'hidding a comment successfully.', })
    next()
  }).catch(error => {
    const err_wrapper = handlerError(error)
    res.status(err_wrapper.status).json(err_wrapper.text)      
    console.error(`Error occurred during hidding comment: ${payload}`)
    console.error(error)    
  })
}, goUpdateRedis)

module.exports = router
