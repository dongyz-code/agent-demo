# 系统监控

系统监控包含定时任务和缓存管理两个页面。执行记录从定时任务的“记录”打开抽屉查看，也可通过工具栏查询全部记录；不再提供独立菜单。计划配置和触发台账保存在 PostgreSQL，执行统一交给现有 `hooks/tasks`；Redis 只保存可序列化业务数据，不保存 SDK、连接池或执行锁。

## Redis 配置与业务接入

使用 `cache-manager`、Keyv 和 `@keyv/redis` 管理缓存，各业务空间与管理接口共用一个官方 Node Redis 客户端连接。配置文件增加以下节点，生产环境必须为不同应用、环境指定不同的 `prefix`：

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

用户名、密码、TLS 和 database 均可省略。应用数据键形如 `agent-demo:dev:cache:system.settings:current`。未配置前缀时按 APP_PROD 使用 `agent-demo:dev` 或 `agent-demo:prod`，共享 Redis 的部署应显式覆盖。

- 业务在自己的 `cache.ts` 中调用 `defineCache<T>({ name, label, ttl, inspectable })`，模块加载时创建 `CacheSpace<T>` 实例并自动登记管理信息，不再单独维护空间清单。空间名必须唯一。
- 实例提供 `get`、`set`、`del`、`clear` 和 `wrap`。TTL 声明单位统一为毫秒；管理接口继续返回秒，与 Redis TTL 展示一致。`get` 未命中返回 `undefined`，`null` 是有效缓存值。
- `wrap(key, load)` 直接使用 cache-manager 的回源能力，在线时合并同实例、同键的并发加载；真实数据源错误原样抛出。Redis 离线时直接回源，损坏缓存视为未命中；Redis 写入故障不会丢弃成功的回源结果。命令等待上限为 2 秒，不启用离线命令队列。
- 数据库更新后使用实例的 `del(key)`，配合 TTL 保持缓存最终一致。删除、清理或主动写入都不会取消已开始的回源，旧查询可能再次写入缓存，直到 TTL 到期；该模块不提供数据库与 Redis 间的强一致事务。`get`、`set` 和 `del` 对 Redis 故障降级；`clear` 需要明确清理结果，失败时抛出错误。
- 当前实际接入 `sys/setting/get` / `set`，系统配置缓存 TTL 为 30 秒，更新后失效。配置可能包含内部数据，因此不开放值查看。
- AI SDK 句柄恢复为业务进程内 Map，不在缓存监控中冒充共享数据缓存。

公共缓存能力集中在 `hooks/cache/`，业务缓存声明跟随实际使用它的业务模块，不集中维护所有业务缓存。当前系统配置只有读写接口，缓存定义放在 `router/settings.ts`，不为单个声明创建业务目录。监控接口共用的请求字段和错误转换放在 `router/monitor.ts`。业务调用示例：

```ts
import { defineCache } from '@/hooks/cache/index.js';

/** 用户摘要缓存；TTL 为一分钟，管理端默认不允许查看值。 */
export const userSummaryCache = defineCache<UserSummary>({
  name: 'user.summary',
  label: '用户摘要',
  ttl: 60_000,
});

const summary = await userSummaryCache.wrap(userId, async () => {
  return await readUserSummary(userId);
});
await userSummaryCache.del(userId);
```

`hooks/cache/redis.ts` 负责共享连接、前缀和错误日志；`space.ts` 中的 `CacheSpace<T>` 类封装空间状态、业务读写、回源、值解码和分批清理；`index.ts` 负责实例创建、空间注册与管理操作。Keyv 和 cache-manager 实例均为类的私有字段。Redis 中保存 Keyv 序列化数据，值查看接口解码后只展示脱敏业务值，不展示内部存储信息。

缓存页面直接展示业务空间及键管理，不提供 Redis 实例概览。`/sys/cache/status` 仅通过有超时限制的 PING 检查连接，连接不可用时提示业务缓存回源，不读取 INFO 或采集实例指标。键浏览使用 SCAN，每批 COUNT 为 100，最多推进 10 次，不使用 KEYS，不把匹配批次计为键总数。列表按游标继续，前端按键去重并限制最多展示 1000 个键。TTL 是扫描时快照。

清理仅接受已注册空间及其业务键。整空间使用 COUNT 200 分批 SCAN + UNLINK；前端每轮最多 1000 批，显示进度、中断和重试结果，不提供 FLUSHDB / FLUSHALL。业务持续写入时清理完成后仍可能出现新键。

