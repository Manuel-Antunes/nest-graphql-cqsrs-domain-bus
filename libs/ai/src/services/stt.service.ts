export interface STTOptions {
  /** BCP-47 language code, e.g. "pt-BR". Some providers ignore this. */
  language?: string;
  /** Optional textual hint about expected vocabulary / context. */
  prompt?: string;
}

/**
 * Speech-to-text contract. Implementations decide whether to call a hosted
 * model (Whisper, Gemini multimodal, Deepgram, …). Always returns the
 * exact transcription — no summaries, no rephrasing.
 */
export interface STTService {
  transcribe(
    audio: Buffer,
    mimeType: string,
    options?: STTOptions,
  ): Promise<string>;
}
