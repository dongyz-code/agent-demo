import { fse, pickObj, run } from '@repo/utils-node';
import { commandsRun, getRelative } from './utils.js';
import { join, parse } from 'node:path';
import { projectDir } from '@/config.js';

type Item = {
  /** 目录 */
  dir: string;
  /** 包名 */
  pkg: string;
  /** 模型文件 */
  modelFile: string;
  /** 需要拷贝的静态目录 */
  staticDirs?: string[];
  /** cmds */
  cmds: {
    /** 目标文件 */
    target: string;
    /** 执行命令 */
    cmd: string[];
  }[];
};

async function turboPrune({ dir, pkg, modelFile, staticDirs, cmds }: Item) {
  const tempDir = join(projectDir, dir);
  await fse.remove(tempDir);

  await commandsRun(
    [
      `pnpm turbo prune ${pkg} --docker --out-dir ${tempDir}`,
      `pnpm turbo build --filter=${pkg}`,
    ],
    {
      cwd: projectDir,
    },
  );

  const turboJsonDir = join(tempDir, 'json');

  const copys: string[] = [];
  const outputs = ['build', 'dist'];

  const read = async (dir: string) => {
    const stat = await fse.stat(dir);
    if (stat.isDirectory()) {
      const files = await fse.readdir(dir);
      await Promise.all(files.map((file) => read(join(dir, file))));
    } else if (stat.isFile()) {
      const { dir: pkgDir, base } = parse(dir);
      if (base === 'package.json') {
        const json = await fse.readFile(dir, 'utf8');
        await fse.writeJSON(
          dir,
          pickObj(JSON.parse(json), [
            'name',
            'private',
            'type',
            'main',
            'exports',
            'dependencies',
          ]),
          {
            spaces: 2,
          },
        );

        const relativeDir = getRelative(turboJsonDir, pkgDir);
        const realDir = join(projectDir, relativeDir);

        const dirs = await fse.readdir(realDir);
        const dirsNeedCopy = dirs.filter((x) => outputs.includes(x));

        dirsNeedCopy.forEach((x) => {
          copys.push(`COPY ${join(relativeDir, x)} ${join(relativeDir, x)}`);
        });
      }
    }
  };
  await read(turboJsonDir);

  const dockerfileStr = [await fse.readFile(modelFile, 'utf8')];

  const staticDataDirsCopys: string[] = [];
  staticDirs?.forEach((x) => {
    const relativeDir = getRelative(projectDir, x);
    staticDataDirsCopys.push(`COPY ${relativeDir} ${relativeDir}`);
  });

  const base = `base`;

  /** runner */
  dockerfileStr.push(
    `\n# runner`,
    `FROM ${base} AS runner`,
    `WORKDIR /app`,
    `COPY docker/temp/deploy-server/json .`,
    `RUN pnpm i -r --prod`,
    ...staticDataDirsCopys.sort(),
    ...copys.sort(),
  );

  await Promise.all(
    cmds.map(async ({ target, cmd }) => {
      await fse.writeFile(
        target,
        [
          ...dockerfileStr,
          `ENTRYPOINT ["tini", "--"]`,
          `CMD exec ${cmd.join(' ')}`,
        ].join('\n'),
      );
    }),
  );
}

run(async () => {
  const items: Item[] = [
    {
      dir: 'docker/temp/deploy-server',
      pkg: '@repo/deploy-server',
      modelFile: join(projectDir, 'docker/server-model.Dockerfile'),
      staticDirs: [join(projectDir, 'apps/server/static-data')],
      cmds: [
        {
          target: join(projectDir, 'docker/server.Dockerfile'),
          cmd: [
            'node',
            '--max-old-space-size=16000',
            'apps/server/build/index.js',
            '--DEBUG-ID="$HOSTNAME"',
          ],
        },
      ],
    },
  ];

  for await (const item of items) {
    await turboPrune(item);
  }
});
