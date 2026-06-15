import type { Logger } from '@repo/utils-node';

export type DeployParams = {
  id: string;
  /** 应用名称 */
  name: string;
  /** 目的 */
  purpose: 'deploy' | 'stop' | 'restart';
  logger?: Logger;
};
