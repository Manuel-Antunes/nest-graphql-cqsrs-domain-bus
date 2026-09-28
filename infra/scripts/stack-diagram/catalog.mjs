import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export class Words {
  static STOPWORDS = new Set([
    'a',
    'alt',
    'amazon',
    'and',
    'aws',
    'cloud',
    'for',
    'index',
    'of',
    'service',
    'the',
    'with',
  ]);

  static of(text) {
    return String(text)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map(Words.#singular)
      .filter((word) => word && !Words.STOPWORDS.has(word));
  }

  static ofName(name) {
    return Words.of(
      name
        .replace(/v\d+$/i, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'),
    );
  }

  static joined(text) {
    return String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  static #singular(word) {
    return word.length > 3 && word.endsWith('s') && !word.endsWith('ss')
      ? word.slice(0, -1)
      : word;
  }
}

export class DrawioCatalog {
  static SOURCE =
    'https://raw.githubusercontent.com/jgraph/drawio/dev/src/main/webapp/js/diagramly/sidebar/Sidebar-AWS4.js';
  static CACHE = fileURLToPath(
    new URL(
      '../../../node_modules/.cache/stack-diagram/Sidebar-AWS4.js',
      import.meta.url,
    ),
  );
  static MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  static ENTRY =
    /createVertexTemplateEntry\(\s*(\w+)\s*\+\s*'(resourceIcon;resIcon='\s*\+\s*gn\s*\+\s*'\.)?([a-z0-9_]+);'\s*,\s*([^,]+),\s*([^,]+),\s*'[^']*'\s*,\s*'([^']*)'\s*,\s*null\s*,\s*null\s*,\s*this\.getTagsForStencil\(\s*gn\s*,\s*'([^']*)'/g;

  constructor(entries, aliases = {}) {
    this.entries = entries;
    this.aliases = aliases;
    this.byIcon = new Map(entries.map((entry) => [entry.icon, entry]));
  }

  static async load(aliases) {
    return new DrawioCatalog(
      DrawioCatalog.parse(await DrawioCatalog.#source()),
      aliases,
    );
  }

  static parse(source) {
    return source
      .split(/Sidebar\.prototype\.addAWS4(?=\w+Palette\s*=)/)
      .slice(1)
      .flatMap((chunk) => DrawioCatalog.#palette(chunk));
  }

  static #palette(chunk) {
    const palette = chunk.match(/^(\w+)Palette/)[1];
    const prefixes = new Map(
      [...chunk.matchAll(/var (\w+) = '([^']*)'/g)].map(([, name, value]) => [
        name,
        value,
      ]),
    );
    return [...chunk.matchAll(DrawioCatalog.ENTRY)].flatMap(
      ([, prefix, service, icon, width, height, title, tags]) => {
        const color = prefixes.get(prefix)?.match(/fillColor=(#\w{6})/)?.[1];
        if (!color) return [];
        const tagWords = Words.of(tags);
        return [
          {
            icon,
            title,
            palette,
            color,
            service: Boolean(service),
            width: DrawioCatalog.#size(width),
            height: DrawioCatalog.#size(height),
            words: new Set(Words.of(title)),
            keys: new Set([
              ...Words.of(title),
              ...tagWords,
              ...Words.of(icon),
              Words.joined(title),
              Words.joined(icon),
              ...tagWords.slice(1).map((word, index) => tagWords[index] + word),
            ]),
          },
        ];
      },
    );
  }

  static #size(argument) {
    return Number(argument.match(/(\d+(?:\.\d+)?)\s*$/)?.[1] ?? 78);
  }

  static async #source() {
    const cached = DrawioCatalog.#cached();
    if (cached?.fresh) return cached.text;
    try {
      const response = await fetch(DrawioCatalog.SOURCE);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const text = await response.text();
      mkdirSync(dirname(DrawioCatalog.CACHE), { recursive: true });
      writeFileSync(DrawioCatalog.CACHE, text);
      return text;
    } catch (error) {
      if (cached) return cached.text;
      throw new Error(
        `could not read draw.io's AWS palette from ${DrawioCatalog.SOURCE}: ${error.message}`,
      );
    }
  }

  static #cached() {
    try {
      const age = Date.now() - statSync(DrawioCatalog.CACHE).mtimeMs;
      return {
        text: readFileSync(DrawioCatalog.CACHE, 'utf8'),
        fresh: age < DrawioCatalog.MAX_AGE,
      };
    } catch {
      return undefined;
    }
  }

  icon(name) {
    const entry = this.byIcon.get(name);
    if (!entry) {
      throw new Error(`draw.io's AWS palette has no icon named "${name}"`);
    }
    return entry;
  }

  service(module) {
    return this.#services(this.#moduleWords(module))[0];
  }

  resource(type) {
    const module = this.#moduleWords(type.module);
    const nouns = this.#expanded(Words.ofName(type.name).slice(-1));
    const name = this.#expanded(Words.ofName(type.name));
    const palettes = new Set(
      this.#services(module).map((entry) => entry.palette),
    );
    return this.#ranked(
      this.entries,
      (entry) => DrawioCatalog.#score(entry, name, module),
      (entry) =>
        DrawioCatalog.#overlap(entry.keys, module) > 0 ||
        (DrawioCatalog.#overlap(entry.keys, nouns) > 0 &&
          palettes.has(entry.palette)),
    )[0];
  }

  #services(module) {
    return this.#ranked(
      this.entries.filter((entry) => entry.service),
      (entry) => DrawioCatalog.#score(entry, [], module),
      (entry) => DrawioCatalog.#overlap(entry.keys, module) > 0,
    );
  }

  #moduleWords(module) {
    const bare = module.replace(/v\d+$/i, '');
    return this.#expanded([Words.joined(bare), ...Words.of(bare)]);
  }

  #expanded(words) {
    return [
      ...new Set(
        words.flatMap((word) => [word, ...Words.of(this.aliases[word] ?? '')]),
      ),
    ].filter((word) => word && !Words.STOPWORDS.has(word));
  }

  #ranked(entries, score, accept) {
    return entries
      .filter(accept)
      .map((entry, index) => ({ entry, index, score: score(entry) }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.entry.words.size - b.entry.words.size ||
          a.index - b.index,
      )
      .map(({ entry }) => entry);
  }

  static #overlap(keys, words) {
    return words.filter((word) => keys.has(word)).length;
  }

  static #score(entry, name, module) {
    const query = new Set([...name, ...module]);
    const extra = [...entry.words].filter((word) => !query.has(word)).length;
    return (
      3 * DrawioCatalog.#overlap(entry.keys, name) +
      DrawioCatalog.#overlap(entry.keys, module) -
      1.5 * extra
    );
  }
}
