import { Layout } from './layout.mjs';

export class DrawioDocument {
  static LAYERS = {
    resources: 'Resources',
    within: 'Dependencies within a group',
  };
  static TEXT = '#232F3E';
  static MUTED = '#5A6C86';
  static EDGE = '#AAB7B8';
  static LINK = '#7D8998';

  #cells = [];
  #propertyLayers = new Map();

  constructor(diagram, layout) {
    this.diagram = diagram;
    this.layout = layout;
    const properties = [
      ...new Set(diagram.links.map((link) => link.property)),
    ].sort((a, b) => a.localeCompare(b));
    for (const [index, property] of properties.entries()) {
      this.#propertyLayers.set(property, `between-${index}`);
    }
  }

  static render(diagram, layout) {
    return new DrawioDocument(diagram, layout).#render();
  }

  static escape(text) {
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll('\n', '&#10;');
  }

  static style(entries) {
    return Object.entries(entries)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join(';');
  }

  #render() {
    const { stack, project } = this.diagram.stack;
    this.#cells.push('<mxCell id="0"/>');
    for (const [id, name] of Object.entries(DrawioDocument.LAYERS)) {
      this.#cells.push(`<mxCell id="${id}" value="${name}" parent="0"/>`);
    }
    for (const [property, id] of this.#propertyLayers) {
      this.#cells.push(
        `<mxCell id="${id}" value="${DrawioDocument.escape(`Between groups: ${property}`)}" parent="0"${this.diagram.overrides.hiddenProperties.has(property) ? ' visible="0"' : ''}/>`,
      );
    }
    for (const item of this.diagram.top) this.#item(item);
    for (const edge of this.diagram.edges) this.#edge(edge);
    for (const link of this.diagram.links) this.#link(link);
    const name = DrawioDocument.escape(`${project} · ${stack}`);
    return [
      '<mxfile host="stack-diagram" type="device">',
      `<diagram id="${DrawioDocument.escape(`${project}-${stack}`)}" name="${name}">`,
      `<mxGraphModel dx="${Math.ceil(this.layout.width)}" dy="${Math.ceil(this.layout.height)}" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0">`,
      '<root>',
      ...this.#cells,
      '</root>',
      '</mxGraphModel>',
      '</diagram>',
      '</mxfile>',
      '',
    ].join('\n');
  }

  #item(item) {
    if (item.kind === 'node') {
      this.#node(item);
      return;
    }
    this.#group(item);
    for (const child of item.items) this.#item(child);
  }

  #parentOf(item) {
    return item.parent ? item.parent.id : 'resources';
  }

  #relative(box, item) {
    const parent = item.parent && this.layout.groups.get(item.parent.id);
    return parent ? { ...box, x: box.x - parent.x, y: box.y - parent.y } : box;
  }

  #geometry({ x, y, width, height }) {
    return `<mxGeometry x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" as="geometry"/>`;
  }

  #object(item, label, style, geometry) {
    const tooltip = `${item.resource.type.token}\n${item.resource.urn}`;
    this.#cells.push(
      `<UserObject id="${item.id}" label="${DrawioDocument.escape(label)}" tooltip="${DrawioDocument.escape(tooltip)}">`,
      `<mxCell style="${DrawioDocument.style(style)}" vertex="1" parent="${this.#parentOf(item)}">`,
      this.#geometry(this.#relative(geometry, item)),
      '</mxCell>',
      '</UserObject>',
    );
  }

  #group(group) {
    const color = group.icon?.color ?? DrawioDocument.MUTED;
    const label = `<b>${DrawioDocument.escape(group.label)}</b>&nbsp;&nbsp;<font style="font-size:10px" color="${DrawioDocument.MUTED}">${DrawioDocument.escape(group.resource.type.token)}</font>`;
    const frame = {
      html: 1,
      whiteSpace: 'wrap',
      container: 1,
      collapsible: 0,
      recursiveResize: 0,
      pointerEvents: 0,
      fillColor: 'none',
      strokeColor: color,
      fontColor: DrawioDocument.TEXT,
      fontSize: 12,
      verticalAlign: 'top',
      align: 'left',
    };
    const style = group.icon
      ? {
          ...frame,
          shape: 'mxgraph.aws4.group',
          grIcon: `mxgraph.aws4.${group.icon.icon}`,
          grIconSize: 22,
          spacingLeft: 28,
          spacingTop: 2,
        }
      : { ...frame, dashed: 1, spacingLeft: 8 };
    this.#object(group, label, style, this.layout.groups.get(group.id));
  }

  #node(node) {
    const slot = this.layout.nodes.get(node.id);
    const { icon } = node;
    const scale = Layout.ICON / Math.max(icon.width, icon.height);
    const width = icon.service ? Layout.ICON : icon.width * scale;
    const height = icon.service ? Layout.ICON : icon.height * scale;
    const label = `<b>${DrawioDocument.escape(node.label)}</b><br><font style="font-size:9px" color="${DrawioDocument.MUTED}">${DrawioDocument.escape(Layout.subtitle(node))}</font>`;
    const shape = icon.service
      ? {
          shape: 'mxgraph.aws4.resourceIcon',
          resIcon: `mxgraph.aws4.${icon.icon}`,
          strokeColor: '#ffffff',
        }
      : { shape: `mxgraph.aws4.${icon.icon}`, strokeColor: 'none' };
    this.#object(
      node,
      label,
      {
        sketch: 0,
        outlineConnect: 0,
        html: 1,
        aspect: 'fixed',
        fillColor: icon.color,
        gradientColor: 'none',
        fontColor: DrawioDocument.TEXT,
        fontSize: 11,
        verticalLabelPosition: 'bottom',
        verticalAlign: 'top',
        align: 'center',
        ...shape,
      },
      {
        x: slot.x + (slot.width - width) / 2,
        y: slot.y + 4 + (Layout.ICON - height) / 2,
        width,
        height,
      },
    );
  }

  #edge(edge) {
    if (edge.from.parent !== edge.to.parent) return;
    this.#connector(
      `${edge.from.id}-${edge.to.id}`,
      edge.from,
      edge.to,
      '',
      DrawioDocument.#describe(edge),
      'within',
      { strokeWidth: 1, strokeColor: DrawioDocument.EDGE },
      this.layout.edges.get(edge),
    );
  }

  #link(link) {
    const route = this.layout.links.get(link);
    this.#connector(
      `${link.from.id}-${link.to.id}-${this.#propertyLayers.get(link.property)}`,
      link.from,
      link.to,
      link.property,
      link.edges.map(DrawioDocument.#describe).join('\n'),
      this.#propertyLayers.get(link.property),
      {
        strokeWidth: Math.min(1 + Math.log2(link.edges.length), 4),
        strokeColor: DrawioDocument.LINK,
        fontColor: DrawioDocument.MUTED,
        fontSize: 9,
        labelBackgroundColor: '#ffffff',
        ...(route && !route.orthogonal ? { edgeStyle: 'none' } : {}),
      },
      route?.points,
    );
  }

  static #describe(edge) {
    const through = edge.properties.size
      ? ` through ${[...edge.properties].join(', ')}`
      : '';
    return `${edge.to.resource.name} depends on ${edge.from.resource.name}${through}`;
  }

  #connector(id, from, to, label, tooltip, layer, look, points = []) {
    const waypoints = points
      .map((p) => `<mxPoint x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}"/>`)
      .join('');
    this.#cells.push(
      `<UserObject id="${id}" label="${DrawioDocument.escape(label)}" tooltip="${DrawioDocument.escape(tooltip)}">`,
      `<mxCell style="${DrawioDocument.style({
        html: 1,
        edgeStyle: 'orthogonalEdgeStyle',
        rounded: 1,
        arcSize: 10,
        endArrow: 'block',
        endFill: 1,
        endSize: 4,
        ...look,
      })}" edge="1" parent="${layer}" source="${from.id}" target="${to.id}">`,
      `<mxGeometry relative="1" as="geometry"><Array as="points">${waypoints}</Array></mxGeometry>`,
      '</mxCell>',
      '</UserObject>',
    );
  }
}

export class ViewerPage {
  static VIEWER = 'https://viewer.diagrams.net/js/viewer-static.min.js';

  static render(title, drawio) {
    const options = {
      highlight: '#8C4FFF',
      nav: true,
      responsive: true,
      'toolbar-nohide': true,
      toolbar: 'zoom layers lightbox',
      edit: '_blank',
      xml: drawio,
    };
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${DrawioDocument.escape(title)}</title>
<style>
  body { margin: 0; padding: 12px 16px; background: #ffffff; color: #232F3E; font: 14px/1.4 system-ui, sans-serif; }
  h1 { margin: 0 0 12px; font-size: 18px; font-weight: 600; }
  .mxgraph { width: 100%; }
</style>
</head>
<body>
<h1>${DrawioDocument.escape(title)}</h1>
<div class="mxgraph" data-mxgraph="${DrawioDocument.escape(JSON.stringify(options))}"></div>
<script src="${ViewerPage.VIEWER}"></script>
</body>
</html>
`;
  }
}
