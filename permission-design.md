# 文档权限设计

这是管理后台里的文档权限方案。文件由管理员上传、换版和删除，不能在线协同编辑。客户端只检索、预览和下载已经授权的文件。

权限只放在资料库上。一份文档只属于一个资料库。谁能使用这个库，谁就能预览、下载，并在问答里检索其中已索引的版本。

## 1. 和现有系统的关系

保留这些已有能力：

- 文档、不可变版本、预览、片段、处理任务。
- 管理端功能权限树，以及系统管理员可查看和操作全部业务数据。
- PostgreSQL 做业务和权限的事实来源。Qdrant 只按文档版本过滤。
- 问答在检索前计算可访问范围，模型看不到范围外的片段。

退出现有的知识库关系：

- `rag_datasets`、`rag_dataset_documents` 不再表示授权，也不再表示一份文档同时属于多个检索范围。
- 文档上的 `rag_enabled` 去掉。文档放进资料库，就会索引。
- 可检索版本从知识库关系挪到文档自身。换版处理期间，旧的可检索版本继续可用。

第一版不建租户、工作空间、文件夹权限、单文档授权、拒绝规则，也不把「查看」和「问答」拆成两个勾选。

## 2. 两类权限

功能权限继续放在现有角色树上，只决定管理端菜单和按钮是否出现。有页面权限不代表能看到某个资料库里的文件。

数据权限放在资料库授权上，决定能读哪些文件、能维护哪个库。客户端问答只查数据权限，不要求用户拥有管理端页面权限。

| 平面     | 存在哪里          | 例子                             |
| -------- | ----------------- | -------------------------------- |
| 功能权限 | `role.permission` | 能否进入资料库页、能否新建用户组 |
| 数据权限 | `library_grants`  | 是否是某个库的使用者或管理员     |

系统管理员 `ROOT.SYS_ADMIN_USER_ID` 不写入授权表。判定时直接视为全部资料库的管理员。

## 3. 资料库

资料库是唯一的分享边界。

| 字段         | 取值         | 含义                     |
| ------------ | ------------ | ------------------------ |
| `visibility` | `restricted` | 只有授权表里的人能使用   |
| `visibility` | `published`  | 每个已登录用户都是使用者 |
| `status`     | `active`     | 正常                     |
| `status`     | `archived`   | 停止检索；文档和授权保留 |

`published` 只把登录用户抬到使用者。管理员仍然必须出现在授权表里。

文档在创建时选定资料库，之后只有该库管理员可以把文档移到另一个自己也是管理员的库。移动只改 `documents.library_id`。向量不用改，因为检索时重新按库找可检索版本。

归档后的库不出现在客户端。管理端默认列表只看 `active`，筛选里可以看归档库。管理员和系统管理员可以恢复。

## 4. 身份

授权对象是用户或用户组。现有 `role` 只表达功能权限，不能作为资料库授权对象。否则以后加入该角色的人会自动获得文件访问权。

一个主体在一个库里只有一行。用户直接授权和所属用户组授权同时存在时，取更高的一档。

| 身份             | 预览、下载、检索 | 上传、换版、删除、重新处理、移库 | 编辑库、归档、改授权 |
| ---------------- | ---------------- | -------------------------------- | -------------------- |
| 使用者 `user`    | 可以             |                                  |                      |
| 管理员 `manager` | 可以             | 可以                             | 可以                 |

使用者不能打开授权弹窗。身份不够做某个管理动作时，接口返回「权限不足」。完全没有该库身份，并且库也不是全员可使用时，资料库和其中的文档都返回「不存在」。

不能移除一个库的最后一个管理员。`published` 库里那条「所有登录用户都是使用者」不是授权行，不能删除。

用户组被删除时，引用该组的授权行一并删除。删除前返回仍被多少个资料库使用。

## 5. 表

标识和审计列遵循现有约定：主键 `varchar(255)`，并带 `create_user_id`、`create_timestamp`、`last_update_user_id`、`last_update_timestamp`。

