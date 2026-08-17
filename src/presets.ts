export interface PresetNodeSpec {
  key: string;
  type: string;
  x: number;
  y: number;
  params?: Record<string, any>;
}

export interface PresetLink {
  from: string;
  to: string;
  fromPort?: string;
  toPort?: string;
}

export interface PresetSpec {
  name: string;
  nodes: PresetNodeSpec[];
  links: PresetLink[];
}

/**
 * DEMONSTRATION SUITE — 12 guided presets.
 *
 * Every node type in the registry appears at least once, and nearly every
 * parameter is set to an instructive (non-default) value so you can select a
 * node, watch the result, and drag its sliders to see exactly what it does.
 *
 * 01-05  Primitives (one family per preset)
 * 06-07  Generators & masking
 * 08     The full filter chain
 * 09     Erosion laboratory (all erosion parameters)
 * 10     Displacement warping
 * 11     Select-range masks
 * 12     A complete GAEA-style pipeline combining everything
 */
export const PRESETS: PresetSpec[] = [
  // ────────────────────────────────────────────────────────────────────────
  // 01 · MOUNTAIN — GAEA-style Alpine horn massif with branching spurs,
  //    chiseled arêtes, and couloir drainage into benched foothills.
  // ────────────────────────────────────────────────────────────────────────
  {
    name: '01 · Mountain',
    nodes: [
      {
        key: 'mountain', type: 'mountain', x: 30, y: 60,
        params: {
          style: 'alpine', seed: 2025, height: 1, x: 0.5, y: 0.52, radius: 0.4,
          steepness: 2.2, bulky: 0.45, elong: 0.3, angle: 55, irregular: 0.38,
          spurs: 0.65, spursFreq: 6, gullies: 0.5,
          foothills: 0.8, benches: 0.45, strataFreq: 8, roughness: 0.22, roughScale: 6
        }
      },
      {
        key: 'hyd', type: 'hydraulic', x: 300, y: 60,
        params: {
          seed: 3, droplets: 45, lifetime: 40, inertia: 0.1, capacity: 5,
          erode: 0.4, deposit: 0.3, evaporate: 0.02, gravity: 5, radius: 3
        }
      },
      {
        key: 'thermal', type: 'thermal', x: 570, y: 60,
        params: { iterations: 18, talus: 0.02, amount: 0.5 }
      },
      { key: 'out', type: 'output', x: 840, y: 60 }
    ],
    links: [
      { from: 'mountain', to: 'hyd' },
      { from: 'hyd', to: 'thermal' },
      { from: 'thermal', to: 'out' }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────
  // 02 · ISLAND × VOLCANO — Blend 'multiply' carves the cone into the
  //    island; Thermal erosion softens the caldera rim.
  // ────────────────────────────────────────────────────────────────────────
  {
    name: '02 · Island × Volcano',
    nodes: [
      {
        key: 'island', type: 'island', x: 30, y: 60,
        params: {
          seed: 777, height: 1, radius: 0.56, coast: 0.6,
          coastScale: 3.2, falloff: 1.9, peak: 0.6
        }
      },
      {
        key: 'volcano', type: 'volcano', x: 30, y: 330,
        params: {
          seed: 5, height: 1, x: 0.52, y: 0.48, radius: 0.3, slope: 1.6,
          calderaWidth: 0.16, calderaDepth: 0.65, roughness: 0.35
        }
      },
      {
        key: 'blend', type: 'blend', x: 300, y: 190,
        params: { mode: 'multiply', opacity: 1 }
      },
      {
        key: 'thermal', type: 'thermal', x: 570, y: 190,
        params: { iterations: 25, talus: 0.025, amount: 0.6 }
      },
      { key: 'out', type: 'output', x: 840, y: 190 }
    ],
    links: [
      { from: 'island', to: 'blend', toPort: 'a' },
      { from: 'volcano', to: 'blend', toPort: 'b' },
      { from: 'blend', to: 'thermal' },
      { from: 'thermal', to: 'out' }
    ]
  },
  // ────────────────────────────────────────────────────────────────────────
  // 03 · RIDGE + PEAKS — Blend 'max' composes landforms; a low Perlin floor
  //    (Blend 'add', opacity 0.25) gives the erosion real material to carve.
  //    Note how Peaks 'height' < 1 keeps the cluster lower than the crest.
  // ────────────────────────────────────────────────────────────────────────
  {
    name: '03 · Ridge + Peaks',
    nodes: [
      {
        key: 'ridge', type: 'ridge', x: 30, y: 60,
        params: {
          seed: 4242, height: 1, angle: 115, length: 1.2, width: 0.2,
          sharpness: 2.4, meander: 0.32, roughness: 0.4
        }
      },
      {
        key: 'peaks', type: 'peaks', x: 30, y: 330,
        params: {
          seed: 99, height: 0.85, count: 4, spread: 0.16,
          falloff: 2.6, variation: 0.5
        }
      },
      {
        key: 'base', type: 'noise', x: 30, y: 600,
        params: {
          seed: 14, type: 'perlin', scale: 2.4, octaves: 5,
          lacunarity: 2, gain: 0.5, warp: 0.2, warpScale: 2
        }
      },
      {
        key: 'bMax', type: 'blend', x: 300, y: 190,
        params: { mode: 'max', opacity: 1 }
      },
      {
        key: 'bAdd', type: 'blend', x: 570, y: 190,
        params: { mode: 'add', opacity: 0.25 }
      },
      {
        key: 'hyd', type: 'hydraulic', x: 840, y: 190,
        params: {
          seed: 11, droplets: 60, lifetime: 44, inertia: 0.15,
          capacity: 6, erode: 0.5, deposit: 0.3, evaporate: 0.02,
          gravity: 5.5, radius: 3
        }
      },
      { key: 'out', type: 'output', x: 1110, y: 190 }
    ],
    links: [
      { from: 'ridge', to: 'bMax', toPort: 'a' },
      { from: 'peaks', to: 'bMax', toPort: 'b' },
      { from: 'bMax', to: 'bAdd', toPort: 'a' },
      { from: 'base', to: 'bAdd', toPort: 'b' },
      { from: 'bAdd', to: 'hyd' },
      { from: 'hyd', to: 'out' }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────
  // 04 · CRATER & CANYON — Blend 'max' with opacity < 1 shows how opacity
  //    fades the blended layer; Adjust adds final contrast punch.
  // ────────────────────────────────────────────────────────────────────────
  {
    name: '04 · Crater & Canyon',
    nodes: [
      {
        key: 'canyon', type: 'canyon', x: 30, y: 60,
        params: {
          seed: 606, height: 1, scale: 2.6, meander: 0.3, width: 0.045,
          depth: 0.9, floor: 0.1
        }
      },
      {
        key: 'crater', type: 'crater', x: 30, y: 330,
        params: {
          seed: 11, height: 1, x: 0.62, y: 0.38, radius: 0.22, depth: 0.7,
          rimHeight: 0.45, rimWidth: 0.14, roughness: 0.3
        }
      },
      {
        key: 'blend', type: 'blend', x: 300, y: 190,
        params: { mode: 'max', opacity: 0.85 }
      },
      {
        key: 'adjust', type: 'adjust', x: 570, y: 190,
        params: { brightness: 0.02, contrast: 0.25, gamma: 1.1 }
      },
      { key: 'out', type: 'output', x: 840, y: 190 }
    ],
    links: [
      { from: 'canyon', to: 'blend', toPort: 'a' },
      { from: 'crater', to: 'blend', toPort: 'b' },
      { from: 'blend', to: 'adjust' },
      { from: 'adjust', to: 'out' }
    ]
  },
  // ────────────────────────────────────────────────────────────────────────
  // 05 · MESA − DUNES — Blend 'subtract' ripples the dune field into the
  //    plateau; a light Blur settles the result.
  // ────────────────────────────────────────────────────────────────────────
  {
    name: '05 · Mesa − Dunes',
    nodes: [
      {
        key: 'mesa', type: 'mesa', x: 30, y: 60,
        params: { seed: 88, height: 1, scale: 2.2, octaves: 5, levels: 8, smooth: 0.2 }
      },
      {
        key: 'dunes', type: 'dunes', x: 30, y: 330,
        params: { seed: 311, height: 1, wavelength: 0.09, direction: 40, warp: 0.75, sharpness: 3.4 }
      },
      {
        key: 'blend', type: 'blend', x: 300, y: 190,
        params: { mode: 'subtract', opacity: 0.35 }
      },
      {
        key: 'blur', type: 'blur', x: 570, y: 190,
        params: { radius: 2 }
      },
      { key: 'out', type: 'output', x: 840, y: 190 }
    ],
    links: [
      { from: 'mesa', to: 'blend', toPort: 'a' },
      { from: 'dunes', to: 'blend', toPort: 'b' },
      { from: 'blend', to: 'blur' },
      { from: 'blur', to: 'out' }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────
  // 06 · NOISE TYPES — Perlin / Ridged / Wire FBM stacked with 'add' and
  //    'screen' blends, then Remap expands the useful range.
  // ────────────────────────────────────────────────────────────────────────
  {
    name: '06 · Noise Types',
    nodes: [
      {
        key: 'nPerlin', type: 'noise', x: 30, y: 60,
        params: {
          seed: 1337, type: 'perlin', scale: 3, octaves: 8,
          lacunarity: 2, gain: 0.5, warp: 0.35, warpScale: 2
        }
      },
      {
        key: 'nRidged', type: 'noise', x: 30, y: 330,
        params: {
          seed: 42, type: 'ridged', scale: 5, octaves: 6,
          lacunarity: 2.2, gain: 0.55, warp: 0.6, warpScale: 2.5
        }
      },
      {
        key: 'nWire', type: 'noise', x: 30, y: 600,
        params: {
          seed: 777, type: 'wire', scale: 8, octaves: 4,
          lacunarity: 2.4, gain: 0.45, warp: 0.2, warpScale: 1.5
        }
      },
      {
        key: 'b1', type: 'blend', x: 300, y: 190,
        params: { mode: 'add', opacity: 0.6 }
      },
      {
        key: 'b2', type: 'blend', x: 570, y: 330,
        params: { mode: 'screen', opacity: 0.35 }
      },
      {
        key: 'remap', type: 'remap', x: 840, y: 330,
        params: { inMin: 0.2, inMax: 0.9, outMin: 0.05, outMax: 1 }
      },
      { key: 'out', type: 'output', x: 1110, y: 330 }
    ],
    links: [
      { from: 'nPerlin', to: 'b1', toPort: 'a' },
      { from: 'nRidged', to: 'b1', toPort: 'b' },
      { from: 'b1', to: 'b2', toPort: 'a' },
      { from: 'nWire', to: 'b2', toPort: 'b' },
      { from: 'b2', to: 'remap' },
      { from: 'remap', to: 'out' }
    ]
  },
  // ────────────────────────────────────────────────────────────────────────
  // 07 · VORONOI + MASKS — two Voronoi features multiplied; a Radial
  //    Gradient runs through Select Range (inverted) to become the mask of
  //    a 'mix' blend that sweeps a Gradient across the cells; Terrace steps it.
  // ────────────────────────────────────────────────────────────────────────
  {
    name: '07 · Voronoi + Masks',
    nodes: [
      {
        key: 'vor1', type: 'voronoi', x: 30, y: 60,
        params: { seed: 42, feature: 'f2minusf1', frequency: 26, smooth: 0.25 }
      },
      {
        key: 'vor2', type: 'voronoi', x: 30, y: 330,
        params: { seed: 88, feature: 'f2', frequency: 12, smooth: 0.4 }
      },
      {
        key: 'b1', type: 'blend', x: 300, y: 190,
        params: { mode: 'multiply', opacity: 0.8 }
      },
      {
        key: 'grad', type: 'gradient', x: 30, y: 600,
        params: { angle: 35, start: 0.1, end: 0.95 }
      },
      {
        key: 'radial', type: 'radial', x: 300, y: 600,
        params: { falloff: 2.2, peak: 1 }
      },
      {
        key: 'sel', type: 'selectrange', x: 570, y: 600,
        params: { position: 0.5, range: 0.3, falloff: 0.4, invert: true }
      },
      {
        key: 'b2', type: 'blend', x: 840, y: 330,
        params: { mode: 'mix', opacity: 0.9 }
      },
      {
        key: 'terrace', type: 'terrace', x: 1110, y: 330,
        params: { steps: 10, smoothness: 0.3 }
      },
      { key: 'out', type: 'output', x: 1380, y: 330 }
    ],
    links: [
      { from: 'vor1', to: 'b1', toPort: 'a' },
      { from: 'vor2', to: 'b1', toPort: 'b' },
      { from: 'b1', to: 'b2', toPort: 'a' },
      { from: 'grad', to: 'b2', toPort: 'b' },
      { from: 'radial', to: 'sel' },
      { from: 'sel', to: 'b2', toPort: 'mask' },
      { from: 'b2', to: 'terrace' },
      { from: 'terrace', to: 'out' }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────
  // 08 · FILTER CHAIN — Billow noise through Terrace → Sharpen → Adjust →
  //    Clamp. Select Range masks a Constant sediment fill into the valleys;
  //    a Slope → Invert → Blur branch is overlaid softly to accent flats.
  // ────────────────────────────────────────────────────────────────────────
  {
    name: '08 · Filter Chain',
    nodes: [
      {
        key: 'noise', type: 'noise', x: 30, y: 60,
        params: {
          seed: 2024, type: 'billow', scale: 2.4, octaves: 7,
          lacunarity: 2.1, gain: 0.55, warp: 0.5, warpScale: 2
        }
      },
      {
        key: 'terrace', type: 'terrace', x: 300, y: 60,
        params: { steps: 6, smoothness: 0.5 }
      },
      {
        key: 'sharpen', type: 'sharpen', x: 570, y: 60,
        params: { amount: 1.2 }
      },
      {
        key: 'adjust', type: 'adjust', x: 840, y: 60,
        params: { brightness: 0.05, contrast: 0.3, gamma: 1.25 }
      },
      {
        key: 'clamp', type: 'clamp', x: 1110, y: 60,
        params: { min: 0.05, max: 0.95 }
      },
      {
        key: 'sel', type: 'selectrange', x: 1110, y: 330,
        params: { position: 0.25, range: 0.2, falloff: 0.5, invert: false }
      },
      {
        key: 'const', type: 'constant', x: 1380, y: 460,
        params: { value: 0.15 }
      },
      {
        key: 'b1', type: 'blend', x: 1380, y: 190,
        params: { mode: 'mix', opacity: 1 }
      },
      {
        key: 'slope', type: 'slope', x: 300, y: 460,
        params: { intensity: 3 }
      },
      { key: 'invert', type: 'invert', x: 570, y: 460 },
      {
        key: 'blur', type: 'blur', x: 840, y: 460,
        params: { radius: 3 }
      },
      {
        key: 'b2', type: 'blend', x: 1650, y: 300,
        params: { mode: 'overlay', opacity: 0.25 }
      },
      { key: 'out', type: 'output', x: 1920, y: 300 }
    ],
    links: [
      { from: 'noise', to: 'terrace' },
      { from: 'terrace', to: 'sharpen' },
      { from: 'sharpen', to: 'adjust' },
      { from: 'adjust', to: 'clamp' },
      { from: 'clamp', to: 'b1', toPort: 'a' },
      { from: 'const', to: 'b1', toPort: 'b' },
      { from: 'clamp', to: 'sel' },
      { from: 'sel', to: 'b1', toPort: 'mask' },
      { from: 'noise', to: 'slope' },
      { from: 'slope', to: 'invert' },
      { from: 'invert', to: 'blur' },
      { from: 'b1', to: 'b2', toPort: 'a' },
      { from: 'blur', to: 'b2', toPort: 'b' },
      { from: 'b2', to: 'out' }
    ]
  },
  // ────────────────────────────────────────────────────────────────────────
  // 09 · EROSION LAB — GAEA's full erosion trio: Hydraulic carves valleys,
  //    Thermal relaxes slopes, Wind streaks the result. Compare before/after
  //    by unchecking "Enabled" on the erosion nodes (GAEA-style bypass).
  // ────────────────────────────────────────────────────────────────────────
  {
    name: '09 · Erosion Lab',
    nodes: [
      {
        key: 'island', type: 'island', x: 30, y: 60,
        params: {
          seed: 555, height: 1, radius: 0.5, coast: 0.5,
          coastScale: 2.5, falloff: 1.5, peak: 0.5
        }
      },
      {
        key: 'hyd', type: 'hydraulic', x: 300, y: 60,
        params: {
          seed: 7, droplets: 90, lifetime: 50, inertia: 0.1, capacity: 7,
          erode: 0.6, deposit: 0.35, evaporate: 0.015, gravity: 6, radius: 3
        }
      },
      {
        key: 'thermal', type: 'thermal', x: 570, y: 60,
        params: { iterations: 40, talus: 0.018, amount: 0.7 }
      },
      {
        key: 'wind', type: 'wind', x: 840, y: 60,
        params: { iterations: 18, direction: 45, strength: 0.35, reach: 3, deposition: 0.6 }
      },
      {
        key: 'sharpen', type: 'sharpen', x: 1110, y: 60,
        params: { amount: 0.8 }
      },
      { key: 'out', type: 'output', x: 1380, y: 60 }
    ],
    links: [
      { from: 'island', to: 'hyd' },
      { from: 'hyd', to: 'thermal' },
      { from: 'thermal', to: 'wind' },
      { from: 'wind', to: 'sharpen' },
      { from: 'sharpen', to: 'out' }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────
  // 10 · DISPLACE WARP — Ridged FBM warped by a Cellular Voronoi map
  //    through Displace (strength 0.12); Classic FBM micro-detail overlaid.
  // ────────────────────────────────────────────────────────────────────────
  {
    name: '10 · Displace Warp',
    nodes: [
      {
        key: 'noise', type: 'noise', x: 30, y: 60,
        params: {
          seed: 314, type: 'ridged', scale: 2.2, octaves: 9,
          lacunarity: 2, gain: 0.55, warp: 0.3, warpScale: 2
        }
      },
      {
        key: 'vor', type: 'voronoi', x: 30, y: 330,
        params: { seed: 88, feature: 'cellular', frequency: 14, smooth: 0.5 }
      },
      {
        key: 'disp', type: 'displace', x: 300, y: 190,
        params: { strength: 0.12, axis: 'both' }
      },
      {
        key: 'detail', type: 'noise', x: 300, y: 460,
        params: {
          seed: 555, type: 'classicfbm', scale: 9, octaves: 3,
          lacunarity: 2, gain: 0.4, warp: 0, warpScale: 2
        }
      },
      {
        key: 'blend', type: 'blend', x: 570, y: 300,
        params: { mode: 'overlay', opacity: 0.3 }
      },
      { key: 'out', type: 'output', x: 840, y: 300 }
    ],
    links: [
      { from: 'noise', to: 'disp', toPort: 'in' },
      { from: 'vor', to: 'disp', toPort: 'map' },
      { from: 'disp', to: 'blend', toPort: 'a' },
      { from: 'detail', to: 'blend', toPort: 'b' },
      { from: 'blend', to: 'out' }
    ]
  },
  // ────────────────────────────────────────────────────────────────────────
  // 11 · SELECT RANGE — Select Range isolates the valleys (position 0.35)
  //    of a Perlin terrain; the mask paints Dunes into the basins only.
  // ────────────────────────────────────────────────────────────────────────
  {
    name: '11 · Select Range',
    nodes: [
      {
        key: 'noise', type: 'noise', x: 30, y: 60,
        params: {
          seed: 611, type: 'perlin', scale: 2.8, octaves: 8,
          lacunarity: 2, gain: 0.5, warp: 0.4, warpScale: 2
        }
      },
      {
        key: 'sel', type: 'selectrange', x: 300, y: 330,
        params: { position: 0.35, range: 0.25, falloff: 0.6, invert: false }
      },
      {
        key: 'dunes', type: 'dunes', x: 30, y: 600,
        params: { seed: 311, height: 1, wavelength: 0.14, direction: 15, warp: 0.5, sharpness: 2.6 }
      },
      {
        key: 'blend', type: 'blend', x: 570, y: 330,
        params: { mode: 'mix', opacity: 1 }
      },
      {
        key: 'hyd', type: 'hydraulic', x: 840, y: 330,
        params: { seed: 19, droplets: 50, lifetime: 42, radius: 3 }
      },
      { key: 'out', type: 'output', x: 1110, y: 330 }
    ],
    links: [
      { from: 'noise', to: 'sel' },
      { from: 'noise', to: 'blend', toPort: 'a' },
      { from: 'dunes', to: 'blend', toPort: 'b' },
      { from: 'sel', to: 'blend', toPort: 'mask' },
      { from: 'blend', to: 'hyd' },
      { from: 'hyd', to: 'out' }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────
  // 12 · FULL PIPELINE — everything together, GAEA-style:
  //    Island max Mountain → Displace (F1 Voronoi, X-only) → Hydraulic →
  //    Thermal → clipped by Radial dome ('min') → Terrace → Adjust.
  // ────────────────────────────────────────────────────────────────────────
  {
    name: '12 · Full Pipeline',
    nodes: [
      {
        key: 'island', type: 'island', x: 30, y: 60,
        params: {
          seed: 1234, height: 1, radius: 0.55, coast: 0.55,
          coastScale: 3, falloff: 1.8, peak: 0.55
        }
      },
      {
        key: 'mountain', type: 'mountain', x: 30, y: 330,
        params: {
          seed: 77, height: 1, x: 0.48, y: 0.5, radius: 0.3,
          steepness: 2.6, elong: 0.3, angle: 40, irregular: 0.42,
          foothills: 0.6, benches: 0.45, roughness: 0.24, roughScale: 5
        }
      },
      {
        key: 'bMax', type: 'blend', x: 300, y: 190,
        params: { mode: 'max', opacity: 1 }
      },
      {
        key: 'vor', type: 'voronoi', x: 300, y: 460,
        params: { seed: 202, feature: 'f1', frequency: 20, smooth: 0.3 }
      },
      {
        key: 'disp', type: 'displace', x: 570, y: 330,
        params: { strength: 0.06, axis: 'x' }
      },
      {
        key: 'hyd', type: 'hydraulic', x: 840, y: 330,
        params: { seed: 21, droplets: 70, lifetime: 46, radius: 3 }
      },
      {
        key: 'thermal', type: 'thermal', x: 1110, y: 330,
        params: { iterations: 30, talus: 0.02, amount: 0.6 }
      },
      {
        key: 'radial', type: 'radial', x: 840, y: 600,
        params: { falloff: 1.4, peak: 1 }
      },
      {
        key: 'bMin', type: 'blend', x: 1380, y: 330,
        params: { mode: 'min', opacity: 1 }
      },
      {
        key: 'terrace', type: 'terrace', x: 1650, y: 330,
        params: { steps: 12, smoothness: 0.2 }
      },
      {
        key: 'adjust', type: 'adjust', x: 1920, y: 330,
        params: { brightness: 0, contrast: 0.2, gamma: 1.05 }
      },
      { key: 'out', type: 'output', x: 2190, y: 330 }
    ],
    links: [
      { from: 'island', to: 'bMax', toPort: 'a' },
      { from: 'mountain', to: 'bMax', toPort: 'b' },
      { from: 'bMax', to: 'disp', toPort: 'in' },
      { from: 'vor', to: 'disp', toPort: 'map' },
      { from: 'disp', to: 'hyd' },
      { from: 'hyd', to: 'thermal' },
      { from: 'thermal', to: 'bMin', toPort: 'a' },
      { from: 'radial', to: 'bMin', toPort: 'b' },
      { from: 'bMin', to: 'terrace' },
      { from: 'terrace', to: 'adjust' },
      { from: 'adjust', to: 'out' }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────
// 13 · WIND SCULPT — Dunes carved by directional Wind Erosion: wind-facing
//    slip faces abrade while fines streak downwind, then Adjust lifts the
//    mid-tones. Turn the Wind node's Direction to reshape the dunes live.
// ────────────────────────────────────────────────────────────────────────
  {
    name: '13 · Wind Sculpt',
    nodes: [
      {
        key: 'dunes', type: 'dunes', x: 30, y: 60,
        params: { seed: 421, height: 1, wavelength: 0.07, direction: 40, warp: 0.6, sharpness: 3 }
      },
      {
        key: 'wind', type: 'wind', x: 300, y: 60,
        params: { iterations: 16, direction: 40, strength: 0.25, reach: 4, deposition: 0.75 }
      },
      {
        key: 'adjust', type: 'adjust', x: 570, y: 60,
        params: { brightness: 0.05, contrast: 0.3, gamma: 1.15 }
      },
      { key: 'out', type: 'output', x: 840, y: 60 }
    ],
    links: [
      { from: 'dunes', to: 'wind' },
      { from: 'wind', to: 'adjust' },
      { from: 'adjust', to: 'out' }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────
  // 14 · SETMAP MATERIALS — Gaea-style material sets: Base Rock with Grass
  //    on lower slopes (by height), Snow on peaks (by height), Mud in
  //    valleys (by slope), and Gravel on steep faces. Switch viewport to
  //    "Materials" mode to see the material colors.
  // ────────────────────────────────────────────────────────────────────────
  {
    name: '14 · SetMap Materials',
    nodes: [
      {
        key: 'mountain', type: 'mountain', x: 30, y: 60,
        params: {
          style: 'massif', seed: 2025, height: 1, x: 0.5, y: 0.52, radius: 0.42,
          steepness: 2.2, bulky: 0.6, elong: 0.25, angle: 55, irregular: 0.38,
          spurs: 0.55, spursFreq: 6, gullies: 0.45,
          foothills: 0.8, benches: 0.5, strataFreq: 8, roughness: 0.2, roughScale: 6
        }
      },
      {
        key: 'hyd', type: 'hydraulic', x: 300, y: 60,
        params: {
          seed: 3, droplets: 45, lifetime: 40, inertia: 0.1, capacity: 5,
          erode: 0.4, deposit: 0.3, evaporate: 0.02, gravity: 5, radius: 3
        }
      },
      {
        key: 'thermal', type: 'thermal', x: 570, y: 60,
        params: { iterations: 18, talus: 0.02, amount: 0.5 }
      },
      {
        key: 'slope', type: 'slope', x: 840, y: 60,
        params: { intensity: 3 }
      },
      {
        key: 'setmap', type: 'setmap', x: 1110, y: 60,
        params: {
          baseMaterial: 'rock',
          layer1Enabled: true, layer1Material: 'grass', layer1Source: 'height', layer1Position: 0.3, layer1Range: 0.25, layer1Falloff: 0.3, layer1Strength: 1, layer1Contrast: 1.2, layer1Priority: 1,
          layer2Enabled: true, layer2Material: 'snow', layer2Source: 'height', layer2Position: 0.7, layer2Range: 0.2, layer2Falloff: 0.25, layer2Strength: 1, layer2Contrast: 1.5, layer2Priority: 2,
          layer3Enabled: true, layer3Material: 'mud', layer3Source: 'slope', layer3Position: 0.6, layer3Range: 0.3, layer3Falloff: 0.3, layer3Strength: 0.8, layer3Contrast: 1.1, layer3Priority: 0,
          layer4Enabled: true, layer4Material: 'gravel', layer4Source: 'slope', layer4Position: 0.7, layer4Range: 0.2, layer4Falloff: 0.25, layer4Strength: 0.9, layer4Contrast: 1.3, layer4Priority: 3,
        }
      },
      { key: 'out', type: 'output', x: 1380, y: 60 }
    ],
    links: [
      { from: 'mountain', to: 'hyd' },
      { from: 'hyd', to: 'thermal' },
      { from: 'thermal', to: 'slope' },
      { from: 'thermal', to: 'setmap', toPort: 'height' },
      { from: 'slope', to: 'setmap', toPort: 'slope' },
      { from: 'setmap', to: 'out' }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────
  // 15 · SMART COLOR — Gaea-style physically-driven coloring. Terrain →
  //    erosion (which emits Wear/Sediment masks) → SmartColor. SmartColor
  //    builds a CLUT gradient from altitude, then blends in slope-based rock
  //    exposure, curvature weathering (ridges vs valleys), and erosion
  //    wear/sediment. In the viewport switch to "🌍 Smart" mode.
  // ────────────────────────────────────────────────────────────────────────
  {
    name: '15 · Smart Color',
    nodes: [
      {
        key: 'mountain', type: 'mountain', x: 30, y: 60,
        params: {
          style: 'alpine', seed: 2025, height: 1, x: 0.5, y: 0.52, radius: 0.42,
          steepness: 2.5, bulky: 0.45, elong: 0.3, angle: 55, irregular: 0.4,
          spurs: 0.7, spursFreq: 6, gullies: 0.55,
          foothills: 0.85, benches: 0.5, strataFreq: 8, roughness: 0.22, roughScale: 6
        }
      },
      {
        key: 'hyd', type: 'hydraulic', x: 300, y: 60,
        params: {
          seed: 3, droplets: 70, lifetime: 50, inertia: 0.1, capacity: 6,
          erode: 0.5, deposit: 0.35, evaporate: 0.02, gravity: 5.5, radius: 3
        }
      },
      {
        key: 'thermal', type: 'thermal', x: 570, y: 60,
        params: { iterations: 25, talus: 0.02, amount: 0.6 }
      },
      {
        key: 'smart', type: 'smartcolor', x: 840, y: 60,
        params: {
          snowLine: 0.82,
          rockExposure: 0.8,
          useErosion: true,
          saturation: 1.05,
          contrast: 1.05,
        }
      },
      { key: 'out', type: 'output', x: 1110, y: 60 }
    ],
    links: [
      { from: 'mountain', to: 'hyd' },
      { from: 'hyd', to: 'thermal' },
      { from: 'thermal', to: 'smart', toPort: 'height' },
      { from: 'hyd', to: 'smart', toPort: 'wear' },
      { from: 'hyd', to: 'smart', toPort: 'sediment' },
      { from: 'smart', to: 'out' }
    ]
  }
];
