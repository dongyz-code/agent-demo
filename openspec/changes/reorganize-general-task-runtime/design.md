## Context

通用任务运行时已经实现持久化队列、attempt、lease、自动重试、超时、取消、结构化日志、子进程执行和 stale 恢复。当前实现使用 `runtime.ts` 承载输入、脚本、状态和并发规则，使用 `store.ts` 承载查询、日志、状态迁移与执行权操作，并通过大量无状态函数管理 Worker 的长期状态。功能完整但职责名称不能表达生命周期，阅读一个任务需要在多个宽泛模块和细粒度辅助函数之间跳转。

任务脚本地址只由服务端业务代码通过 `new URL(..., import.meta.url)` 构造，不接受 HTTP 参数。重构可以把它视为内部可信模块，不再维护独立的 URL 规范化和模块形状预校验层。

## Goals / Non-Goals

**Goals:**

- 保持公共 task API、数据库结构、状态、attempt、lease、重试、取消、超时、日志和子进程行为不变。
- 使用五个核心 TypeScript 文件表达公共入口、数据库状态、Dispatcher 状态、Worker 子进程入口和类型契约。
- 使用类聚合同一生命周期拥有的状态和操作，减少散落的模块变量、timer 和辅助函数。
- 让创建、领取、执行、续租、收敛和恢复逻辑能在对应类中按顺序阅读。

**Non-Goals:**

- 不修改任务表或共享路由类型。
- 不改变 documents 的任务创建、详情、取消和运行脚本契约。
- 不增加任务类型注册表、外部队列或新依赖。
- 不借本次重构修正或扩展任务功能。

## Decisions

### 1. 保留五个核心文件

`task.ts` 保留公共 `TaskApi`；`database.ts` 定义 `TaskDatabase`；`dispatcher.ts` 保存主进程调度与单任务执行对象；`worker-entry.ts` 作为真正执行任务脚本的 Worker 子进程入口；`types.ts` 保存公共及父子进程契约。删除 `runtime.ts` 和 `store.ts`，不增加 format、normalize、utils 或单函数文件。

选择该结构而不是继续按 query、lease、log、scheduler、supervisor 拆目录，是因为当前模块只有一个公共 API 和一个 Worker，类内按生命周期分区已经足够表达职责，更多文件会把单条执行链再次切碎。

### 2. 使用 TaskDatabase 聚合数据库生命周期

`TaskDatabase` 按公共任务操作、Dispatcher 执行权、状态收敛与恢复的顺序组织方法。事务内的成功、重试、失败和超时判断直接放在 attempt 收敛方法中，不再返回中间 decision 对象。只有复用数据库不变量的条件构造允许成为私有方法。

选择类而不是一组导出函数，是为了给全部数据库操作一个明确入口、隐藏内部事务方法并支持注入数据库连接进行测试；该类不承担 Dispatcher timer 或 Worker 子进程状态。

### 3. 使用 TaskDispatcher 和 TaskExecution 聚合运行状态

`TaskDispatcher` 持有实例标识、轮询 timer、恢复 timer、活动执行集合及调度标志，只公开启动、通知和中断能力。每个已领取任务由 `TaskExecution` 持有 ChildProcess、heartbeat、timeout、kill timer、停止原因、Worker IPC 结果和日志缓冲，并负责从启动到退出收敛的完整流程。

两个类保留在同一个 `dispatcher.ts`，避免增加只承载单个内部类的文件，同时消除当前 `ActiveTask` 数据对象与多个远距离函数之间的跳转。文件使用 dispatcher 命名是因为这部分运行在主进程并负责领取和派发；Worker 命名只留给实际执行脚本的子进程入口。

### 4. 在真实入口直接处理值

`TaskApi.add` 直接读取名称和策略默认值并执行必要范围检查；任务结果、错误和状态在产生或持久化位置直接处理。删除 normalize、format、read、map 等只包装简单分支或 JSON 往返的辅助函数。共享 SQL 条件和完整业务动作仍使用具名方法，避免复制 lease 等关键约束。

### 5. 内部脚本直接动态导入

添加、取消、最终失败回调和子进程执行在需要模块时直接调用原生 `import(script)` 并按 `TaskScriptModule` 使用结果。不再限制 file URL 所属目录，也不遍历导出项做预校验。业务代码仍必须构造服务端模块 URL，公共 HTTP API 不暴露 script。

### 6. 保持单向依赖

`task.ts` 依赖数据库和调度模块；`dispatcher.ts` 依赖数据库与类型；`worker-entry.ts` 依赖数据库与类型；`database.ts` 不依赖 TaskApi 或调度模块。取消状态先由数据库提交，再通知主进程中断子进程，保持现有顺序并避免循环依赖。

## Risks / Trade-offs

- [内部错误脚本不再获得专用预校验错误] → 原生 import 或函数调用错误仍按现有任务启动/执行失败路径记录；script 不对外暴露。
- [database.ts 和 dispatcher.ts 仍然较长] → 通过类、方法顺序和职责分区保证单文件可连续阅读，不以任意行数继续拆分。
- [移动大量代码可能产生行为漂移] → 先保留现有测试基线，再补充针对类入口的状态测试，并运行服务端类型检查和构建。
- [类包装无状态数据库操作可能只形成命名空间] → `TaskDatabase` 注入连接并隐藏事务细节；不为纯类型或简单值创建额外类。

## Migration Plan

1. 建立 `TaskDatabase` 并迁移 store 与 runtime 中的数据库和状态收敛逻辑。
2. 将 TaskApi 改为直接处理输入与内部脚本导入，并依赖数据库实例和 Dispatcher 实例。
3. 使用 `TaskDispatcher` 与 `TaskExecution` 重组父进程逻辑，保持 Worker 子进程消息协议不变。
4. 更新 worker-entry 和测试引用，删除 runtime.ts、store.ts 及其内部函数测试。
5. 运行任务测试、服务端类型检查和构建；部署不需要数据库迁移。

回滚只需恢复原任务模块文件和导入关系，数据库记录与表结构无需处理。

## Open Questions

无。公共行为和五文件边界已经确定。
