const { fetchFromRedis, fetchFromRedisCmd, redisFetching, redisWriting, insertIntoRedis, } = require('../redis')
const { mapKeys, get, } = require('lodash')
const { handlerError, pickInsensitiveUserInfo, } = require('../../comm')
const { API_PROTOCOL, API_HOST, API_PORT, API_TIMEOUT, API_DEADLINE, POST_PUBLISH_STATUS, POST_TYPE, COMMENT_PUBLIC_VALID_PATH_PARAM, } = require('../../config')
const { setupClientCache, } = require('../comm')
const { getComment, sendComment, } = require('../comment/comm.js')
const debug = require('debug')('READR-API:api:public')
const debugPost = require('debug')('READR-API:api:public:post')
const express = require('express')
const router = express.Router()
const superagent = require('superagent')
const publicQueryValidation = require('../../services/validate')
const schema = require('./schema')
const pathToRegexp = require('path-to-regexp')
const url = require('url')
const cors = require('./cors')

const apiHost = API_PROTOCOL + '://' + API_HOST + ':' + API_PORT

const latestAmountInRedis = 20


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
  if (res.redis) {
    console.log('fetch data from Redis.', req.url)
    const resData = JSON.parse(res.redis)
    res.json(resData)
  } else {
    const url = req.params.postId
      ? `${apiHost}/post/${req.params.postId}?${get(req.url.split('?'), '1', '')}`
      : `${apiHost}${req.url}`
    debugPost('Going to public post from', url)
    superagent
      .get(url)
      .timeout({
        response: API_TIMEOUT,  // Wait 5 seconds for the server to start sending,
        deadline: API_DEADLINE || 60000, // but allow 1 minute for the file to finish loading.
      })      
      .end((e, r) => {
        if (!e && r) {
          let resData = JSON.parse(r.text)

          /** make sure the post is published when fetching single post */
          const isSinglePostPublished = get(resData, '_items.0.publish_status') === POST_PUBLISH_STATUS.PUBLISHED
          if (req.params.postId && !isSinglePostPublished) {
            resData = { 'Error': 'Post Not Found' }
          }

          if (resData['_items'] && resData.constructor === Object) {
            resData['_items'].forEach(post => { post.author = pickInsensitiveUserInfo(post.author) })
            const dt = JSON.stringify(resData)
            res.dataString = dt
            /**
             * if data not empty, go next to save data to redis
             */
            next()
          }

          res.status(resData['_items'] ? 200 : 404).json(resData)
        } else {
          const err_wrapper = handlerError(e, r)
          res.status(err_wrapper.status).json(err_wrapper.text)
          console.error(`
            Error occurred during fetching public post data from : ${url}
            err_wrapper.status: ${err_wrapper.status}
            err_wrapper.text: ${err_wrapper.text}
            err: ${e}
          `)
        }
      })
  }
}

const getResourceURLValidationResult = (resourceURL) => {
  const resourcePath = url.parse(resourceURL).pathname
  const re = pathToRegexp('/:param/:subParam?')

  if (resourcePath) {
    const resourcePathParams = re.exec(resourcePath)
    const param = get(resourcePathParams, 1)
    if (param) {
      if (COMMENT_PUBLIC_VALID_PATH_PARAM.includes(param)) {
        return { status: 200, message: `Your resource url: '${resourceURL}' is valid, continue fetching comments.` }
      } else {
        return { status: 403, message: `Invalid param: '${param}' of resource path: '${resourcePath}' in resource url: '${resourceURL}'.`, }
      }
    } else {
      return { status: 404, message: `Cannot find param of resource path: '${resourcePath}' in resource url: '${resourceURL}'.`, }
    }
  } else {
    return { status: 404, message: `Cannot find resource path of resource: '${resourcePath}' in resource url: '${resourceURL}'.`, }
  } 
}

