const config = require('../../config')
const express = require('express')
const router = express.Router()
const superagent = require('superagent')
const { fetchFromRedis, insertIntoRedis, } = require('../redis')
const { handlerError, } = require('../../comm')
const { get, toNumber } = require('lodash')

router.get('/', fetchFromRedis, function(req, res, next) {
  if (res.redis) {
    const resData = JSON.parse(res.redis)
    res.json(resData)
  } else {
    const queryForEsSearch = {
      'from': (toNumber(get(req, 'query.page', 1)) - 1) * toNumber(get(req, 'query.hitsPerPage', 12)),
      'size': toNumber(get(req, 'query.hitsPerPage', 12)),
      'query': {
        'bool': {
          'must': [
            {
              'multi_match' : {
                'query': get(req, 'query.keyword', ''),
                'type': 'phrase',
                'fields': [ 'title^2', 'content' ]
              }
            },
            {
              'match' : { 'objectType': get(req, 'query.objectType', 'post') }
            }
          ]
        }
      },
      'sort' : [
        '_score',
        { 
          'published_at': { 'order': 'desc' }
        }
      ]
    }
    const es_host = `${config.SEARCH_PROTOCOL}://${config.SEARCH_HOST}:${config.SEARCH_PORT || 9200}${config.SEARCH_ENDPOINT}`
    superagent
    .post(es_host)
    .timeout({ response: config.SEARCH_TIMEOUT, deadline: config.API_DEADLINE || 60000, })
    .set('Content-Type', 'application/json')
    .send(queryForEsSearch)
    .then(response => {
      const dt = JSON.parse(response.text)
      res.json(dt)
      if (Object.keys(dt).length !== 0 && dt.constructor === Object) {
        /**
         * if data not empty, go next to save data to redis
         */
        res.dataString = response.text
        next()
      }    
    })
    .catch(error => {
      const errWrapped = handlerError(error)
      res.status(errWrapped.status).send({
        status: errWrapped.status,
        text: errWrapped.text
      })
      console.error(`\n[ERROR] POST elastic search api`, queryForEsSearch)
      console.error(`${error}\n`)
    })    
  }
}, insertIntoRedis)

module.exports = router