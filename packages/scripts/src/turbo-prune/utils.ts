import chalk from 'chalk';
import { spawnAsync } from '@repo/utils-node';
import { relative } from 'node:path';

async function run({
  command,
  index,
  total,
  cwd,
}: {
  command: string;
  index: number;
  total: number;
  cwd?: string;
}) {
  const [cmd, ...args] = command.split(/ +/).filter((x) => x);

  const commandStringify = [cmd, ...args].join(' ');

  console.log('\n');
  console.log(chalk.bold.green(`${index + 1}/${total}: ${commandStringify}`));
  console.log('\n');

  const { promise } = await spawnAsync({
    cmd,
    args,
    spawnOptions: {
      stdio: 'inherit',
      cwd,
    },
  });
  await promise;
}

/** CLI 命令执行 */
export async function commandsRun(
  commands: string[],
  {
    cwd,
  }: {
    cwd?: string;
  } = {},
) {
  for (let i = 0; i < commands.length; i++) {
    await run({
      command: commands[i],
      index: i,
      total: commands.length,
      cwd,
    });
  }
}

export function getRelative(form: string, to: string) {
  return relative(form, to)
    .split(/\\+|\/+/g)
    .filter((x) => x)
    .join('/');
}
