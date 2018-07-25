const { API_PROTOCOL, API_HOST, API_PORT, API_TIMEOUT, } = require('../../config')
const { fetchFromRedis, insertIntoRedis, } = require('../redis')
const { handlerError, } = require('../../comm')
const debug = require('debug')('READR-API:api:middle:meta')
const express = require('express')
const router = express.Router()
const superagent = require('superagent')

const apiHost = API_PROTOCOL + '://' + API_HOST + ':' + API_PORT

router.get('/', fetchFromRedis, (req, res, next) => {
  debug('Got a /meta call.', req.url)
  const url = `${apiHost}/url/meta${req.url}`
  if (res.redis) {
    console.log('fetch data from Redis.', req.url)
    const resData = JSON.parse(res.redis)
    res.json(resData)
  } else {
    superagent
    .get(url)
    .timeout(API_TIMEOUT)
    .end((err, response) => {
      if (!err && response) {
        const resData = JSON.parse(response.text)
        res.json(resData)
        /**
         * if data not empty, go next to save data to redis
         */
        if (resData['_items'] !== null && resData.constructor === Object) {
          res.dataString = response.text
          /**
           * if data not empty, go next to save data to redis
           */
          next()
        }
      } else {
        const err_wrapper = handlerError(err, res)
        res.status(err_wrapper.status).send(err_wrapper.text)
        console.error(`Error occurred  during fetch data from : ${url}`)
        console.error(err)
      }
    })
  }
}, insertIntoRedis)

module.exports = router