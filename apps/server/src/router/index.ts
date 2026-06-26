import { join } from 'node:path';
import { initRoutes } from '@repo/utils-node';
import { authentication } from './authentication.js';
import {
  logger,
  DIRS,
  ROOT_ERROR,
  ROOT_ERROR_DEFAULT_CODE,
  ROOT_ERROR_CODE_AUTHENTICATION_FAILED,
} from '@/configs/index.js';
import { useApiLogListen } from '@/hooks/api-log/listen.js';

export const { getRoutes, callback } = initRoutes({
  authentication: authentication.authentication,
  configs: {
    ROOT_ERROR_DEFAULT_CODE,
    logger,
  },
  routes: {
    dir: join(import.meta.dirname, 'routes'),
  },
  static: {
    dist: DIRS.STATIC,
  },
  errorLogger(error) {
    if (
      error instanceof ROOT_ERROR &&
      error.code === ROOT_ERROR_CODE_AUTHENTICATION_FAILED
    ) {
      return;
    }

    logger.error(error);
  },
  callback(fastify) {
    useApiLogListen(fastify);
  },
});
