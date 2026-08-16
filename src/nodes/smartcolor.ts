import { Heightmap } from '../core/heightmap';
import { NodeTypeDefinition } from '../core/graph';
import { makeSize } from './generators';

export interface SmartMapData {
  /** Baked RGB colors, size*size*3, linear [0,1] */
  colors: Float32Array;
  size: number;
}

// ── CLUT (Color Lookup Table) ──────────────────────────────────────────────
// Altitude gradient: low=water/sand, mid=grass/forest, high=rock/snow/ice.
// Mirrors Gaea's CLUTer gradient mapping 0..1 height -> color.
const CLUT_STOPS: { t: number; c: [number, number, number] }[] = [
  { t: 0.00, c: [0.02, 0.10, 0.18] }, // deep water
  { t: 0.04, c: [0.10, 0.30, 0.42] }, // shallow water
  { t: 0.07, c: [0.52, 0.47, 0.35] }, // wet sand
  { t: 0.10, c: [0.80, 0.74, 0.58] }, // dry sand / beach
  { t: 0.16, c: [0.45, 0.55, 0.30] }, // dune grass
  { t: 0.26, c: [0.32, 0.48, 0.22] }, // meadow
  { t: 0.38, c: [0.24, 0.42, 0.18] }, // grassland
  { t: 0.48, c: [0.17, 0.33, 0.13] }, // forest
  { t: 0.58, c: [0.12, 0.26, 0.10] }, // dense forest
  { t: 0.66, c: [0.42, 0.44, 0.34] }, // alpine scrub
  { t: 0.74, c: [0.46, 0.47, 0.40] }, // weathered rock
  { t: 0.84, c: [0.40, 0.38, 0.36] }, // bare rock
  { t: 0.92, c: [0.34, 0.34, 0.34] }, // dark high rock
  { t: 1.00, c: [0.88, 0.92, 0.95] }, // snow / ice
];

function clutColor(h: number): [number, number, number] {
  if (h <= CLUT_STOPS[0].t) return CLUT_STOPS[0].c;
  for (let i = 1; i < CLUT_STOPS.length; i++) {
    if (h <= CLUT_STOPS[i].t) {
      const a = CLUT_STOPS[i - 1], b = CLUT_STOPS[i];
      const k = (h - a.t) / (b.t - a.t);
      const ks = k * k * (3 - 2 * k); // smoothstep
      return [
        a.c[0] + (b.c[0] - a.c[0]) * ks,
        a.c[1] + (b.c[1] - a.c[1]) * ks,
        a.c[2] + (b.c[2] - a.c[2]) * ks,
      ];
    }
  }
  return CLUT_STOPS[CLUT_STOPS.length - 1].c;
}

function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// Rock tints used for slope/curvature/erosion exposure
const SCREE: [number, number, number] = [0.52, 0.48, 0.42];
const BARE_ROCK: [number, number, number] = [0.40, 0.38, 0.36];
const DARK_ROCK: [number, number, number] = [0.30, 0.29, 0.28];

/**
 * SmartColor (Gaea Texture/CLUT node): produces a data-driven, physically-plausible
 * terrain color from elevation, slope, curvature, and (optional) erosion wear/sediment.
 *
 * Mirrors the Gaea flow:
 *   Terrain → (slope, curvature) → masks → CLUT gradient → erosion/rock blending → baked colors
 *
 * The result is baked into a Float32Array of RGB so the viewport just samples it
 * (non-destructive, like Gaea's color pipeline).
 */
