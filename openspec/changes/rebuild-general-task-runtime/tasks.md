## 1. 数据模型与公共契约

- [x] 1.1 重建共享任务状态、attempt、日志、查询和脚本类型，删除注册、业务事务与旧 add 类型
- [x] 1.2 重建 tasks 表并新增 task_attempts、task_logs 表，持久化 name、script、data 与策略快照，删除通用幂等和业务展示字段
- [x] 1.3 建立唯一公共 task API，完成单对象 add、get、list、logs、cancel 契约

## 2. 执行内核

- [x] 2.1 实现原子领取、attempt 创建、lease 续期、进度更新和成功/失败/重试/取消/超时状态机
- [x] 2.2 实现结构化持久日志和 TaskRunInput，支持 debug、info、error、进度与取消检查
- [x] 2.3 重写父 Worker，实现全局与同名任务并发、子进程监督、heartbeat、超时、SIGTERM/SIGKILL 和 stdout/stderr 日志
- [x] 2.4 重写子进程入口，直接导入持久化 script 并使用 IPC 返回安全执行结果
- [x] 2.5 实现启动及周期 stale 恢复，保留 interrupted attempt 并按策略重新调度

## 3. 文档任务迁移

- [x] 3.1 将文档内容、预览和清理收敛为唯一 `document.process` 脚本任务，共用重试、超时、并发及生命周期导出
- [x] 3.2 统一内容、预览和清理的单对象 task.add 与判别式 data，删除 transaction、去重键和业务展示参数
- [x] 3.3 使用 TaskRunInput 重写文档阶段运行时和 runner，移除 lease、complete、fail 依赖并保留领域幂等
- [x] 3.4 重写文档任务取消、人工重试与详情，将自动 attempt 和人工业务执行历史正确分离
- [x] 3.5 将 documents/tasks 收敛为 task、runtime、stage 三个文件，并让所有业务调用方只依赖 task 领域入口
- [x] 3.6 将文档 data 重建为可选 parts，使内容与预览在同一任务实例内组合或跳过，清理保持独占 part

## 4. 任务中心与清理

- [x] 4.1 重写任务中心查询与路由类型，按任务名称提供详情、分页、统计和结构化日志并保持权限边界
- [x] 4.2 删除旧 create、lifecycle、center、log、worker 契约及全部残留引用，不保留兼容转发层
- [x] 4.3 更新 tasks 与 documents README，准确描述单对象 add、script、状态机和接入流程

## 5. 验证

- [x] 5.1 为参数校验、状态转换、重试次数、超时终态和同名并发选择增加针对性测试
- [x] 5.2 运行服务端类型检查、构建、OpenSpec strict 校验和 git diff 检查并修复全部问题
- [x] 5.3 验证 script 持久化与子进程动态导入，并覆盖整体文档任务 parts 选择
