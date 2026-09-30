import { getConfig } from '@langchain/langgraph';

import {
  AttachmentScope,
  type AttachmentScopeConfig,
} from '../domain/attachment-scope';

export interface RunConfig {
  metadata?: Record<string, unknown>;
  configurable?: AttachmentScopeConfig;
}

export class RunScope {
  static config(): RunConfig | undefined {
    try {
      return getConfig() as RunConfig | undefined;
    } catch {
      return undefined;
    }
  }

  static configurable(): AttachmentScopeConfig | undefined {
    return RunScope.config()?.configurable;
  }

  static attachmentRoot(): string {
    return AttachmentScope.rootOf(RunScope.configurable());
  }
}
