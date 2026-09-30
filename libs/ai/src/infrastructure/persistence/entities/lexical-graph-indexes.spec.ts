import type { Neo4jEntityManager } from 'mikro-orm-neo4j';
import { defineConfig, MikroORM } from 'mikro-orm-neo4j';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ThrowawayNeo4j } from '../testing/throwaway-neo4j';
import { LEXICAL_GRAPH_ENTITIES } from './index';

interface PlanNode {
  operatorType: string;
  children?: PlanNode[];
}

class QueryPlan {
  static operatorsOf(plan: PlanNode): string[] {
    return [
      String(plan.operatorType).replace(/@neo4j$/, ''),
      ...(plan.children ?? []).flatMap((child) => QueryPlan.operatorsOf(child)),
    ];
  }
}

describe('lexical graph indexes', () => {
  let neo4j: ThrowawayNeo4j;
  let orm: MikroORM;
  let em: Neo4jEntityManager;

  const planFor = async (label: string): Promise<string[]> => {
    const result = await em
      .getConnection()
      .executeRaw(
        `EXPLAIN MATCH (n:\`${label}\` { id: $id, tenant: $tenant }) RETURN n`,
        { id: 'any', tenant: 'any' },
      );
    return QueryPlan.operatorsOf(
      (result as { summary: { plan: PlanNode } }).summary.plan,
    );
  };

  beforeAll(async () => {
    neo4j = await ThrowawayNeo4j.start();
    orm = new MikroORM(
      defineConfig({
        clientUrl: neo4j.uri,
        user: ThrowawayNeo4j.USER,
        password: ThrowawayNeo4j.PASSWORD,
        dbName: ThrowawayNeo4j.DATABASE,
        entities: LEXICAL_GRAPH_ENTITIES as never,
        contextName: 'neo4j-lexical-index-test',
        allowGlobalContext: true,
        discovery: { warnWhenNoEntities: false },
      }),
    );
    em = orm.em as unknown as Neo4jEntityManager;
  }, 240_000);

  afterAll(async () => {
    await orm?.close(true);
    await neo4j?.stop();
  });

  it('derives one composite index per lexical label from the entity metadata', async () => {
    const sql = await orm.schema.getCreateSchemaSQL();

    expect(sql).toContain('FOR (n:`Chunk`) ON (n.`tenant`, n.`id`)');
    expect(sql).toContain('FOR (n:`Document`) ON (n.`tenant`, n.`id`)');
  });

  it('provisions them idempotently, tenant first', async () => {
    await orm.schema.ensureIndexes();
    await orm.schema.ensureIndexes();

    const rows = await em.run<{ label: string; properties: string[] }>(
      `SHOW INDEXES YIELD name, labelsOrTypes, properties
       WHERE labelsOrTypes IN [['Chunk'], ['Document']] AND properties = ['tenant', 'id']
       RETURN labelsOrTypes[0] AS label, properties`,
    );

    expect(rows.map((r) => r.label).sort()).toEqual(['Chunk', 'Document']);
    expect(rows.every((r) => r.properties.join() === 'tenant,id')).toBe(true);
  });

  it('makes a (tenant, id) lookup seek rather than scan, once the indexes are online', async () => {
    await orm.schema.ensureIndexes();
    await em.run('CALL db.awaitIndexes(30)');

    for (const label of ['Chunk', 'Document']) {
      const operators = await planFor(label);
      expect(operators, `${label} must seek`).toContain('NodeIndexSeek');
      expect(operators, `${label} must not scan`).not.toContain(
        'NodeByLabelScan',
      );
      expect(operators, `${label} must not scan`).not.toContain('AllNodesScan');
    }
  });
});
