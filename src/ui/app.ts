import { Graph, GraphNode } from '../core/graph';
import { GraphEngine } from '../core/engine';
import { Heightmap } from '../core/heightmap';
import { History } from '../core/history';
import { NodeEditor } from './nodeeditor';
import { PropertiesPanel } from './properties';
import { buildPalette } from './editor-menu';
import { Viewport } from '../three/viewport';
import { exportHeightmapPNG, exportHeightmapR16, downloadJSON } from './util';
import { PRESETS } from '../presets';

const LOGO = `<svg width="22" height="22" viewBox="0 0 32 32">
  <path d="M4 25 L11 11 L15.5 18 L20 7 L28 25 Z" fill="#e8963c"/>
  <path d="M4 25 L28 25" stroke="#e8963c" stroke-width="2" stroke-linecap="round"/>
</svg>`;

export class App {
  graph = new Graph();
  engine: GraphEngine;
  editor!: NodeEditor;
  props!: PropertiesPanel;
  viewport!: Viewport;
  resolution = 1024;
  private evalTimer: number | null = null;
  private lastResults = new Map<string, Heightmap>();
  private statusEls: Record<string, HTMLElement> = {};
  private fileInput!: HTMLInputElement;
  // worker-based evaluation (keeps 2K/4K/8K builds off the main thread)
  private worker: Worker | null = null;
  private evalId = 0;
  private buildStart = 0;
  private buildDone = 0;
  private buildTotal = 0;
  // GAEA-style undo/redo graph history
  private history = new History();
  private paramHistTimer: number | null = null;

  constructor(private root: HTMLElement) {
    this.engine = new GraphEngine(this.graph);

    root.innerHTML = `
      <header class="topbar">
        <div class="logo">${LOGO} TERRAIN&nbsp;FORGE <span class="version">v1.0</span></div>
        <div class="tb-group">
          <button id="btn-build" class="primary">⚡ Build</button>
          <span class="tb-label">Res</span>
          <select id="sel-res" title="Graph resolution (GAEA-style)">
            <option value="256">256</option>
            <option value="512">512</option>
            <option value="1024" selected>1024</option>
            <option value="2048">2048</option>
            <option value="4096">4096</option>
            <option value="8192">8192</option>
          </select>
        </div>
        <div class="tb-group">
          <span class="tb-label">Preset</span>
          <select id="sel-preset">${PRESETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('')}</select>
          <button id="btn-preset">Load</button>
        </div>
        <div class="tb-group">
          <button id="btn-new">New</button>
          <button id="btn-save">Save</button>
          <button id="btn-load2">Open</button>
          <button id="btn-export">Export PNG</button>
          <button id="btn-export-r16" title="16-bit RAW heightmap for game engines">Export R16</button>
        </div>
        <div class="spacer"></div>
        <div class="tb-group"><button id="btn-fit" title="Fit graph to view">⤢ Fit</button></div>
      </header>
      <div class="main">
        <aside class="palette" id="palette"></aside>
        <section class="pane">
          <div class="pane-header">Node Graph</div>
          <div class="pane-body" id="graph-body"></div>
        </section>
        <section class="pane">
          <div class="pane-header">3D Viewport</div>
          <div class="pane-body" id="viewport-body">
            <div class="viewport-overlay" id="vp-controls"></div>
          </div>
        </section>
        <aside class="properties" id="props"></aside>
      </div>
      <footer class="statusbar">
        <span class="stat">Nodes: <b id="st-nodes">0</b></span>
        <span class="stat">Edges: <b id="st-edges">0</b></span>
        <span class="stat">Res: <b id="st-res2">1024²</b></span>
        <span class="stat">Build: <b id="st-time">—</b></span>
        <div class="spacer"></div>
        <div class="build-indicator" id="st-building"><div class="spinner"></div> Building…</div>
      </footer>
      <input type="file" id="file-input" accept=".json" style="display:none"/>
    `;

    for (const id of ['st-nodes', 'st-edges', 'st-res2', 'st-time', 'st-building']) {
      this.statusEls[id] = document.getElementById(id) as HTMLElement;
    }

    buildPalette(document.getElementById('palette')!);
    this.initViewport();
    this.initEditor(this.graph);
    this.props = new PropertiesPanel(
      document.getElementById('props')!,
      this.graph,
      () => this.onParamEdited(),
      () => this.editor.deleteSelection(),
      () => this.duplicateSelected()
    );

    this.bindToolbar();
    this.bindKeys();
    this.loadPreset(0);
    this.props.show(null);
    window.addEventListener('resize', () => this.viewport.resize());
  }

