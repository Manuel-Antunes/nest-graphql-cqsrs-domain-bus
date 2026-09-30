/// <reference types="vite/client" />

// Ambient module declarations so type-checked (`lang="ts"`) files can import the
// asset and non-TS module kinds the Vite build understands. Keeps the vue-tsc
// gate focused on real type errors instead of unresolved-module noise.

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

declare module '*.svg' {
  const src: string;
  export default src;
}
declare module '*.svg?raw' {
  const content: string;
  export default content;
}
declare module '*.svg?url' {
  const src: string;
  export default src;
}
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.jpeg' {
  const src: string;
  export default src;
}
declare module '*.gif' {
  const src: string;
  export default src;
}
declare module '*.webp' {
  const src: string;
  export default src;
}
declare module '*.css' {
  const classes: Record<string, string>;
  export default classes;
}
declare module '*.scss' {
  const classes: Record<string, string>;
  export default classes;
}
