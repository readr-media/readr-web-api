const express = require('express')
const router = express.Router()
const superagent = require('superagent')

const corsMiddle = require('../corsMiddle')
const isEmail = require('validator/lib/isEmail')

const { API_PROTOCOL, API_HOST, API_PORT } = require('../../config')
const { decamelizeKeys } = require('humps')
const { default: isMobilePhone } = require('validator/lib/isMobilePhone')
const { genInvoice } = require('../invoice')
const { get } = require('lodash')
const { handlerError, } = require('../../comm')


const apiHost = API_PROTOCOL + '://' + API_HOST + ':' + API_PORT

const PAYMENT_SERVICE = 'tappay'
const INVOICE_SERVICE = 'ezpay'
const CURRENCY = 'TWD'
const ITEM_NAME = '訂閱'
const ITEM_UNIT = '月'
const ITEM_COUNT = 1

const validate = (req, res, next) => {
    const body = req.body
    const cardholderPhoneNumber = get(body, 'paymentInfos.cardholder.phoneNumber', '')
    const cardholderName = get(body, 'paymentInfos.cardholder.name')
    const cardholderEmail = get(body, 'paymentInfos.cardholder.email', '')
    const prime = get(body, 'paymentInfos.prime')
    const invoiceInfos = get(body, 'invoiceInfos')
    const validated = isMobilePhone(cardholderPhoneNumber) && cardholderName && isEmail(cardholderEmail) && prime && invoiceInfos
    
    if (!validated) {
      console.error(`[error] POST /subscriptions`, 'req.body:', req.body)
      return res.status(403).end('Invalid request body.')
    }
    next()
}

const setCommonValue = (req, res, next) => {
  const body = req.body
  body.createdAt = body.createdAt || new Date().toISOString()
  body.paymentService = PAYMENT_SERVICE
  body.invoiceService = INVOICE_SERVICE
  body.paymentInfos.currency = CURRENCY
  body.paymentInfos.details = `READr subscription at ${body.createdAt}`
  body.invoiceInfos.itemName = [ ITEM_NAME ]
  body.invoiceInfos.itemUnit = [ ITEM_UNIT ]
  body.invoiceInfos.itemCount = [ ITEM_COUNT ]
  next()
}

// For genInvoice requirement
const restructureBody = (req, res, next) => {
  try {
    let body = req.body
    body.category = get(body, 'invoiceInfos.category')
    body.carrierType = get(body, 'invoiceInfos.carrierType')
    body.memberName = get(body, 'invoiceInfos.buyerName')
    body.memberMail = get(body, 'email')
    body.lastFourNum = get(body, 'invoiceInfos.lastFourNum')
    body.amtSales = body.invoiceInfos.itemPrice[0]
    body.itemUnit = ITEM_UNIT
    body.items = [
      {
        name: ITEM_NAME,
        price: body.amtSales,
        count: ITEM_COUNT
      }
    ]

    if (body.category !== 1) {
      body.businessAddress = get(body, 'invoiceInfos.buyerAddress')
      body.businessTitle = get(body, 'invoiceInfos.buyerName')
      body.businessTaxNo = get(body, 'invoiceInfos.buyerUbn')
    }

    body = decamelizeKeys(body, {
      process: (key, convert, options) => {
        const noParseKeys = /(amtSales|businessAddress|businessTaxNo|businessTitle|carrierType|lastFourNum|loveCode)/
        return key.match(noParseKeys) ? key : convert(key, options)
      }
    })
    next()
  } catch (error) {
    console.error(`[error] set request body for generate invoice`, 'req.body:', req.body, error)
  }
}

// For CORS non-simple requests
router.options('/*', corsMiddle, res => {
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With')
  res.send(200)
})

router.post('/', validate, setCommonValue, (req, res, next) => {
  const url = `${apiHost}/subscriptions`
  const bodyDecamelized = decamelizeKeys(req.body)

  superagent
    .post(url)
    .send(bodyDecamelized)
    .end((error, response) => {
      
      if (!error && response) {
        const resData = JSON.parse(response.text)
        res.json(resData)

        req.body.transactionId = get(resData, 'id')
        next()
      } else {
        console.error(`Error occurred when post /subscriptions`, 'req.body:', req.body, error)
        const errorWrapper = handlerError(error, response)
        return res.status(errorWrapper.status).json(errorWrapper.text)      
      }
    })
}, restructureBody, genInvoice)

module.exports = router