const validateResourceURL = (req, res, next) => {
  const getResourceURL = () => {
    const query = url.parse(req.url, true).query
    const parent = get(query, 'parent', '')
    const resource = get(JSON.parse(get(query, 'resource', '[]')), 0, '')
  
    // Determine fetching sub comments or not, if yes, get the subcomments' resource url and validate it.
    const resourceURL = parent === '' ? resource : get(JSON.parse(get(req, [ 'comment', 'r', 'text' ], '')), [ '_items', '0', 'resource', ], '')
    return resourceURL
  }

  const { status, message } = getResourceURLValidationResult(getResourceURL())
  status === 200 ? next() : res.status(status).end(message)
}

router.get('/comment', [ setupClientCache, getComment(apiHost), validateResourceURL, ], sendComment)

router.get('/emotion', publicQueryValidation.validate(schema.emotion), (req, res, next) => {
  debug('Got a /public/emotion call.', req.url)
  const resourceName = req.query.resource
  const ids = req.query.ids.replace(/\[/, '').replace(/\]/, '').split(',')
  const field = ids.map(id => `${resourceName}_${id}`)
  const emotionKey = req.query.emotion === 'like' ? 1 : 2
  req.resourceName = resourceName
  req.ids = ids
  req.redis_get = {
    cmd: 'HMGET',
    key: `followcache_${emotionKey}`,
    field: field,
  }
  next()
}, fetchFromRedisCmd, (req, res) => {
  debug('Stuff from redis:')
  debug(res.redis)
  if (res.redis && res.redis.length > 0) {
    const redisData = res.redis.filter(data => data).map(data => JSON.parse(data))
    const lackIds = res.redis.map((value, index) => {
      if (!value) {
        return req.ids[index]
      }
    }).filter(id => id)
    if (lackIds.length > 0) {
      const url = `${apiHost}/following/resource?ids=[${lackIds.toString()}]&resource=${req.resourceName}&emotion=${req.query.emotion}`
      superagent
      .get(url)
      .timeout(API_TIMEOUT)
      .end((err, response) => {
        if (!err && response) {
          const data = JSON.parse(response.text)
          const lackData = data._items || []
          const completeData = redisData.concat(lackData)
          res.status(200).json({ _items: completeData })
        } else {
          const err_wrapper = handlerError(err, res)
          res.status(err_wrapper.status).send(err_wrapper.text)
          console.error(`Error occurred  during fetch data from : ${url}`)
          console.error(err)
        }
      })
    } else {
      res.status(200).json({ _items: redisData })
    }
  } else {
    debug('Get emotion/resource data from redis faild')
    const url = `${apiHost}/following${req.url}`
    superagent
    .get(url)
    .timeout(API_TIMEOUT)
    .end((err, response) => {
      if (!err && response) {
        res.json(JSON.parse(response.text))
      } else {
        const err_wrapper = handlerError(err, res)
        res.status(err_wrapper.status).send(err_wrapper.text)
        console.error(`Error occurred  during fetch data from : ${url}`)
        console.error(err)
      }
    })
  }
})

router.get('/home/comment', fetchFromRedis, (req, res, next) => {
  /**
   *  - fetching comments for homepage aside
   *  - will call backend api `/comments/latest` 
   *  - `/comments/latest` will return the latest comments that exclude any comment from `memo`
   */

   if (res.redis) {
    debug('fetch comment for home from Redis.', req.url)
    const resData = JSON.parse(res.redis)
    res.json(resData)
  } else {
    const url = `${apiHost}/comments/latest`
    superagent
    .get(url)
    .end((error, response) => {
      if (!error && response) {
        const dt = JSON.parse(response.text)
        if (dt[ '_items' ] !== null && dt.constructor === Object) {
          res.dataString = response.text
          /**
           * if data not empty, go next to save data to redis
           */
          next()
        }
        const resData = JSON.parse(response.text)
        res.json(resData)
      } else {
        const err_wrapper = handlerError(error, response)
        res.status(err_wrapper.status).json(err_wrapper.text)
        console.error(`Error occurred during fetching public data from : ${url}`)
        console.error(error)  
      }
    })
  }
}, insertIntoRedis)

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

