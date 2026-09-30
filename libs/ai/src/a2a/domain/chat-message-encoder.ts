import type { Part } from '@a2a-js/sdk';

import type { ChatMessagePart } from '../../domain/messages/message-part.schema';
import { A2aPart } from './a2a-part';
import { ClientToolsExtension } from './extensions/client-tools.extension';

type ToolInvocationPart = ChatMessagePart & { type: 'tool-invocation' };

export class ChatMessageEncoder {
  constructor(private readonly clientTools = new ClientToolsExtension()) {}

  encode(parts: readonly ChatMessagePart[]): Part[] {
    return parts.flatMap((part) => this.encodePart(part));
  }

  private encodePart(part: ChatMessagePart): Part[] {
    if (part.type === 'text') return part.text ? [A2aPart.text(part.text)] : [];

    if (part.type === 'file') {
      if (!part.url) return [];
      return [
        A2aPart.url(
          part.url,
          part.mediaType ?? 'application/octet-stream',
          part.filename ?? '',
        ),
      ];
    }

    if (part.type === 'tool-invocation') {
      return this.encodeInvocation(part as ToolInvocationPart);
    }

    return [];
  }

  private encodeInvocation(invocation: ToolInvocationPart): Part[] {
    const toolCallId = invocation.toolCallId ?? '';
    const toolName = invocation.toolName ?? '';
    if (!toolCallId || !toolName) return [];

    const parts = [
      this.clientTools.encode({
        type: 'tool-call',
        toolCallId,
        toolName,
        args: invocation.input ?? {},
        execution: 'server',
      }),
    ];

    if (ChatMessageEncoder.hasResult(invocation)) {
      parts.push(
        this.clientTools.encode({
          type: 'tool-result',
          toolCallId,
          toolName,
          result: invocation.output ?? null,
          ...(invocation.state === 'output-error' ? { isError: true } : {}),
        }),
      );
    }

    return parts;
  }

  private static hasResult(part: ToolInvocationPart): boolean {
    return part.state === 'output-available' || part.state === 'output-error';
  }
}
