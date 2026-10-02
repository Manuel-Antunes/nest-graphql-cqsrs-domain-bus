import { Module } from '@nestjs/common';
import { DatabaseModule } from '@nestposts/database';

import { ChatRepository } from '../domain/chat/chat.repository';
import { ChatEntitySchema } from './persistence/entities/chat-orm.entity';
import { MikroOrmChatRepository } from './persistence/repositories/mikro-orm-chat.repository';

export const chatEntities = [ChatEntitySchema];

@Module({
  imports: [DatabaseModule.forFeature(chatEntities)],
  providers: [{ provide: ChatRepository, useClass: MikroOrmChatRepository }],
  exports: [ChatRepository],
})
export class ChatsInfrastructureModule {}
