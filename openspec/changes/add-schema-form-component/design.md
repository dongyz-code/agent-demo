## Context

现有 `VFormItems` 以 `FormItem[][]` 表达字段和行布局，适合早期简单表单，但当查询表单需要搜索/重置按钮、展开收起、自定义列数、字段转换、异步选项和更丰富控件时，二维数组会把“字段组织”和“布局结果”绑定在一起，导致 API 难以扩展。

新组件将作为独立能力引入，命名为 `VSchemaForm`，不在旧 `VFormItems` 上追加兼容逻辑。旧组件保留，业务页面可逐步迁移。新组件参考 antd-pro 的 columns/schema 表单思路，但采用 Vue 和 Element Plus 的组合方式，优先保障类型清晰、布局可测、迁移成本可控。

## Goals / Non-Goals

**Goals:**

- 提供 `columns` 驱动的 schema 表单组件，覆盖查询表单和普通编辑表单。
- 支持 `mode="search"` 时内置搜索、重置、展开收起、自定义 action 区。
- 支持自定义列数、字段跨度、底部或行内 action 布局。
- 支持旧 `FormItem['data']` 控件类型，降低从 `VFormItems` 迁移到 `VSchemaForm` 的成本。
- 支持 `valueType`、`valueEnum`、`request`、`reloadOn`、`fieldProps`、`formItemProps`、`hidden`、`disabled`、`readonly` 等 schema 配置。
- 将 normalize、布局计算、字段渲染、选项加载和提交转换拆成独立模块，便于测试和后续扩展。

**Non-Goals:**

- 不在本 change 中批量迁移所有 `apps/admin` 页面。
- 不删除旧 `VFormItems`。
- 不引入新的表单运行时依赖。
- 不实现 React 风格 `dependencies` 配置；Vue 响应式函数配置足以表达动态渲染状态。
- 不实现复杂动态表单数组、嵌套对象编辑器、拖拽表单设计器等能力。

## Decisions

### 新组件独立实现

`VSchemaForm` 新增在 `packages/ui/src/components/schema-form` 下，并通过 `packages/ui/src/components/index.ts` 导出。旧 `form-items` 目录不承载新逻辑。

备选方案是在 `VFormItems` 上新增 `columns` props，但这会让旧二维布局、旧 labelWidth 计算、旧 option 加载和新 schema 流程长期共存，增加维护成本。独立组件可以让新 API 更干净，也避免破坏现有页面。

### 使用 columns 作为主 API

组件 props 以 `columns: SchemaFormColumn<T>[]` 为核心：

```ts
type SchemaFormColumn<T> = {
  dataIndex: keyof T | string;
  title?: string;
  valueType?: SchemaValueType;
  data?: FormItem['data'];
  valueEnum?: Record<string, string | { text: string; disabled?: boolean }>;
  request?: (ctx: SchemaFormRequestCtx<T>) => Promise<SchemaFormOption[]>;
  reloadOn?: Array<keyof T | string>;
  fieldProps?: Record<string, unknown> | ((ctx: SchemaFormColumnCtx<T>) => Record<string, unknown>);
  formItemProps?: SchemaFormItemProps | ((ctx: SchemaFormColumnCtx<T>) => SchemaFormItemProps);
  colProps?: { span?: number; offset?: number; full?: boolean };
  search?: false | { order?: number; collapsed?: boolean; transform?: (value: unknown, form: T) => Record<string, unknown> };
  form?: false;
  hidden?: boolean | ((ctx: SchemaFormColumnCtx<T>) => boolean);
  disabled?: boolean | ((ctx: SchemaFormColumnCtx<T>) => boolean);
  readonly?: boolean | ((ctx: SchemaFormColumnCtx<T>) => boolean);
  renderFormItem?: (ctx: SchemaFormRenderCtx<T>) => unknown;
};
```

