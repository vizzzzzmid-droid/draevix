// these values are injected at build time
const DRAEVIX_ENV = process.env.DRAEVIX_ENV;
const DRAEVIX_BUILD_VERSION = process.env.DRAEVIX_BUILD_VERSION;
const DRAEVIX_BUILD_DATE = process.env.DRAEVIX_BUILD_DATE;
const DRAEVIX_MEDIASOUP_BIN_NAME = process.env.DRAEVIX_MEDIASOUP_BIN_NAME;

const SERVER_VERSION =
  typeof DRAEVIX_BUILD_VERSION !== 'undefined'
    ? DRAEVIX_BUILD_VERSION
    : '0.0.0-dev';

const BUILD_DATE =
  typeof DRAEVIX_BUILD_DATE !== 'undefined' ? DRAEVIX_BUILD_DATE : 'dev';

const env = typeof DRAEVIX_ENV !== 'undefined' ? DRAEVIX_ENV : 'development';
const IS_PRODUCTION = env === 'production';
const IS_DEVELOPMENT = !IS_PRODUCTION;
const IS_TEST = process.env.NODE_ENV === 'test';
const IS_DOCKER = process.env.RUNNING_IN_DOCKER === 'true';

if (IS_PRODUCTION) {
  if (!DRAEVIX_MEDIASOUP_BIN_NAME) {
    throw new Error('DRAEVIX_MEDIASOUP_BIN is not defined');
  }
}

export {
  BUILD_DATE,
  IS_DEVELOPMENT,
  IS_DOCKER,
  IS_PRODUCTION,
  IS_TEST,
  SERVER_VERSION,
  DRAEVIX_MEDIASOUP_BIN_NAME
};
