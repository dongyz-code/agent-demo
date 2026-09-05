## ADDED Requirements

### Requirement: Cookie-only 浏览器认证
系统 SHALL 将 signed、HttpOnly Cookie 作为浏览器登录会话的唯一认证凭据，登录与会话校验响应 MUST NOT 向浏览器返回 JWT，浏览器 MUST NOT 在 localStorage 或请求头中保存、读取或发送登录 token。

#### Scenario: 登录建立会话
- **WHEN** 用户提交有效用户名和密码
- **THEN** server MUST 通过 HttpOnly Cookie 建立会话
- **THEN** 登录响应 MUST NOT 包含 token
- **THEN** client 后续请求 MUST 通过 credentials 携带 Cookie

#### Scenario: 会话 Cookie 刷新
- **WHEN** 已认证用户在 token 生命周期过半后调用会话校验
- **THEN** server MUST 只通过 Set-Cookie 刷新凭据
- **THEN** 校验响应 MUST NOT 包含刷新后的 token

#### Scenario: 浏览器存储检查
- **WHEN** 用户成功登录或刷新 client
- **THEN** client MUST NOT 把 token、用户或权限写入 localStorage

### Requirement: 客户端会话状态机
client SHALL 使用 `unknown`、`checking`、`authenticated`、`anonymous` 互斥状态表达会话生命周期，只有 `authenticated` 状态 MUST 携带当前用户与权限数据。

#### Scenario: 首次加载受保护路由
- **WHEN** client 状态为 `unknown` 且匹配需要认证的路由
- **THEN** 状态 MUST 先转为 `checking`
- **THEN** Cookie 校验成功后状态 MUST 转为 `authenticated`

#### Scenario: 未认证会话
- **WHEN** server 明确以 401 拒绝会话校验
- **THEN** client 状态 MUST 转为 `anonymous`
- **THEN** 状态 MUST 不保留用户与权限数据

#### Scenario: 瞬时校验故障
- **WHEN** 会话校验因网络错误或非 401 服务错误失败
- **THEN** client MUST NOT 把故障解释为已登出
- **THEN** 状态 MUST 恢复为 `unknown` 并允许后续重试

### Requirement: 会话校验请求生命周期
client SHALL 只合并当前正在执行的会话校验请求，并 MUST 在请求成功或失败后释放在途 Promise。

#### Scenario: 并发路由校验
- **WHEN** 多个路由匹配在同一时刻请求校验 `unknown` 会话
- **THEN** client MUST 只发送一个 `/login/verify` 请求
- **THEN** 所有调用方 MUST 等待同一个在途结果

#### Scenario: 失败后重试
- **WHEN** 一次会话校验完成或失败
- **THEN** client MUST 清除该次在途 Promise
- **THEN** 后续处于 `unknown` 状态的校验 MUST 能创建新请求

### Requirement: 统一认证失效处理
client SHALL 通过唯一认证生命周期协调器处理任意 API 返回的 401，并同步清理 session 和 QueryClient 用户缓存，再使路由状态失效并替换到登录页。

#### Scenario: 业务请求返回 401
- **WHEN** 已认证用户的任意 API 请求返回 401
- **THEN** client MUST 立即将 session 转为 `anonymous`
- **THEN** client MUST 清空 QueryClient 缓存
- **THEN** client MUST 失效当前路由状态并使用路由 helper 替换到登录页

#### Scenario: 多个请求同时返回 401
- **WHEN** 多个并发 API 请求同时返回 401
- **THEN** client MUST 以幂等方式合并认证失效导航流程
- **THEN** 本地 session 与查询缓存 MUST 保持清空状态

#### Scenario: 主动退出时服务不可用
- **WHEN** 用户主动退出但 server 清 Cookie 请求失败
- **THEN** client MUST 仍清理 session 和查询缓存
- **THEN** client MUST 替换到登录页
