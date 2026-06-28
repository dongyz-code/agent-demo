# App 部署遗留能力说明

本文档记录已移除的 App 部署模块能力，供后续重新设计或迁移时参考。当前运行时代码已不再提供这些功能。

## 已移除范围

- Admin 应用列表页面：创建应用、编辑应用、切换启用状态、上传版本、查看版本历史、触发部署。
- Server `/main/app-*` 接口：应用增删改查、版本上传、版本查询、部署任务提交。
- 后台任务 `appBuildDeploy`：部署、停止、重启应用容器。
- 数据表 `ai_app` 与 `ai_app_version`：应用元数据、版本包哈希、当前部署版本。
- 部署辅助模板：用于前端静态站点的 nginx Dockerfile 与 nginx 配置。

## 原业务能力

原模块以“应用”为单位管理部署对象，每个应用包含名称、简介、域名前缀、启用状态、创建人与更新时间。前端页面可以分页查询应用列表，并展示最近一次部署任务状态。

版本管理基于 ZIP 包上传。前端上传前计算版本信息，服务端接收单个 ZIP 文件与 `info` JSON，校验 `id`、`name`、`size`、64 位十六进制 `hash` 后，将文件保存为历史版本包，并写入版本记录。

部署时先把选中的版本哈希写入应用记录，再提交后台任务。任务通过应用 ID 作为冲突标识，避免同一应用同时执行多个部署任务。启用状态切换也会提交对应的停止或重启任务。

## 原包结构约束

ZIP 解压后支持两种结构：

```text
/
├── client/
└── server/
```

如果同时存在 `client/` 和 `server/`，按全栈应用处理；否则按纯前端应用处理。

前端目录规则：

- 如果存在 `Dockerfile`，优先使用该 Dockerfile 构建前端镜像。
- 如果同时存在 `build.sh`，构建镜像前先执行 `bash build.sh`。
- 如果没有 Dockerfile 但存在 `package.json`，执行 `pnpm i` 和 `pnpm build`，再使用平台 nginx 模板构建镜像。
- 如果没有 `package.json`，按静态文件目录处理，并使用单页静态 nginx 模板构建镜像。

后端目录规则：

- 必须包含 `server/Dockerfile`。
- 必须包含 `server/build.sh`。
- `build.sh` 负责依赖安装、编译打包，并准备 Dockerfile 所需构建产物。
- 服务必须监听 `8888` 端口。
- API 路径必须以 `/api/` 开头。
- 必须实现 `/api/health` 健康检查接口。

## 原部署流程

1. 清理并创建构建目录、部署目录和历史版本目录。
2. 根据当前应用记录读取域名前缀和部署版本哈希。
3. 解压历史 ZIP 包到构建目录。
4. 判断解压后的目录结构是纯前端还是全栈。
5. 构建前端镜像；全栈场景同时构建后端镜像。
6. 生成 `docker-compose.yml`。
7. 执行 `docker compose up -d --remove-orphans`。
8. 等待短暂时间后输出最近容器日志。

原 Docker Compose 使用外部网络 `fsd-traefik_default`，通过 Traefik label 将 `${domain}.localhost` 路由到前端服务。全栈场景下，前端容器会通过 `HOST_SERVER` 指向后端容器的 `8888` 端口。

## 原启停逻辑

- 部署：构建镜像并执行 `docker compose up -d --remove-orphans`。
- 停止：如果部署目录存在 `docker-compose.yml`，执行 `docker compose stop`。
- 重启：如果部署目录存在 `docker-compose.yml`，执行 `docker compose restart`。

## 数据迁移

删除该能力后新增迁移会删除遗留表：

```sql
DROP TABLE "ai_app" CASCADE;
DROP TABLE "ai_app_version" CASCADE;
```

执行迁移前如需保留历史应用、版本包或部署记录，应先从数据库和文件存储中自行备份。
