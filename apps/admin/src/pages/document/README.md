# 文档中心

文档与资料库共用一套文档实体和访问规则。一份文档只属于一个资料库，移动文档后按目标库的权限开放，历史版本和处理结果保留。

列表页使用搜索表单和表格。预览进入单独页面，只展示内容和版本切换。设为主版本、移动和重新处理留在列表。

## 目录职责

- `list/index.vue`：全部可访问文档入口。
- `components/DocumentListPanel.vue`：全局列表和库内弹窗共用的筛选、分页和行操作。
- `detail.vue`：文档预览页。顶部是返回、名称和紧凑的版本选择，其余是预览。
- `components/DocumentMoveDialog.vue`：目标库选择、提交与批量失败重试。
- `library/index.vue`：资料库列表。行内进入文档、授权、编辑和归档。
- `library/components/LibraryDialog.vue`：新建和编辑资料库。
- `library/components/LibraryDocumentsDialog.vue`：当前库的文档列表。
- `library/components/LibraryMembersDialog.vue`：授权弹窗。
- `library/components/LibraryMembersPanel.vue`：成员名单、身份变更与取消授权。
- `library/components/GrantAddDialog.vue`：候选搜索、选择与新增授权。
- `types.ts`、`utils.ts`、`library/types.ts`、`library/utils.ts`：邻近的类型、列配置和纯规则。

## 状态与权限

预览生成与问答索引相互独立。当前展示版本不一定是实际问答使用的版本，列表以 `indexedVersionId` 判断可检索状态，详情在版本记录中分别标记“当前”和“问答使用”。

维护入口同时检查资料库管理员身份与账号操作权限；服务端继续执行最终授权校验。系统管理员由全局权限判断和服务端统一放行。

授权变更只在保存成功后更新名单。批量取消不能移除全部管理员。新增、移动和上传弹窗各自维护请求状态，父页只刷新列表与资料库摘要。

## 验证

运行 `pnpm --filter @repo/admin lint` 检查组件与类型，运行 `pnpm --filter @repo/admin test:documents` 验证操作权限、检索版本和授权合并规则。
