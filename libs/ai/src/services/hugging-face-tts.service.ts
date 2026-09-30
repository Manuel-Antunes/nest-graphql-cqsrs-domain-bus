import { BadRequestException, Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { TTSService } from './tts.service';

@Injectable()
export class HuggingFaceTTSService implements TTSService {
  private client: AxiosInstance;

  constructor(baseUrl: string) {
    this.client = axios.create({
      baseURL: baseUrl,
    });
  }

  async textToSpeechBase64(text: string): Promise<string> {
    const result = await this.client.post(
      '/tts',
      {
        text,
      },
      {
        responseType: 'arraybuffer',
      },
    );
    if (result.status !== 200) {
      throw new BadRequestException(
        `Hugging Face TTS API error: ${result.statusText}`,
      );
    }
    const wavBuffer = result.data as ArrayBuffer;
    return this.wavToBase64(wavBuffer);
  }

  private wavToBase64(wavBuffer: ArrayBuffer): string {
    const uint8Array = new Uint8Array(wavBuffer);
    let binary = '';
    for (let i = 0; i < uint8Array.byteLength; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  }
}
