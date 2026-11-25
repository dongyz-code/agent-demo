# 通用任务管理模块

`hooks/tasks` 是单体服务唯一的后台任务运行时。任务脚本默认导出执行函数，
`defineTask` 只声明脚本策略并返回类型化入队句柄。

## 定义任务

```ts
import { defineTask } from '@/hooks/tasks/task.js';
import type { TaskRunContext } from '@/hooks/tasks/task.js';

export const generatePdfTask = defineTask<GeneratePdfData>({
  script: import.meta.url,
  group: 'document',
  concurrency: 2,
  retry: { times: 3, delayMs: 5_000 },
  timeoutMs: 10 * 60_000,
});

export default async function generatePdf(
  data: GeneratePdfData,
  context: TaskRunContext,
) {
  await context.log.info('开始生成 PDF');
  await context.throwIfCanceled();
  await context.progress({ stage: 'rendering', progress: 50 });
  return await renderPdf(data);
}
```

`script: import.meta.url` 会被归一化为相对于 `hooks` 目录的无扩展名入口，并随任务记录
保存。开发环境加载 `.ts`，构建环境加载 `.js`。任务脚本必须默认导出执行函数。

`defineTask` 不接收执行函数、`prepare`、`onCancel` 或 `onFailure`。需要与领域表共享
事务时，由领域代码生成任务标识并把同一个事务传给 `enqueue`。

## 调用任务

```ts
const taskId = await generatePdfTask.enqueue(data, {
  actorUserId: userId,
  correlationId: `document:${data.documentId}`,
  title: '生成 PDF',
});
const detail = await task.get<GeneratePdfData>(taskId);
await task.cancel(taskId, {
  userId,
  errorCode: 'USER_CANCELED',
  message: '用户取消',
});
```

任务句柄只暴露 `enqueue`。详情、取消、列表、统计和日志统一通过 `task` 使用。
`correlationId` 用于关联领域对象，并可通过 `task.list` 的 `correlation_id` 过滤。

自动重试需要续跑时，执行函数使用通用 checkpoint：

```ts
const remote = await resumeRemoteJob(context.checkpoint);
await context.saveCheckpoint({ jobId: remote.jobId });
```

## 执行

父 Dispatcher 负责原子领取、全局与分组并发、超时、取消通知和进程监督。入队、领取、取消和执行结束均在数据库事务中发送 PostgreSQL `NOTIFY`，各实例通过 `LISTEN` 接收事件后读取队列，不设置固定间隔的领取轮询、运行心跳或恢复扫描。

Worker 的执行凭据有效至本次超时加退出宽限期，无需续租；父进程通过 IPC 和子进程 `close` 事件处理结果。正常运行时只为已存在的重试或其他实例的运行截止时间安排单次唤醒，本实例子进程由独立的超时等待监督；空闲队列没有周期查询。进程异常退出后，其他实例或重启后的服务依据已保存的执行截止时间恢复任务。数据库通知连接重建后会补读队列并检查错过的取消；连接或查询故障时安排单次重试等待。
Worker 子进程按持久化的 `script_path` 动态导入模块，直接调用默认导出函数：

```ts
const handler = await loadTaskScript(scriptPath);
await handler(data, context);
```

函数不会写入数据库或通过 IPC 序列化。新增任务只需要新增脚本和 `defineTask` 句柄，
不维护集中注册表。脚本路径随任务持久化，移动或改名前需处理尚未完成的任务。

## 状态与历史

```text
queued ──领取──▶ running ──成功──▶ succeeded
                    │
                    ├──失败/超时/中断且可重试──▶ retrying ──到期──▶ running
                    │
                    ├──重试耗尽──▶ failed / timed_out
                    │
                    └──主动取消──▶ canceled
```

任务、每次执行和日志分别保存在 PostgreSQL 的 `tasks`、`task_attempts` 和
`task_logs`。`tasks` 同时保存关联标识、结果和自动重试 checkpoint。父进程同时收集
IPC 结果和 stdout/stderr 日志。

任务语义是 at-least-once，领域写入必须保持幂等。取消时的领域状态由业务入口显式收敛；
任务运行时不再加载业务生命周期回调。

## 内部文件

- `task.ts`：`defineTask`、类型化入队句柄和任务中心运行时。
- `script-loader.ts`：脚本入口归一化、解析和默认执行函数加载。
- `database.ts`：任务查询、attempt、lease、日志和状态迁移。
- `dispatcher.ts`：实例调度和单任务 Worker 生命周期监督。
- `events.ts`：事务内发布任务变化，订阅变化后唤醒执行。
- `worker-entry.ts`：子进程入口和默认执行函数包装。
- `types.ts`：公共契约和父子进程消息类型。
- `policies.ts`：分页和重试边界。

任务表已不兼容旧模型。部署前需要通过现有表管理流程 reset `tasks`、`task_attempts`、
`task_logs`、`file_processing_tasks` 和 `file_processing_task_stage_runs`。
