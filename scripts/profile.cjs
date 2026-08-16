"use strict";

// src/core/graph.ts
var Graph = class _Graph {
  nodes = /* @__PURE__ */ new Map();
  edges = [];
  version = 0;
  addNode(node2) {
    this.nodes.set(node2.id, node2);
    this.version++;
  }
  removeNode(id) {
    this.nodes.delete(id);
    this.edges = this.edges.filter((e) => e.fromNode !== id && e.toNode !== id);
    this.version++;
  }
  addEdge(edge) {
    if (edge.fromNode === edge.toNode) return false;
    if (this.wouldCreateCycle(edge.fromNode, edge.toNode)) return false;
    this.edges = this.edges.filter(
      (e) => !(e.toNode === edge.toNode && e.toPort === edge.toPort)
    );
    this.edges.push(edge);
    this.version++;
    return true;
  }
  removeEdge(id) {
    this.edges = this.edges.filter((e) => e.id !== id);
    this.version++;
  }
  wouldCreateCycle(from, to) {
    const seen = /* @__PURE__ */ new Set();
    const stack = [to];
    while (stack.length) {
      const n = stack.pop();
      if (n === from) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const e of this.edges) {
        if (e.fromNode === n) stack.push(e.toNode);
      }
    }
    return false;
  }
  /** Input heightmaps feeding a given node. */
  inputsOf(nodeId) {
    const result = {};
    for (const e of this.edges) {
      if (e.toNode === nodeId) result[e.toPort] = this.nodeResult?.get(e.fromNode);
    }
    return result;
  }
  nodeResult = null;
  /** Topological order of nodes reachable into `roots` (or all nodes if roots omitted). */
  topoOrder(roots) {
    const order = [];
    const state = /* @__PURE__ */ new Map();
    const visit = (id) => {
      const st = state.get(id);
      if (st === 1 || st === 2) return;
      state.set(id, 1);
      for (const e of this.edges) {
        if (e.toNode === id) visit(e.fromNode);
      }
      state.set(id, 2);
      order.push(id);
    };
    if (roots && roots.length) {
      for (const r of roots) {
        if (this.nodes.has(r)) visit(r);
      }
    } else {
      for (const id of this.nodes.keys()) visit(id);
    }
    return order;
  }
  serialize() {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: this.edges
    };
  }
  static deserialize(data) {
    const g2 = new _Graph();
    for (const n of data.nodes) g2.addNode({ ...n });
    g2.edges = [];
    for (const e of data.edges) g2.edges.push({ ...e });
    return g2;
  }
};

// src/core/heightmap.ts
var Heightmap = class _Heightmap {
  size;
  data;
  constructor(size) {
    this.size = size;
    this.data = new Float32Array(size * size);
  }
  get(x, y) {
    return this.data[y * this.size + x];
  }
  set(x, y, v) {
    this.data[y * this.size + x] = v;
  }
  /** Bilinear sample in normalized [0,1] coordinates. */
  sample(u, v) {
    const s = this.size;
    const fx = Math.min(Math.max(u, 0), 1) * (s - 1);
    const fy = Math.min(Math.max(v, 0), 1) * (s - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, s - 1), y1 = Math.min(y0 + 1, s - 1);
    const tx = fx - x0, ty = fy - y0;
    const a = this.data[y0 * s + x0], b = this.data[y0 * s + x1];
    const c = this.data[y1 * s + x0], d = this.data[y1 * s + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  min() {
    let m2 = Infinity;
    for (let i = 0; i < this.data.length; i++) if (this.data[i] < m2) m2 = this.data[i];
    return m2;
  }
  max() {
    let m2 = -Infinity;
    for (let i = 0; i < this.data.length; i++) if (this.data[i] > m2) m2 = this.data[i];
    return m2;
  }
  clone() {
    const h2 = new _Heightmap(this.size);
    h2.data.set(this.data);
    return h2;
  }
  /** Normalize to full [0,1] range (safely, if range is degenerate). */
  normalize() {
    const mn = this.min(), mx = this.max();
    const r = mx - mn;
    if (r < 1e-12) {
      this.data.fill(0);
      return this;
    }
    const inv = 1 / r;
    for (let i = 0; i < this.data.length; i++) this.data[i] = (this.data[i] - mn) * inv;
    return this;
  }
  fill(v) {
    this.data.fill(v);
    return this;
  }
};

// src/nodes/generators.ts
var GEN = "#e8963c";
function makeSize(size) {
  return Math.max(16, Math.min(8192, Math.round(size)));
}
var GradientNode = {
  type: "gradient",
  title: "Gradient",
  category: "Generators",
  color: GEN,
  inputs: [],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "angle", label: "Angle", type: "slider", min: 0, max: 360, step: 1, default: 0 },
    { id: "start", label: "Start Value", type: "slider", min: 0, max: 1, step: 0.01, default: 0 },
    { id: "end", label: "End Value", type: "slider", min: 0, max: 1, step: 0.01, default: 1 }
  ],
  compute(_inputs, p2, ctx) {
    const s = makeSize(ctx.size);
    const h2 = new Heightmap(s);
    const rad = p2.angle * Math.PI / 180;
    const dx = Math.sin(rad), dy = -Math.cos(rad);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1) * 2 - 1;
        const v = y / (s - 1) * 2 - 1;
        const t = (u * dx + v * dy) / 2 + 0.5;
        h2.set(x, y, p2.start + (p2.end - p2.start) * Math.min(Math.max(t, 0), 1));
      }
    }
    return h2;
  }
};
var RadialGradientNode = {
  type: "radial",
  title: "Radial Gradient",
  category: "Generators",
  color: GEN,
  inputs: [],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "falloff", label: "Falloff", type: "slider", min: 0.1, max: 4, step: 0.05, default: 1.6 },
    { id: "peak", label: "Peak", type: "slider", min: 0, max: 1, step: 0.01, default: 1 }
  ],
  compute(_inputs, p2, ctx) {
    const s = makeSize(ctx.size);
    const h2 = new Heightmap(s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1) * 2 - 1;
        const v = y / (s - 1) * 2 - 1;
        const d = Math.sqrt(u * u + v * v) / Math.SQRT2;
        h2.set(x, y, Math.max(0, p2.peak * (1 - Math.pow(d, p2.falloff))));
      }
    }
    return h2;
  }
};
var ConstantNode = {
  type: "constant",
  title: "Constant",
  category: "Generators",
  color: GEN,
  inputs: [],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "value", label: "Value", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 }
  ],
  compute(_inputs, p2, ctx) {
    const h2 = new Heightmap(makeSize(ctx.size));
    h2.fill(p2.value);
    return h2;
  }
};
function boxBlur(src, radius) {
  const s = src.size;
  const tmp = new Float32Array(s * s);
  const out2 = new Heightmap(s);
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return src.clone();
  for (let y = 0; y < s; y++) {
    let acc = 0;
    const row = y * s;
    for (let x = -r; x <= r; x++) acc += src.data[row + Math.min(s - 1, Math.max(0, x))];
    const w = 2 * r + 1;
    for (let x = 0; x < s; x++) {
      tmp[row + x] = acc / w;
      const add = src.data[row + Math.min(s - 1, x + r + 1)];
      const sub = src.data[row + Math.max(0, x - r)];
      acc += add - sub;
    }
  }
  for (let x = 0; x < s; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(s - 1, Math.max(0, y)) * s + x];
    const w = 2 * r + 1;
    for (let y = 0; y < s; y++) {
      out2.data[y * s + x] = acc / w;
      const add = tmp[Math.min(s - 1, y + r + 1) * s + x];
      const sub = tmp[Math.max(0, y - r) * s + x];
      acc += add - sub;
    }
  }
  return out2;
}

