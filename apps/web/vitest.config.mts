import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],

  css: { postcss: { plugins: [] } },

  resolve: {
    alias: { '@': join(import.meta.dirname, 'src') },
  },

  test: {
    environment: 'jsdom',

    include: ['src/**/*.spec.{ts,tsx}'],

    setupFiles: ['./vitest.setup.ts'],

    server: { deps: { inline: [/@copilotkit\//] } },

    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: { junit: 'target/test-results/junit.xml' },
  },
});
