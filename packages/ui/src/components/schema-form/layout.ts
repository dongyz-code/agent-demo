import type {
  RuntimeSchemaFormField,
  SchemaFormColumns,
  SchemaFormElProps,
  SchemaFormLayout,
  SchemaFormLayoutItem,
  SchemaFormMode,
  SchemaFormSearch,
  SchemaFormModel,
} from './type';
import type { CSSProperties } from 'vue';

/** 查询表单默认响应式列数，按 QueryFilter 思路随容器宽度收放。 */
const DEFAULT_SEARCH_COLUMNS: Required<Extract<SchemaFormColumns, object>> = {
  xs: 1,
  sm: 2,
  md: 3,
  lg: 4,
  xl: 4,
};

/** 默认普通表单列数。 */
const DEFAULT_FORM_COLUMNS = 1;

/** schema-form 内置的容器宽度断点。 */
const WIDTH_BREAKPOINTS = [
  { key: 'xs', max: 520 },
  { key: 'sm', max: 760 },
  { key: 'md', max: 1120 },
  { key: 'lg', max: 1360 },
  { key: 'xl', max: Infinity },
] as const;

/** schema-form 支持的断点 key。 */
type BreakpointKey = (typeof WIDTH_BREAKPOINTS)[number]['key'];

/** 按容器宽度解析当前断点；宽度未知时按桌面布局处理，避免服务端渲染阶段过窄。 */
function resolveBreakpoint(width?: number): BreakpointKey {
  if (!width || width <= 0) {
    return 'lg';
  }

  return WIDTH_BREAKPOINTS.find((item) => width < item.max)!.key;
}

/** 从断点对象中读取最合适的列数，缺省时向相邻断点兜底。 */
function resolveBreakpointColumns({
  columns,
  key,
}: {
  /** 断点列数配置。 */
  columns: Partial<Record<BreakpointKey, number>>;
  /** 当前断点。 */
  key: BreakpointKey;
}) {
  const keys = WIDTH_BREAKPOINTS.map((item) => item.key);
  const index = keys.indexOf(key);

  for (let i = index; i >= 0; i -= 1) {
    const value = columns[keys[i]!];
    if (value !== undefined) {
      return value;
    }
  }

  for (let i = index + 1; i < keys.length; i += 1) {
    const value = columns[keys[i]!];
    if (value !== undefined) {
      return value;
    }
  }

  return 1;
}

/** 将列数配置解析成当前容器宽度下使用的列数。 */
export function resolveColumnCount({
  columns,
  mode,
  width,
}: {
  /** 列数配置。 */
  columns?: SchemaFormColumns;
  /** 当前表单模式。 */
  mode: SchemaFormMode;
  /** 当前容器宽度。 */
  width?: number;
}): number {
  if (typeof columns === 'number') {
    return Math.max(1, Math.floor(columns));
  }

  const key = resolveBreakpoint(width);
  const nextColumns =
    columns ??
    (mode === 'search' ? DEFAULT_SEARCH_COLUMNS : { lg: DEFAULT_FORM_COLUMNS });

  return Math.max(
    1,
    Math.floor(resolveBreakpointColumns({ columns: nextColumns, key })),
  );
}

/** 解析查询表单在当前容器宽度下使用的 label 位置。 */
export function resolveSearchLabelPosition({
  width,
}: {
  /** 当前容器宽度。 */
  width?: number;
}): NonNullable<SchemaFormElProps['labelPosition']> {
  const key = resolveBreakpoint(width);
  return key === 'xs' || key === 'sm' ? 'top' : 'left';
}

/** 将 gap 配置转成 CSS 值；数字按 px 处理，查询模式默认更紧凑。 */
export function resolveGap({
  gap,
  mode,
}: {
  /** 栅格间距配置。 */
  gap?: SchemaFormLayout['gap'];
  /** 当前表单模式。 */
  mode: SchemaFormMode;
}): string {
  if (gap === undefined) {
    return mode === 'search' ? '12px 16px' : '16px 24px';
  }
  return typeof gap === 'number' ? `${gap}px` : gap;
}

/** 生成 grid 容器样式。 */
export function buildGridStyle({
  columns,
  gap,
  mode,
}: {
  /** 当前列数。 */
  columns: number;
  /** 当前间距。 */
  gap?: SchemaFormLayout['gap'];
  /** 当前表单模式。 */
  mode: SchemaFormMode;
}): CSSProperties {
  return {
    display: 'grid',
    gap: resolveGap({ gap, mode }),
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
  };
}

/** 将字段跨度限制在有效列数范围内。 */
function clampSpan(span: number | undefined, columns: number): number {
  if (!span || Number.isNaN(span)) {
    return 1;
  }
  return Math.min(columns, Math.max(1, Math.floor(span)));
}

/** 将字段 offset 限制在有效范围内。 */
function clampOffset(offset: number | undefined, columns: number): number {
  if (!offset || Number.isNaN(offset)) {
    return 0;
  }
  return Math.min(columns - 1, Math.max(0, Math.floor(offset)));
}

/** 计算字段 grid 位置和收起态可见性。 */
export function buildLayoutItems<T extends SchemaFormModel>({
  fields,
  columns,
  collapsed,
  collapsedRows,
  mode,
  reserveActionSlot,
}: {
  /** 运行时字段列表。 */
  fields: RuntimeSchemaFormField<T>[];
  /** 当前列数。 */
  columns: number;
  /** 当前是否收起。 */
  collapsed: boolean;
  /** 收起时保留的行数。 */
  collapsedRows: number;
  /** 当前表单模式。 */
  mode: SchemaFormMode;
  /** 收起时是否为内联操作区预留一个格子。 */
  reserveActionSlot?: boolean;
}): SchemaFormLayoutItem<T>[] {
  let cursor = 0;
  let row = 0;
  const collapsedSlots = Math.max(
    1,
    columns * collapsedRows - (reserveActionSlot ? 1 : 0),
  );

  return fields.map((field) => {
    const offset = clampOffset(field.column.colProps?.offset, columns);
    const span = field.column.colProps?.full
      ? columns
      : clampSpan(field.column.colProps?.span, columns);

    if (cursor + offset + span > columns) {
      row += 1;
      cursor = 0;
    }

    const start = cursor + offset;
    const end = start + span;
    const currentRow = row;
    const currentSlotEnd = currentRow * columns + end;

    cursor = end;
    if (cursor >= columns) {
      row += 1;
      cursor = 0;
    }

    const collapsedByCapacity = currentSlotEnd > collapsedSlots;
    const collapsedByField =
      field.column.search !== false && field.column.search?.collapsed === true;
    const visibleWhenCollapsed =
      mode !== 'search' ||
      !collapsed ||
      (!collapsedByCapacity && !collapsedByField);

    return {
      field,
      row: currentRow,
      style: {
        gridColumn: `${start + 1} / span ${span}`,
      },
      visibleWhenCollapsed,
    };
  });
}

/** 判断当前布局是否存在收起态会隐藏的字段。 */
export function hasCollapsedItems<T extends SchemaFormModel>(
  items: SchemaFormLayoutItem<T>[],
): boolean {
  return items.some((item) => !item.visibleWhenCollapsed);
}

/** 查询动作区样式，inline 模式下作为最后一个 grid item 渲染。 */
export function buildActionStyle({
  placement,
}: {
  /** 动作区位置。 */
  placement: SchemaFormSearch['actionPlacement'];
}): CSSProperties {
  if (placement === 'bottom') {
    return {};
  }
  return {
    gridColumn: 'auto / span 1',
  };
}
