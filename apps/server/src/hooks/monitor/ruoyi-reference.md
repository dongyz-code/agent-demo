# 若依系统监控参考研究

> 本文保留最初调研结论。后续已确认采用 Redis 缓存及 PostgreSQL 持久化调度，当前实现与运行规则以 [README.md](./README.md) 为准。

研究日期：2026-11-24。范围仅为官方 `yangzongzhuan/RuoYi-Vue` 的 `master` 分支中指定的定时任务、任务日志、缓存监控页面及对应控制器。以下区分已核实源码事实与本项目的设计取舍。

## 来源与范围限制

官方当前 [README](https://github.com/yangzongzhuan/RuoYi-Vue/blob/master/README.md) 说明，`master` 是 Spring Boot 4.x 后端分支，Vue 2、Vue 3 和 TypeScript 前端已经分为独立仓库。因此，本次直接请求以下四个指定路径均返回 HTTP 404，无法据此确认页面布局、搜索字段、弹窗、确认框或图表样式；没有把记忆中的旧版界面当作已核实事实：

- [任务页面 `job/index.vue`](https://github.com/yangzongzhuan/RuoYi-Vue/blob/master/ruoyi-ui/src/views/monitor/job/index.vue)
- [日志页面 `job/log.vue`](https://github.com/yangzongzhuan/RuoYi-Vue/blob/master/ruoyi-ui/src/views/monitor/job/log.vue)
- [缓存概览 `cache/index.vue`](https://github.com/yangzongzhuan/RuoYi-Vue/blob/master/ruoyi-ui/src/views/monitor/cache/index.vue)
- [缓存列表 `cache/list.vue`](https://github.com/yangzongzhuan/RuoYi-Vue/blob/master/ruoyi-ui/src/views/monitor/cache/list.vue)

以下功能与权限结论来自成功读取的三个官方控制器。链接指向可变分支，日后上游修改可能改变行为。

## 已核实的定时任务能力

[SysJobController](https://github.com/yangzongzhuan/RuoYi-Vue/blob/master/ruoyi-quartz/src/main/java/com/ruoyi/quartz/controller/SysJobController.java) 提供分页列表、详情、新增、修改、批量删除、导出、切换状态及立即执行一次。对应接口位于 `/monitor/job`，手动执行使用 `PUT /run`，状态修改使用 `PUT /changeStatus`。任务不存在或过期时，手动执行返回失败信息。

该控制器按操作检查权限：列表 `monitor:job:list`，详情 `monitor:job:query`，新增 `monitor:job:add`，修改 `monitor:job:edit`，删除 `monitor:job:remove`，导出 `monitor:job:export`；状态修改和手动执行共用 `monitor:job:changeStatus`。变更、执行和导出操作有 `@Log` 业务日志注解。新增和修改时校验 Cron 表达式，并禁止调用目标中的 RMI、LDAP(S)、HTTP(S)、违规字符串，还必须通过调用白名单。该事实说明若依允许配置调用目标时需要防护，不能将任意调用目标能力直接移植到 Node 服务。来源同上。

[SysJobLogController](https://github.com/yangzongzhuan/RuoYi-Vue/blob/master/ruoyi-quartz/src/main/java/com/ruoyi/quartz/controller/SysJobLogController.java) 提供分页日志列表、详情、导出、按编号删除和清空。日志列表与详情分别复用任务的 `list`、`query` 权限，导出复用 `export`，删除和清空复用 `remove`。导出、删除和清空带有业务日志注解。仅凭控制器不能确认日志保留时长、具体筛选字段、日志表字段或是否记录完整堆栈。

## 已核实的缓存能力

[CacheController](https://github.com/yangzongzhuan/RuoYi-Vue/blob/master/ruoyi-admin/src/main/java/com/ruoyi/web/controller/monitor/CacheController.java) 管理 Redis 缓存：概览读取 `INFO`、`INFO commandstats` 和 `DBSIZE`，返回实例信息、键数量及按命令统计的调用次数。控制器显式声明用户信息、配置、字典、验证码、防重提交、限流和密码错误次数等缓存类别。

同一控制器还提供缓存名称列表、按前缀查询键、查询键值、按缓存名称删除、按键删除及全部删除。前缀查询使用 `keys(cacheName + "*")`，全部删除使用 `keys("*")` 后批量删除；这些是 Redis 实现细节，不代表本项目需要引入 Redis，也不应当用于扫描 Node 任意对象。来源同上。

该控制器所有读写接口共用 `monitor:cache:list` 权限，包括读值和全量删除；源码没有显示对应的独立清理权限或 `@Log` 注解。`getValue` 直接读取请求中的 `cacheKey`，并没有在该方法内检查它是否属于 `cacheName`；清理接口也没有在该控制器内限制为声明的缓存名称。移植时应保留有用的监控概念，同时按当前仓库的权限和受管资源边界实现，不照搬这组宽泛读写能力。来源同上。

## 本项目的适配建议

以下为针对进程内 Croner 调度与 AI SDK 对象缓存的设计建议，属于本项目取舍，不是若依源码的现有能力。

- 定时任务采用代码注册的任务清单。展示任务名称、说明、Cron、时区、启停状态、是否执行中、最近结果和下一次执行时间，提供暂停、恢复、立即执行与执行日志入口。管理端不接受任意 JavaScript、模块路径、方法名或远程调用地址，因此不需要复制若依的动态调用目标表单。
- 服务端执行暂停、恢复、立即执行时仍要独立鉴权。遵守仓库约定，使 `ROOT.SYS_ADMIN_USER_ID` 可以查看和操作全部任务及缓存；其他用户必须通过现有权限体系。按钮隐藏只能改善交互，不能替代后端权限检查。
- Croner 属于当前进程：任务、运行状态和内存日志随进程重启丢失，多实例之间不会自动共享或选主。界面应清楚标注当前实例和内存范围。不要把暂停状态描述为数据库持久配置，也不要承诺集群只执行一次。
- 调度日志使用有界保留，记录任务标识、触发方式、开始/结束时间、耗时及成功/失败状态。运行中任务应防止重复手动触发；失败信息应避免暴露令牌、供应商请求头和完整配置。不要为了监控页面引入 Quartz 的数据库任务模型或完整 CRUD。
- 缓存采用显式注册表，只允许列出、查看元信息和清理已注册的 AI SDK 缓存。展示用途、对象数、累计命中/未命中、条目创建/最近访问时间、最近清理时间等可真实测量的信息；没有 Redis 时不展示 Redis 版本、Redis 命令饼图或虚构内存占用。
- AI SDK 对象可能持有 API Key、访问地址和客户端内部状态，不能提供若依式的“查看缓存值”。列表只返回不含秘密的稳定业务键与元信息，不序列化 SDK 对象，不开放任意进程变量浏览。
- 清理仅影响注册缓存中的当前实例条目，下次业务调用按原流程重建 SDK。已有请求可以继续持有原对象；清理不能宣称撤销进行中的调用或清除持久配置。按名称、按键的清理动作必须拒绝未知名称，避免误操作返回假成功。
- 页面延续“概览 → 列表 → 详情/日志 → 明确操作”的功能层次；暂停、执行和清理后刷新服务端真实状态，并按现有组件规范拆分日志弹窗等有独立交互状态的单元。由于指定前端源码不可用，不声称复刻若依页面的具体布局。

## 结论

可直接参考若依的任务状态管理、手动执行、执行日志、缓存概览及按范围清理等功能概念；权限应在服务端执行。当前项目更适合以已注册任务和已注册缓存为边界，保留进程内运行事实，避免动态代码调用、SDK 值泄露以及假 Redis 指标。导出、任务编辑、持久化调度和跨实例协调需要独立需求，不属于完成这两个监控入口的必要条件。

## 补充：若依与 Quartz 的后台检查机制

核对日期：2026-11-25。若依取官方 `master`，Quartz 内部机制以官方 `v2.5.1` 源码为依据；后者用于说明机制，不表示已核实若依最终依赖解析得到该版本。

**若依没有在应用业务层实现“每 2 秒查任务 + 每 2 秒更新运行心跳 + 每 10 秒恢复”的三组循环。** [SysJobServiceImpl.init](https://github.com/yangzongzhuan/RuoYi-Vue/blob/master/ruoyi-quartz/src/main/java/com/ruoyi/quartz/service/impl/SysJobServiceImpl.java) 启动时读取任务表并注册任务；新增、修改、暂停和恢复通过 Quartz 的 `Scheduler` API 同步。[ScheduleUtils.createScheduleJob](https://github.com/yangzongzhuan/RuoYi-Vue/blob/master/ruoyi-quartz/src/main/java/com/ruoyi/quartz/util/ScheduleUtils.java) 根据 Cron 创建 Trigger 并调用 `scheduler.scheduleJob`，同时映射任务的 misfire 策略。业务层把调度交给 Quartz，不需要自己按固定间隔重新扫描业务任务表。

但是，“交给 Quartz”不能表述为“整个系统没有定时等待或周期检查”：

- [QuartzSchedulerThread](https://github.com/quartz-scheduler/quartz/blob/v2.5.1/quartz/src/main/java/org/quartz/core/QuartzSchedulerThread.java) 调用 `JobStore.acquireNextTriggers` 获取后续 Trigger，按最近触发时间执行可被调度变更信号唤醒的等待；无 Trigger 时也会等待后再检查，源码中的基础空闲等待值为 30 秒并加入随机变化。这不是业务层每 2 秒全量查任务，但仍然存在内部循环和超时等待。
- 若依当前 [ScheduleConfig](https://github.com/yangzongzhuan/RuoYi-Vue/blob/master/ruoyi-quartz/src/main/java/com/ruoyi/quartz/config/ScheduleConfig.java) **整个类已被注释**，注释说明默认走内存；不能把其中的集群参数当作默认生效配置。Quartz 的[默认配置文件](https://github.com/quartz-scheduler/quartz/blob/v2.5.1/quartz/src/main/resources/org/quartz/quartz.properties) 使用 `RAMJobStore`，其 [acquireNextTriggers/applyMisfire](https://github.com/quartz-scheduler/quartz/blob/v2.5.1/quartz/src/main/java/org/quartz/simpl/RAMJobStore.java) 在获取 Trigger 时处理 misfire。该默认模式不启动 JDBC JobStore 的集群 check-in 线程。
- 若启用若依上述 JDBC 集群配置，示例参数为 `isClustered=true`、`clusterCheckinInterval=15000`、`misfireThreshold=12000`。Quartz [JobStoreSupport](https://github.com/quartz-scheduler/quartz/blob/v2.5.1/quartz/src/main/java/org/quartz/impl/jdbcjobstore/JobStoreSupport.java) 会启动 `MisfireHandler`，周期扫描错过的 Trigger；没有更多积压时，其等待按 misfire 阈值扣除处理耗时计算，有积压和错误时另有等待规则。`misfireThreshold` 是判断迟到的阈值，不能简单解释为保证每隔固定秒数执行的业务恢复周期。
- 同一 [JobStoreSupport](https://github.com/quartz-scheduler/quartz/blob/v2.5.1/quartz/src/main/java/org/quartz/impl/jdbcjobstore/JobStoreSupport.java) 仅在集群模式启动 `ClusterManager`，按 check-in 间隔更新调度器实例状态、检查失联实例，并在需要时执行 `clusterRecover`；不是按每个正在运行的任务写业务心跳。故障判定还包含记录的 check-in 间隔、当前节点检查延迟及额外容差，不能把 15 秒 check-in 等同于 15 秒内必然完成恢复。非集群 JDBC 模式在启动时执行 `recoverJobs`。

因此，若依能支持的参考结论是：**应用层注册和更新任务，调度框架内部负责等待、获取 Trigger、misfire 及可选的集群协调。** 当前项目的任务扫描、运行心跳和失联恢复周期属于自身调度器的实现选择；可以据需求简化或交由适合的框架，但不能以“若依完全没有周期检查”为依据直接删掉。
