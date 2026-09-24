/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../../.sst/platform/config.d.ts" />

export type DeepOutput<T> = T extends object
  ? { [K in keyof T]: DeepOutput<T[K]> } | $util.Output<T>
  : T | $util.Output<T>;

/**
 * Reads a store snapshot out of `envVar`, or an empty store when it is unset.
 *
 * Unset simply means no snapshot has been taken yet — {@link
 * CachePermanentStore.hydrate} then leaves whatever the caller already seeded
 * in place. What a snapshot adds is the one thing the repo cannot know on its
 * own: the ids a deploy of the cache stage produced.
 *
 * Malformed JSON is not treated as "no snapshot": swallowing it would leave the
 * store silently empty and surface later as a `.get(name, undefined)` deep
 * inside a provider.
 *
 * Produced by `tools/scripts/snapshot-shared-store.mjs` (`pnpm aws:snapshot`,
 * `pnpm sentry:snapshot`), which projects the store out of `.sst/outputs.json`.
 */
export function loadSnapshot(envVar: string): Record<string, unknown> {
  const raw = process.env[envVar];
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${envVar} is set but is not valid JSON (${(error as Error).message}). Regenerate it from the cache stage's deploy outputs, or unset it to fall back to the seeded ids.`,
    );
  }
}

export class CachePermanentStore {
  public store: {
    // biome-ignore lint/suspicious/noExplicitAny: allow any for strore elements
    [key: string]: any;
  };

  constructor(
    public cacheStage: string,
    public permanentStages: string[] = [this.cacheStage],
  ) {
    // A plain object, not a Map: every read/write here goes through index
    // access, `hydrate` walks it with `Object.entries`, and it is returned as
    // a stack output — none of which a Map answers to.
    this.store = {};
  }

  get isPermanentStage() {
    return this.permanentStages.includes($app.stage);
  }

  /** Whether an id for `name` is known, i.e. the resource can be referenced. */
  has(name: string) {
    return this.store[name] !== undefined && this.store[name] !== '';
  }

  /**
   * Stops a stage that only REFERENCES a resource from reaching `get` with an
   * `undefined` id.
   *
   * That call fails either way, but deep inside a provider (or, for a component
   * that reads the id off an object, as a bare `TypeError`) and with nothing
   * pointing at the actual cause: the resource has not been created on
   * {@link cacheStage} yet, or that deploy's snapshot never reached this stage's
   * environment.
   */
  protected assertCached(name: string) {
    if (this.has(name)) return;

    throw new Error(
      `[${this.constructor.name}] no cached id for "${name}". It has to be created on the "${this.cacheStage}" stage first, and that deploy's snapshot hydrated into the store.`,
    );
  }

  /**
   * Seeds the store with ids captured from a previous {@link cacheStage} deploy.
   *
   * This is what makes a non-permanent stage work at all: without it,
   * {@link cache} reaches a store that is still empty and calls
   * `Constructor.get(name, undefined)`. The ids are only known after the cache
   * stage has run, so they have to travel — as a snapshot of that deploy's
   * outputs (`.sst/outputs.json`), or from anywhere else the caller can derive
   * them.
   *
   * Later calls win, so hydrate cheapest-source-first: a derivable seed, then
   * the recorded snapshot on top. Blank entries never overwrite a known id.
   */
  hydrate(snapshot?: Record<string, unknown> | null) {
    for (const [name, id] of Object.entries(snapshot ?? {})) {
      if (id === undefined || id === null || id === '') continue;
      this.store[name] = id;
    }
    return this;
  }

  // biome-ignore lint/suspicious/noExplicitAny: allow any for the constructor type, which is a generic class
  cache<T, ARGS extends any[], GET extends (...args: any[]) => T>(
    // biome-ignore lint/suspicious/noShadowRestrictedNames: allow receiving constructor as a in parameter
    constructor: (new (name: string, ...args: ARGS) => T) & { get: GET },
    name: string,
    outputGenerator: (T: T) => DeepOutput<Parameters<GET>[1]>,
    ...args: ARGS
  ): T {
    let instance: T;
    if (!this.isPermanentStage) {
      this.assertCached(name);
      const [_, ...rest] = args;
      instance = constructor.get(name, this.store[name], ...rest);
    } else {
      instance = new constructor(name, ...args);
    }
    if (this.cacheStage === $app.stage) {
      this.store[name] = outputGenerator(instance);
    }
    return instance;
  }
}

type PulumiResourceClass<T, ARGS, STATE> = (new (
  name: string,
  args: ARGS,
  opts?: $util.CustomResourceOptions,
) => T) & {
  get(
    name: string,
    id: $util.Input<$util.ID>,
    state?: STATE,
    opts?: $util.CustomResourceOptions,
  ): T;
};

/**
 * Same idea as {@link CachePermanentStore}, for raw Pulumi resources instead of
 * SST components.
 *
 * The base class assumes the SST shape — `new C(name, args)` and
 * `C.get(name, id)` — and forwards every constructor argument past the first
 * into `get`. A Pulumi resource is `new C(name, args, opts)` and
 * `C.get(name, id, state?, opts?)`, so that forwarding would land `opts` in the
 * `state` slot. It also frequently needs `state` to resolve an id at all: the
 * Sentry provider answers `SentryKey.get(name, '<uuid>')` with "resource does
 * not exist" until it is told the organization and project.
 */
export class PulumiCachePermanentStore extends CachePermanentStore {
  /**
   * Creates the resource on a permanent stage, references it everywhere else.
   *
   * `idGenerator` must return the id `get` expects — usually not the resource's
   * own `id`, since providers often want it qualified (`<org>/<slug>` for a
   * Sentry project). Throws on a non-permanent stage when the id is unknown:
   * that means the resource has not been created on {@link cacheStage} yet, and
   * referencing it would fail deeper down with a far worse message.
   */
  cacheResource<T, ARGS, STATE>(
    resource: PulumiResourceClass<T, ARGS, STATE>,
    name: string,
    idGenerator: (instance: T) => DeepOutput<string>,
    args: ARGS,
    opts?: $util.CustomResourceOptions,
    /** Extra context the provider needs to resolve the id on the `get` path. */
    getState?: STATE,
  ): T {
    let instance: T;
    if (this.isPermanentStage) {
      instance = new resource(name, args, opts);
    } else {
      this.assertCached(name);
      // Deliberately no `opts`: import/dependsOn/retainOnDelete describe how to
      // MANAGE a resource, and this branch only reads one.
      instance = resource.get(name, this.store[name], getState);
    }
    if (this.cacheStage === $app.stage) {
      this.store[name] = idGenerator(instance);
    }
    return instance;
  }
}
