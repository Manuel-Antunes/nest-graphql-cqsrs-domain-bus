export interface TTSService {
  textToSpeechBase64(text: string): Promise<string>;
}
