import { GoogleGenAI } from '@google/genai';
import { BadRequestException, Injectable } from '@nestjs/common';

import { STTOptions, STTService } from './stt.service';

@Injectable()
export class GeminiSTTService implements STTService {
  private readonly genAI: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string = 'gemini-2.5-flash',
  ) {
    this.genAI = new GoogleGenAI({ apiKey });
  }

  async transcribe(
    audio: Buffer,
    mimeType: string,
    options: STTOptions = {},
  ): Promise<string> {
    const language = options.language ?? 'pt-BR';
    const promptText = [
      `Transcreva exatamente o áudio em ${language}, palavra por palavra.`,
      'Não resuma, não traduza, não adicione comentários.',
      'Retorne apenas o texto transcrito, sem prefixos ou rótulos.',
      options.prompt ? `Contexto adicional: ${options.prompt}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const result = await this.genAI.models.generateContent({
      model: this.model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType,
                data: audio.toString('base64'),
              },
            },
          ],
        },
      ],
    });

    const text = result.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join('\n')
      .trim();

    if (!text) {
      throw new BadRequestException(
        'Gemini STT returned no text for the supplied audio',
      );
    }
    return text;
  }
}
