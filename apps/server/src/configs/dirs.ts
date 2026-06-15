/** 请保证无node模块以外的引用 */

import { initDirs, initTempDirs } from '@repo/utils-node';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../../');

export const { DIRS } = initDirs({
  root,
  extra: ['app', 'pnpm-store'],
});

export const TEMP_DIRS = initTempDirs({
  tempDir: DIRS.TEMP,
});

export const configFile = join(DIRS.ROOT, '.conf/conf.json');

/** 传输前端代码，打包运行
 *
 * pnpm store dir
 *
 * 目录结构:
 *
 * deploy/APP/docker-compose.yml
 * build/APP/
 * history/APP/VERSION.zip
 */

export function getAppDir(id: string) {
  const deployDir = join(DIRS.EXTRA.app, 'deploy', id);
  const buildDir = join(DIRS.EXTRA.app, 'build', id);
  const historyDir = join(DIRS.EXTRA.app, 'history', id);

  const stackName = `fsd-ai-deploy-${id}`;
  const frontendImageName = `frontend-ai-deploy-${id}`;
  const backendImageName = `backend-ai-deploy-${id}`;

  return {
    deployDir,
    buildDir,
    historyDir,
    //
    stackName,
    frontendImageName,
    backendImageName,
  };
}
