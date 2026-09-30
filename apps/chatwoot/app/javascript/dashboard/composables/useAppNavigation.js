import { computed } from 'vue';
import { router as inertiaRouter, usePage } from '@inertiajs/vue3';
import {
  ROUTE_REGISTRY,
  resolveRegistryPath,
  isInertiaRoute,
} from '../routes/registry';

// Reverse matchers (URL path -> route name), for active-state detection + param parsing
// under Inertia where there is no vue-router `route.name`. Longest/most-specific path
// first so the correct route wins. Built once from the registry.
const REVERSE_MATCHERS = Object.entries(ROUTE_REGISTRY)
  .map(([name, { path }]) => {
    const segs = path.split('/');
    return {
      name,
      // Specificity: prefer routes with MORE static segments (a static segment must
      // out-rank a param, e.g. /contacts/active over /contacts/:contactId), then longer.
      staticCount: segs.filter(s => s && !s.startsWith(':')).length,
      length: path.length,
      // Build the pattern segment-by-segment so an optional param (`:x?`) makes its
      // WHOLE `/segment` optional (e.g. `.../articles(/:tab)` matches with or without tab).
      regex: new RegExp(
        `^${segs
          .map((seg, i) => {
            if (i === 0) return ''; // leading '' before the first slash
            const optional = seg.startsWith(':') && seg.endsWith('?');
            const body = seg.startsWith(':')
              ? '[^/]+'
              : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return optional ? `(?:/${body})?` : `/${body}`;
          })
          .join('')}/?$`
      ),
    };
  })
  .sort((a, b) => b.staticCount - a.staticCount || b.length - a.length);

function routeNameForPath(path) {
  const clean = (path || '').split('?')[0];
  return REVERSE_MATCHERS.find(m => m.regex.test(clean))?.name ?? null;
}

// Reverse-parse path params (e.g. { macroId: '3' }) from a URL against a registry
// route's path template — the Inertia equivalent of vue-router's route.params.
function paramsForPath(path, routeName) {
  const entry = ROUTE_REGISTRY[routeName];
  if (!entry) return {};

  const segs = (path || '').split('?')[0].split('/');
  const params = {};
  entry.path.split('/').forEach((tmplSeg, i) => {
    if (tmplSeg.startsWith(':') && segs[i] !== undefined) {
      const key = tmplSeg.slice(1).replace(/\?$/, '');
      params[key] = decodeURIComponent(segs[i]);
    }
  });
  return params;
}

/**
 * Inertia navigation primitive — the vue-router-free replacement the migration is built
 * on. Resolves paths + gates from the ROUTE_REGISTRY, navigates with Inertia's router,
 * and reads the current URL from usePage().
 *
 * `to` may be a path string or a route-location object ({ name, params }).
 */
export function useAppNavigation() {
  const page = usePage();

  // Most links pass a route name with only the leaf param (e.g. { name: 'macros_edit',
  // params: { macroId } }) and rely on the current account context for :accountId.
  // Inject the current account id from the URL when the target omits it.
  const withAccountParam = to => {
    if (!to || typeof to === 'string' || to.params?.accountId != null) return to;
    const match = window.location.pathname.match(/\/accounts\/(\d+)/);
    if (!match) return to;
    return { ...to, params: { accountId: match[1], ...(to.params || {}) } };
  };

  const resolvePath = to => {
    if (!to) return '/';
    if (typeof to === 'string') return to;

    const target = withAccountParam(to);
    return resolveRegistryPath(target.name, target.params) ?? '/';
  };

  const resolveMeta = to => {
    if (!to) return {};
    const name = typeof to === 'object' ? to.name : to;
    return ROUTE_REGISTRY[name]?.meta ?? {};
  };

  // Is `to` a route Inertia serves (→ SPA-style visit) vs a legacy route (→ full load)?
  // Handles BOTH a route-location object ({ name }) AND a path string (reverse-matched
  // to its route name) — conversation cards navigate with a path string.
  const isInertiaTarget = to => {
    let name = typeof to === 'object' ? to?.name : null;
    if (!name && typeof to === 'string') {
      name = routeNameForPath(resolvePath(to));
    }
    return name ? isInertiaRoute(name) : false;
  };

  const currentPath = computed(() => page.url);

  // Reverse-matched from the URL (no vue-router route.name). Used for sidebar active state.
  const currentRouteName = computed(() => routeNameForPath(page.url));

  // Reverse-parsed path params from the URL — components that read route.params
  // (e.g. MacroEditor macroId) use this.
  const currentParams = computed(() => {
    const name = currentRouteName.value;
    return name ? paramsForPath(page.url, name) : {};
  });

  const isActive = to => {
    const path = resolvePath(to);
    return path !== '/' && currentPath.value?.startsWith(path);
  };

  const visit = to => {
    const path = resolvePath(to);
    // Inertia visit for migrated routes; hard navigation for anything else (e.g. login).
    if (isInertiaTarget(to)) inertiaRouter.visit(path);
    else window.location.assign(path);
  };

  return {
    resolvePath,
    resolveMeta,
    isActive,
    isInertiaTarget,
    visit,
    currentPath,
    currentRouteName,
    currentParams,
  };
}
