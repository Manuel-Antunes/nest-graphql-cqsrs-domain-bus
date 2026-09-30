import { SidecarKeys } from './attachment-sidecar';

describe('SidecarKeys', () => {
  it('keys a sidecar by the source id under its root', () => {
    expect(SidecarKeys.of('agents/u/file-analysis/t', '49')).toBe(
      'agents/u/file-analysis/t/49.meta.json',
    );
    expect(SidecarKeys.of('/tmp/file-analysis/', '49')).toBe(
      'tmp/file-analysis/49.meta.json',
    );
    expect(SidecarKeys.of('', '49')).toBe('49.meta.json');
  });

  it('puts the sidecar beside the bytes, whatever their extension', () => {
    expect(SidecarKeys.beside('a/b/49.pdf')).toBe('a/b/49.meta.json');
    expect(SidecarKeys.beside('49.ogg')).toBe('49.meta.json');
    expect(SidecarKeys.beside('a/noext')).toBe('a/noext.meta.json');
  });

  it('recognises a sidecar path', () => {
    expect(SidecarKeys.isSidecar('/attachments/49.meta.json')).toBe(true);
    expect(SidecarKeys.isSidecar('/attachments/49.json')).toBe(false);
  });
});
