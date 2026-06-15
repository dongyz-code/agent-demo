import fse from 'fs-extra';

import {
  initQueueTask,
  reTryFunc,
  sleep,
  taskLoop,
} from '@repo/utils-common';

export { fse, initQueueTask, reTryFunc, sleep, taskLoop };

export type Logger = {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export const logger: Logger = {
  log: (...args) => console.log(...args),
  info: (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

export async function run<T>(
  callback: (body: { logger: Logger }) => Promise<T> | T,
) {
  try {
    return await callback({ logger });
  } catch (error) {
    logger.error(error);
    process.exitCode = 1;
    throw error;
  }
}