export const SmartColorNode: NodeTypeDefinition = {
  type: 'smartcolor',
  title: 'SmartColor',
  category: 'Materials',
  color: '#e879c7',
  inputs: [
    { id: 'height', label: 'Height' },
    { id: 'slope', label: 'Slope' },
    { id: 'curv', label: 'Curvature' },
    { id: 'wear', label: 'Wear' },
    { id: 'sediment', label: 'Sediment' },
  ],
  outputs: [{ id: 'out', label: 'Terrain' }],
  params: [
    { id: 'snowLine', label: 'Snow Line', type: 'slider', min: 0.5, max: 1, step: 0.01, default: 0.8 },
    { id: 'rockExposure', label: 'Rock Exposure', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.7 },
    { id: 'useErosion', label: 'Use Erosion Masks', type: 'check', default: true },
    { id: 'saturation', label: 'Saturation', type: 'slider', min: 0, max: 1.5, step: 0.01, default: 1 },
    { id: 'contrast', label: 'Contrast', type: 'slider', min: 0.5, max: 1.5, step: 0.01, default: 1 },
  ],
  compute(inputs, p, ctx) {
    const height = inputs.height ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const s = height.size;
    const h = height.data;

    // ── derive slope ──
    let slope = inputs.slope;
    if (!slope) {
      slope = new Heightmap(s);
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const xm = Math.max(0, x - 1), xp = Math.min(s - 1, x + 1);
          const ym = Math.max(0, y - 1), yp = Math.min(s - 1, y + 1);
          const dx = (height.get(xp, y) - height.get(xm, y)) * s * 0.5;
          const dy = (height.get(x, yp) - height.get(x, ym)) * s * 0.5;
          slope.set(x, y, Math.min(1, Math.sqrt(dx * dx + dy * dy)));
        }
      }
    }

    // ── derive curvature (Laplacian): + = convex ridges, - = concave valleys ──
    let curv = inputs.curv;
    if (!curv) {
      curv = new Heightmap(s);
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const xm = Math.max(0, x - 1), xp = Math.min(s - 1, x + 1);
          const ym = Math.max(0, y - 1), yp = Math.min(s - 1, y + 1);
          const lap = height.get(xp, y) + height.get(xm, y) + height.get(x, yp) + height.get(x, ym) - 4 * height.get(x, y);
          curv.set(x, y, lap * s * 0.5);
        }
      }
    }

    const wear = inputs.wear ? (inputs.wear as any).wear ?? null : null;
    const sediment = inputs.sediment ? (inputs.sediment as any).sediment ?? null : null;
    const useEro = p.useErosion && (wear || sediment);

    // normalize helpers for erosion masks (Float32Array raw maps)
    const norm = (arr: Float32Array): Float32Array => {
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      const r = mx - mn || 1;
      const out = new Float32Array(arr.length);
      for (let i = 0; i < out.length; i++) out[i] = (arr[i] - mn) / r;
      return out;
    };

    const wearN = useEro && wear ? norm(wear) : null;
    const sedN = useEro && sediment ? norm(sediment) : null;

    // ── bake colors ──
    const colors = new Float32Array(s * s * 3);
    const sat = p.saturation;
    const con = p.contrast;
    const snowLine = p.snowLine;
    const rockExp = p.rockExposure;

    for (let i = 0; i < s * s; i++) {
      const hi = h[i];
      // base CLUT color
      let c = clutColor(hi);

      // slope -> rock exposure (steep gets rockier)
      const sl = slope.data[i];
      const slopeRock = smoothstep(0.35, 0.8, sl) * rockExp;
      if (slopeRock > 0) {
        const rockTint = hi > 0.8 ? DARK_ROCK : hi > 0.6 ? BARE_ROCK : SCREE;
        c = lerp3(c, rockTint, slopeRock * 0.85);
      }

      // curvature -> ridges rocky, valleys soil
      const cv = curv.data[i];
      if (cv > 0.02) {
        c = lerp3(c, DARK_ROCK, Math.min(cv * 3, 0.5));
      } else if (cv < -0.02) {
        // valley: greener / more soil
        c = lerp3(c, [0.28, 0.42, 0.18], Math.min(-cv * 2, 0.35));
      }

      // erosion wear -> exposed rock/scree
      if (wearN) {
        const w = wearN[i] * rockExp;
        if (w > 0.05) {
          const rockTint = hi > 0.7 ? BARE_ROCK : SCREE;
          c = lerp3(c, rockTint, Math.min(w * 1.2, 0.8));
        }
      }
      // sediment -> soil / deposition (greener, browner)
      if (sedN) {
        const sd = sedN[i];
        if (sd > 0.1) {
          c = lerp3(c, [0.40, 0.36, 0.26], Math.min(sd * 0.8, 0.6));
        }
      }

      // snow on high + flat-ish
      if (hi > snowLine) {
        const sn = smoothstep(snowLine, snowLine + 0.12, hi) * smoothstep(0.6, 0.15, sl);
        if (sn > 0.05) c = lerp3(c, [0.92, 0.94, 0.96], sn);
      }

      // contrast
      c = [
        Math.max(0, Math.min(1, 0.5 + (c[0] - 0.5) * con)),
        Math.max(0, Math.min(1, 0.5 + (c[1] - 0.5) * con)),
        Math.max(0, Math.min(1, 0.5 + (c[2] - 0.5) * con)),
      ];
      // saturation
      const g = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
      c = [
        Math.max(0, Math.min(1, g + (c[0] - g) * sat)),
        Math.max(0, Math.min(1, g + (c[1] - g) * sat)),
        Math.max(0, Math.min(1, g + (c[2] - g) * sat)),
      ];

      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
    }

    const out = new Heightmap(s);
    out.data.set(h);
    (out as any).smartmap = { colors, size: s } as SmartMapData;
    return out;
  },
};

export function resolveSmartMapColor(smart: SmartMapData | undefined, u: number, v: number): [number, number, number] {
  if (!smart) return [0.5, 0.5, 0.5];
  const s = smart.size;
  const fx = Math.max(0, Math.min(1, u)) * (s - 1);
  const fy = Math.max(0, Math.min(1, v)) * (s - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, s - 1), y1 = Math.min(y0 + 1, s - 1);
  const tx = fx - x0, ty = fy - y0;
  const i00 = (y0 * s + x0) * 3, i10 = (y0 * s + x1) * 3, i01 = (y1 * s + x0) * 3, i11 = (y1 * s + x1) * 3;
  const a = lerp3(
    [smart.colors[i00], smart.colors[i00 + 1], smart.colors[i00 + 2]],
    [smart.colors[i10], smart.colors[i10 + 1], smart.colors[i10 + 2]], tx
  );
  const b = lerp3(
    [smart.colors[i01], smart.colors[i01 + 1], smart.colors[i01 + 2]],
    [smart.colors[i11], smart.colors[i11 + 1], smart.colors[i11 + 2]], tx
  );
  return lerp3(a, b, ty);
}
