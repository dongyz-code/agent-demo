## ADDED Requirements

### Requirement: 文档层仅消费已验证文件
文档版本和 RAG runner MUST 通过 `hooks/documents/storage/source` 的内部能力接收和读取已验证文件，不得直接访问 MinIO 客户端，也不得把 File 行或对象存储原语暴露给 route。只有 `verified` 文件才能创建文档版本并启动处理。

#### Scenario: 创建通用文档
- **WHEN** 用户使用有效 `fileId` 创建文档版本
- **THEN** 文档模块绑定文件引用并创建唯一处理任务

#### Scenario: 未验证文件
- **WHEN** 用户提交上传中、验证失败或已删除文件
- **THEN** 文档模块拒绝创建处理任务

### Requirement: 显式文档处理状态与幂等
系统 MUST 为文档版本维护处理状态和阶段记录，并使用文档版本与处理配置保证幂等。重试 MUST 从最近成功阶段继续，不得重复创建 Segment。

#### Scenario: 首次处理
- **WHEN** 已验证文件首次绑定新文档版本
- **THEN** 系统创建一个等待执行的文档处理任务

#### Scenario: Worker 中断
- **WHEN** 任务中断后重试
- **THEN** 系统复用已成功产物并从未完成阶段继续

### Requirement: 解析器注册与选择
文档模块 MUST 通过解析器注册表按可信 MIME、文件签名和扩展信息选择解析器。解析器 MUST 遵循统一接口并声明支持类型、版本、超时和错误分类。

#### Scenario: 解析 PDF
- **WHEN** 文档处理任务读取合法 PDF
- **THEN** 系统选择 PDF 解析器并输出统一文档块

#### Scenario: 不支持类型
- **WHEN** 文件没有可用解析器
- **THEN** 系统标记不可重试失败并返回支持类型提示

### Requirement: 统一解析块
所有解析器 MUST 输出稳定块标识、块类型、文本、标题路径、页码、顺序和类型元数据。解析库专属对象不得泄露到标准化和 Segment 阶段。

#### Scenario: 表格解析
- **WHEN** 解析器识别到表格
- **THEN** 输出保留表头、行列语义和页码并使用统一 `table` 类型

#### Scenario: 代码解析
- **WHEN** 文档包含代码块
- **THEN** 输出保留代码文本、语言和顺序，不被普通清洗破坏

### Requirement: 标准化与安全清洗
文档模块 MUST 在切分前执行版本化标准化，包括 Unicode、空白、重复页眉页脚和 OCR 噪声处理，并移除不可信主动内容，同时保留标题、表格和代码语义。

#### Scenario: 重复页眉
- **WHEN** 多页文档包含相同页眉页脚
- **THEN** 标准化结果移除噪声且保留正文顺序

### Requirement: 可配置 Segment
文档模块 MUST 使用版本化策略按标题、段落、表格和代码边界切分，并以 token 限制兜底。Segment MUST 具有确定性 ID、内容 Hash、来源定位、父块关系和 Embedding 输入文本。

#### Scenario: 重复切分
- **WHEN** 相同文件和配置再次执行切分
- **THEN** 系统生成相同 Segment ID 且不产生重复记录

#### Scenario: 超长章节
- **WHEN** 章节超过 token 上限
- **THEN** 系统在安全边界二次切分并保留标题路径与重叠上下文

### Requirement: 处理配置版本化
系统 MUST 记录解析器、标准化器、Segment 及后续 Embedding/索引配置版本，使结果可复现。配置变化不得静默覆盖旧结果。

#### Scenario: 修改 Segment 配置
- **WHEN** 发布新 Segment 配置版本
- **THEN** 新任务使用新版本，旧结果保持可追溯并可选择重建

### Requirement: 上传完成后以文档为中心编排
上传初始化、完成与 Multipart 状态迁移 MUST 由 `hooks/documents/upload` 承载；上传完成后服务端 MUST 在同一业务流程中创建或追加 DocumentVersion，并按本次选择建立知识库关系。普通局部查询 MAY 由 route 直接使用 ORM。

#### Scenario: 仅完成上传
- **WHEN** 上传成功且本次关闭 RAG
- **THEN** 系统仍创建文档版本，但不创建 RAG 任务

#### Scenario: 显式创建并加入知识库
- **WHEN** 客户端完成带知识库选择的上传
- **THEN** 服务端内部绑定已验证 File、创建文档版本并建立知识库关系

### Requirement: 进度与错误
系统 MUST 记录读取、解析、标准化、Segment 和交接阶段的耗时、数量、可重试性和稳定错误码，并向管理端提供进度。日志不得记录完整文件内容。

#### Scenario: 解析器超时
- **WHEN** 解析器超过配置超时
- **THEN** 系统记录阶段、解析器版本和可重试属性并按策略处理

### Requirement: 可读性和依赖边界
实现 MUST 集中在 `hooks/documents`，调用方精确导入功能明确的业务文件，不通过根 barrel 暴露 File、S3 或 worker 内部原语。新增函数、接口、参数、返回值和重要字段 MUST 使用中文 TSDoc，复杂状态和安全规则 MUST 说明原因。

#### Scenario: 文档解析器打开文件流
- **WHEN** 文档解析器需要读取源文件
- **THEN** runner 通过 documents 域内部源文件能力构造解析输入，parser 不导入 S3，也不由 route 查询通用文件表

#### Scenario: 新增解析器
- **WHEN** 开发者新增一种解析器
- **THEN** 只需实现统一接口并注册，不需要修改上传服务、RAG 服务和 route 分支链