### 5.1 用户组

```sql
CREATE TABLE user_group (
  user_group_id varchar(255) PRIMARY KEY,
  name varchar(255) NOT NULL,
  description text,
  create_user_id varchar(255) NOT NULL,
  create_timestamp timestamptz(6) NOT NULL,
  last_update_user_id varchar(255) NOT NULL,
  last_update_timestamp timestamptz(6) NOT NULL
);

CREATE UNIQUE INDEX user_group_name_unique ON user_group (name);

CREATE TABLE user_group_member (
  user_group_id varchar(255) NOT NULL,
  user_id varchar(255) NOT NULL,
  create_user_id varchar(255) NOT NULL,
  create_timestamp timestamptz(6) NOT NULL,
  PRIMARY KEY (user_group_id, user_id)
);

CREATE INDEX user_group_member_user_idx ON user_group_member (user_id);
```

组名全局唯一。成员只表示人在组里，不表示这个人在某个资料库里的身份。

### 5.2 资料库和授权

```sql
CREATE TABLE libraries (
  library_id varchar(255) PRIMARY KEY,
  name varchar(255) NOT NULL,
  description text,
  visibility varchar(255) NOT NULL,
  status varchar(255) NOT NULL,
  create_user_id varchar(255) NOT NULL,
  create_timestamp timestamptz(6) NOT NULL,
  last_update_user_id varchar(255) NOT NULL,
  last_update_timestamp timestamptz(6) NOT NULL
);

CREATE UNIQUE INDEX libraries_name_unique ON libraries (name);
CREATE INDEX libraries_status_idx ON libraries (status);

CREATE TABLE library_grants (
  library_grant_id varchar(255) PRIMARY KEY,
  library_id varchar(255) NOT NULL,
  subject_type varchar(255) NOT NULL,
  subject_id varchar(255) NOT NULL,
  role varchar(255) NOT NULL,
  create_user_id varchar(255) NOT NULL,
  create_timestamp timestamptz(6) NOT NULL,
  last_update_user_id varchar(255) NOT NULL,
  last_update_timestamp timestamptz(6) NOT NULL
);

CREATE UNIQUE INDEX library_grants_subject_unique
  ON library_grants (library_id, subject_type, subject_id);
CREATE INDEX library_grants_subject_idx
  ON library_grants (subject_type, subject_id);
```

`subject_type` 取 `user` 或 `group`。`role` 取 `user` 或 `manager`。服务层校验库、用户、用户组存在，并且身份合法。不建跨表外键。

创建资料库的同一事务写入创建人的管理员授权。

### 5.3 文档

`documents` 增加：

```sql
library_id varchar(255) NOT NULL
indexed_version_id varchar(255)
```

`library_id` 表示这份文档现在属于哪个库。`indexed_version_id` 表示当前可以检索的版本。新版本还在处理时，这里继续指向旧版本。没有成功索引过时为空。

`document_versions` 增加：

```sql
rag_status varchar(255) NOT NULL DEFAULT 'pending'
rag_error text
```

`rag_status` 取 `pending`、`processing`、`ready`、`failed`。它表示这个版本的索引任务状态，不表示谁能看。

去掉 `documents.rag_enabled`。展示用的 `documents.active_version_id` 保留。预览状态仍在版本上。

一个版本处理成功后，在持有 `document:<id>` 锁的事务里把 `indexed_version_id` 切到该版本，并把该版本标为 `ready`。失败时只写该版本的 `rag_status` 和 `rag_error`，不清空已经发布的 `indexed_version_id`。

文档移库不改变 `indexed_version_id`，也不重做向量。

## 6. 判定

统一入口放在 `hooks/documents/access.ts` 旁的资料库访问模块。文档读、写、预览、下载、检索都调用它。

计算顺序：

