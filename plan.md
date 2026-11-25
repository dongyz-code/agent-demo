# **一、整体产品设计**

我建议把它设计成一个 **文档管理 + 权限控制 + AI 知识问答平台**，而不是简单的文件上传和 RAG 检索系统。

核心设计目标是：

1. **统一管理文档**：用户可以上传、分类、搜索、预览和维护文档。
2. **精细化权限控制**：支持个人、用户组、组织角色，以及文件夹和单篇文档授权。
3. **基于权限进行知识问答**：用户只能检索和引用自己有权限访问的文档。
4. **统一后台管理**：管理员可以管理用户、组织、文档、权限、知识索引和操作审计。

## **1.1 产品模块划分**

**文档知识管理平台**

统一工作空间 / Workspace

**文档管理**

文件夹、上传、版本、预览、搜索

**权限管理**

用户、用户组、角色、文档授权

**AI 知识问答**

权限过滤、语义检索、引用溯源

**系统后台**

用户、角色、索引任务、审计、配置

## **1.2 推荐的资源层级**

不建议直接采用「用户 → 文档」两层结构。随着文档数量和协作人数增长，权限管理会变得非常混乱。

推荐：

```
租户 Tenant
  └── 工作空间 Workspace
        ├── 用户 / 用户组 / 角色
        │
        ├── 文件夹 Folder
        │     ├── 文件夹 Folder
        │     │     ├── 文档 Document
        │     │     └── 文档 Document
        │     └── 文档 Document
        │
        └── 知识问答
              ├── 全部有权限的文档
              ├── 指定文件夹
              └── 指定文档
```

这里有三个关键概念：

- **Tenant**：租户边界，企业之间的数据隔离。
- **Workspace**：工作空间，通常对应部门、项目或业务团队。
- **Folder / Document**：实际的资源对象，权限最终落在文件夹和文档上。

对于第一版，可以先支持单租户、多工作空间的数据模型，避免未来扩展企业版时重新设计。

# **二、文档和权限模型**

这里是整个系统最重要的部分。我建议采用：

**RBAC（角色权限） + ACL（资源访问控制） + 权限继承。**

它们分别解决不同问题：

| 机制     | 解决的问题                       | 示例                             |
| -------- | -------------------------------- | -------------------------------- |
| RBAC     | 用户在工作空间内是什么角色       | 管理员、普通成员                 |
| ACL      | 某个用户或用户组能访问什么文档   | 张三可以访问项目 A 文档          |
| 权限继承 | 文件夹下面的文档如何自动获得权限 | 有文件夹权限，就能访问里面的文档 |

## **2.1 用户与角色模型**

建议区分工作空间角色和资源权限。

工作空间角色：

| 角色   | 权限                                   |
| ------ | -------------------------------------- |
| Owner  | 工作空间所有权限，包括转让和删除       |
| Admin  | 用户管理、角色管理、文档管理、权限管理 |
| Member | 正常使用工作空间中的授权资源           |

资源权限：

| 权限代码            | 说明                             |
| ------------------- | -------------------------------- |
| `VIEW`              | 查看文档、预览                   |
| `DOWNLOAD`          | 下载原始文件                     |
| `EDIT`              | 修改文档信息、更新文件           |
| `DELETE`            | 删除文档                         |
| `SHARE`             | 分享文档、授权给其他用户         |
| `QUERY`             | 将文档作为 AI 知识问答的检索来源 |
| `MANAGE_PERMISSION` | 管理该资源的权限                 |

这里有一个值得注意的设计：

**VIEW 和 QUERY 必须分开。**

例如，用户可以查看某份文件，但公司不允许他使用 AI 对该文件进行批量知识提取。这时只授予 `VIEW`，不授予 `QUERY`。

同样，`QUERY` 必须依赖 `VIEW`，不能出现用户无法查看文档，却能通过 AI 获取其内容的情况。

## **2.2 权限继承规则**

举个实际例子：

```
产品研发文件夹
│
├── 前端开发文档
│     ├── Vue开发规范.pdf
│     └── 组件开发规范.docx
│
├── 后端开发文档
│     ├── Node开发规范.pdf
│     └── API设计规范.docx
│
└── 项目保密文档.pdf
```

授权：

- 用户 A：产品研发文件夹，VIEW + QUERY。
- 用户 B：前端开发文档文件夹，VIEW + QUERY。
- 用户 C：项目保密文档，VIEW。

最终权限：

| 资源           | 用户 A | 用户 B | 用户 C           |
| -------------- | ------ | ------ | ---------------- |
| 产品研发文件夹 | 可访问 | 无权限 | 无权限           |
| Vue 开发规范   | 可访问 | 可访问 | 无权限           |
| Node 开发规范  | 可访问 | 无权限 | 无权限           |
| 项目保密文档   | 可访问 | 无权限 | 可查看，不可问答 |

### **权限继承的具体规则**

我推荐采用「默认继承 + 单资源自定义」的方式：

1. 默认情况下，文件夹权限向子文件夹和文档继承。
2. 子文件夹可以添加额外授权。
3. 文档可以添加额外授权。
4. 文档可以关闭继承，改成独立授权。
5. 工作空间 Owner 和 Admin 始终保留管理权限。
6. 第一版只实现 Allow 授权，不引入 Deny 拒绝规则。

为什么第一版不建议引入 Deny？

因为当用户同时属于多个用户组时，可能出现：

```
用户 A
  ├── 研发组：允许访问
  └── 保密组：拒绝访问
```

