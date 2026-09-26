import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

import { FileNotFoundException } from '../errors/attachment.exceptions';
import { FileInspector } from './file-inspector';
import { TemporaryFile } from './temporary-file';

describe('FileInspector', () => {
  it('tells a buffer by its bytes, whatever it is named', async () => {
    const jpeg = await sharp({
      create: { width: 1, height: 1, channels: 3, background: '#fff' },
    })
      .jpeg()
      .toBuffer();

    expect(await FileInspector.ofBuffer(jpeg, 'wrong.png')).toEqual({
      extname: 'jpg',
      mimeType: 'image/jpeg',
      size: jpeg.length,
    });
  });

  it('recognises SVG by its markup', async () => {
    const svg = Buffer.from(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>',
    );

    expect(await FileInspector.ofBuffer(svg)).toMatchObject({
      extname: 'svg',
      mimeType: 'image/svg+xml',
    });
  });

  it('falls back to the name for bytes nobody recognises, and to octet-stream without one', async () => {
    const text = Buffer.from('just words');

    expect(await FileInspector.ofBuffer(text, 'notes.md')).toMatchObject({
      extname: 'md',
      mimeType: 'text/markdown',
    });
    expect(await FileInspector.ofBuffer(text)).toMatchObject({
      extname: 'bin',
      mimeType: 'application/octet-stream',
    });
  });

  it('tells a path by its name first, and by its bytes when the name says nothing', async () => {
    const png = await sharp({
      create: { width: 1, height: 1, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer();
    const path = TemporaryFile.path();
    await writeFile(path, png);

    expect(await FileInspector.ofPath(path)).toEqual({
      extname: 'png',
      mimeType: 'image/png',
      size: png.length,
    });
    expect(await FileInspector.ofPath(path, 'named.gif')).toMatchObject({
      mimeType: 'image/gif',
    });
    await TemporaryFile.remove(path);
  });

  it('says which file is missing', async () => {
    await expect(FileInspector.ofPath('/nowhere/at/all')).rejects.toThrow(
      FileNotFoundException,
    );
  });
});
