/* eslint-disable */
// Tailwind v4 runs through the @tailwindcss/postcss plugin (NOT @tailwindcss/vite).
//
// Why postcss and not the Vite plugin: chatwoot authors Tailwind from inside Sass
// — ~88 SFC `<style lang="scss">` blocks plus base partials use `@apply`. The Vite
// plugin only transforms its own plain-CSS entry; it leaves `@apply`/`@reference`
// untouched in the Sass-compiled (`?lang.scss`) modules, so they reach the browser
// raw and get dropped. The PostCSS plugin runs *after* the Sass preprocessor in
// Vite's CSS pipeline, so it expands `@apply` in every stylesheet, scss included.
//
// Speed: utilities are generated from the single plain entry
// (entrypoints/tailwind.css). Every other stylesheet only gets a `@reference` to
// that entry (injected via vite.config.mts `additionalData`), which resolves
// `@apply` against the theme WITHOUT re-scanning content or re-emitting the
// framework — so we avoid the old "every Sass root regenerates Tailwind" cost.
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
