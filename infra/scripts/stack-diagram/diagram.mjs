import { readFileSync } from 'node:fs';

export class Overrides {
  constructor({
    aliases = {},
    types = {},
    hidden = [],
    hiddenProperties = [],
  } = {}) {
    this.aliases = aliases;
    this.types = types;
    this.hidden = hidden.map(Overrides.#pattern);
    this.hiddenProperties = new Set(hiddenProperties);
  }

  static read(file) {
    return new Overrides(JSON.parse(readFileSync(file, 'utf8')));
  }

  static #pattern(glob) {
    const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped.replaceAll('*', '.*')}$`);
  }

  hides(type) {
    return this.hidden.some((pattern) => pattern.test(type.token));
  }

  icon(type, catalog) {
    const name = this.types[type.token];
    return name ? catalog.icon(name) : undefined;
  }
}

export class Diagram {
  static UNNAMED = 'dependsOn';

  groups = [];
  nodes = [];
  edges = [];
  links = [];
  top = [];
  #nodeOf = new Map();
  #reach = new Map();

  constructor(stack, catalog, overrides, conventions) {
    this.stack = stack;
    this.catalog = catalog;
    this.overrides = overrides;
    this.conventions = conventions;
    for (const root of stack.roots) {
      const items = root.type.isStack
        ? conventions.childrenOf(root).map((child) => this.#visit(child))
        : [this.#visit(root)];
      this.top.push(...items.filter(Boolean));
    }
    this.#connect();
    this.#link();
  }

  static of(stack, catalog, overrides, conventions) {
    return new Diagram(stack, catalog, overrides, conventions);
  }

  iconOf(type) {
    if (this.overrides.hides(type)) return undefined;
    return (
      this.overrides.icon(type, this.catalog) ??
      (type.isAws ? this.catalog.resource(type) : undefined)
    );
  }

  explain() {
    const rows = new Map();
    for (const resource of this.stack.resources) {
      if (resource.type.isStack) continue;
      const token = resource.type.token;
      const row = rows.get(token) ?? {
        type: token,
        count: 0,
        shown: 0,
        component: resource.children.length > 0,
        icon: undefined,
      };
      const item = this.#itemOf(resource);
      row.count += 1;
      if (item) {
        row.shown += 1;
        row.icon = item.icon;
      }
      rows.set(token, row);
    }
    return [...rows.values()].sort((a, b) => a.type.localeCompare(b.type));
  }

  #itemOf(resource) {
    return (
      this.#nodeOf.get(resource) ??
      this.groups.find((group) => group.resource === resource)
    );
  }

  #visit(resource, parent) {
    if (this.overrides.hides(resource.type)) return undefined;
    return resource.children.length > 0
      ? this.#group(resource, parent)
      : this.#node(resource, parent);
  }

  #group(resource, parent) {
    const group = {
      kind: 'group',
      resource,
      parent,
      label: Diagram.#label(resource, parent),
    };
    group.items = this.conventions
      .childrenOf(resource)
      .map((child) => this.#visit(child, group))
      .filter(Boolean);
    if (group.items.length === 0) return undefined;
    Object.assign(group, this.#groupIcon(resource, group.items));
    group.id = `g${this.groups.length}`;
    this.groups.push(group);
    return group;
  }

  #node(resource, parent) {
    const icon = this.iconOf(resource.type);
    if (!icon) return undefined;
    const node = {
      kind: 'node',
      id: `n${this.nodes.length}`,
      resource,
      parent,
      icon,
      module: resource.type.module,
      label: Diagram.#label(resource, parent),
    };
    this.nodes.push(node);
    this.#nodeOf.set(resource, node);
    return node;
  }

  #groupIcon(resource, items) {
    const override = this.overrides.icon(resource.type, this.catalog);
    if (override) return { icon: override, module: resource.type.module };
    const wrapped = items.find((item) =>
      resource.type.name.endsWith(item.resource.type.name),
    );
    if (wrapped) return { icon: wrapped.icon, module: wrapped.module };
    const module = Diagram.#mostCommon(items.map((item) => item.module));
    return { icon: this.catalog.service(module), module };
  }

  static #mostCommon(values) {
    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts].reduce((best, entry) =>
      entry[1] > best[1] ? entry : best,
    )[0];
  }

  static #label(resource, parent) {
    const prefix = parent?.resource.name;
    return prefix &&
      resource.name.startsWith(prefix) &&
      resource.name.length > prefix.length
      ? resource.name.slice(prefix.length)
      : resource.name;
  }

  #connect() {
    const successors = new Map(this.nodes.map((node) => [node, new Map()]));
    for (const node of this.nodes) {
      for (const { on, properties, asserted } of node.resource.dependencies) {
        const from = this.#nodeOf.get(on);
        if (!from || from === node) continue;
        const targets = successors.get(from);
        const known = targets.get(node);
        targets.set(node, {
          properties: new Set([...(known?.properties ?? []), ...properties]),
          asserted: Boolean(known?.asserted || asserted),
        });
      }
    }
    for (const [from, targets] of successors) {
      for (const [to, { properties, asserted }] of targets) {
        const implied = [...targets.keys()].some(
          (other) => other !== to && this.#reachable(other, successors).has(to),
        );
        if (asserted || !implied) this.edges.push({ from, to, properties });
      }
    }
  }

  #link() {
    const links = new Map();
    for (const edge of this.edges) {
      if (edge.from.parent === edge.to.parent) continue;
      const [from, to] = Diagram.#siblings(edge.from, edge.to);
      const properties = edge.properties.size
        ? [...edge.properties]
        : [Diagram.UNNAMED];
      for (const property of properties) {
        const key = `${from.id}>${to.id}>${property}`;
        const link = links.get(key) ?? { from, to, property, edges: [] };
        link.edges.push(edge);
        links.set(key, link);
      }
    }
    this.links = [...links.values()];
  }

  static #siblings(a, b) {
    const lineage = (item) => {
      const chain = [];
      for (let current = item; current; current = current.parent) {
        chain.unshift(current);
      }
      return chain;
    };
    const left = lineage(a);
    const right = lineage(b);
    let depth = 0;
    while (left[depth] === right[depth]) depth += 1;
    return [left[depth], right[depth]];
  }

  #reachable(node, successors) {
    if (this.#reach.has(node)) return this.#reach.get(node);
    const reached = new Set();
    this.#reach.set(node, reached);
    for (const next of successors.get(node).keys()) {
      reached.add(next);
      for (const further of this.#reachable(next, successors)) {
        reached.add(further);
      }
    }
    return reached;
  }
}
