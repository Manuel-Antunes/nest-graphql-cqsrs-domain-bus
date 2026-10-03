import type { ChatId } from '../vo/chat-id';

export class ChatNotFoundException extends Error {
  constructor(readonly chatId: ChatId) {
    super(`chat ${chatId} does not exist`);
    this.name = 'ChatNotFoundException';
  }
}