1. 系统管理员得到 `manager`。
2. 取该用户的直接授权，以及他所在用户组的授权，留下最高档。`manager` 高于 `user`。
3. 库是 `published` 且结果还不到 `user` 时，记为 `user`。
4. 库是 `archived` 时，客户端使用资格为空。管理端仍把 `manager` 和系统管理员留下，用来查看和恢复。
5. 没有任何资格时，结果为空。

```sql
SELECT
  l.library_id,
  CASE
    WHEN :is_sysadmin THEN 'manager'
    WHEN bool_or(g.role = 'manager') THEN 'manager'
    WHEN bool_or(g.role = 'user') OR l.visibility = 'published' THEN 'user'
    ELSE NULL
  END AS role
FROM libraries l
LEFT JOIN library_grants g
  ON g.library_id = l.library_id
 AND (
   (g.subject_type = 'user' AND g.subject_id = :user_id)
   OR (
     g.subject_type = 'group'
     AND g.subject_id IN (
       SELECT user_group_id
       FROM user_group_member
       WHERE user_id = :user_id
     )
   )
 )
WHERE l.library_id = :library_id
GROUP BY l.library_id, l.visibility;
```

列表查询把同一条件写进 `WHERE`，不先查出全部库再在内存过滤。

文档动作对照：

| 动作                                   | 需要的身份          | 额外条件                                     |
| -------------------------------------- | ------------------- | -------------------------------------------- |
| 列表、详情、预览、下载                 | `user` 或 `manager` | 文档未删除                                   |
| 问答检索                               | `user` 或 `manager` | 库为 `active`，并且命中 `indexed_version_id` |
| 上传新文档、换版、删除、重新处理、移库 | `manager`           | 移库时目标库也是 `manager`                   |
| 改资料库、归档、恢复、改授权           | `manager`           |                                              |

预览和下载校验文档权限之后，仍通过现有 upload 模块签发短期地址。

## 7. 问答检索

每一轮问答都重新计算，不把用户名单写入 Qdrant。

1. 查出当前用户可以使用的 `active` 资料库。
2. 会话若限定了某个库，取交集。交集为空就按「没有可检索文档」处理，并让客户端清掉这个范围。
3. 在这些库里取出未删除文档的 `indexed_version_id`。
4. 用这些版本 id 做 Qdrant 的 `document_version_id` 过滤，再取片段。
5. 返回引用前再查一次这些文档是否仍可打开。不能打开的片段丢掉。

向量载荷继续只放 `segment_id`、`document_version_id`、`document_id`、`content`、`heading_path`、`position`。撤销授权、改组成员、移库、归档都不需要重写向量。

会话上的资料库范围只是过滤器。首次选定后写到 `agent_conversations.library_id`，允许为空，空表示全部可检索库。后续请求以会话里的值为准，忽略客户端改传一个更大的范围。用户失去该库使用权时，把这一列清空。

工具闭包绑定这次算出的版本 id 列表和 `userId`。模型不能自己选库。

打开历史消息里的引用时再做一次文档可读检查。不可读的引用不再返回片段和预览地址。已经写进回答正文的文字第一版不改写。

文档正文只作为检索材料，不作为系统指令。

## 8. 接口

路由仍是 `routes/documents` 和 `routes/sys` 下一文件一接口。复杂判定进入 hooks，单表查询留在 route。

### 8.1 资料库

| 文件                    | 功能权限                            | 数据身份                     |
| ----------------------- | ----------------------------------- | ---------------------------- |
| `library-list.ts`       | `pages.documents.library`           | 有资格的库；系统管理员看全部 |
| `library-detail.ts`     | 同上                                | 无资格返回不存在             |
| `library-create.ts`     | `actions.documents.library-create`  | 创建人成为管理员             |
| `library-update.ts`     | `actions.documents.library-update`  | `manager`                    |
| `library-archive.ts`    | `actions.documents.library-archive` | `manager`                    |
| `library-restore.ts`    | 同上                                | `manager`                    |
| `library-grant-list.ts` | `pages.documents.library`           | 本库 `user` 可看；只读       |
| `library-grant-save.ts` | `actions.documents.library-grant`   | `manager`；按最终名单替换    |

