const config = require('config')
const path = require('path')

module.exports = {
  API_PROTOCOL: config.has('API_PROTOCOL') && config.get('API_PROTOCOL'),
  API_HOST: config.has('API_HOST') && config.get('API_HOST'),
  API_PORT: config.has('API_PORT') && config.get('API_PORT'),
  API_TIMEOUT: config.has('API_TIMEOUT') && config.get('API_TIMEOUT'),
  COMMENT_PUBLIC_VALID_PATH_PARAM: config.has('COMMENT_PUBLIC_VALID_PATH_PARAM') && config.get('COMMENT_PUBLIC_VALID_PATH_PARAM'),
  DISPOSABLE_TOKEN_WHITE_LIST: config.has('DISPOSABLE_TOKEN_WHITE_LIST') && config.get('DISPOSABLE_TOKEN_WHITE_LIST'),
  DOMAIN: config.has('DOMAIN') && config.get('DOMAIN'),
  ENDPOINT_SECURE: config.has('ENDPOINT_SECURE') && config.get('ENDPOINT_SECURE'),
  EMAIL_BCC: config.has('EMAIL_BCC') && config.get('EMAIL_BCC'),
  EZPAY: config.has('EZPAY') && config.get('EZPAY'),
  GCP_FILE_BUCKET: config.has('GCP_FILE_BUCKET') && config.get('GCP_FILE_BUCKET'),
  GCP_KEYFILE: config.has('GCP_KEYFILE') && path.join(process.cwd(), config.get('GCP_KEYFILE')),
  GCP_PROJECT_ID: config.has('GCP_PROJECT_ID') && config.get('GCP_PROJECT_ID'),
  GCP_PUBSUB_POLL_TOPIC_NAME: config.has('GCP_PUBSUB_POLL_TOPIC_NAME') && config.get('GCP_PUBSUB_POLL_TOPIC_NAME'),
  GCP_PUBSUB_TOPIC_NAME: config.has('GCP_PUBSUB_TOPIC_NAME') && config.get('GCP_PUBSUB_TOPIC_NAME'),
  GCS_IMG_MEMBER_PATH: config.has('GCS_IMG_MEMBER_PATH') && config.get('GCS_IMG_MEMBER_PATH'),
  GCS_IMG_POST_PATH: config.has('GCS_IMG_POST_PATH') && config.get('GCS_IMG_POST_PATH'),
  GCP_STACKDRIVER_LOG_NAME: config.has('GCP_STACKDRIVER_LOG_NAME') && config.get('GCP_STACKDRIVER_LOG_NAME'),
  GOOGLE_API_KEY: config.has('GOOGLE_API_KEY') && config.get('GOOGLE_API_KEY'),
  GOOGLE_CLIENT_ID: config.has('GOOGLE_CLIENT_ID') && config.get('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: config.has('GOOGLE_CLIENT_SECRET') && config.get('GOOGLE_CLIENT_SECRET'),
  GOOGLE_RECAPTCHA_SITE_KEY: config.has('GOOGLE_RECAPTCHA_SITE_KEY') && config.get('GOOGLE_RECAPTCHA_SITE_KEY'),
  GOOGLE_RECAPTCHA_SECRET: config.has('GOOGLE_RECAPTCHA_SECRET') && config.get('GOOGLE_RECAPTCHA_SECRET'),
  /**
   * JWT SETTING SHOULD BE THE SAME AS TALK SERVER
   */
  JWT_SECRET: config.has('JWT_SECRET') && config.get('JWT_SECRET'),
  JWT_SECRETS: config.has('JWT_SECRETS') && config.get('JWT_SECRETS'),
  JWT_COOKIE_NAME: config.has('JWT_COOKIE_NAME') && config.get('JWT_COOKIE_NAME'),
  JWT_SIGNING_COOKIE_NAME: config.has('JWT_SIGNING_COOKIE_NAME') && config.get('JWT_SIGNING_COOKIE_NAME'),
  JWT_COOKIE_NAMES: config.has('JWT_COOKIE_NAMES') && config.get('JWT_COOKIE_NAMES'),
  JWT_CLEAR_COOKIE_LOGOUT: config.has('JWT_CLEAR_COOKIE_LOGOUT') && config.get('JWT_CLEAR_COOKIE_LOGOUT'),
  JWT_DISABLE_AUDIENCE: config.has('JWT_DISABLE_AUDIENCE') && config.get('JWT_DISABLE_AUDIENCE'),
  JWT_AUDIENCE: config.has('JWT_AUDIENCE') && config.get('JWT_AUDIENCE'),
  JWT_DISABLE_ISSUER: config.has('JWT_DISABLE_ISSUER') && config.get('JWT_DISABLE_ISSUER'),
  JWT_USER_ID_CLAIM: config.has('JWT_USER_ID_CLAIM') && config.get('JWT_USER_ID_CLAIM'),
  JWT_ISSUER: config.has('JWT_ISSUER') && config.get('JWT_ISSUER'),
  JWT_EXPIRY: config.has('JWT_EXPIRY') && config.get('JWT_EXPIRY'),
  JWT_ALG: config.has('JWT_ALG') && config.get('JWT_ALG'),

  IMAGE_UPLOAD_QUALITY_JPEG: config.has('IMAGE_UPLOAD_QUALITY_JPEG') && config.get('IMAGE_UPLOAD_QUALITY_JPEG'),
  IMAGE_UPLOAD_QUALITY_PNG: config.has('IMAGE_UPLOAD_QUALITY_PNG') && config.get('IMAGE_UPLOAD_QUALITY_PNG'),
  MEMO_PUBLISH_STATUS: config.has('MEMO_PUBLISH_STATUS') && config.get('MEMO_PUBLISH_STATUS'),
  MEMBER_POINT_INIT: config.has('MEMBER_POINT_INIT') && config.get('MEMBER_POINT_INIT'),
  PAGE_CACHE_EXCLUDING: config.has('PAGE_CACHE_EXCLUDING') && config.get('PAGE_CACHE_EXCLUDING'),
  POINT_OBJECT_TYPE: config.has('POINT_OBJECT_TYPE') && config.get('POINT_OBJECT_TYPE'),
  POST_PUBLISH_STATUS: config.has('POST_PUBLISH_STATUS') && config.get('POST_PUBLISH_STATUS'),
  POST_TYPE: config.has('POST_TYPE') && config.get('POST_TYPE'),
  PROJECT_STATUS: config.has('PROJECT_STATUS') && config.get('PROJECT_STATUS'),
  PROJECT_PUBLISH_STATUS: config.has('PROJECT_PUBLISH_STATUS') && config.get('PROJECT_PUBLISH_STATUS'),
  REDIS_CONNECTION_TIMEOUT: config.has('REDIS_CONNECTION_TIMEOUT') && config.get('REDIS_CONNECTION_TIMEOUT'),
  REDIS_HOST: config.has('REDIS_HOST') && config.get('REDIS_HOST'),
  REDIS_PORT: config.has('REDIS_PORT') && config.get('REDIS_PORT'),
  REDIS_AUTH: config.has('REDIS_AUTH') && config.get('REDIS_AUTH'),
  REDIS_MAX_CLIENT: config.has('REDIS_MAX_CLIENT') && config.get('REDIS_MAX_CLIENT'),
  REDIS_READ_HOST: config.has('REDIS_READ_HOST') && config.get('REDIS_READ_HOST'),
  REDIS_READ_PORT: config.has('REDIS_READ_PORT') && config.get('REDIS_READ_PORT'),
  REDIS_WRITE_HOST: config.has('REDIS_WRITE_HOST') && config.get('REDIS_WRITE_HOST'),
  REDIS_WRITE_PORT: config.has('REDIS_WRITE_PORT') && config.get('REDIS_WRITE_PORT'),
  REDIS_TIMEOUT: config.has('REDIS_TIMEOUT') && config.get('REDIS_TIMEOUT'),
  REPORT_PUBLISH_STATUS: config.has('REPORT_PUBLISH_STATUS') && config.get('REPORT_PUBLISH_STATUS'),
  ROLE_MAP: config.has('ROLE_MAP') && config.get('ROLE_MAP'),
  SCOPES: config.has('SCOPES') && config.get('SCOPES'),
  SEARCH_PROTOCOL: config.has('SEARCH_PROTOCOL') && config.get('SEARCH_PROTOCOL'),
  SEARCH_HOST: config.has('SEARCH_HOST') && config.get('SEARCH_HOST'),
  SEARCH_ENDPOINT: config.has('SEARCH_ENDPOINT') && config.get('SEARCH_ENDPOINT'),
  SEARCH_PORT: config.has('SEARCH_PORT') && config.get('SEARCH_PORT'),
  SEARCH_TIMEOUT: config.has('SEARCH_TIMEOUT') && config.get('SEARCH_TIMEOUT'),
  SECRET_KEY: config.has('SECRET_KEY') && config.get('SECRET_KEY'),
  SERVER_PROTOCOL: config.has('SERVER_PROTOCOL') && config.get('SERVER_PROTOCOL'),
  SERVER_HOST: config.has('SERVER_HOST') && config.get('SERVER_HOST'),
  SERVER_PROTOCOL_MOBILE: config.has('SERVER_PROTOCOL_MOBILE') && config.get('SERVER_PROTOCOL_MOBILE'),
  SERVER_HOST_MOBILE: config.has('SERVER_HOST_MOBILE') && config.get('SERVER_HOST_MOBILE'),
  TAG_ACTIVE: config.has('TAG_ACTIVE') && config.get('TAG_ACTIVE'),
}