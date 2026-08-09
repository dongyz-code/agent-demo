# 通用任务管理模块

`hooks/tasks` 是单体服务唯一的后台任务运行时。业务模块只从 `task.ts` 导入 `task` 和公开类型，
不得直接访问任务表、attempt、lease、存储函数或 Worker 进程监督。

## 添加任务

`task.add` 只接收一个完整对象：

```ts
const taskId = await task.add({
  name: 'pdf.generate',
  script: new URL('./pdf-task.js', import.meta.url).href,
  data: { documentId },
  retry: { times: 3, delay: 5_000 },
  timeout: 10 * 60_000,
  concurrency: 1,
});
```

只有 `name`、`script` 和 `data` 必填。未提供的重试、超时和并发使用统一默认值。公共接口没有
注册、定义、transaction、去重键、状态或时间字段；任务记录和初始日志由 task 包自己的事务写入。

## 脚本约定

`script` 是当前服务目录内的 `file:` 模块 URL。模块默认导出执行函数，函数只接收一个对象：

```ts
import type { TaskRunInput } from '@/hooks/tasks/task.js';

interface PdfTaskData {
  documentId: string;
}

export default async function run(
  input: TaskRunInput<PdfTaskData>,
): Promise<{ objectId: string }> {
  await input.log.info('开始生成 PDF');
  await input.throwIfCanceled();
  const result = await generatePdf(input.data.documentId);
  await input.progress({ stage: 'generated', progress: 100 });
  return { objectId: result.objectId };
}
```

默认导出函数正常返回表示成功，抛出异常表示失败。返回值必须可被 JSON 序列化。执行参数只包含
`taskId`、`attempt`、`data`、`log`、`progress` 和 `throwIfCanceled`，不暴露 lease 或通用任务表。

脚本需要在任务创建、取消或最终失败时原子收敛领域数据，可以按需导出 `onCreate`、`onCancel`
或 `onTerminalFailure`。这些函数由 task 包在自己的状态事务中调用，不增加 `task.add` 参数。

## 公共 API

- `task.add(input)`：持久化任务并立即返回新任务 ID。
- `task.get(taskId)`：查询任务策略、进度、结果和全部 attempt。
- `task.list(options)`、`task.counts(filter)`：分页查询和状态统计。
- `task.logs(taskId, options?)`：查询带时间、级别和 attempt 的结构化日志。
- `task.cancel(taskId, options?)`：取消 `queued`、`running` 或 `retrying` 任务。
- `task.start()`：恢复异常中断任务并启动 Worker，只由服务启动代码调用。

## 生命周期

```text
queued ──领取──▶ running ──成功──▶ succeeded
                    │
                    ├──失败/超时/中断且可重试──▶ retrying ──到期──▶ running
                    │
                    ├──重试耗尽──▶ failed / timed_out
                    │
                    └──主动取消──▶ canceled
```

`retry.times` 表示首次执行之外允许的自动重试次数。每次领取都会向 `task_attempts` 追加记录，
旧 attempt 不覆盖。任务、attempt 和日志分别保存在 `tasks`、`task_attempts` 和 `task_logs`。

## Worker 与恢复

Worker 在全局并发和同名任务并发都有空位时原子领取任务。父进程把已持久化的 `script` 和
`data` 交给独立 Node.js 子进程；子进程直接动态导入脚本，不依赖注册表或创建任务进程的内存。
父进程负责 PID、heartbeat、超时、stdout/stderr 日志及 `SIGTERM` 到 `SIGKILL` 的终止升级。

Worker 启动时和运行期间都会恢复 lease 过期的任务。任务语义是 at-least-once，业务脚本必须
保证重复执行安全。

## 内部文件

- `task.ts`：唯一公共入口。
- `runtime.ts`：参数校验、脚本加载、默认策略和纯状态决策。
- `store.ts`：任务、attempt、lease、重试、取消、查询和日志状态机。
- `worker.ts`：父进程调度和子进程监督。
- `process-entry.ts`：子进程入口和脚本执行包装。
- `types.ts`：公共契约和父子进程消息类型。

任务中心提供列表、统计、详情和权限受控日志。模型不兼容旧任务表，部署前需要通过现有表管理
流程 reset `tasks`、`task_attempts` 和 `task_logs`。