`library-grant-save` 提交这个库的完整授权名单。服务端在同一事务里计算新增、更新和删除，并拒绝删掉最后一个管理员。同一主体重复出现时保留更高身份。

列表项带 `myRole`，前端用它决定按钮，不自己推算。

### 8.2 文档

现有文档接口增加资料库约束：

- 新建文档必须带 `libraryId`，调用者是该库管理员。
- 换版、删除、重新处理、设当前版本，调用者是文档所在库的管理员。
- 详情、预览、下载，调用者至少是使用者。
- `document-search` 增加必填 `libraryId`，去掉 `datasetId`。
- 新增 `document-move`。来源库和目标库都要求管理员。

处理任务的入队条件改为：版本属于一个仍存在的文档，并且调用者是库管理员。任务本身不再读取授权表。

### 8.3 用户组

放在系统管理，只受功能权限控制：

| 文件                   | 功能权限               |
| ---------------------- | ---------------------- |
| `group-list.ts`        | `pages.sys.sys.group`  |
| `group-detail.ts`      | 同上                   |
| `group-create.ts`      | `actions.group.create` |
| `group-update.ts`      | `actions.group.update` |
| `group-delete.ts`      | `actions.group.delete` |
| `group-member-save.ts` | `actions.group.member` |

删除接口先返回 `libraryCount`。确认删除时同时删除 `library_grants` 里 `subject_type = group` 的行。

### 8.4 问答

`/agent/chat` 的 `dataset_id` 改为可选的 `library_id`，表示检索范围。不传表示全部可检索资料库。服务端每轮调用第 6 节的计算。范围无效时检索结果为空，响应头或会话详情里返回实际生效的范围，供客户端改提示。

## 9. 管理端

文档中心菜单只留「资料库」。去掉「文档管理」和「知识库管理」。系统管理在「角色」后加「用户组」。

页面继续使用搜索表单加表格。每个弹窗单独一个组件，自己管表单、加载和提交。

### 9.1 资料库列表

路由 `documents.library`。

搜索：名称、可见性、状态。表格列：名称、可见性、我的身份、文档数、授权数、状态、操作。

有 `actions.documents.library-create` 才显示「新建资料库」。新建字段是名称、说明、可见性。可见性说明写在字段下：

- 仅授权：只有授权名单里的人能检索。
- 全员可使用：每个登录用户都能检索。管理员仍要单独指定。

行内按钮按 `myRole` 和功能权限一起决定：

| 操作             | 使用者       | 管理员                     |
| ---------------- | ------------ | -------------------------- |
| 文档             | 进入只读列表 | 进入，并可上传、删除、换版 |
| 授权             | 不显示       | 打开授权弹窗               |
| 编辑、归档或恢复 | 不显示       | 显示                       |

归档确认写明：归档后停止检索，文档和授权保留。

### 9.2 库内文档

路由 `documents.library.detail`，路径带 `libraryId`。

顶栏：返回、库名、可见性、我的身份。管理员显示「上传」「授权」。使用者不显示这两个按钮。

文档表去掉知识库列、知识库筛选和「管理知识库」。列：名称、当前版本、索引状态、上传人、更新时间、操作。索引状态显示处理中、可检索、失败。没有 `indexed_version_id` 且最新版本失败时显示失败。

管理员的行操作：打开、下载、上传新版本、重新处理、移动、删除。使用者只有打开和下载。

上传提交前显示目标库和可见性。仅授权库提示「仅该库使用者可检索」。全员库提示「所有登录用户可检索」。

移动弹窗只列出当前用户担任管理员的其他库。确认文案写明移动后按目标库的授权生效。

文档预览顶栏去掉知识库和「默认 RAG」，改为所在资料库和索引状态。返回回到该库文档列表。无权时整页显示「文档不存在」。

### 9.3 授权弹窗

