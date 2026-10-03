import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { GraphQLError } from 'graphql';

import { ChatNotFoundException } from '../domain/chat/exception/chat-not-found.exception';
import { ChatOfAnotherAgentException } from '../domain/chat/exception/chat-of-another-agent.exception';

@Catch(ChatNotFoundException, ChatOfAnotherAgentException)
export class ChatExceptionFilter implements ExceptionFilter {
  catch(exception: Error, _host: ArgumentsHost): GraphQLError {
    return new GraphQLError(exception.message, {
      extensions: {
        code:
          exception instanceof ChatNotFoundException ? 'NOT_FOUND' : 'CONFLICT',
      },
    });
  }
}
