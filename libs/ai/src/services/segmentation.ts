/**
 * WhatsApp-style segmentation helpers used by the response delivery tools.
 *
 * Two flavors:
 *  - {@link splitTextIntoSegments} — short typed-message bubbles. Prefers
 *    paragraph then sentence boundaries; isolates copy-friendly tokens
 *    (URLs, emails, CNJ-like patterns) onto their own bubble.
 *  - {@link chunkAudioText} — TTS-friendly chunks. Stays paragraph-aligned
 *    when possible, falls back to sentence split, and only hard-splits on
 *    whitespace as a last resort.
 *
 * Kept framework-agnostic so any agent in the monorepo can wire delivery
 * without dragging the rest of the response-agent surface.
 */

/** Per-text-segment cap so each WhatsApp bubble feels like a typed message. */
export const TEXT_SEGMENT_MAX_CHARS = 280;

/** Per-audio-chunk cap (Gemini TTS accepts up to ~2k; 1500 leaves headroom). */
export const AUDIO_CHUNK_MAX_CHARS = 1500;

/** Below this length, audio mode falls back to text — too short to justify TTS. */
export const AUDIO_MIN_CHARS = 200;

const ISOLATE_PATTERN =
  /(https?:\/\/\S+|\b[\w.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b)/g;

interface IsolatedPiece {
  text: string;
  isolate: boolean;
}

export function splitTextIntoSegments(
  text: string,
  maxChars: number = TEXT_SEGMENT_MAX_CHARS,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const paragraphs = trimmed.split(/\n{2,}/);
  const segments: string[] = [];

  for (const para of paragraphs) {
    const isolated = extractIsolatedTokens(para);
    for (const piece of isolated) {
      if (piece.isolate) {
        segments.push(piece.text);
        continue;
      }
      const sentences = piece.text
        .split(/(?<=[.!?…])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      let buffer = '';
      for (const sentence of sentences) {
        if (sentence.length > maxChars) {
          if (buffer) {
            segments.push(buffer);
            buffer = '';
          }
          let rest = sentence;
          while (rest.length > maxChars) {
            let cut = rest.lastIndexOf(' ', maxChars);
            if (cut <= 0) cut = maxChars;
            segments.push(rest.slice(0, cut).trim());
            rest = rest.slice(cut).trimStart();
          }
          buffer = rest;
        } else if (buffer && buffer.length + sentence.length + 1 > maxChars) {
          segments.push(buffer);
          buffer = sentence;
        } else {
          buffer = buffer ? `${buffer} ${sentence}` : sentence;
        }
      }
      if (buffer) segments.push(buffer);
    }
  }

  return segments.map((s) => s.trim()).filter((s) => s.length > 0);
}

export function chunkAudioText(
  text: string,
  maxChars: number = AUDIO_CHUNK_MAX_CHARS,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const paragraphs = trimmed.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  const push = (chunk: string) => {
    const c = chunk.trim();
    if (c) chunks.push(c);
  };

  for (const para of paragraphs) {
    if (para.length <= maxChars - current.length - 2) {
      current = current ? `${current}\n\n${para}` : para;
      continue;
    }
    if (current) {
      push(current);
      current = '';
    }
    if (para.length <= maxChars) {
      current = para;
      continue;
    }
    const sentences = para.split(/(?<=[.!?…])\s+/);
    for (const sentence of sentences) {
      if (sentence.length > maxChars) {
        if (current) {
          push(current);
          current = '';
        }
        let rest = sentence;
        while (rest.length > maxChars) {
          let cut = rest.lastIndexOf(' ', maxChars);
          if (cut <= 0) cut = maxChars;
          push(rest.slice(0, cut));
          rest = rest.slice(cut).trimStart();
        }
        current = rest;
      } else if (current.length + sentence.length + 1 > maxChars) {
        push(current);
        current = sentence;
      } else {
        current = current ? `${current} ${sentence}` : sentence;
      }
    }
  }
  if (current) push(current);
  return chunks;
}

function extractIsolatedTokens(text: string): IsolatedPiece[] {
  const pieces: IsolatedPiece[] = [];
  let lastIdx = 0;
  for (const m of text.matchAll(ISOLATE_PATTERN)) {
    const idx = m.index ?? 0;
    if (idx > lastIdx) {
      pieces.push({ text: text.slice(lastIdx, idx).trim(), isolate: false });
    }
    pieces.push({ text: m[0].trim(), isolate: true });
    lastIdx = idx + m[0].length;
  }
  if (lastIdx < text.length) {
    pieces.push({ text: text.slice(lastIdx).trim(), isolate: false });
  }
  return pieces.filter((p) => p.text.length > 0);
}
