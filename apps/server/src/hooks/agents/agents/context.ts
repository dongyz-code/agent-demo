import {} from 'drizzle-orm';
import { db, schema } from '@/database/index.js';

/** 查找消息记录 */
export function getMessages({ conversation_id }: { conversation_id: string }) {
  const list = db.query.agent_messages.findMany({});
}
