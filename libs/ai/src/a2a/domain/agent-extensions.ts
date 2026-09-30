import type { AgentExtension } from '@a2a-js/sdk';
import type { RequestContext, ServerCallContext } from '@a2a-js/sdk/server';

import type { AnyExtension } from './extension';
import { A2uiExtension } from './extensions/a2ui.extension';
import { BrowserContextExtension } from './extensions/browser-context.extension';
import { ClientToolsExtension } from './extensions/client-tools.extension';
import { DeepAgentExtension } from './extensions/deep-agent.extension';
import { HumanInTheLoopExtension } from './extensions/human-in-the-loop.extension';
import { MessageTimestampsExtension } from './extensions/message-timestamps.extension';
import { PromptAugmentationExtension } from './extensions/prompt-augmentation.extension';

export class AgentExtensions {
  readonly clientTools = new ClientToolsExtension();
  readonly promptAugmentation = new PromptAugmentationExtension();
  readonly deepAgent = new DeepAgentExtension();
  readonly humanInTheLoop = new HumanInTheLoopExtension();
  readonly browserContext = new BrowserContextExtension();
  readonly messageTimestamps = new MessageTimestampsExtension();
  readonly a2ui = new A2uiExtension();

  all(): AnyExtension[] {
    return [
      this.clientTools,
      this.promptAugmentation,
      this.deepAgent,
      this.humanInTheLoop,
      this.browserContext,
      this.a2ui,
      this.messageTimestamps,
    ];
  }

  uris(): string[] {
    return this.all().map((extension) => extension.uri);
  }

  descriptors(declared?: ReadonlySet<string>): AgentExtension[] {
    return this.all()
      .filter((extension) => !declared?.size || declared.has(extension.uri))
      .map((extension) => extension.descriptor);
  }

  activateForTurn(context: ServerCallContext): AnyExtension[] {
    return this.all()
      .filter((extension) => extension !== this.messageTimestamps)
      .filter((extension) => extension.activate(context));
  }

  rendersToolEvents(request: Pick<RequestContext, 'context'>): boolean {
    return (
      this.clientTools.isActivatedFor(request) ||
      this.deepAgent.isActivatedFor(request)
    );
  }
}
