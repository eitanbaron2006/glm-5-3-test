import { Graph, GraphNode } from '../core/graph';
import { nodeDef } from '../nodes/registry';
import { mulberry32 } from '../core/noise';

/** Right-hand properties panel for the selected node. */
export class PropertiesPanel {
  constructor(
    public container: HTMLElement,
    public graph: Graph,
    private onParamChanged: () => void,
    private onDelete: () => void,
    private onDuplicate: () => void
  ) {}

  show(nodeId: string | null) {
    const c = this.container;
    c.textContent = '';
    if (!nodeId) {
      const empty = document.createElement('div');
      empty.className = 'prop-empty';
      empty.innerHTML = `
        <b style="color:#c8cdd6">No node selected</b><br/><br/>
        Select a node in the graph to edit its parameters.<br/>
        Right-click the graph background to add nodes.<br/>
        Drag a port circle to connect nodes.<br/>
        Delete removes the selection.<br/>
        Ctrl+D duplicates the selected node.<br/>
        Ctrl+Z / Ctrl+Y undo &amp; redo.<br/>
        Mouse wheel zooms, drag the background to pan.
      `;
      c.appendChild(empty);
      return;
    }

    const node = this.graph.nodes.get(nodeId);
    if (!node) return;
    const def = nodeDef(node.type);
    if (!def) return;

    const title = document.createElement('div');
    title.className = 'prop-title';
    const dot = document.createElement('span');
    dot.className = 'prop-node-color';
    dot.style.background = def.color;
    title.appendChild(dot);
    const t = document.createElement('span');
    t.textContent = def.title;
    title.appendChild(t);
    c.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'prop-subtitle';
    sub.textContent = `${def.category} · ID ${node.id.slice(-6)}`;
    c.appendChild(sub);

    // GAEA-style node enable/bypass toggle
    const enableRow = document.createElement('div');
    enableRow.className = 'param-check-row';
    const enCb = document.createElement('input');
    enCb.type = 'checkbox';
    enCb.checked = node.enabled !== false;
    enCb.addEventListener('change', () => {
      node.enabled = enCb.checked;
      this.onParamChanged();
    });
    const enLabel = document.createElement('label');
    enLabel.textContent = 'Enabled (uncheck to bypass)';
    enableRow.appendChild(enCb);
    enableRow.appendChild(enLabel);
    c.appendChild(enableRow);

    if (!def.params.length) {
      const none = document.createElement('div');
      none.className = 'prop-empty';
      none.textContent = 'This node has no parameters.';
      c.appendChild(none);
    }

    for (const p of def.params) {
      if (p.type === 'select') {
        const row = document.createElement('div');
        row.className = 'param-select-row';
        const label = document.createElement('label');
        label.textContent = p.label;
        const sel = document.createElement('select');
        for (const opt of p.options ?? []) {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          o.selected = node.params[p.id] === opt.value;
          sel.appendChild(o);
        }
        sel.addEventListener('change', () => {
          node.params[p.id] = sel.value;
          this.onParamChanged();
        });
        row.appendChild(label);
        row.appendChild(sel);
        c.appendChild(row);
      } else if (p.type === 'check') {
        const row = document.createElement('div');
        row.className = 'param-check-row';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!node.params[p.id];
        cb.addEventListener('change', () => {
          node.params[p.id] = cb.checked;
          this.onParamChanged();
        });
        const label = document.createElement('label');
        label.textContent = p.label;
        row.appendChild(cb);
        row.appendChild(label);
        c.appendChild(row);
      } else if (p.type === 'seed') {
        const row = document.createElement('div');
        row.className = 'seed-row';
        const label = document.createElement('label');
        label.textContent = p.label;
        const input = document.createElement('input');
        input.type = 'number';
        input.value = String(node.params[p.id]);
        const btn = document.createElement('button');
        btn.textContent = '🎲';
        btn.title = 'Randomize';
        btn.addEventListener('click', () => {
          const v = Math.floor(mulberry32(Date.now() & 0xffff)() * 100000);
          node.params[p.id] = v;
          input.value = String(v);
          this.onParamChanged();
        });
        input.addEventListener('change', () => {
          node.params[p.id] = parseInt(input.value) || 0;
          this.onParamChanged();
        });
        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(btn);
        c.appendChild(row);
      } else {
        // slider / number
        const row = document.createElement('div');
        row.className = 'param-row';
        const label = document.createElement('label');
        label.textContent = p.label;
        const range = document.createElement('input');
        range.type = 'range';
        range.min = String(p.min ?? 0);
        range.max = String(p.max ?? 1);
        range.step = String(p.step ?? 0.01);
        range.value = String(node.params[p.id]);
        const val = document.createElement('span');
        val.className = 'pval';
        const fmt = (v: number) => (p.integer ? String(v) : v.toFixed(2));
        val.textContent = fmt(node.params[p.id]);
        range.addEventListener('input', () => {
          const v = parseFloat(range.value);
          node.params[p.id] = p.integer ? Math.round(v) : v;
          val.textContent = fmt(node.params[p.id]);
          this.onParamChanged();
        });
        row.appendChild(label);
        row.appendChild(range);
        row.appendChild(val);
        c.appendChild(row);
      }
    }

    const actions = document.createElement('div');
    actions.className = 'prop-actions';
    const dup = document.createElement('button');
    dup.textContent = 'Duplicate';
    dup.title = 'Ctrl+D';
    dup.addEventListener('click', () => this.onDuplicate());
    actions.appendChild(dup);
    const del = document.createElement('button');
    del.className = 'btn-danger';
    del.textContent = 'Delete Node';
    del.addEventListener('click', () => this.onDelete());
    actions.appendChild(del);
    c.appendChild(actions);
  }
}
