import { GoogleGenAI } from '@google/genai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { TTSService } from './tts.service';

const SSML_OPTIMIZER_SYSTEM_PROMPT = `# Agente SSML Optimizer - Gemini TTS

## Contexto
Voce e um agente especialista em SSML (Speech Synthesis Markup Language).
Sua funcao e receber texto bruto e transformar em SSML otimizado para sintese de voz natural.
Voce trabalha com a assistente Natasha do escritorio Mota e Advogados Associados.

## Objetivo
Transformar texto bruto em SSML estruturado otimizado para:
- Pronuncia correta
- Prosodia natural (ritmo, tom, enfase)
- Pausas adequadas
- Formatacao para numeros, datas, horas e termos especiais

## Regras Gerais
- Sempre retorne envolvido pela tag raiz <speak>...</speak>
- Nunca invente ou adicione conteudo
- Use tags SSML de forma estrategica e nao excessiva
- Priorize naturalidade sobre complexidade tecnica

## Tags SSML Compativeis
- <break time='500ms'/> - Pausas entre etapas
- <say-as interpret-as='verbatim'> - Numeros de processo
- <say-as interpret-as='date' format='dmy'> - Datas
- <say-as interpret-as='time'> - Horarios
- <say-as interpret-as='currency' language='pt-BR'> - Valores monetarios
- <say-as interpret-as='telephone'> - Telefones
- <prosody rate='slow'> - Controle de velocidade
- <emphasis level='moderate'> - Enfase

## Contexto Juridico
- Numeros de processo: SEMPRE use <say-as interpret-as='verbatim'>
- Valores monetarios: SEMPRE use <say-as interpret-as='currency'>
- URLs e emails: NUNCA no audio - sugira envio por texto

## Formato de Saida
- UMA UNICA linha (sem quebras de linha)
- Use ASPAS SIMPLES nos atributos SSML (NUNCA aspas duplas)
- Retorne APENAS o XML SSML comecando com <speak> e terminando com </speak>

Correto: <speak><prosody pitch='+1st'>Texto aqui</prosody></speak>
Errado: <speak><prosody pitch="+1st">Texto aqui</prosody></speak>`;

@Injectable()
export class GeminiTTsService implements TTSService {
  private readonly logger = new Logger(GeminiTTsService.name);
  private genAI: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly ssmlOptimizerLlm?: BaseChatModel,
  ) {
    this.genAI = new GoogleGenAI({ apiKey });
  }

  async textToSpeechBase64(text: string): Promise<string> {
    const payload = await this.optimizeSsml(text);
    const result = await this.genAI.models.generateContent({
      contents: [{ role: 'user', parts: [{ text: payload }] }],
      model: 'gemini-2.5-flash-preview-tts',
      config: {
        responseModalities: ['Audio'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Achernar',
            },
          },
        },
      },
    });
    const audioResult = result.candidates?.[0];
    const inlineData = audioResult?.content?.parts?.[0]?.inlineData;
    if (!inlineData || !inlineData.data) {
      throw new BadRequestException('No audio data returned from Gemini TTS');
    }
    return this.pcm16ToWavBase64(inlineData.data);
  }

  private async optimizeSsml(text: string): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return trimmed;
    if (!this.ssmlOptimizerLlm) return trimmed;

    try {
      const result = await this.ssmlOptimizerLlm.invoke([
        { role: 'system', content: SSML_OPTIMIZER_SYSTEM_PROMPT },
        { role: 'user', content: trimmed },
      ]);
      const ssml = this.extractText(result.content).trim();
      if (!ssml.startsWith('<speak>') || !ssml.endsWith('</speak>')) {
        this.logger.warn(
          'SSML optimizer returned malformed output, falling back to raw text',
        );
        return trimmed;
      }
      return ssml;
    } catch (error) {
      this.logger.warn(
        `SSML optimization failed, falling back to raw text: ${error}`,
      );
      return trimmed;
    }
  }

  private extractText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part) =>
          typeof part === 'string'
            ? part
            : typeof (part as { text?: unknown })?.text === 'string'
              ? (part as { text: string }).text
              : '',
        )
        .join('');
    }
    return '';
  }

  private pcm16ToWavBase64(
    pcmBase64: string,
    sampleRate = 24000,
    channels = 1,
  ): string {
    const pcmBytes = Uint8Array.from(atob(pcmBase64), (c) => c.charCodeAt(0));

    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + pcmBytes.length);
    const view = new DataView(buffer);

    const writeStr = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++) {
        view.setUint8(offset + i, s.charCodeAt(i));
      }
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + pcmBytes.length, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, pcmBytes.length, true);

    new Uint8Array(buffer, 44).set(pcmBytes);

    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
}
