## ADDED Requirements

### Requirement: 文档选择必须即时反馈支持范围
管理端 MUST 在选择阶段按文档源策略限制文件扩展名、浏览器 MIME、大小和单次数量，并显示具体原因；客户端校验不得取代服务端可信验证。

#### Scenario: 选择支持的图片
- **WHEN** 用户在文档管理中选择 JPEG、PNG 或 WebP
- **THEN** 文件进入待上传队列且不要求启用 RAG

#### Scenario: 选择不支持的文件
- **WHEN** 用户选择不在文档源策略中的扩展名或明显超出上限的文件
- **THEN** 管理端拒绝加入队列并说明不支持的类型或大小限制

### Requirement: 上传队列必须显示真实阶段
管理端 MUST 区分待上传、初始化、传输中、已暂停、服务端确认、已入库和失败状态，不得把对象存储 100% 误表示为文档已入库。

#### Scenario: 普通对象上传完成
- **WHEN** PutObject 已完成但服务端仍在验证并创建版本
- **THEN** 队列显示服务端确认中且不显示最终成功

#### Scenario: 文档版本创建完成
- **WHEN** 服务端返回 DocumentUploadResult
- **THEN** 队列标记已入库并通知文档列表刷新

### Requirement: 队列操作必须匹配失败阶段
管理端 MUST 只为可恢复的传输或确认失败提供重试；可信验证拒绝 MUST 要求移除或重新选择文件。批次执行期间 MUST 防止重复开始。

#### Scenario: 传输临时失败
- **WHEN** 有效上传尝试发生网络错误
- **THEN** 用户可以重试且系统不会错误复用终态会话

#### Scenario: 文件内容被拒绝
- **WHEN** 服务端 Magic Number 或可信 MIME 验证失败
- **THEN** 队列说明文件被拒绝并要求重新选择，不执行无意义的同文件重试

### Requirement: 刷新恢复必须隔离目标并与服务端对账
管理端 MUST 按上传器用途隔离恢复空间。刷新后 MUST 删除未建立服务端会话的本地待选项；恢复已有会话时 MUST 查询服务端状态，并且不得把原 session 绑定到后来打开的其他 Document。

#### Scenario: 刷新未开始的选择
- **WHEN** 用户只选择文件但未初始化上传会话就刷新页面
- **THEN** 管理端不恢复“等待上传”记录

#### Scenario: 恢复有效 Multipart 会话
- **WHEN** 用户刷新时 Multipart session 仍为 initialized 或 uploading 且本地 Blob 存在
- **THEN** 管理端显式确认恢复并只补传对象存储缺失的分片

#### Scenario: 恢复其他文档的版本上传
- **WHEN** 恢复文件的 session 已绑定文档 A 而用户后来打开文档 B
- **THEN** 恢复继续使用文档 A 的原始意图，且新选择不得继承该 session

### Requirement: 页面刷新失败不得污染上传结果
文档版本创建后的通知和列表刷新 MUST 与上传文件状态隔离。

#### Scenario: 列表刷新失败
- **WHEN** DocumentVersion 已创建但管理端重新加载列表失败
- **THEN** 上传项仍保持已入库，页面单独报告列表加载错误

