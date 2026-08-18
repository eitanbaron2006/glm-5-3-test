/* GAEA-style primitive terrain shapes.

   DESIGN RULE (GAEA-like): every primitive emits exactly ONE feature —
   one mountain, one island, one ridge, one peak. Multi-feature terrain
   is composed by combining multiple nodes in the graph (Blend/Add). */
import { Heightmap } from '../core/heightmap';
import { NodeTypeDefinition } from '../core/graph';
import { FBM, mulberry32, PerlinNoise, voronoi } from '../core/noise';
import { makeSize } from './generators';

const PRI = '#8e352e';

/** Shared smoothstep helper for [0,1]-clamped input. */
const ss = (t: number) => {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Soft terracing: quantize t into `steps` benches with smoothstep risers. */
const terrace = (t: number, steps: number, soft: number) => {
  const q = 1 / steps;
  const k = Math.floor(Math.min(t, 0.999999) / q);
  const f = (t - k * q) / q;
  const lo = 0.5 - soft * 0.5, hi = 0.5 + soft * 0.5;
  return (k + ss((f - lo) / (hi - lo))) * q;
};

/** Rich Voronoi field sample: F1/F2 distances (in cell units, where one
    grid cell spans 1.0) plus the winning cell's hash — the hash drives
    per-cell height modulation ("modulated Voronoi pattern"). */
const voroField = (u: number, v: number, seed: number) => {
  const gx = Math.floor(u), gy = Math.floor(v);
  let f1 = Infinity, f2 = Infinity, hash = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = gx + ox, cy = gy + oy;
      const hs = (cx * 374761393 + cy * 668265263 + seed * 2246822519) >>> 0;
      const jx = ((hs & 0xffff) / 65535) * 0.8 + 0.1;
      const jy = (((hs >>> 8) & 0xffff) / 65535) * 0.8 + 0.1;
      const ddx = cx + jx - u, ddy = cy + jy - v;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < f1) { f2 = f1; f1 = d; hash = hs; }
      else if (d < f2) { f2 = d; }
    }
  }
  return { f1: Math.min(f1, 1), f2: Math.min(f2, 1.6), hash };
};

/** Center-weighted 3x3 box smoothing (Old-mountain softening). */
const blurHeightmap = (h: Heightmap, passes: number) => {
  const s = h.size;
  for (let p = 0; p < passes; p++) {
    const src = Float32Array.from(h.data);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        let sum = 0, n = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const xx = x + ox, yy = y + oy;
            if (xx < 0 || yy < 0 || xx >= s || yy >= s) continue;
            const w = (ox === 0 ? 2 : 1) * (oy === 0 ? 2 : 1);
            sum += src[yy * s + xx] * w;
            n += w;
          }
        }
        h.data[y * s + x] = sum / n;
      }
    }
  }
  return h;
};

/** Mountain V2 GeoPrimitive — faithful to QuadSpinner GAEA:
    implements GAEA's Mountain parameter set (Scale, Height, Style, Bulk,
    Reduce Details, Seed, X, Y) exactly as documented, and follows the
    node's documented construction — "a modulated Voronoi pattern and
    distortions" (docs.gaea.app — Mountain): per-cell Voronoi cones with
    hash-modulated summit heights, joined by cell-wall ridgelines into a
    single central massif, bent organic by tectonic domain warp — a
    dominant summit, several secondary peaks, sharp crests over low
    valleys, a foothill skirt fanning into quiet plains.

    Behavior follows the real node, verified against the official docs
    (GAEA 2, docs.gaea.app — Mountain, Terrain › Primitive) and renderBucket's
    Lush Valleys tutorial (GAEA 1.3.2, youtube.com/watch?v=7XfdVYVMYs0):
    the raw Mountain is a clean large-scale BASE — artists add Fractal
    Terraces, ridge noise, and erosion downstream — so Basic is the default
    style. Bulk High is officially "thick, heavy mountains with substantial
    volume and broad bases"; in the tutorial, enabling Bulky makes the whole
    mass "a ton higher" via a fuller body and broader base.

    Style modulates geology: Basic (clean construction mass), Eroded
    (weathered gullies, worn crests), Old (ancient, rounded, softened),
    Alpine (young, sharp, dramatic relief), Strata (sedimentary banding).
    Bulk sets mass: Low (slender, delicate), Medium (balanced), High
    (thick, heavy, broad-based). Reduce Details strips fine surface
    detail for distant/simple assets. */
