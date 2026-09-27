import { Graphviz } from './graphviz.mjs';

export class Layout {
  static INCH = 72;
  static MARGIN = 24;
  static GAP = 32;
  static PADDING = 16;
  static HEADER = 36;
  static ASPECT = 16 / 10;
  static ROUTES = [
    ['ortho', 4],
    ['ortho', 8],
    ['ortho', 16],
    ['ortho', 24],
    ['polyline', 0],
  ];
  static ICON = 48;
  static CHAR = 7;
  static SMALL_CHAR = 5.5;

  nodes = new Map();
  groups = new Map();
  edges = new Map();
  links = new Map();

  constructor(diagram) {
    this.diagram = diagram;
  }

  static of(diagram) {
    const layout = new Layout(diagram);
    const top = layout.#arrange(diagram.top.map((item) => layout.#block(item)));
    top.place(Layout.MARGIN, Layout.MARGIN);
    layout.width = top.width + 2 * Layout.MARGIN;
    layout.height = top.height + 2 * Layout.MARGIN;
    return layout;
  }

  static nodeSize(node) {
    const text = Math.max(
      node.label.length * Layout.CHAR,
      Layout.subtitle(node).length * Layout.SMALL_CHAR,
    );
    return {
      width: Math.max(Layout.ICON, text) + 16,
      height: Layout.ICON + 34,
    };
  }

  static subtitle(item) {
    return item.resource.type.member;
  }

  static header(group) {
    return `${group.label}  ${group.resource.type.token}`;
  }

