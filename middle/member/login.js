const Cookies = require('cookies')
const config = require('../../config')
const debug = require('debug')('READR-API:api/middle/member')
const express = require('express')
const jwtService = require('../../services')
const router = express.Router()
const superagent = require('superagent')
const { OAuth2Client, } = require('google-auth-library')
const { constructScope, } = require('../../services/perm')
const { get, } = require('lodash')
const { redisWriting, } = require('../redis')

const apiHost = config.API_PROTOCOL + '://' + config.API_HOST + ':' + config.API_PORT

const login = (req, res) => {
  debug('About to send login req.')
  if ((!req.body.email || !req.body.password) && (req.body.login_mode === 'google' && req.body.login_mode === 'facebook')) {
    res.status(400).send({ message: 'Please offer id/password.', })
    return
  }
  const tokenShouldBeBanned = req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer' && req.headers.authorization.split(' ')[1]
  const url = `${apiHost}/login`

  superagent
    .post(url)
    .send(Object.assign({ keep_alive: req.body.keepAlive }, req.body))
    .end((err, response) => {
      debug('Got response from login api.')
      debug('response', response.body)
      const token = get(response, 'body.token')

      if (!err && response) {
        const mem = get(response, [ 'body', 'member', ], {})
        const scopes = constructScope(get(response, [ 'body', 'permissions', ]), get(mem, [ 'role', ], 1))
        
        const cookies = new Cookies( req, res, {} )
        cookies.set(config.JWT_SIGNING_COOKIE_NAME, token, {
          httpOnly: false,
          domain: config.DOMAIN,
          // secure: process.env.NODE_ENV === 'production',
          expires: new Date(Date.now() + (req.body.keepAlive ? 14 : 1) * 24 * 60 * 60 * 1000),
        })
        /**
         * Revoke the token
         */
        redisWriting(tokenShouldBeBanned, 'logged', null, 24 * 60 * 60 * 1000)
        res.status(200).send({ token, profile: {
          name: get(mem, 'name'), 
          nickname: get(mem, 'nickname'), 
          description: get(mem, 'description'), 
          id: get(mem, 'id'), 
          uuid: get(mem, 'uuid'), 
          mail: get(mem, 'mail', req.body.email), 
          role: get(mem, 'role', 1), 
          profileImage: get(mem, 'profile_image'), 
          points: get(mem, 'points'), 
          scopes,
        },})
      } else {
        debug('Validated in fail. Please offer correct credentials.')
        res.status(401).send('Validated in fail. Please offer correct credentials.')
      }
    })
}

const preLogin = (req, res, next) => {
  debug(`Got a new reuqest of login:
    mail -> ${req.body.email}
    At ${(new Date).toString()}`)

  if (req.body.login_mode === 'google') {
    const client = new OAuth2Client(config.GOOGLE_CLIENT_ID, '', '')
    client.verifyIdToken({
      idToken: req.body.idToken,
      audience: config.GOOGLE_CLIENT_ID,
    }, (e, login) => {
      const payload = login.getPayload()
      if (payload[ 'aud' ] !== config.GOOGLE_CLIENT_ID) {
        res.status(403).send('Forbidden. Invalid token detected.').end()
        return
      }
      req.body.id = payload[ 'sub' ]
      req.body.mail = payload[ 'email' ]
      req.body.email = payload[ 'email' ]
      req.body.register_mode = 'oauth-goo'
      next()
    })
  } else if (req.body.login_mode === 'facebook') {
    req.body.register_mode = 'oauth-fb'    
    next()
  } else {
    req.body.id = req.body.email
    req.body.register_mode = 'ordinary'    
    next()
  }  
}

router.post('*', preLogin, login)
module.exports = router