const { readdirSync } = require('node:fs');
const { isAbsolute, join } = require('node:path');
const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');

const WORKSPACE_ROOT = join(__dirname, '..', '..');

const WORKSPACE_SCOPE = '@nestposts/';

const TENANT_MIGRATIONS = join(
  WORKSPACE_ROOT,
  'apps',
  'migrator',
  'src',
  'migrations',
  'tenant',
);

const tenantMigrationEntryPoints = () =>
  readdirSync(TENANT_MIGRATIONS)
    .filter((file) => /^Migration.+\.ts$/.test(file))
    .map((file) => ({
      entryName: `migrations/tenant/${file.slice(0, -'.ts'.length)}`,
      entryPath: join(TENANT_MIGRATIONS, file),
    }));

const isPackageRequest = (request) =>
  Boolean(request) &&
  !request.startsWith('.') &&
  !isAbsolute(request) &&
  !request.startsWith(WORKSPACE_SCOPE);

const externalPackages = ({ request }, callback) =>
  isPackageRequest(request)
    ? callback(null, `commonjs ${request}`)
    : callback();

const nestApplication = ({
  projectRoot,
  entryPoints = [],
  assets = [],
  tenantMigrations = false,
}) => ({
  output: {
    path: join(projectRoot, 'dist'),
    clean: true,
    library: { type: 'commonjs2' },
    ...(process.env.NODE_ENV === 'production'
      ? {}
      : { devtoolModuleFilenameTemplate: '[absolute-resource-path]' }),
  },
  resolve: { conditionNames: ['@nestposts/source', '...'] },
  externals: [externalPackages],
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.build.json',
      assets,
      additionalEntryPoints: [
        ...entryPoints,
        ...(tenantMigrations ? tenantMigrationEntryPoints() : []),
      ],
      externalDependencies: 'none',
      mergeExternals: true,
      optimization: false,
      outputHashing: 'none',
      sourceMap: true,
      generatePackageJson: false,
      typeCheckOptions: false,
    }),
  ],
});

module.exports = { nestApplication, WORKSPACE_ROOT };