// src/core/noise.ts
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var GRAD2 = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];
var PerlinNoise = class {
  perm;
  constructor(seed = 1337) {
    const rand = mulberry32(seed);
    this.perm = new Uint8Array(512);
    const p2 = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p2[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p2[i];
      p2[i] = p2[j];
      p2[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p2[i & 255];
  }
  grad(hash, x, y) {
    const g2 = GRAD2[hash & 7];
    return g2[0] * x + g2[1] * y;
  }
  noise(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const u = fade(xf), v = fade(yf);
    const p2 = this.perm;
    const aa = p2[p2[X] + Y], ab = p2[p2[X] + Y + 1];
    const ba = p2[p2[X + 1] + Y], bb = p2[p2[X + 1] + Y + 1];
    const x1 = this.grad(aa, xf, yf) + u * (this.grad(ba, xf - 1, yf) - this.grad(aa, xf, yf));
    const x2 = this.grad(ab, xf, yf - 1) + u * (this.grad(bb, xf - 1, yf - 1) - this.grad(ab, xf, yf - 1));
    return x1 + v * (x2 - x1);
  }
};
var FBM = class {
  constructor(seed = 1337, octaves = 6, lacunarity = 2, gain = 0.5, type = "perlin") {
    this.seed = seed;
    this.octaves = octaves;
    this.lacunarity = lacunarity;
    this.gain = gain;
    this.type = type;
    this.perlin = new PerlinNoise(seed);
  }
  perlin;
  sample(x, y) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    let prev = 1;
    for (let o = 0; o < this.octaves; o++) {
      let n = this.perlin.noise(x * freq, y * freq);
      switch (this.type) {
        case "billow":
          n = Math.abs(n) * 2 - 1;
          break;
        case "ridged":
          n = 1 - Math.abs(n);
          n *= n;
          break;
        case "wire":
          n = Math.abs(Math.abs(n) * 2 - 1);
          n = 1 - n * n;
          break;
        case "classicfbm":
          n = n * 0.5 + 0.5;
          break;
      }
      sum += n * amp * prev;
      norm += amp * prev;
      prev = Math.max(n, 0.35);
      amp *= this.gain;
      freq *= this.lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  }
};
function voronoi(u, v, frequency, seed, feature) {
  const px = u * frequency, py = v * frequency;
  const gx = Math.floor(px), gy = Math.floor(py);
  let f1 = Infinity, f2 = Infinity;
  let cellHash = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = gx + ox, cy = gy + oy;
      const h2 = cx * 374761393 + cy * 668265263 + seed * 2246822519 >>> 0;
      const jx = (h2 & 65535) / 65535 * 0.8 + 0.1;
      const jy = (h2 >>> 8 & 65535) / 65535 * 0.8 + 0.1;
      const dx = cx + jx - px, dy = cy + jy - py;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        cellHash = h2;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  switch (feature) {
    case "f1":
      return Math.min(f1, 1);
    case "f2":
      return Math.min(f2, 1);
    case "f2minusf1":
      return Math.min(f2 - f1, 1);
    case "cellular":
      return (cellHash >>> 16 & 255) / 255;
  }
}

// src/nodes/noise-nodes.ts
var GEN2 = "#e8963c";
var NoiseNode = {
  type: "noise",
  title: "Fractal Noise",
  category: "Generators",
  color: GEN2,
  inputs: [],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "seed", label: "Seed", type: "seed", default: 1337 },
    {
      id: "type",
      label: "Type",
      type: "select",
      default: "perlin",
      options: [
        { value: "perlin", label: "Perlin" },
        { value: "billow", label: "Billow" },
        { value: "ridged", label: "Ridged" },
        { value: "wire", label: "Wire (Sharp)" },
        { value: "classicfbm", label: "Classic FBM" }
      ]
    },
    { id: "scale", label: "Feature Scale", type: "slider", min: 0.5, max: 24, step: 0.1, default: 3 },
    { id: "octaves", label: "Octaves", type: "slider", min: 1, max: 12, step: 1, default: 8, integer: true },
    { id: "lacunarity", label: "Lacunarity", type: "slider", min: 1.5, max: 3.5, step: 0.05, default: 2 },
    { id: "gain", label: "Roughness", type: "slider", min: 0.2, max: 0.75, step: 0.01, default: 0.5 },
    { id: "warp", label: "Domain Warp", type: "slider", min: 0, max: 1.5, step: 0.02, default: 0.35 },
    { id: "warpScale", label: "Warp Scale", type: "slider", min: 0.5, max: 12, step: 0.05, default: 2 }
  ],
  compute(_inputs, p2, ctx) {
    const s = makeSize(ctx.size);
    const h2 = new Heightmap(s);
    const fbm = new FBM(p2.seed, p2.octaves, p2.lacunarity, p2.gain, p2.type);
    const warpFBM = p2.warp > 1e-3 ? new FBM(p2.seed + 999, p2.octaves, p2.lacunarity, p2.gain, "perlin") : null;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1), v = y / (s - 1);
        let nx = u * p2.scale, ny = v * p2.scale;
        if (warpFBM) {
          const wx = warpFBM.sample(nx * p2.warpScale + 31.4, ny * p2.warpScale);
          const wy = warpFBM.sample(nx * p2.warpScale - 47.2, ny * p2.warpScale + 12.9);
          nx += wx * p2.warp;
          ny += wy * p2.warp;
        }
        h2.set(x, y, fbm.sample(nx, ny));
      }
    }
    return h2.normalize();
  }
};
var VoronoiNode = {
  type: "voronoi",
  title: "Voronoi",
  category: "Generators",
  color: GEN2,
  inputs: [],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "seed", label: "Seed", type: "seed", default: 42 },
    {
      id: "feature",
      label: "Feature",
      type: "select",
      default: "f1",
      options: [
        { value: "f1", label: "F1 Distance" },
        { value: "f2", label: "F2 Distance" },
        { value: "f2minusf1", label: "F2 - F1 (Borders)" },
        { value: "cellular", label: "Cellular" }
      ]
    },
    { id: "frequency", label: "Frequency", type: "slider", min: 2, max: 64, step: 1, default: 16, integer: true },
    { id: "smooth", label: "Smooth Blending", type: "slider", min: 0, max: 1, step: 0.01, default: 0 }
  ],
  compute(_inputs, p2, ctx) {
    const s = makeSize(ctx.size);
    const h2 = new Heightmap(s);
    const feat = p2.feature;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        h2.set(x, y, voronoi(x / (s - 1), y / (s - 1), p2.frequency, p2.seed, feat));
      }
    }
    if (p2.smooth > 0.01) {
      const blurred = boxBlur(h2, Math.max(1, Math.round(s / 48)));
      const t = p2.smooth;
      for (let i = 0; i < h2.data.length; i++) {
        h2.data[i] = h2.data[i] * (1 - t) + blurred.data[i] * t;
      }
    }
    return h2.normalize();
  }
};

