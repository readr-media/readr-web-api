const { fetchFromRedis, redisFetching, redisWriting, insertIntoRedis, } = require('../redis')
const { mapKeys, pick, get, nth, } = require('lodash')
const { handlerError, } = require('../../comm')
const { API_PROTOCOL, API_HOST, API_PORT, API_TIMEOUT, API_DEADLINE, POST_PUBLISH_STATUS, POST_TYPE, COMMENT_PUBLIC_VALID_PATH_PARAM, } = require('../../config')
const { setupClientCache, } = require('../comm')
const { getComment, sendComment, } = require('../comment/comm.js')
const debug = require('debug')('READR-API:api:public')
const express = require('express')
const router = express.Router()
const superagent = require('superagent')
const publicQueryValidation = require('../../services/validate')
const schema = require('./schema')
const qs = require('qs')
const pathToRegexp = require('path-to-regexp')
const url = require('url')

const apiHost = API_PROTOCOL + '://' + API_HOST + ':' + API_PORT

const pickInsensitiveUserInfo = (userData) => {
  return pick(userData, [ 'id', 'nickname', 'description', 'profile_image', ])
}

const fetchAndConstructMembers = (req, res) => {
  const url = `${apiHost}${req.url}`
  redisFetching(`member${req.url}`, ({ error, data, }) => {
    const itemsCheck = (memberObj) => {
      return memberObj['_items'] !== null ? { 'items': memberObj['_items'].map((object) => pickInsensitiveUserInfo(object)), } : {}
    }

    if (!error && data) {
      debug('Fetch public member data from Redis.')
      debug('>>>', req.url)
      const mem = JSON.parse(data)
      const responseSend = itemsCheck(mem)
      res.json(responseSend)
    } else {
      superagent
      .get(url)
      .end((e, response) => {
        debug('Fetch public member data from api.', url)
        if (!e && response) {
          redisWriting(`member${req.url}`, response.text)
          const mem = JSON.parse(response.text)
          const responseSend = itemsCheck(mem)
          res.json(responseSend)
        } else {
          const err_wrapper = handlerError(e, response)
          res.status(err_wrapper.status).send('{\'error\':' + e + '}')
          console.error(`Error occurred when fetching data from: member ${req.url}`)
          console.error(e)
        }
      })
    }
  })  
}

const fetchAndConstructPosts = (req, res, next) => {
  const url = `${apiHost}${req.url}`
  if (res.redis) {
    console.log('fetch data from Redis.', req.url)
    const resData = JSON.parse(res.redis)
    res.json(resData)
  } else {
    superagent
      .get(url)
      .timeout({
        response: API_TIMEOUT,  // Wait 5 seconds for the server to start sending,
        deadline: API_DEADLINE || 60000, // but allow 1 minute for the file to finish loading.
      })      
      .end((e, r) => {
        if (!e && r) {
          const resData = JSON.parse(r.text)

          if (resData['_items'] !== null && resData.constructor === Object) {
            resData['_items'].forEach(post => { post.author = pickInsensitiveUserInfo(post.author) })
            const dt = JSON.stringify(resData)
            res.dataString = dt
            /**
             * if data not empty, go next to save data to redis
             */
            next()
          }

          res.json(resData)
        } else {
          const err_wrapper = handlerError(e, r)
          res.status(err_wrapper.status).json(err_wrapper.text)
          console.error(`Error occurred during fetching public post data from : ${url}`)
          console.error(e)
        }
      })
  }
}

const validateResourceURL = (req, res, next) => {
  const query = qs.parse(req.url)
  const resource = get(query, 'resource', '')
  const resourcePath = url.parse(resource).pathname
  const re = pathToRegexp('/:param/:subParam?')

  if (resourcePath) {
    const resourcePathParams = re.exec(resourcePath)
    const param = nth(resourcePathParams, 1)
    if (param) {
      if (COMMENT_PUBLIC_VALID_PATH_PARAM.includes(param)) {
        next()
      } else {
        res.status(403).end(`Invalid param: '${param}' of resource path: '${resourcePath}' in resource asset url: '${req.url}'`)
      }
    } else {
      res.status(404).end(`Cannot find param of resource path: '${resourcePath}' in resource asset url: '${req.url}'`)
    }
  } else {
    res.status(404).end(`Cannot find resource path of resource: '${resource}' in resource asset url: '${req.url}'`)
  }
}


