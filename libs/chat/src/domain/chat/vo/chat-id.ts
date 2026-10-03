import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { ChatIdSchema } from '../schemas/chat-id.schema';

export class ChatId extends ValidatedDto.Scalar(ChatIdSchema) {}