export const MountainV2Node: NodeTypeDefinition = {
  type: 'mountainV2',
  title: 'Mountain V2',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    {
      id: 'style',
      label: 'Style',
      type: 'select',
      default: 'basic',
      options: [
        { value: 'basic', label: 'Basic' },
        { value: 'eroded', label: 'Eroded' },
        { value: 'old', label: 'Old' },
        { value: 'alpine', label: 'Alpine' },
        { value: 'strata', label: 'Strata' },
      ],
    },
    { id: 'seed', label: 'Seed', type: 'seed', default: 2025 },
    { id: 'scale', label: 'Scale', type: 'slider', min: 0.15, max: 0.65, step: 0.01, default: 0.42 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    {
      id: 'bulk',
      label: 'Bulk',
      type: 'select',
      default: 'medium',
      options: [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ],
    },
    { id: 'reduceDetails', label: 'Reduce Details', type: 'check', default: false },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);

    const style = (p.style ?? 'basic') as 'basic' | 'eroded' | 'old' | 'alpine' | 'strata';
    const seed = p.seed ?? 2025;
    const heightMult = p.height ?? 1;
    const cx = p.x ?? 0.5;
    const cy = p.y ?? 0.5;
    const scale = Math.max(0.1, p.scale ?? p.radius ?? 0.42);
    const reduce = p.reduceDetails ?? false;

    // Bulk: Low = slender/delicate, Medium = balanced, High = thick/heavy
    // ("substantial volume and broad bases"). maskQ shapes the footprint
    // falloff (higher = more slender), width the base breadth, floor the
    // valley floor inside the massif, boost the dominant summit's mass.
    // Legacy numeric p.bulky (0..1) maps onto the same three levels.
    let bulk = p.bulk ?? 'medium';
    if (typeof bulk === 'number') bulk = bulk >= 0.66 ? 'high' : bulk >= 0.33 ? 'medium' : 'low';
    const bulkCfg = bulk === 'low'
      ? { maskQ: 2.6, width: 0.85, floor: 0.14, boost: 0.05 }
      : bulk === 'high'
        ? { maskQ: 1.25, width: 1.5, floor: 0.5, boost: 0.24 }
        : { maskQ: 1.9, width: 1.05, floor: 0.3, boost: 0.12 };

    // Per-style geology on the Voronoi construction: peak = per-cell cone
    // exponent (higher = sharper summit), edge = cell-wall ridge exponent,
    // edgeAmp = wall-ridge strength vs peaks, sharp = global sharpening,
    // warp = domain distortion (in cell units), oct = Voronoi octaves,
    // gully = erosion channel strength, soften = smoothing passes (Old),
    // strata = sedimentary benching amount, micro = fine ridge detail.
    const styleCfg = {
      basic:  { peak: 2.0,  edge: 1.7,  edgeAmp: 0.6,  sharp: 1.0,  warp: 0.32, oct: 2, gully: 0,    soften: 0, strata: 0,   micro: 0.05 },
      eroded: { peak: 2.2,  edge: 1.8,  edgeAmp: 0.62, sharp: 1.05, warp: 0.38, oct: 2, gully: 0.48, soften: 0, strata: 0,   micro: 0.1 },
      old:    { peak: 1.3,  edge: 1.25, edgeAmp: 0.5,  sharp: 0.9,  warp: 0.5,  oct: 2, gully: 0.14, soften: 3, strata: 0,   micro: 0.02 },
      alpine: { peak: 3.0,  edge: 2.4,  edgeAmp: 0.72, sharp: 1.25, warp: 0.3,  oct: 3, gully: 0.16, soften: 0, strata: 0,   micro: 0.22 },
      strata: { peak: 2.0,  edge: 1.7,  edgeAmp: 0.6,  sharp: 1.0,  warp: 0.34, oct: 2, gully: 0.1,  soften: 0, strata: 0.8, micro: 0.06 },
    }[style];

    const octaves = reduce ? 1 : styleCfg.oct;
    const detail = reduce ? 0.35 : 1;

    // Distortion + modulation engines
    const warpX = new FBM(seed + 11, 3, 2.0, 0.5, 'perlin');    // domain distortion X
    const warpY = new FBM(seed + 29, 3, 2.0, 0.5, 'perlin');    // domain distortion Y
    const shapeFBM = new FBM(seed + 53, 3, 2.0, 0.5, 'perlin'); // footprint irregularity
    const massFBM = new FBM(seed + 71, 3, 2.0, 0.5, 'perlin');  // large-scale height modulation
    const gullyFBM = new FBM(seed + 83, 5, 2.05, 0.5, 'ridged');// erosion channels
    const microFBM = new FBM(seed + 131, 4, 2.2, 0.5, 'ridged');// fine micro-ridges
    const plainFBM = new FBM(seed + 199, 3, 2.0, 0.5, 'perlin');// surrounding plain

    // Cell frequency: ~2-3 Voronoi cells across the massif core, so the
    // landform reads as ONE mountain with several summits, not a range.
    const freq = 2.3 / scale;
    const warpUV = styleCfg.warp / freq; // distortion measured in cell units

    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1);
        const v = y / (s - 1);
        const dx = u - cx;
        const dy = v - cy;
        const angle = Math.atan2(dy, dx);

        // 1. Distortions: continuous tectonic domain warp. Applied BEFORE
        //    the Voronoi field, it bends cell walls and ridge lines into
        //    organic curved arêtes instead of straight polygon seams.
        const wx = warpX.sample(u * 2.6 + 5, v * 2.6 + 7) * warpUV;
        const wy = warpY.sample(u * 2.6 + 13, v * 2.6 + 17) * warpUV;
        const su = u + wx, sv = v + wy;

        // 2. Massif footprint: warped radial falloff with seam-free
        //    boundary irregularity; bulk sets width + profile exponent.
        const shapeN = shapeFBM.sample(Math.cos(angle) * 1.4 + 5, Math.sin(angle) * 1.4 + 5);
        const mx = dx + wx * 0.5, my = dy + wy * 0.5;
        const d = Math.sqrt(mx * mx + my * my)
          / (scale * bulkCfg.width * (1 + 0.22 * shapeN));
        const mask = Math.pow(Math.max(0, 1 - d), bulkCfg.maskQ);

        // 3. Modulated Voronoi ridge field — the documented construction.
        //    Each octave takes max(per-cell cone peak, cell-wall ridge).
        //    Summit height is modulated per cell by its hash (every peak a
        //    different height), and later octaves only fill in the lows,
        //    so minor ridges bud off the major structure (fractal massing).
        let t = 0, f = freq, amp = 1;
        for (let o = 0; o < octaves; o++) {
          const vf = voroField(su * f, sv * f, seed + o * 101);
          const cellH = 0.62 + 0.38 * ((vf.hash >>> 16) & 0xff) / 255;
          const peak = Math.pow(Math.max(0, 1 - vf.f1), styleCfg.peak) * cellH;
          const edge = Math.pow(Math.max(0, 1 - Math.min(vf.f2 - vf.f1, 1)), styleCfg.edge)
            * styleCfg.edgeAmp;
          const o1 = Math.max(peak, edge);
          t = o === 0 ? o1 : t + amp * o1 * Math.max(0, 1 - Math.min(t, 1));
          amp *= 0.42;
          f *= 2.15;
        }

        // 4. Global sharpening + large-scale modulation (the "modulated"
        //    part: whole ridge complexes rise and fall across the massif)
        //    + fine micro-ridge detail on the flanks
        let mountain = Math.pow(Math.min(Math.max(t, 0), 1), styleCfg.sharp);
        mountain *= 0.8 + 0.4 * (massFBM.sample(u * 1.8 + 31, v * 1.8 + 17) * 0.5 + 0.5);
        const micro = microFBM.sample(u * 14 + 60, v * 14 + 60);
        mountain *= 1 + detail * styleCfg.micro * (micro - 0.5);

        // 5. Massing: valleys ride at the bulk floor, ridges carve above
        //    it; a small summit boost keeps ONE dominant central peak.
        let core = mask * (bulkCfg.floor + (1 - bulkCfg.floor) * mountain);
        core += Math.exp(-d * d * 22) * bulkCfg.boost;

        // 6. Erosion gullies: ridged channels cut into the flanks (Eroded)
        if (styleCfg.gully > 0) {
          const g = gullyFBM.sample(u * 6.5 + 20, v * 6.5 + 20);
          core *= 1 - detail * styleCfg.gully * Math.pow(1 - g, 1.7) * Math.min(core, 1);
        }

        // 7. Strata: quantize into sedimentary benches following the form
        if (styleCfg.strata > 0 && core > 0) {
          core = lerp(core, terrace(Math.min(core, 0.999999), 9, 0.24), styleCfg.strata);
        }

        // 8. Quiet plains + foothill skirt fanning from the base
        const plain = (plainFBM.sample(u * 1.5 + 3, v * 1.5 + 7) * 0.5 + 0.5) * 0.025
          + Math.exp(-Math.max(0, d - 1) * 1.5) * 0.04;

        h.set(x, y, Math.max(0, plain + core * heightMult));
      }
    }

    // Old mountains: smooth crests back toward rounded ancient domes
    if (styleCfg.soften > 0) blurHeightmap(h, styleCfg.soften);

    return h.normalize();
  }
};

