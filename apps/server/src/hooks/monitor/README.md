# 系统监控

系统监控包含定时计划、执行记录与 Redis 缓存管理。计划配置和触发台账保存在 PostgreSQL，执行统一交给现有 `hooks/tasks`；Redis 只保存可序列化业务数据，不保存 SDK、连接池或执行锁。

## Redis 配置与业务接入

使用官方 `redis` 客户端。配置文件增加以下节点，生产环境必须为不同应用、环境指定不同的 `prefix`：

```json
{
  "redis": {
    "host": "127.0.0.1",
    "port": 6379,
    "database": 0,
    "prefix": "agent-demo:dev",
    "username": "default",
    "password": "由部署环境提供",
    "tls": false
  }
}
```

用户名、密码、TLS 和 database 均可省略。应用数据键形如 `agent-demo:dev:cache:system.settings:current`；空间失效版本使用独立的 `generation` 键。未配置前缀时按 APP_PROD 使用 `agent-demo:dev` 或 `agent-demo:prod`，共享 Redis 的部署应显式覆盖。

- `cacheSpaces` 声明允许管理的业务空间、用途、默认 TTL 和是否允许查看值。
- `loadCached(name, key, load)` 读取 JSON，未命中时回源，同进程合并并发加载；源数据错误正常抛出。Redis 故障和损坏 JSON 均回源，命令等待上限为 2 秒，不启用离线命令队列。
- `invalidateCache` 用于业务更新后失效。失效版本与 Lua 比较写入防止已经开始的回源在清理后重新写回旧值。该模块是数据缓存，不提供数据库与 Redis 间的强一致事务；失效失败时通过 TTL 收敛。
- 当前实际接入 `sys/setting/get` / `set`，系统配置缓存 TTL 为 30 秒，更新后失效。配置可能包含内部数据，因此不开放值查看。
- AI SDK 句柄恢复为业务进程内 Map，不在缓存监控中冒充共享数据缓存。

Redis INFO 概览指标属于整个实例，不能当作当前应用命中率。仅返回安全字段白名单；INFO 无权限时报告读取失败。键浏览使用 SCAN，每批 COUNT 为 100，最多推进 10 次，不使用 KEYS，不把匹配批次计为键总数。列表按游标继续，前端按键去重并限制最多展示 1000 个键。TTL 是扫描时快照。

清理仅接受已注册空间及其业务键。整空间使用 COUNT 200 分批 SCAN + UNLINK；前端每轮最多 1000 批，显示进度、中断和重试结果，不提供 FLUSHDB / FLUSHALL。业务持续写入时清理完成后仍可能出现新键。

值查看另需 `actions.cache.view`，空间还必须声明 `inspectable`。服务端在 Lua 中原子限制 16 KiB 后读取，只接受 JSON 字符串，递归遮盖常见敏感字段。首个配置空间明确禁用此能力，列表不返回任何值。

## 定时计划与任务中心

新增 `schedules`、`schedule_runs`、`monitor_audits` 三张表，通过现有启动建缺失表机制创建，不改动已有任务表结构。无需 reset 现有任务或业务表。

- 处理器由 `schedules/handlers.ts` 声明描述、默认参数和现有 `defineTask` 策略；请求只能选择处理器标识，不能指定脚本或代码。
- 当前支持 `upload.cleanup`，只接受 `{}`，通过独立 Worker 执行上传清理，默认超时五分钟，失败重试一次。
- 运维可新增、编辑、启停、删除计划、执行一次；Croner 负责表达式和 IANA 时区校验以及未来五次时间预览。
- 内置上传清理计划只在不存在时插入。已有 Cron、参数、启停状态不被覆盖；软删除占位避免重启后复活。新增业务处理器在代码中登记，不能由界面创建任意执行能力。

主进程每秒领取最多 50 个到期计划，使用 `FOR UPDATE SKIP LOCKED`。计划行锁、通用任务入队、触发记录和下一次时间推进共用同一 PostgreSQL 事务。自动触发以计划标识与计划时间唯一去重；人工触发以计划标识与 requestId 去重。事务失败不推进时间，下一轮可以重试。

自动、人工触发都锁同一计划行。已有 queued、running、retrying 任务时自动触发记为跳过，人工触发报告冲突。不同计划可以选择同一处理器，处理器共享分组并发策略继续由任务中心约束。

停机默认不补跑。为允许正常轮询与查询延迟，计划到期五秒内允许执行；超过五秒则只保存一条错过记录，并计算未来下次时间，不逐条回放停机期间触发。暂停只停止未来调度，不取消已入队任务；删除计划保留历史。

执行进度、attempt、重试、日志和错误均读取任务中心。执行依然是至少一次语义，处理器业务写入应幂等，不宣称业务 exactly-once。多实例通过数据库协调入队，Redis 不参与执行权。

每分钟清理一批最多 100 条、30 天前已终结的调度记录及对应 task/attempt/log，活动任务不清理；操作审计保留 90 天并按相同批次预算清理。大规模积压可能延长实际保留时间。

## 权限与验证

- 计划读取 `pages.monitor.schedule`；修改 `actions.schedule.edit`；启停 `actions.schedule.toggle`；删除 `actions.schedule.delete`；人工执行 `actions.schedule.run`。
- 台账和详情 `pages.monitor.runs`，详情先按触发记录取得关联任务，不能凭任意 taskId 查看其他业务任务。
- 缓存读取 `pages.monitor.cache`；值查看 `actions.cache.view`；清理 `actions.cache.clear`。
- ROOT 系统管理员按仓库现有规则拥有全部权限。旧 `actions.task.schedule` 与旧 `/sys/task/schedule-*` 已移除，角色需按新页面重新授权。
- 配置修改、启停、删除和人工执行在事务内记录操作人；缓存清理先记录请求审计再执行，审计标明请求而非伪称完成。

真实集成验证：先启动一次服务创建缺失表，再执行 `pnpm --filter @repo/server test:monitor`。验证使用独立 Redis 随机前缀、独立测试计划并清理自己的记录，不清空业务数据；验证期间停止主服务调度器，避免测试入队任务被真实 Worker 领取。

若依功能参考与源代码链接见 [ruoyi-reference.md](./ruoyi-reference.md)。界面参考任务配置、运行日志和缓存管理的功能组织，执行模型使用本项目已有任务中心。
