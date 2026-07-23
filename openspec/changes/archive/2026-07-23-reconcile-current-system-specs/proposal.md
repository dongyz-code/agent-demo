## Why

文档、RAG、任务中心、权限与 SchemaForm 能力经过多轮迭代后仍分散在未归档 change 中，主 specs 无法表达当前系统事实，部分旧 change 之间还存在互斥要求。现在需要先建立一份以已确认产品决策和当前实现为依据的规范基线，再安全归档历史变更，避免旧设计污染主规范。

## What Changes

- 为当前已经落地但尚未进入主 specs、且被多轮 change 反复改写的能力建立完整基线，覆盖文档生命周期、版本、图片预览、RAG、处理任务、领域边界、通用上传与业务任务中心。
- 明确 Document 是公共业务主体，DocumentVersion 是版本主体，File 仅承担内部存储职责；排除已经被推翻的 File 中心模型。
- 统一文档预览为服务端生成页面图片，排除旧的原文件、PDF、HTML 与文本多模式公共预览契约。
- 统一文档处理任务的状态、租约、取消和失败重试语义，排除依赖阶段 checkpoint 跳过处理阶段的旧恢复模型。
- 定义历史 change 的归档策略：最终有效能力进入主 specs 后，互相覆盖的文档历史 change 使用 `--skip-specs` 归档，独立且仍有效的 change 正常归档。
- 对原本计划独立归档的 change 先做实现审计；实现未达到 delta 的 change 保持 active 并重新打开缺失任务，不通过降低规范或虚假完成强行归档。
- 将基线已过期的 `simplify-database-schema` 留待独立重建和拆分，本 change 不继续执行其旧删表任务。
- 本 change 只治理 OpenSpec 规范，不修改运行时代码、数据库结构或公共 API。

## Capabilities

### New Capabilities

- `document-lifecycle-management`: 文档创建、查询、更新、删除以及最新版本选择等生命周期规则。
- `document-version-management`: 文档多版本上传、版本选择、版本状态与底层文件归属规则。
- `document-image-preview`: 服务端页面图片预览的生成、查询、状态与清理规则。
- `document-rag-versioning`: 文档版本进入 RAG、切换有效版本以及知识库关联规则。
- `document-processing-task`: 文档处理任务的阶段、租约、取消、重试和可观测状态规则。
- `documents-domain-boundary`: documents 领域目录、路由、错误与依赖边界规则。
- `generic-file-upload-management`: 普通上传与分片上传的存储级能力及其与文档业务的边界。
- `business-task-center`: 非文档专属的后台任务查询、日志与调度控制能力。

### Modified Capabilities

无。本 change 不修改现有主 specs 中的 capability。

## Impact

- 影响 `openspec/specs` 的能力基线以及 `openspec/changes` 的归档顺序。
- `add-schema-form-component` 保持独立并正常归档；`harden-admin-role-permissions` 因服务端细粒度操作权限尚未落实而保持 active，待完成后再由其 delta 生成主 specs。
- 不直接影响 `apps/`、`packages/`、数据库数据、运行时依赖或对外 API。
- 后续归档操作必须以本 change 生成并校验通过的主 specs 为前置条件。