/** Mountain GeoPrimitive — the original construction: modulated Voronoi
    patterns, domain warp tectonic distortion, heterogeneous ridged fractal
    detail, volumetric bulky massing, and adjustable edge sprawl falloff. */
export const MountainNode: NodeTypeDefinition = {
  type: 'mountain',
  title: 'Mountain',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    {
      id: 'style',
      label: 'Mountain Type',
      type: 'select',
      default: 'alpine',
      options: [
        { value: 'alpine', label: 'Type 1 (Alpine Horn)' },
        { value: 'massif', label: 'Type 2 (Massif Block)' },
        { value: 'spined', label: 'Type 3 (Spined Crest)' },
        { value: 'craggy', label: 'Type 4 (Craggy Shattered)' },
      ],
    },
    { id: 'seed', label: 'Seed', type: 'seed', default: 2025 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'scale', label: 'Mountain Scale', type: 'slider', min: 0.1, max: 0.65, step: 0.01, default: 0.4 },
    { id: 'edge', label: 'Edge Falloff', type: 'slider', min: 0.8, max: 4.5, step: 0.05, default: 2.2 },
    { id: 'bulky', label: 'Bulky / Volume', type: 'slider', min: 0, max: 1, step: 0.02, default: 0.5 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'elong', label: 'Elongation', type: 'slider', min: 0, max: 0.85, step: 0.02, default: 0.25 },
    { id: 'angle', label: 'Orientation', type: 'slider', min: 0, max: 180, step: 1, default: 45, integer: true },
    { id: 'irregular', label: 'Base Irregularity', type: 'slider', min: 0, max: 0.8, step: 0.01, default: 0.35 },
    { id: 'roughness', label: 'Flank Roughness', type: 'slider', min: 0, max: 0.5, step: 0.01, default: 0.2 },
    { id: 'roughScale', label: 'Roughness Scale', type: 'slider', min: 1, max: 15, step: 0.5, default: 5 },
    { id: 'foothills', label: 'Foothills Apron', type: 'slider', min: 0, max: 1, step: 0.02, default: 0.4 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);

    const style = (p.style ?? 'alpine') as 'alpine' | 'massif' | 'spined' | 'craggy';
    const seed = p.seed ?? 2025;
    const heightMult = p.height ?? 1;
    const cx = p.x ?? 0.5;
    const cy = p.y ?? 0.5;
    const scale = Math.max(0.1, (p.scale ?? p.radius ?? 0.4));
    const edge = p.edge ?? p.steepness ?? 2.2;
    const bulky = p.bulky ?? 0.5;
    const elong = p.elong ?? 0.25;
    const angle = ((p.angle ?? 45) * Math.PI) / 180;
    const irregular = p.irregular ?? 0.35;
    const roughness = p.roughness ?? 0.2;
    const roughScale = p.roughScale ?? 5;
    const foothills = p.foothills ?? 0.4;

    // Multi-frequency GAEA noise engines
    const warp1 = new FBM(seed + 11, 4, 2.0, 0.5, 'perlin');
    const warp2 = new FBM(seed + 29, 4, 2.0, 0.5, 'perlin');
    const spineNoise = new FBM(seed + 47, 4, 2.0, 0.5, 'perlin');
    const ridgedFBM1 = new FBM(seed + 71, 6, 2.0, 0.5, 'ridged');
    const ridgedFBM2 = new FBM(seed + 103, 5, 2.1, 0.5, 'ridged');
    const rockFBM = new FBM(seed + 157, 5, 2.2, 0.5, 'ridged');
    const baseFBM = new FBM(seed + 199, 4, 2.0, 0.5, 'perlin');

    const ca = Math.cos(angle), sa = Math.sin(angle);

    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1);
        const v = y / (s - 1);
        const dx = u - cx;
        const dy = v - cy;

        // 1. Smooth, continuous tectonic domain warping
        const wx = dx + warp1.sample(u * 2.0 + 5, v * 2.0 + 7) * irregular * 0.2;
        const wy = dy + warp2.sample(u * 2.0 + 13, v * 2.0 + 17) * irregular * 0.2;

        // 2. Anisotropic coordinate rotation & primary ridge alignment
        const rx = (wx * ca + wy * sa) / (1 + elong);
        let ry = (-wx * sa + wy * ca) * (1 + elong);
        const meander = spineNoise.sample(rx * 2.5 + 3, 11) * 0.15 * elong;
        ry -= meander;

        const d = Math.sqrt(rx * rx + ry * ry) / scale;

        // 3. Smooth, continuous falloff envelope (Continuous to infinity, zero step discontinuities)
        const baseEnvelope = Math.exp(-Math.pow(d, edge) * 2.2);

        // 4. Primary Mountain Spine Crest (knife-edge ridge)
        const spineDist = Math.abs(ry) / scale;
        const spineRidge = Math.exp(-spineDist * spineDist * 14.0) * Math.exp(-Math.abs(rx) / scale * 1.5);

        // 5. Multi-cellular Voronoi Fractures (Rock Buttresses & Arêtes)
        const cu = u * 4.0 + wx * 0.8;
        const cv = v * 4.0 + wy * 0.8;
        const vf1 = voronoi(cu, cv, 1, seed, 'f1');
        const vdiff = voronoi(cu, cv, 1, seed, 'f2minusf1');
        const voronoiStructure = (1 - vf1) * 0.6 + vdiff * 0.4;

        // 6. Multi-octave Ridged Flank Detail
        const flank1 = ridgedFBM1.sample(u * roughScale + 20, v * roughScale + 20) * 0.5 + 0.5;
        const flank2 = ridgedFBM2.sample(u * roughScale * 2 + 40, v * roughScale * 2 + 40) * 0.5 + 0.5;
        const rockCrag = rockFBM.sample(u * roughScale * 3 + 80, v * roughScale * 3 + 80) * 0.5 + 0.5;

        // 7. Geological Style synthesis
        let mountainSculpt = 0;
        if (style === 'alpine') {
          const aretes = Math.pow(flank1, 1.8);
          mountainSculpt = spineRidge * 0.45 + voronoiStructure * 0.35 + aretes * 0.35 + rockCrag * roughness * 0.4;
        } else if (style === 'massif') {
          mountainSculpt = spineRidge * 0.25 + voronoiStructure * 0.55 + flank1 * 0.35 + rockCrag * roughness * 0.3;
        } else if (style === 'spined') {
          mountainSculpt = spineRidge * 0.65 + voronoiStructure * 0.25 + flank1 * 0.25;
        } else {
          // craggy
          mountainSculpt = voronoiStructure * 0.5 + vdiff * 0.35 + rockCrag * 0.35;
        }

        // 8. Volumetric Massing (Bulky)
        // Shapes the envelope smoothly from base to peak
        const bulkFactor = 1.6 - bulky * 0.9; // 1.6 (sharp) to 0.7 (full bulk)
        const mountainCore = Math.pow(baseEnvelope, bulkFactor) * (0.35 + 0.65 * mountainSculpt);

        // 9. Quiet surrounding base plain
        const basePlain = baseFBM.sample(u * 1.5 + 3, v * 1.5 + 7) * 0.02;

        const total = basePlain + mountainCore * heightMult;
        h.set(x, y, Math.max(0, total));
      }
    }

    return h.normalize();
  }
};

