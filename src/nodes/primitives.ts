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

/** Iterative thermal (talus) erosion: any cell steeper than the local
    talus angle transports material to its steepest downhill neighbour,
    one small step per iteration. Flanks relax into smooth stable aprons
    while ridge crests survive — the single most important "real geology"
    pass for procedural mountains. Talus is in height-units per frame
    edge (tBase at ground, tTop near summits; divided by size inside). */
const thermalErode = (h: Heightmap, iters: number, tBase: number, tTop: number, rate: number) => {
  const s = h.size;
  if (iters <= 0) return h;
  let src = Float32Array.from(h.data);
  let dst = new Float32Array(src.length);
  for (let it = 0; it < iters; it++) {
    dst.set(src);
    for (let y = 0; y < s; y++) {
      const row = y * s;
      for (let x = 0; x < s; x++) {
        const i = row + x;
        const hc = src[i];
        const tal = (tBase + (tTop - tBase) * hc) / s;
        const talD = tal * 1.42;
        let best = -1, bestEx = 0;
        for (let oy = -1; oy <= 1; oy++) {
          const yy = y + oy;
          if (yy < 0 || yy >= s) continue;
          for (let ox = -1; ox <= 1; ox++) {
            if (ox === 0 && oy === 0) continue;
            const xx = x + ox;
            if (xx < 0 || xx >= s) continue;
            const t = ox !== 0 && oy !== 0 ? talD : tal;
            const ex = hc - src[yy * s + xx] - t;
            if (ex > bestEx) { bestEx = ex; best = yy * s + xx; }
          }
        }
        if (best >= 0) {
          const move = bestEx * rate;
          dst[i] -= move;
          dst[best] += move;
        }
      }
    }
    const t = src; src = dst; dst = t;
  }
  h.data.set(src);
  return h;
};