router.get('/comment', [ validateResourceURL, setupClientCache, getComment(apiHost), ], sendComment)

router.get('/profile/:id', (req, res, next) => {
  const id = req.params.id
  debug('Going to get member profile.', id)
  if (!id) { res.status(403).send(`Forbidden.`) }
  req.url = `/member/${id}`
  next()
}, fetchAndConstructMembers)

router.get('/members', publicQueryValidation.validate(schema.members), fetchAndConstructMembers)

router.get('/memos', publicQueryValidation.validate(schema.memos), (req, res, next) => {
  let url = '/memos?'
  mapKeys(req.query, (value, key) => {
    url = `${url}&${key}=${value}`
  })
  req.url = url
  next()
}, fetchFromRedis, (req, res, next) => {
  const url = `${apiHost}${req.url}`
  if (res.redis) {
    console.log('fetch data from Redis.', req.url)
    const resData = JSON.parse(res.redis)
    res.json(resData)
  } else {
    superagent
      .get(url)
      .timeout(API_TIMEOUT)
      .end((e, r) => {
        if (!e && r) {
          const dt = JSON.parse(r.text)
          if (dt['_items'] !== null && dt.constructor === Object) {
            res.dataString = r.text
            /**
             * if data not empty, go next to save data to redis
             */
            next()
          }
          const resData = JSON.parse(r.text)
          res.json(resData)
        } else {
          const err_wrapper = handlerError(e, r)
          res.status(err_wrapper.status).json(err_wrapper.text)
          console.error(`Error occurred during fetching public data from : ${url}`)
          console.error(e)  
        }
      })
  }
}, insertIntoRedis)

router.get('/post/:postId', fetchFromRedis, fetchAndConstructPosts, insertIntoRedis)

router.get('/posts', publicQueryValidation.validate(schema.posts), (req, res, next) => {
  const publishStatusPostQueryString = `{"$in":[${POST_PUBLISH_STATUS.PUBLISHED}]}`
  const whitelist = [ 'author', 'max_result', 'page', 'sort', 'type', ]
  if (Object.keys(req.query).length === 0) {
    req.url += `?publish_status=${publishStatusPostQueryString}&type={"$in":[${POST_TYPE.REVIEW}, ${POST_TYPE.NEWS}]}`
  } else {
    req.url = `/posts?publish_status=${publishStatusPostQueryString}`
    whitelist.forEach((key) => {
      if (key !== 'type') {
        if (req.query.hasOwnProperty(key)) {
          req.url += `&${key}=${req.query[key]}`
        }
      } else {
        if (req.query.hasOwnProperty(key)) {
          req.url += `&${key}=${req.query[key]}`
        } else {
          req.url += `&type={"$in":[${POST_TYPE.REVIEW}, ${POST_TYPE.NEWS}]}`
        }
      }
    })
  }
  next()
}, fetchFromRedis, fetchAndConstructPosts, insertIntoRedis)

router.get('/posts/hot', (req, res) => {
  const url = `${apiHost}${req.url}`
  superagent
  .get(url)
  .end((e, r) => {
    if (!e && r) {
      res.status(200).json(JSON.parse(r.text))
    } else {
      res.status(500).json(e)
      console.error(`Error occurred during fetching public hot post data from : ${url}`)
      console.error(e)  
    }
  })
})

router.get('/projects', publicQueryValidation.validate(schema.projects), (req, res, next) => {
  let url = '/project/list?'
  mapKeys(req.query, (value, key) => {
    url = `${url}&${key}=${value}`
  })
  req.url = url
  next()
}, fetchFromRedis, (req, res, next) => {
  const url = `${apiHost}${req.url}`
  if (res.redis) {
    console.log('fetch data from Redis.', req.url)
    const resData = JSON.parse(res.redis)
    res.json(resData)
  } else {
    superagent
      .get(url)
      .timeout(API_TIMEOUT)
      .end((e, r) => {
        if (!e && r) {
          const dt = JSON.parse(r.text)
          if (dt['_items'] !== null && dt.constructor === Object) {
            res.dataString = r.text
            /**
             * if data not empty, go next to save data to redis
             */
            next()
          }
          const resData = JSON.parse(r.text)
          res.json(resData)
        } else {
          const err_wrapper = handlerError(e, r)
          res.status(err_wrapper.status).json(err_wrapper.text)
          console.error(`Error occurred during fetching public data from : ${url}`)
          console.error(e)  
        }
      })
  }
}, insertIntoRedis)

