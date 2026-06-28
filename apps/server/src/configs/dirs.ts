/** 请保证无node模块以外的引用 */

import { initDirs, initTempDirs } from '@repo/utils-node';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../../');

export const { DIRS } = initDirs({
  root,
  extra: ['pnpm-store'],
});

export const TEMP_DIRS = initTempDirs({
  tempDir: DIRS.TEMP,
});

export const configFile = join(DIRS.ROOT, '.conf/conf.json');
