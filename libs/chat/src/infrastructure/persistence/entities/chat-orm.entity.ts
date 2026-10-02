import {
  defineEntity,
  p,
  TENANT_SCHEMA,
  valueObjectType,
} from '@nestposts/database';
import { UserEntitySchema } from '@nestposts/users/infrastructure/persistence/entities/user-orm.entity';

import { Chat } from '../../../domain/chat/chat.entity';
import { AGENT_ID_MAX_LENGTH } from '../../../domain/chat/schemas/agent-id.schema';
import { CHAT_TITLE_MAX_LENGTH } from '../../../domain/chat/schemas/chat-title.schema';
import { AgentId } from '../../../domain/chat/vo/agent-id';
import { ChatId } from '../../../domain/chat/vo/chat-id';
import { ChatTitle } from '../../../domain/chat/vo/chat-title';

export const ChatEntitySchema = defineEntity({
  class: Chat,
  tableName: 'chats',
  schema: TENANT_SCHEMA,
  forceConstructor: true,
  properties: {
    id: p
      .type(valueObjectType(ChatId, { columnType: 'varchar(36)' }))
      .primary(),
    owner: () => p.manyToOne(UserEntitySchema).ref().deleteRule('cascade'),
    agentId: p.type(
      valueObjectType(AgentId, {
        columnType: `varchar(${AGENT_ID_MAX_LENGTH})`,
      }),
    ),
    title: p
      .type(
        valueObjectType(ChatTitle, {
          columnType: `varchar(${CHAT_TITLE_MAX_LENGTH})`,
        }),
      )
      .nullable(),
    createdAt: p.datetime(),
    updatedAt: p.datetime(),
  },
  indexes: [{ properties: ['owner', 'updatedAt'] } as { properties: never }],
});