// src/nodes/filters.ts
var FLT = "#4f8fdf";
var BlurNode = {
  type: "blur",
  title: "Blur",
  category: "Filters",
  color: FLT,
  inputs: [{ id: "in", label: "In" }],
  outputs: [{ id: "out", label: "Out" }],
  params: [{ id: "radius", label: "Radius", type: "slider", min: 0, max: 32, step: 1, default: 4, integer: true }],
  compute(inputs, p2, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    return boxBlur(src, p2.radius * (src.size / 256));
  }
};
var SharpenNode = {
  type: "sharpen",
  title: "Sharpen",
  category: "Filters",
  color: FLT,
  inputs: [{ id: "in", label: "In" }],
  outputs: [{ id: "out", label: "Out" }],
  params: [{ id: "amount", label: "Amount", type: "slider", min: 0, max: 4, step: 0.05, default: 1 }],
  compute(inputs, p2, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const blurred = boxBlur(src, Math.max(1, src.size / 96));
    const out2 = new Heightmap(src.size);
    const a = p2.amount;
    for (let i = 0; i < src.data.length; i++) {
      out2.data[i] = Math.min(Math.max(src.data[i] + (src.data[i] - blurred.data[i]) * a, 0), 1);
    }
    return out2;
  }
};
var AdjustNode = {
  type: "adjust",
  title: "Adjust",
  category: "Filters",
  color: FLT,
  inputs: [{ id: "in", label: "In" }],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "brightness", label: "Brightness", type: "slider", min: -0.5, max: 0.5, step: 0.01, default: 0 },
    { id: "contrast", label: "Contrast", type: "slider", min: -1, max: 2, step: 0.01, default: 0 },
    { id: "gamma", label: "Gamma", type: "slider", min: 0.1, max: 4, step: 0.05, default: 1 }
  ],
  compute(inputs, p2, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const out2 = new Heightmap(src.size);
    const c = p2.contrast;
    const k = c >= 0 ? 1 + c * 2 : 1 + c;
    const invG = 1 / Math.max(p2.gamma, 0.01);
    for (let i = 0; i < src.data.length; i++) {
      let v = src.data[i] + p2.brightness;
      v = (v - 0.5) * k + 0.5;
      v = Math.min(Math.max(v, 0), 1);
      out2.data[i] = Math.pow(v, invG);
    }
    return out2;
  }
};
var RemapNode = {
  type: "remap",
  title: "Remap",
  category: "Filters",
  color: FLT,
  inputs: [{ id: "in", label: "In" }],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "inMin", label: "In Low", type: "slider", min: 0, max: 1, step: 0.01, default: 0 },
    { id: "inMax", label: "In High", type: "slider", min: 0, max: 1, step: 0.01, default: 1 },
    { id: "outMin", label: "Out Low", type: "slider", min: 0, max: 1, step: 0.01, default: 0 },
    { id: "outMax", label: "Out High", type: "slider", min: 0, max: 1, step: 0.01, default: 1 }
  ],
  compute(inputs, p2, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const out2 = new Heightmap(src.size);
    const r = p2.inMax - p2.inMin;
    const inv = Math.abs(r) < 1e-6 ? 0 : 1 / r;
    for (let i = 0; i < src.data.length; i++) {
      const t = Math.min(Math.max((src.data[i] - p2.inMin) * inv, 0), 1);
      out2.data[i] = p2.outMin + (p2.outMax - p2.outMin) * t;
    }
    return out2;
  }
};

// src/nodes/filters-extra.ts
var FLT2 = "#4f8fdf";
var ClampNode = {
  type: "clamp",
  title: "Clamp",
  category: "Filters",
  color: FLT2,
  inputs: [{ id: "in", label: "In" }],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "min", label: "Min", type: "slider", min: 0, max: 1, step: 0.01, default: 0.1 },
    { id: "max", label: "Max", type: "slider", min: 0, max: 1, step: 0.01, default: 0.9 }
  ],
  compute(inputs, p2, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const out2 = new Heightmap(src.size);
    for (let i = 0; i < src.data.length; i++) {
      out2.data[i] = Math.min(Math.max(src.data[i], p2.min), p2.max);
    }
    return out2;
  }
};
var InvertNode = {
  type: "invert",
  title: "Invert",
  category: "Filters",
  color: FLT2,
  inputs: [{ id: "in", label: "In" }],
  outputs: [{ id: "out", label: "Out" }],
  params: [],
  compute(inputs, _p, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const out2 = new Heightmap(src.size);
    for (let i = 0; i < src.data.length; i++) out2.data[i] = 1 - src.data[i];
    return out2;
  }
};
var TerraceNode = {
  type: "terrace",
  title: "Terrace",
  category: "Filters",
  color: FLT2,
  inputs: [{ id: "in", label: "In" }],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "steps", label: "Steps", type: "slider", min: 2, max: 32, step: 1, default: 8, integer: true },
    { id: "smoothness", label: "Smoothness", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 }
  ],
  compute(inputs, p2, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const out2 = new Heightmap(src.size);
    const n = p2.steps;
    for (let i = 0; i < src.data.length; i++) {
      const v = src.data[i] * n;
      const f = Math.floor(v);
      let frac = v - f;
      const sm = p2.smoothness;
      frac = frac * frac * (3 - 2 * frac) * sm + frac * (1 - sm);
      out2.data[i] = (f + frac) / n;
    }
    return out2;
  }
};
var SlopeNode = {
  type: "slope",
  title: "Slope",
  category: "Filters",
  color: FLT2,
  inputs: [{ id: "in", label: "In" }],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "intensity", label: "Intensity", type: "slider", min: 0.1, max: 8, step: 0.1, default: 2 }
  ],
  compute(inputs, p2, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0);
    const s = src.size;
    const out2 = new Heightmap(s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const xm = Math.max(0, x - 1), xp = Math.min(s - 1, x + 1);
        const ym = Math.max(0, y - 1), yp = Math.min(s - 1, y + 1);
        const dx = (src.get(xp, y) - src.get(xm, y)) * 0.5;
        const dy = (src.get(x, yp) - src.get(x, ym)) * 0.5;
        const g2 = Math.sqrt(dx * dx + dy * dy) * p2.intensity;
        out2.set(x, y, Math.min(g2, 1));
      }
    }
    return out2;
  }
};

