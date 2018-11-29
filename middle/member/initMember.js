const { fetchMem, } = require('./comm')
const { handlerError, } = require('../../comm')
const { givePoints, sendInitializingSuccessEmail, } = require('./comm')
const { get, } = require('lodash')
const Cookies = require('cookies')
const config = require('../../config')
const debug = require('debug')('READR-API:api:middle:member:initMember')
const express = require('express')
const router = express.Router()
const superagent = require('superagent')

const apiHost = config.API_PROTOCOL + '://' + config.API_HOST + ':' + config.API_PORT

const send_email_for_initializing_successfully = (req) => {
  if (get(config, 'MEMBER_POINT_INIT.ACTIVE', false) && get(config, 'MEMBER_POINT_INIT.POINTS')) {
    givePoints({
      points: get(config, 'MEMBER_POINT_INIT.POINTS'),
      member_id: get(req, 'user.id'),
      reason: '讀＋贈點',
    }).then(() => {
      console.error('member', get(req, 'user.id'), 'got points', _.get(config, 'MEMBER_POINT_INIT.POINTS'))
    }).catch(e => {
      console.error(e)
    })
  }  
  sendInitializingSuccessEmail({ email: get(req, 'user.mail'), }).then(({ error, }) => {
    if (!error) {
      debug('Sending email to notify member about initializing completion successfully.')
    } else {
      debug('Sending email to notify member about initializing completion in fail.', get(req, 'user.id'))
    }
  })
}

router.post('/', (req, res, next) => {
  if (get(req, [ 'user', 'type', ]) !== 'init') { res.status(403).send(`Forbidden.`) }
  debug('Got a call to init mem.')
  debug(req.user)
  const id = req.user.id
  const role = req.user.role
  fetchMem({ id, })
  .then(({ res: data, }) => {
    const member = get(data, [ 'body', '_items', 0, ])
    debug('Got mem:')
    debug(member)
    superagent
    .put(`${apiHost}/member/password`)
    .send({
      id: `${get(member, 'id')}`,
      password: req.body.password,
    })
    .end((err, response) => {
      if (!err && response) {
        req.user = member
        const payload = {
          id: get(member, 'id'),
          nickname: req.body.nickname,
          role,
          active: 1,
        }
  
        superagent
        .put(`${apiHost}/member`)
        .send(payload)
        .end((e, r) => {
          if (!e && r) {
            const cookies = new Cookies( req, res, {} )
            cookies.set('setup', '', {
              httpOnly: false,
              domain: config.DOMAIN,
              expires: new Date(Date.now() - 1000),
            })  
            res.status(200).end()

            /**
             * Go send email to notify new member.
             */
            next()
          } else {
            const err_wrapper = handlerError(e, r)
            res.status(err_wrapper.status).send(err_wrapper.text)
            console.error(`Error occurred during initing mem.`)
            console.error(e)
          }
        })
      } else {
        const err_wrapper = handlerError(err, response)
        res.status(err_wrapper.status).send(err_wrapper.text)
        console.error(`Error occurred during initing mem.`)
        console.error(err)
      }
    })
  })
  .catch(({ err, res: response, }) => {
    const err_wrapper = handlerError(err, response)
    res.status(err_wrapper.status).send(err_wrapper.text)
    console.error(`Error occurred during initing mem.`)
    console.error(err)
  })
}, send_email_for_initializing_successfully)

module.exports = router
