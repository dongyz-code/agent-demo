import { spawnAsync } from './utils.js';

/** 通用，抛出异常 */
export const commonRun = async (item: Parameters<typeof spawnAsync>[0]) => {
  const { promise, stats } = await spawnAsync({
    log: false,
    ...item,
  });
  await promise;
  if (stats.status !== 'success') {
    const msg = `子进程处理失败: ${item.cmd} ${item.args.join(' ')}`;
    throw new Error(msg);
  }
  return stats;
};
