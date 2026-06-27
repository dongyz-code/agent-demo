# VSchemaForm

`VSchemaForm` 是 schema 驱动表单组件，字段通过 `columns` 描述。它独立于旧 `VFormItems`，不接收旧的二维 `options`，但 column 可以继续使用旧 `FormItem['data']` 控件配置。

## 查询表单

```vue
<v-schema-form
  v-model="searchForm"
  mode="search"
  :columns="columns"
  :search="{
    columns: 4,
    collapsedRows: 1,
    actionPlacement: 'inline'
  }"
  @submit="getList(true)"
  @reset="getList(true)"
/>
```

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
    colProps: { span: 2 },
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
  colProps: { span: 2 },
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