/** ONE island: a single connected landmass with an irregular coastline. */
export const IslandNode: NodeTypeDefinition = {
  type: 'island',
  title: 'Island',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 777 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'radius', label: 'Island Radius', type: 'slider', min: 0.3, max: 0.75, step: 0.01, default: 0.52 },
    { id: 'coast', label: 'Coast Irregularity', type: 'slider', min: 0, max: 1, step: 0.02, default: 0.5 },
    { id: 'coastScale', label: 'Coast Scale', type: 'slider', min: 1, max: 6, step: 0.1, default: 2.5 },
    { id: 'falloff', label: 'Coast Falloff', type: 'slider', min: 0.5, max: 4, step: 0.05, default: 1.6 },
    { id: 'peak', label: 'Interior Peaks', type: 'slider', min: 0, max: 1, step: 0.02, default: 0.6 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const warp = new FBM(p.seed + 9, 4, 2, 0.5, 'perlin');
    const interior = new FBM(p.seed, 7, 2, 0.5, 'ridged');
    const R = p.radius * 2; // radius is relative to the half-width
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1) * 2 - 1 - (p.x * 2 - 1);
        const v = y / (s - 1) * 2 - 1 - (p.y * 2 - 1);
        // domain warp bends the coastline into bays & peninsulas
        const wx = warp.sample(u * p.coastScale + 31, v * p.coastScale) * p.coast * 0.3;
        const wy = warp.sample(u * p.coastScale, v * p.coastScale + 77) * p.coast * 0.3;
        const d = Math.sqrt((u + wx) * (u + wx) + (v + wy) * (v + wy)) / R;
        const mask = Math.pow(Math.max(0, 1 - d), p.falloff);
        // positive base floor guarantees ONE connected landmass (no interior seas)
        const m = interior.sample(u * 3, v * 3) * 0.5 + 0.5;
        h.set(x, y, mask * ((1 - p.peak) + p.peak * m));
      }
    }
    return h.normalize();
  }
};

