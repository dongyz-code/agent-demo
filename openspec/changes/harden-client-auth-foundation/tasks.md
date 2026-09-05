## 1. 共享契约与权限源

- [x] 1.1 从登录响应契约删除 token，并同步浏览器应用停止 localStorage 与 token header 读写
- [x] 1.2 在共享权限树登记 client 设置页权限，client 路由类型和声明直接复用共享权限类型与 helper
- [x] 1.3 让 client 路由守卫与工作区导航通过同一权限判断函数决定访问和可见性

## 2. Client 会话生命周期

- [x] 2.1 将 Zustand session 改为不持久化的判别联合状态机并移除 token、isAuthenticated
- [x] 2.2 重写会话校验并发控制，在 finally 释放 Promise，区分 401 与瞬时错误并允许重试
- [x] 2.3 建立注入式 401 协调器，幂等清理 session、QueryClient 和 router 状态后替换到登录页
- [x] 2.4 登录和主动退出流程接入状态机与统一客户端清理原语

## 3. Server 密码凭据安全

- [x] 3.1 添加 Argon2 依赖与密码模块，覆盖哈希识别、非空校验、哈希和安全验证
- [x] 3.2 用户创建与更新路径在数据库写入前统一生成 Argon2id 哈希
- [x] 3.3 登录路径改为按用户名读取后在应用层验证 Argon2id，并确保响应不返回 JWT 或密码哈希
- [x] 3.4 实现服务监听前的历史明文密码幂等迁移和无敏感信息统计日志

## 4. 验证与交付

- [x] 4.1 添加会话状态/权限判断和密码哈希/迁移关键路径测试
- [x] 4.2 运行 client、admin、server、shared、types 的 lint/typecheck 与生产构建
- [x] 4.3 检查仓库不再存在浏览器 localStorage token、登录响应 token或普通用户明文密码写入路径
