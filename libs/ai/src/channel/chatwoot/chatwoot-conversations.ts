export interface ChatwootAttachment {
  data: string;
  filename: string;
  contentType: string;
}

export interface ChatwootMessageInput {
  conversationId: number;
  content?: string;
  messageType?: 'outgoing' | 'incoming' | 'template';
  private?: boolean;
  contentType?: string;
  contentAttributes?: Record<string, unknown>;
  attachments?: ChatwootAttachment[];
}

export class ChatwootGraphqlError extends Error {
  constructor(
    readonly operation: string,
    readonly errors: readonly { message: string }[],
  ) {
    super(
      `${operation} failed: ${errors.map((error) => error.message).join('; ')}`,
    );
    this.name = 'ChatwootGraphqlError';
  }
}

export class ChatwootConversations {
  private static readonly CREATE_MESSAGE =
    `mutation CreateANewMessageInAConversation($input: CreateANewMessageInAConversationInput!) {
  createANewMessageInAConversation(input: $input) {
    message {
      id
    }
  }
}`;

  private static readonly TOGGLE_TYPING =
    `mutation ToggleTypingStatusInConversation($input: ToggleTypingStatusInConversationInput!) {
  toggleTypingStatusInConversation(input: $input) {
    clientMutationId
  }
}`;

  private static readonly UPDATE_LAST_SEEN =
    `mutation UpdateConversationLastSeen($input: UpdateConversationLastSeenInput!) {
  updateConversationLastSeen(input: $input) {
    clientMutationId
  }
}`;

  constructor(
    private readonly endpoint: string,
    private readonly headers: Readonly<Record<string, string>>,
  ) {}

  async createMessage(
    input: ChatwootMessageInput,
  ): Promise<string | undefined> {
    const data = await this.execute<{
      createANewMessageInAConversation: {
        message: { id: string } | null;
      } | null;
    }>(
      'CreateANewMessageInAConversation',
      ChatwootConversations.CREATE_MESSAGE,
      {
        input,
      },
    );
    return data.createANewMessageInAConversation?.message?.id;
  }

  async toggleTyping(
    conversationId: number,
    typingStatus: 'on' | 'off',
    isPrivate = false,
  ): Promise<void> {
    await this.execute(
      'ToggleTypingStatusInConversation',
      ChatwootConversations.TOGGLE_TYPING,
      { input: { conversationId, typingStatus, isPrivate } },
    );
  }

  async markSeen(conversationId: number): Promise<void> {
    await this.execute(
      'UpdateConversationLastSeen',
      ChatwootConversations.UPDATE_LAST_SEEN,
      { input: { conversationId } },
    );
  }

  private async execute<T>(
    operationName: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { ...this.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ operationName, query, variables }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      data?: T;
      errors?: { message: string }[];
    };
    if (body.errors?.length) {
      throw new ChatwootGraphqlError(operationName, body.errors);
    }
    if (!response.ok || !body.data) {
      throw new ChatwootGraphqlError(operationName, [
        { message: `HTTP ${response.status} ${response.statusText}`.trim() },
      ]);
    }
    return body.data;
  }
}