// src/nodes/erosion.ts
var ERO = "#3fb8a4";
function makeBrush(radius) {
  const offs = [];
  const wts = [];
  let total = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= radius) {
        const w = 1 - d / (radius + 1);
        offs.push(dx, dy);
        wts.push(w);
        total += w;
      }
    }
  }
  return {
    offsets: new Int32Array(offs),
    weights: new Float32Array(wts.map((w) => w / total))
  };
}
function sampleGradient(h2, px, py) {
  const s = h2.size;
  const cx = Math.min(Math.max(px, 0), s - 1.001);
  const cy = Math.min(Math.max(py, 0), s - 1.001);
  const ix = Math.floor(cx), iy = Math.floor(cy);
  const fx = cx - ix, fy = cy - iy;
  const i00 = iy * s + ix;
  const i10 = i00 + (ix + 1 < s ? 1 : 0);
  const i01 = i00 + (iy + 1 < s ? s : 0);
  const i11 = i10 + (iy + 1 < s ? s : 0);
  const d = h2.data;
  const h00 = d[i00], h10 = d[i10], h01 = d[i01], h11 = d[i11];
  const gx = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
  const gy = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
  const height = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
  return { gx, gy, height };
}
var HydraulicErosionNode = {
  type: "hydraulic",
  title: "Hydraulic Erosion",
  category: "Erosion",
  color: ERO,
  inputs: [{ id: "in", label: "Terrain" }],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "seed", label: "Seed", type: "seed", default: 7 },
    { id: "droplets", label: "Droplets (k)", type: "slider", min: 1, max: 150, step: 1, default: 50, integer: true },
    { id: "lifetime", label: "Max Lifetime", type: "slider", min: 8, max: 80, step: 1, default: 42, integer: true },
    { id: "inertia", label: "Inertia", type: "slider", min: 0, max: 0.95, step: 0.05, default: 0.05 },
    { id: "capacity", label: "Capacity", type: "slider", min: 1, max: 12, step: 0.5, default: 5 },
    { id: "erode", label: "Erosion Rate", type: "slider", min: 0.05, max: 1, step: 0.05, default: 0.45 },
    { id: "deposit", label: "Deposit Rate", type: "slider", min: 0.05, max: 1, step: 0.05, default: 0.3 },
    { id: "evaporate", label: "Evaporation", type: "slider", min: 5e-3, max: 0.1, step: 5e-3, default: 0.02 },
    { id: "gravity", label: "Gravity", type: "slider", min: 1, max: 8, step: 0.5, default: 5 },
    { id: "radius", label: "Brush Radius", type: "slider", min: 1, max: 6, step: 1, default: 3, integer: true }
  ],
  compute(inputs, p2, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const s = src.size;
    const h2 = src.clone();
    const map = h2.data;
    const rand = mulberry32(p2.seed * 7919 + 13);
    const brush = makeBrush(p2.radius);
    const dropFactor = Math.min(Math.max((s / 512) ** 2, 1), 8);
    const nDrops = Math.round(p2.droplets * 1e3 * dropFactor);
    const scale = Math.max(1, s / 256);
    for (let d = 0; d < nDrops; d++) {
      let px = rand() * (s - 1);
      let py = rand() * (s - 1);
      let dirX = 0, dirY = 0;
      let speed = 1;
      let water = 1;
      let sediment = 0;
      for (let life = 0; life < p2.lifetime; life++) {
        const ix = Math.floor(px), iy = Math.floor(py);
        if (ix < 0 || iy < 0 || ix >= s - 1 || iy >= s - 1) break;
        const { gx, gy, height } = sampleGradient(h2, px, py);
        dirX = dirX * p2.inertia - gx * (1 - p2.inertia);
        dirY = dirY * p2.inertia - gy * (1 - p2.inertia);
        const len = Math.sqrt(dirX * dirX + dirY * dirY);
        if (!isFinite(len) || len < 1e-6) break;
        dirX /= len;
        dirY /= len;
        px += dirX;
        py += dirY;
        if (px < 0 || py < 0 || px >= s - 1 || py >= s - 1) break;
        const newHeight = h2.sample(px / (s - 1), py / (s - 1));
        const deltaH = newHeight - height;
        if (!isFinite(deltaH)) break;
        const cap = Math.min(Math.max(-deltaH * speed * water * p2.capacity * 20, 0.01), 2);
        if (sediment > cap || deltaH > 0) {
          const amount = deltaH > 0 ? Math.min(sediment, (deltaH + sediment) * p2.deposit) : (sediment - cap) * p2.deposit;
          sediment -= amount;
          const fx = px - Math.floor(px), fy = py - Math.floor(py);
          const i00 = Math.floor(py) * s + Math.floor(px);
          map[i00] += amount * (1 - fx) * (1 - fy);
          map[i00 + 1] += amount * fx * (1 - fy);
          map[i00 + s] += amount * (1 - fx) * fy;
          map[i00 + s + 1] += amount * fx * fy;
        } else {
          const amount = Math.min(
            Math.min((cap - sediment) * p2.erode, -deltaH * 0.9 + 0.02),
            0.08
          );
          const scaled = amount / (scale * scale);
          for (let b = 0; b < brush.weights.length; b++) {
            const bx = ix + brush.offsets[b * 2];
            const by = iy + brush.offsets[b * 2 + 1];
            if (bx >= 0 && by >= 0 && bx < s && by < s) {
              map[by * s + bx] -= scaled * brush.weights[b];
            }
          }
          sediment += amount;
        }
        speed = Math.min(Math.sqrt(Math.max(0, speed * speed - deltaH * p2.gravity * 40)), 12);
        sediment = Math.min(sediment, 1);
        water *= 1 - p2.evaporate;
        if (water < 0.01) break;
      }
    }
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < map.length; i++) {
      if (map[i] < mn) mn = map[i];
      if (map[i] > mx) mx = map[i];
    }
    const r = mx - mn || 1;
    for (let i = 0; i < map.length; i++) map[i] = (map[i] - mn) / r;
    return h2;
  }
};

// src/nodes/erosion-thermal.ts
var ERO2 = "#3fb8a4";
var ThermalErosionNode = {
  type: "thermal",
  title: "Thermal Erosion",
  category: "Erosion",
  color: ERO2,
  inputs: [{ id: "in", label: "Terrain" }],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "iterations", label: "Iterations", type: "slider", min: 1, max: 60, step: 1, default: 20, integer: true },
    { id: "talus", label: "Talus Threshold", type: "slider", min: 1e-3, max: 0.1, step: 1e-3, default: 0.02 },
    { id: "amount", label: "Amount", type: "slider", min: 0.05, max: 1, step: 0.05, default: 0.5 }
  ],
  compute(inputs, p2, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const s = src.size;
    const h2 = src.clone();
    const map = h2.data;
    const talus = p2.talus * (256 / s);
    const diffs = new Float32Array(8);
    const dx8 = [-1, 1, 0, 0, -1, 1, -1, 1];
    const dy8 = [0, 0, -1, 1, -1, -1, 1, 1];
    const deltas = new Float32Array(s * s);
    for (let it = 0; it < p2.iterations; it++) {
      deltas.fill(0);
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const i = y * s + x;
          const hv = map[i];
          let total = 0;
          for (let n = 0; n < 8; n++) {
            const nx = x + dx8[n], ny = y + dy8[n];
            const d = nx >= 0 && ny >= 0 && nx < s && ny < s ? hv - map[ny * s + nx] : 0;
            diffs[n] = d > talus ? d - talus : 0;
            total += diffs[n];
          }
          if (total <= 0) continue;
          const move = total * p2.amount * 0.25;
          for (let n = 0; n < 8; n++) {
            if (diffs[n] <= 0) continue;
            const nx = x + dx8[n], ny = y + dy8[n];
            deltas[ny * s + nx] += move * (diffs[n] / total);
          }
          deltas[i] -= move;
        }
      }
      for (let i = 0; i < map.length; i++) map[i] += deltas[i];
    }
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < map.length; i++) {
      if (map[i] < mn) mn = map[i];
      if (map[i] > mx) mx = map[i];
    }
    const r = mx - mn || 1;
    for (let i = 0; i < map.length; i++) map[i] = (map[i] - mn) / r;
    return h2;
  }
};

