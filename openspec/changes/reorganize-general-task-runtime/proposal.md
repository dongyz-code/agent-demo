## Why

当前通用任务运行时的能力已经完整，但 `runtime.ts`、`store.ts` 和大量零散辅助函数没有按任务生命周期表达职责，创建、领取、执行、续租、收敛与恢复流程需要跨文件反复跳转才能理解。任务脚本只由服务端内部代码提供，继续维护独立的 URL 规范化与模块校验层也增加了没有实际边界价值的间接层。

## What Changes

- 在不改变任务表、公共 `task` API、状态机、attempt、lease、重试、超时、取消和日志语义的前提下重组任务运行时代码。
- 删除含义模糊的 `runtime.ts` 和 `store.ts`，将任务持久化与状态迁移集中到 `TaskDatabase`，将主进程调度状态集中到 `TaskDispatcher`，将单个 Worker 子进程状态集中到 `TaskExecution`。
- 保持 `task.ts`、`database.ts`、`dispatcher.ts`、`worker-entry.ts` 和 `types.ts` 五个核心 TypeScript 文件，不新增 format、normalize、utils 或单函数文件。
- 删除独立的任务输入、脚本 URL、结果和错误规范化辅助函数；校验和状态判断直接保留在实际业务入口或事务方法中。
- 将任务脚本视为服务端内部可信模块，使用原生动态导入读取执行函数与生命周期导出，不再维护服务端目录限制和额外导出形状校验。

## Capabilities

### New Capabilities

- `task-runtime-organization`：约束通用任务内部文件、类职责、依赖方向和可信脚本加载边界，使完整任务生命周期能够按稳定入口顺序阅读。

### Modified Capabilities

无。

## Impact

- 主要影响 `apps/server/src/hooks/tasks` 的内部文件、导入关系和针对内部函数的测试。
- `task.add/get/list/logs/cancel/start/counts`、任务数据库表、共享路由类型和 documents 调用方式保持不变。
- 不新增依赖，不修改数据库结构，不迁移任务数据。
