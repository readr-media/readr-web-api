const superagent = require('superagent')
const debug = require('debug')('READR-API:api:comment')
const { handlerError, } = require('../../comm')
const { API_TIMEOUT, } = require('../../config')

const getComment = (path) => {
  return (req, res, next) => {
    const url = `${path}${req.url}`
    superagent
    .get(url)
    .timeout(API_TIMEOUT)
    .end((e, r) => {
      req.comment = { e, r, }
      next()
    })
  }
}

const sendComment = (req, res) => {
  debug('Got a comment call!', req.url)
  const { e, r, } = req.comment
  if (!e && r) {
    debug('respaonse:')
    debug(r.body)
    const resData = JSON.parse(r.text)
    res.json(resData)
  } else {
    const err_wrapper = handlerError(e, r)
    res.status(err_wrapper.status).json(err_wrapper.text)      
    console.error(`Error occurred during fetch comment data from : ${req.url}`)
    console.error(e)
  }  
}

module.exports = {
  getComment,
  sendComment,
}