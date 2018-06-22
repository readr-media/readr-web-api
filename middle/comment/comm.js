const debug = require('debug')('READR-API:api:comment')
const superagent = require('superagent')
const { API_TIMEOUT, } = require('../../config')
const { handlerError, } = require('../../comm')
const { redisFetching, redisWriting, } = require('../redis')

const getCommentBase = (url) => new Promise((resolve, reject) => {
  redisFetching(url, ({ error, data, }) => {
    if (!error && data) {
      debug('Fetch comment data from Redis.')
      debug('>', url)
      const comment_data = JSON.parse(data)
      resolve(comment_data)
    } else {      
      reject()
    }
  })
})

const getCommentFromApi = (url) => new Promise(resolve => {
  superagent
  .get(url)
  .timeout(API_TIMEOUT)
  .end((e, r) => {
    !e && redisWriting(url, JSON.stringify({ e, r, }))
    resolve({ e, r, })
  })
})

const getComment = (path) => {
  return (req, res, next) => {
    const url = `${path}${req.url}`
    getCommentBase(url)
    .then(comment => {
      req.comment = comment
      next()
    })
    .catch(() => getCommentFromApi(url).then(comment => {
      req.comment = comment
      next()
    }))
  }
}

const sendComment = (req, res) => {
  debug('Got a comment call!', req.url)
  const { e, r, } = req.comment
  if (!e && r) {
    debug('response:')
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
  getCommentFromApi,
  sendComment,
}