const { API_PROTOCOL, API_HOST, API_PORT, API_TIMEOUT, } = require('../../config')
// const { fetchFromRedis, insertIntoRedis, } = require('../redisHandler')
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

router.get('/resource', (req, res) => { // need redis
  debug('Got a /following/resource call.', req.url)
  if (res.redis) {
    const resData = JSON.parse(res.redis)
    res.json(resData)
  } else {
    const url = `${apiHost}/following${req.url}`
    superagent
    .get(url)
    .timeout(API_TIMEOUT)
    .end((err, response) => {
      if (!err && response) {
        const resData = JSON.parse(response.text)
        res.json(resData)
        /**
         * if data not empty, go next to save data to redis
         * ToDo: should add some statements.
         */
        res.dataString = response.text
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
