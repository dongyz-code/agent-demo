## ADDED Requirements

### Requirement: 统一预览描述
系统 MUST 为已验证文件返回统一预览描述，包含预览模式、状态、可信内容类型、短期地址、派生文件和不可预览原因。调用方不得根据扩展名拼接对象 URL。

#### Scenario: 获取预览信息
- **WHEN** 授权用户请求文件预览
- **THEN** 系统返回 `direct`、`generated`、`text` 或 `unsupported` 模式及安全访问参数

### Requirement: 直接在线查看
系统 MUST 对浏览器可安全查看的 PDF、常见图片、音频、视频和纯文本提供短期内联访问；音视频 MUST 支持 Range 请求。响应内容类型 MUST 来自验证结果。

#### Scenario: 查看 PDF
- **WHEN** 用户请求已验证 PDF 的在线查看
- **THEN** 系统返回短期内联地址并允许浏览器 PDF 查看器加载

#### Scenario: 视频拖动
- **WHEN** 用户拖动视频播放进度
- **THEN** 对象访问支持 Range 请求且无需下载完整文件

### Requirement: 派生预览生成
系统 MUST 通过预览生成器注册表异步生成派生预览。Office 文档 MUST 能够转换为 PDF，图片 MUST 能够生成缩略图；派生物 MUST 记录来源文件、生成器版本、状态、位置和错误。

#### Scenario: Office 预览
- **WHEN** 已验证 DOCX、PPTX 或 XLSX 进入预览任务
- **THEN** 系统选择 Office 生成器并产生可在线查看的 PDF

#### Scenario: 转换失败
- **WHEN** 预览转换失败或超时
- **THEN** 系统记录错误与重试状态并保留原文件下载能力

### Requirement: 预览缓存与版本
系统 MUST 使用源文件 Hash、预览类型和生成器版本确定派生物缓存。源内容或生成器版本变化时不得返回旧预览。

#### Scenario: 复用已有预览
- **WHEN** 相同内容和生成器版本已有成功派生物
- **THEN** 系统复用该预览而不重复转换

#### Scenario: 生成器升级
- **WHEN** 生成器版本变化
- **THEN** 系统生成新派生物并在成功后切换

### Requirement: 不可信内容隔离
系统 MUST 阻止未清洗 HTML、SVG 和脚本在应用同源上下文执行。Markdown MUST 安全清洗；无法保证安全的类型 MUST 强制下载或使用隔离沙箱。

#### Scenario: HTML 包含脚本
- **WHEN** 用户查看包含脚本的 HTML
- **THEN** 系统不得在管理端同源直接渲染，并返回隔离预览或不支持状态

#### Scenario: Markdown 查看
- **WHEN** 用户查看 Markdown
- **THEN** 系统清洗生成的 HTML 后再展示

### Requirement: 预览权限与有效期
系统 MUST 在签发预览地址前验证文件权限，地址 MUST 短期有效且仅允许读取对应原文件或派生物。权限撤销或文件删除后不得签发新地址。

#### Scenario: 权限撤销
- **WHEN** 用户失去文件读取权限后再次请求预览
- **THEN** 系统拒绝签发新地址

### Requirement: 可复用查看组件
管理端 MUST 提供独立文件查看组件，统一展示加载中、直接预览、派生预览、转换失败、不支持预览和下载入口，业务页面不得重复实现预览流程。

#### Scenario: 预览处理中
- **WHEN** 派生预览尚未完成
- **THEN** 组件展示处理状态和刷新入口而不是空白 iframe

#### Scenario: 不支持预览
- **WHEN** 文件没有可用预览器
- **THEN** 组件展示元数据和权限受控下载入口

#### Scenario: 预览持续处理中
- **WHEN** 派生预览在有限轮询次数内仍未完成
- **THEN** 组件停止自动轮询并展示手动刷新入口，避免页面无限请求
