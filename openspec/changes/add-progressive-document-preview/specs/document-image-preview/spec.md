## MODIFIED Requirements

### Requirement: 预览页面直接属于文档版本
系统 MUST 使用 `document_preview_pages` 按 `documentVersionId + pageNumber` 保存清晰页面，并使用 `document_preview_quick_pages` 按相同键保存快速页面。两个集合的页码都 MUST 从 1 开始连续，并记录尺寸、可信 MIME、字节数和私有对象位置。

#### Scenario: 两级转换完成
- **WHEN** worker 成功生成 N 页快速图片和 N 页清晰图片
- **THEN** 系统在两个集合中分别保存页码 1 至 N，并在 DocumentVersion 上记录 ready 和准确页数

### Requirement: 预览状态保存在版本上
系统 MUST 在 DocumentVersion 上独立记录 `pending`、`processing`、`ready` 或 `failed` 预览状态、当前已知页数和错误摘要。快速页面完整发布后版本 MUST 保持 `processing`，清晰页面完整发布后才能进入 `ready`。预览失败不得改变文档生命周期或 RAG 状态。

#### Scenario: 快速页面已发布但清晰页面仍在生成
- **WHEN** 快速页面集合已经完整发布且清晰页面尚未完成
- **THEN** 版本保持 processing、记录准确页数并允许读取快速页面

#### Scenario: 预览失败但 RAG 成功
- **WHEN** 页面转换失败而 RAG 已成功
- **THEN** 知识库继续使用该版本，详情只显示预览失败和重试入口

### Requirement: 页面集合必须完整替换
worker MUST 分别先生成并验证全部快速页面和全部清晰页面对象，再在事务中替换对应集合。快速集合发布后状态仍为 processing；只有清晰集合完整发布才能把状态更新为 ready。任一层级部分生成或失去任务租约时 MUST NOT 发布该层级的不完整页面。

#### Scenario: 快速阶段中途失败
- **WHEN** 转换器只生成部分快速页面后失败
- **THEN** 系统标记预览失败且不发布本次快速页面

#### Scenario: 清晰阶段中途失败
- **WHEN** 快速集合已经发布但清晰页面只生成一部分后失败
- **THEN** 系统不得把部分清晰页面作为 ready 结果发布，并保留可由后续重试替换的完整快速集合

### Requirement: 页面按窗口安全返回
系统 MUST 按受限页码窗口返回页面元数据、页面层级和短期签名 URL，不得一次返回大文档全部页面，也不得暴露 bucket 或 object key。processing 版本存在完整快速集合时 MUST 返回 quick 页面；ready 版本 MUST 返回 clear 页面。

#### Scenario: 清晰页面处理中查看文档
- **WHEN** 授权用户请求已发布快速集合的 processing 版本
- **THEN** 系统按页码窗口返回 quick 页面、准确总页数和短期地址

#### Scenario: 查看 ready 文档中间页面
- **WHEN** 授权用户请求 ready 版本的合法页面窗口
- **THEN** 系统按页码顺序返回 clear 页面、总页数、短期地址和过期时间

### Requirement: 预览任务可独立重试
系统 MUST 复用现有任务机制为同一版本创建唯一活动预览任务，并允许授权用户重试 failed 状态。重试和物理清理 MUST 覆盖快速与清晰页面行及其私有对象。

#### Scenario: 重复触发预览
- **WHEN** 上传完成和手动重试同时触发同一版本预览
- **THEN** 系统只保留一个活动任务

#### Scenario: 删除具有两级预览的文档
- **WHEN** 物理清理任务处理包含快速与清晰页面的已删除文档
- **THEN** 系统删除两个集合的页面行和去重后的全部私有对象

## ADDED Requirements

### Requirement: 查看器必须渐进替换页面
管理端 MUST 在 processing 响应包含 quick 页面时展示快速预览和清晰处理中提示，并持续轮询；收到 ready 的 clear 页面后 MUST 按相同页码自动替换，不要求用户关闭或刷新查看器。

#### Scenario: 快速页面升级为清晰页面
- **WHEN** 用户正在查看 quick 页面且后续轮询返回同页码的 clear 页面
- **THEN** 查看器原位展示 clear 页面并移除清晰处理中提示
