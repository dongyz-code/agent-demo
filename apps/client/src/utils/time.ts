/** 时间分组键，键名保持稳定，展示文案由 labels 提供。 */
export type TimeGroup = 'today' | 'yesterday' | 'last7Days' | 'last30Days' | 'earlier';

/** 时间分组展示文案。 */
export const timeGroupLabels: Record<TimeGroup, string> = {
  today: '今日',
  yesterday: '昨日',
  last7Days: '近 7 天',
  last30Days: '近 30 天',
  earlier: '更早',
};

/** 时间分组展示顺序，调用方可直接用于渲染分组列表。 */
export const timeGroupOrder: TimeGroup[] = [
  'today',
  'yesterday',
  'last7Days',
  'last30Days',
  'earlier',
];

/**
 * 获取时间所属的自然日分组。
 *
 * @param timestamp 需要归类的时间戳或 Date 对象。
 * @param now 当前时间戳或 Date 对象；默认取系统当前时间。
 * @returns 时间分组键；目标时间或当前时间非法时归入 earlier，避免调用方额外容错。
 */
export function getTimeGroup(
  timestamp: number | Date,
  now: number | Date = Date.now(),
): TimeGroup {
  const targetTime = timestamp instanceof Date ? timestamp.getTime() : timestamp;
  const currentTime = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(targetTime) || !Number.isFinite(currentTime)) {
    return 'earlier';
  }

  const todayStart = new Date(currentTime);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(todayStart.getDate() - 1);
  const last7DaysStart = new Date(todayStart);
  last7DaysStart.setDate(todayStart.getDate() - 6);
  const last30DaysStart = new Date(todayStart);
  last30DaysStart.setDate(todayStart.getDate() - 29);

  if (targetTime >= todayStart.getTime()) {
    return 'today';
  }
  if (targetTime >= yesterdayStart.getTime()) {
    return 'yesterday';
  }
  if (targetTime >= last7DaysStart.getTime()) {
    return 'last7Days';
  }
  if (targetTime >= last30DaysStart.getTime()) {
    return 'last30Days';
  }
  return 'earlier';
}
