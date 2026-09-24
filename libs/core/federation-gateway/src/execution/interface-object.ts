import {
  type ConstDirectiveNode,
  type DocumentNode,
  type FieldDefinitionNode,
  Kind,
  type ObjectTypeDefinitionNode,
  parse,
  print,
  type StringValueNode,
  visit,
} from 'graphql';

/**
 * One `@interfaceObject` contribution, read out of a composed supergraph: a subgraph adding fields to
 * an entity INTERFACE whose implementations it has never heard of.
 *
 * Composition records it as `@join__type(graph: X, key: "…", isInterfaceObject: true)` on the
 * interface and copies the contributed fields onto every implementation with a BARE `@join__field`
 * — "no subgraph serves this directly; go through the interface". `@graphql-tools/federation` does
 * not implement any of it (no published version mentions `isInterfaceObject`): nothing fails at
 * composition, the field just has no resolver, and a non-null one takes its whole parent down.
 */
export interface InterfaceObjectMapping {
  /** The entity interface — the name that goes on the wire, e.g. `IUser`. */
  interfaceName: string;
  /** The `join__Graph` value of the contributing subgraph, e.g. `NOTIFICATIONS`. */
  graph: string;
  /** The key fields, e.g. `id`. */
  key: string;
  /** The fields the contributing subgraph adds, e.g. `notifications`. */
  fields: string[];
  /** The concrete types implementing the interface, e.g. `User`, `Author`. */
  implementations: string[];
  /** `@requires` selections by contributed field — carried across, not reimplemented. */
  requiresByField: Map<string, string>;
}

function directives(node: { directives?: readonly ConstDirectiveNode[] }) {
  return node.directives ?? [];
}

function argOf(
  directive: ConstDirectiveNode,
  name: string,
): string | undefined {
  const arg = directive.arguments?.find((a) => a.name.value === name);
  if (!arg) return undefined;
  if (arg.value.kind === Kind.STRING)
    return (arg.value as StringValueNode).value;
  if (arg.value.kind === Kind.ENUM) return arg.value.value;
  if (arg.value.kind === Kind.BOOLEAN) return String(arg.value.value);
  return undefined;
}

function interfaceObjectJoin(node: {
  directives?: readonly ConstDirectiveNode[];
}): ConstDirectiveNode | undefined {
  return directives(node).find(
    (directive) =>
      directive.name.value === 'join__type' &&
      argOf(directive, 'isInterfaceObject') === 'true',
  );
}

/**
 * `join__Graph` enum value → subgraph name. The supergraph speaks in enum values (`NOTIFICATIONS`),
 * every hook the stitcher offers speaks in names (`notifications`); `@join__graph(name:)` is the only
 * place the two meet.
 */
export function subgraphNamesByGraphEnum(
  supergraphSdl: string,
): Map<string, string> {
  const document = parse(supergraphSdl, { noLocation: true });
  const names = new Map<string, string>();

  for (const definition of document.definitions) {
    if (
      definition.kind !== Kind.ENUM_TYPE_DEFINITION ||
      definition.name.value !== 'join__Graph'
    ) {
      continue;
    }

    for (const value of definition.values ?? []) {
      const join = directives(value).find(
        (directive) => directive.name.value === 'join__graph',
      );
      const name = join && argOf(join, 'name');
      if (name) names.set(value.name.value, name);
    }
  }

  return names;
}

