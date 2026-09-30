import {
  type ConstDirectiveNode,
  type DocumentNode,
  type FieldDefinitionNode,
  type InterfaceTypeDefinitionNode,
  Kind,
  type ObjectTypeDefinitionNode,
  parse,
  print,
  type StringValueNode,
  visit,
} from 'graphql';

export interface InterfaceObjectMapping {
  interfaceName: string;
  graph: string;
  key: string;
  fields: string[];
  implementations: string[];
  requiresByField: Map<string, string>;
}

type Directed = { directives?: readonly ConstDirectiveNode[] };

export class InterfaceObjects {
  static collect(
    supergraphSdl: string | DocumentNode,
  ): InterfaceObjectMapping[] {
    const document =
      typeof supergraphSdl === 'string'
        ? parse(supergraphSdl, { noLocation: true })
        : supergraphSdl;

    return document.definitions.flatMap((definition) =>
      definition.kind === Kind.INTERFACE_TYPE_DEFINITION
        ? InterfaceObjects.interfaceObjectJoins(definition)
            .map((join) =>
              InterfaceObjects.mappingOf(document, definition, join),
            )
            .filter((mapping): mapping is InterfaceObjectMapping =>
              Boolean(mapping),
            )
        : [],
    );
  }

  private static mappingOf(
    document: DocumentNode,
    definition: InterfaceTypeDefinitionNode,
    join: ConstDirectiveNode,
  ): InterfaceObjectMapping | undefined {
    const graph = InterfaceObjects.argOf(join, 'graph');
    const key = InterfaceObjects.argOf(join, 'key');
    if (!graph || !key) return undefined;

    const fields = (definition.fields ?? [])
      .filter((field) =>
        InterfaceObjects.directives(field).some(
          (directive) =>
            directive.name.value === 'join__field' &&
            InterfaceObjects.argOf(directive, 'graph') === graph,
        ),
      )
      .map((field) => field.name.value);

    if (!fields.length) return undefined;

    const implementations = document.definitions
      .filter(
        (candidate): candidate is ObjectTypeDefinitionNode =>
          candidate.kind === Kind.OBJECT_TYPE_DEFINITION &&
          (candidate.interfaces ?? []).some(
            (i) => i.name.value === definition.name.value,
          ),
      )
      .map((candidate) => candidate.name.value);

    if (!implementations.length) return undefined;

    const requiresByField = new Map<string, string>();
    for (const field of definition.fields ?? []) {
      if (!fields.includes(field.name.value)) continue;

      const fieldJoin = InterfaceObjects.directives(field).find(
        (directive) =>
          directive.name.value === 'join__field' &&
          InterfaceObjects.argOf(directive, 'graph') === graph,
      );
      const requires =
        fieldJoin && InterfaceObjects.argOf(fieldJoin, 'requires');
      if (requires) requiresByField.set(field.name.value, requires);
    }

    return {
      interfaceName: definition.name.value,
      graph,
      key,
      fields,
      implementations,
      requiresByField,
    };
  }

  static apply(
    supergraphSdl: string,
    mappings: InterfaceObjectMapping[],
  ): string {
    return mappings.reduce(
      (sdl, mapping) => InterfaceObjects.applyOne(sdl, mapping),
      supergraphSdl,
    );
  }

  private static applyOne(
    supergraphSdl: string,
    mapping: InterfaceObjectMapping,
  ): string {
    const document = parse(supergraphSdl, { noLocation: true });

    const definitions = document.definitions.map((definition) => {
      if (
        definition.kind !== Kind.OBJECT_TYPE_DEFINITION ||
        !mapping.implementations.includes(definition.name.value)
      ) {
        return definition;
      }

      const alreadyJoined = InterfaceObjects.directives(definition).some(
        (directive) =>
          directive.name.value === 'join__type' &&
          InterfaceObjects.argOf(directive, 'graph') === mapping.graph,
      );

      const extraDirectives = alreadyJoined
        ? []
        : ((
            parse(
              `type _X @join__type(graph: ${mapping.graph}, key: "${mapping.key}") { _x: ID }`,
              { noLocation: true },
            ).definitions[0] as ObjectTypeDefinitionNode
          ).directives ?? []);

      const originalGraphs = InterfaceObjects.directives(definition)
        .filter((directive) => directive.name.value === 'join__type')
        .map((directive) => InterfaceObjects.argOf(directive, 'graph'))
        .filter((graph): graph is string => Boolean(graph));

      const fields = (definition.fields ?? []).map(
        (field): FieldDefinitionNode => {
          const joins = InterfaceObjects.directives(field).filter(
            (directive) => directive.name.value === 'join__field',
          );

          if (mapping.fields.includes(field.name.value)) {
            return {
              ...field,
              directives: InterfaceObjects.directives(field).map((directive) =>
                directive.name.value === 'join__field' &&
                !InterfaceObjects.argOf(directive, 'graph')
                  ? InterfaceObjects.joinFieldFor(
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
              ...InterfaceObjects.directives(field),
              ...originalGraphs.map((graph) =>
                InterfaceObjects.joinFieldFor(graph),
              ),
            ],
          };
        },
      );

      return {
        ...definition,
        directives: [
          ...InterfaceObjects.directives(definition),
          ...extraDirectives,
        ],
        fields,
      };
    });

    return print({ ...document, definitions } as DocumentNode);
  }

  static implementationTypeDefs(
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

  static rewriteTypeConditions(
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

  static keyFn(
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

  private static directives(node: Directed): readonly ConstDirectiveNode[] {
    return node.directives ?? [];
  }

  private static argOf(
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

  private static interfaceObjectJoins(
    node: Directed,
  ): readonly ConstDirectiveNode[] {
    return InterfaceObjects.directives(node).filter(
      (directive) =>
        directive.name.value === 'join__type' &&
        InterfaceObjects.argOf(directive, 'isInterfaceObject') === 'true',
    );
  }

  private static joinFieldFor(
    graph: string,
    requires?: string,
  ): ConstDirectiveNode {
    return (
      parse(
        `type _X { _x: ID @join__field(graph: ${graph}${
          requires ? `, requires: ${JSON.stringify(requires)}` : ''
        }) }`,
        { noLocation: true },
      ).definitions[0] as ObjectTypeDefinitionNode
    ).fields?.[0]?.directives?.[0] as ConstDirectiveNode;
  }
}
