/// <reference path="../../.sst/platform/config.d.ts" />

import { execSync } from 'node:child_process';

import {
  SENTRY_ORGANIZATION as ORGANIZATION,
  SENTRY_OWNER_STAGE,
  SENTRY_WEB_URL,
} from './config';
import type { AlertRecipient } from './providers/alert';
import { GlitchtipAlert } from './providers/alert';

/**
 * **The error tracker's side of the deploy: a project per application, the key its DSN comes from,
 * and the alert that says an issue happened.** Like everything under `infra/aws`, it declares its
 * resources when it is imported — `infra/aws/compute/environment.ts` imports it for the DSNs, which
 * is what orders the two.
 */

const TEAM_SLUG = 'vaz-test';

/**
 * The key every application reports with. **Named** — left to Pulumi, the name gets a random suffix
 * — because the name is how a stage that does not own the projects finds the key: GlitchTip creates
 * a default key with every project, and a key's id is a UUID nothing outside the owner's state knows.
 */
const KEY_NAME = 'nestposts';

type ProjectType = Record<
  string,
  {
    readonly app: string;
    readonly platform: 'javascript-nextjs' | 'node';
    readonly appName: string;
  }
>;

/**
 * **One project per application under `apps/`** that reports errors — slug, the application it is
 * for, GlitchTip's `platform`, and `appName`, the suffix of the logical resource names, which is the
 * identity Pulumi tracks state by and so must not change once deployed.
 */
const PROJECTS = {
  'nestposts-web': {
    app: 'web',
    platform: 'javascript-nextjs',
    appName: 'Web',
  },
  'nestposts-gateway': {
    app: 'gateway',
    platform: 'node',
    appName: 'Gateway',
  },
  'nestposts-posts-api': {
    app: 'posts-api',
    platform: 'node',
    appName: 'PostsApi',
  },
  'nestposts-tagging': {
    app: 'tagging',
    platform: 'node',
    appName: 'Tagging',
  },
  'nestposts-notificator': {
    app: 'notificator',
    platform: 'node',
    appName: 'Notificator',
  },
  'nestposts-migrator': {
    app: 'migrator',
    platform: 'node',
    appName: 'Migrator',
  },
} as const satisfies ProjectType;

type ProjectSlug = keyof typeof PROJECTS;

export type ErrorTrackedApp = (typeof PROJECTS)[ProjectSlug]['app'];

const SLUGS = Object.keys(PROJECTS) as ProjectSlug[];

/**
 * Slugs to **adopt** rather than create on this deploy, comma-separated. A project that already
 * exists under a slug declared above answers the create with a 409; listed here, Pulumi imports it
 * into the state instead. One-shot — drop the variable once adopted.
 *
 *   SENTRY_IMPORT_PROJECTS=nestposts-web npx nx run @nestposts/infra:deploy:dev
 */
const ADOPTED = new Set(
  (process.env.SENTRY_IMPORT_PROJECTS ?? '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean),
);

/**
 * Who an issue notifies: the team's members by email, always, and a Discord channel when
 * `GLITCHTIP_DISCORD_WEBHOOK_URL` names one.
 */
const recipients = (): AlertRecipient[] => [
  { recipientType: 'email', url: '' },
  ...(process.env.GLITCHTIP_DISCORD_WEBHOOK_URL
    ? [
        {
          recipientType: 'discord',
          url: process.env.GLITCHTIP_DISCORD_WEBHOOK_URL,
        },
      ]
    : []),
];

/** The commit being deployed, which is what an issue's `release` answers "since when?" with. */
const release = (): string | undefined => {
  try {
    return `nestposts@${execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()}`;
  } catch {
    return undefined;
  }
};

interface ProjectKey {
  readonly dsnPublic: $util.Output<string>;
  readonly projectId: $util.Output<number>;
}

/** The owner stage: the team, and each project with its key and its alert. */
const owned = (): Record<ProjectSlug, ProjectKey> => {
  const team = new sentry.SentryTeam(
    'SentryTeamVaz',
    { organization: ORGANIZATION, name: TEAM_SLUG, slug: TEAM_SLUG },
    { retainOnDelete: true },
  );

  return Object.fromEntries(
    SLUGS.map((slug) => {
      const { platform, appName } = PROJECTS[slug];
      const project = new sentry.SentryProject(
        `SentryProject${appName}`,
        {
          organization: ORGANIZATION,
          name: slug,
          slug,
          platform,
          teams: [team.slug],
        },
        {
          retainOnDelete: true,
          ...(ADOPTED.has(slug) ? { import: `${ORGANIZATION}/${slug}` } : {}),
        },
      );
      const key = new sentry.SentryKey(
        `SentryKey${appName}`,
        { organization: ORGANIZATION, project: project.slug, name: KEY_NAME },
        { retainOnDelete: true },
      );
      new GlitchtipAlert(
        `SentryAlert${appName}`,
        {
          organization: ORGANIZATION,
          project: project.slug,
          name: 'Errors',
          timespanMinutes: 1,
          quantity: 1,
          uptime: false,
          recipients: recipients(),
        },
        { dependsOn: [project] },
      );
      return [slug, { dsnPublic: key.dsnPublic, projectId: key.projectId }];
    }),
  ) as Record<ProjectSlug, ProjectKey>;
};

/** Any other stage: the owner's key of each project, found by its name. */
const referenced = (): Record<ProjectSlug, ProjectKey> =>
  Object.fromEntries(
    SLUGS.map((slug) => {
      const key = sentry.getSentryKeyOutput({
        organization: ORGANIZATION,
        project: slug,
        name: KEY_NAME,
      });
      return [
        slug,
        {
          dsnPublic: key.dsnPublic,
          projectId: key.projectId.apply(Number),
        },
      ];
    }),
  ) as Record<ProjectSlug, ProjectKey>;

const keys = $app.stage === SENTRY_OWNER_STAGE ? owned() : referenced();

const RELEASE = release();

const slugOf = (app: ErrorTrackedApp): ProjectSlug =>
  SLUGS.find((slug) => PROJECTS[slug].app === app) as ProjectSlug;

/**
 * **What an application needs to report its errors**: the DSN of its own project, the stage as the
 * `environment` its issues are filed under, and the commit as the `release`. Spread into the
 * application's environment — the SDK reads all three by itself.
 */
export const errorReporting = (app: ErrorTrackedApp) => ({
  SENTRY_DSN: keys[slugOf(app)].dsnPublic,
  SENTRY_ENVIRONMENT: $app.stage,
  ...(RELEASE ? { SENTRY_RELEASE: RELEASE } : {}),
});

/** Where each application's issues are, for the stack's outputs. */
export const errorTracking = {
  environment: $app.stage,
  issues: Object.fromEntries(
    SLUGS.map((slug) => [
      PROJECTS[slug].app,
      $interpolate`${SENTRY_WEB_URL}/${ORGANIZATION}/issues?project=${keys[slug].projectId}&environment=${$app.stage}`,
    ]),
  ),
};