  #block(item) {
    const block =
      item.kind === 'node'
        ? this.#nodeBlock(item)
        : item.items.every((child) => child.kind === 'node')
          ? this.#graphBlock(item)
          : this.#groupBlock(
              item,
              item.items.map((child) => this.#block(child)),
            );
    return { ...block, item };
  }

  #nodeBlock(node) {
    const size = Layout.nodeSize(node);
    return {
      ...size,
      members: new Set([node]),
      place: (x, y) => this.nodes.set(node.id, { x, y, ...size }),
    };
  }

  #groupBlock(group, blocks) {
    const inner = this.#arrange(blocks);
    const header = Layout.header(group).length * Layout.CHAR + 48;
    const width = Math.max(inner.width + 2 * Layout.PADDING, header);
    const height = inner.height + Layout.HEADER + Layout.PADDING;
    return {
      width,
      height,
      members: new Set(blocks.flatMap((block) => [...block.members])),
      place: (x, y) => {
        this.groups.set(group.id, { x, y, width, height });
        inner.place(x + Layout.PADDING, y + Layout.HEADER);
      },
    };
  }

  #graphBlock(group) {
    const members = new Set(group.items);
    const edges = this.diagram.edges.filter(
      (edge) => members.has(edge.from) && members.has(edge.to),
    );
    const graph = Graphviz.layout(
      [
        'digraph block {',
        'graph [rankdir=LR, nodesep=0.25, ranksep=0.5, splines=ortho, fontname="Helvetica", fontsize=12, labeljust=l, margin=0];',
        'node [shape=box, fixedsize=true, label=""];',
        ...Layout.#declare(group),
        ...edges.map(
          (edge) =>
            `"${edge.from.id}" -> "${edge.to.id}" [id="e${this.diagram.edges.indexOf(edge)}"];`,
        ),
        '}',
      ].join('\n'),
    );
    const [left, bottom, right, top] = graph.bb.split(',').map(Number);
    return {
      width: right - left,
      height: top - bottom,
      members,
      place: (x, y) =>
        this.#placeGraph(graph, ([gx, gy]) => ({
          x: gx - left + x,
          y: top - gy + y,
        })),
    };
  }

  #arrange(blocks) {
    const area = blocks.reduce(
      (sum, block) =>
        sum + (block.width + Layout.GAP) * (block.height + Layout.GAP),
      0,
    );
    const limit = Math.max(
      ...blocks.map((block) => block.width),
      Math.sqrt(area * Layout.ASPECT),
    );
    const ordered = this.#byConnection(blocks);
    const positions = [];
    let x = 0;
    let y = 0;
    let row = 0;
    let width = 0;
    for (const block of ordered) {
      if (x > 0 && x + block.width > limit) {
        x = 0;
        y += row + Layout.GAP;
        row = 0;
      }
      positions.push({ block, x, y });
      width = Math.max(width, x + block.width);
      x += block.width + Layout.GAP;
      row = Math.max(row, block.height);
    }
    return {
      width,
      height: y + row,
      place: (left, top) => {
        for (const position of positions) {
          position.block.place(left + position.x, top + position.y);
        }
        this.#route(positions, left, top);
      },
    };
  }

  static #declare(item) {
    if (item.kind === 'node') {
      const { width, height } = Layout.nodeSize(item);
      return [
        `"${item.id}" [width=${width / Layout.INCH}, height=${height / Layout.INCH}];`,
      ];
    }
    const label = `${' '.repeat(8)}${Layout.header(item)}`.replaceAll('"', "'");
    return [
      `subgraph "cluster_${item.id}" {`,
      `label="${label}"; margin=14;`,
      ...item.items.flatMap(Layout.#declare),
      '}',
    ];
  }

  #route(positions, left, top) {
    const items = new Set(positions.map(({ block }) => block.item));
    const links = this.diagram.links.filter(
      (link) => items.has(link.from) && items.has(link.to),
    );
    if (links.length === 0) return;
    const centers = new Map(
      positions.map(({ block, x, y }) => [
        block.item.id,
        {
          x: left + x + block.width / 2,
          y: top + y + block.height / 2,
          block,
        },
      ]),
    );
    const { splines, graph } = Graphviz.route(
      (inset) =>
        [
          'digraph route {',
          'node [shape=box, fixedsize=true, label=""];',
          ...[...centers].map(
            ([id, { x, y, block }]) =>
              `"${id}" [pos="${x},${-y}!", width=${(block.width - 2 * inset) / Layout.INCH}, height=${(block.height - 2 * inset) / Layout.INCH}];`,
          ),
          ...links.map(
            (link) =>
              `"${link.from.id}" -> "${link.to.id}" [id="l${this.diagram.links.indexOf(link)}"];`,
          ),
          '}',
        ].join('\n'),
      Layout.ROUTES,
    );
    const anchor = (graph.objects ?? []).find((object) => object.pos);
    if (!anchor) return;
    const [ax, ay] = anchor.pos.split(',').map(Number);
    const expected = centers.get(anchor.name);
    const dx = ax - expected.x;
    const dy = ay + expected.y;
    for (const drawn of graph.edges ?? []) {
      const points = drawn.pos
        .split(' ')
        .filter((token) => !/^[se],/.test(token))
        .map((token) => {
          const [x, y] = token.split(',').map(Number);
          return { x: x - dx, y: -(y - dy) };
        });
      this.links.set(this.diagram.links[Number(drawn.id.slice(1))], {
        orthogonal: splines === 'ortho',
        points: Layout.#corners(points.slice(1, -1)),
      });
    }
  }

  #byConnection(blocks) {
    const owner = new Map(
      blocks.flatMap((block) =>
        [...block.members].map((node) => [node, block]),
      ),
    );
    const weights = new Map(blocks.map((block) => [block, new Map()]));
    for (const { from, to } of this.diagram.edges) {
      const a = owner.get(from);
      const b = owner.get(to);
      if (!a || !b || a === b) continue;
      weights.get(a).set(b, (weights.get(a).get(b) ?? 0) + 1);
      weights.get(b).set(a, (weights.get(b).get(a) ?? 0) + 1);
    }
    const weight = (a, b) => weights.get(a).get(b) ?? 0;
    const total = (block) =>
      [...weights.get(block).values()].reduce((sum, w) => sum + w, 0);
    const remaining = [...blocks];
    const ordered = [];
    while (remaining.length > 0) {
      const last = ordered.at(-1);
      const score = (block) =>
        last
          ? weight(last, block) * blocks.length +
            ordered.reduce((sum, placed) => sum + weight(placed, block), 0)
          : total(block);
      const next = remaining.reduce((best, block) =>
        score(block) > score(best) ||
        (score(block) === score(best) && block.height > best.height)
          ? block
          : best,
      );
      ordered.push(next);
      remaining.splice(remaining.indexOf(next), 1);
    }
    return ordered;
  }

  #placeGraph(graph, at) {
    for (const object of graph.objects ?? []) {
      if (object.name.startsWith('cluster_')) {
        const [x1, y1, x2, y2] = object.bb.split(',').map(Number);
        this.groups.set(object.name.replace('cluster_', ''), {
          ...at([x1, y2]),
          width: x2 - x1,
          height: y2 - y1,
        });
      } else if (object.pos) {
        const center = at(object.pos.split(',').map(Number));
        const width = object.width * Layout.INCH;
        const height = object.height * Layout.INCH;
        this.nodes.set(object.name, {
          x: center.x - width / 2,
          y: center.y - height / 2,
          width,
          height,
        });
      }
    }
    for (const drawn of graph.edges ?? []) {
      const points = drawn.pos
        .split(' ')
        .filter((token) => !/^[se],/.test(token))
        .map((token) => at(token.split(',').map(Number)));
      this.edges.set(
        this.diagram.edges[Number(drawn.id.slice(1))],
        Layout.#corners(points.slice(1, -1)),
      );
    }
  }

  static #corners(points) {
    return points.filter(
      (point, index) =>
        index === 0 ||
        point.x !== points[index - 1].x ||
        point.y !== points[index - 1].y,
    );
  }
}