此时必须定义拒绝优先级、父级拒绝与子级允许的冲突规则，复杂度会明显增加。初期采用授权并集，撤权时删除对应授权记录，会更容易维护。

## **2.3 数据库表设计**

建议使用 PostgreSQL 作为主数据库。

整体关系：

\#chatgpt-mermaid-\_r_ou\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_ou\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_ou\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_ou\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_ou\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ou\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_ou\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_ou\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_ou\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_ou\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_ou\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_ou\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_ou\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_ou\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_ou\_ p{margin:0;}#chatgpt-mermaid-\_r_ou\_ .entityBox{fill:rgb(222, 234, 251);stroke:rgb(83, 154, 248);}#chatgpt-mermaid-\_r_ou\_ .relationshipLabelBox{fill:rgb(243, 243, 243);opacity:0.7;background-color:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_ou\_ .relationshipLabelBox rect{opacity:0.5;}#chatgpt-mermaid-\_r_ou\_ .labelBkg{background-color:rgba(243, 243, 243, 0.5);}#chatgpt-mermaid-\_r_ou\_ .edgeLabel{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_ou\_ .edgeLabel .label rect{fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_ou\_ .edgeLabel .label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ou\_ .edgeLabel .label{fill:rgb(83, 154, 248);font-size:14px;}#chatgpt-mermaid-\_r_ou\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ou\_ .edge-pattern-dashed{stroke-dasharray:8,8;}#chatgpt-mermaid-\_r_ou\_ .node rect,#chatgpt-mermaid-\_r_ou\_ .node circle,#chatgpt-mermaid-\_r_ou\_ .node ellipse,#chatgpt-mermaid-\_r_ou\_ .node polygon{fill:rgb(222, 234, 251);stroke:rgb(83, 154, 248);stroke-width:1px;}#chatgpt-mermaid-\_r_ou\_ .relationshipLine{stroke:rgb(143, 143, 143);stroke-width:1px;fill:none;}#chatgpt-mermaid-\_r_ou\_ .marker{fill:none!important;stroke:rgb(143, 143, 143)!important;stroke-width:1;}#chatgpt-mermaid-\_r_ou\_ [data-look=neo].labelBkg{background-color:rgba(243, 243, 243, 0.5);}#chatgpt-mermaid-\_r_ou\_ .node .neo-node{stroke:rgb(83, 154, 248);}#chatgpt-mermaid-\_r_ou\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_ou\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_ou\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_ou\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ou\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_ou\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_ou\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_ou\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ou\_ [data-look="neo"].node .neo-line path{stroke:rgb(83, 154, 248);filter:none;}#chatgpt-mermaid-\_r_ou\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_ou\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ou\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_ou\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_ou\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ou\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_ou\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ou\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}TENANTWORKSPACEUSERWORKSPACE_MEMBERUSER_GROUPGROUP_MEMBERFOLDERDOCUMENTDOCUMENT_VERSIONRESOURCE_ACLQA_SESSIONQA_MESSAGEQA_SOURCEcontainscontainshasjoinshascontainsjoinscontainsparentcontainsversionsgrantsgrantscreatescontainscitesreferenced

### **核心表**

| 表名                | 用途         | 关键字段                                                             |
| ------------------- | ------------ | -------------------------------------------------------------------- |
| `tenants`           | 租户         | id、name、status                                                     |
| `users`             | 用户         | id、username、email、status                                          |
| `workspaces`        | 工作空间     | id、tenant_id、name                                                  |
| `workspace_members` | 工作空间成员 | workspace_id、user_id、role                                          |
| `user_groups`       | 用户组       | id、workspace_id、name                                               |
| `group_members`     | 用户组成员   | group_id、user_id                                                    |
| `folders`           | 文件夹       | id、workspace_id、parent_id、acl_mode                                |
| `documents`         | 文档         | id、workspace_id、folder_id、owner_id、status                        |
| `document_versions` | 文档版本     | document_id、version、storage_key                                    |
| `resource_acl`      | 资源授权     | resource_type、resource_id、principal_type、principal_id、permission |
| `qa_sessions`       | 问答会话     | workspace_id、user_id、scope_type                                    |
| `qa_messages`       | 问答消息     | session_id、role、content                                            |
| `qa_sources`        | 问答引用     | message_id、document_id、chunk_id                                    |
| `audit_logs`        | 操作审计     | user_id、action、resource_id、created_at                             |

### **最关键的授权表：resource_acl**

这是整个权限系统的核心。

```
CREATE TABLE resource_acl (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,

    resource_type VARCHAR(20) NOT NULL,
    resource_id UUID NOT NULL,

    principal_type VARCHAR(20) NOT NULL,
    principal_id UUID NOT NULL,

    permission VARCHAR(40) NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (
        resource_type,
        resource_id,
        principal_type,
        principal_id,
        permission
    )
);
```

字段含义：

- `resource_type`：FOLDER 或 DOCUMENT。
- `resource_id`：文件夹或文档 ID。
- `principal_type`：USER、GROUP 或 WORKSPACE_ROLE。
- `principal_id`：对应用户、用户组或角色的 ID。
- `permission`：VIEW、QUERY、DOWNLOAD 等。

采用统一授权表，后续给文件夹、文档增加权限时不需要重复设计数据结构。

因为 `resource_id` 是多态关联，数据库无法直接为其建立指向多个资源表的普通外键，需要由服务层校验资源归属和存在性。还应通过索引、租户校验以及审计来保证数据安全。

### **folders 表**

重点是 `acl_mode`：

