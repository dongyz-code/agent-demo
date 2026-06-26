import { fse, commonRun, sleep } from '@repo/utils-node';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { DIRS, getAppDir } from '@/configs/dirs.js';
import { db, schema } from '@/database/index.js';
import { eq } from 'drizzle-orm';

import type { DeployParams } from './type.js';
import type { Logger } from '@repo/utils-node';

function useRun({ logger }: { logger?: Logger }) {
  const eachRun = async (
    label: string,
    callback: () => Promise<void> | void,
  ) => {
    console.log('\n');
    logger?.log(label, 'start');
    try {
      await callback();
      logger?.log(label, 'complete');
    } catch (error) {
      logger?.log(label, 'error');
      throw error;
    }
  };

  return {
    eachRun,
  };
}

/** 目录结构判断 */
async function judgeDirectoryStructure({ dir }: { dir: string }) {
  const files = await fse.readdir(dir);
  if (files.includes('server') && files.includes('client')) {
    return {
      stack: 'fullstack' as const,
      backendDir: join(dir, 'server'),
      frontendDir: join(dir, 'client'),
    };
  }
  return {
    stack: 'frontend' as const,
    dir,
  };
}

export async function buildAndDeployFronend({
  id,
  logger,
  purpose,
}: DeployParams) {
  const {
    deployDir,
    buildDir,
    historyDir,
    //
    stackName,
    frontendImageName,
    backendImageName,
  } = getAppDir(id);

  const dockerComposeYaml = join(deployDir, 'docker-compose.yml');

  const { eachRun } = useRun({ logger });

  if (purpose === 'restart') {
    if (await fse.exists(dockerComposeYaml)) {
      await eachRun('docker compose restart', async () => {
        await commonRun({
          cmd: 'docker',
          args: ['compose', 'restart'],
          spawnOptions: {
            cwd: deployDir,
          },
          log: { prefix: false },
        });
      });
    }
  } else if (purpose === 'stop') {
    if (await fse.exists(dockerComposeYaml)) {
      await eachRun('docker compose stop', async () => {
        await commonRun({
          cmd: 'docker',
          args: ['compose', 'stop'],
          spawnOptions: {
            cwd: deployDir,
          },
        });
      });
    }
  } else if (purpose === 'deploy') {
    const [[app]] = await Promise.all([
      db
        .select({
          domain: schema.ai_app.domain,
          deploy_hash: schema.ai_app.deploy_hash,
          name: schema.ai_app.name,
        })
        .from(schema.ai_app)
        .where(eq(schema.ai_app.id, id))
        .limit(1),
      // fse.ensureDir(buildDir),
      (async () => {
        await fse.remove(buildDir);
        await fse.ensureDir(buildDir);
      })(),
      fse.ensureDir(deployDir),
      fse.ensureDir(historyDir),
    ]);

    if (!app?.deploy_hash) {
      throw new Error('应用未部署');
    }
    const { domain, deploy_hash } = app;
    const hash = deploy_hash.toString('hex');

    const zipPath = join(historyDir, `${hash}.zip`);

    await eachRun('unzip', async () => {
      await commonRun({
        cmd: 'unzip',
        args: ['-o', '-d', buildDir, zipPath],
        log: { prefix: false },
      });
    });

    /** 解压后根据目录结构判断分支处理 */

    const buildFrontend = async (cwd: string) => {
      const packageFile = join(cwd, 'package.json');
      const dockerFile = join(cwd, 'Dockerfile');
      const dockerFileBuildSh = join(cwd, 'build.sh');

      if (await fse.exists(dockerFile)) {
        if (await fse.exists(dockerFileBuildSh)) {
          await eachRun('bash build.sh', async () => {
            await commonRun({
              cmd: 'bash',
              args: ['build.sh'],
              spawnOptions: { cwd },
              log: { prefix: false },
            });
          });
        }
        await eachRun('frontend docker build', async () => {
          await commonRun({
            cmd: 'docker',
            args: ['build', '-t', frontendImageName, '-f', dockerFile, '.'],
            spawnOptions: { cwd },
            log: { prefix: false },
          });
        });

        return;
      }

      let nginxDockerfile = join(DIRS.STATIC_DATA, 'nginx.Dockerfile');
      if (await fse.exists(packageFile)) {
        await eachRun('frontend pnpm install', async () => {
          // const pnpmWorkspaceYaml = join(cwd, 'pnpm-workspace.yaml');
          // if (!(await fse.exists(pnpmWorkspaceYaml))) {
          //   await fse.writeFile(pnpmWorkspaceYaml, '');
          // }
          await commonRun({
            cmd: 'pnpm',
            args: ['i'],
            spawnOptions: { cwd, env: { ...process.env, CI: 'true' } },
            log: { prefix: false },
          });
        });
        await eachRun('frontend pnpm build', async () => {
          await commonRun({
            cmd: 'pnpm',
            args: ['build'],
            spawnOptions: { cwd },
            log: { prefix: false },
          });
        });
      } else {
        nginxDockerfile = join(DIRS.STATIC_DATA, 'nginx.single.Dockerfile');
      }

      await eachRun('frontend docker build', async () => {
        await Promise.all([
          fse.copy(
            join(DIRS.STATIC_DATA, 'nginx.conf'),
            join(cwd, 'nginx.conf'),
          ),
          fse.copy(nginxDockerfile, join(cwd, 'nginx.Dockerfile')),
        ]);
        await commonRun({
          cmd: 'docker',
          args: [
            'build',
            '-t',
            frontendImageName,
            '-f',
            'nginx.Dockerfile',
            '.',
          ],
          spawnOptions: { cwd },
          log: { prefix: false },
        });
      });
    };
    const buildBackend = async (cwd: string) => {
      await eachRun('backend build', async () => {
        // const pnpmWorkspaceYaml = join(cwd, 'pnpm-workspace.yaml');
        // if (!(await fse.exists(pnpmWorkspaceYaml))) {
        //   await fse.writeFile(pnpmWorkspaceYaml, '');
        // }

        await commonRun({
          cmd: 'bash',
          args: ['build.sh'],
          spawnOptions: { cwd },
          log: { prefix: false },
        });
      });
      await eachRun('backend docker build', async () => {
        await commonRun({
          cmd: 'docker',
          args: ['build', '-t', backendImageName, '-f', 'Dockerfile', '.'],
          spawnOptions: { cwd },
          log: { prefix: false },
        });
      });
    };

    const status = await judgeDirectoryStructure({ dir: buildDir });

    logger?.log(JSON.stringify({ status: status.stack }), 'debug');

    if (status.stack === 'frontend') {
      await buildFrontend(status.dir);
    } else if (status.stack === 'fullstack') {
      await Promise.all([
        buildFrontend(status.frontendDir),
        buildBackend(status.backendDir),
      ]);
    }

    await eachRun('docker deploy', async () => {
      await fse.ensureDir(deployDir);

      const json = {
        name: stackName,
        networks: {
          'fsd-traefik_default': {
            external: true,
          },
        },
        services: {
          [frontendImageName]: {
            image: frontendImageName,
            restart: 'unless-stopped',
            environment: {
              TZ: 'Asia/Shanghai',
            },
            networks: ['fsd-traefik_default'],
            labels: [
              'traefik.enable=true',
              `traefik.http.routers.${id}.rule=Host(\`${domain}.localhost\`)`,
              `traefik.http.routers.${id}.entrypoints=web`,
              `traefik.http.services.${id}.loadbalancer.server.port=80`,
            ],
            deploy: {
              resources: {
                limits: {
                  memory: '1g',
                },
              },
            },
            healthcheck: {
              test: [
                'CMD-SHELL',
                'wget --quiet --tries=1 --spider -S http://127.0.0.1:80 2>&1 | grep "HTTP/.*200" || exit 1',
              ],
              interval: '10s',
              timeout: '5s',
              retries: 3,
            },
          },
        },
      };

      if (status.stack === 'fullstack') {
        Object.assign(json.services, {
          [backendImageName]: {
            image: backendImageName,
            restart: 'unless-stopped',
            environment: {
              TZ: 'Asia/Shanghai',
            },
            networks: ['fsd-traefik_default'],
            deploy: {
              resources: {
                limits: {
                  memory: '8g',
                },
              },
            },
            healthcheck: {
              test: [
                'CMD-SHELL',
                'wget --quiet --tries=1 --spider -S http://127.0.0.1:8888 2>&1 | grep "HTTP/.*200" || exit 1',
              ],
              interval: '10s',
              timeout: '5s',
              retries: 3,
            },
          },
        });

        Object.assign(json.services[frontendImageName].environment, {
          HOST_SERVER: `${backendImageName}:8888`,
        });
      }

      await fse.writeFile(dockerComposeYaml, stringify(json));

      await commonRun({
        cmd: 'docker',
        args: ['compose', 'up', '-d', '--remove-orphans'],
        spawnOptions: {
          cwd: deployDir,
        },
        log: { prefix: false },
      });
    });

    await eachRun('docker compose logs', async () => {
      await sleep(1e3 * 5);
      await commonRun({
        cmd: 'docker',
        args: ['compose', 'logs', '-t', '--tail=100'],
        spawnOptions: {
          cwd: deployDir,
        },
        log: { prefix: false },
      });
    });
  } else {
    throw new Error('无效操作');
  }
}