值查看另需 `actions.cache.view`，空间还必须声明 `inspectable`。服务端在 Lua 中原子限制 16 KiB 后读取，只接受 JSON 字符串，递归遮盖常见敏感字段。首个配置空间明确禁用此能力，列表不返回任何值。

## 定时计划与任务中心

新增 `schedules`、`schedule_runs`、`monitor_audits` 三张表，通过现有启动建缺失表机制创建，不改动已有任务表结构。无需 reset 现有任务或业务表。

- 业务方法统一放在 `schedules/methods/`，`methods/index.ts` 汇总导出方法并登记描述、参数校验和现有 `defineTask` 策略；调度逻辑和目录接口统一从该入口读取。请求只能选择处理器标识，不能指定脚本或代码。
- 新增方法时在 `methods/` 下创建默认导出的 `(data, context)` 异步函数，再在 `methods/index.ts` 导出并注册。Worker 独立加载具体方法文件，数据库仍保存稳定的处理器标识。
- 当前支持 `upload.cleanup`，只接受 `{}`，通过独立 Worker 执行上传清理，默认超时五分钟，失败重试一次。
- 运维可新增、编辑、启停、删除计划、执行一次；Croner 负责表达式和 IANA 时区校验以及未来五次时间预览。
- 内置上传清理计划默认每天凌晨 3 点执行（`0 3 * * *`，`Asia/Shanghai`），一次任务每批读取 100 个过期会话，使用游标继续处理后续批次，直至处理完本轮候选或达到执行超时。计划只在不存在时插入，已有 Cron、参数、启停状态不被覆盖；软删除占位避免重启后复活。新增业务处理器在代码中登记，不能由界面创建任意执行能力。

定时触发直接使用 Croner，每个启用计划对应一个 Croner 实例，按配置的 Cron 和时区到点回调，不轮询数据库查找到期计划。启动时从 PostgreSQL 恢复计划；保存、启停和删除会更新本实例计时器，并通过事务内的 PostgreSQL `NOTIFY` 同步其他实例。专用 `LISTEN` 连接断开时停止本实例计时器，重连后先订阅再重新读取完整配置。

Croner 回调只处理对应计划：使用数据库行锁再次检查最新表达式、时区、启停及下次时间，避免配置修改后的过期回调和多实例重复入队。计划行锁、通用任务入队、触发记录和下一次时间推进共用同一 PostgreSQL 事务。自动触发以计划标识与计划时间唯一去重；人工触发以计划标识与 requestId 去重。事务失败不推进时间，记录错误，后续触发仍以数据库中的最新配置为准。

自动、人工触发都锁同一计划行。已有 queued、running、retrying 任务时自动触发记为跳过，人工触发报告冲突。不同计划可以选择同一处理器，处理器共享分组并发策略继续由任务中心约束。

停机默认不补跑。启动时检查停机留下的触发点，到期五秒内允许执行；超过五秒则只保存一条错过记录，并计算未来下次时间，不逐条回放停机期间触发。Croner 回调同样允许五秒内的正常事件循环及数据库延迟。暂停只停止未来调度，不取消已入队任务；删除计划保留历史。

执行进度、attempt、重试、日志和错误均读取任务中心。任务中心由事务提交后的数据库通知唤醒，执行完成和取消由进程事件及通知处理，没有每两秒领取、心跳续租或每十秒恢复的固定循环；重试和执行超时按实际时间安排单次等待。执行依然是至少一次语义，处理器业务写入应幂等，不宣称业务 exactly-once。多实例通过数据库协调入队，Redis 不参与执行权。

执行记录、任务日志和操作审计持续保存在数据库中，不设置后台自动清理任务。

## 权限与验证

- 计划读取 `pages.monitor.schedule`；修改 `actions.schedule.edit`；启停 `actions.schedule.toggle`；删除 `actions.schedule.delete`；人工执行 `actions.schedule.run`。
- 台账和详情随定时任务读取权限 `pages.monitor.schedule`，详情先按触发记录取得关联任务，不能凭任意 taskId 查看其他业务任务。
- 缓存读取 `pages.monitor.cache`；值查看 `actions.cache.view`；清理 `actions.cache.clear`。
- ROOT 系统管理员按仓库现有规则拥有全部权限。旧 `actions.task.schedule` 与旧 `/sys/task/schedule-*` 已移除，角色需按新页面重新授权。
- 配置修改、启停、删除和人工执行在事务内记录操作人；缓存清理先记录请求审计再执行，审计标明请求而非伪称完成。

若依功能参考与源代码链接见 [ruoyi-reference.md](./ruoyi-reference.md)。界面参考任务配置、运行日志和缓存管理的功能组织，执行模型使用本项目已有任务中心。
