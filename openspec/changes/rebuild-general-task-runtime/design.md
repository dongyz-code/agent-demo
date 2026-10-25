## Context

本仓库是单体 Node.js 服务，已有 PostgreSQL、Drizzle、启动期表检查和多实例部署。
后台任务需要支持脚本执行、自动重试、超时、分组并发、执行历史与日志，同时业务接入
必须保持简单。任务表允许 reset，不承担旧数据兼容。

## Goals / Non-Goals

**Goals**

- 使用方只通过类型化 `enqueue` 创建任务。
- 脚本路径决定执行代码，不维护集中注册表。
- 任务、attempt 和日志持久化到 PostgreSQL。
- 任务在独立 Node.js 子进程执行。

**Non-Goals**

- 不实现 DAG、cron、依赖关系或 exactly-once。
- 不引入 Redis、BullMQ、Temporal 或 Graphile Worker。
- 不在任务框架内执行或保存业务生命周期回调。

## Decisions

### 1. `defineTask` 只负责策略和类型化入队

```ts
export const documentProcessTask = defineTask<DocumentProcessTaskData>({
  script: import.meta.url,
  group: 'document',
  concurrency: 2,
  retry: { times: 3, delayMs: 5_000 },
  timeoutMs: 2 * 60 * 60 * 1_000,
});

export default async function processDocument(
  data: DocumentProcessTaskData,
  context: TaskRunContext,
) {
  // 实际执行
}
```

命名导出是调用方使用的入队句柄，默认导出是子进程执行入口。`defineTask` 不接收
handler、prepare 或 onCancel/onFailure。这样脚本路径、执行函数和持久化类型保持一一对应，
也不需要 WeakMap 反查内部定义。

### 2. 脚本路径是稳定任务标识

`script: import.meta.url` 被归一化为相对于 `hooks` 目录的无扩展名路径。开发环境解析
`.ts`，构建环境解析 `.js`。路径随任务记录保存到 `tasks.script_path`，不再单独保存
`task_type` 或 `module_path`。

加载器只允许 `hooks` 内的规范路径，拒绝目录逃逸、缺失脚本和非函数默认导出。路径一旦
被历史任务引用就是契约，移动或改名时必须保留兼容入口。

### 3. 业务准备由领域代码显式完成

`enqueue` 只序列化并保存最终 data。需要与领域表同事务时，领域代码先调用
`task.createId()`，再在同一事务中写领域记录并调用任务句柄：

```ts
const taskId = task.createId();
await db.transaction(async (transaction) => {
  await updateDomainState(transaction);
  await documentProcessTask.enqueue(data, {
    actorUserId,
    taskId,
    transaction,
    correlationId: `document-process:${data.documentId}`,
    title: '处理文档',
  });
});
```

预览已就绪等跳过逻辑由领域入队函数直接返回 `null`，不再通过 `prepare` 回调表达。

### 4. 子进程直接调用默认导出函数

父 Dispatcher 负责领取、并发、lease、heartbeat、超时、取消检测和进程监督。子进程收到
`taskId`、`scriptPath`、attempt、lease 和 data 后执行：

```ts
const handler = await loadTaskScript(input.scriptPath);
await handler(input.data, context);
```

执行函数不写入数据库，也不通过 IPC 序列化。正常返回为成功，抛出异常为失败。

### 5. PostgreSQL 保存任务、执行和日志

- `tasks`：脚本路径、关联标识、分组、展示名称、data、checkpoint、状态、策略快照、
  进度、lease 和结果。
- `task_attempts`：每次领取的 attempt、worker、PID、状态、时间和错误。
- `task_logs`：任务、attempt、级别、消息和时间。

attempt 和日志只追加，不覆盖历史。任务语义为 at-least-once，领域写入必须幂等。

### 6. 取消和领域状态显式收敛

通用 `task.cancel` 只修改任务和 attempt 状态并终止子进程。领域取消由业务函数在同一个
事务中调用 `task.cancel({ transaction })` 后更新自己的表。任务框架不加载业务取消回调。

任务脚本失败时负责把自己的领域状态收敛到 failed。自动重试的下一次脚本执行负责重新
标记为 processing；任务中心的 retrying 状态仍是权威的自动重试信息。

### 7. 文档任务只保留一套通用执行历史

`tasks.correlation_id` 关联文档，`tasks.checkpoint` 保存自动重试所需的轻量恢复信息。
`tasks.result` 保存处理结果，`task_attempts` 和 `task_logs` 保存唯一执行历史。删除
`file_processing_tasks`、`file_processing_task_stage_runs` 和 `stage.ts`，不再维护文档
专用的状态机、阶段 attempt 或结果摘要。

### 8. 任务脚本和业务入口分离

`tasks/process.ts` 只声明并执行文档预览/RAG，`document-process-action.ts` 负责入队、取消、
详情和人工重试。`cleanup.ts` 同样只保留清理脚本与删除入队。调用方只接触业务入口。

## Risks / Trade-offs

- [脚本路径与文件布局耦合] → 路径作为稳定契约，移动文件时保留兼容入口。
- [取消回调移除] → 取消的领域收敛必须由业务入口显式完成，不能只调用通用 cancel。
- [超时后领域状态可能保留 processing] → 任务中心以 timed_out 为准，人工重试会重新进入
  processing；后续如需自动领域收敛，应设计独立对账任务，不恢复隐式回调。
- [自动重试期间领域状态短暂显示 failed] → 上限重试由通用 retrying 状态表达，脚本重跑时重置。
- [删除文档任务扩展表] → 任务输入和结果保存在通用任务表，按 `correlation_id` 查询；
  部署前 reset 旧任务数据。

## Migration Plan

1. 将 `tasks` 的 `task_type` 和 `module_path` 合并为 `script_path`。
2. 删除 `definition-store`，将 load 逻辑收敛为脚本默认函数加载。
3. 将文档 prepare 迁移为显式领域入队函数，将取消收敛迁移为显式业务函数。
4. reset `tasks`、`task_attempts`、`task_logs`、`file_processing_tasks` 和
   `file_processing_task_stage_runs` 后部署。

## Open Questions

无。首期不使用业务生命周期回调。