/** ONE ridge: a single elongated crest line with meander and rocky detail. */
export const RidgeNode: NodeTypeDefinition = {
  type: 'ridge',
  title: 'Ridge',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 4242 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'angle', label: 'Angle', type: 'slider', min: 0, max: 180, step: 1, default: 25, integer: true },
    { id: 'length', label: 'Length', type: 'slider', min: 0.3, max: 1.4, step: 0.02, default: 1.1 },
    { id: 'width', label: 'Width', type: 'slider', min: 0.06, max: 0.45, step: 0.01, default: 0.18 },
    { id: 'sharpness', label: 'Sharpness', type: 'slider', min: 1, max: 6, step: 0.05, default: 2.4 },
    { id: 'meander', label: 'Meander', type: 'slider', min: 0, max: 0.5, step: 0.02, default: 0.22 },
    { id: 'roughness', label: 'Rock Roughness', type: 'slider', min: 0, max: 0.5, step: 0.02, default: 0.3 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const warp = new FBM(p.seed + 17, 4, 2, 0.5, 'perlin');
    const rock = new FBM(p.seed, 6, 2, 0.5, 'ridged');
    const rad = (p.angle * Math.PI) / 180;
    const ca = Math.cos(rad), sa = Math.sin(rad);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1) * 2 - 1 - (p.x * 2 - 1);
        const v = y / (s - 1) * 2 - 1 - (p.y * 2 - 1);
        const along = u * ca + v * sa;           // coordinate along the crest
        const perp = -u * sa + v * ca;           // coordinate across the crest
        // gentle meander so the ridge snakes instead of being ruler-straight
        const bend = warp.sample(along * 1.6 + 9, 3.3) * p.meander;
        // distance to the crest SEGMENT (tapers at both ends -> one ridge)
        const over = Math.max(0, Math.abs(along + bend) - p.length);
        const dseg = Math.sqrt(over * over + perp * perp) / p.width;
        const crest = Math.pow(Math.max(0, 1 - dseg), p.sharpness);
        const detail = rock.sample(u * 5 + 9, v * 5 + 9) * 0.5 + 0.5;
        h.set(x, y, crest * (1 + p.roughness * (detail - 0.5) * 2));
      }
    }
    return h.normalize();
  }
};

