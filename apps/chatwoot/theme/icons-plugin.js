/*
 * Tailwind v4 plugin shim for the @egoist icon system — referenced from
 * entrypoints/tailwind.css via `@plugin`. This is the one piece that cannot be
 * expressed as pure CSS: `getIconCollections([...])` and the custom `woot` SVG
 * set (theme/icons.js) require JS. Loaded by Tailwind's jiti loader, so the
 * mixed ESM/CJS in the icon deps resolves fine. NOT a tailwind.config.js — it
 * carries no theme/content, only this plugin.
 */
import { iconsPlugin, getIconCollections } from '@egoist/tailwindcss-icons';
import { icons } from './icons';

export default iconsPlugin({
  collections: {
    woot: { icons },
    ...getIconCollections([
      'lucide',
      'logos',
      'ri',
      'ph',
      'material-symbols',
      'teenyicons',
      'fluent',
    ]),
  },
});
