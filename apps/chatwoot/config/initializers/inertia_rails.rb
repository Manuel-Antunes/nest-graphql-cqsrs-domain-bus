# Inertia.js (inertia-rails) configuration.
# Spike: settings pages migrating off vue-router onto Inertia. See
# docs/chatwoot-inertia-migration-plan.md. SSR is intentionally off.
InertiaRails.configure do |config|
  # Asset version for Inertia's cache-busting. Use the git sha (changes per deploy)
  # rather than ViteRuby.digest — the latter does a Dir.chdir that conflicts with the
  # layout's vite_javascript_tag chdir during render ("conflicting chdir" RuntimeError).
  config.version = -> { defined?(GIT_HASH) ? GIT_HASH : nil }
  config.ssr_enabled = false
end
