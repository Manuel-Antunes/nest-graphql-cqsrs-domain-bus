import { fileURLToPath } from 'node:url';
import { apolloClientAiApps } from '@apollo/client-ai-apps/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  build: {
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    apolloClientAiApps({
      targets: ['mcp'],
      appsOutDir: '../mcp/apps',
      schema: '../gateway/dist/supergraph/api.graphql',
    }),
    react(),
    tailwindcss(),
    viteSingleFile(),
  ],
});
