## Why

当前 client 将认证状态与 token 持久化到浏览器，并在会话校验、401 恢复和权限导航之间维护多套可漂移状态；server 同时存在明文密码存储与比对，已经构成标杆项目不能接受的认证基础风险。现在需要把浏览器会话、访问控制和密码凭据收口为单一、可验证的安全边界，避免后续业务建立在错误抽象上。

## What Changes

- **BREAKING**：移除登录和会话校验响应中的 token，HttpOnly Cookie 成为浏览器端唯一认证凭据。
- **BREAKING**：移除 client 持久化 session，使用 `unknown`、`checking`、`authenticated`、`anonymous` 状态机表达会话生命周期。
- 会话校验只合并并发请求，请求完成后释放 Promise，使失败后能够重新校验。
- 统一处理 401：原子清空 session 与 QueryClient 缓存、失效路由状态并跳转登录页。
- 删除 client 本地权限字符串，路由守卫和工作区导航统一复用共享权限树及权限判断函数。
- server 使用 Argon2id 哈希创建、更新和校验普通用户密码，并在启动接流量前迁移历史明文密码。
- 登录接口只按用户名读取账号，再通过恒定语义的密码验证函数校验凭据；所有用户查询继续禁止返回密码哈希。
- 系统管理员配置密码保持独立配置凭据，不落入用户表迁移范围；普通用户密码只允许通过 HTTPS 请求以原文提交、服务端单向哈希存储。

## Capabilities

### New Capabilities

- `client-auth-session`: 定义 Cookie-only 客户端会话状态机、并发校验和统一认证失效恢复行为。
- `password-credential-security`: 定义普通用户密码的 Argon2id 存储、验证、更新和历史明文迁移要求。

### Modified Capabilities

- `admin-access-control`: 扩展共享权限定义的消费边界，使 client 路由守卫与导航可见性使用同一权限语义。

## Impact

- client：`model/session`、API 拦截器、QueryClient、router guard/methods、登录/退出流程、路由类型和工作区导航。
- server：登录与校验响应、用户创建/更新、启动流程、数据库密码迁移与密码工具。
- shared/types：登录 API DTO 取消 token，权限 key 继续从 `@repo/shared/permission` 派生。
- dependencies：server 新增 `argon2` 运行时依赖；部署环境需要支持其预构建二进制或本机构建。
- operations：首次升级启动会批量把 user 表中非 Argon2id 值替换为哈希；迁移必须在服务接流量前完成。
