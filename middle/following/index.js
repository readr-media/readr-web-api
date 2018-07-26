const { API_PROTOCOL, API_HOST, API_PORT, API_TIMEOUT, } = require('../../config')
const { fetchFromRedisCmd, } = require('../redis')
const { get, } = require('lodash')
const { handlerError, } = require('../../comm')
const { publishAction, } = require('../../comm/gcs.js')
const debug = require('debug')('READR-API:api:middle:following')
const express = require('express')
const router = express.Router()
const superagent = require('superagent')

const apiHost = API_PROTOCOL + '://' + API_HOST + ':' + API_PORT

router.get('/user', (req, res) => {
  debug('Got a /following/user call.', req.url)
  const url = `${apiHost}/following${req.url}`
  superagent
  .get(url)
  .timeout(API_TIMEOUT)
  .end((err, response) => {
    if (!err && response) {
      const resData = JSON.parse(response.text)
      res.json(resData)
    } else {
      const err_wrapper = handlerError(err, res)
      res.status(err_wrapper.status).send(err_wrapper.text)
      console.error(`Error occurred  during fetch data from : ${url}`)
      console.error(err)
    }
  })
})

router.get('/resource', (req, res, next) => {
  debug('Got a /following/resource call.', req.url)
  const resourceName = req.query.resource
  const ids = req.query.ids.replace(/\[/, '').replace(/\]/, '').split(',')
  const field = ids.map(id => `${resourceName}_${id}`)
  req.resourceName = resourceName
  req.ids = ids
  req.redis_get = {
    cmd: 'HMGET',
    key: 'followcache_0',
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
      const url = `${apiHost}/following/resource?ids=[${lackIds.toString()}]&resource=${req.resourceName}`
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
    debug('Get following/resource data from redis faild')
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

router.post('/pubsub', (req, res) => {
  const action = get(req, 'body.action', 'follow')
  debug('following pubsub')
  debug('following pubsub')
  debug('following pubsub')
  debug('following pubsub')
  publishAction(req.body, {
    type: 'follow',
    action,
  }).then(result => {
    // need updating redis
    res.status(200).send(result)
  }).catch(error => {
    res.status(500).json(error)
  })
})

module.exports = router
