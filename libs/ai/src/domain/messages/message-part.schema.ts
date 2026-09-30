import { z } from 'zod';

/**
 * The Vercel AI SDK `UIMessagePart` model.
 *
 * Lives in `@acme/ai-domain` rather than in a feature domain because it is not
 * a chat concept: it is the shape every client renders a model turn in, and it
 * is what both projections of the LangGraph checkpointer produce —
 * `chat_message_view` for GraphQL and `a2a_task_message_view` for A2A.
 * `@acme/chat-domain` re-exports it, so `chatMessageSchema` and every existing
 * importer are unaffected.
 *
 * Every payload field is nullish so a client can send an explicit `null` for the
 * fields its part type does not use.
 */
export const chatMessagePartSchema = z.object({
  type: z.string(),
  text: z.string().nullish(),
  input: z.any().optional(),
  output: z.any().optional(),
  state: z.string().nullish(),
  toolCallId: z.string().nullish(),
  toolName: z.string().nullish(),
  mediaType: z.string().nullish(),
  url: z.string().nullish(),
  filename: z.string().nullish(),
});

export type ChatMessagePart = z.infer<typeof chatMessagePartSchema>;