  private initEditor(graph: Graph, resetHistory = true) {
    // Replace the container with a fresh clone: initEditor runs on every preset
    // load / new graph, and cloning is the only reliable way to purge event
    // listeners that previous NodeEditor instances attached to this element
    // (otherwise each drop event fires N times -> N nodes created at once).
    const old = document.getElementById('graph-body')!;
    const body = old.cloneNode(false) as HTMLElement;
    old.parentNode!.replaceChild(body, old);
    // keep the camera where the user left it across undo/redo & graph swaps
    const prevView = this.editor ? { ...this.editor.view } : null;

    this.graph = graph;
    // fresh graph loaded: restart history with this state as the base snapshot
    if (resetHistory) this.history.reset(this.graph.serialize());
    // Keep the properties panel in sync: it was constructed once with the
    // original graph, but every preset/New/Open replaces this.graph — without
    // this re-bind, node lookups silently fail and the panel shows nothing.
    if (this.props) this.props.graph = graph;
    this.engine = new GraphEngine(graph);
    this.editor = new NodeEditor(body, graph, {
      onSelectNode: id => this.props?.show(id),
      onStructureChanged: () => {
        this.history.push(this.graph.serialize());
        this.updateStatus();
        this.scheduleEval();
      },
      onPositionsChanged: () => this.history.push(this.graph.serialize()),
      createNodeAt: (type, x, y) => {
        const n = this.engine.createNode(type, x, y);
        this.history.push(this.graph.serialize());
        this.editor.render();
        // auto-select the new node so its parameters open immediately
        this.editor.selectNode(n.id);
        this.updateStatus();
        this.scheduleEval();
        return n;
      },
      tryConnect: (fn, fp, tn, tp) => this.engine.connect(fn, fp, tn, tp) !== null
    });
    // restore the camera so undo/redo & graph swaps don't jump the view
    if (prevView) {
      this.editor.view = prevView;
      this.editor.updateView();
    }
    this.updateStatus();
  }

