import type { ApiSys } from '@/types';

/** 表清单行，来自表管理列表接口。 */
export type SysTableListItem =
  ApiSys.TableManagementAction['list']['resp']['list'][number];

/** 表结构详情，合并 schema 目标结构、数据库实态和差异结果。 */
export type SysTableDetail = ApiSys.TableManagementAction['detail']['resp'];

/** 表数据预览结果，用于详情弹窗中的分页预览。 */
export type SysTablePreview = ApiSys.TableManagementAction['preview']['resp'];

/** 表结构操作记录行，用于详情弹窗展示审计记录。 */
export type SysTableOperation =
  ApiSys.TableManagementAction['operation-list']['resp']['list'][number];

/** 表结构重置计划，执行阶段只使用计划 ID 和确认文本。 */
export type SysTablePlan = ApiSys.TableManagementAction['reset-plan']['resp'];

/** 表清单接口兼容响应，后端热更新未生效时可能暂时缺少总数。 */
export type SysTableListResponse = Omit<
  ApiSys.TableManagementAction['list']['resp'],
  'count'
> & {
  /** 过滤后的总数；新服务端会返回，旧运行实例可能缺失。 */
  count?: number;
};
