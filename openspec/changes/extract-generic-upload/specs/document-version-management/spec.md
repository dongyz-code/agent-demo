## MODIFIED Requirements

### Requirement: 新版本上传必须幂等

系统 MUST 通过文件 key、目标 Document 校验、源文件唯一约束与事务锁识别重复文档绑定。通用上传幂等键只标识用户的一次传输尝试，不保存文档目标。重复绑定 MUST 返回原版本，不得创建额外版本或跳号；同一 key 不得绑定到其他文档。

#### Scenario: 重复完成版本上传

- **WHEN** 客户端因超时使用同一 key 重复提交文档版本绑定请求
- **THEN** 系统返回第一次创建的 documentVersionId 和版本号，不重新上传或创建版本

#### Scenario: 改变已经绑定文件的目标

- **WHEN** 同一 key 被用于另一个目标文档
- **THEN** 系统拒绝请求，不改变已经存在的版本绑定