// src/nodes/combine.ts
var COM = "#b06fd8";
var BlendNode = {
  type: "blend",
  title: "Blend",
  category: "Combiners",
  color: COM,
  inputs: [
    { id: "a", label: "Base" },
    { id: "b", label: "Blend" },
    { id: "mask", label: "Mask (opt)" }
  ],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    {
      id: "mode",
      label: "Mode",
      type: "select",
      default: "mix",
      options: [
        { value: "mix", label: "Mix" },
        { value: "add", label: "Add" },
        { value: "subtract", label: "Subtract" },
        { value: "multiply", label: "Multiply" },
        { value: "min", label: "Min (Darken)" },
        { value: "max", label: "Max (Lighten)" },
        { value: "screen", label: "Screen" },
        { value: "overlay", label: "Overlay" }
      ]
    },
    { id: "opacity", label: "Opacity", type: "slider", min: 0, max: 1, step: 0.01, default: 1 }
  ],
  compute(inputs, p2, ctx) {
    const s = makeSize(ctx.size);
    const a = inputs.a ?? new Heightmap(s).fill(0);
    const b = inputs.b ?? new Heightmap(s).fill(0);
    const mask = inputs.mask;
    const out2 = new Heightmap(s);
    const mode = p2.mode;
    for (let i = 0; i < s * s; i++) {
      const av = a.data[i] ?? 0;
      const bv = b.data[i] ?? 0;
      let v;
      switch (mode) {
        case "add":
          v = av + bv;
          break;
        case "subtract":
          v = av - bv;
          break;
        case "multiply":
          v = av * bv;
          break;
        case "min":
          v = Math.min(av, bv);
          break;
        case "max":
          v = Math.max(av, bv);
          break;
        case "screen":
          v = 1 - (1 - av) * (1 - bv);
          break;
        case "overlay":
          v = av < 0.5 ? 2 * av * bv : 1 - 2 * (1 - av) * (1 - bv);
          break;
        default:
          v = av * (1 - p2.opacity) + bv * p2.opacity;
      }
      if (mode !== "mix" && p2.opacity !== 1) v = av * (1 - p2.opacity) + v * p2.opacity;
      if (mask) {
        const m2 = mask.data[i] ?? 0;
        v = av * (1 - m2) + v * m2;
      }
      out2.data[i] = Math.min(Math.max(v, 0), 1);
    }
    return out2;
  }
};
var DisplaceNode = {
  type: "displace",
  title: "Displace",
  category: "Combiners",
  color: COM,
  inputs: [
    { id: "in", label: "In" },
    { id: "map", label: "Displacement Map" }
  ],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "strength", label: "Strength", type: "slider", min: 0, max: 0.5, step: 5e-3, default: 0.05 },
    { id: "axis", label: "Axis", type: "select", default: "both", options: [
      { value: "both", label: "XY (both)" },
      { value: "x", label: "X only" },
      { value: "y", label: "Y only" }
    ] }
  ],
  compute(inputs, p2, ctx) {
    const s = makeSize(ctx.size);
    const src = inputs.in ?? new Heightmap(s).fill(0.5);
    const map = inputs.map ?? new Heightmap(s).fill(0.5);
    const out2 = new Heightmap(s);
    const st = p2.strength;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1), v = y / (s - 1);
        const d = map.get(x, y) - 0.5;
        const du = p2.axis === "y" ? 0 : d * st;
        const dv = p2.axis === "x" ? 0 : d * st;
        out2.set(x, y, src.sample(u + du, v + dv));
      }
    }
    return out2;
  }
};

// src/nodes/select.ts
var SEL = "#d84f5f";
function falloff(v, pos, half2, range) {
  const d = Math.abs(v - pos);
  if (d <= half2) return 1;
  const t = (d - half2) / Math.max(range, 1e-6);
  return t >= 1 ? 0 : 1 - t * t * (3 - 2 * t);
}
var SelectRangeNode = {
  type: "selectrange",
  title: "Select Range",
  category: "Selectors",
  color: SEL,
  inputs: [{ id: "in", label: "In" }],
  outputs: [{ id: "out", label: "Mask" }],
  params: [
    { id: "position", label: "Position", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: "range", label: "Range", type: "slider", min: 0, max: 1, step: 0.01, default: 0.3 },
    { id: "falloff", label: "Falloff", type: "slider", min: 0, max: 1, step: 0.01, default: 0.3 },
    { id: "invert", label: "Invert", type: "check", default: false }
  ],
  compute(inputs, p2, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const out2 = new Heightmap(src.size);
    const half2 = p2.range * (1 - p2.falloff) * 0.5;
    for (let i = 0; i < src.data.length; i++) {
      let m2 = falloff(src.data[i], p2.position, half2, p2.range * p2.falloff * 0.5 + 1e-6);
      if (p2.invert) m2 = 1 - m2;
      out2.data[i] = m2;
    }
    return out2;
  }
};
var OutputNode = {
  type: "output",
  title: "Output",
  category: "Output",
  color: "#8fbf4d",
  inputs: [{ id: "in", label: "Terrain" }],
  outputs: [],
  params: [],
  compute(inputs, _p, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0);
    return src;
  }
};

