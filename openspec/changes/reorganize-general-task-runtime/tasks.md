## 1. 数据库与公共入口

- [x] 1.1 新建 `TaskDatabase`，按创建查询、取消、领取运行、状态收敛和恢复顺序迁移现有数据库行为
- [x] 1.2 重写 `TaskApi`，直接处理任务输入和内部脚本导入，并通过 `TaskDatabase` 与 `TaskDispatcher` 完成公共操作

## 2. Dispatcher 与 Worker 子进程

- [x] 2.1 使用 `TaskDispatcher` 聚合实例调度、并发、通知与 stale 恢复状态
- [x] 2.2 使用 dispatcher 文件内的 `TaskExecution` 聚合子进程、IPC、日志、heartbeat、超时、终止和退出收敛
- [x] 2.3 更新 `worker-entry.ts` 直接导入内部脚本，并通过 `TaskDatabase` 提供日志、进度和 lease 检查

## 3. 清理与验证

- [x] 3.1 删除 `runtime.ts`、`store.ts` 及零散 normalize/map/read 辅助逻辑，更新 README 和全部内部引用
- [x] 3.2 更新任务测试以覆盖直接输入处理、重试/超时收敛、内部脚本加载和同名并发，并运行任务测试
- [x] 3.3 运行服务端类型检查、构建、OpenSpec strict 校验和 git diff 检查

## 4. 文件语义命名

- [x] 4.1 将主进程调度文件调整为 `dispatcher.ts`，将子进程入口调整为 `worker-entry.ts`，并同步引用、文档和验证
- [x] 4.2 将主进程内部命名统一为 Dispatcher 与 Execution，将子进程协议统一为 Worker，并保留稳定数据库字段和错误码
