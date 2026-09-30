// vite.config.mts
import { defineConfig } from "file:///Users/manuelantunes/Projects/Vas/gmpa-monorepo-migrate/apps/chatwoot/node_modules/vite/dist/node/index.js";
import ruby from "file:///Users/manuelantunes/Projects/Vas/gmpa-monorepo-migrate/node_modules/vite-plugin-ruby/dist/index.mjs";
import path from "path";
import { fileURLToPath } from "node:url";
import vue from "file:///Users/manuelantunes/Projects/Vas/gmpa-monorepo-migrate/node_modules/@vitejs/plugin-vue/dist/index.mjs";
var __vite_injected_original_import_meta_url = "file:///Users/manuelantunes/Projects/Vas/gmpa-monorepo-migrate/apps/chatwoot/vite.config.mts";
var __dirname = path.dirname(fileURLToPath(__vite_injected_original_import_meta_url));
var isLibraryMode = process.env.BUILD_MODE === "library";
var isTestMode = process.env.TEST === "true";
var vueOptions = {
  template: {
    compilerOptions: {
      isCustomElement: (tag) => ["ninja-keys"].includes(tag)
    }
  }
};
var plugins = [ruby(), vue(vueOptions)];
if (isLibraryMode) {
  plugins = [];
} else if (isTestMode) {
  plugins = [vue(vueOptions)];
}
var vite_config_default = defineConfig({
  plugins,
  build: {
    rollupOptions: {
      output: {
        // [NOTE] when not in library mode, no new keys will be addedd or overwritten
        // setting dir: isLibraryMode ? 'public/packs' : undefined will not work
        ...isLibraryMode ? {
          dir: "public/packs",
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === "sdk") {
              return "js/sdk.js";
            }
            return "[name].js";
          }
        } : {},
        inlineDynamicImports: isLibraryMode
        // Disable code-splitting for SDK
      }
    },
    lib: isLibraryMode ? {
      entry: path.resolve(__dirname, "./app/javascript/entrypoints/sdk.js"),
      formats: ["iife"],
      // IIFE format for single file
      name: "sdk"
    } : void 0
  },
  resolve: {
    alias: {
      vue: "vue/dist/vue.esm-bundler.js",
      components: path.resolve("./app/javascript/dashboard/components"),
      next: path.resolve("./app/javascript/dashboard/components-next"),
      v3: path.resolve("./app/javascript/v3"),
      dashboard: path.resolve("./app/javascript/dashboard"),
      helpers: path.resolve("./app/javascript/shared/helpers"),
      shared: path.resolve("./app/javascript/shared"),
      survey: path.resolve("./app/javascript/survey"),
      widget: path.resolve("./app/javascript/widget"),
      assets: path.resolve("./app/javascript/dashboard/assets")
    }
  },
  test: {
    environment: "jsdom",
    include: ["app/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    coverage: {
      reporter: ["lcov", "text"],
      include: ["app/**/*.js", "app/**/*.vue"],
      exclude: [
        "app/**/*.@(spec|stories|routes).js",
        "**/specs/**/*",
        "**/i18n/**/*"
      ]
    },
    globals: true,
    outputFile: "coverage/sonar-report.xml",
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: false
      }
    },
    server: {
      deps: {
        inline: ["tinykeys", "@material/mwc-icon"]
      }
    },
    setupFiles: ["fake-indexeddb/auto", "vitest.setup.js"],
    mockReset: true,
    clearMocks: true
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcubXRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL1VzZXJzL21hbnVlbGFudHVuZXMvUHJvamVjdHMvVmFzL2dtcGEtbW9ub3JlcG8tbWlncmF0ZS9hcHBzL2NoYXR3b290XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvVXNlcnMvbWFudWVsYW50dW5lcy9Qcm9qZWN0cy9WYXMvZ21wYS1tb25vcmVwby1taWdyYXRlL2FwcHMvY2hhdHdvb3Qvdml0ZS5jb25maWcubXRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy9tYW51ZWxhbnR1bmVzL1Byb2plY3RzL1Zhcy9nbXBhLW1vbm9yZXBvLW1pZ3JhdGUvYXBwcy9jaGF0d29vdC92aXRlLmNvbmZpZy5tdHNcIjsvLy8gPHJlZmVyZW5jZSB0eXBlcz1cInZpdGVzdFwiIC8+XG5cbi8qKlxuV2hhdCdzIGdvaW5nIG9uIHdpdGggbGlicmFyeSBtb2RlP1xuXG5HbGFkIHlvdSBhc2tlZCwgaGVyZSdzIGEgcXVpY2sgcnVuZG93bjpcblxuMS4gdml0ZS1wbHVnaW4tcnVieSB3aWxsIGF1dG9tYXRpY2FsbHkgYnJpbmcgYWxsIHRoZSBlbnRyeXBvaW50cyBsaWtlIGRhc2hib3JkIGFuZCB3aWRnZXQgYXMgaW5wdXQgdG8gdml0ZS5cbjIuIHZpdGUgbmVlZHMgdG8gYmUgaW4gbGlicmFyeSBtb2RlIHRvIGJ1aWxkIHRoZSBTREsgYXMgYSBzaW5nbGUgZmlsZS4gKFVNRCkgZm9ybWF0IGFuZCBzZXQgYGlubGluZUR5bmFtaWNJbXBvcnRzYCB0byB0cnVlLlxuMy4gQnV0IHdoZW4gc2V0dGluZyBgaW5saW5lRHluYW1pY0ltcG9ydHNgIHRvIHRydWUsIHZpdGUgd2lsbCBub3QgYmUgYWJsZSB0byBoYW5kbGUgbXV0bGlwbGUgZW50cnlwb2ludHMuXG5cblRoaXMgcHV0cyB1cyBpbiBhIGRlYWRsb2NrLCBub3cgdGhlcmUgYXJlIHR3byB3YXlzIGFyb3VuZCB0aGlzLCBlaXRoZXIgYWRkIGFub3RoZXIgc2VwYXJhdGUgYnVpbGQgcGlwZWxpbmUgdG9cbnRoZSBhcHAgdXNpbmcgdmFuaWxsYSByb2xsdXAgb3IgcnNwYWNrIG9yIHNvbWV0aGluZy4gVGhlIHNlY29uZCBvcHRpb24gaXMgdG8gcmVtb3ZlIHNkayBidWlsZGluZyBmcm9tIHRoZSBtYWluIHBpcGVsaW5lXG5hbmQgYnVpbGQgaXQgc2VwYXJhdGVseSB1c2luZyBWaXRlIGl0c2VsZiwgdG9nZ2xlZCBieSBhbiBFTlYgdmFyaWFibGUuXG5cbmBCVUlMRF9NT0RFPWxpYnJhcnkgYmluL3ZpdGUgYnVpbGRgIHNob3VsZCBidWlsZCBvbmx5IHRoZSBTREsgYW5kIHNhdmUgaXQgdG8gYHB1YmxpYy9wYWNrcy9qcy9zZGsuanNgXG5gYmluL3ZpdGUgYnVpbGRgIHdpbGwgYnVpbGQgdGhlIHJlc3Qgb2YgdGhlIGFwcCBhcyB1c3VhbC4gQnV0IGV4Y2x1ZGUgdGhlIFNESy5cblxuV2UgbmVlZCB0byBlZGl0IHRoZSBgYXNzZXQ6cHJlY29tcGlsZWAgcmFrZSB0YXNrIHRvIGluY2x1ZGUgdGhlIFNESyBpbiB0aGUgcHJlY29tcGlsZSBsaXN0LlxuKi9cbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnO1xuaW1wb3J0IHJ1YnkgZnJvbSAndml0ZS1wbHVnaW4tcnVieSc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IGZpbGVVUkxUb1BhdGggfSBmcm9tICdub2RlOnVybCc7XG5pbXBvcnQgdnVlIGZyb20gJ0B2aXRlanMvcGx1Z2luLXZ1ZSc7XG5cbmNvbnN0IF9fZGlybmFtZSA9IHBhdGguZGlybmFtZShmaWxlVVJMVG9QYXRoKGltcG9ydC5tZXRhLnVybCkpO1xuXG5jb25zdCBpc0xpYnJhcnlNb2RlID0gcHJvY2Vzcy5lbnYuQlVJTERfTU9ERSA9PT0gJ2xpYnJhcnknO1xuY29uc3QgaXNUZXN0TW9kZSA9IHByb2Nlc3MuZW52LlRFU1QgPT09ICd0cnVlJztcblxuY29uc3QgdnVlT3B0aW9ucyA9IHtcbiAgdGVtcGxhdGU6IHtcbiAgICBjb21waWxlck9wdGlvbnM6IHtcbiAgICAgIGlzQ3VzdG9tRWxlbWVudDogKHRhZzogc3RyaW5nKSA9PiBbJ25pbmphLWtleXMnXS5pbmNsdWRlcyh0YWcpLFxuICAgIH0sXG4gIH0sXG59O1xuXG5sZXQgcGx1Z2lucyA9IFtydWJ5KCksIHZ1ZSh2dWVPcHRpb25zKV07XG5cbmlmIChpc0xpYnJhcnlNb2RlKSB7XG4gIHBsdWdpbnMgPSBbXTtcbn0gZWxzZSBpZiAoaXNUZXN0TW9kZSkge1xuICBwbHVnaW5zID0gW3Z1ZSh2dWVPcHRpb25zKV07XG59XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IHBsdWdpbnMsXG4gIGJ1aWxkOiB7XG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIC8vIFtOT1RFXSB3aGVuIG5vdCBpbiBsaWJyYXJ5IG1vZGUsIG5vIG5ldyBrZXlzIHdpbGwgYmUgYWRkZWRkIG9yIG92ZXJ3cml0dGVuXG4gICAgICAgIC8vIHNldHRpbmcgZGlyOiBpc0xpYnJhcnlNb2RlID8gJ3B1YmxpYy9wYWNrcycgOiB1bmRlZmluZWQgd2lsbCBub3Qgd29ya1xuICAgICAgICAuLi4oaXNMaWJyYXJ5TW9kZVxuICAgICAgICAgID8ge1xuICAgICAgICAgICAgICBkaXI6ICdwdWJsaWMvcGFja3MnLFxuICAgICAgICAgICAgICBlbnRyeUZpbGVOYW1lczogY2h1bmtJbmZvID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoY2h1bmtJbmZvLm5hbWUgPT09ICdzZGsnKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gJ2pzL3Nkay5qcyc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiAnW25hbWVdLmpzJztcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICA6IHt9KSxcbiAgICAgICAgaW5saW5lRHluYW1pY0ltcG9ydHM6IGlzTGlicmFyeU1vZGUsIC8vIERpc2FibGUgY29kZS1zcGxpdHRpbmcgZm9yIFNES1xuICAgICAgfSxcbiAgICB9LFxuICAgIGxpYjogaXNMaWJyYXJ5TW9kZVxuICAgICAgPyB7XG4gICAgICAgICAgZW50cnk6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL2FwcC9qYXZhc2NyaXB0L2VudHJ5cG9pbnRzL3Nkay5qcycpLFxuICAgICAgICAgIGZvcm1hdHM6IFsnaWlmZSddLCAvLyBJSUZFIGZvcm1hdCBmb3Igc2luZ2xlIGZpbGVcbiAgICAgICAgICBuYW1lOiAnc2RrJyxcbiAgICAgICAgfVxuICAgICAgOiB1bmRlZmluZWQsXG4gIH0sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgdnVlOiAndnVlL2Rpc3QvdnVlLmVzbS1idW5kbGVyLmpzJyxcbiAgICAgIGNvbXBvbmVudHM6IHBhdGgucmVzb2x2ZSgnLi9hcHAvamF2YXNjcmlwdC9kYXNoYm9hcmQvY29tcG9uZW50cycpLFxuICAgICAgbmV4dDogcGF0aC5yZXNvbHZlKCcuL2FwcC9qYXZhc2NyaXB0L2Rhc2hib2FyZC9jb21wb25lbnRzLW5leHQnKSxcbiAgICAgIHYzOiBwYXRoLnJlc29sdmUoJy4vYXBwL2phdmFzY3JpcHQvdjMnKSxcbiAgICAgIGRhc2hib2FyZDogcGF0aC5yZXNvbHZlKCcuL2FwcC9qYXZhc2NyaXB0L2Rhc2hib2FyZCcpLFxuICAgICAgaGVscGVyczogcGF0aC5yZXNvbHZlKCcuL2FwcC9qYXZhc2NyaXB0L3NoYXJlZC9oZWxwZXJzJyksXG4gICAgICBzaGFyZWQ6IHBhdGgucmVzb2x2ZSgnLi9hcHAvamF2YXNjcmlwdC9zaGFyZWQnKSxcbiAgICAgIHN1cnZleTogcGF0aC5yZXNvbHZlKCcuL2FwcC9qYXZhc2NyaXB0L3N1cnZleScpLFxuICAgICAgd2lkZ2V0OiBwYXRoLnJlc29sdmUoJy4vYXBwL2phdmFzY3JpcHQvd2lkZ2V0JyksXG4gICAgICBhc3NldHM6IHBhdGgucmVzb2x2ZSgnLi9hcHAvamF2YXNjcmlwdC9kYXNoYm9hcmQvYXNzZXRzJyksXG4gICAgfSxcbiAgfSxcbiAgdGVzdDoge1xuICAgIGVudmlyb25tZW50OiAnanNkb20nLFxuICAgIGluY2x1ZGU6IFsnYXBwLyoqLyoue3Rlc3Qsc3BlY30uPyhjfG0pW2p0XXM/KHgpJ10sXG4gICAgY292ZXJhZ2U6IHtcbiAgICAgIHJlcG9ydGVyOiBbJ2xjb3YnLCAndGV4dCddLFxuICAgICAgaW5jbHVkZTogWydhcHAvKiovKi5qcycsICdhcHAvKiovKi52dWUnXSxcbiAgICAgIGV4Y2x1ZGU6IFtcbiAgICAgICAgJ2FwcC8qKi8qLkAoc3BlY3xzdG9yaWVzfHJvdXRlcykuanMnLFxuICAgICAgICAnKiovc3BlY3MvKiovKicsXG4gICAgICAgICcqKi9pMThuLyoqLyonLFxuICAgICAgXSxcbiAgICB9LFxuICAgIGdsb2JhbHM6IHRydWUsXG4gICAgb3V0cHV0RmlsZTogJ2NvdmVyYWdlL3NvbmFyLXJlcG9ydC54bWwnLFxuICAgIHBvb2w6ICd0aHJlYWRzJyxcbiAgICBwb29sT3B0aW9uczoge1xuICAgICAgdGhyZWFkczoge1xuICAgICAgICBzaW5nbGVUaHJlYWQ6IGZhbHNlLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHNlcnZlcjoge1xuICAgICAgZGVwczoge1xuICAgICAgICBpbmxpbmU6IFsndGlueWtleXMnLCAnQG1hdGVyaWFsL213Yy1pY29uJ10sXG4gICAgICB9LFxuICAgIH0sXG4gICAgc2V0dXBGaWxlczogWydmYWtlLWluZGV4ZWRkYi9hdXRvJywgJ3ZpdGVzdC5zZXR1cC5qcyddLFxuICAgIG1vY2tSZXNldDogdHJ1ZSxcbiAgICBjbGVhck1vY2tzOiB0cnVlLFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBb0JB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
