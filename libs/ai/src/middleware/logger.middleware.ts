import { Logger } from '@nestjs/common';
import { createMiddleware } from 'langchain';

export const loggerLangchainMiddleware = (logger: Logger) =>
  createMiddleware({
    name: 'LoggerMiddleware',
    wrapModelCall: async (request, handler) => {
      logger.log('Model call initiated');
      logger.debug('Model call data:', {
        systemMessage: request.systemMessage,
        tools: request.tools?.map((t) => t.name),
        inputMessages: request.messages,
        context: request.runtime?.context,
      });
      const response = await handler(request);
      logger.log('Model call completed');
      logger.debug('Model call response data:', { response });
      return response;
    },
    wrapToolCall: async (request, handler) => {
      logger.log(`Tool call initiated: ${request.tool?.name}`);
      logger.debug('Tool call data:', {
        toolName: request?.toolCall.name,
        inputMessages: request?.toolCall.args,
        context: request.runtime?.context,
      });
      const response = await handler(request);
      logger.log(`Tool call completed: ${request.tool?.name}`);
      logger.debug('Tool call response data:', { response });
      return response;
    },
  });
