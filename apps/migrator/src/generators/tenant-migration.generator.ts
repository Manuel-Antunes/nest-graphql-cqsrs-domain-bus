import type {
  EntitySchema,
  MigrationsOptions,
  NamingStrategy,
} from '@mikro-orm/core';
import { TSMigrationGenerator } from '@mikro-orm/migrations';
import type { AbstractSqlDriver } from '@mikro-orm/postgresql';
import { ROOT_TENANT_SCHEMA, SYSTEM_SCHEMA } from '@nestposts/database';

type SystemEntity = Pick<EntitySchema, 'meta'>;

const SCHEMA = '${schema}';

const literally = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class TenantMigrationGeneratorBase extends TSMigrationGenerator {
  private readonly systemEntitySchemas = new Map<string, string>();

  constructor(
    driver: AbstractSqlDriver,
    namingStrategy: NamingStrategy,
    options: MigrationsOptions,
    systemEntities: readonly SystemEntity[],
  ) {
    super(driver, namingStrategy, options);
    for (const entity of systemEntities) {
      const metadata = entity.meta;
      if (metadata?.tableName) {
        this.systemEntitySchemas.set(
          metadata.tableName,
          metadata.schema || SYSTEM_SCHEMA,
        );
      }
    }
  }

  override generateMigrationFile(
    className: string,
    diff: { up: string[]; down: string[] },
  ): string {
    const template = literally(ROOT_TENANT_SCHEMA);
    let generated = super.generateMigrationFile(className, diff) as string;

    const helperMethod = `
  private getConnectionSchema(): string {
    const em = this.getEntityManager();
    const schema = em.schema || this.config.get('schema');
    return em.getPlatform().quoteIdentifier(schema as string);
  }
`;

    generated = generated.replace(
      /(export class \w+ extends Migration \{)\n/,
      `$1\n${helperMethod}`,
    );

    generated = generated.replace(
      new RegExp(`(?<!\\$\\{schema\\}\\.)"${template}\\.([^"]+)"`, 'g'),
      `${SCHEMA}."$1"`,
    );

    generated = generated.replace(
      new RegExp(`(?<!\\$\\{schema\\}\\.)"${template}"\\."([^"]+)"`, 'g'),
      `${SCHEMA}."$1"`,
    );

    generated = generated.replace(
      new RegExp(
        `(?<!\\$\\{schema\\}\\.)\\b${template}\\.([A-Za-z0-9_]+)`,
        'g',
      ),
      `${SCHEMA}."$1"`,
    );

    generated = generated.replace(
      new RegExp(`(?<!\\$\\{schema\\}\\.)"${template}"`, 'g'),
      SCHEMA,
    );

    generated = generated.replace(/\$\{schema\}\.\$\{schema\}/g, SCHEMA);

    generated = this.qualifySystemSchemas(generated);

    generated = generated.replace(
      /(override (async )?up\(\): void \| Promise<void> \{\n)/,
      '$1    const schema = this.getConnectionSchema();\n\n',
    );

    generated = generated.replace(
      /(override (async )?down\(\): void \| Promise<void> \{\n)/,
      '$1    const schema = this.getConnectionSchema();\n',
    );

    return generated;
  }

  private qualifySystemSchemas(generated: string): string {
    let qualified = generated;
    this.systemEntitySchemas.forEach((entitySchema, tableName) => {
      const target = entitySchema || SYSTEM_SCHEMA;
      const table = literally(tableName);

      qualified = qualified.replace(
        new RegExp(`\\$\\{schema\\}\\."${table}"`, 'g'),
        `"${target}"."${tableName}"`,
      );

      qualified = qualified.replace(
        new RegExp(`\\$\\{schema\\}\\.${table}\\b`, 'g'),
        `"${target}"."${tableName}"`,
      );

      qualified = qualified.replace(
        new RegExp(`references "${table}"`, 'g'),
        `references "${target}"."${tableName}"`,
      );
    });
    return qualified;
  }
}

export type MigrationGeneratorClass = new (
  driver: AbstractSqlDriver,
  namingStrategy: NamingStrategy,
  options: MigrationsOptions,
) => TSMigrationGenerator;

export function TenantMigrationGenerator(
  systemEntities: readonly SystemEntity[],
): MigrationGeneratorClass {
  return class extends TenantMigrationGeneratorBase {
    constructor(
      driver: AbstractSqlDriver,
      namingStrategy: NamingStrategy,
      options: MigrationsOptions,
    ) {
      super(driver, namingStrategy, options, systemEntities);
    }
  };
}
