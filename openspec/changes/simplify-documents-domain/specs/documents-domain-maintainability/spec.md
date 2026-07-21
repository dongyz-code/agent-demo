## ADDED Requirements

### Requirement: documents 保持单一业务域
服务端 MUST 继续以 `hooks/documents` 作为文件上传、文件管理、预览、文档处理、知识库和文件处理任务的单一业务域，MUST NOT 为本次代码精简恢复旧 `hooks/upload`、`hooks/document`、`hooks/rag` 或 `hooks/file` 顶层实现。

#### Scenario: 精简目录后检查业务边界
- **WHEN** 开发者查看服务端 hooks 目录
- **THEN** 文件相关业务实现 MUST 仍集中在 `hooks/documents`
- **THEN** 仓库 MUST NOT 出现转发到旧顶层目录的兼容 barrel

### Requirement: 域内依赖必须形成单向图
documents 子模块 MUST 按 `storage → files/preview → knowledge → processing` 的允许方向被依赖；upload 的纯策略、会话判断和验证逻辑 MUST NOT 依赖其他 documents 子模块。任何子模块 MUST NOT 导入根 `hooks/documents/index.ts`，files MUST NOT 依赖 processing。

#### Scenario: knowledge 使用文档查询
- **WHEN** knowledge 需要校验或读取文档
- **THEN** knowledge MUST 从 files/document 的稳定实现入口导入
- **THEN** knowledge MUST NOT 从根 documents barrel 反向导入

#### Scenario: processing 执行文件任务
- **WHEN** processing 需要读取文件、创建文档或关联知识库
- **THEN** processing MAY 沿允许方向依赖 files 和 knowledge
- **THEN** files 和 knowledge MUST NOT 反向依赖 processing 内部实现

#### Scenario: 运行依赖边界测试
- **WHEN** 执行 documents 依赖边界测试
- **THEN** 测试 MUST 检查根出口反向导入、跨层反向依赖和域外深层导入
- **THEN** 任一违规 import MUST 使测试失败并报告源文件与目标文件

### Requirement: 根公共 API 必须显式且最小
`hooks/documents/index.ts` MUST 使用显式命名导出，只暴露 server 启动、documents routes 和跨域任务中心当前需要的公共用例。根出口 MUST NOT 使用 `export *`，也 MUST NOT暴露 S3 client 构造、provider/parser 实例、worker 单任务控制或其他内部 helper。

#### Scenario: route 使用 documents 能力
- **WHEN** documents route 或系统任务中心需要调用领域能力
- **THEN** 调用方 MUST 从 `hooks/documents/index.ts` 导入明确公开的符号
- **THEN** 调用方 MUST NOT 深层导入 documents 内部文件

#### Scenario: 内部函数没有域外消费者
- **WHEN** 某个导出函数只被同一实现文件或同一子模块使用
- **THEN** 该函数 MUST 保持为模块内部符号或仅在子模块内导出
- **THEN** 根公共 API MUST NOT 转发该函数

### Requirement: 抽象必须有当前使用依据
registry、provider 接口和共享类型 MUST 至少满足多实现选择、跨文件复用、独立测试价值或外部系统隔离中的一项。只有定义没有消费者的类型、常量和函数 MUST 被删除；只有单个简单实现且没有注册需求的 validator MUST 使用直接函数实现。

#### Scenario: 多实现注册机制
- **WHEN** preview 存在 direct/image/text/office 多个 provider，或 parser 存在 local/remote 多个实现
- **THEN** 系统 MUST 保留统一接口和选择 registry
- **THEN** registry MUST 只在子模块内部暴露具体实现

#### Scenario: 无消费者定义
- **WHEN** 静态引用检查确认定义在整个工作区只有声明位置
- **THEN** 实现 MUST 删除该定义及无效转发
- **THEN** 类型检查和相关行为测试 MUST 继续通过

#### Scenario: 单实现内容验证
- **WHEN** 文件内容验证只有 Magic Number 一个实现且不存在运行时插件注册
- **THEN** 系统 MUST 直接执行内容检测函数
- **THEN** 系统 MUST NOT 仅为排序一个实现维护 validator interface、数组和 order 字段

### Requirement: 文件拆分反映真实职责
documents 文件 MUST 以独立状态机、外部系统边界、多个实现选择、纯算法或跨调用方复用为拆分依据。只包含少量类型、两个状态判断或纯转发导出的文件 MUST 合并到最近的所属模块；核心 worker 与单任务执行 MUST 保持分离。

#### Scenario: 清理纯转发文件
- **WHEN** 子模块 `index.ts` 只转发同目录文件且没有独立 API 边界价值
- **THEN** 根公共出口 MUST 直接显式导出目标实现
- **THEN** 纯转发文件 MUST 被删除

#### Scenario: 合并邻近小文件
- **WHEN** 类型或状态判断只被同一子模块的一至两个文件使用
- **THEN** 它们 MUST 移入最接近的策略、会话或查询文件
- **THEN** 合并 MUST NOT 改变 DTO、错误码或运行时状态语义

#### Scenario: 控制文件规模
- **WHEN** 单个文件同时承担 worker 调度和单任务业务执行
- **THEN** 实现 MUST 按这两个状态边界拆分
- **THEN** 实现 MUST NOT 为每个单行阶段再创建转发文件

### Requirement: 文档必须描述当前实态
documents README 和 OpenSpec 验收记录 MUST 只描述仓库中实际存在的目录、API、测试和恢复能力。被删除或从未落地的 `content/`、`documents/`、`task-runtime/`、旧 hooks 路径和 `getReadyDocument` MUST NOT 继续出现在当前架构说明中。

#### Scenario: 校验 README 引用
- **WHEN** 运行文档一致性检查或人工核对 README
- **THEN** README 中列出的内部目录与公共 API MUST 在仓库存在
- **THEN** 历史设计只能作为 OpenSpec 历史上下文，不得伪装成当前实现

### Requirement: documents 必须有可执行测试入口
`apps/server` MUST 提供可重复执行的 documents 聚焦测试入口，并实际包含依赖边界、上传完成、worker 领取与恢复、取消以及核心纯函数测试。任务清单 MUST NOT 把不存在或未运行的测试标记为完成。

#### Scenario: 运行 documents 聚焦测试
- **WHEN** 开发者执行服务端 documents 测试命令
- **THEN** 测试 runner MUST 发现并执行仓库中的实际测试文件
- **THEN** 任一失败 MUST 返回非零退出码

#### Scenario: OpenSpec 标记测试完成
- **WHEN** 实施任务把测试项标记为完成
- **THEN** 对应测试文件 MUST 存在
- **THEN** 任务记录 MUST 包含实际执行命令和通过结果

### Requirement: 对外行为保持兼容
本次内部收敛 MUST 保持现有 `/documents/*` 路径、请求响应 DTO、权限键、业务错误码、对象存储 key 和管理端交互不变。

#### Scenario: 前后端回归
- **WHEN** 管理端执行上传、恢复、预览、文件处理、知识库关联和任务查看流程
- **THEN** 调用路径和响应结构 MUST 与变更前兼容
- **THEN** 管理端 MUST NOT 需要因内部文件重组而增加兼容分支
