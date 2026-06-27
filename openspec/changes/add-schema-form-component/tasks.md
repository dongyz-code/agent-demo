## 1. 组件骨架与类型

- [x] 1.1 新建 `packages/ui/src/components/schema-form` 目录和 `index.vue`、`index.ts`、`type.ts`、`normalize.ts`、`layout.ts`、`renderers.ts`、`options.ts`、`value.ts` 模块。
- [x] 1.2 在 `type.ts` 定义 `SchemaFormProps`、`SchemaFormColumn`、`SchemaValueType`、`SchemaFormSearch`、`SchemaFormLayout`、`SchemaFormOption`、事件类型和暴露方法类型，并按仓库规范补充中文 TSDoc。
- [x] 1.3 在组件导出入口加入 `VSchemaForm` 和相关类型导出，不修改旧 `VFormItems` 的对外行为。
- [x] 1.4 确认 `columns` 是新组件唯一字段 schema 入口，不新增旧 `options: FormItem[][]` 兼容 props。

## 2. Schema 归一化

- [x] 2.1 实现 `normalizeColumns`，把 `columns` 转成内部统一字段结构，处理 `mode` 下的 `search: false` 和 `form: false`。
- [x] 2.2 实现 `data` 与 `valueType` 的优先级规则：存在 `data` 时优先使用旧 `FormItem['data']` 渲染配置，否则使用 `valueType`。
- [x] 2.3 实现 `fieldProps`、`formItemProps`、`hidden`、`disabled`、`readonly` 的对象/函数两种取值方式，并确保函数上下文读取当前响应式 form。
- [x] 2.4 实现 `dataIndex` 的取值和赋值工具，字段更新时必须返回新的 form 对象并触发 `update:modelValue`。

## 3. 布局与展开收起

- [x] 3.1 实现 CSS grid 布局计算，支持固定 `columns`、`colProps.span`、`colProps.offset`、`colProps.full`。
- [x] 3.2 实现查询表单收起计算，支持 `search.defaultCollapsed`、`search.collapsedRows`、字段级 `search.collapsed`。
- [x] 3.3 实现受控和非受控收起状态，支持 `v-model:collapsed` 和 `update:collapsed`。
- [x] 3.4 实现 action 区布局，支持 `search.actionPlacement` 的行内和底部两种位置，并保证收起态 action 区始终可见。

## 4. 字段渲染

- [x] 4.1 实现 renderer registry，覆盖 `text`、`textarea`、`password`、`number`、`select`、`date`、`dateRange`、`switch`、`radio`、`checkbox`、`cascader`、`custom`。
- [x] 4.2 实现旧 `FormItem['data']` 渲染兼容，覆盖 `input`、`input-number`、`select`、`date-picker`、`button`、`custom`、`component`、`switch`、`check-box-group`、`radio-group`、`cascader`。
- [x] 4.3 实现字段级 slot 覆盖，支持按 `dataIndex` 定位的自定义字段渲染。
- [x] 4.4 实现 label slot 和 action slot，slot props 必须包含当前 form、字段值、设置值函数以及 submit/reset/toggleCollapsed 等 helper。

## 5. 选项加载

- [x] 5.1 实现 `valueEnum` 到标准 options 的转换，支持字符串和 `{ text, disabled }` 两种枚举值。
- [x] 5.2 实现旧 `data.options` 的数组、Ref、ComputedRef、同步函数和异步函数读取兼容。
- [x] 5.3 实现 `request` 异步选项加载，向请求函数传入当前 form、keyword 和 column 上下文。
- [x] 5.4 实现 `reloadOn` 监听，只有声明的字段变化才触发对应 column 的 request 重新加载。
- [x] 5.5 实现请求竞态保护，旧请求晚于新请求返回时不得覆盖当前 options。
- [x] 5.6 实现选项加载中的 loading 和失败状态，失败后允许后续重新触发加载。

## 6. 查询动作、重置与提交转换

- [x] 6.1 实现 `mode="search"` 默认搜索、重置、展开收起按钮和自定义 actions 渲染。
- [x] 6.2 实现 `submit` 行为，默认按 `dataIndex` 输出查询参数，并支持字段级 `search.transform` 合并输出。
- [x] 6.3 实现 `reset` 行为，按 `initialValues` 或挂载时快照恢复表单值，并触发 `reset` 事件。
- [x] 6.4 实现自定义 action 点击逻辑，触发 `action` 事件并传出 action key 和当前 form。
- [x] 6.5 实现 `defineExpose` 方法：`validate`、`validateField`、`resetFields`、`clearValidate`、`submit`、`reset`、`toggleCollapsed`。

## 7. 校验与 Element Plus 集成

- [x] 7.1 使用 `ElForm` 和 `ElFormItem` 承载表单结构，透传必要的 form props。
- [x] 7.2 将 `formItemProps.required` 和 `formItemProps.rules` 映射到对应 `ElFormItem`。
- [x] 7.3 将 schema 层 `disabled` 和 `readonly` 统一合并到控件 props；不支持 readonly 的控件必须有明确降级策略。
- [x] 7.4 确保隐藏字段不渲染，且查询提交只处理当前模式下可提交的字段。

## 8. 验证与迁移示例

- [x] 8.1 为 `normalize`、`layout`、`value`、`options` 等纯函数补充聚焦测试；若 UI 包没有现成测试入口，先补齐最小可运行测试配置或记录替代验证方式。
- [x] 8.2 增加 `VSchemaForm` 组件渲染测试，覆盖字段渲染、值更新、查询提交、重置、展开收起和 slot 覆盖。
- [x] 8.3 选择一个现有查询表单页面或局部示例迁移到 `VSchemaForm`，验证旧 `FormItem['data']` 控件类型兼容。
- [x] 8.4 运行 `pnpm --filter @repo/ui lint`，并根据迁移范围运行受影响应用的 lint 或测试命令。
- [x] 8.5 补充简短使用文档或示例，说明旧字段配置到新 `columns` 的迁移映射。
