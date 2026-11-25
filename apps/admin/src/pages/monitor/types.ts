/** 计划搜索提交后才生效。 */
export type ScheduleSearchForm = {
  /** 计划名称关键字。 */
  search?: string;
  /** 持久化启停筛选。 */
  enabled?: boolean;
};
/** 触发台账搜索条件，与路由中的计划标识组合。 */
export type RunSearchForm = {
  /** 计划名称关键字。 */
  search?: string;
  /** 执行或跳过状态。 */
  status?: string;
  /** 自动或人工触发。 */
  trigger?: string;
  /** 计划时间范围。 */
  time?: string[];
};
/** 键名查询按字面包含匹配。 */
export type CacheSearchForm = {
  /** 不带应用前缀的键名关键字。 */
  search?: string;
};