`LibraryGrantDialog` 内部是一张表加一个添加区。列：对象、类型、身份、添加人、操作。用户组显示组名，不展开成员。

`published` 库在表头放固定说明：「所有登录用户都是使用者」。

添加时搜索用户或选择用户组，再选使用者或管理员。保存时提交完整名单。最后一个管理员的移除按钮禁用。使用者不打开此弹窗。

### 9.4 用户组

结构和用户管理相同。搜索名称。表格列：名称、人数、说明、操作。

成员弹窗只加减用户。删除仍被资料库引用的组时，提示会同时去掉多少条授权。

## 10. 客户端

客户端不提供上传、移动、成员和资料库设置。

会话顶栏放检索范围。默认「全部可检索资料库」。下拉只包含当前用户可使用的 `active` 库。选中后写入会话；以后只能继续用这个库，或由服务端在失权后清空。

范围失效时，输入区上方提示「已不能访问该资料库，本次改为检索全部可检索资料库」。

回答中的引用可以打开只读预览和下载。预览接口仍走文档可读判定，失败显示「文档不存在」。

没有任何可检索库时，输入框禁用，空状态写「还没有可以检索的资料库」。

## 11. 功能权限键

在 `packages/shared/src/permission/tree.ts` 调整：

- 删除 `pages.documents.management`、`pages.documents.dataset` 及其按钮。
- 增加 `pages.documents.library`。
- 其下按钮：`actions.documents.library-create`、`actions.documents.library-update`、`actions.documents.library-archive`、`actions.documents.library-grant`、`actions.documents.upload`、`actions.documents.delete`、`actions.documents.process`。
- 系统管理增加 `pages.sys.sys.group`，按钮为 `actions.group.create`、`actions.group.update`、`actions.group.member`、`actions.group.delete`。

这些键只控制管理端入口。路由里仍然要做第 6 节的数据判定。

## 12. 落地顺序

列结构变更按仓库现有 reset 处理，不做在线迁移脚本。

1. 建用户组、资料库、授权表，给文档和版本加列。
2. 接上判定函数。文档读写改为按资料库身份，系统管理员保持全量。
3. 索引状态改写到版本和 `indexed_version_id`。处理成功才切换可检索版本。
4. 问答改为按可使用库收集版本 id。
5. 管理端换成资料库列表、库内文档、授权弹窗和用户组。
6. 客户端把知识库选择换成资料库范围，并在打开引用时复检权限。
7. reset 后删除 `rag_datasets`、`rag_dataset_documents` 和 `documents.rag_enabled`。

旧知识库没有成员，不能自动变成资料库授权。reset 之后文档需要重新放入资料库。

## 13. 验收

| 场景                             | 结果                                         |
| -------------------------------- | -------------------------------------------- |
| 用户与库无关，库也不是全员可使用 | 列表没有该库；直接请求详情返回不存在         |
| 使用者请求上传、删除、改授权     | 返回权限不足，按钮本身不渲染                 |
| 用户只通过用户组获得使用者       | 可以预览、下载和检索                         |
| 把用户移出用户组                 | 下一次问答不再检索该库                       |
| 全员可使用的库                   | 登录用户可以检索；只有授权管理员可以上传     |
| 归档资料库                       | 客户端不再检索；管理员仍可在管理端恢复       |
| 新版本处理中                     | 问答仍使用 `indexed_version_id` 指向的旧版本 |
| 新版本处理成功                   | 问答只使用新版本                             |
| 新版本处理失败                   | 旧的可检索版本保留，版本上可见失败原因       |
| 移动文档                         | 来源库立即不能检索，目标库下一次问答可以检索 |
| 客户端传入无权的 `library_id`    | 不扩大检索范围                               |
| 伪造文档 id 下载                 | 返回不存在                                   |
| 系统管理员                       | 可以查看和维护全部资料库与文档               |
| 打开已失权的历史引用             | 不再返回片段和预览地址                       |
