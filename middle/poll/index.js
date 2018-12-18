const { API_PROTOCOL, API_HOST, API_PORT, API_TIMEOUT, GCP_PUBSUB_POLL_TOPIC_NAME, } = require('../../config')
const { handlerError, } = require('../../comm')
const { publishAction, } = require('../../comm/gcs.js')
const debug = require('debug')('READR-API:api:middle:poll')
const express = require('express')
const router = express.Router()
const superagent = require('superagent')

const apiHost = API_PROTOCOL + '://' + API_HOST + ':' + API_PORT

router.get('/list/picks', (req, res) => {
  const url = `${apiHost}/v2/polls${req.url}`
  superagent
  .get(url)
  .timeout(API_TIMEOUT)
  .end((e, r) => {
    if (!e && r) {
      const resData = JSON.parse(r.text)
      res.json(resData)
    } else {
      const err_wrapper = handlerError(e, r)
      res.status(err_wrapper.status).json(err_wrapper.text)      
      console.error(`Error occurred when fecthing public post data from : ${url}`)
      console.error(e)
    }
  })
})

router.post('/', (req, res) => {
  debug('poll POST')
  const dataBuffer = req.body
  if (!dataBuffer) { return res.status(400).json({ Error: 'Bad Request' }) }
  
  publishAction(dataBuffer, { action: 'insert' }, GCP_PUBSUB_POLL_TOPIC_NAME)
  .then(result => {
    res.status(200).send(result)
  }).catch(error => {
    res.status(500).json(error)
  })
})

router.put('/', (req, res) => {
  debug('poll PUT')
  const dataBuffer = req.body
  if (!dataBuffer) { return res.status(400).json({ Error: 'Bad Request' }) }

  publishAction(dataBuffer, { action: 'update' }, GCP_PUBSUB_POLL_TOPIC_NAME)
  .then(result => {
    res.status(200).send(result)
  }).catch(error => {
    res.status(500).json(error)
  })
})

module.exports = router