/** Every `@interfaceObject` contribution in a composed supergraph; empty when none is used. */
export function collectInterfaceObjects(
  supergraphSdl: string | DocumentNode,
): InterfaceObjectMapping[] {
  const document =
    typeof supergraphSdl === 'string'
      ? parse(supergraphSdl, { noLocation: true })
      : supergraphSdl;

  const mappings: InterfaceObjectMapping[] = [];

  for (const definition of document.definitions) {
    if (definition.kind !== Kind.INTERFACE_TYPE_DEFINITION) continue;

    const join = interfaceObjectJoin(definition);
    if (!join) continue;

    const graph = argOf(join, 'graph');
    const key = argOf(join, 'key');
    if (!graph || !key) continue;

    const fields = (definition.fields ?? [])
      .filter((field) =>
        directives(field).some(
          (directive) =>
            directive.name.value === 'join__field' &&
            argOf(directive, 'graph') === graph,
        ),
      )
      .map((field) => field.name.value);

    if (!fields.length) continue;

    const implementations = document.definitions
      .filter(
        (candidate): candidate is ObjectTypeDefinitionNode =>
          candidate.kind === Kind.OBJECT_TYPE_DEFINITION &&
          (candidate.interfaces ?? []).some(
            (i) => i.name.value === definition.name.value,
          ),
      )
      .map((candidate) => candidate.name.value);

    if (!implementations.length) continue;

    const requiresByField = new Map<string, string>();
    for (const field of definition.fields ?? []) {
      if (!fields.includes(field.name.value)) continue;

      const join = directives(field).find(
        (directive) =>
          directive.name.value === 'join__field' &&
          argOf(directive, 'graph') === graph,
      );
      const requires = join && argOf(join, 'requires');
      if (requires) requiresByField.set(field.name.value, requires);
    }

    mappings.push({
      interfaceName: definition.name.value,
      graph,
      key,
      fields,
      implementations,
      requiresByField,
    });
  }

  return mappings;
}

/**
 * Rewrites the supergraph so the stitcher can plan the contributed fields: every implementation
 * becomes an entity of the contributing subgraph under the same key, and its bare `@join__field`
 * names that subgraph.
 *
 * Fields the implementation already had are pinned to the graphs that owned them before the new
 * `@join__type` was added. A field with no `@join__field` means "every graph declaring the type
 * serves it", so without the pin every unmarked field would silently claim to live in the
 * contributing subgraph too — measured as `Unknown type: "Address"` when a type only one subgraph
 * knew leaked into another's schema.
 */
export function applyInterfaceObjects(
  supergraphSdl: string,
  mappings: InterfaceObjectMapping[],
): string {
  if (!mappings.length) return supergraphSdl;

  const document = parse(supergraphSdl, { noLocation: true });

  const byImplementation = new Map<string, InterfaceObjectMapping>();
  for (const mapping of mappings) {
    for (const implementation of mapping.implementations) {
      byImplementation.set(implementation, mapping);
    }
  }

  const definitions = document.definitions.map((definition) => {
    if (definition.kind !== Kind.OBJECT_TYPE_DEFINITION) return definition;

    const mapping = byImplementation.get(definition.name.value);
    if (!mapping) return definition;

    const alreadyJoined = directives(definition).some(
      (directive) =>
        directive.name.value === 'join__type' &&
        argOf(directive, 'graph') === mapping.graph,
    );

    const extraDirectives = alreadyJoined
      ? []
      : ((
          parse(
            `type _X @join__type(graph: ${mapping.graph}, key: "${mapping.key}") { _x: ID }`,
            { noLocation: true },
          ).definitions[0] as ObjectTypeDefinitionNode
        ).directives ?? []);

    const originalGraphs = directives(definition)
      .filter((directive) => directive.name.value === 'join__type')
      .map((directive) => argOf(directive, 'graph'))
      .filter((graph): graph is string => Boolean(graph));

    const joinFieldFor = (
      graph: string,
      requires?: string,
    ): ConstDirectiveNode =>
      (
        parse(
          `type _X { _x: ID @join__field(graph: ${graph}${
            requires ? `, requires: ${JSON.stringify(requires)}` : ''
          }) }`,
          { noLocation: true },
        ).definitions[0] as ObjectTypeDefinitionNode
      ).fields![0]!.directives![0] as ConstDirectiveNode;

    const fields = (definition.fields ?? []).map(
      (field): FieldDefinitionNode => {
        const joins = directives(field).filter(
          (directive) => directive.name.value === 'join__field',
        );

        if (mapping.fields.includes(field.name.value)) {
          return {
            ...field,
            directives: directives(field).map((directive) =>
              directive.name.value === 'join__field' &&
              !argOf(directive, 'graph')
                ? joinFieldFor(
                    mapping.graph,
                    mapping.requiresByField.get(field.name.value),
                  )
                : directive,
            ),
          };
        }

        if (joins.length || alreadyJoined) return field;

        return {
          ...field,
          directives: [
            ...directives(field),
            ...originalGraphs.map((graph) => joinFieldFor(graph)),
          ],
        };
      },
    );

    return {
      ...definition,
      directives: [...directives(definition), ...extraDirectives],
      fields,
    };
  });

  return print({ ...document, definitions } as DocumentNode);
}

