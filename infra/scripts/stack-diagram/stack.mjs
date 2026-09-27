import { Graphviz } from './graphviz.mjs';

export class PulumiType {
  constructor(token) {
    const [pkg = '', module = '', name = ''] = token.split(':');
    this.token = token;
    this.package = pkg;
    this.module = module.split('/')[0];
    this.member = module;
    this.name = name;
  }

  get isAws() {
    return this.package.startsWith('aws') || this.module === 'aws';
  }

  get isStack() {
    return this.token === 'pulumi:pulumi:Stack';
  }
}

export class PulumiStack {
  static PARENT_EDGE = '#AA6639';
  static DEPENDENCY_EDGE = '#246C60';
  static URN = /^urn:pulumi:([^:]+)::([^:]+)::(.+)::([^:]+)$/;

  constructor(resources) {
    this.resources = resources;
    this.stack = resources[0].stack;
    this.project = resources[0].project;
  }

  get roots() {
    return this.resources.filter((resource) => !resource.parent);
  }

  static read(file) {
    const graph = Graphviz.read(file);
    const resources = graph.objects.map((node) =>
      PulumiStack.#resource(node.label),
    );
    const colors = new Set();
    for (const edge of graph.edges ?? []) {
      const from = resources[edge.tail];
      const to = resources[edge.head];
      colors.add(edge.color);
      if (edge.color === PulumiStack.PARENT_EDGE) {
        from.parent = to;
        to.children.push(from);
      } else if (edge.color === PulumiStack.DEPENDENCY_EDGE) {
        to.dependencies.push({
          on: from,
          properties: edge.label ? edge.label.split(', ') : [],
        });
      }
    }
    if (!colors.has(PulumiStack.PARENT_EDGE)) {
      throw new Error(
        `${file} has no parent edge in ${PulumiStack.PARENT_EDGE}: draw it without --ignore-parent-edges or --parent-edge-color`,
      );
    }
    return new PulumiStack(resources);
  }

  static #resource(urn) {
    const match = PulumiStack.URN.exec(urn);
    if (!match) {
      throw new Error(
        `"${urn}" is not a URN: draw the graph without --short-node-name`,
      );
    }
    const [, stack, project, chain, name] = match;
    return {
      urn,
      stack,
      project,
      name,
      type: new PulumiType(chain.split('$').pop()),
      parent: undefined,
      children: [],
      dependencies: [],
    };
  }
}