router.get('/reports', publicQueryValidation.validate(schema.reports), (req, res, next) => {
  let url = '/report/list?'
  mapKeys(req.query, (value, key) => {
    url = `${url}&${key}=${value}`
  })
  req.url = url
  next()
}, fetchFromRedis, (req, res, next) => {
  const url = `${apiHost}${req.url}`
  if (res.redis) {
    console.log('fetch data from Redis.', req.url)
    const resData = JSON.parse(res.redis)
    res.json(resData)
  } else {
    superagent
      .get(url)
      .timeout(API_TIMEOUT)
      .end((e, r) => {
        if (!e && r) {
          const dt = JSON.parse(r.text)
          if (dt['_items'] !== null && dt.constructor === Object) {
            res.dataString = r.text
            /**
             * if data not empty, go next to save data to redis
             */
            next()
          }
          const resData = JSON.parse(r.text)
          res.json(resData)
        } else {
          const err_wrapper = handlerError(e, r)
          res.status(err_wrapper.status).json(err_wrapper.text)
          console.error(`Error occurred during fetching public data from : ${url}`)
          console.error(e)  
        }
      })
  }
}, insertIntoRedis)

router.get('/videos', publicQueryValidation.validate(schema.videos), (req, res, next) => {
  let url = `/posts?publish_status={"$in":[${POST_PUBLISH_STATUS.PUBLISHED}]}&type={"$in":[${POST_TYPE.VIDEO}, ${POST_TYPE.LIVE}]}`
  mapKeys(req.query, (value, key) => {
    url = `${url}&${key}=${value}`
  })
  req.url = url
  next()
}, fetchFromRedis, (req, res, next) => {
  const url = `${apiHost}${req.url}`
  if (res.redis) {
    console.log('fetch data from Redis.', req.url)
    const resData = JSON.parse(res.redis)
    res.json(resData)
  } else {
    superagent
      .get(url)
      .timeout(API_TIMEOUT)
      .end((e, r) => {
        if (!e && r) {
          const dt = JSON.parse(r.text)
          if (dt['_items'] !== null && dt.constructor === Object) {
            res.dataString = r.text
            /**
             * if data not empty, go next to save data to redis
             */
            next()
          }
          const resData = JSON.parse(r.text)
          res.json(resData)
        } else {
          const err_wrapper = handlerError(e, r)
          res.status(err_wrapper.status).json(err_wrapper.text)          
          console.error(`Error occurred during fetching public data from : ${url}`)
          console.error(e)  
        }
      })
  }
}, insertIntoRedis)

router.get('/videos/count', (req, res, next) => {
  const url = `/posts/count?publish_status={"$in":[${POST_PUBLISH_STATUS.PUBLISHED}]}&type={"$in":[${POST_TYPE.VIDEO}, ${POST_TYPE.LIVE}]}`
  req.url = url
  next()
}, fetchFromRedis, (req, res, next) => {
  const url = `${apiHost}${req.url}`
  if (res.redis) {
    console.log('fetch data from Redis.', req.url)
    const resData = JSON.parse(res.redis)
    res.json(resData)
  } else {
    superagent
      .get(url)
      .timeout(API_TIMEOUT)
      .end((e, r) => {
        if (!e && r) {
          const dt = JSON.parse(r.text)
          if (dt['_items'] !== null && dt.constructor === Object) {
            res.dataString = r.text
            /**
             * if data not empty, go next to save data to redis
             */
            next()
          }
          const resData = JSON.parse(r.text)
          res.json(resData)
        } else {
          const err_wrapper = handlerError(e, r)
          res.status(err_wrapper.status).json(err_wrapper.text)    
          console.error(`Error occurred during fetching public data from : ${url}`)
          console.error(e)  
        }
      })
  }
}, insertIntoRedis)

module.exports = router