```
CREATE TABLE folders (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    parent_id UUID,
    name VARCHAR(255) NOT NULL,
    acl_mode VARCHAR(20) NOT NULL DEFAULT 'INHERIT',
    owner_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- `INHERIT`：继承父级文件夹权限，并叠加本级授权。
- `CUSTOM`：不再继承父级授权，只使用本级授权。

工作空间管理员的管理权限不受上述设置影响。

### **documents 表**

```
CREATE TABLE documents (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    folder_id UUID,
    owner_id UUID NOT NULL,

    name VARCHAR(500) NOT NULL,
    file_type VARCHAR(50),
    file_size BIGINT,
    storage_key TEXT NOT NULL,

    acl_mode VARCHAR(20) NOT NULL DEFAULT 'INHERIT',
    current_version_id UUID,

    status VARCHAR(30) NOT NULL DEFAULT 'UPLOADED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
```

建议文档状态统一为：

```
UPLOADED     已上传
PROCESSING   解析中
INDEXING     向量索引中
READY        可正常使用
FAILED       处理失败
ARCHIVED     已归档
```

注意：`document_versions` 应保存每次文件更新的记录，向量索引也必须记录对应的版本号，避免文档更新后仍然检索到旧内容。

## **2.4 权限判定逻辑**

可以统一封装一个权限服务：

```
type ResourceType = 'FOLDER' | 'DOCUMENT';

type Permission =
  | 'VIEW'
  | 'DOWNLOAD'
  | 'EDIT'
  | 'DELETE'
  | 'SHARE'
  | 'QUERY'
  | 'MANAGE_PERMISSION';

interface CheckPermissionParams {
  userId: string;
  workspaceId: string;
  resourceType: ResourceType;
  resourceId: string;
  permission: Permission;
}

async function checkPermission(
  params: CheckPermissionParams,
): Promise<boolean> {
  // 1. 校验用户是否属于当前租户和工作空间
  // 2. 判断是否为工作空间 Owner / Admin
  // 3. 查询用户直接授权
  // 4. 查询用户所属用户组的授权
  // 5. 判断当前资源是否继承父级权限
  // 6. 合并有效授权，检查目标权限
  // 7. 校验 VIEW / QUERY 等权限依赖
  return false;
}
```

实际实现时，权限查询不应每次都逐层发起多次数据库请求。建议封装成一个授权服务，通过递归 CTE 或批量查询一次性计算祖先授权，并对结果做短时缓存。

**所有查看、下载、分享、删除和 AI 问答接口，都统一调用权限服务。**

# **三、AI 知识问答：权限必须进入 RAG 检索链路**

这部分我建议作为产品的核心能力来设计。

很多知识库产品只是上传文件、解析、切片、向量化，然后直接检索。对于有权限控制的系统，这种设计是不够的。

**不能先检索所有文档，再由前端过滤结果。必须在检索阶段就限制用户可访问的文档。**

## **3.1 知识问答的三种范围**

前端问答页面可以提供三种知识范围：

| 范围           | 说明                                              |
| -------------- | ------------------------------------------------- |
| 全部可访问文档 | 自动检索当前用户拥有 QUERY 权限的全部文档         |
| 指定文件夹     | 仅检索指定文件夹及其子文件夹中有 QUERY 权限的文档 |
| 指定文档       | 仅使用用户明确选择且有 QUERY 权限的文档           |

例如：

用户 A 有 100 篇文档的查看权限，其中只有 70 篇拥有问答权限。

那么：

- 查看文档列表：可以看到 100 篇。
- 全部知识问答：只能检索 70 篇。
- 选择某个文件夹：只能检索这个文件夹范围内有问答权限的文档。

## **3.2 RAG 完整执行流程**

**用户发起知识问答**

**1. 身份认证**

校验用户、租户、工作空间成员身份

**2. 权限计算**

计算用户具有 QUERY 权限的文档 ID 集合

**3. 向量检索**

限定 workspace_id + allowed_document_ids + 当前有效版本

**4. Rerank + LLM**

仅使用权限校验通过的文档片段生成答案

**5. 引用校验**

返回答案、文档来源、页码和片段，并再次校验来源权限

**展示 AI 答案**

## **3.3 具体技术实现**

建议将权限计算和向量检索解耦。

```
interface QueryContext {
  userId: string;
  workspaceId: string;
  allowedDocumentIds: string[];
}

async function createQueryContext(
  userId: string,
  workspaceId: string,
  scope: QueryScope,
): Promise<QueryContext> {
  // 从 PostgreSQL 权限系统计算当前用户
  // 实际拥有 QUERY 权限的文档集合
  const allowedDocumentIds =
    await permissionService.getQueryableDocuments({
      userId,
      workspaceId,
      scope,
    });

  return {
    userId,
    workspaceId,
    allowedDocumentIds,
  };
}

async function answerQuestion(
  userId: string,
  workspaceId: string,
  question: string,
  scope: QueryScope,
) {
  const context = await createQueryContext(
    userId,
    workspaceId,
    scope,
  );

  if (context.allowedDocumentIds.length === 0) {
    return {
      answer: '当前知识范围内没有可用于问答的文档。',
      sources: [],
    };
  }

  // 向量检索必须带上授权文档范围
  const chunks = await vectorStore.search({
    query: question,
    filter: {
      workspaceId,
      documentIds: context.allowedDocumentIds,
    },
  });

  // 排序、生成答案
  const result = await ragService.generate({
    question,
    chunks,
  });

  // 返回前再次检查引用文档是否仍有权限
  const sources = await permissionService.filterAccessibleSources(
    userId,
    result.sources,
  );

  return {
    answer: result.answer,
    sources,
  };
}
```

这是示意代码，实际还需要处理文档版本、删除状态、索引状态、空结果和检索超时。

### **必须注意的四个安全细节**

**1. PostgreSQL 是权限唯一事实来源。**

向量数据库只保存文档 ID、工作空间 ID、版本号、Chunk ID 等检索元数据，不应该成为权限判断的权威来源。

**2. 权限撤销必须立即生效。**

不要把用户权限永久写入向量索引。用户撤销权限后，应立即使权限缓存失效，下一次检索便不能再获取这些文档。

**3. 历史问答也要校验。**

用户可能昨天有权限，今天被移除了。打开历史会话时，应该检查答案依赖的引用文档。如果来源权限已失效，应隐藏相关历史答案或按安全策略重新生成，不能继续展示已经失权的敏感片段。

**4. 文档内容本身也不可信。**

RAG 处理文档中的内容时，需要防止文档内的恶意指令影响 Agent 的系统规则。文档只能作为知识来源，不能作为权限指令。

## **3.4 文档处理后台流程**

\#chatgpt-mermaid-\_r_qk\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_qk\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_qk\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_qk\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_qk\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_qk\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_qk\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_qk\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_qk\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_qk\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_qk\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_qk\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_qk\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_qk\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_qk\_ p{margin:0;}#chatgpt-mermaid-\_r_qk\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_qk\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_qk\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_qk\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_qk\_ .label text,#chatgpt-mermaid-\_r_qk\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_qk\_ .node rect,#chatgpt-mermaid-\_r_qk\_ .node circle,#chatgpt-mermaid-\_r_qk\_ .node ellipse,#chatgpt-mermaid-\_r_qk\_ .node polygon,#chatgpt-mermaid-\_r_qk\_ .node path{fill:rgb(222, 234, 251);stroke:rgb(83, 154, 248);stroke-width:1px;}#chatgpt-mermaid-\_r_qk\_ .rough-node .label text,#chatgpt-mermaid-\_r_qk\_ .node .label text,#chatgpt-mermaid-\_r_qk\_ .image-shape .label,#chatgpt-mermaid-\_r_qk\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_qk\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_qk\_ .rough-node .label,#chatgpt-mermaid-\_r_qk\_ .node .label,#chatgpt-mermaid-\_r_qk\_ .image-shape .label,#chatgpt-mermaid-\_r_qk\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_qk\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_qk\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_qk\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_qk\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_qk\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_qk\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_qk\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_qk\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_qk\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_qk\_ .cluster rect{fill:rgb(243, 243, 243);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_qk\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_qk\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_qk\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(243, 243, 243);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_qk\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_qk\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_qk\_ .icon-shape,#chatgpt-mermaid-\_r_qk\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_qk\_ .icon-shape p,#chatgpt-mermaid-\_r_qk\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_qk\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_qk\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_qk\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_qk\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_qk\_ .node .neo-node{stroke:rgb(83, 154, 248);}#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_qk\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_qk\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].node .neo-line path{stroke:rgb(83, 154, 248);filter:none;}#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_qk\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_qk\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qk\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_qk\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_qk\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(0, 79, 153);}#chatgpt-mermaid-\_r_qk\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(0, 79, 153);}#chatgpt-mermaid-\_r_qk\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_qk\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_qk\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(245, 250, 255);stroke:rgb(206, 219, 229);stroke-width:1px;}#chatgpt-mermaid-\_r_qk\_ .node rect,#chatgpt-mermaid-\_r_qk\_ .node circle,#chatgpt-mermaid-\_r_qk\_ .node ellipse,#chatgpt-mermaid-\_r_qk\_ .node polygon,#chatgpt-mermaid-\_r_qk\_ .node path{fill:rgb(229, 243, 255);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_qk\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_qk\_ .mermaid-decision .label-container{fill:rgb(245, 250, 255);stroke:rgb(206, 219, 229);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_qk\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_qk\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_qk\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}用户上传文件文件存储 OSS / MinIO创建文档记录异步解析任务文本提取 / OCR内容清洗与分块Embedding 向量化写入向量数据库更新文档为 READY处理失败记录错误与支持重试

建议把文档解析和问答拆成独立模块。用户上传文件不应该一直等待向量化完成。

文档处理时建议保留：

- 文档版本 ID。
- Chunk ID。
- 页码或段落位置。
- 原始文件存储地址。
- 当前索引版本。
- 解析错误信息。

这样问答引用才能准确跳转到原文。

# **四、前端交互页面设计**

我建议用户端不要把「文档管理」和「知识问答」做成两个独立产品，而是放在同一个工作空间内，让用户可以从浏览文档直接进入 AI 问答。

## **4.1 用户端整体布局**

**Knowledge Hub**

工作空间：产品研发中心

**工作空间**

文档中心

知识问答

与我共享

最近访问

**管理**

用户与权限

**文档中心**

搜索文档、文件夹...

全部文档

128

产品研发

项目资料

开发规范.pdf

系统架构.docx

AI 知识问答

基于你有权限的文档获取答案

布局示意：左侧统一导航，右侧根据文档中心、权限管理和知识问答切换。

推荐用户端导航：

```
工作空间
├── 文档中心
│   ├── 全部文档
│   ├── 我的文档
│   ├── 与我共享
│   └── 最近访问
│
├── AI 知识问答
│   ├── 新建问答
│   └── 历史会话
│
└── 个人设置
    ├── 个人信息
    └── 我的权限
```

其中「我的文档」表示用户拥有管理权或所有权的文档，而不是所有能查看的文档。

## **4.2 文档中心页面**

这是最主要的日常操作页面。

[Document management platform for ISO certification | Adexin](https://images.openai.com/static-rsc-4/87aywUkeN77J3YkHV3lB3E0tLSjjRG5xktnBiQvDuv3fzq0mdoXBjS8KoR3b0EoAJvoJo5_CA_Hi6q2U-GyuwVr0EJZ0YRsOj0PBuwpv6RdVeC5mbyzfQC2SzhT_-MJRhou_xG-MogFjckYcKpD0pLz_64zTE42svt3den1AvLA?purpose=inline)

[adexin.com](https://adexin.com/case-studies/document-management-platform-for-iso-certification/?utm_source=chatgpt.com)

页面采用三栏结构：

| 区域 | 主要内容                 |
| ---- | ------------------------ |
| 左侧 | 文件夹树、收藏夹         |
| 中间 | 文档列表、搜索、过滤     |
| 右侧 | 文档详情、权限、版本信息 |

### **文档列表字段**

| 字段       | 说明                     |
| ---------- | ------------------------ |
| 文件名     | 文档名称和文件类型       |
| 所属文件夹 | 当前所在目录             |
| 所有者     | 文档创建者或负责人       |
| 更新时间   | 最近修改时间             |
| 文档状态   | 处理中、已完成、失败     |
| 我的权限   | 可查看、可问答、可编辑等 |

建议支持：

- 文件上传、文件夹创建。
- 拖拽上传、批量上传。
- 文件夹移动和重命名。
- 批量授权、批量删除。
- 按文件类型、上传人、状态过滤。
- 文档预览和版本管理。
- 直接从文档进入 AI 问答。

### **文档操作交互**

点击文档右侧菜单：

```
打开文档
预览
下载
问答此文档
分享 / 权限管理
版本历史
重命名
移动
删除
```

这里需要根据当前用户权限动态展示菜单。

例如没有 `DOWNLOAD` 权限时，下载入口不显示；没有 `QUERY` 权限时，不能使用「问答此文档」。

前端隐藏按钮只是交互优化，后端仍然必须重新校验权限。

## **4.3 权限管理页面：最重要的交互**

我不建议把权限操作放在复杂的独立配置页中。

更合适的方式是：**在文件夹和文档上都提供一个「权限管理」抽屉。**

[Secure Cloud Content Platform for Enterprises | Egnyte](https://images.openai.com/static-rsc-4/_fio_ZmkcoXBExA4QHNCSDZXApJd1_ro3EChxSVPnwXMa1e1VIs1PB5edu_olSgLYcABUYWECnPJty2T3O_VKIbBwkkyGMnWfw_z0QYyh6mYDGaDpumVT9tb9FKpoMV-mHupfS_eNJHCWPxwLwCxO7afcY4xWwvFWpSzyLnF5Fg?purpose=inline)

[egnyte.com](https://www.egnyte.com/products/platform?utm_source=chatgpt.com)

建议分为三个区域：

**区域一：当前有权限的成员**

| 用户 / 用户组 | 来源       | 权限             |
| ------------- | ---------- | ---------------- |
| 张三          | 直接授权   | 查看、问答       |
| 研发组        | 直接授权   | 查看、问答、下载 |
| 产品组        | 继承自上级 | 查看             |

**区域二：添加成员**

点击「添加成员」，支持：

- 搜索用户。
- 选择用户组。
- 选择工作空间角色。
- 批量添加多个用户。

然后配置权限：

```
☑ 查看文档
☐ 下载文档
☑ AI 知识问答
☐ 编辑文档
☐ 删除文档
☐ 分享文档
☐ 管理权限
```

**区域三：继承设置**

```
权限继承：

● 继承父级文件夹的权限
○ 独立设置权限
```

独立设置时，前端应明确提示：

「关闭继承后，将不再继承上级文件夹的授权。原先仅通过上级继承权限的用户可能失去访问权限。」

建议额外提供「有效权限预览」，让管理员在保存之前查看某个用户最终拥有什么权限，防止误操作。

## **4.4 AI 知识问答页面**

建议采用 ChatGPT 类似的对话布局，而不是传统的搜索框。

[docs.maiagent.ai](https://docs.maiagent.ai/maigpt/chat?utm_source=chatgpt.com)

页面划分：

```
┌──────────────────────────────────────────────┐
│ 知识问答                  新建会话   历史会话 │
├───────────────────────┬──────────────────────┤
│                       │                      │
│  选择知识范围          │   AI 回答内容         │
│                       │                      │
│  ● 全部可访问文档      │   根据现有文档...     │
│  ○ 指定文件夹          │                      │
│  ○ 指定文档            │   引用来源：          │
│                       │   1. 开发规范.pdf      │
│  已选择：             │   2. 系统架构.docx     │
│  3 篇文档             │                      │
│                       │                      │
├───────────────────────┴──────────────────────┤
│  输入你的问题...                       发送  │
└──────────────────────────────────────────────┘
```

关键交互：

1. 用户新建会话时先选择知识范围。
2. 选择文件夹或文档时，只展示自己拥有 `QUERY` 权限的资源。
3. 用户可以随时切换知识范围。
4. AI 回答中的来源可以点击。
5. 点击来源打开文档预览，并定位到对应页码或段落。
6. 无法回答时明确提示缺少相关知识，而不是强行生成答案。

特别建议加入一个能力：

**「基于当前文档继续追问」**

例如用户打开 `系统架构.docx`，可以直接点击「问答此文档」，系统自动建立一个仅包含该文档的问答会话。

## **4.5 用户端建议的路由**

```
/app/:workspaceId
  /documents
  /documents/:documentId
  /folders/:folderId
  /shared
  /recent

  /qa
  /qa/:sessionId

  /settings/profile
  /settings/permissions
```

# **五、后台管理系统设计**

这里建议把后台分成两个层级：

- **平台管理员后台**：管理整个 SaaS 平台、租户和系统配置。
- **企业 / 工作空间管理员后台**：管理本企业或工作空间内的用户、资源和权限。

不要把平台超级管理员和企业管理员混成一个角色。

## **5.1 后台管理导航**

```
平台管理
├── 租户管理
├── 全局用户管理
├── 系统配置
└── 运行监控

工作空间管理
├── 数据概览
├── 用户管理
├── 用户组管理
├── 角色管理
├── 文档管理
├── 权限审计
├── 文档处理任务
├── AI 知识库配置
└── 操作日志
```

## **5.2 数据概览**

文档总数

# **12,680**

所有工作空间文档

知识索引完成率

# **96.8%**

可用于知识问答

活跃用户

# **328**

当前统计周期

待处理任务

# **18**

解析、索引、失败重试

这些是页面示意数据，不是实际运行指标。概览页面建议展示文档数量趋势、索引失败率、空间占用、问答使用量及权限操作量。

## **5.3 用户管理**

管理员可以：

- 新增、禁用用户。
- 邀请用户加入工作空间。
- 设置工作空间角色。
- 添加用户组。
- 查看用户拥有的文档访问权限。
- 查看用户最近的文档访问和问答记录。

用户管理和文档授权需要分开：将用户加入工作空间，不意味着自动获得所有文档权限。

## **5.4 用户组管理**

这是后续大量文档授权时非常重要的功能。

例如：

```
用户组
├── 研发部
│   ├── 张三
│   ├── 李四
│   └── 王五
│
├── 产品部
│   ├── 赵六
│   └── 钱七
│
└── 管理层
    ├── 用户 A
    └── 用户 B
```

给研发部授权某个文件夹，组内成员就能继承对应权限。

用户组建议第一版支持：

- 手工创建和维护。
- 添加、移除成员。
- 查看组内成员。
- 批量给文件夹或文档授权。

后续再考虑对接企业微信、LDAP、AD 或 SSO 的组织同步。

## **5.5 权限审计**

这个功能不能忽略。

至少记录：

| 操作     | 审计内容               |
| -------- | ---------------------- |
| 文档查看 | 谁访问了哪个文档       |
| 文档下载 | 谁下载了哪个文件       |
| 文档分享 | 谁给谁授权             |
| 权限变更 | 修改前和修改后的权限   |
| 权限撤销 | 谁撤销了哪个用户的权限 |
| AI 问答  | 谁在什么范围内发起问答 |
| 文档删除 | 谁删除了哪个文档       |

涉及企业文档时，审计日志建议不可由普通工作空间管理员直接修改或删除。

## **5.6 文档处理任务**

管理员可以看到：

```
文档名称           解析状态      索引状态      操作
开发规范.pdf       已完成        已完成        查看
项目方案.docx      已完成        处理中        查看
测试报告.pdf       解析失败      未开始        重试
合同附件.pdf       处理中        等待中        查看
```

需要支持：

- 查看失败原因。
- 重新解析。
- 重新生成 Embedding。
- 删除失效索引。
- 查看文档版本。
- 批量重试失败任务。

权限变更不应该触发整个文档重新解析和向量化，因为向量数据并不是权限事实来源。

# **六、后端系统架构**

考虑到你主要使用 Node.js、TypeScript 和 Vue 3，我建议第一阶段采用 **模块化单体（Modular Monolith）+ 独立异步 Worker**。

个人开发不建议一开始拆分成一堆微服务。权限服务、文档服务和知识问答服务先在一个后端工程中维护，处理耗时任务则由 Worker 独立运行。

## **6.1 整体架构**

\#chatgpt-mermaid-\_r_t6\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_t6\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_t6\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_t6\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_t6\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_t6\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_t6\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_t6\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_t6\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_t6\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_t6\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_t6\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_t6\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_t6\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_t6\_ p{margin:0;}#chatgpt-mermaid-\_r_t6\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_t6\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_t6\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_t6\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_t6\_ .label text,#chatgpt-mermaid-\_r_t6\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_t6\_ .node rect,#chatgpt-mermaid-\_r_t6\_ .node circle,#chatgpt-mermaid-\_r_t6\_ .node ellipse,#chatgpt-mermaid-\_r_t6\_ .node polygon,#chatgpt-mermaid-\_r_t6\_ .node path{fill:rgb(222, 234, 251);stroke:rgb(83, 154, 248);stroke-width:1px;}#chatgpt-mermaid-\_r_t6\_ .rough-node .label text,#chatgpt-mermaid-\_r_t6\_ .node .label text,#chatgpt-mermaid-\_r_t6\_ .image-shape .label,#chatgpt-mermaid-\_r_t6\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_t6\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_t6\_ .rough-node .label,#chatgpt-mermaid-\_r_t6\_ .node .label,#chatgpt-mermaid-\_r_t6\_ .image-shape .label,#chatgpt-mermaid-\_r_t6\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_t6\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_t6\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_t6\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_t6\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_t6\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_t6\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_t6\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_t6\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_t6\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_t6\_ .cluster rect{fill:rgb(243, 243, 243);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_t6\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_t6\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_t6\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(243, 243, 243);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_t6\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_t6\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_t6\_ .icon-shape,#chatgpt-mermaid-\_r_t6\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_t6\_ .icon-shape p,#chatgpt-mermaid-\_r_t6\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_t6\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_t6\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_t6\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_t6\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_t6\_ .node .neo-node{stroke:rgb(83, 154, 248);}#chatgpt-mermaid-\_r_t6\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_t6\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_t6\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_t6\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_t6\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_t6\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_t6\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_t6\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_t6\_ [data-look="neo"].node .neo-line path{stroke:rgb(83, 154, 248);filter:none;}#chatgpt-mermaid-\_r_t6\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_t6\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_t6\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_t6\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_t6\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_t6\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_t6\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_t6\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(0, 79, 153);}#chatgpt-mermaid-\_r_t6\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(0, 79, 153);}#chatgpt-mermaid-\_r_t6\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_t6\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_t6\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(245, 250, 255);stroke:rgb(206, 219, 229);stroke-width:1px;}#chatgpt-mermaid-\_r_t6\_ .node rect,#chatgpt-mermaid-\_r_t6\_ .node circle,#chatgpt-mermaid-\_r_t6\_ .node ellipse,#chatgpt-mermaid-\_r_t6\_ .node polygon,#chatgpt-mermaid-\_r_t6\_ .node path{fill:rgb(229, 243, 255);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_t6\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_t6\_ .mermaid-decision .label-container{fill:rgb(245, 250, 255);stroke:rgb(206, 219, 229);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_t6\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_t6\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_t6\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Vue 3 前端Node.js API 服务认证模块权限模块文档管理模块知识问答模块审计模块PostgreSQLMinIO / S3向量数据库Redis / BullMQ文档处理 Worker文档解析 / OCREmbedding 模型LLM 服务

### **技术选型**

| 模块     | 推荐技术                      | 用途                         |
| -------- | ----------------------------- | ---------------------------- |
| 前端     | Vue 3 + TypeScript            | 用户端和管理端               |
| UI       | Element Plus                  | 文档表格、权限配置、后台表单 |
| 状态管理 | Pinia                         | 工作空间、会话、用户状态     |
| 后端     | Node.js + TypeScript + NestJS | 模块化业务服务               |
| 主数据库 | PostgreSQL                    | 用户、文档、权限、会话       |
| 缓存     | Redis                         | 权限缓存、会话及任务状态     |
| 队列     | BullMQ                        | 文档解析、索引任务           |
| 文件存储 | MinIO / S3                    | 原始文件、文件版本           |
| 向量检索 | pgvector 或 Qdrant            | RAG 向量检索                 |
| 文本解析 | PDF / DOCX 解析工具、OCR      | 文档内容提取                 |
| LLM      | 可替换模型 Provider           | 问答、重排、Embedding        |

我建议 MVP 优先选择 PostgreSQL + pgvector，减少独立基础设施；如果检索规模、混合检索和过滤需求变复杂，再换成 Qdrant。文档原始文件始终放对象存储，不要放数据库大字段中。

## **6.2 后端模块划分**

```
apps/
├── web/                      # Vue 用户端
├── admin/                    # Vue 管理端
├── api/                      # Node.js API
└── worker/                   # 异步任务进程

packages/
├── auth/                     # 用户认证
├── workspace/                # 租户、工作空间
├── permission/               # RBAC + ACL
├── document/                 # 文档管理
├── storage/                  # 文件存储
├── parser/                   # 文档解析
├── knowledge/                # Chunk / Embedding / Index
├── retrieval/                # 检索与重排
├── qa/                       # Agent / RAG 问答
├── audit/                    # 操作审计
├── database/                 # ORM / Schema
└── shared/                   # 通用类型、工具
```

这里最重要的是把 `permission` 独立出来。

不要让文档模块、问答模块各自实现一套权限判断。所有模块都应该调用统一的权限服务。

## **6.3 核心 API 设计**

### **文档管理**

| Method | API                           | 功能                   |
| ------ | ----------------------------- | ---------------------- |
| GET    | `/api/documents`              | 文档列表（按权限过滤） |
| POST   | `/api/documents/upload`       | 上传文档               |
| GET    | `/api/documents/:id`          | 文档详情               |
| GET    | `/api/documents/:id/preview`  | 预览文档               |
| GET    | `/api/documents/:id/download` | 下载文档               |
| PATCH  | `/api/documents/:id`          | 修改文档信息           |
| DELETE | `/api/documents/:id`          | 删除文档               |
| GET    | `/api/folders/tree`           | 文件夹树               |
| POST   | `/api/folders`                | 创建文件夹             |
| PATCH  | `/api/folders/:id`            | 修改文件夹             |

### **权限管理**

| Method | API                                              | 功能             |
| ------ | ------------------------------------------------ | ---------------- |
| GET    | `/api/resources/:type/:id/permissions`           | 获取授权列表     |
| POST   | `/api/resources/:type/:id/permissions`           | 添加授权         |
| DELETE | `/api/resources/:type/:id/permissions/:grantId`  | 移除授权         |
| GET    | `/api/resources/:type/:id/effective-permissions` | 查询最终有效权限 |
| POST   | `/api/permissions/check`                         | 检查资源权限     |

其中 `effective-permissions` 特别重要，它返回继承、用户组和直接授权合并后的最终结果。

### **知识问答**

| Method | API                             | 功能           |
| ------ | ------------------------------- | -------------- |
| POST   | `/api/qa/sessions`              | 创建问答会话   |
| GET    | `/api/qa/sessions`              | 会话列表       |
| GET    | `/api/qa/sessions/:id`          | 会话详情       |
| POST   | `/api/qa/sessions/:id/messages` | 发送问题       |
| GET    | `/api/qa/available-documents`   | 获取可问答文档 |
| GET    | `/api/qa/sources/:id`           | 查看引用来源   |

`available-documents` 必须在后端过滤 `QUERY` 权限，不能信任前端传过来的文档 ID。

## **6.4 有两个地方需要特别做好**

**第一，权限变更后的缓存处理。**

例如：

```
管理员撤销用户 A 的文档访问权限
        ↓
更新 PostgreSQL 授权记录
        ↓
清除用户 A 对应工作空间的权限缓存
        ↓
后续文档请求重新计算权限
        ↓
AI 问答重新获取可访问的文档 ID
```

不要让权限缓存采用过长 TTL 后仍然允许旧权限生效。

**第二，文档移动时的权限影响预览。**

比如把一份文档从「公开研发文件夹」移到「机密项目文件夹」，文档的有效权限可能瞬间发生变化。

因此移动文件夹或文档时，建议先展示：

- 哪些用户将获得访问权限。
- 哪些用户将失去访问权限。
- 是否影响已有问答会话。

管理员确认之后再执行移动操作。

# **七、MVP 开发范围与实施顺序**

我不建议第一版就把所有企业管理功能全部做完。应该优先完成一条完整链路：

**上传文档 → 设置权限 → 用户访问 → AI 问答 → 引用原文。**

建议分成四个阶段：

| 阶段     | 实现内容                                    | 优先级 |
| -------- | ------------------------------------------- | ------ |
| 第一阶段 | 用户认证、工作空间、文档上传、文件夹、预览  | P0     |
| 第二阶段 | RBAC、ACL、用户组、权限继承、分享和撤权     | P0     |
| 第三阶段 | 文档解析、向量索引、权限过滤、AI 问答、引用 | P0     |
| 第四阶段 | 后台管理、操作审计、任务监控、版本管理      | P1     |

## **7.1 第一版建议一定要支持的能力**

**文档管理**

- 上传 PDF、DOCX、TXT、Markdown
- 文件夹管理、文档搜索、文档预览
- 文档版本与处理状态

**权限管理**

- 用户、用户组、工作空间角色
- 文档和文件夹授权
- 权限继承与独立授权
- 查看有效权限、授权和撤销

**知识问答**

- 全部可访问文档问答
- 指定文件夹和指定文档问答
- 答案引用原文、页码和段落
- 权限实时校验和历史会话权限保护

**后台管理**

- 用户和用户组管理
- 文档处理任务管理
- 权限变更审计
- 基础运行统计

## **7.2 最重要的测试场景**

权限系统不能只测试正常授权，还要测试边界条件。

| 测试场景                 | 预期结果                   |
| ------------------------ | -------------------------- |
| 用户没有文档权限         | 无法查看、下载和问答       |
| 用户有 VIEW，没有 QUERY  | 可以查看，不可问答         |
| 用户通过用户组获得权限   | 正确继承组权限             |
| 用户通过父文件夹获得权限 | 可以访问子文档             |
| 文档关闭权限继承         | 不再获得父级授权           |
| 管理员撤销用户权限       | 后续请求立即失去访问权限   |
| 用户伪造其他文档 ID      | 后端拒绝访问               |
| 不同租户访问彼此文档     | 完全隔离                   |
| 文档更新后重新索引       | 不再检索旧版本             |
| 历史问答来源失去权限     | 不再暴露原有敏感答案和引用 |

## **7.3 我认为还需要明确的一个权限边界**

企业系统经常忽略一个问题：

**管理权限和内容访问权限，不一定是同一回事。**

例如：

| 用户身份       | 管理权限             | 文档查看             | AI 问答        |
| -------------- | -------------------- | -------------------- | -------------- |
| 平台超级管理员 | 平台级               | 默认无权读取租户内容 | 无权           |
| 工作空间 Owner | 完整管理             | 默认有权             | 默认有权       |
| 工作空间 Admin | 用户、权限、资源管理 | 按资源权限决定       | 按资源权限决定 |
| 普通成员       | 无管理权限           | 按授权决定           | 按授权决定     |

这样管理员即使能够配置权限、查看用户信息，也不意味着他可以通过后台读取所有机密文档。

平台运维确实需要临时访问客户数据时，可以设计单独的授权、审批和审计机制，而不是直接给予超级管理员无限的数据读取权限。

# **八、最终建议：先把三个核心领域设计好**

我认为这个产品真正的技术难点不是文件上传，也不是向量数据库，而是下面三个领域：

**1. 文档领域模型**

Document、Folder、Version、Storage、ProcessingJob。解决文档怎么存储、管理、版本化。

**2. 统一权限领域模型**

WorkspaceRole、Group、ResourceACL、PermissionEvaluator。解决谁能访问哪些资源，以及权限如何继承。

**3. 知识问答领域模型**

DocumentChunk、Embedding、Retriever、QASession、QASource。解决如何基于授权文档进行安全问答。

我的最终推荐是：

- **数据层**：PostgreSQL 作为业务和权限的唯一事实来源。
- **权限层**：RBAC + ACL + 文件夹继承，不在向量数据库中维护权威权限。
- **文档层**：对象存储 + 异步解析 + 版本化索引。
- **问答层**：每次问答动态获取授权文档范围，再进行 RAG 检索。
- **产品层**：用户端以文档中心和知识问答为主，管理端以用户、权限和任务管理为主。

下一步最值得做的是把这套方案进一步落成一份可直接开发的技术设计：**完整 PostgreSQL DDL、权限计算 SQL、Node.js 权限服务代码，以及 Vue 3 页面组件和交互状态设计。**
