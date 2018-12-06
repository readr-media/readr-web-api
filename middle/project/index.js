const express = require('express')
const router = express.Router()

const { get, } = require('lodash')
const superagent = require('superagent')

const { setupClientCache } = require('../comm')
const { handlerError, pickInsensitiveUserInfo, } = require('../../comm')

const debug = require('debug')('READR-API:api:project')

const { API_PROTOCOL, API_HOST, API_PORT, API_TIMEOUT, } = require('../../config')
const apiHost = API_PROTOCOL + '://' + API_HOST + ':' + API_PORT

router.get('/contents/:id', setupClientCache, (req, res, next) => {
  const user_id = get(req, 'user.id')
  debug('user_id', user_id)

  let url = `${apiHost}/project${req.url}`
  url = req.url.indexOf('?') > -1 ? `${url}&member_id=${user_id}` : `${url}?member_id=${user_id}`
  debug('url:')
  debug(url)

  superagent
  .get(url)
  .timeout(API_TIMEOUT)
  .end((e, r) => {
    if (!e && r) {
      // debug(r)
      const resData = JSON.parse(r.text)
      resData['_items'].forEach(post => { post.author = pickInsensitiveUserInfo(post.author) })
      
      res.json(resData)
    } else {
      const err_wrapper = handlerError(e, r)
      res.status(err_wrapper.status).json(err_wrapper.text)      
      console.error(`Error occurred when fecthing public post data from : ${url}`)
      console.error(e)
    }
  })
})

module.exports = router