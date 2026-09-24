import fs from 'fs';
import { converter, formatCss, parse } from 'culori';

const hslToOklch = converter('oklch');

const css = fs.readFileSync('theme.css', 'utf8');

const converted = css.replace(
  /(--[\w-]+:\s*)(\d+\.?\d*)\s+(\d+\.?\d*)%\s+(\d+\.?\d*)%/g,
  (_, prefix, h, s, l) => {
    const hsl = parse(`hsl(${h} ${s}% ${l}%)`);
    const oklch = hslToOklch(hsl);
    return `${prefix}${formatCss(oklch)}`;
  },
);

fs.writeFileSync('theme.oklch.css', converted);