// src/nodes/primitives.ts
var PRI = "#e0564d";
var ss = (t) => {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
};
var lerp = (a, b, t) => a + (b - a) * t;
var terrace = (t, steps, soft) => {
  const q = 1 / steps;
  const k = Math.floor(Math.min(t, 0.999999) / q);
  const f = (t - k * q) / q;
  const lo = 0.5 - soft * 0.5, hi = 0.5 + soft * 0.5;
  return (k + ss((f - lo) / (hi - lo))) * q;
};
var MountainNode = {
  type: "mountain",
  title: "Mountain",
  category: "Primitives",
  color: PRI,
  inputs: [],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "seed", label: "Seed", type: "seed", default: 2025 },
    { id: "height", label: "Height", type: "slider", min: 0, max: 1, step: 0.01, default: 1 },
    { id: "x", label: "Center X", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: "y", label: "Center Y", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: "radius", label: "Radius", type: "slider", min: 0.15, max: 0.5, step: 0.01, default: 0.3 },
    { id: "steepness", label: "Steepness", type: "slider", min: 0.8, max: 5, step: 0.05, default: 2.3 },
    { id: "elong", label: "Elongation", type: "slider", min: 0, max: 0.8, step: 0.02, default: 0.25 },
    { id: "angle", label: "Orientation", type: "slider", min: 0, max: 180, step: 1, default: 35, integer: true },
    { id: "irregular", label: "Base Irregularity", type: "slider", min: 0, max: 0.6, step: 0.01, default: 0.38 },
    { id: "foothills", label: "Foothills", type: "slider", min: 0, max: 1, step: 0.02, default: 0.55 },
    { id: "benches", label: "Foothill Benches", type: "slider", min: 0, max: 1, step: 0.02, default: 0.4 },
    { id: "roughness", label: "Flank Roughness", type: "slider", min: 0, max: 0.5, step: 0.01, default: 0.18 },
    { id: "roughScale", label: "Roughness Scale", type: "slider", min: 2, max: 14, step: 0.5, default: 5 }
  ],
  compute(_inputs, p2, ctx) {
    const s = makeSize(ctx.size);
    const h2 = new Heightmap(s);
    const flank = new FBM(p2.seed, 6, 2, 0.5, "ridged");
    const hills = new FBM(p2.seed + 41, 5, 2, 0.5, "perlin");
    const plain = new FBM(p2.seed + 97, 4, 2, 0.5, "perlin");
    const rimA = new FBM(p2.seed + 13, 4, 2, 0.5, "perlin");
    const rimB = new FBM(p2.seed + 29, 3, 2, 0.5, "billow");
    const rot = p2.angle * Math.PI / 180;
    const ca = Math.cos(rot), sa = Math.sin(rot);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1), v = y / (s - 1);
        const dx = u - p2.x, dy = v - p2.y;
        const rx = (dx * ca + dy * sa) / (1 + p2.elong);
        const ry = (-dx * sa + dy * ca) * (1 + p2.elong);
        const th = Math.atan2(dy, dx);
        const wa = rimA.sample(Math.cos(th) * 1.7 + 17, Math.sin(th) * 1.7 + 17);
        const wb = rimB.sample(Math.cos(th) * 4.3 + 53, Math.sin(th) * 4.3 + 53);
        const d = Math.sqrt(rx * rx + ry * ry) / p2.radius * (1 + p2.irregular * (0.62 * wa + 0.38 * wb));
        const cone = Math.pow(Math.max(0, 1 - d), p2.steepness);
        const gully = flank.sample(u * p2.roughScale + 100, v * p2.roughScale + 100) * 0.5 + 0.5;
        const peak = cone * (1 + p2.roughness * (gully - 0.5) * 2);
        const ped = Math.exp(-d * d * 0.45);
        const ramp = lerp(ped, terrace(ped, 5, 0.55), p2.benches);
        const hillN = hills.sample(u * 3.5 + 31, v * 3.5 + 31) * 0.5 + 0.5;
        const plainN = plain.sample(u * 1.5 + 7, v * 1.5 + 7) * 0.5 + 0.5;
        const ground = plainN * 0.1 + ramp * (0.06 + 0.3 * p2.foothills) * (0.55 + 0.45 * hillN);
        h2.set(x, y, Math.max(0, ground + peak));
      }
    }
    return h2.normalize();
  }
};
var IslandNode = {
  type: "island",
  title: "Island",
  category: "Primitives",
  color: PRI,
  inputs: [],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "seed", label: "Seed", type: "seed", default: 777 },
    { id: "height", label: "Height", type: "slider", min: 0, max: 1, step: 0.01, default: 1 },
    { id: "radius", label: "Island Radius", type: "slider", min: 0.3, max: 0.75, step: 0.01, default: 0.52 },
    { id: "coast", label: "Coast Irregularity", type: "slider", min: 0, max: 1, step: 0.02, default: 0.5 },
    { id: "coastScale", label: "Coast Scale", type: "slider", min: 1, max: 6, step: 0.1, default: 2.5 },
    { id: "falloff", label: "Coast Falloff", type: "slider", min: 0.5, max: 4, step: 0.05, default: 1.6 },
    { id: "peak", label: "Interior Peaks", type: "slider", min: 0, max: 1, step: 0.02, default: 0.6 }
  ],
  compute(_inputs, p2, ctx) {
    const s = makeSize(ctx.size);
    const h2 = new Heightmap(s);
    const warp = new FBM(p2.seed + 9, 4, 2, 0.5, "perlin");
    const interior = new FBM(p2.seed, 7, 2, 0.5, "ridged");
    const R = p2.radius * 2;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1) * 2 - 1;
        const v = y / (s - 1) * 2 - 1;
        const wx = warp.sample(u * p2.coastScale + 31, v * p2.coastScale) * p2.coast * 0.3;
        const wy = warp.sample(u * p2.coastScale, v * p2.coastScale + 77) * p2.coast * 0.3;
        const d = Math.sqrt((u + wx) * (u + wx) + (v + wy) * (v + wy)) / R;
        const mask = Math.pow(Math.max(0, 1 - d), p2.falloff);
        const m2 = interior.sample(u * 3, v * 3) * 0.5 + 0.5;
        h2.set(x, y, mask * (1 - p2.peak + p2.peak * m2));
      }
    }
    return h2.normalize();
  }
};
var RidgeNode = {
  type: "ridge",
  title: "Ridge",
  category: "Primitives",
  color: PRI,
  inputs: [],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "seed", label: "Seed", type: "seed", default: 4242 },
    { id: "height", label: "Height", type: "slider", min: 0, max: 1, step: 0.01, default: 1 },
    { id: "angle", label: "Angle", type: "slider", min: 0, max: 180, step: 1, default: 25, integer: true },
    { id: "length", label: "Length", type: "slider", min: 0.3, max: 1.4, step: 0.02, default: 1.1 },
    { id: "width", label: "Width", type: "slider", min: 0.06, max: 0.45, step: 0.01, default: 0.18 },
    { id: "sharpness", label: "Sharpness", type: "slider", min: 1, max: 6, step: 0.05, default: 2.4 },
    { id: "meander", label: "Meander", type: "slider", min: 0, max: 0.5, step: 0.02, default: 0.22 },
    { id: "roughness", label: "Rock Roughness", type: "slider", min: 0, max: 0.5, step: 0.02, default: 0.3 }
  ],
  compute(_inputs, p2, ctx) {
    const s = makeSize(ctx.size);
    const h2 = new Heightmap(s);
    const warp = new FBM(p2.seed + 17, 4, 2, 0.5, "perlin");
    const rock = new FBM(p2.seed, 6, 2, 0.5, "ridged");
    const rad = p2.angle * Math.PI / 180;
    const ca = Math.cos(rad), sa = Math.sin(rad);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1) * 2 - 1;
        const v = y / (s - 1) * 2 - 1;
        const along = u * ca + v * sa;
        const perp = -u * sa + v * ca;
        const bend = warp.sample(along * 1.6 + 9, 3.3) * p2.meander;
        const over = Math.max(0, Math.abs(along + bend) - p2.length);
        const dseg = Math.sqrt(over * over + perp * perp) / p2.width;
        const crest = Math.pow(Math.max(0, 1 - dseg), p2.sharpness);
        const detail = rock.sample(u * 5 + 9, v * 5 + 9) * 0.5 + 0.5;
        h2.set(x, y, crest * (1 + p2.roughness * (detail - 0.5) * 2));
      }
    }
    return h2.normalize();
  }
};
var PeaksNode = {
  type: "peaks",
  title: "Peaks",
  category: "Primitives",
  color: PRI,
  inputs: [],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "seed", label: "Seed", type: "seed", default: 99 },
    { id: "height", label: "Height", type: "slider", min: 0, max: 1, step: 0.01, default: 1 },
    { id: "count", label: "Peak Count", type: "slider", min: 1, max: 10, step: 1, default: 1, integer: true },
    { id: "spread", label: "Cluster Spread", type: "slider", min: 0.02, max: 0.42, step: 0.01, default: 0.1 },
    { id: "falloff", label: "Falloff", type: "slider", min: 1, max: 4, step: 0.05, default: 2 },
    { id: "variation", label: "Height Variation", type: "slider", min: 0, max: 1, step: 0.01, default: 0.35 }
  ],
  compute(_inputs, p2, ctx) {
    const s = makeSize(ctx.size);
    const h2 = new Heightmap(s);
    const rand = mulberry32(p2.seed);
    const px = [], py = [], ph = [], pr = [];
    for (let i = 0; i < p2.count; i++) {
      px.push(0.5 + (rand() * 2 - 1) * p2.spread);
      py.push(0.5 + (rand() * 2 - 1) * p2.spread);
      ph.push(1 - p2.variation * rand());
      pr.push(0.42 + 0.28 * rand());
    }
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1), v = y / (s - 1);
        let best = 0;
        for (let i = 0; i < p2.count; i++) {
          const dx = u - px[i], dy = v - py[i];
          const d = Math.sqrt(dx * dx + dy * dy) / pr[i];
          const val = ph[i] * Math.pow(Math.max(0, 1 - d), p2.falloff);
          if (val > best) best = val;
        }
        h2.set(x, y, best);
      }
    }
    return h2.normalize();
  }
};
var CraterNode = {
  type: "crater",
  title: "Crater",
  category: "Primitives",
  color: PRI,
  inputs: [],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "seed", label: "Seed", type: "seed", default: 11 },
    { id: "height", label: "Height", type: "slider", min: 0, max: 1, step: 0.01, default: 1 },
    { id: "x", label: "Center X", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: "y", label: "Center Y", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: "radius", label: "Radius", type: "slider", min: 0.05, max: 0.45, step: 0.01, default: 0.25 },
    { id: "depth", label: "Depth", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: "rimHeight", label: "Rim Height", type: "slider", min: 0, max: 1, step: 0.01, default: 0.35 },
    { id: "rimWidth", label: "Rim Width", type: "slider", min: 0.05, max: 0.5, step: 0.01, default: 0.18 },
    { id: "roughness", label: "Roughness", type: "slider", min: 0, max: 1, step: 0.01, default: 0.25 }
  ],
  compute(_inputs, p2, ctx) {
    const s = makeSize(ctx.size);
    const h2 = new Heightmap(s);
    const fbm = new FBM(p2.seed, 5, 2, 0.5, "ridged");
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1), v = y / (s - 1);
        const dx = u - p2.x, dy = v - p2.y;
        const d = Math.sqrt(dx * dx + dy * dy) / p2.radius;
        const bowl = d < 1 ? -p2.depth * (1 - d * d) : 0;
        const rim = p2.rimHeight * Math.exp(-Math.pow((d - 1) / p2.rimWidth, 2));
        const rough = (fbm.sample(u * 6, v * 6) - 0.5) * p2.roughness * Math.exp(-Math.max(0, d - 1) * 2);
        h2.set(x, y, Math.min(Math.max(0.6 + bowl + rim + rough, 0), 1));
      }
    }
    return h2.normalize();
  }
};
var CanyonNode = {
  type: "canyon",
  title: "Canyon",
  category: "Primitives",
  color: PRI,
  inputs: [],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "seed", label: "Seed", type: "seed", default: 606 },
    { id: "height", label: "Height", type: "slider", min: 0, max: 1, step: 0.01, default: 1 },
    { id: "scale", label: "Feature Scale", type: "slider", min: 1, max: 8, step: 0.1, default: 2 },
    { id: "meander", label: "Meander", type: "slider", min: 0, max: 0.35, step: 0.01, default: 0.2 },
    { id: "width", label: "Channel Width", type: "slider", min: 0.01, max: 0.15, step: 5e-3, default: 0.05 },
    { id: "depth", label: "Depth", type: "slider", min: 0, max: 1, step: 0.01, default: 0.85 },
    { id: "floor", label: "Floor Level", type: "slider", min: 0, max: 0.5, step: 0.01, default: 0.12 }
  ],
  compute(_inputs, p2, ctx) {
    const s = makeSize(ctx.size);
    const h2 = new Heightmap(s);
    const fbm = new FBM(p2.seed, 6, 2, 0.5, "perlin");
    const meander = new FBM(p2.seed + 77, 3, 2, 0.5, "perlin");
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1), v = y / (s - 1);
        const n = fbm.sample(u * p2.scale, v * p2.scale) * 0.5 + 0.5;
        const c = 0.5 + (meander.sample(u * 3 + 40, 8.2) * 0.5 + 0.5 - 0.5) * 2 * p2.meander;
        const dist = Math.abs(v - c);
        const t = ss((dist - p2.width) / (p2.width * 1.2));
        const carved = p2.floor + (n - p2.floor) * t;
        h2.set(x, y, Math.min(Math.max(n * (1 - p2.depth) + carved * p2.depth, 0), 1));
      }
    }
    return h2.normalize();
  }
};
var DunesNode = {
  type: "dunes",
  title: "Dunes",
  category: "Primitives",
  color: PRI,
  inputs: [],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "seed", label: "Seed", type: "seed", default: 311 },
    { id: "height", label: "Height", type: "slider", min: 0, max: 1, step: 0.01, default: 1 },
    { id: "wavelength", label: "Wavelength", type: "slider", min: 0.02, max: 0.25, step: 5e-3, default: 0.12 },
    { id: "direction", label: "Direction", type: "slider", min: 0, max: 180, step: 1, default: 15, integer: true },
    { id: "warp", label: "Domain Warp", type: "slider", min: 0, max: 1, step: 0.02, default: 0.6 },
    { id: "sharpness", label: "Sharpness", type: "slider", min: 1, max: 6, step: 0.05, default: 2.5 }
  ],
  compute(_inputs, p2, ctx) {
    const s = makeSize(ctx.size);
    const h2 = new Heightmap(s);
    const warp = new FBM(p2.seed, 4, 2, 0.5, "perlin");
    const detail = new FBM(p2.seed + 19, 4, 2, 0.5, "perlin");
    const rad = p2.direction * Math.PI / 180;
    const sa = Math.sin(rad), ca = Math.cos(rad);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1), v = y / (s - 1);
        const proj = u * sa + v * ca;
        const off = (warp.sample(u * 3, v * 3) * 0.5 + 0.5 - 0.5) * p2.warp * 2;
        const ph = (proj / p2.wavelength + off) * Math.PI * 2;
        const crest = Math.pow(1 - Math.abs(Math.sin(ph)), p2.sharpness);
        const fine = detail.sample(u * 5 + 9, v * 5 + 9) * 0.5 + 0.5;
        h2.set(x, y, crest * 0.85 + fine * 0.15);
      }
    }
    return h2.normalize();
  }
};
var VolcanoNode = {
  type: "volcano",
  title: "Volcano",
  category: "Primitives",
  color: PRI,
  inputs: [],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "seed", label: "Seed", type: "seed", default: 5 },
    { id: "height", label: "Height", type: "slider", min: 0, max: 1, step: 0.01, default: 1 },
    { id: "x", label: "Center X", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: "y", label: "Center Y", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: "radius", label: "Radius", type: "slider", min: 0.1, max: 0.5, step: 0.01, default: 0.36 },
    { id: "slope", label: "Slope", type: "slider", min: 0.6, max: 3, step: 0.05, default: 1.4 },
    { id: "calderaWidth", label: "Caldera Width", type: "slider", min: 0.05, max: 0.5, step: 0.01, default: 0.2 },
    { id: "calderaDepth", label: "Caldera Depth", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: "roughness", label: "Roughness", type: "slider", min: 0, max: 0.6, step: 0.01, default: 0.3 }
  ],
  compute(_inputs, p2, ctx) {
    const s = makeSize(ctx.size);
    const h2 = new Heightmap(s);
    const fbm = new FBM(p2.seed, 5, 2, 0.5, "ridged");
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1), v = y / (s - 1);
        const dx = u - p2.x, dy = v - p2.y;
        const d = Math.sqrt(dx * dx + dy * dy) / p2.radius;
        const cone = Math.pow(Math.max(0, 1 - d), p2.slope);
        const caldera = Math.exp(-Math.pow(d / p2.calderaWidth, 2)) * p2.calderaDepth;
        const flank = fbm.sample(u * 8, v * 8) * cone * p2.roughness;
        h2.set(x, y, Math.min(Math.max(cone - caldera + flank, 0), 1));
      }
    }
    return h2.normalize();
  }
};
var MesaNode = {
  type: "mesa",
  title: "Mesa",
  category: "Primitives",
  color: PRI,
  inputs: [],
  outputs: [{ id: "out", label: "Out" }],
  params: [
    { id: "seed", label: "Seed", type: "seed", default: 88 },
    { id: "height", label: "Height", type: "slider", min: 0, max: 1, step: 0.01, default: 1 },
    { id: "scale", label: "Feature Scale", type: "slider", min: 0.5, max: 8, step: 0.1, default: 1.8 },
    { id: "octaves", label: "Octaves", type: "slider", min: 1, max: 10, step: 1, default: 5, integer: true },
    { id: "levels", label: "Levels", type: "slider", min: 2, max: 14, step: 1, default: 6, integer: true },
    { id: "smooth", label: "Edge Softness", type: "slider", min: 0.05, max: 0.5, step: 0.01, default: 0.25 }
  ],
  compute(_inputs, p2, ctx) {
    const s = makeSize(ctx.size);
    const h2 = new Heightmap(s);
    const fbm = new FBM(p2.seed, p2.octaves, 2, 0.5, "perlin");
    const step = 1 / p2.levels;
    const lo = 1 - p2.smooth, hi = p2.smooth;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1), v = y / (s - 1);
        const n = fbm.sample(u * p2.scale, v * p2.scale) * 0.5 + 0.5;
        const k = Math.floor(n / step);
        const f = (n - k * step) / step;
        const t = hi <= lo ? f : ss((f - lo) / (hi - lo));
        h2.set(x, y, (k + t) * step);
      }
    }
    return h2.normalize();
  }
};

