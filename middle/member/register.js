const { OAuth2Client, } = require('google-auth-library')
const { get, } = require('lodash')
const { givePoints, sendActivationMail, sendInitializingSuccessEmail, } = require('./comm')
const { handlerError, } = require('../../comm')
const { redisWriting, } = require('../redis')
const { API_HOST, API_PORT, API_PROTOCOL, GOOGLE_CLIENT_ID, MEMBER_POINT_INIT, } = require('../../config')
const debug = require('debug')('READR-API:api:middle:member:register')
const express = require('express')
const router = express.Router()
const superagent = require('superagent')

const apiHost = API_PROTOCOL + '://' + API_HOST + ':' + API_PORT

const giveFreePoints = memId => new Promise((resolve, reject) => {
  /** if never setup MEMBER_POINT_INIT, dont go process the following codes. */
  if (!get(MEMBER_POINT_INIT, 'ACTIVE', false)
    || !get(MEMBER_POINT_INIT, 'POINTS')
    || !memId) { return resolve() }  

  debug('Goin to give init-points', get(MEMBER_POINT_INIT, 'POINTS'), 'for', memId)
  return givePoints({
    points: get(MEMBER_POINT_INIT, 'POINTS'),
    member_id: memId,
    reason: '0',
  }).then(() => {
    console.error('member', memId, 'got points', get(MEMBER_POINT_INIT, 'POINTS'))
    return resolve()
  }).catch(e => {
    console.error(e)
    return reject(e)
  })
})

const sendRegisterReq = (req, res) => {
  if (!req.body.email || !(req.body.password || req.body.social_id)) {
    res.status(400).send({ message: 'Please offer all requirements.', })
    return
  }

  const tokenShouldBeBanned = req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer' && req.headers.authorization.split(' ')[1]
  delete req.body.idToken
  delete req.body.email
  delete req.body.id

  const url = `${apiHost}/register`
  debug('Going to register to Readr.')
  debug(req.body)

  superagent
  .post(url)
  .send(req.body)
  .end((err, resp) => {
    if (!err && resp) {
      if (req.body.register_mode !== 'oauth-goo' && req.body.register_mode !== 'oauth-fb') {
        res.status(200).send('Registering successfully.')
        sendActivationMail({ id: req.body.mail, email: req.body.mail, type: 'member', }, (e, response, tokenForActivation) => {      
          if (!e && response) {
            /**
             * Revoke the token
             */
            redisWriting(tokenShouldBeBanned, 'registered', null, 24 * 60 * 60 * 1000)
          } else {
            console.error(`Error occurred during sending activation email to ${req.body.mail} ${req.body.register_mode}`)
            console.error(e)
          }
        })
      } else {
        const memId = get(resp.body, '_items.last_id')
        if (!memId) {
          for (let i = 0; i < 3; i +=1) { console.error('REGISTRING WARN: member id is missing!!!!', req.body.mail) }
        }
        res.status(200).send('Registering successfully.')
        giveFreePoints(memId)
        .then(() => {
          return sendInitializingSuccessEmail({ email: req.body.mail, }).then(({ error, }) => {
            if (!error) {
              debug('Sending email to notify member about initializing completion successfully.')
            } else {
              console.error(`Error occurred during sending initializing email to ${req.body.mail} ${req.body.register_mode}`)
              console.error(error)
            }
          })      
        }).catch(err => {
          console.error(err)
        })
      }
    } else {
      const err_wrapper = handlerError(err, resp)
      res.status(err_wrapper.status).send(JSON.parse(err_wrapper.text))      
      console.error(`Error occurred during registering: ${url}`)
      console.error(err)
    }
  })
}

const preRigister = (req, res, next) => {
  debug(`Got a new reuqest of register:`)
  debug(req.body)
  debug(`At ${(new Date).toString()}`)

  if (req.body.register_mode === 'oauth-goo') {
    const client = new OAuth2Client(GOOGLE_CLIENT_ID)
    debug('Registering by google account.')
    const verify = async () => {
      return await client.verifyIdToken({
        idToken: req.body.idToken,
        audience: GOOGLE_CLIENT_ID,
      })
    }
    verify().then((ticket) => {
      debug('Going to fetch data from payload.')
      const payload = ticket.getPayload()
      if (payload[ 'aud' ] !== GOOGLE_CLIENT_ID) {
        res.status(403).send('Forbidden. Invalid token detected.').end()
        return
      }
      // req.body.id = payload[ 'sub' ]
      req.body.nickname = req.body.nickname || payload[ 'name' ]
      req.body.profile_image = payload[ 'picture' ] || null
      req.body.mail = payload[ 'email' ]
      req.body.email = payload[ 'email' ]
      req.body.social_id = payload[ 'sub' ]
      debug(payload)
      debug(req.body)
      next()
    }).catch((e) => {
      debug(e.message)
      res.status(403).send(e.message).end()
      return
    })
  } else if (req.body.register_mode === 'oauth-fb') {
    req.body.mail = req.body.email
    // req.body.id = req.body.social_id
    next()
  } else {
    req.body.mail = req.body.email
    // req.body.id = req.body.email
    req.body.register_mode = 'ordinary'
    if (req.body.role !== null && req.body.role !== undefined && !req.body.password) {
      req.body.password = 'none'
    }
    next()
  }
}

router.post('/', preRigister, sendRegisterReq)
router.post('/admin', (req, res, next) => {
  const url = `${apiHost}/member`
  const payload = req.body

  payload.role = payload.role || 1
  payload.active = 0
  delete payload.id 

  superagent
    .post(url)
    .send(payload)
    .end((err, resp) => {
      if (!err) {
        debug('Added member by Admin successfully.')
        res.status(200).end()
        next()
      } else {
        res.status(resp.status).json(err)
        console.error(`Error occurred during register`)
        console.error(err)
      }
    })
}, (req, res) => {
  sendActivationMail({ id: req.body.mail, email: req.body.mail, role: get(req, 'body.role', 1), type: 'init', }, (e, response) => {
    if (!e && response) {
      debug(`Successfully sending activation email to ${req.body.mail}.`)
      debug(req.body)
    } else {
      console.error(`Error occurred during adding member by Admin.`)
      console.error(e)
    }
  })
})

module.exports = router
