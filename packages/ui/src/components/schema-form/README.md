# VSchemaForm

`VSchemaForm` 是 schema 驱动表单组件，字段通过 `columns` 描述。组件只接收 schema 配置，控件可以通过 `valueType` 或 `data` 描述。

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
- 默认收起并展示一行，操作按钮会占用最右侧栅格位置。
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

## data 控件配置

需要直接描述 Element Plus 控件时，可以使用 `data`：

```ts
{
  dataIndex: 'role_id',
  title: '角色',
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

搜索表单优先交给 `VSchemaForm` 的响应式布局处理；只有字段确实需要横跨多个栅格时才显式配置 `colProps.span`。

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
