import { dayJsformat } from '@repo/utils-common';
import { fse } from '../../utils/runtime.js';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

import type { ChildProcess } from 'node:child_process';
import type { ChildProcessExtraOpts, LogOpts, Stats } from './type.js';

/** 默认子进程超时时间 30min */
const DEFAULT_TIMEOUT = 1e3 * 60 * 30;

/** 读取目录下的该文件, 文件有后缀 */
export async function findFileByName(dir: string, name: string) {
  const files = await fse.readdir(dir);
  const item = files.find((x) => x.startsWith(name + '.'));

  if (!item) {
    throw new Error(`${name} not found in ${dir}`);
  }

  const file = join(dir, item);
  const stats = await fse.stat(file);

  if (!stats.isFile()) {
    throw new Error(`${name} is not a file in ${dir}`);
  }

  return file;
}

/** 读取目录下的该文件, 文件有后缀 */
export function findFileByNameSync(dir: string, name: string) {
  const files = fse.readdirSync(dir);
  const item = files.find((x) => x.startsWith(name + '.'));

  if (!item) {
    throw new Error(`${name} not found in ${dir}`);
  }

  const file = join(dir, item);
  const stats = fse.statSync(file);

  if (!stats.isFile()) {
    throw new Error(`${name} is not a file in ${dir}`);
  }

  return file;
}

