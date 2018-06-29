const { API_PROTOCOL, API_HOST, API_PORT, API_TIMEOUT, } = require('../../config')
const { get, } = require('lodash')
const { handlerError, } = require('../../comm')
const { publishAction, } = require('../../comm/gcs.js')
const debug = require('debug')('READR-API:api:middle:emotion')
const express = require('express')
const router = express.Router()
const superagent = require('superagent')

const apiHost = API_PROTOCOL + '://' + API_HOST + ':' + API_PORT

router.get('/resource', (req, res) => { // need redis
  debug('Got a /emotion/resource call.', req.url)
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
})

router.post('/pubsub', (req, res) => {
  const customAttrs = get(req, 'body.customAttrs')
  const dataBuffer = get(req, 'body.dataBuffer')
  debug('emotion pubsub')
  publishAction(dataBuffer, customAttrs)
  .then(result => {
    // need updating redis
    res.status(200).send(result)
  }).catch(error => {
    res.status(500).json(error)
  })
})

module.exports = router