/** Peaks: defaults to ONE central peak; raise Count for a tight cluster. */
export const PeaksNode: NodeTypeDefinition = {
  type: 'peaks',
  title: 'Peaks',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 99 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'count', label: 'Peak Count', type: 'slider', min: 1, max: 10, step: 1, default: 1, integer: true },
    { id: 'spread', label: 'Cluster Spread', type: 'slider', min: 0.02, max: 0.42, step: 0.01, default: 0.1 },
    { id: 'falloff', label: 'Falloff', type: 'slider', min: 1, max: 4, step: 0.05, default: 2 },
    { id: 'variation', label: 'Height Variation', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.35 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const rand = mulberry32(p.seed);
    const px: number[] = [], py: number[] = [], ph: number[] = [], pr: number[] = [];
    for (let i = 0; i < p.count; i++) {
      px.push(0.5 + (rand() * 2 - 1) * p.spread);
      py.push(0.5 + (rand() * 2 - 1) * p.spread);
      ph.push(1 - p.variation * rand());
      pr.push(0.42 + 0.28 * rand()); // wide bases: peaks read as one massif
    }
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1), v = y / (s - 1);
        let best = 0;
        for (let i = 0; i < p.count; i++) {
          const dx = u - px[i] - (p.x - 0.5), dy = v - py[i] - (p.y - 0.5);
          const d = Math.sqrt(dx * dx + dy * dy) / pr[i];
          const val = ph[i] * Math.pow(Math.max(0, 1 - d), p.falloff);
          if (val > best) best = val;
        }
        h.set(x, y, best);
      }
    }
    return h.normalize();
  }
};

export const CraterNode: NodeTypeDefinition = {
  type: 'crater',
  title: 'Crater',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 11 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'radius', label: 'Radius', type: 'slider', min: 0.05, max: 0.45, step: 0.01, default: 0.25 },
    { id: 'depth', label: 'Depth', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'rimHeight', label: 'Rim Height', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.35 },
    { id: 'rimWidth', label: 'Rim Width', type: 'slider', min: 0.05, max: 0.5, step: 0.01, default: 0.18 },
    { id: 'roughness', label: 'Roughness', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.25 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const fbm = new FBM(p.seed, 5, 2, 0.5, 'ridged');
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1), v = y / (s - 1);
        const dx = u - p.x, dy = v - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) / p.radius;
        const bowl = d < 1 ? -p.depth * (1 - d * d) : 0;
        const rim = p.rimHeight * Math.exp(-Math.pow((d - 1) / p.rimWidth, 2));
        const rough = (fbm.sample(u * 6, v * 6) - 0.5) * p.roughness * Math.exp(-Math.max(0, d - 1) * 2);
        h.set(x, y, Math.min(Math.max(0.6 + bowl + rim + rough, 0), 1));
      }
    }
    return h.normalize();
  }
};

