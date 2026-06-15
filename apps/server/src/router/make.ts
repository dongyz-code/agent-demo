import { join } from 'node:path';
import { fse, mergeAPIByDir, run } from '@repo/utils-node';
import { DIRS } from '@/configs/dirs.js';

import * as prettier from 'prettier';

import type { Options } from 'prettier';

const prettierrc = join(DIRS.ROOT, '.prettierrc');

async function formatByPrettier(text: string, opts?: Options) {
  const options = await prettier.resolveConfig(prettierrc);
  const formatted = await prettier.format(text, {
    ...options,
    ...opts,
  });
  return formatted;
}

run(async () => {
  const routerDir = import.meta.dirname;
  const dir = join(routerDir, 'routes');
  if (!(await fse.pathExists(dir))) {
    return;
  }
  const target = join(routerDir, 'routes-single-file.ts');
  await mergeAPIByDir({ dir, target });
  const str = await fse.readFile(target, 'utf8');
  await fse.writeFile(
    target,
    await formatByPrettier(str, { parser: 'typescript' }),
    'utf8',
  );
});