export function useChildProcessKill({
  child,
  closeTimeout = 1e3 * 1,
  pendingTimeout = DEFAULT_TIMEOUT,
}: {
  child: ChildProcess;
  /** 超时时间(毫秒)，关闭子进程超时时间，超时发送强制关闭信号 */
  closeTimeout?: number;
  /** 超时时间(毫秒)，子进程运行时间，超时主动调用关闭子进程, 设置为 0 则忽略超时 */
  pendingTimeout?: number;
}) {
  const stats = {
    /** 子进程是否收到终止信号 */
    isChildProcessKilled: false,
    /** 子进程是否退出 */
    isChildProcessExited: false,
  };

  type ExitValue = { code: number | null; signal: NodeJS.Signals | null };

  /** 子进程退出 resolve */
  let resolve: ((value: ExitValue) => void) | undefined = undefined;
  /** 子进程退出 promise */
  let promise: Promise<ExitValue> | undefined = undefined;

  /** 关闭子进程超时 Timer */
  let closeTimeoutId: NodeJS.Timeout | undefined = undefined;
  /** 子进程运行超时 Timer */
  let pendingTimeoutId: NodeJS.Timeout | undefined = undefined;

  /** 杀死子进程, killed 只是表示收到了退出信号，并不表示子进程真的退出了 */
  async function kill() {
    if (stats.isChildProcessKilled) {
      return await promise!;
    }
    promise = new Promise((_resolve) => {
      resolve = _resolve;
    });
    stats.isChildProcessKilled = true;
    /** 发送终止信号 默认 'SIGTERM' */
    child.kill();

    /** 子进程收到信号后，超时后，检测到还在运行，则强制关闭子进程 */
    closeTimeoutId = setTimeout(() => {
      /** https://nodejs.org/api/child_process.html#subprocessexitcode */
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, closeTimeout);

    return await promise;
  }

  /** 运行超时关闭子进程 */
  if (pendingTimeout > 0) {
    pendingTimeoutId = setTimeout(kill, pendingTimeout);
  }

  /** 清理全部事件 */
  function cleanup() {
    clearTimeout(pendingTimeoutId);
    clearTimeout(closeTimeoutId);
    resolve = undefined;
    promise = undefined;
  }

  child.on('close', (code, signal) => {
    resolve?.({ code, signal });
    stats.isChildProcessExited = true;
    cleanup();
  });

  return {
    kill,
    stats,
  };
}

/** 文件子进程处理 */
export async function spawnAsync({
  cmd,
  args,
  spawnOptions,
  log = true,
  timeout = DEFAULT_TIMEOUT,
}: {
  /** 子进程的命令 */
  cmd: string;
  /** 子进程的参数 */
  args: string[];
} & ChildProcessExtraOpts) {
  /**
   * 一旦子进程成功生成，就会触发 'spawn' 事件。如果子进程没有成功生成，则不会触发 'spawn' 事件，而是触发 'error' 事件
   *
   * 生成成功才会有PID
   *
   * 1. 等待进程启动或者启动异常
   * 2. 正常启动后返回对应的 promise
   */

  const stats: Stats = {
    status: 'to-be-start',
    logs: [],
    stdout: [],
    stderr: [],
    cmd,
    args,
    command: `${cmd} ${args.join(' ')}`,
  };

  const utils: {
    resolve?: ((value: unknown) => void) | undefined;
    reject?: ((reason?: any) => void) | undefined;
  } = {};

  const promise = new Promise((resolve, reject) => {
    utils.resolve = resolve;
    utils.reject = reject;
  });

  const child = spawn(cmd, args, {
    ...spawnOptions,
    env: {
      ...process.env,
      ...spawnOptions?.env,
    },
  });

  const { kill } = useChildProcessKill({ child, pendingTimeout: timeout });

  const logOpts: LogOpts = {
    enable: true,
    prefix: true,
  };
  if (log) {
    if (typeof log === 'object') {
      Object.assign(logOpts, log);
    }
  } else {
    logOpts.enable = false;
  }

  const logger = (
    role: 'info' | 'error',
    label: 'ERROR' | 'STDOUT' | 'STDERR' | 'SPAWN' | 'CLOSE',
    ...msgs: unknown[]
  ) => {
    if (!logOpts.enable) {
      return;
    }
    if (!logOpts.prefix) {
      console[role](...msgs);
      return;
    }

    let msg = [
      'CHILD_PROCESS',
      stats.pid,
      label,
      `[${dayJsformat(undefined, 'YYYY-MM-DD HH:mm:ss')}]`,
    ]
      .filter((x) => x)
      .join(' ');
    if (msgs.length) {
      msg += ':';
    }
    console[role](msg, ...msgs);
  };

  child.stderr?.on('data', (e: Buffer) => {
    const val = e.toString().trim();

    stats.logs.push(val);
    stats.stderr.push(val);

    logger('error', 'STDERR', val);
  });

  child.stdout?.on('data', (e: Buffer) => {
    const val = e.toString().trim();

    stats.logs.push(val);
    stats.stdout.push(val);

    logger('info', 'STDOUT', val);
  });

  child.on('close', (code, signal) => {
    stats.status = code === 0 ? 'success' : 'failed';
    utils.resolve?.(code);

    stats.code = code;
    stats.signal = signal;

    stats.logs.push(`EXIT: ${code} ${signal}`);

    logger(code === 0 ? 'info' : 'error', 'CLOSE', code, signal);
  });

  /** 等待进程启动 */
  await new Promise<boolean>((resolve) => {
    child.on('spawn', () => {
      stats.status = 'pending';
      stats.pid = child.pid;

      logger('info', 'SPAWN', stats.command);

      resolve(true);
    });
    child.on('error', (error) => {
      stats.status = 'start-error';

      const msgs = [error.stack ?? ''];

      stats.logs.push(msgs.join(' '));
      stats.stderr.push(msgs.join(' '));

      logger('error', 'ERROR', ...msgs);

      resolve(false);
      utils.resolve?.(false);
    });
  });

  return {
    /** 子进程 */
    child,
    /** 等待进程启动并退出 或者 进程启动异常 */
    promise,
    /** 进程状态 */
    stats,
    /** 杀死子进程 */
    kill,
  };
}

/** nodejs 文件处理 */
export async function spawnNodeAsync({
  dir,
  filename,
  args,
  opts,
  nodePrefixArgs,
  nodeSuffixArgs,
  ...rest
}: {
  dir: string;
  filename: string;
  args: string[];
  opts?: {
    'max-old-space-size'?: number;
  };
} & ChildProcessExtraOpts) {
  const file = findFileByNameSync(dir, filename);
  args.unshift(file);
  if (file.endsWith('.ts')) {
    args.unshift(`--import`, `tsx`);
  }
  if (opts?.['max-old-space-size']) {
    args.unshift(`--max-old-space-size=${opts['max-old-space-size']}`);
  }
  if (nodePrefixArgs?.length) {
    args.unshift(...nodePrefixArgs);
  }
  if (nodeSuffixArgs?.length) {
    args.push(...nodeSuffixArgs);
  }
  return await spawnAsync({
    cmd: 'node',
    args,
    ...rest,
  });
}
