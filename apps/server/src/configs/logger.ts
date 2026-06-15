import { initPinoLogger } from '@repo/utils-node';
import { DIRS } from './dirs.js';
import { ROOT } from './env.js';

export const { logger, fastifyLogger } = initPinoLogger({
  logDir: DIRS.LOG,
  devPretty: !ROOT.MEDO_PROD,
});