// src/nodes/registry.ts
var NODE_TYPES = [
  // Primitives
  MountainNode,
  IslandNode,
  RidgeNode,
  PeaksNode,
  CraterNode,
  CanyonNode,
  DunesNode,
  VolcanoNode,
  MesaNode,
  // Generators
  NoiseNode,
  VoronoiNode,
  GradientNode,
  RadialGradientNode,
  ConstantNode,
  // Filters
  BlurNode,
  SharpenNode,
  AdjustNode,
  RemapNode,
  ClampNode,
  InvertNode,
  TerraceNode,
  SlopeNode,
  // Erosion
  HydraulicErosionNode,
  ThermalErosionNode,
  // Combiners
  BlendNode,
  DisplaceNode,
  // Selectors
  SelectRangeNode,
  // Output
  OutputNode
];

// src/core/engine.ts
var idCounter = 0;
function uid(prefix) {
  idCounter++;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}
var GraphEngine = class {
  graph;
  registry = /* @__PURE__ */ new Map();
  cache = /* @__PURE__ */ new Map();
  constructor(graph) {
    this.graph = graph;
    for (const def of NODE_TYPES) this.registry.set(def.type, def);
  }
  defaultsFor(type) {
    const def = this.registry.get(type);
    const params = {};
    if (def) for (const p2 of def.params) params[p2.id] = p2.default;
    return params;
  }
  createNode(type, x, y) {
    const node2 = {
      id: uid(type),
      type,
      x,
      y,
      params: this.defaultsFor(type)
    };
    this.graph.addNode(node2);
    return node2;
  }
  connect(fromNode, fromPort, toNode, toPort) {
    const edge = { id: uid("e"), fromNode, fromPort, toNode, toPort };
    if (this.graph.addEdge(edge)) return edge;
    return null;
  }
  /** Evaluate the graph up to every node; stores results in graph.nodeResult + cache. */
  evaluate(size, onNodeDone) {
    const order = this.graph.topoOrder();
    const results = /* @__PURE__ */ new Map();
    this.cache = results;
    this.graph.nodeResult = results;
    for (const id of order) {
      const node2 = this.graph.nodes.get(id);
      if (!node2) continue;
      const def = this.registry.get(node2.type);
      if (!def) continue;
      const inputs = {};
      for (const e of this.graph.edges) {
        if (e.toNode === id) inputs[e.toPort] = results.get(e.fromNode);
      }
      try {
        const h2 = def.compute(inputs, node2.params, { size });
        const nodeHeight = node2.params.height;
        if (typeof nodeHeight === "number" && nodeHeight !== 1) {
          const k = Math.max(0, nodeHeight);
          for (let i = 0; i < h2.data.length; i++) h2.data[i] *= k;
        }
        if (h2.size !== size) {
          const r = new Heightmap(size);
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              r.set(x, y, h2.sample(x / (size - 1), y / (size - 1)));
            }
          }
          results.set(id, r);
          onNodeDone?.(id, r);
        } else {
          results.set(id, h2);
          onNodeDone?.(id, h2);
        }
      } catch (err) {
        console.error(`Node ${def.title} (${id}) failed:`, err);
        const fallback = new Heightmap(size);
        results.set(id, fallback);
        onNodeDone?.(id, fallback);
      }
    }
    return results;
  }
};

