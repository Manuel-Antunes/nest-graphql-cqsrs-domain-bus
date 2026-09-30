/*
 * Tailwind v4 plugin shim that registers the custom `bubble` prose theme so
 * `@tailwindcss/typography` emits the `prose-bubble` modifier. The typography
 * plugin reads `theme('typography')`, which can't be set from pure CSS — hence
 * this tiny no-op-handler plugin that only contributes the theme. Referenced
 * from entrypoints/tailwind.css via `@plugin` AFTER the typography plugin.
 * (Colour overrides also live in scss/_next-colors.scss `.prose.prose-bubble`.)
 */
import plugin from 'tailwindcss/plugin';

export default plugin(() => {}, {
  theme: {
    extend: {
      typography: {
        bubble: {
          css: {
            color: 'rgb(var(--slate-12))',
            lineHeight: '1.6',
            fontSize: '14px',
            '*': {
              '&:first-child': { marginTop: '0' },
            },
            overflowWrap: 'anywhere',
            strong: { color: 'rgb(var(--slate-12))', fontWeight: '700' },
            b: { color: 'rgb(var(--slate-12))', fontWeight: '700' },
            h1: {
              color: 'rgb(var(--slate-12))',
              fontWeight: '700',
              fontSize: '1.25rem',
              '&:first-child': { marginTop: '0' },
            },
            h2: {
              color: 'rgb(var(--slate-12))',
              fontWeight: '700',
              fontSize: '1rem',
              '&:first-child': { marginTop: '0' },
            },
            h3: {
              color: 'rgb(var(--slate-12))',
              fontWeight: '700',
              fontSize: '1rem',
              '&:first-child': { marginTop: '0' },
            },
            hr: { marginTop: '1.5em', marginBottom: '1.5em' },
            a: { color: 'rgb(var(--slate-12))', textDecoration: 'underline' },
            ul: { paddingInlineStart: '0', listStylePosition: 'inside' },
            ol: { paddingInlineStart: '0', listStylePosition: 'inside' },
            'ul > li': {
              marginBlockEnd: '0.5em',
              listStyleType: 'disc',
              paddingInlineStart: '1.5em',
              textIndent: '-1.5em',
            },
            'ol > li': {
              marginBlockEnd: '0.5em',
              listStyleType: 'decimal',
              paddingInlineStart: '1.5em',
              textIndent: '-1.5em',
            },
            'li > p:first-child': { display: 'inline' },
            'li > *': { textIndent: '0' },
            blockquote: {
              color: 'rgb(var(--slate-11))',
              borderLeft: '4px solid rgb(var(--black-alpha-1))',
              paddingLeft: '1em',
              '[dir="rtl"] &': {
                borderLeft: 'none',
                paddingLeft: '0',
                borderRight: '4px solid rgb(var(--black-alpha-1))',
                paddingRight: '1em',
              },
              '[dir="ltr"] &': { borderRight: 'none', paddingRight: '0' },
            },
            code: {
              backgroundColor: 'rgb(var(--alpha-3))',
              color: 'rgb(var(--slate-11))',
              padding: '0.2em 0.4em',
              borderRadius: '4px',
              fontSize: '0.95em',
              '&::before': { content: 'none' },
              '&::after': { content: 'none' },
            },
            pre: {
              backgroundColor: 'rgb(var(--alpha-3))',
              padding: '1em',
              borderRadius: '6px',
              overflowX: 'auto',
            },
            table: { width: '100%', borderCollapse: 'collapse' },
            th: {
              padding: '0.75em',
              color: 'rgb(var(--slate-12))',
              border: 'none',
              textAlign: 'start',
              fontWeight: '600',
            },
            tr: { border: 'none' },
            td: { padding: '0.75em', border: 'none' },
            img: {
              maxWidth: '100%',
              height: 'auto',
              marginTop: 'unset',
              marginBottom: 'unset',
            },
          },
        },
      },
    },
  },
});