router.get('/memo/:id', fetchFromRedis, (req, res, next) => {
  if (res.redis) {
    console.log('fetch public memo from Redis.', req.url)
    const resData = JSON.parse(res.redis)
    res.json(resData)
  } else {
    const url = `${apiHost}${req.url}`
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
          console.error(`Error occurred during fetching public memo from : ${req.url}`)
          console.error(e)  
        }
      })
  }
}, insertIntoRedis)

router.get('/polls', publicQueryValidation.validate(schema.polls), (req, res, next) => {
  req.url = `/v2${req.url}`
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

router.get('/post/:postId', (req, res, next) => {
  req.url = `/public${req.url}`
  debugPost('req.url', req.url)
  next()
}, fetchFromRedis, fetchAndConstructPosts, insertIntoRedis)

router.get('/posts', publicQueryValidation.validate(schema.posts), (req, res, next) => {
  const publishStatusPostQueryString = `{"$in":[${POST_PUBLISH_STATUS.PUBLISHED}]}`
  const whitelist = [
    'author',
    'max_result',
    'page',
    'sort',
    'type',
    'project_id',
    'slug'
  ]

  if (Object.keys(req.query).length === 0) {
    req.url += `?publish_status=${publishStatusPostQueryString}`
  } else {
    req.url = `/posts?publish_status=${publishStatusPostQueryString}`
    whitelist.forEach((key) => {
      if (req.query.hasOwnProperty(key)) {
        req.url += `&${key}=${req.query[key]}`
      }
    })
  }
  next()
}, fetchFromRedis, fetchAndConstructPosts, insertIntoRedis)

router.get('/posts/latest', publicQueryValidation.validate(schema.posts), (req, res, next) => {
  req.redis_get = {
    cmd: 'HGETALL',
    key: 'postcache_latest',
  }
  next()
}, fetchFromRedisCmd, (req, res, next) => {
  debugPost('Stuff from redis:')
  debugPost(res.redis)
  const maxResult = req.query.max_result || latestAmountInRedis
  const page = req.query.page || 1
  const pageCanSlice = Math.floor(latestAmountInRedis / maxResult)
  const publishStatusPostQueryString = `{"$in":[${POST_PUBLISH_STATUS.PUBLISHED}]}`
  if (maxResult <= latestAmountInRedis && page <= pageCanSlice && res.redis && Object.values(res.redis).length > 0) {
    const start = (page - 1) * maxResult
    const end = start + maxResult
    const redisData = Object.values(res.redis)
      .map(data => JSON.parse(data))
      .map(data => {
        data.author = pickInsensitiveUserInfo(data.author)
        data.updated_by = pickInsensitiveUserInfo(data.updated_by)
        return data
      })
    const redisDataSliced = redisData.slice(start, end)
    res.status(200).json({ _items: redisDataSliced })
  } else {
    debugPost('Going To Fetch Data From API.')
    const showAuthor = req.query.show_author || 'true'
    const showUpdater = req.query.show_updater || 'true'
    const showTag = req.query.show_tag || 'true'
    const showComment = req.query.show_comment || 'true'
    const showProject = req.query.show_project || 'true'
    const sort = req.query.sort || '-published_at'
    req.url = 
      `/posts?publish_status=${publishStatusPostQueryString}&` +
      `type={"$in":[${POST_TYPE.REVIEW}, ${POST_TYPE.NEWS}, ${POST_TYPE.REPORT}, ${POST_TYPE.MEMO}]}&` +
      `max_result=${maxResult}&` +
      `page=${page}&` +
      `sort=${sort}&` +
      `show_author=${showAuthor}&` +
      `show_updater=${showUpdater}&` +
      `show_tag=${showTag}&` +
      `show_comment=${showComment}&` +
      `show_project=${showProject}`
    next()
  }
}, fetchFromRedis, fetchAndConstructPosts, insertIntoRedis )

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

router.get('/projects', cors, publicQueryValidation.validate(schema.projects), (req, res, next) => {
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

router.get('/project/contents/:id', publicQueryValidation.validate(schema.projectContents), fetchFromRedis, (req, res, next) => {
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
