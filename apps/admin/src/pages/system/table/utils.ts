import { dayJsformat } from '@repo/utils-browser';

import type { ApiSys } from '@/types';

/**
 * 返回差异状态的中文标签。
 *
 * @param level 后端返回的表结构差异级别。
 * @returns 页面展示用的中文状态。
 */
export function diffLabel(level: ApiSys.TableDiffLevel) {
  return {
    synced: '一致',
    different: '有差异',
    missing: '缺失',
  }[level];
}

/**
 * 返回差异状态对应的 Element Plus 标签类型。
 *
 * @param level 后端返回的表结构差异级别。
 * @returns Element Plus tag 的颜色类型。
 */
export function diffTagType(level: ApiSys.TableDiffLevel) {
  return {
    synced: 'success',
    different: 'warning',
    missing: 'danger',
  }[level] as 'success' | 'warning' | 'danger';
}

/**
 * 返回结构操作类型的中文标签。
 *
 * @param type 服务端保存的结构操作类型。
 * @returns 页面展示用动作名称。
 */
export function operationTypeLabel(type: ApiSys.TableStructureOpType) {
  return {
    reset: '重置',
    sync: '同步',
  }[type];
}

/**
 * 返回结构操作状态的中文标签。
 *
 * @param status 服务端保存的结构操作状态。
 * @returns 页面展示用状态名称。
 */
export function operationStatusLabel(status: ApiSys.TableStructureOpStatus) {
  return {
    planned: '待执行',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    expired: '已过期',
    blocked: '已阻塞',
  }[status];
}

/**
 * 返回结构操作状态对应的标签颜色。
 *
 * @param status 服务端保存的结构操作状态。
 * @returns Element Plus tag 类型。
 */
export function operationStatusTagType(
  status: ApiSys.TableStructureOpStatus,
) {
  return {
    planned: 'warning',
    running: 'primary',
    completed: 'success',
    failed: 'danger',
    expired: 'info',
    blocked: 'danger',
  }[status] as 'warning' | 'primary' | 'success' | 'danger' | 'info';
}

/**
 * 格式化接口返回的时间。
 *
 * @param value 接口返回的时间值，空值表示没有记录。
 * @returns 管理端列表展示的时间文本。
 */
export function formatTime(value: Date | string | null) {
  return value ? dayJsformat(value, 'YYYY-MM-DD HH:mm:ss') : '-';
}
