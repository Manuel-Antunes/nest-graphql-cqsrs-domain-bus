import { Injectable } from '@nestjs/common';
import OpenAI, { toFile } from 'openai';
import { STTOptions, STTService } from './stt.service';

@Injectable()
export class OpenAIWhisperSTTService implements STTService {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string = 'whisper-1',
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async transcribe(
    audio: Buffer,
    mimeType: string,
    options: STTOptions = {},
  ): Promise<string> {
    // Whisper needs a filename hint to pick the decoder. The extension is
    // derived from the MIME so that ogg/opus, m4a, mp3 all work.
    const ext = mimeType.split('/').pop()?.split(';')[0]?.trim() || 'bin';
    const file = await toFile(audio, `audio.${ext}`, { type: mimeType });

    const result = await this.client.audio.transcriptions.create({
      file,
      model: this.model,
      language: options.language?.split('-')[0],
      prompt: options.prompt,
      response_format: 'text',
    });

    return typeof result === 'string' ? result : (result as { text: string }).text;
  }
}
