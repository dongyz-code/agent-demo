import { dayJsformat } from '@repo/utils-browser';
import type { ScheduleRunInfo } from '@/types';
import type { SchemaFormColumn, TableRow } from '@repo/ui';
import type {
  ScheduleSearchForm,
  RunSearchForm,
  CacheSearchForm,
} from './types';

/** 常见周期同时用于编辑和列表说明，复杂表达式始终显示原文。 */
export const cronPresets = [
  { label: '每分钟', value: '* * * * *' },
  { label: '每 10 分钟', value: '*/10 * * * *' },
  { label: '每小时', value: '0 * * * *' },
  { label: '每天零点', value: '0 0 * * *' },
  { label: '每周一零点', value: '0 0 * * 1' },
];
/** 计划搜索采用服务端分页，启停与运行状态独立。 */
export const scheduleSearchColumns: SchemaFormColumn<ScheduleSearchForm>[] = [
  {
    dataIndex: 'search',
    title: '计划名称',
    valueType: 'text',
    fieldProps: { clearable: true, placeholder: '搜索计划名称' },
  },
  {
    dataIndex: 'enabled',
    title: '调度状态',
    valueType: 'select',
    valueEnum: { true: '已启用', false: '已暂停' },
    fieldProps: { clearable: true },
  },
];
/** 状态显示文案，与任务中心生命周期保持一致。 */
export const runLabels: Record<ScheduleRunInfo['status'], string> = {
  queued: '排队中',
  running: '执行中',
  retrying: '等待重试',
  succeeded: '成功',
  failed: '失败',
  timed_out: '已超时',
  canceled: '已取消',
  skipped: '已跳过',
};
/** 执行记录独立筛选，可直接定位失败与人工操作。 */
export const runSearchColumns: SchemaFormColumn<RunSearchForm>[] = [
  {
    dataIndex: 'search',
    title: '计划名称',
    valueType: 'text',
    fieldProps: { clearable: true },
  },
  {
    dataIndex: 'status',
    title: '执行状态',
    valueType: 'select',
    valueEnum: runLabels,
    fieldProps: { clearable: true },
  },
  {
    dataIndex: 'trigger',
    title: '触发方式',
    valueType: 'select',
    valueEnum: { scheduled: '自动调度', manual: '人工执行' },
    fieldProps: { clearable: true },
  },
  {
    dataIndex: 'time',
    title: '计划时间',
    valueType: 'dateRange',
    fieldProps: { type: 'datetimerange', valueFormat: 'YYYY-MM-DDTHH:mm:ssZ' },
  },
];
/** 计划列表聚焦调度配置和最近结果，详细参数放入编辑抽屉。 */
export const scheduleRows: TableRow[] = [
  { label: '计划名称', value: 'name', slot: 'name', minWidth: 210 },
  { label: '执行周期', value: 'cron', slot: 'cron', minWidth: 170 },
  { label: '调度', value: 'enabled', slot: 'enabled', width: 90 },
  { label: '最近执行', value: 'lastRun', slot: 'lastRun', minWidth: 150 },
  { label: '下次执行', value: 'nextRunAt', slot: 'nextRunAt', minWidth: 180 },
  { label: '操作', value: 'actions', slot: 'actions', minWidth: 230 },
];
/** 执行台账保留跳过记录，并展示重试次数。 */
export const runRows: TableRow[] = [
  { label: '计划名称', value: 'scheduleName', minWidth: 180 },
  { label: '计划时间', value: 'plannedAt', slot: 'plannedAt', minWidth: 180 },
  { label: '触发方式', value: 'trigger', slot: 'trigger', width: 110 },
  { label: '状态', value: 'status', slot: 'status', width: 110 },
  { label: '执行次数', value: 'attempts', width: 95 },
  { label: '说明', value: 'message', minWidth: 230 },
  { label: '操作', value: 'actions', slot: 'actions', width: 90 },
];
/** Redis 键查询不接受原始 glob。 */
export const cacheSearchColumns: SchemaFormColumn<CacheSearchForm>[] = [
  {
    dataIndex: 'search',
    title: '缓存键',
    valueType: 'text',
    fieldProps: { clearable: true, placeholder: '按键名关键字查找' },
  },
];
/** Redis 列表只返回键名、实际类型和 TTL。 */
export const cacheRows: TableRow[] = [
  { label: '缓存键', value: 'key', minWidth: 220 },
  { label: '类型', value: 'type', width: 100 },
  { label: '剩余有效期', value: 'ttl', slot: 'ttl', minWidth: 130 },
  { label: '操作', value: 'actions', slot: 'actions', width: 140 },
];

/**
 * ISO 时间在浏览器时区展示。
 * @param value 后端时间或空值。
 * @returns 可读本地时间。
 */
export function monitorTime(value?: string | null): string {
  if (!value) return '—';
  return dayJsformat(value, 'YYYY-MM-DD HH:mm:ss');
}
/**
 * 显示常用周期的自然语言，保留自定义表达式。
 * @param cron 表达式。
 * @returns 周期描述。
 */
export function cronText(cron: string): string {
  return cronPresets.find((item) => item.value === cron)?.label ?? '自定义周期';
}
/**
 * 执行状态颜色，跳过与取消不使用失败色。
 * @param status 生命周期。
 * @returns 标签语义色。
 */
export function runStatusType(status: ScheduleRunInfo['status']) {
  if (status === 'succeeded') return 'success';
  if (status === 'failed' || status === 'timed_out') return 'danger';
  if (status === 'running') return 'primary';
  if (status === 'queued' || status === 'retrying') return 'warning';
  return 'info';
}
/**
 * 把 Redis TTL 转为用户可理解的剩余时间。
 * @param ttl Redis 秒数，负数有协议含义。
 * @returns 有效期文案。
 */
export function ttlText(ttl: number): string {
  if (ttl === -1) return '永久有效';
  if (ttl === -2) return '已过期';
  if (ttl < 60) return `${ttl} 秒`;
  if (ttl < 3600) return `${Math.floor(ttl / 60)} 分 ${ttl % 60} 秒`;
  return `${Math.floor(ttl / 3600)} 小时`;
}
