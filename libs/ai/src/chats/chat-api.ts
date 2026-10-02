import { Logger } from '@nestjs/common';

import type { PlatformCaller } from '../agents/callers/platform-caller';

export interface ChatRecord {
  readonly id: string;
  readonly agentId: string;
  readonly title?: string;
}

export class ChatApi {
  static readonly RECORD = `mutation RecordChat($input: RecordChatInput!) {
  recordChat(input: $input) { id }
}`;

  private readonly logger = new Logger(ChatApi.name);

  constructor(
    private readonly url: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async record(chat: ChatRecord, caller: PlatformCaller): Promise<void> {
    try {
      const response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${caller.accessToken}`,
          'x-tenant': caller.tenant,
        },
        body: JSON.stringify({
          query: ChatApi.RECORD,
          variables: { input: chat },
        }),
      });
      const answer = (await response.json()) as {
        errors?: { message: string }[];
      };
      if (!response.ok || answer.errors?.length) {
        throw new Error(
          answer.errors?.map(({ message }) => message).join('; ') ??
            `HTTP ${response.status}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `the chat ${chat.id} could not be recorded: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
