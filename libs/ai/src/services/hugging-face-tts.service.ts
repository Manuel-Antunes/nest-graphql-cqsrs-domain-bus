import { BadRequestException, Injectable } from '@nestjs/common';

import type { TTSService } from './tts.service';

@Injectable()
export class HuggingFaceTTSService implements TTSService {
  constructor(private readonly baseUrl: string) {}

  async textToSpeechBase64(text: string): Promise<string> {
    const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      throw new BadRequestException(
        `Hugging Face TTS API error: ${response.statusText}`,
      );
    }
    return Buffer.from(await response.arrayBuffer()).toString('base64');
  }
}
