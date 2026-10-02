import { randomUUID } from 'node:crypto';
import { type BaseEvent, EventType } from '@ag-ui/core';
import { ToolMessage } from '@langchain/core/messages';
import type { ProtocolEvent } from '@langchain/langgraph';

import { AgUiEvents } from './ag-ui-events';

type Block = { type?: string; id?: string; name?: string; args?: unknown };

type MessagesData =
  | { event: 'message-start'; id?: string }
  | { event: 'content-block-start'; index: number; content: Block }
  | {
      event: 'content-block-delta';
      index: number;
      delta:
        | { type: 'text-delta'; text: string }
        | { type: 'block-delta'; fields: Block }
        | { type: string };
    }
  | { event: 'content-block-finish'; index: number; content: Block }
  | { event: 'message-finish' }
  | { event: string };

type ToolsData =
  | { event: 'tool-finished'; tool_call_id: string; output: unknown }
  | { event: 'tool-error'; tool_call_id: string; message: string }
  | { event: string; tool_call_id?: string };

interface OpenMessage {
  readonly id: string;
  segments: number;
  text?: string;
  readonly calls: Map<number, string>;
}

export class AgUiProtocolTranslator {
  static readonly MODEL_NODE = 'model_request';

  private message?: OpenMessage;
  private readonly startedCalls = new Set<string>();
  private readonly endedCalls = new Set<string>();

  translate(event: ProtocolEvent): BaseEvent[] {
    const { method, params } = event;
    if (method === 'custom') {
      const passed = AgUiEvents.of(
        (params.data as { payload?: unknown })?.payload,
      );
      return passed ? [passed] : [];
    }
    if (params.namespace.length > 1) return [];
    if (
      method === 'messages' &&
      params.node === AgUiProtocolTranslator.MODEL_NODE
    ) {
      return this.onMessage(params.data as MessagesData);
    }
    if (method === 'tools') return this.onTool(params.data as ToolsData);
    return [];
  }

  finish(): BaseEvent[] {
    return this.closeText();
  }

  private onMessage(data: MessagesData): BaseEvent[] {
    switch (data.event) {
      case 'message-start': {
        const events = this.closeText();
        this.message = {
          id: (data as { id?: string }).id ?? randomUUID(),
          segments: 0,
          calls: new Map(),
        };
        return events;
      }
      case 'content-block-start': {
        const { index, content } = data as { index: number; content: Block };
        return AgUiProtocolTranslator.isCall(content)
          ? this.startCall(index, content)
          : [];
      }
      case 'content-block-delta': {
        const { index, delta } = data as {
          index: number;
          delta: { type: string; text?: string; fields?: Block };
        };
        if (delta.type === 'text-delta' && delta.text) {
          return this.appendText(delta.text);
        }
        if (
          delta.type === 'block-delta' &&
          delta.fields &&
          AgUiProtocolTranslator.isCall(delta.fields)
        ) {
          return this.startCall(index, delta.fields);
        }
        return [];
      }
      case 'content-block-finish': {
        const { index, content } = data as { index: number; content: Block };
        if (content.type === 'tool_call')
          return this.finishCall(index, content);
        if (content.type === 'text') return this.closeText();
        return [];
      }
      case 'message-finish': {
        const events = this.closeText();
        this.message = undefined;
        return events;
      }
      default:
        return [];
    }
  }

  private onTool(data: ToolsData): BaseEvent[] {
    const id = data.tool_call_id;
    if (!id || !this.endedCalls.has(id)) return [];
    if (data.event === 'tool-finished') {
      return [
        {
          type: EventType.TOOL_CALL_RESULT,
          messageId: randomUUID(),
          toolCallId: id,
          role: 'tool',
          content: AgUiProtocolTranslator.textOf(
            (data as { output: unknown }).output,
          ),
        },
      ];
    }
    if (data.event === 'tool-error') {
      return [
        {
          type: EventType.TOOL_CALL_RESULT,
          messageId: randomUUID(),
          toolCallId: id,
          role: 'tool',
          content: (data as { message: string }).message,
        },
      ];
    }
    return [];
  }

  private appendText(delta: string): BaseEvent[] {
    const message = this.ensureMessage();
    const events: BaseEvent[] = [];
    if (!message.text) {
      message.text =
        message.segments === 0
          ? message.id
          : `${message.id}:${message.segments}`;
      message.segments += 1;
      events.push({
        type: EventType.TEXT_MESSAGE_START,
        messageId: message.text,
        role: 'assistant',
      });
    }
    events.push({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: message.text,
      delta,
    });
    return events;
  }

  private closeText(): BaseEvent[] {
    const open = this.message?.text;
    if (!this.message || !open) return [];
    this.message.text = undefined;
    return [{ type: EventType.TEXT_MESSAGE_END, messageId: open }];
  }

  private startCall(index: number, block: Block): BaseEvent[] {
    const message = this.ensureMessage();
    const id = block.id;
    if (!id || !block.name || this.startedCalls.has(id)) return [];
    message.calls.set(index, id);
    this.startedCalls.add(id);
    return [
      ...this.closeText(),
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: id,
        toolCallName: block.name,
        parentMessageId: message.id,
      },
    ];
  }

  private finishCall(index: number, block: Block): BaseEvent[] {
    const message = this.ensureMessage();
    const id = block.id ?? message.calls.get(index);
    if (!id || this.endedCalls.has(id)) return [];
    const events = this.startCall(index, { ...block, id });
    this.endedCalls.add(id);
    return [
      ...events,
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: id,
        delta: JSON.stringify(block.args ?? {}),
      },
      { type: EventType.TOOL_CALL_END, toolCallId: id },
    ];
  }

  private ensureMessage(): OpenMessage {
    this.message ??= { id: randomUUID(), segments: 0, calls: new Map() };
    return this.message;
  }

  private static isCall(block: Block): boolean {
    return block.type === 'tool_call_chunk' || block.type === 'tool_call';
  }

  static textOf(output: unknown): string {
    if (typeof output === 'string') return output;
    if (ToolMessage.isInstance(output)) return output.text;
    const content = (output as { kwargs?: { content?: unknown } } | undefined)
      ?.kwargs?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((block) =>
          typeof block === 'string'
            ? block
            : ((block as { text?: string }).text ?? ''),
        )
        .join('');
    }
    try {
      return JSON.stringify(output) ?? '';
    } catch {
      return String(output);
    }
  }
}
