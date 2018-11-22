const { get, } = require('lodash')
const debug = require('debug')('READR:api:comm')

const isValidJSONString = str => {
  try {
      JSON.parse(str)
  } catch (e) {
      return false
  }
  return true
}
const handlerError = (err, res) => {
  debug('err:')
  debug(err)
  const text = get(res, 'text') || get(err, 'message', '{}')
  return {
    status: (typeof(get(res, 'status')) === 'number' && get(res, 'status')) || get(err, 'status') || 500,
    text: isValidJSONString(text) ? text : `{}`,
  }
}
module.exports = {
  handlerError,
}
