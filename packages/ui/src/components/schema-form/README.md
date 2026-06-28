# VSchemaForm

`VSchemaForm` 是 schema 驱动表单组件，字段通过 `columns` 描述。它独立于旧 `VFormItems`，不接收旧的二维 `options`，但 column 可以继续使用旧 `FormItem['data']` 控件配置。

## 查询表单

```vue
<v-schema-form
  v-model="searchForm"
  mode="search"
  :columns="columns"
  @submit="getList(true)"
  @reset="getList(true)"
/>
```

查询模式默认参考 ProComponents QueryFilter：

- 按组件容器宽度自动切换 1/2/3/4 列。
- 窄容器使用上下 label，宽容器使用同行 label。
- 默认收起，最多展示两行，操作按钮会占用一个栅格位置。
- `dateRange` 默认占一个栅格，确实需要更宽时再显式配置 `colProps.span`。

```ts
import type { SchemaFormColumn } from '@repo/ui';

type SearchForm = {
  username?: string;
  status?: string;
  created_at?: string[];
};

const columns: SchemaFormColumn<SearchForm>[] = [
  {
    dataIndex: 'username',
    title: '用户名',
    valueType: 'text',
    fieldProps: {
      clearable: true,
      placeholder: '请输入用户名',
    },
  },
  {
    dataIndex: 'status',
    title: '状态',
    valueType: 'select',
    valueEnum: {
      enabled: '启用',
      disabled: '禁用',
    },
  },
  {
    dataIndex: 'created_at',
    title: '创建时间',
    valueType: 'dateRange',
    search: {
      collapsed: true,
      transform(value) {
        const [start, end] = value as string[];
        return {
          start_time: start,
          end_time: end,
        };
      },
    },
  },
];
```

## 旧字段迁移

旧 `VFormItems` 字段：

```ts
{
  label: '角色',
  key: 'role_id',
  range: 2,
  required: true,
  data: {
    type: 'select',
    options: roleOptions,
    props: {
      multiple: true,
      placeholder: '请选择角色',
    },
  },
}
```

迁移到 `VSchemaForm`：

```ts
{
  title: '角色',
  dataIndex: 'role_id',
  formItemProps: { required: true },
  data: {
    type: 'select',
    options: roleOptions,
    props: {
      multiple: true,
      placeholder: '请选择角色',
    },
  },
}
```

`range` 迁移时不要机械复制成 `colProps.span`。搜索表单优先交给 `VSchemaForm` 的响应式布局处理；只有字段确实需要横跨多个栅格时才显式配置 `colProps.span`。

## 配置映射

| 旧字段 | 新字段 |
| --- | --- |
| `label` | `title` |
| `key` | `dataIndex` |
| `range` | `colProps.span` |
| `required` | `formItemProps.required` |
| `data` | `data` |
| `labelWidth` | `formItemProps.labelWidth` 或 `layout.labelWidth` |
| `hidden` | `hidden` |
| `disabled` | `disabled` |

## 自定义渲染

字段 slot 名称为 `field-${dataIndex}`：

```vue
<template #field-username="{ value, setValue }">
  <el-input :model-value="value" @update:model-value="setValue" />
</template>
```

动作区 slot 名称为 `actions`：

```vue
<template #actions="{ submit, reset, collapsed, toggleCollapsed }">
  <el-button type="primary" @click="submit">搜索</el-button>
  <el-button @click="reset">重置</el-button>
  <el-button link @click="toggleCollapsed">
    {{ collapsed ? '展开' : '收起' }}
  </el-button>
</template>
```
