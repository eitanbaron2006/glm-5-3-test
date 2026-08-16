import { Graph, GraphNode } from '../core/graph';
import { nodeDef } from '../nodes/registry';
import { Heightmap } from '../core/heightmap';
import { renderThumb } from './util';
import { showAddNodeMenu } from './editor-menu';
import {
  createNodeGroup, edgePath, inputPortPos, outputPortPos, svgEl, nodeHeight
} from './editor-render';

export interface EditorCallbacks {
  onSelectNode: (id: string | null) => void;
  onStructureChanged: () => void;
  createNodeAt: (type: string, x: number, y: number) => GraphNode | null;
  tryConnect: (fromNode: string, fromPort: string, toNode: string, toPort: string) => boolean;
  /** Fired after a node drag ends (position-only change — no rebuild needed). */
  onPositionsChanged?: () => void;
}

type DragState =
  | { type: 'node'; nodeId: string; offX: number; offY: number; moved: boolean }
  | { type: 'pan'; startX: number; startY: number; viewX: number; viewY: number }
  | null;

interface LinkDrag {
  from: 'out' | 'in';
  nodeId: string;
  portId: string;
  x: number;
  y: number;
}

export class NodeEditor {
  svg: SVGSVGElement;
  rootGroup: SVGGElement;
  edgeLayer: SVGGElement;
  nodeLayer: SVGGElement;
  tempEdge: SVGPathElement;
  view = { x: 40, y: 30, zoom: 1 };
  selectedNodeId: string | null = null;
  selectedEdgeId: string | null = null;
  results = new Map<string, Heightmap>();
  private drag: DragState = null;
  private linkDrag: LinkDrag | null = null;

  constructor(
    public container: HTMLElement,
    private graph: Graph,
    private cb: EditorCallbacks
  ) {
    container.classList.add('graph-scroll');
    this.svg = svgEl('svg', { class: 'graph-svg' });
    container.appendChild(this.svg);

    this.rootGroup = svgEl('g', {});
    this.svg.appendChild(this.rootGroup);
    this.edgeLayer = svgEl('g', {});
    this.rootGroup.appendChild(this.edgeLayer);
    this.nodeLayer = svgEl('g', {});
    this.rootGroup.appendChild(this.nodeLayer);
    this.tempEdge = svgEl('path', { class: 'temp-edge', d: '' });
    this.rootGroup.appendChild(this.tempEdge);

    this.svg.addEventListener('pointerdown', this.onPointerDown);
    this.svg.addEventListener('pointermove', this.onPointerMove);
    this.svg.addEventListener('pointerup', this.onPointerUp);
    this.svg.addEventListener('wheel', this.onWheel, { passive: false });
    this.svg.addEventListener('contextmenu', this.onContextMenu);

    container.addEventListener('dragover', e => e.preventDefault());
    container.addEventListener('drop', e => {
      e.preventDefault();
      const type = e.dataTransfer?.getData('text/tf-node');
      if (!type) return;
      const rect = this.svg.getBoundingClientRect();
      const p = this.toGraph(e.clientX - rect.left, e.clientY - rect.top);
      this.cb.createNodeAt(type, p.x - 85, p.y - 20);
    });

    this.render();
  }