  private initViewport() {
    const body = document.getElementById('viewport-body')!;
    this.viewport = new Viewport(body);

    const controls = document.getElementById('vp-controls')!;
    const mkBtn = (label: string, title: string, fn: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', fn);
      controls.appendChild(b);
      return b;
    };
    const biomeBtn = mkBtn('🏔 Biome', 'Biome coloring', () => {
      this.viewport.setMode('biome');
      this.rebuildViewport();
      markToggled();
    });
    const grayBtn = mkBtn('◐ Gray', 'Grayscale', () => {
      this.viewport.setMode('grayscale');
      this.rebuildViewport();
      markToggled();
    });
    const wireBtn = mkBtn('⊞ Wire', 'Wireframe', () => {
      this.viewport.setWireframe(!this.viewport.wireframe);
      wireBtn.classList.toggle('toggled', this.viewport.wireframe);
    });
    biomeBtn.classList.add('toggled');
    const markToggled = () => {
      biomeBtn.classList.toggle('toggled', this.viewport.colorMode === 'biome');
      grayBtn.classList.toggle('toggled', this.viewport.colorMode === 'grayscale');
    };

    const mkSlider = (label: string, min: number, max: number, step: number, value: number, fn: (v: number) => void) => {
      const wrap = document.createElement('label');
      wrap.style.cssText = 'display:flex;align-items:center;gap:5px;background:#1b1e24dd;padding:3px 8px;border-radius:4px;border:1px solid #2a2e36;font-size:11px;color:#7d8592';
      const span = document.createElement('span');
      span.textContent = label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value);
      input.style.width = '70px';
      input.addEventListener('input', () => fn(parseFloat(input.value)));
      wrap.appendChild(span);
      wrap.appendChild(input);
      controls.appendChild(wrap);
    };
    mkSlider('Water', 0, 0.6, 0.01, 0, v => {
      this.viewport.waterLevel = v;
      this.viewport.updateWater();
    });
    mkSlider('Height', 0.1, 4, 0.05, 1, v => {
      this.viewport.heightScale = v;
      this.rebuildViewport();
    });
  }

  private bindToolbar() {
    (document.getElementById('btn-build') as HTMLButtonElement)
      .addEventListener('click', () => this.scheduleEval(true));
    (document.getElementById('sel-res') as HTMLSelectElement)
      .addEventListener('change', e => {
        this.resolution = parseInt((e.target as HTMLSelectElement).value);
        this.scheduleEval(true);
      });
    (document.getElementById('btn-preset') as HTMLButtonElement)
      .addEventListener('click', () => {
        this.loadPreset(parseInt((document.getElementById('sel-preset') as HTMLSelectElement).value));
      });
    (document.getElementById('btn-new') as HTMLButtonElement)
      .addEventListener('click', () => {
        if (!confirm('Create a new empty graph?')) return;
        this.initEditor(new Graph());
        this.props.show(null);
        this.scheduleEval();
      });
    (document.getElementById('btn-save') as HTMLButtonElement)
      .addEventListener('click', () => {
        downloadJSON(this.graph.serialize(), 'terrain-forge.json');
      });
    this.fileInput = document.getElementById('file-input') as HTMLInputElement;
    (document.getElementById('btn-load2') as HTMLButtonElement)
      .addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', () => {
      const f = this.fileInput.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result));
          this.initEditor(Graph.deserialize(data));
          this.editor.fitView();
          this.props.show(null);
          this.scheduleEval(true);
        } catch (err) {
          alert('Invalid file: ' + err);
        }
      };
      reader.readAsText(f);
    });
    (document.getElementById('btn-export') as HTMLButtonElement)
      .addEventListener('click', () => {
        const h = this.currentOutput();
        if (h) exportHeightmapPNG(h, 'heightmap.png');
        else alert('No output available — add and connect an Output node');
      });
    (document.getElementById('btn-export-r16') as HTMLButtonElement)
      .addEventListener('click', () => {
        const h = this.currentOutput();
        if (h) exportHeightmapR16(h, 'heightmap.r16');
        else alert('No output available — add and connect an Output node');
      });
    (document.getElementById('btn-fit') as HTMLButtonElement)
      .addEventListener('click', () => this.editor.fitView());
  }

  private bindKeys() {
    window.addEventListener('keydown', e => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      // Ctrl/Cmd shortcuts: undo, redo, duplicate, save
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { this.undo(); e.preventDefault(); return; }
        if (k === 'y' || (k === 'z' && e.shiftKey)) { this.redo(); e.preventDefault(); return; }
        if (k === 'd') { this.duplicateSelected(); e.preventDefault(); return; }
        if (k === 's') {
          downloadJSON(this.graph.serialize(), 'terrain-forge.json');
          e.preventDefault();
          return;
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        this.editor.deleteSelection();
        e.preventDefault();
      }
      if (e.key === 'Escape') this.props.show(null);
      if (e.key.toLowerCase() === 'f') this.editor.fitView();
      if (e.key.toLowerCase() === 'b') this.scheduleEval(true);
    });
  }

  /* ---------- evaluation ---------- */
  scheduleEval(immediate = false) {
    if (this.evalTimer !== null) window.clearTimeout(this.evalTimer);
    const delay = immediate ? 10 : 350;
    this.evalTimer = window.setTimeout(() => this.runBuild(), delay);
  }

  runBuild() {
    this.evalTimer = null;
    this.statusEls['st-building'].classList.add('active');
    this.updateStatus();
    this.buildStart = performance.now();
    this.buildDone = 0;
    this.buildTotal = this.graph.nodes.size;
    this.lastResults = new Map();

    // a build already running is obsolete — kill it and start fresh
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    const evalId = ++this.evalId;
    try {
      const w = new Worker(new URL('../workers/eval.worker.ts', import.meta.url), { type: 'module' });
      this.worker = w;
      w.onmessage = (e: MessageEvent) => this.onWorkerMessage(e.data);
      w.onerror = (err) => {
        console.error('eval worker crashed:', err);
        this.fallbackSync(evalId);
      };
      w.postMessage({ type: 'eval', evalId, graph: this.graph.serialize(), size: this.resolution });
    } catch (err) {
      console.warn('Worker unavailable, evaluating on main thread:', err);
      this.fallbackSync(evalId);
    }
  }

  private onWorkerMessage(msg: any) {
    if (!msg || msg.evalId !== this.evalId) return; // stale build
    if (msg.type === 'node') {
      const h = new Heightmap(msg.size);
      h.data.set(msg.data);
      this.lastResults.set(msg.id, h);
      this.editor.updateThumbs(this.lastResults);
      this.buildDone++;
      this.statusEls['st-building'].innerHTML = `<div class="spinner"></div> Building ${this.buildDone}/${this.buildTotal}…`;
    } else if (msg.type === 'done') {
      this.finishBuild();
    } else if (msg.type === 'error') {
      console.error('worker evaluation failed:', msg.message);
      this.fallbackSync(msg.evalId);
    }
  }

  /** Synchronous main-thread evaluation (fallback when workers fail). */
  private fallbackSync(evalId: number) {
    if (evalId !== this.evalId) return;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    try {
      const results = this.engine.evaluate(this.resolution);
      this.lastResults = results;
      this.editor.updateThumbs(results);
    } catch (err) {
      console.error(err);
      this.statusEls['st-time'].textContent = 'Error!';
    }
    this.finishBuild();
  }

  private finishBuild() {
    const out = this.currentOutput();
    if (out) this.viewport.update(out);
    const ms = performance.now() - this.buildStart;
    this.statusEls['st-time'].textContent = `${(ms / 1000).toFixed(2)}s`;
    this.statusEls['st-building'].classList.remove('active');
    this.statusEls['st-building'].innerHTML = '<div class="spinner"></div> Building…';
  }

  /** Preferred viewport source: Output node, else selected node, else last node. */
  currentOutput(): Heightmap | undefined {
    const results = this.lastResults.size ? this.lastResults : this.graph.nodeResult ?? new Map();
    if (!results.size) return undefined;
    let outNode: string | null = null;
    for (const n of this.graph.nodes.values()) {
      if (n.type === 'output') outNode = n.id;
    }
    const pick = outNode
      ?? this.editor?.selectedNodeId
      ?? Array.from(results.keys()).pop()!;
    return results.get(pick);
  }

  rebuildViewport() {
    const h = this.currentOutput();
    if (h) this.viewport.update(h);
  }

  updateStatus() {
    this.statusEls['st-nodes'].textContent = String(this.graph.nodes.size);
    this.statusEls['st-edges'].textContent = String(this.graph.edges.length);
    this.statusEls['st-res2'].textContent = `${this.resolution}²`;
  }

  /* ---------- history / undo-redo ---------- */
  /** Param edited in the properties panel: rebuild + debounced history snapshot. */
  private onParamEdited() {
    this.editor.syncEnabledStates();
    this.scheduleEval();
    if (this.paramHistTimer !== null) window.clearTimeout(this.paramHistTimer);
    this.paramHistTimer = window.setTimeout(() => {
      this.paramHistTimer = null;
      this.history.push(this.graph.serialize());
    }, 600);
  }

  private applySnapshot(snap: any) {
    this.initEditor(Graph.deserialize(snap), false);
    this.props.show(null);
    this.scheduleEval(true);
  }

  private undo() {
    const snap = this.history.undo();
    if (snap) this.applySnapshot(snap);
  }

  private redo() {
    const snap = this.history.redo();
    if (snap) this.applySnapshot(snap);
  }

  /** Duplicate the selected node with its incoming connections (Ctrl+D). */
  duplicateSelected() {
    const srcId = this.editor?.selectedNodeId;
    if (!srcId) return;
    const src = this.graph.nodes.get(srcId);
    if (!src) return;
    const n = this.engine.createNode(src.type, src.x + 40, src.y + 60);
    Object.assign(n.params, JSON.parse(JSON.stringify(src.params)));
    n.enabled = src.enabled !== false;
    for (const e of this.graph.edges.filter(e => e.toNode === srcId)) {
      this.engine.connect(e.fromNode, e.fromPort, n.id, e.toPort);
    }
    this.editor.selectNode(n.id);
    this.history.push(this.graph.serialize());
    this.updateStatus();
    this.scheduleEval();
  }

  /* ---------- presets ---------- */
  loadPreset(index: number) {
    const preset = PRESETS[index];
    if (!preset) return;
    const g = new Graph();
    const engine = new GraphEngine(g);
    const map = new Map<string, GraphNode>();
    for (const spec of preset.nodes) {
      const n = engine.createNode(spec.type, spec.x, spec.y);
      if (spec.params) Object.assign(n.params, spec.params);
      map.set(spec.key, n);
    }
    for (const link of preset.links) {
      const from = map.get(link.from);
      const to = map.get(link.to);
      if (!from || !to) continue;
      g.addEdge({
        id: `e_${link.from}_${link.to}_${Math.random().toString(36).slice(2, 7)}`,
        fromNode: from.id, fromPort: link.fromPort ?? 'out',
        toNode: to.id, toPort: link.toPort ?? 'in'
      });
    }
    this.initEditor(g);
    this.props.show(null);
    this.editor.fitView();
    this.scheduleEval(true);
  }
}


