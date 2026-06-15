import { fse } from '@repo/utils-node';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/** 每次获取的时候尝试清除临时文件夹 */
export function initTempDirs({
  tempDir,
  keepDay = 3,
  duration = 1e3 * 60 * 60 * 24,
  enableRemove = true,
}: {
  /** 指定临时目录文件夹 */
  tempDir: string;
  /** 临时目录最大保留天数（整数） */
  keepDay?: number;
  /** 两次清除目录的最小时间间隔（每隔多长时间清理一次目录, 默认1天）, 不使用定时器了，每次调用获取的时候判断一次 */
  duration?: number;
  /** 是否启用清理 */
  enableRemove?: boolean;
}) {
  if (keepDay < 1) {
    keepDay = 1;
  }

  let lastRemoveTimestamp = 0;

  /** 移除超过 maxDuration 的临时文件夹 */
  async function removeDirs(current: {
    /** 日期 */
    date: Date;
    /** 毫秒时间戳 */
    dateNum: number;
  }) {
    if (!enableRemove) {
      return;
    }

    const { date, dateNum } = current;
    if (dateNum - lastRemoveTimestamp < duration) {
      return;
    }

    lastRemoveTimestamp = dateNum;

    const dirs = await fse.readdir(tempDir);

    date.setDate(date.getDate() - keepDay);
    const dateStr = date.toJSON().slice(0, 10);

    const list = dirs.filter((x) => x < dateStr);

    await Promise.all(list.map((x) => fse.remove(join(tempDir, x))));
  }

  async function get() {
    const date = new Date();

    const dir = join(tempDir, date.toJSON().slice(0, 10), randomUUID());
    await fse.ensureDir(dir);

    removeDirs({ date, dateNum: date.getTime() });

    return dir;
  }

  return {
    /** 获取临时目录 */
    get,
  };
}