  /* ---------- coordinate helpers ---------- */
  toGraph(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.view.x) / this.view.zoom, y: (sy - this.view.y) / this.view.zoom };
  }

  updateView() {
    this.rootGroup.setAttribute(
      'transform',
      `translate(${this.view.x}, ${this.view.y}) scale(${this.view.zoom})`
    );
  }

  /* ---------- rendering ---------- */
  render() {
    this.edgeLayer.textContent = '';
    this.nodeLayer.textContent = '';

    const nodes = this.graph.nodes;
    for (const edge of this.graph.edges) {
      const fromNode = nodes.get(edge.fromNode);
      const toNode = nodes.get(edge.toNode);
      if (!fromNode || !toNode) continue;
      const fromDef = nodeDef(fromNode.type);
      const toDef = nodeDef(toNode.type);
      const fi = fromDef?.outputs.findIndex(o => o.id === edge.fromPort) ?? -1;
      const ti = toDef?.inputs.findIndex(o => o.id === edge.toPort) ?? -1;
      if (fi < 0 || ti < 0) continue;
      const a = outputPortPos(fromNode, fi);
      const b = inputPortPos(toNode, ti);
      this.edgeLayer.appendChild(svgEl('path', {
        class: `edge ${this.selectedEdgeId === edge.id ? 'selected' : ''}`,
        d: edgePath(a, b),
        'data-edge': edge.id
      }));
    }

    for (const node of nodes.values()) {
      const filled = new Set<string>();
      for (const e of this.graph.edges) {
        if (e.toNode === node.id) filled.add(e.toPort);
      }
      this.nodeLayer.appendChild(
        createNodeGroup(node, filled, node.id === this.selectedNodeId, this.results.get(node.id))
      );
    }
    this.updateView();
  }

  fitView() {
    const nodes = Array.from(this.graph.nodes.values());
    const w = this.svg.clientWidth || 600;
    const h = this.svg.clientHeight || 400;
    if (!nodes.length) {
      this.view = { x: 40, y: 30, zoom: 1 };
      this.updateView();
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + 170);
      maxY = Math.max(maxY, n.y + nodeHeight(n));
    }
    const pad = 40;
    const zoom = Math.min(
      Math.max(Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxY - minY)), 0.25), 1.2
    );
    this.view.zoom = zoom;
    this.view.x = (w - (maxX - minX) * zoom) / 2 - minX * zoom;
    this.view.y = (h - (maxY - minY) * zoom) / 2 - minY * zoom;
    this.updateView();
  }

  updateThumbs(results: Map<string, Heightmap>) {
    this.results = results;
    this.nodeLayer.querySelectorAll('g[data-node]').forEach(g => {
      const id = g.getAttribute('data-node')!;
      const canvas = g.querySelector('canvas');
      const h = results.get(id);
      if (canvas && h) renderThumb(h, canvas as HTMLCanvasElement, 72, 'biome');
    });
  }

  /** Cheap restyle: sync node-disabled classes without rebuilding the SVG
   *  (called after param edits so bypass dimming appears instantly). */
  syncEnabledStates() {
    this.nodeLayer.querySelectorAll('g[data-node]').forEach(g => {
      const n = this.graph.nodes.get(g.getAttribute('data-node')!);
      g.classList.toggle('node-disabled', !!n && n.enabled === false);
    });
  }

  selectNode(id: string | null) {
    this.selectedNodeId = id;
    this.selectedEdgeId = null;
    this.render();
    this.cb.onSelectNode(id);
  }

  deleteSelection() {
    if (this.selectedEdgeId) {
      this.graph.removeEdge(this.selectedEdgeId);
      this.selectedEdgeId = null;
      this.render();
      this.cb.onStructureChanged();
    } else if (this.selectedNodeId) {
      this.graph.removeNode(this.selectedNodeId);
      this.selectedNodeId = null;
      this.render();
      this.cb.onSelectNode(null);
      this.cb.onStructureChanged();
    }
  }

  /* ---------- interactions ---------- */
  private onPointerDown = (e: PointerEvent) => {
    if (e.button === 2) return;
    const target = e.target as Element;
    const rect = this.svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // port -> start link drag
    const portEl = target.closest('.port') as HTMLElement | null;
    if (portEl) {
      this.linkDrag = {
        from: portEl.dataset.port as 'in' | 'out',
        nodeId: portEl.dataset.node!,
        portId: portEl.dataset.portId!,
        x: 0, y: 0
      };
      this.updateTempEdge(mx, my);
      e.preventDefault();
      return;
    }

    // edge -> select
    const edgeEl = target.closest('[data-edge]') as HTMLElement | null;
    if (edgeEl) {
      this.selectedEdgeId = edgeEl.dataset.edge!;
      this.selectedNodeId = null;
      this.render();
      this.cb.onSelectNode(null);
      return;
    }

    // node body -> select + start drag
    const nodeEl = target.closest('g[data-node]') as SVGElement | null;
    if (nodeEl) {
      const id = nodeEl.dataset.node!;
      const node = this.graph.nodes.get(id);
      if (!node) return;
      const p = this.toGraph(mx, my);
      this.drag = { type: 'node', nodeId: id, offX: p.x - node.x, offY: p.y - node.y, moved: false };
      if (this.selectedNodeId !== id) this.selectNode(id);
      e.preventDefault();
      return;
    }

    // background -> pan + deselect
    this.drag = { type: 'pan', startX: mx, startY: my, viewX: this.view.x, viewY: this.view.y };
    if (this.selectedNodeId || this.selectedEdgeId) {
      this.selectedNodeId = null;
      this.selectedEdgeId = null;
      this.render();
      this.cb.onSelectNode(null);
    }
  };

  private updateTempEdge(mx: number, my: number) {
    if (!this.linkDrag) return;
    const node = this.graph.nodes.get(this.linkDrag.nodeId);
    if (!node) return;
    const def = nodeDef(node.type)!;
    const gp = this.toGraph(mx, my);
    const portIdx = this.linkDrag.from === 'out'
      ? def.outputs.findIndex(o => o.id === this.linkDrag!.portId)
      : def.inputs.findIndex(o => o.id === this.linkDrag!.portId);
    if (portIdx < 0) return;
    const a = this.linkDrag.from === 'out'
      ? outputPortPos(node, portIdx)
      : inputPortPos(node, portIdx);
    const b = gp;
    const d = this.linkDrag.from === 'out' ? edgePath(a, b) : edgePath(b, a);
    this.tempEdge.setAttribute('d', d);
  }

  private onPointerMove = (e: PointerEvent) => {
    const rect = this.svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (this.linkDrag) {
      this.updateTempEdge(mx, my);
      // highlight potential drop target
      document.querySelectorAll('.port.drag-target').forEach(p => p.classList.remove('drag-target'));
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.port') as HTMLElement | null;
      if (el && el.dataset.node && el.dataset.port !== this.linkDrag.from) el.classList.add('drag-target');
      return;
    }

    if (this.drag?.type === 'node') {
      const p = this.toGraph(mx, my);
      const node = this.graph.nodes.get(this.drag.nodeId);
      if (node) {
        node.x = Math.round(p.x - this.drag.offX);
        node.y = Math.round(p.y - this.drag.offY);
        this.drag.moved = true;
        this.render();
      }
    } else if (this.drag?.type === 'pan') {
      this.view.x = this.drag.viewX + (mx - this.drag.startX);
      this.view.y = this.drag.viewY + (my - this.drag.startY);
      this.updateView();
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.linkDrag) {
      document.querySelectorAll('.port.drag-target').forEach(p => p.classList.remove('drag-target'));
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.port') as HTMLElement | null;
      const ld = this.linkDrag;
      this.linkDrag = null;
      this.tempEdge.setAttribute('d', '');
      if (el && el.dataset.node && el.dataset.portId && el.dataset.port && el.dataset.port !== ld.from) {
        let ok = false;
        if (ld.from === 'out') {
          ok = this.cb.tryConnect(ld.nodeId, ld.portId, el.dataset.node, el.dataset.portId);
        } else {
          ok = this.cb.tryConnect(el.dataset.node, el.dataset.portId, ld.nodeId, ld.portId);
        }
        if (ok) {
          this.render();
          this.cb.onStructureChanged();
        }
      }
    }
    if (this.drag?.type === 'node' && this.drag.moved) {
      // node positions changed without topology changing: history only
      this.cb.onPositionsChanged?.();
    }
    this.drag = null;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = this.svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const nz = Math.min(Math.max(this.view.zoom * factor, 0.25), 2.5);
    const k = nz / this.view.zoom;
    this.view.x = mx - (mx - this.view.x) * k;
    this.view.y = my - (my - this.view.y) * k;
    this.view.zoom = nz;
    this.updateView();
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const rect = this.svg.getBoundingClientRect();
    const p = this.toGraph(e.clientX - rect.left, e.clientY - rect.top);
    showAddNodeMenu(e.clientX, e.clientY, type => {
      this.cb.createNodeAt(type, p.x - 85, p.y - 20);
    });
  };
}

