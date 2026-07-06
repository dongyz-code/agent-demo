import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** 按本地时区格式化日志日期目录。 */
export function formatLogDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 判断目录名是否符合本地日志日期目录格式。 */
export function isLogDateDir(name: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(name);
}

/** 返回指定时间之后的下一个本地自然日零点，用于懒轮换快速判断。 */
export function getNextLocalMidnightTime(date = new Date()) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
  ).getTime();
}

/** 清理超过保留天数的日期目录；失败时降级到 stderr，不影响主流程。 */
export function cleanupOldLogDirs(
  logDir: string,
  retentionDays: number,
  now: Date,
) {
  if (retentionDays <= 0) {
    return;
  }

  try {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const cutoffDate = formatLogDate(cutoff);

    readdirSync(logDir, { withFileTypes: true }).forEach((entry) => {
      if (!entry.isDirectory() || !isLogDateDir(entry.name)) {
        return;
      }
      if (entry.name >= cutoffDate) {
        return;
      }
      rmSync(join(logDir, entry.name), { recursive: true, force: true });
    });
  } catch (error) {
    writeFallback(error);
  }
}

/** stderr 兜底输出，避免 logger 初始化失败时递归调用自身。 */
export function writeFallback(error: unknown) {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
}
