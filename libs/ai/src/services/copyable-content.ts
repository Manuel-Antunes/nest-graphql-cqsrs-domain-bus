// ─────────────────────────────────────────────────────────────
// Copyable-content detection
//
// A humanized voice agent must NEVER "dictate" copy-paste data — e-mails, CPF,
// CNPJ, CNJ (process numbers), phones, links, protocols, long/large numbers.
// Spoken digit-by-digit they are useless (the user can't copy a TTS clip) and
// sound robotic. Such data belongs in a TEXT bubble; the audio may reference it
// implicitly ("te enviei no texto"). These helpers detect and extract that data
// so the delivery layer can enforce the rule regardless of what the model emits.
// ─────────────────────────────────────────────────────────────

/**
 * Patterns for "copyable" tokens. Order is irrelevant — for extraction the
 * matched spans are merged, so overlaps (e.g. a raw 11-digit CPF also matching
 * the long-run rule) collapse into one removed span. Tuned for pt-BR / Brazil
 * formats; a few false positives (a number moved to text instead of spoken) are
 * acceptable for a safety net, false negatives are not.
 */
const COPYABLE_PATTERNS: readonly RegExp[] = [
  // E-mail.
  /[^\s@]+@[^\s@]+\.[^\s@.,;:!?)\]]{2,}/g,
  // URL (http/https/www…).
  /\b(?:https?:\/\/|www\.)\S+/gi,
  // CNJ process number — NNNNNNN-DD.AAAA.J.TR.OOOO, separators optional.
  /\b\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}\b/g,
  // CNPJ — formatted (raw 14 digits falls to the long-run rule).
  /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g,
  // CPF — formatted (raw 11 digits falls to the long-run rule).
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
  // Brazilian phone — optional DDD/parens/leading 9, separators optional.
  /\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g,
  // Money / large number with thousand separators — 1.234.567 or 1.234,56.
  /\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b/g,
  // Any run of 6+ digits — RG, protocol/account ids, raw CPF/CNPJ, big numbers.
  /\b\d{6,}\b/g,
];

interface Span {
  start: number;
  end: number;
}

/** True when `text` contains at least one copyable token. */
export function hasCopyableContent(text: string | undefined | null): boolean {
  if (!text) return false;
  return COPYABLE_PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(text);
  });
}

/**
 * Split `text` into the spoken remainder (`stripped`, copyable tokens removed
 * and the gaps tidied) and the ordered, de-duplicated `tokens` themselves.
 *
 * When nothing copyable is found, `stripped === text` and `tokens` is empty —
 * the caller can cheaply detect the no-op case via `tokens.length === 0`.
 */
export function extractCopyableContent(text: string): {
  stripped: string;
  tokens: string[];
} {
  const spans: Span[] = [];
  for (const pattern of COPYABLE_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      if (m[0].length === 0) {
        pattern.lastIndex += 1; // guard against zero-width matches
        continue;
      }
      spans.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  if (spans.length === 0) return { stripped: text, tokens: [] };

  // Sort by start (then widest first) and merge overlapping/adjacent spans so
  // each copyable region is removed exactly once.
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Span[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) {
      if (s.end > last.end) last.end = s.end;
      continue;
    }
    merged.push({ ...s });
  }

  const tokens: string[] = [];
  const seen = new Set<string>();
  let stripped = '';
  let cursor = 0;
  for (const s of merged) {
    stripped += text.slice(cursor, s.start);
    const tok = text.slice(s.start, s.end).trim();
    if (tok && !seen.has(tok)) {
      seen.add(tok);
      tokens.push(tok);
    }
    cursor = s.end;
  }
  stripped += text.slice(cursor);

  // Tidy the gaps the removal left behind so the spoken text reads cleanly.
  stripped = stripped
    .replace(/\(\s*\)/g, '') // empty parens "(  )"
    .replace(/[ \t]{2,}/g, ' ') // collapsed double spaces
    .replace(/\s+([,.;:!?])/g, '$1') // space before punctuation
    .replace(/([,;:]\s*){2,}/g, '$1') // doubled connectors ", ,"
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  return { stripped, tokens };
}
