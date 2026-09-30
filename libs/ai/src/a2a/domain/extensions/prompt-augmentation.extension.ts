import type { RequestContext } from '@a2a-js/sdk/server';

import { BaseExtension } from '../extension';

export type ToolChoice =
  | { type: 'required' }
  | { type: 'tool'; toolName: string };

export interface PromptAugmentationPayload {
  type: 'prompt-augmentation';
  instructions?: string;
  toolChoice?: ToolChoice;
}

export class PromptAugmentationExtension extends BaseExtension<PromptAugmentationPayload> {
  readonly name = 'prompt-augmentation';
  readonly version = 'v1';
  readonly description =
    'Caller-supplied system-prompt augmentation and per-request tool choice.';
  protected override readonly payloadTypes = ['prompt-augmentation'] as const;

  instructionsFor(
    request: Pick<RequestContext, 'userMessage' | 'task' | 'context'>,
  ): string {
    if (!this.isActivatedFor(request)) return '';
    return (
      this.decodeFromTurn(request, 'prompt-augmentation')?.instructions ?? ''
    );
  }
}
