import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import {
  CHAT_TITLE_MAX_LENGTH,
  ChatTitleSchema,
} from '../schemas/chat-title.schema';

export class ChatTitle extends ValidatedDto.Scalar(ChatTitleSchema) {
  static summarizing(text: string): ChatTitle | null {
    const line = text.replace(/\s+/g, ' ').trim();
    if (!line) return null;
    return ChatTitle.parse(
      line.length > CHAT_TITLE_MAX_LENGTH
        ? `${line.slice(0, CHAT_TITLE_MAX_LENGTH - 1).trimEnd()}…`
        : line,
    );
  }
}
