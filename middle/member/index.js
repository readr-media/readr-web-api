const { get, } = require('lodash')
const { handlerError, } = require('../../comm')
const config = require('../../config')
const debug = require('debug')('READR-API:api:member')
const express = require('express')
const router = express.Router()
const superagent = require('superagent')

const apiHost = config.API_PROTOCOL + '://' + config.API_HOST + ':' + config.API_PORT

router.put('/role', (req, res) => {
  debug('Got a req to update user\'s role')
  debug(req.body)
  const url = `${apiHost}/member`
  superagent
  .put(url)
  .send(req.body)
  .end((err, response) => {
    if (!err && response) {
      debug('Update user\'s role sucessfully')
      return res.status(200).end()
    } else {
      const err_wrapper = handlerError(err, response)
      res.status(err_wrapper.status).json(err_wrapper.text)      
      console.error(`Error occurred when udpating member role from : ${req.body}`)
      console.error(err)
    }
  })
})

router.put('/', (req, res, next) => {
  next()
})

router.get('/setting', (req, res, next) => {
  debug('going to fecth personal setting for:', req.user.id)
  const url = `${apiHost}/member/${req.user.id}`
  superagent
  .get(url)
  .end((err, response) => {
    if (!err && response) {
      debug(response.body)
      res.json({
        hide_profile: get(response, 'body._items.0.hide_profile'),
        profile_push: get(response, 'body._items.0.profile_push'),
        post_push: get(response, 'body._items.0.post_push'),
        comment_push: get(response, 'body._items.0.comment_push'),
      })
    } else {
      const err_wrapper = handlerError(err, response)
      res.status(err_wrapper.status).json(err_wrapper.text)      
      console.error(`Error occurred when fetching member's personal setting: ${req.body}`)
      console.error(err)
    }
  })
})

router.post('/syncavatar', (req, res) => {
  debug('Got a avatar sync req.')
  debug(req.body)
  debug(req.user)
  res.status(200).send('Sync avatar successfully.')
})

router.post('*', () => {})

router.delete('*', (req, res, next) => {
  const userid = req.url.split('/')[ 1 ]
  debug('going to del member', userid)
  debug(req.body)
  debug(req.url)
  next()
})

module.exports = router
