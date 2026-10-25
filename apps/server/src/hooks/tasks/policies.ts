/** 任务列表未指定分页时返回的默认数量。 */
export const DEFAULT_TASK_PAGE_SIZE = 10;

/** 单次任务列表查询允许返回的最大数量。 */
export const MAX_TASK_PAGE_SIZE = 200;

/** 经过边界收敛后的任务列表分页参数。 */
export interface TaskPage {
  /** 从 0 开始的记录偏移量。 */
  offset: number;
  /** 当前页最多返回的记录数量。 */
  size: number;
}

/**
 * 将外部传入的 `[offset, end)` 分页区间收敛到安全范围。
 *
 * @param limit 外部传入的分页区间；缺失或不足两个值时使用默认页。
 * @returns 非负偏移量和不超过上限的页大小。
 */
export function normalizeTaskPage(limit?: number[]): TaskPage {
  if (!limit || limit.length < 2) {
    return { offset: 0, size: DEFAULT_TASK_PAGE_SIZE };
  }
  const rawOffset = Number.isFinite(limit[0]) ? Math.floor(limit[0] ?? 0) : 0;
  const offset = Math.max(0, rawOffset);
  const rawEnd = Number.isFinite(limit[1])
    ? Math.floor(limit[1] ?? offset)
    : offset;
  const end = Math.max(offset, rawEnd);
  const size = Math.min(MAX_TASK_PAGE_SIZE, Math.max(1, end - offset));
  return { offset, size };
}

/**
 * 判断当前 attempt 失败后是否仍允许自动重试。
 *
 * @param attempt 从 1 开始的当前执行次数。
 * @param maxRetries 首次执行之外允许的重试次数。
 * @returns 当前执行次数未超过重试预算时返回 true。
 */
export function shouldRetryTaskAttempt(
  attempt: number,
  maxRetries: number,
): boolean {
  return attempt <= maxRetries;
}
