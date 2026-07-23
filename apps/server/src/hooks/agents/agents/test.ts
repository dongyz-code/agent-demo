import { generateText } from 'ai';

import { getMessages } from './context.js';
import { getModel } from '../providers/providers.js';
import { uuidv7 } from '@/utils/id.js';

const chatAgent = async ({ conversation_id }: { conversation_id?: string }) => {
  conversation_id = conversation_id || uuidv7();

  const { model, providerOptions } = getModel({
    provider: 'bailian',
    model: 'glm-5.2',
  });

  const messages = await getMessages({ conversation_id });
  const stream = await generateText({
    model,
    messages: [],
    providerOptions,
  });
};
