/** 字典管理入口校验；内部流程只接收已通过类型与长度检查的数据。 */
export const dictionaryIdSchema = { type: 'string', format: 'uuid' } as const;
/** 字典类型和字典项均提交完整启停与备注字段。 */
export const dictionaryBaseProperties = {
  id: dictionaryIdSchema,
  enabled: { type: 'boolean' },
  remark: { type: 'string', maxLength: 500 },
} as const;
/** 管理列表支持关键词、启停状态和最多 100 条的分页。 */
export const dictionaryQueryProperties = {
  search: { type: 'string', maxLength: 120 },
  enabled: { type: 'boolean' },
  limit: {
    type: 'array',
    minItems: 2,
    maxItems: 2,
    items: { type: 'integer', minimum: 0 },
  },
} as const;
/** 类型编码与代码中的业务引用一致，不进行自动改写。 */
export const dictionaryCodeSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 100,
  pattern: '^[a-z][a-z0-9_]*$',
} as const;