export const CanyonNode: NodeTypeDefinition = {
  type: 'canyon',
  title: 'Canyon',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 606 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'scale', label: 'Feature Scale', type: 'slider', min: 1, max: 8, step: 0.1, default: 2 },
    { id: 'meander', label: 'Meander', type: 'slider', min: 0, max: 0.35, step: 0.01, default: 0.2 },
    { id: 'width', label: 'Channel Width', type: 'slider', min: 0.01, max: 0.15, step: 0.005, default: 0.05 },
    { id: 'depth', label: 'Depth', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.85 },
    { id: 'floor', label: 'Floor Level', type: 'slider', min: 0, max: 0.5, step: 0.01, default: 0.12 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const fbm = new FBM(p.seed, 6, 2, 0.5, 'perlin');
    const meander = new FBM(p.seed + 77, 3, 2, 0.5, 'perlin');
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1) + (p.x - 0.5), v = y / (s - 1) + (p.y - 0.5);
        const n = fbm.sample(u * p.scale, v * p.scale) * 0.5 + 0.5;
        const c = 0.5 + (meander.sample(u * 3 + 40, 8.2) * 0.5 + 0.5 - 0.5) * 2 * p.meander;
        const dist = Math.abs(v - c);
        const t = ss((dist - p.width) / (p.width * 1.2));
        const carved = p.floor + (n - p.floor) * t;
        h.set(x, y, Math.min(Math.max(n * (1 - p.depth) + carved * p.depth, 0), 1));
      }
    }
    return h.normalize();
  }
};

export const DunesNode: NodeTypeDefinition = {
  type: 'dunes',
  title: 'Dunes',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 311 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'wavelength', label: 'Wavelength', type: 'slider', min: 0.02, max: 0.25, step: 0.005, default: 0.12 },
    { id: 'direction', label: 'Direction', type: 'slider', min: 0, max: 180, step: 1, default: 15, integer: true },
    { id: 'warp', label: 'Domain Warp', type: 'slider', min: 0, max: 1, step: 0.02, default: 0.6 },
    { id: 'sharpness', label: 'Sharpness', type: 'slider', min: 1, max: 6, step: 0.05, default: 2.5 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const warp = new FBM(p.seed, 4, 2, 0.5, 'perlin');
    const detail = new FBM(p.seed + 19, 4, 2, 0.5, 'perlin');
    const rad = (p.direction * Math.PI) / 180;
    const sa = Math.sin(rad), ca = Math.cos(rad);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1) + (p.x - 0.5), v = y / (s - 1) + (p.y - 0.5);
        const proj = u * sa + v * ca;
        const off = (warp.sample(u * 3, v * 3) * 0.5 + 0.5 - 0.5) * p.warp * 2;
        const ph = (proj / p.wavelength + off) * Math.PI * 2;
        const crest = Math.pow(1 - Math.abs(Math.sin(ph)), p.sharpness);
        const fine = detail.sample(u * 5 + 9, v * 5 + 9) * 0.5 + 0.5;
        h.set(x, y, crest * 0.85 + fine * 0.15);
      }
    }
    return h.normalize();
  }
};

/** Volcano GeoPrimitive — faithful to QuadSpinner GAEA:
    implements GAEA's Volcano parameter set (Scale, Height, Mouth, Bulk,
    Surface, X, Y, Seed) as a stratovolcanic landform — broad concave
    flanks rising to a deep crater with steep inner walls, an uneven floor
    and a raised rim. Surface: Eroded carves polar-space ridged drainage
    (radial gullies between knife-edge ridges) plus fine flank texture;
    Surface: Smooth yields the clean construction cone. A seam-free
    periodic footprint noise breaks the circle into natural irregularity. */
