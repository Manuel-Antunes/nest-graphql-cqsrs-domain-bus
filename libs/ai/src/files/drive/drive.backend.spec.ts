import { InMemoryDisk } from '@nestjs/storage';

import { DriveBackend } from './drive.backend';
import { RunScope } from './run-scope';

const ROOT = 'agents/octopus/u1/file-analysis/t1';

let disk: InMemoryDisk;

const backendAt = (rootPrefix = ROOT) => new DriveBackend({ disk, rootPrefix });

beforeEach(() => {
  disk = new InMemoryDisk();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DriveBackend', () => {
  describe('path translation', () => {
    it('prepends the root and drops the leading slash when it reaches the disk', async () => {
      await backendAt().write('/notes.txt', 'olá');

      expect(disk.keys()).toEqual([`${ROOT}/notes.txt`]);
    });

    it('normalises slashes around the root', async () => {
      await backendAt(`/${ROOT}/`).write('/notes.txt', 'olá');

      expect(disk.keys()).toEqual([`${ROOT}/notes.txt`]);
    });

    it('resolves a dynamic root per call from the run’s configurable', async () => {
      const root = vi.fn(() => 'agents/natasha/u2/file-analysis/t2');
      vi.spyOn(RunScope, 'config').mockReturnValue({
        configurable: { user_id: 'u2', thread_id: 't2' },
      });

      await new DriveBackend({ disk, rootPrefix: root }).write('/a.txt', 'x');

      expect(root).toHaveBeenCalledWith({
        config: { configurable: { user_id: 'u2', thread_id: 't2' } },
      });
      expect(disk.keys()).toEqual(['agents/natasha/u2/file-analysis/t2/a.txt']);
    });

    it('refuses a path that would climb out of the root', async () => {
      const result = await backendAt().read('/../../secret.txt');

      expect(result.error).toMatch(/not found/);
    });
  });

  describe('read', () => {
    it('hands binaries back as bytes, so read_file builds a multimodal block', async () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      await disk.put(`${ROOT}/49.png`, png);

      const result = await backendAt().read('/49.png');

      expect(result.mimeType).toBe('image/png');
      expect(result.content).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(result.content as Uint8Array)).toEqual(png);
    });

    it('treats a PDF as binary', async () => {
      await disk.put(`${ROOT}/a.pdf`, Buffer.from('%PDF-1.7'));

      const result = await backendAt().read('/a.pdf');

      expect(result.mimeType).toBe('application/pdf');
      expect(result.content).toBeInstanceOf(Uint8Array);
    });

    it('reads a sidecar as JSON text', async () => {
      await disk.put(`${ROOT}/49.meta.json`, '{"sourceId":"49"}');

      const result = await backendAt().read('/49.meta.json');

      expect(result).toEqual({
        content: '{"sourceId":"49"}',
        mimeType: 'application/json',
      });
    });

    it('paginates text by line offset and limit', async () => {
      await disk.put(`${ROOT}/lines.txt`, 'a\nb\nc\nd');

      expect((await backendAt().read('/lines.txt', 1, 2)).content).toBe('b\nc');
    });

    it('answers a missing file with an error result rather than throwing', async () => {
      expect((await backendAt().read('/missing.txt')).error).toMatch(
        /File '\/missing.txt' not found/,
      );
    });

    it('reports the raw bytes with the object’s modification time', async () => {
      await disk.put(`${ROOT}/a.txt`, 'x');

      const result = await backendAt().readRaw('/a.txt');

      expect(result.data?.content).toBe('x');
      expect(new Date(result.data?.modified_at ?? '').getTime()).not.toBeNaN();
    });
  });

  describe('write / edit', () => {
    it('writes to the disk and reports that no state update is needed', async () => {
      const result = await backendAt().write('/notes.md', '# Olá');

      expect(result).toEqual({ path: '/notes.md', filesUpdate: null });
      expect(await disk.getText(`${ROOT}/notes.md`)).toBe('# Olá');
    });

    it('replaces a unique match', async () => {
      await disk.put(`${ROOT}/notes.txt`, 'hello world');

      const result = await backendAt().edit('/notes.txt', 'world', 'there');

      expect(result.occurrences).toBe(1);
      expect(await disk.getText(`${ROOT}/notes.txt`)).toBe('hello there');
    });

    it('refuses an ambiguous match without replaceAll', async () => {
      await disk.put(`${ROOT}/notes.txt`, 'a a');

      expect((await backendAt().edit('/notes.txt', 'a', 'b')).error).toMatch(
        /multiple occurrences/,
      );
      expect(await disk.getText(`${ROOT}/notes.txt`)).toBe('a a');
    });

    it('replaces every match with replaceAll, counting them', async () => {
      await disk.put(`${ROOT}/notes.txt`, 'a a a');

      const result = await backendAt().edit('/notes.txt', 'a', 'b', true);

      expect(result.occurrences).toBe(3);
      expect(await disk.getText(`${ROOT}/notes.txt`)).toBe('b b b');
    });

    it('says so when the string is not there', async () => {
      await disk.put(`${ROOT}/notes.txt`, 'abc');

      expect((await backendAt().edit('/notes.txt', 'z', 'y')).error).toMatch(
        /not found/,
      );
    });
  });

  describe('ls / glob / grep', () => {
    beforeEach(async () => {
      await disk.put(`${ROOT}/49.png`, Buffer.from([1]));
      await disk.put(`${ROOT}/49.meta.json`, '{"analysis":"um passaporte"}');
      await disk.put(`${ROOT}/docs/contrato.pdf`, Buffer.from('%PDF'));
      await disk.put(`${ROOT}/docs/resumo.txt`, 'contrato de locação');
      await disk.put(
        'agents/octopus/u9/file-analysis/t9/other.png',
        Buffer.from([1]),
      );
    });

    it('lists the immediate children, directories derived from the keys', async () => {
      const result = await backendAt().ls('/');

      expect(result.files?.map((file) => [file.path, file.is_dir])).toEqual([
        ['/49.meta.json', false],
        ['/49.png', false],
        ['/docs/', true],
      ]);
    });

    it('lists inside a directory', async () => {
      const result = await backendAt().ls('/docs');

      expect(result.files?.map((file) => file.path)).toEqual([
        '/docs/contrato.pdf',
        '/docs/resumo.txt',
      ]);
    });

    it('never lists another conversation’s files', async () => {
      const result = await backendAt().glob('**/*.png');

      expect(result.files?.map((file) => file.path)).toEqual(['/49.png']);
    });

    it('globs recursively, and matches a bare pattern against the basename', async () => {
      expect(
        (await backendAt().glob('**/*.pdf')).files?.map((f) => f.path),
      ).toEqual(['/docs/contrato.pdf']);
      expect(
        (await backendAt().glob('*.pdf')).files?.map((f) => f.path),
      ).toEqual(['/docs/contrato.pdf']);
    });

    it('finds text files by content and skips binaries', async () => {
      const result = await backendAt().grep('passaporte|locação');

      expect(result.matches).toEqual([
        {
          path: '/49.meta.json',
          line: 1,
          text: '{"analysis":"um passaporte"}',
        },
        { path: '/docs/resumo.txt', line: 1, text: 'contrato de locação' },
      ]);
    });

    it('honours the glob filter, and degrades an invalid regex to a literal', async () => {
      expect(
        (await backendAt().grep('contrato', '/', '*.txt')).matches?.map(
          (m) => m.path,
        ),
      ).toEqual(['/docs/resumo.txt']);
      expect((await backendAt().grep('(unclosed')).matches).toEqual([]);
    });
  });
});
