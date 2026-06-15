import { DIRS, getAppDir } from '@/configs/dirs.js';
import { fse, run, commonRun, sleep } from '@repo/utils-node';
import { join } from 'node:path';
import { stringify } from 'yaml';

import type { Logger } from '@repo/utils-node';

const __dirname = import.meta.dirname;

run(async ({ logger }) => {
  const name = 'coc-audit';
  const version = '1.0.0';

  // const { deployDir, buildDir, historyDir } = getAppDir(name);
  // /** 创建应用的时候就需要创建好 */
  // await Promise.all([
  //   fse.ensureDir(deployDir),
  //   fse.ensureDir(buildDir),
  //   fse.ensureDir(historyDir),
  // ]);
  // await fse.move(
  //   join(__dirname, './temp/az-coc-audit-ai.zip'),
  //   join(historyDir, `${version}.zip`),
  // );

  // await buildAndDeployFronend({ name, version, logger });
});