export const VolcanoNode: NodeTypeDefinition = {
  type: 'volcano',
  title: 'Volcano',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    {
      id: 'surface',
      label: 'Surface',
      type: 'select',
      default: 'eroded',
      options: [
        { value: 'smooth', label: 'Smooth' },
        { value: 'eroded', label: 'Eroded' },
      ],
    },
    { id: 'seed', label: 'Seed', type: 'seed', default: 5 },
    { id: 'scale', label: 'Scale', type: 'slider', min: 0.15, max: 0.6, step: 0.01, default: 0.42 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'mouth', label: 'Mouth', type: 'slider', min: 0.1, max: 0.8, step: 0.01, default: 0.34 },
    { id: 'bulk', label: 'Bulk', type: 'slider', min: 0, max: 1, step: 0.02, default: 0.5 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);

    const surface = (p.surface ?? 'eroded') as 'smooth' | 'eroded';
    const seed = p.seed ?? 5;
    const heightMult = p.height ?? 1;
    const cx = p.x ?? 0.5;
    const cy = p.y ?? 0.5;
    const scale = Math.max(0.1, p.scale ?? p.radius ?? 0.42);
    const mouth = Math.min(0.85, p.mouth ?? p.calderaWidth ?? 0.34);
    const bulk = p.bulk ?? 0.5;

    // Multi-frequency GAEA noise engines
    const shapeFBM = new FBM(seed + 13, 4, 2.0, 0.5, 'perlin');  // footprint irregularity
    const gullyFBM = new FBM(seed + 41, 5, 2.0, 0.5, 'ridged');  // radial drainage
    const regionFBM = new FBM(seed + 61, 3, 2.0, 0.5, 'perlin'); // regional gully strength
    const flankFBM = new FBM(seed + 89, 5, 2.1, 0.5, 'ridged');  // fine flank texture
    const floorFBM = new FBM(seed + 137, 3, 2.0, 0.5, 'perlin'); // crater floor relief
    const plainFBM = new FBM(seed + 173, 3, 2.0, 0.5, 'perlin'); // surrounding plain

    // Surface mode: Eroded carries GAEA's weathered drainage; Smooth is clean.
    const gullyAmp = surface === 'eroded' ? 0.24 : 0.04;
    const flankAmp = surface === 'eroded' ? 0.14 : 0.03;

    // Bulk shapes the profile exponent: low = sharp concave stratovolcano
    // (steep summit, gentle base apron), high = massive full-bodied shield.
    const q = 2.5 - 1.15 * bulk;

    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1);
        const v = y / (s - 1);
        const dx = u - cx;
        const dy = v - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        // 1. Irregular footprint: periodic noise on the unit circle (seam-free)
        const shapeN = shapeFBM.sample(Math.cos(angle) * 1.6 + 5, Math.sin(angle) * 1.6 + 5);
        const d = dist / (scale * (1 + 0.25 * shapeN));

        // 2. Radial drainage: ridged FBM sampled on the unit ring (exactly
        //    periodic in angle -> seam-free starburst of ridges); a constant
        //    diagonal drift with d makes channels meander sideways as they
        //    run downslope without rotating into spirals. A low-frequency XY
        //    mask varies gully strength by region so faces erode unevenly.
        const g = gullyFBM.sample(Math.cos(angle) * 2.2 + d * 0.28 + 9,
                                  Math.sin(angle) * 2.2 + d * 0.28 + 9);
        const region = regionFBM.sample(u * 2.4 + 31, v * 2.4 + 17) * 0.5 + 0.5;
        const dMod = d * (1 + gullyAmp * (g - 0.5) * (0.35 + 0.65 * region));

        // 3. Stratovolcanic profile on the displaced radius
        let cone = Math.pow(Math.max(0, 1 - dMod), q);

        // 4. Fine flank texture (XY-space ridged detail)
        const flank = flankFBM.sample(u * 7 + 11, v * 7 + 23);
        cone += (flank - 0.5) * 2 * flankAmp * cone;

        // 5. Crater: blend the cone down to a deep uneven floor across a
        //    narrow wall band (steep inner walls), then raise a crisp rim
        //    ring above the crest. Carved on undisplaced d so the rim reads
        //    as one structure across the gully field.
        const rimH = Math.pow(Math.max(0, 1 - mouth), q);       // flank height at the rim
        const wallIn = mouth * 0.62;                             // wall spans (wallIn, mouth)
        const bowl = 1 - ss((d - wallIn) / (mouth - wallIn));
        const floorN = floorFBM.sample(u * 5 + 3, v * 5 + 9) * 0.5 + 0.5;
        const floorLevel = rimH * (0.22 + 0.12 * floorN);        // deep, uneven floor
        cone = lerp(cone, floorLevel, bowl);
        const rim = Math.exp(-Math.pow((d - mouth) / (mouth * 0.26 + 0.012), 2));
        cone += rim * rimH * 0.35;                               // rim raise above the crest

        // 6. Quiet surrounding plain with subtle undulations + soft debris skirt
        const plain = (plainFBM.sample(u * 1.6 + 7, v * 1.6 + 13) * 0.5 + 0.5) * 0.03
          + Math.exp(-Math.max(0, d - 1) * 1.4) * 0.03;

        h.set(x, y, Math.max(0, plain + cone * heightMult));
      }
    }
    return h.normalize();
  }
};

export const MesaNode: NodeTypeDefinition = {
  type: 'mesa',
  title: 'Mesa',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 88 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'scale', label: 'Feature Scale', type: 'slider', min: 0.5, max: 8, step: 0.1, default: 1.8 },
    { id: 'octaves', label: 'Octaves', type: 'slider', min: 1, max: 10, step: 1, default: 5, integer: true },
    { id: 'levels', label: 'Levels', type: 'slider', min: 2, max: 14, step: 1, default: 6, integer: true },
    { id: 'smooth', label: 'Edge Softness', type: 'slider', min: 0.05, max: 0.5, step: 0.01, default: 0.25 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const fbm = new FBM(p.seed, p.octaves, 2, 0.5, 'perlin');
    const step = 1 / p.levels;
    const lo = 1 - p.smooth, hi = p.smooth;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1) + (p.x - 0.5), v = y / (s - 1) + (p.y - 0.5);
        const n = fbm.sample(u * p.scale, v * p.scale) * 0.5 + 0.5;
        const k = Math.floor(n / step);
        const f = (n - k * step) / step;
        const t = hi <= lo ? f : ss((f - lo) / (hi - lo));
        h.set(x, y, (k + t) * step);
      }
    }
    return h.normalize();
  }
};