`dataIndex/title/valueType` 对齐 antd-pro 的心智模型，`fieldProps/formItemProps` 区分控件 props 和容器 props，`colProps` 只负责布局。

### 兼容旧控件类型而非旧布局

新组件不接受旧 `options: FormItem[][]`。迁移时字段从：

```ts
{ label, key, range, required, data }
```

改为：

```ts
{ title: label, dataIndex: key, colProps: { span: range }, formItemProps: { required }, data }
```

当 column 提供 `data` 时，优先使用旧 `FormItem['data']` 渲染路径；当没有 `data` 时，使用 `valueType` 渲染路径。这样可以兼容现有 `input/select/date-picker/custom/component` 等控件类型，同时避免旧 `range` 和二维行结构进入新 API。

### 不提供 dependencies，异步请求使用 reloadOn

动态 `hidden/disabled/readonly/fieldProps/formItemProps` 会在 Vue computed/render 上下文中执行，函数内部读取 `form.xxx` 即可由 Vue 响应式系统跟踪。

异步 `request` 不使用隐式依赖，否则任意字段变化都可能触发选项请求。需要重新加载选项的字段使用 `reloadOn` 明确声明触发字段。选项加载模块需要处理竞态：较旧请求晚返回时不得覆盖较新请求结果。

### 布局使用 CSS grid 和纯函数计算

布局模块输入 normalized columns、模式、列数、收起状态和 action 配置，输出可渲染字段和 grid style。列数支持固定数字，并预留响应式断点配置：

```ts
type SchemaFormColumns = number | Partial<Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', number>>;
```

实现层使用 CSS 变量或内联 style 设置 `grid-template-columns`，不再依赖 Tailwind 静态类映射。`colProps.span` 表示字段占几列，`full` 表示占满当前行。收起状态按计算后的行号隐藏字段，`search.collapsed` 可指定字段默认只在展开后显示。

### 查询动作区是组件能力

搜索、重置、展开收起和额外 action 不作为普通字段渲染，而由 `search` 配置和 `actions` slot 管理。默认事件：

- `submit`: 输出经过 `search.transform` 处理后的查询参数和原始 form。
- `reset`: 重置到 `initialValues` 或挂载时快照，并触发事件。
- `action`: 触发自定义 action。
- `update:collapsed`: 支持外部控制展开收起。

Vue 自定义能力通过 slot 暴露，避免把 React 风格 `optionRender` 作为主定制方式：

- `#actions`
- `#field-{dataIndex}`
- `#label-{dataIndex}`

### 基于 Element Plus Form 提供校验和暴露方法

`VSchemaForm` 内部使用 `ElForm` 和 `ElFormItem` 承载 label、rules、校验状态。组件通过 `defineExpose` 暴露：

- `validate()`
- `validateField(fields)`
- `resetFields()`
- `clearValidate(fields?)`
- `submit()`
- `reset()`
- `toggleCollapsed()`

这让业务页可以在弹窗确认、查询按钮或自定义 action 中复用组件行为。

## Risks / Trade-offs

- 新旧组件并存会产生短期重复维护成本。→ 通过明确迁移映射和只在新组件扩展新功能降低长期成本。
- `data` 和 `valueType` 同时存在可能造成歧义。→ 约定 `data` 优先，开发环境可提示不要同时配置。
- `fieldProps` 等函数依赖 Vue 响应式上下文，若业务解构 `form` 后使用非响应式值，可能失去更新。→ 类型和文档中强调读取 `ctx.form`。
- 异步 `request` 可能频繁触发或出现竞态。→ 仅通过 `reloadOn` 触发重载，并用请求序号忽略过期响应。
- 响应式列数会增加实现复杂度。→ 首版先保证固定列数稳定，断点配置可通过 CSS 变量和测试逐步完善。
- 旧 `FormItem['data']` 的部分半成品能力可能继续暴露。→ 新组件只保证控件渲染兼容，校验、禁用、只读、转换由新 schema 层统一处理。
