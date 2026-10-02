import { Module } from '@nestjs/common';

import { ApplicationModule } from '../application/application.module';
import { ChatResolver } from './graphql/chat.resolver';
import { ChatMutationResolver } from './graphql/chat-mutation.resolver';
import { UserChatsResolver } from './graphql/user-chats.resolver';

@Module({
  imports: [ApplicationModule],
  providers: [ChatResolver, ChatMutationResolver, UserChatsResolver],
})
export class InterfacesModule {}
