import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessageChunk, type BaseMessage } from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';

/** One model response: prose, then the tool calls it decided on. */
export type ScriptedTurn = {
  text?: string[];
  toolCalls?: { id: string; name: string; args: Record<string, unknown> }[];
};

/**
 * A chat model that streams a fixed script.
 *
 * Real enough to exercise the v3 stream: it pushes token-level chunks through
 * the callback manager, so LangChain Core builds the same
 * `content-block-start/delta/finish` events a provider would — which is exactly
 * the surface `run.messages` and `run.toolCalls` are projections of. A model
 * that only implemented `_generate` would stream nothing and prove nothing.
 */
export class ScriptedModel extends BaseChatModel {
  private index = 0;

  constructor(private readonly turns: ScriptedTurn[]) {
    super({});
  }

  _llmType() {
    return 'scripted';
  }

  /** The agent binds tools; the script decides the calls, so this is a no-op. */
  override bindTools() {
    return this as never;
  }

  override async *_streamResponseChunks(
    _messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const turn = this.turns[Math.min(this.index, this.turns.length - 1)];
    this.index += 1;

    for (const piece of turn.text ?? []) {
      yield* this.emit(
        runManager,
        piece,
        new AIMessageChunk({ content: piece }),
      );
    }

    for (const [offset, call] of (turn.toolCalls ?? []).entries()) {
      yield* this.emit(
        runManager,
        '',
        new AIMessageChunk({
          content: '',
          tool_call_chunks: [
            {
              id: call.id,
              name: call.name,
              args: JSON.stringify(call.args),
              // Past the text block at index 0, or the chunks merge into it.
              index: offset + 1,
              type: 'tool_call_chunk',
            },
          ],
        }),
      );
    }
  }

  private async *emit(
    runManager: CallbackManagerForLLMRun | undefined,
    text: string,
    message: AIMessageChunk,
  ): AsyncGenerator<ChatGenerationChunk> {
    const chunk = new ChatGenerationChunk({ text, message });
    await runManager?.handleLLMNewToken(
      text,
      undefined,
      undefined,
      undefined,
      undefined,
      { chunk },
    );
    yield chunk;
  }

  async _generate(): Promise<never> {
    throw new Error('ScriptedModel only supports streaming');
  }
}
