import { GraphNode, GraphEdge } from '../core/graph';
import { nodeDef } from '../nodes/registry';
import { renderThumb } from './util';
import { Heightmap } from '../core/heightmap';
import { SetMapData } from '../render/colormap';
import { SmartMapData } from '../nodes/smartcolor';

export const NODE_W = 170;
export const HEADER_H = 24;
export const PORT_START = 40;
export const PORT_GAP = 20;
export const THUMB_W = 148;
export const THUMB_H = 86;

export function nodeHeight(node: GraphNode): number {
  const def = nodeDef(node.type);
  const ports = Math.max(def?.inputs.length ?? 0, def?.outputs.length ?? 0);
  const rows = Math.max(ports, 1);
  return PORT_START + rows * PORT_GAP + THUMB_H + 10;
}

export function inputPortPos(node: GraphNode, portIndex: number): { x: number; y: number } {
  return { x: node.x, y: node.y + PORT_START + portIndex * PORT_GAP };
}

export function outputPortPos(node: GraphNode, portIndex: number): { x: number; y: number } {
  return { x: node.x + NODE_W, y: node.y + PORT_START + portIndex * PORT_GAP };
}

export function edgePath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

export const SVGNS = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K, attrs: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Build the SVG group for a graph node (header, ports, thumbnail). */
export function createNodeGroup(
  node: GraphNode,
  filledInputs: Set<string>,
  selected: boolean,
  result: Heightmap | undefined
): SVGGElement {
  const def = nodeDef(node.type)!;
  const g = svgEl('g', {
    class: `node-group ${selected ? 'node-selected' : ''} ${node.enabled === false ? 'node-disabled' : ''}`,
    transform: `translate(${node.x}, ${node.y})`,
    'data-node': node.id
  });

  const H = nodeHeight(node);

  // shadow + body
  g.appendChild(svgEl('rect', { class: 'node-shadow', width: NODE_W, height: H, x: 2, y: 3, rx: 7, opacity: 0.35 }));
  g.appendChild(svgEl('rect', { class: 'node-rect', width: NODE_W, height: H, rx: 7 }));

  // header (rounded top only)
  const header = svgEl('path', {
    class: 'node-header-rect',
    d: `M 0 7 Q 0 0 7 0 H ${NODE_W - 7} Q ${NODE_W} 0 ${NODE_W} 7 V ${HEADER_H} H 0 Z`,
    fill: def.color
  });
  g.appendChild(header);

  const title = svgEl('text', {
    class: 'node-title',
    x: 10, y: 16
  });
  title.textContent = def.title;
  g.appendChild(title);

  // input ports
  def.inputs.forEach((port, i) => {
    const y = PORT_START + i * PORT_GAP;
    const filled = filledInputs.has(port.id);
    const c = svgEl('circle', {
      class: `port ${filled ? 'filled' : ''}`,
      cx: 0, cy: y, r: 5.5,
      'data-port': 'in', 'data-port-id': port.id, 'data-node': node.id
    });
    g.appendChild(c);
    const label = svgEl('text', { class: 'port-label', x: 12, y: y + 3 });
    label.textContent = port.label;
    g.appendChild(label);
  });

  // output ports
  def.outputs.forEach((port, i) => {
    const y = PORT_START + i * PORT_GAP;
    const c = svgEl('circle', {
      class: 'port filled',
      cx: NODE_W, cy: y, r: 5.5,
      'data-port': 'out', 'data-port-id': port.id, 'data-node': node.id
    });
    g.appendChild(c);
    const label = svgEl('text', {
      class: 'port-label', x: NODE_W - 12, y: y + 3, 'text-anchor': 'end'
    });
    label.textContent = port.label;
    g.appendChild(label);
  });

  // thumbnail preview
  const fo = document.createElementNS(SVGNS, 'foreignObject');
  const thumbY = PORT_START + Math.max(def.inputs.length, def.outputs.length, 1) * PORT_GAP;
  fo.setAttribute('x', String((NODE_W - THUMB_W) / 2));
  fo.setAttribute('y', String(thumbY));
  fo.setAttribute('width', String(THUMB_W));
  fo.setAttribute('height', String(THUMB_H));
  const canvas = document.createElement('canvas');
  canvas.className = 'node-thumb';
  fo.appendChild(canvas);
  g.appendChild(fo);
  if (result) {
    const setmap = (result as any).setmap as SetMapData | undefined;
    const smartmap = (result as any).smartmap as SmartMapData | undefined;
    renderThumb(result, canvas, 72, 'biome', setmap, smartmap);
  } else {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      canvas.width = 72; canvas.height = 72;
      ctx.fillStyle = '#101216';
      ctx.fillRect(0, 0, 72, 72);
    }
  }

  return g;
}

export interface EdgeGeom {
  edge: GraphEdge;
  from: { x: number; y: number };
  to: { x: number; y: number };
}
