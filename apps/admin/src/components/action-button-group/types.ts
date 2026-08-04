import type { FunctionalComponent as IconType } from 'vue';

/** 操作按钮的 Element Plus 语义类型。 */
export type ActionButtonType =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

/** 可由按钮组直接渲染的单个操作。 */
export interface ActionButtonItem {
  /** 稳定标识；同名操作同时存在时必须提供。 */
  key?: string;
  /** 按钮和下拉菜单展示文案。 */
  label: string;
  /** 点击后执行的业务动作。 */
  handler: () => void | Promise<void>;
  /** 操作前置图标。 */
  icon?: IconType;
  /** 操作的颜色语义，删除等危险动作使用 danger。 */
  type?: ActionButtonType;
  /** 禁用时保留展示但不执行 handler。 */
  disabled?: boolean;
  /** 是否展示该操作，默认 true；为 false 时从按钮区与溢出菜单中一并排除。 */
  isShow?: boolean;
}
