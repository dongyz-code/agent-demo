/**
 * Agent 对话调试脚本：独立跑通 chatAgent 的完整对话，并打印落库的消息行，验证消息存储设计。
 *
 * 运行：
 *   pnpm --filter @repo/deploy-server exec tsx src/hooks/agents/agents/debug.ts
 *
 * 前置：
 * 1. apps/server/.conf/conf.json 需配置 AI.bailian（apiKey + baseUrl），否则 getModel 会报错。
 * 2. agent 表若不存在（如刚 drop 过），脚本会调 startupTableStructureSync 自动按 Drizzle 重建。
 */
import { asc, eq } from 'drizzle-orm';
import { ROOT } from '@/configs/index.js';
import { startupTableStructureSync } from '@/database/structure/index.js';
import { db, schemas } from '@/database/index.js';
import { chatAgent } from '@/hooks/agents/agents/index.js';

/** 测试用 user_id（合法 uuid；agent_conversations.user_id 可空，这里给个固定值便于辨识）。 */
const TEST_USER_ID = '00000000-0000-7000-8000-000000000000';

/** 打印某会话下全部消息行（正序），验证 user/assistant/tool 三种消息的落库形状。 */
async function showMessages(conversation_id: string, tag: string) {
  const rows = await db.query.agent_messages.findMany({
    columns: { role: true, status: true, tokens: true, content: true },
    where: eq(schemas.agent_messages.conversation_id, conversation_id),
    orderBy: asc(schemas.agent_messages.message_id),
  });
  console.log(`\n=== ${tag}：agent_messages（共 ${rows.length} 行，正序）===`);
  console.table(
    rows.map((r) => ({
      role: r.role,
      status: r.status,
      tokens: r.tokens,
      content: JSON.stringify(r.content).slice(0, 100),
    })),
  );
}

/** 跑一轮对话：调 chatAgent，消费 text 流驱动 agent loop 完成（onStepEnd 期间落库），返回会话 id。 */
async function round(
  conversation_id: string | undefined,
  message: string,
  tag: string,
) {
  const result = await chatAgent({
    conversation_id,
    system: '你是一个简洁的中文助手，回答不超过两句。',
    message,
    userId: TEST_USER_ID,
    now: new Date(),
  });
  // 消费 text 流，驱动多步 loop 完成；onStepEnd 在此期间把 assistant/tool 消息逐部落库
  const text = await result.stream.text;
  console.log(`[${tag}] AI: ${text}`);
  return result.conversation_id;
}

async function main() {
  if (!ROOT.AI?.bailian?.baseUrl) {
    console.error(
      '未配置 AI.bailian，无法调用模型。请在 apps/server/.conf/conf.json 增加：\n' +
        '"AI": {\n  "bailian": {\n    "apiKey": "你的key",\n    "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1"\n  }\n}',
    );
    process.exit(1);
  }

  // 重建被 drop 的 agent 表（缺失表自动建，已有表只 warn 不改）
  await startupTableStructureSync();

  // 第 1 轮：新会话。预期落库 user + assistant(text) 两行（chatAgent 暂未挂 tools，故无 tool 行）
  const cid = await round(undefined, '用一句话解释什么是 agent', '第1轮');
  await showMessages(cid, '第1轮后');

  // 第 2 轮：续聊，验证 getMessages 取回历史、上下文连续
  await round(cid, '结合上一条再补一句', '第2轮');
  await showMessages(cid, '第2轮后');

  process.exit(0);
}

main().catch((err) => {
  console.error('debug 失败:', err);
  process.exit(1);
});
