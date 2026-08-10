## ADDED Requirements

### Requirement: 任务运行时使用稳定的五文件边界

通用任务运行时 MUST 使用 `task.ts`、`database.ts`、`dispatcher.ts`、`worker-entry.ts` 和 `types.ts` 表达公共 API、数据库生命周期、主进程调度、Worker 子进程入口和类型契约，MUST NOT 使用含义宽泛的 runtime、store、format、normalize 或 utils 文件承载混合职责。

#### Scenario: 阅读任务执行链

- **WHEN** 开发者从 task.add 追踪任务的创建、领取、子进程执行和结果收敛
- **THEN** 调用链依次进入 TaskApi、TaskDatabase、TaskDispatcher、Worker 子进程入口和 TaskDatabase，不需要通过含义不明确的中间模块

### Requirement: 数据库、Dispatcher 与 Worker 按状态所有者聚合

任务数据库查询、事务和状态迁移 MUST 由 `TaskDatabase` 聚合；服务实例调度状态 MUST 由 `TaskDispatcher` 聚合；单个任务的子进程、timer、停止原因、IPC 结果和日志缓冲 MUST 由 `TaskExecution` 聚合。Worker MUST 只表示真正执行任务脚本的子进程角色。简单分支和值转换 MUST 保留在实际方法中，不得为 format、normalize、read 或 map 包装建立零散辅助函数。

#### Scenario: 查看单次任务执行

- **WHEN** 开发者检查一个已领取任务如何启动、续租、超时、终止并收敛
- **THEN** 对应状态和方法位于同一个 dispatcher 文件的单任务执行对象中，并按执行顺序组织

### Requirement: 内部任务脚本直接加载

任务 script MUST 只由服务端内部业务代码构造，HTTP API MUST NOT 接受或转发 script。任务运行时 MUST 使用原生动态导入读取脚本执行函数和生命周期导出，MUST NOT 额外执行 URL 规范化、服务目录限制或导出形状预校验。

#### Scenario: 执行内部任务脚本

- **WHEN** 服务端业务代码使用模块 URL 添加任务且 Dispatcher 领取并派发该任务
- **THEN** 创建、取消、终态回调和子进程执行按需直接导入该模块，导入或调用错误进入现有任务失败路径

### Requirement: 组织重构保持任务行为兼容

重构 MUST 保持公共 task API、任务表结构、状态、attempt、lease、重试、取消、超时、日志、进度、子进程 IPC 和 stale 恢复语义不变，documents 域 MUST 无需修改任务接入方式。

#### Scenario: 重构前后执行同一文档任务

- **WHEN** 相同文档任务在重构前后分别经历创建、执行和成功或失败收敛
- **THEN** 对外任务状态、attempt、日志、进度、结果和 documents 领域行为保持一致
