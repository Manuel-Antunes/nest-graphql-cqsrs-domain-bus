/**
 * Proactive audio-preference detection.
 *
 * This pure helper stays in `@acme/ai` (NOT in the humanized middleware, which
 * now lives in `@acme/chat-infrastructure`) because the AI channel layer — the
 * `base-channel-response-processor` — needs it to render an early bridge /
 * interrupt message as audio on the SAME turn the user asks, before the
 * humanized middleware's `audioPref` write has propagated out of the (still
 * paused) supervisor graph. Keeping it here avoids a `@acme/ai` →
 * `@acme/chat-infrastructure` dependency (which would be a cycle, since
 * chat-infrastructure already depends on `@acme/ai`).
 *
 * The humanized middleware re-exports `isProactiveAudioRequest` so existing
 * importers keep working.
 */

/**
 * Proactive audio-preference signals in the user's own message — when the user
 * EXPLICITLY asks for audio up front ("não sei ler", "me explica tudo em
 * áudio", "manda em áudio", "prefiro áudio", "só áudio", "sou analfabeto").
 *
 * Deliberately conservative: only clear, affirmative requests. Ambiguous cases
 * ("tanto faz") are left to the normal `send_audio` consent flow.
 */
export const PROACTIVE_AUDIO_RE =
  /n[ãa]o\s+sei\s+ler|n[ãa]o\s+consigo\s+ler|sou\s+analfabet|dificuldade\s+(de|pra|para)\s+ler|(explica|explicar|responde|responder|manda|mandar|me\s+manda|me\s+explica)\b[^.?!]{0,40}?\b(em|por|tudo\s+em)\s+[áa]udio|prefiro\s+[áa]udio|s[óo]\s+[áa]udio|quero\s+(ouvir|[áa]udio)|pode\s+(me\s+)?(explicar|mandar|responder)\b[^.?!]{0,40}?[áa]udio/i;

/**
 * True when `text` is a clear, proactive request to receive audio. Exported so
 * the channel processor can render an early bridge/interrupt message as audio
 * on the SAME turn the user asks — before the middleware's `audioPref` write
 * has propagated out of the (still-paused) supervisor graph.
 */
export function isProactiveAudioRequest(text: string | undefined): boolean {
  return !!text && PROACTIVE_AUDIO_RE.test(text);
}
