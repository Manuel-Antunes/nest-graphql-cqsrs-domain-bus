import { isAudioConsentInterrupt } from '../schemas/humanized-response-state.schema';

export type InterruptKind =
  | 'audio_consent'
  | 'judit_polling_request'
  | 'judit_polling';

export interface ClassifiedInterrupt {
  kind: InterruptKind;
  rawMessage: string;
}

export class InterruptPayloads {
  static classify(value: unknown): ClassifiedInterrupt | null {
    if (isAudioConsentInterrupt(value) && value.consentQuestion) {
      return { kind: 'audio_consent', rawMessage: value.consentQuestion };
    }
    if (!value || typeof value !== 'object') return null;
    const { kind, message } = value as { kind?: unknown; message?: unknown };
    if (
      (kind === 'judit_polling_request' || kind === 'judit_polling') &&
      typeof message === 'string' &&
      message
    ) {
      return { kind, rawMessage: message };
    }
    return null;
  }
}