/** Mountain V2 GeoPrimitive — faithful to QuadSpinner GAEA:
    implements GAEA's Mountain parameter set (Scale, Height, Style, Bulk,
    Reduce Details, Seed, X, Y) exactly as documented. The docs describe
    the construction as "a modulated Voronoi pattern and distortions" —
    but the natural look of the real node comes from what erosion does to
    that pattern. V2 therefore builds structure the way geology does and
    never leaves closed-form geometry visible:

    1. RIDGED MULTIFRACTAL core (Musgrave): each octave's ridges only
       grow tall where the coarser ridge already towers — a fractal
       hierarchy of a few dominant crests over subordinate spurs. Every
       octave is bent by a different dose of the same tectonic warp
       field, so no scale repeats its own pattern.
    2. MODULATED VORONOI SWELL: heavily warped, smooth per-cell mass
       bumps (no cell walls, no cones) lift whole ridge complexes into
       secondary summits at organic positions — the documented Voronoi
       modulation, used where it cannot read as a pattern.
    3. ONE DOMINANT SUMMIT via a broad, seed-jittered prominence bump
       that tilts the whole hierarchy — never a needle on a dome.
    4. EROSION, always on: iterative thermal talus transport smooths
       flanks into stable aprons while crests stay sharp; dendritic
       fluvial channels carve the mid-slopes following the eroded
       drainage; rock-break detail rides steep faces; a height-weighted
       unsharp pass re-crisps aretes.
    5. Seed-driven rotation + anisotropy and a noise-broken silhouette
       guarantee every seed is a different, asymmetric mountain.

    Style modulates geology: Basic (clean construction mass), Eroded
    (heavy gullies, worn crests), Old (ancient, rounded, softened),
    Alpine (young, sharp, dramatic relief), Strata (sedimentary banding).
    Bulk sets mass: Low (slender, delicate), Medium (balanced), High
    (thick, heavy, broad-based). Reduce Details strips fine octaves and
    lightens the erosion passes for distant/simple assets. */
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

    // Seed-driven orientation: every seed rotates + stretches the massif
    // differently — nothing stays radially symmetric or repeatable.
    const rng = mulberry32(Math.imul(seed, 2654435761) >>> 0);
    const rotA = rng() * Math.PI * 2;
    const aniso = 1 + rng() * 0.38;
    const qa = Math.cos(rotA), qb = Math.sin(rotA);

    // Bulk: Low = slender/delicate, Medium = balanced, High = thick/heavy
    // ("substantial volume and broad bases"). width = footprint radius in
    // frame units, maskQ = silhouette falloff exponent, floor = valley
    // floor inside the massif, prom = summit-prominence boost, thermal =
    // talus-relaxation iterations (resolution-scaled below). Legacy
    // numeric p.bulky (0..1) maps onto the same three levels.
    let bulk = p.bulk ?? 'medium';
    if (typeof bulk === 'number') bulk = bulk >= 0.66 ? 'high' : bulk >= 0.33 ? 'medium' : 'low';
    const bulkCfg = bulk === 'low'
      ? { width: 0.82, maskQ: 2.3, floor: 0.12, prom: 0.40, thermal: 20 }
      : bulk === 'high'
        ? { width: 1.38, maskQ: 1.35, floor: 0.44, prom: 0.50, thermal: 26 }
        : { width: 1.06, maskQ: 1.7, floor: 0.28, prom: 0.46, thermal: 23 };

    // Per-style geology: oct = ridge octaves (auto-capped by resolution),
    // sharp = crest sharpening exponent, fluvial = dendritic channel
    // carve, crest = arete re-crisp unsharp, rock = rock-break detail on
    // steep faces, soften = Old smoothing passes, strata = sedimentary
    // benching. Erosion (thermal + fluvial) is ALWAYS on — that is what
    // makes a mountain read natural; styles only scale its intensity.
    const styleCfg = {
      basic:  { oct: 7, sharp: 1.22, fluvial: 0.30, crest: 0.34, rock: 0.55, soften: 0, strata: 0 },
      eroded: { oct: 7, sharp: 1.10, fluvial: 0.85, crest: 0.16, rock: 0.30, soften: 1, strata: 0 },
      old:    { oct: 5, sharp: 0.85, fluvial: 0.45, crest: 0.04, rock: 0.10, soften: 3, strata: 0 },
      alpine: { oct: 8, sharp: 1.35, fluvial: 0.38, crest: 0.55, rock: 0.75, soften: 0, strata: 0 },
      strata: { oct: 6, sharp: 1.05, fluvial: 0.32, crest: 0.28, rock: 0.45, soften: 0, strata: 0.85 },
    }[style];

    // Resolution-safe detail budget: no octave may alias (wavelength >= 2.6px).
    const R0 = scale * bulkCfg.width;
    const baseFreq = 2.3 / R0;                 // ~2-3 major ridges across massif
    let octaves = styleCfg.oct;
    while (octaves > 3 && baseFreq * Math.pow(2.07, octaves - 1) > s / 2.6) octaves--;
    const fluvial = reduce ? styleCfg.fluvial * 0.45 : styleCfg.fluvial;
    const rock = reduce ? styleCfg.rock * 0.35 : styleCfg.rock;
    const thermalIters = Math.min(60,
      Math.round((reduce ? bulkCfg.thermal * 0.55 : bulkCfg.thermal) * (s / 256)));

    // Distortion + structure engines
    const warpX = new FBM(seed + 11, 3, 2.0, 0.5, 'perlin');     // tectonic warp X
    const warpY = new FBM(seed + 29, 3, 2.0, 0.5, 'perlin');     // tectonic warp Y
    const fineW = new FBM(seed + 43, 2, 2.0, 0.5, 'perlin');     // channel meander warp
    const angFBM = new FBM(seed + 53, 3, 2.0, 0.5, 'perlin');    // silhouette wobble
    const core = new PerlinNoise(seed + 47);                     // ridged multifractal
    const chan = new PerlinNoise(seed + 61);                     // fluvial channels
    const rockN = new PerlinNoise(seed + 71);                    // rock-break detail
    const plainFBM = new FBM(seed + 199, 3, 2.0, 0.5, 'perlin'); // surrounding plain

    const subFreq = 2.4 / R0;                  // Voronoi swell cell frequency
    const warpAmp = 0.11;                      // tectonic warp, frame units
    const chanFreq = Math.min(30 / (scale * 2), s / 6);
    const rockFreq = Math.min(46 / (scale * 2), s / 5);

    // Full structural sample at a point: tectonic warp, rotated/anisotropic
    // position, noise-broken silhouette envelope, ridged-multifractal
    // hierarchy and the Voronoi swell. Shared by the summit-finding
    // pre-pass below and the main pixel loop, so the two never diverge.
    const sampleStructure = (u: number, v: number) => {
      const wx = warpX.sample(u * 2.2 + 5, v * 2.2 + 7) * warpAmp;
      const wy = warpY.sample(u * 2.2 + 13, v * 2.2 + 17) * warpAmp;
      const su = u + wx, sv = v + wy;
      const dx = u - cx + wx * 0.6, dy = v - cy + wy * 0.6;
      const rx = dx * qa + dy * qb;
      const ry = (-dx * qb + dy * qa) / aniso;
      const rad = Math.sqrt(rx * rx + ry * ry);
      const ang = Math.atan2(ry, rx);
      const wob = angFBM.sample(Math.cos(ang) * 1.6 + 9, Math.sin(ang) * 1.6 + 9) * 0.5
        + angFBM.sample(Math.cos(ang) * 3.7 + 21, Math.sin(ang) * 3.7 + 21) * 0.2
        + angFBM.sample(su * 1.3 + 31, sv * 1.3 + 31) * 0.3;
      const d = rad / (R0 * (1 + 0.34 * wob));
      const env = Math.pow(Math.max(0, 1 - d), bulkCfg.maskQ);
      let f = baseFreq, amp = 1, wgt = 1, sum = 0, norm = 0;
      for (let o = 0; o < octaves; o++) {
        const bend = baseFreq * Math.pow(2.07, 0.3 * o);
        let sig = 1 - Math.abs(core.noise(su * f + wx * bend, sv * f + wy * bend));
        if (sig < 0) sig = 0;
        sig = sig * sig * wgt;
        sum += sig * amp;
        norm += amp;
        wgt = Math.min(1, sig * 2.1);
        amp *= 0.52;
        f *= 2.07;
      }
      const ridged = sum / norm;
      const vf = voroField((u + wx * 1.4) * subFreq, (v + wy * 1.4) * subFreq, seed + 301);
      const swell = 0.84 + 0.32 * Math.pow(Math.max(0, 1 - Math.min(vf.f1 * 1.3, 1)), 1.6);
      return { wx, wy, su, sv, rx, ry, rad, d, env, ridged, swell };
    };

    // Summit pre-pass: find the ridge hierarchy's NATURAL leader near the
    // requested center on a coarse grid. The dominance bump then
    // reinforces where the mountain already wants to tower — the summit
    // grows organically per seed instead of being stamped by a formula.
    // The strongest distant runner-up is also tracked: the dominance bump
    // strengthens and a soft saddle dips exactly as much as that rival
    // demands, so ONE summit always dominates without flattening the rest.
    const G = 48;
    const cand: Array<{ rx: number; ry: number; rad: number; score: number }> = [];
    for (let gy = 0; gy < G; gy++) {
      for (let gx = 0; gx < G; gx++) {
        const st = sampleStructure((gx + 0.5) / G, (gy + 0.5) / G);
        if (st.rad > 0.78 * R0) continue;    // structures inside the massif
        const score = st.env * st.ridged * st.swell
          * Math.exp(-Math.pow(st.rad / (R0 * 0.8), 2));
        cand.push({ rx: st.rx, ry: st.ry, rad: st.rad, score });
      }
    }
    let lead = cand[0] ?? { rx: 0, ry: 0, rad: 0, score: 0 };
    for (const c of cand) if (c.score > lead.score) lead = c;
    let rival: { rx: number; ry: number; rad: number; score: number } | null = null;
    for (const c of cand) {
      if (Math.hypot(c.rx - lead.rx, c.ry - lead.ry) < 0.32 * R0) continue;
      if (!rival || c.score > rival.score) rival = c;
    }
    const rivalry = rival ? Math.min(1, rival.score / (lead.score + 1e-9)) : 0;
    const promBoost = bulkCfg.prom + 0.22 * rivalry;
    const pjx = lead.rx, pjy = lead.ry;

    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1), v = y / (s - 1);

        // 1-4. Structure at this pixel: tectonic warp (re-dosed per octave),
        //      rotated/anisotropic noise-broken silhouette, ridged-multi-
        //      fractal crest hierarchy, Voronoi swell — see sampleStructure.
        const st = sampleStructure(u, v);

        // 5. One dominant summit: the broad dominance bump is centred on
        //    the pre-pass leader and strengthens with the tracked rival's
        //    strength; a soft Gaussian saddle dips the rival nucleus —
        //    after erosion it reads as a natural col between summits.
        const prx = st.rx - pjx, pry = st.ry - pjy;
        const pr = (prx * prx + pry * pry) / (R0 * R0 * 0.45);
        const prom = 1 + promBoost * Math.exp(-pr * 2.6);
        let mountain = st.ridged * st.swell * prom;
        if (rival) {
          const vx = st.rx - rival.rx, vy = st.ry - rival.ry;
          mountain *= 1 - 0.14 * rivalry
            * Math.exp(-(vx * vx + vy * vy) / (R0 * R0 * 0.078));
        }
        mountain = Math.pow(mountain, styleCfg.sharp);
        const coreH = st.env * (bulkCfg.floor + (1 - bulkCfg.floor) * mountain) * heightMult;

        // 6. Quiet plains + debris skirt fanning into them
        const plain = (plainFBM.sample(u * 1.5 + 3, v * 1.5 + 7) * 0.5 + 0.5) * 0.02
          + Math.exp(-Math.max(0, st.d - 1) * 1.6) * 0.035;

        h.set(x, y, Math.max(0, coreH + plain));
      }
    }

    // ---- Erosion sculpting (operates on the whole height field) ----
    // 7. Thermal talus relaxation: material above the local rest angle
    //    slumps downhill step by step — flanks smooth into stable aprons
    //    while crests stay crisp. THE pass that kills the procedural
    //    "pattern" look of raw noise geometry.
    thermalErode(h, thermalIters, 2.1, 3.9, 0.45);

    // 8. Fluvial channels + rock-break + arete re-crisp, driven by the
    //    ERODED slopes (gullies follow the mountain's actual drainage).
    if (fluvial > 0 || rock > 0 || styleCfg.crest > 0) {
      const data = h.data;
      const blur = new Float32Array(data.length);  // one 3x3 pass for unsharp
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          let sum2 = 0, n = 0;
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const xx = x + ox, yy = y + oy;
              if (xx < 0 || yy < 0 || xx >= s || yy >= s) continue;
              sum2 += data[yy * s + xx]; n++;
            }
          }
          blur[y * s + x] = sum2 / n;
        }
      }
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const i = y * s + x;
          const hc = data[i];
          const gx = data[y * s + Math.min(x + 1, s - 1)] - data[y * s + Math.max(x - 1, 0)];
          const gy = data[Math.min(y + 1, s - 1) * s + x] - data[Math.max(y - 1, 0) * s + x];
          const g = Math.sqrt(gx * gx + gy * gy) * (s * 0.5);  // slope, frame units
          const slopeMask = ss((g - 0.9) / 1.8);
          const hMask = ss((hc - 0.1) / 0.3);
          const u = x / (s - 1), v = y / (s - 1);
          let hv = hc;
          // dendritic channels: ridged lines, meander-warped
          if (fluvial > 0) {
            const fw = fineW.sample(u * 3 + 40, v * 3 + 41) * 0.06;
            const fw2 = fineW.sample(u * 3 + 44, v * 3 + 45) * 0.06;
            let ch = 1 - Math.abs(chan.noise((u + fw) * chanFreq, (v + fw2) * chanFreq));
            ch = Math.pow(Math.max(0, ch), 1.9);
            hv -= fluvial * ch * slopeMask * hMask * (0.3 * hv + 0.03);
          }
          // rock-break detail rides steep faces
          if (rock > 0 && slopeMask > 0.02) {
            let rk = 1 - Math.abs(rockN.noise(u * rockFreq + 7, v * rockFreq + 13));
            rk = rk * rk;
            hv += (rk - 0.35) * rock * slopeMask * hMask * 0.05;
          }
          // arete re-crisp: local unsharp weighted by height
          hv += styleCfg.crest * (hc - blur[i]) * ss((hc - 0.22) / 0.45);
          data[i] = Math.max(0, hv);
        }
      }
    }

    // 9. Strata: quantize into sedimentary benches following the form
    if (styleCfg.strata > 0) {
      for (let i = 0; i < h.data.length; i++) {
        h.data[i] = lerp(h.data[i], terrace(Math.min(h.data[i], 0.999999), 9, 0.24), styleCfg.strata);
      }
    }

    // 10. Old mountains: soften into rounded ancient forms
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
