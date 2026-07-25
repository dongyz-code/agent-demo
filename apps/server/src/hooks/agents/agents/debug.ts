/**
 * Agent 对话调试脚本：交互式多轮对话，验证消息存储。
 *
 * 运行：
 *   pnpm --filter @repo/deploy-server exec tsx src/hooks/agents/agents/debug.ts
 *
 * 前置：apps/server/.conf/conf.json 需配置 AI.bailian（apiKey + baseUrl），否则首轮调用 getModel 会抛错。
 * 用法：输入消息回车发送（首条自动建会话，之后续聊同一会话）；/show 打印已落库消息；空行或 /exit 退出。
 * agent 表若不存在，脚本启动时调 startupTableStructureSync 自动按 Drizzle 重建。
 */
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { asc, eq } from 'drizzle-orm';
import { db, schemas } from '@/database/index.js';
import { chatAgent } from '@/hooks/agents/agents/index.js';

/** 测试用 user_id（合法 uuid；agent_conversations.user_id 可空，这里给个固定值便于辨识）。 */
const TEST_USER_ID = '00000000-0000-7000-8000-000000000000';

/** 打印某会话下全部消息行（正序），验证 user/assistant/tool 三种消息的落库形状。 */
async function showMessages(conversation_id: string) {
  const rows = await db.query.agent_messages.findMany({
    columns: { role: true, status: true, tokens: true, content: true },
    where: eq(schemas.agent_messages.conversation_id, conversation_id),
    orderBy: asc(schemas.agent_messages.message_id),
  });
  console.log(`\n=== agent_messages（共 ${rows.length} 行，正序）===`);
  console.table(
    rows.map((r) => ({
      role: r.role,
      status: r.status,
      tokens: r.tokens,
      content: JSON.stringify(r.content).slice(0, 100),
    })),
  );
}

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  rl.on('SIGINT', () => {
    console.log('\n(退出)');
    process.exit(0);
  });

  let conversation_id: string | undefined;
  console.log(
    'Agent 调试会话已就绪。输入消息回车发送；/show 看落库；空行或 /exit 退出。',
  );

  while (true) {
    const input = (await rl.question('你 > ')).trim();
    if (!input || input === '/exit' || input === '/quit') break;
    if (input === '/show') {
      if (conversation_id) await showMessages(conversation_id);
      else console.log('(还没有会话)');
      continue;
    }

    const result = await chatAgent({
      conversation_id,
      system: '你是一个简洁的中文助手，回答不超过两句。',
      message: input,
      userId: TEST_USER_ID,
      now: new Date(),
    });
    conversation_id = result.conversation_id;
    // 消费 text 流驱动 agent loop 完成；onStepEnd 在此期间把 assistant/tool 消息逐部落库
    const text = await result.stream.text;
    console.log(`AI > ${text}`);
  }

  rl.close();
  if (conversation_id) await showMessages(conversation_id);
  process.exit(0);
}

main().catch((err) => {
  console.error('debug 失败:', err);
  process.exit(1);
});
