## ADDED Requirements

### Requirement: RAG 接入必须独立于文档上传
系统 MUST 在 DocumentVersion 入库后通过显式知识库关系触发 RAG 内容处理。知识库不存在、目标类型不支持、关系更新失败或内容任务失败不得阻止文档上传、下载、版本管理和预览。

#### Scenario: 上传未选择知识库的文档
- **WHEN** 用户上传合法文档且未执行知识库关系操作
- **THEN** 系统创建文档版本并返回成功，不创建 RAG pendingVersion

#### Scenario: 图片暂不支持内容解析
- **WHEN** 用户把已入库图片文档加入知识库但当前没有图片解析器
- **THEN** 系统保留图片文档和预览，并在独立 RAG 状态中报告类型不支持

## REMOVED Requirements

### Requirement: 文档默认进入 RAG 且可单次关闭
**Reason**: 文档管理是主业务，默认 RAG 会让知识库配置反向阻塞文档上传，并把不支持解析但支持管理和预览的文件排除在外。

**Migration**: 新文档默认不进入 RAG；已有文档保留现有知识库关系，后续版本是否处理由显式知识库关系和独立操作决定，不再由上传弹窗隐式修改。