/**
 * The type definitions the contributing subgraph must appear to have: the implementations, shaped
 * like its interface object, so the stitcher plans fetches for them. The name on the wire is fixed
 * separately, by {@link interfaceObjectKeyFn}.
 */
export function implementationTypeDefs(
  subgraphAst: DocumentNode,
  mapping: InterfaceObjectMapping,
): DocumentNode {
  const source = subgraphAst.definitions.find(
    (definition): definition is ObjectTypeDefinitionNode =>
      definition.kind === Kind.OBJECT_TYPE_DEFINITION &&
      definition.name.value === mapping.interfaceName,
  );

  if (!source) return subgraphAst;

  const existing = new Set(
    subgraphAst.definitions
      .filter(
        (definition): definition is ObjectTypeDefinitionNode =>
          definition.kind === Kind.OBJECT_TYPE_DEFINITION,
      )
      .map((definition) => definition.name.value),
  );

  const added = mapping.implementations
    .filter((implementation) => !existing.has(implementation))
    .map((implementation) => ({
      ...source,
      name: { kind: Kind.NAME as const, value: implementation },
    }));

  if (!added.length) return subgraphAst;

  return {
    ...subgraphAst,
    definitions: [...subgraphAst.definitions, ...added],
  };
}

/**
 * Rewrites an outgoing document into the subgraph's vocabulary. The planner writes the type
 * condition it planned against (`... on Author { notifications }`), and the subgraph rejects the
 * whole request with `Unknown type "Author"` — it only ever declared the interface. Apollo sends
 * `... on IUser`; so does this.
 */
export function rewriteInterfaceObjectTypeConditions(
  document: DocumentNode,
  mappings: InterfaceObjectMapping[],
): DocumentNode {
  const interfaceOf = new Map<string, string>();
  for (const mapping of mappings) {
    for (const implementation of mapping.implementations) {
      interfaceOf.set(implementation, mapping.interfaceName);
    }
  }

  if (!interfaceOf.size) return document;

  let rewrote = false;

  const rewritten = visit(document, {
    NamedType(node) {
      const interfaceName = interfaceOf.get(node.name.value);
      if (!interfaceName) return undefined;

      rewrote = true;
      return {
        ...node,
        name: { kind: Kind.NAME as const, value: interfaceName },
      };
    },
  });

  return rewrote ? rewritten : document;
}

/**
 * The representation builder: `{ __typename: 'IUser', id }`, never `{ __typename: 'Author', id }`,
 * because the contributing subgraph resolves references by the interface's name alone.
 *
 * It WRAPS the key function the library derived — which already projects nested and compound keys —
 * and changes only the `__typename`, the one thing that function cannot know.
 */
export function interfaceObjectKeyFn(
  mapping: InterfaceObjectMapping,
  derived?: (root: unknown) => unknown,
) {
  const keyProps = mapping.key
    .trim()
    .split(/\s+/)
    .filter((prop) => prop && prop !== '__typename');

  return function keyFn(root: Record<string, unknown> | null | undefined) {
    if (root == null) return null;

    if (derived) {
      const representation = derived(root) as Record<string, unknown> | null;
      if (representation == null) return representation;
      return { ...representation, __typename: mapping.interfaceName };
    }

    const representation: Record<string, unknown> = {
      __typename: mapping.interfaceName,
    };

    for (const prop of keyProps) {
      const value = root[prop];
      if (value == null) return null;
      representation[prop] = value;
    }

    return representation;
  };
}
