import { Cron } from 'croner';

/**
 * 计算表达式未来触发，短生命周期计时器始终停止。
 * @param cron Cron 表达式。
 * @param timezone IANA 时区。
 * @param after 计算起点。
 * @param count 预览数量。
 * @returns 严格晚于起点的触发时间。
 */
export function nextScheduleDates(
  cron: string,
  timezone: string,
  after = new Date(),
  count = 5,
): Date[] {
  if (!cron.trim() || !timezone.trim()) throw new Error('Cron 和时区不能为空');
  // 显式验证 IANA 时区，避免部署机器时区影响执行。
  new Intl.DateTimeFormat('zh-CN', { timeZone: timezone }).format(after);
  const job = new Cron(cron, { timezone, paused: true });
  try {
    const dates = job.nextRuns(count, after);
    if (!dates.length) throw new Error('表达式没有未来可执行时间');
    return dates;
  } finally {
    job.stop();
  }
}
