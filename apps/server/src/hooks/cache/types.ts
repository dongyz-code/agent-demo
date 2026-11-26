/** 定义一个 JSON 数据缓存，同时登记管理端展示信息。 */
export interface CacheOptions {
  /** 稳定业务空间标识，只允许小写字母、数字、点和横线。 */
  name: string;
  /** 管理端显示的业务名称。 */
  label: string;
  /** 默认有效期，单位毫秒，必须为正整数。 */
  ttl: number;
  /** 管理端用途说明，可省略。 */
  description?: string;
  /** 是否允许有权限的管理员查看脱敏值，默认关闭。 */
  inspectable?: boolean;
}
