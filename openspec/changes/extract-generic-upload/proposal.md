## Why

文件存储、上传会话和可信验证目前隶属于 documents，上传完成同时创建文档版本，其他业务无法独立复用。需要把文件生命周期抽到通用 upload 模块，以稳定文件句柄连接业务，访问地址统一按需生成。

## What Changes

- 抽取 `hooks/upload`，统一文件上传、会话、验证、元数据、读取和短期 URL 生成，使用组合隔离 S3 物理位置。
- **BREAKING**：通用上传接口移动到 `/upload`，完成上传仅返回文件 key 和可信元数据；文档版本绑定通过独立文档接口完成。
- **BREAKING**：上传会话移除文档标识，预览页面改为引用通用文件；前端分别持久化上传结果与业务结果，绑定失败只重试绑定。
- 客户端直传使用临时对象，完成时固化到不可被旧上传签名覆盖的最终位置。
- 文件访问仍由业务校验权限，upload 统一通过 key 打开流和生成 URL，不开放任意 key 换取 URL 或物理删除的公共接口。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `generic-file-upload-management`：文件句柄、上传与业务绑定分离、通用入口、用途策略和不可变最终对象。
- `documents-domain-boundary`：文档模块依赖通用 upload，上传完成与文档版本绑定分开，预览产物以文件句柄引用。
- `document-version-management`：文档版本绑定使用文件 key 幂等，上传幂等键不再携带文档目标。
- `document-image-preview`：页面记录以通用文件句柄替代物理存储位置。

## Impact

- 服务端 upload 模块、文档下载/解析/预览/清理、通用上传路由与文档绑定路由。
- 管理端 Uppy 会话恢复、上传完成和文档绑定重试，共享 API 与文件类型。
- 上传会话与预览页面表结构变化，部署需要按现有 reset 规则处理；不增加依赖。
- 更新相关规格，执行服务端、管理端及共享类型检查、上传聚焦测试和 OpenSpec strict 校验。
