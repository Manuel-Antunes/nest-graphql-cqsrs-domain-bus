'use client';

import * as React from 'react';

export type Rgb = [number, number, number];

export type Rgb01 = [number, number, number];

function toRgb(cssColor: string): Rgb | null {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#000';
  ctx.fillStyle = cssColor;
  if (
    ctx.fillStyle === '#000' &&
    !/^(#0{3,8}|black|rgb\(0[,\s])/i.test(cssColor.trim())
  ) {
    return null;
  }

  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b] as Rgb;
}

function sameColors(a: Rgb[], b: Rgb[]): boolean {
  return (
    a.length === b.length &&
    a.every((c, i) => c[0] === b[i][0] && c[1] === b[i][1] && c[2] === b[i][2])
  );
}

export function useBrandColors(tokens: readonly string[]): Rgb[] {
  const key = tokens.join(',');

  const [colors, setColors] = React.useState<Rgb[]>([]);

  React.useEffect(() => {
    const resolve = () => {
      const probe = document.createElement('span');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText =
        'position:absolute;width:0;height:0;opacity:0;pointer-events:none';
      document.body.appendChild(probe);

      const resolved = key.split(',').map((token) => {
        probe.style.color = '';
        probe.style.color = `var(${token})`;
        const computed = getComputedStyle(probe).color;
        return toRgb(computed) ?? ([128, 128, 128] as Rgb);
      });

      probe.remove();
      setColors((prev) => (sameColors(prev, resolved) ? prev : resolved));
    };

    resolve();

    const observer = new MutationObserver(resolve);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });

    return () => observer.disconnect();
  }, [key]);

  return colors;
}

export function useBrandColors01(tokens: readonly string[]): Rgb01[] {
  const colors = useBrandColors(tokens);
  return React.useMemo(
    () => colors.map(([r, g, b]) => [r / 255, g / 255, b / 255] as Rgb01),
    [colors],
  );
}