// scripts/profile.ts
var node = MountainNode;
var p = {};
for (const prm of node.params) p[prm.id] = prm.default;
var h = node.compute([], p, { size: 256 });
var thr = 0.3;
var radii = [];
for (let a = 0; a < 16; a++) {
  const th = a / 16 * Math.PI * 2;
  const dx = Math.cos(th), dy = Math.sin(th);
  let r = 0;
  while (r < 127) {
    const x = Math.round(128 + dx * r), y = Math.round(128 + dy * r);
    if (x < 0 || y < 0 || x > 255 || y > 255 || h.get(x, y) < thr) break;
    r++;
  }
  radii.push(r);
}
var mean = radii.reduce((s, r) => s + r, 0) / radii.length;
var sd = Math.sqrt(radii.reduce((s, r) => s + (r - mean) ** 2, 0) / radii.length);
console.log("contour radii @16 angles:", radii.join(","));
console.log(`roundness: mean=${mean.toFixed(1)}px  stddev=${(sd / mean * 100).toFixed(0)}% (0% = perfect circle)`);
var g = new Graph();
var eng = new GraphEngine(g);
var m = eng.createNode("mountain", 0, 0);
var out = eng.createNode("output", 200, 0);
g.addEdge({ id: "e1", fromNode: m.id, fromPort: "out", toNode: out.id, toPort: "in" });
eng.evaluate(128);
var full = eng.cache.get(out.id).max();
m.params.height = 0.5;
eng.evaluate(128);
var half = eng.cache.get(out.id).max();
console.log(`engine Height param: default max=${full.toFixed(3)}, height=0.5 max=${half.toFixed(3)} (expect ~${(full * 0.5).toFixed(3)})`);
