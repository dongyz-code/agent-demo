import type { SpawnOptions } from 'node:child_process';

export type LogOpts = {
  /** 是否启用日志 */
  enable?: boolean;
  /** 是否打印前缀 */
  prefix?: boolean;
};

export type ChildProcessExtraOpts = {
  /** child_process 的 spawn 参数 */
  spawnOptions?: SpawnOptions;
  /** timeout 超时时间(毫秒)，超过自动关闭，默认 2h ，设置为 0 则忽略超时 */
  timeout?: number;
  /** node 前置参数(file前)，追加固定的前置参数 */
  nodePrefixArgs?: string[];
  /** node 后置参数(file后)，追加固定的末尾参数 */
  nodeSuffixArgs?: string[];
  /** 是否打印日志 */
  log?: boolean | LogOpts;
  /** 日志打印函数 */
  logger?: {
    /** stdout 日志 */
    info: (...msgs: unknown[]) => void;
    /** stderr 日志 */
    error: (...msgs: unknown[]) => void;
  };
};

/** 子进程状态 */
export type Stats = {
  /** 待启动 / 进行中 / 执行成功 / 执行失败 / 进程启动失败 */
  status: 'to-be-start' | 'pending' | 'success' | 'failed' | 'start-error';
  /** 日志, 不区分 stdout 和 stderr */
  logs: string[];
  /** stdout 日志 */
  stdout: string[];
  /** stderr 日志 */
  stderr: string[];
  /** 子进程的命令 */
  cmd: string;
  /** 子进程的参数 */
  args: string[];
  /** 子进程的命令(cmd + args) */
  command: string;
  /** 子进程的PID，进程启动失败时为 undefined */
  pid?: number;
  /** 子进程的退出码，进程启动失败时为 undefined */
  code?: number | null;
  /** 子进程的退出信号，进程启动失败时为 undefined */
  signal?: NodeJS.Signals | null;
};
