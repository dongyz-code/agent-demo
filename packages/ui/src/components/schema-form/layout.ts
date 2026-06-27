import type {
  RuntimeSchemaFormField,
  SchemaFormColumns,
  SchemaFormLayout,
  SchemaFormLayoutItem,
  SchemaFormMode,
  SchemaFormSearch,
  SchemaFormModel,
} from './type';
import type { CSSProperties } from 'vue';

/** 默认查询表单列数。 */
const DEFAULT_SEARCH_COLUMNS = 4;

/** 默认普通表单列数。 */
const DEFAULT_FORM_COLUMNS = 1;

/** 将列数配置解析成当前使用的固定列数；断点对象按最大可用断点取值。 */
export function resolveColumnCount({
  columns,
  mode,
}: {
  /** 列数配置。 */
  columns?: SchemaFormColumns;
  /** 当前表单模式。 */
  mode: SchemaFormMode;
}): number {
  if (typeof columns === 'number') {
    return Math.max(1, Math.floor(columns));
  }
  if (columns) {
    return Math.max(
      1,
      Math.floor(
        columns.xl ?? columns.lg ?? columns.md ?? columns.sm ?? columns.xs ?? 1,
      ),
    );
  }
  return mode === 'search' ? DEFAULT_SEARCH_COLUMNS : DEFAULT_FORM_COLUMNS;
}

/** 将 gap 配置转成 CSS 值；数字按 px 处理。 */
export function resolveGap(gap?: SchemaFormLayout['gap']): string {
  if (gap === undefined) {
    return '16px 24px';
  }
  return typeof gap === 'number' ? `${gap}px` : gap;
}

/** 生成 grid 容器样式。 */
export function buildGridStyle({
  columns,
  gap,
}: {
  /** 当前列数。 */
  columns: number;
  /** 当前间距。 */
  gap?: SchemaFormLayout['gap'];
}): CSSProperties {
  return {
    display: 'grid',
    gap: resolveGap(gap),
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
}): SchemaFormLayoutItem<T>[] {
  let cursor = 0;
  let row = 0;

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

    cursor = end;
    if (cursor >= columns) {
      row += 1;
      cursor = 0;
    }

    const collapsedByRow = currentRow >= collapsedRows;
    const collapsedByField =
      field.column.search !== false && field.column.search?.collapsed === true;
    const visibleWhenCollapsed =
      mode !== 'search' || !collapsed || (!collapsedByRow && !collapsedByField);

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
  columns,
  placement,
}: {
  /** 当前列数。 */
  columns: number;
  /** 动作区位置。 */
  placement: SchemaFormSearch['actionPlacement'];
}): CSSProperties {
  if (placement === 'bottom') {
    return {};
  }
  return {
    gridColumn: `auto / span ${Math.min(columns, 1)}`,
  };
}
