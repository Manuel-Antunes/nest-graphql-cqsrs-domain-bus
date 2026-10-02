import { Module } from '@nestjs/common';
import { ChatsInfrastructureModule } from '@nestposts/chat/infrastructure/chats-infrastructure.module';

import type { MemoryConfig } from '../config/memory.config';
import { memoryConfig } from '../config/memory.config';
import { AgentTranscripts } from '../infrastructure/transcripts/agent-transcripts';
import { DeleteChatCommand } from './chat/command/delete-chat.command';
import { RecordChatCommand } from './chat/command/record-chat.command';
import { RenameChatCommand } from './chat/command/rename-chat.command';
import { ChatMessagesQuery } from './chat/query/chat-messages.query';
import { FindChatQuery } from './chat/query/find-chat.query';
import { FindChatsQuery } from './chat/query/find-chats.query';

@Module({
  imports: [ChatsInfrastructureModule],
  providers: [
    {
      provide: AgentTranscripts,
      inject: [memoryConfig.KEY],
      useFactory: (memory: MemoryConfig) => AgentTranscripts.of(memory),
    },
    RecordChatCommand.Handler,
    RenameChatCommand.Handler,
    DeleteChatCommand.Handler,
    FindChatsQuery.Handler,
    FindChatQuery.Handler,
    ChatMessagesQuery.Handler,
  ],
})
export class ApplicationModule {}
