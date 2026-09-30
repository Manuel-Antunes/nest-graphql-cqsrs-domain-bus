/**
 * Reading a conversation, without knowing where it is stored.
 *
 * A port, deliberately tiny. `@acme/chat-application` needs to answer one
 * question — "is this message part of this conversation?" — and the answer lives
 * in the LangGraph checkpointer, which the chat layer has no business reaching
 * into. It used to reach a SQL view instead; the view is gone, and the read that
 * replaced it is the one `GetTask` performs.
 *
 * Declared in `@acme/ai-domain` because both sides already depend on it and
 * neither may depend on the other: `@acme/ai` (which implements this over the
 * checkpointer) cannot import `@acme/chat-*`, since that edge already runs the
 * other way.
 */
export interface ConversationReader {
  /** Whether `messageId` is a user-visible message of the given thread. */
  hasMessage(threadId: string, messageId: string): Promise<boolean>;
}

/** DI token. A string so the chat layer never imports the implementation. */
export const CONVERSATION_READER = 'CONVERSATION_READER';
