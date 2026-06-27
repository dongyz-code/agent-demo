## Why

当前 `packages/ui/src/components/form-items` 使用二维 `options` 描述表单，布局、字段渲染、选项加载、查询按钮和展开收起能力都耦合在一起，继续扩展会让 API 更难理解，也会让业务页继续手写搜索、重置、校验和字段布局逻辑。

需要新增一个独立的 schema 驱动表单组件，参考 antd-pro 的 JSON/columns 表单组织方式，为查询表单和普通编辑表单提供清晰、可扩展、类型友好的配置入口。

## What Changes

- 新增 `VSchemaForm` 组件，不在旧 `VFormItems` 上继续兼容二维 `options` 布局。
- 新增 `columns` 字段 schema API，字段使用 `dataIndex/title/valueType/fieldProps/formItemProps/colProps/search/form` 等配置组织。
- 支持兼容原有 `FormItem['data']` 控件类型，使旧表单字段可低成本迁移到新 schema。
- 支持查询表单模式，内置搜索、重置、自定义 action、展开收起、收起行数、自定义列数和按钮位置。
- 支持编辑表单模式，提供字段布局、控件渲染、必填/规则配置、禁用/只读/隐藏等基础能力。
- 支持静态枚举 `valueEnum`、异步选项 `request`、按字段变化重新加载选项的 `reloadOn`。
- 使用 CSS grid 实现列布局，替代旧的 Tailwind 静态列映射和 `range` 语义。
- 不引入 React 风格 `dependencies`；动态 `hidden/disabled/fieldProps/formItemProps` 通过 Vue 响应式函数配置表达。
- 保留旧 `VFormItems`，但新功能优先在 `VSchemaForm` 中实现，后续业务逐步迁移。

## Capabilities

### New Capabilities

- `schema-form-component`: 定义 schema 驱动表单组件的字段配置、查询表单行为、布局、动作区、选项加载和旧控件类型兼容规则。

### Modified Capabilities

- 无。

## Impact

- 影响 `packages/ui/src/components`，新增 `schema-form` 组件目录、导出入口和相关类型。
- 影响后续 `apps/admin` 查询表单和弹窗编辑表单的迁移方式，但本 change 不要求一次性替换所有旧页面。
- 不新增运行时第三方依赖，继续基于 Vue 3、Element Plus 和现有 workspace 工具包。
- 需要补充组件级单元测试，覆盖 schema normalize、布局计算、展开收起、查询提交、重置和旧 `FormItem['data']` 渲染兼容。
