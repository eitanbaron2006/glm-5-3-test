import { Heightmap } from '../src/core/heightmap';
import { FBM, PerlinNoise, voronoi } from '../src/core/noise';

function ascii(h: Heightmap, w = 80, ht = 28) {
  const chars = ' .:-=+*#%@';
  let out = '';
  for (let y = 0; y < ht; y++) {
    let line = '';
    for (let x = 0; x < w; x++) {
      const u = Math.floor((x / (w - 1)) * (h.size - 1));
      const v = Math.floor((y / (ht - 1)) * (h.size - 1));
      const val = h.get(u, v);
      line += chars[Math.min(chars.length - 1, Math.max(0, Math.floor(val * chars.length)))];
    }
    out += line + '\n';
  }
  return out;
}

const ss = (t: number) => {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const terrace = (t: number, steps: number, soft: number) => {
  const q = 1 / steps;
  const k = Math.floor(Math.min(t, 0.999999) / q);
  const f = (t - k * q) / q;
  const lo = 0.5 - soft * 0.5, hi = 0.5 + soft * 0.5;
  return (k + ss((f - lo) / (hi - lo))) * q;
};

type Style = 'alpine' | 'massif' | 'spined' | 'stratified' | 'craggy';

function generateMountain(style: Style, p: any, size = 128): Heightmap {
  const s = size;
  const h = new Heightmap(s);

  const seed = p.seed ?? 2025;
  const heightMult = p.height ?? 1;
  const cx = p.x ?? 0.5;
  const cy = p.y ?? 0.5;
  const radius = Math.max(0.08, p.radius ?? 0.4);
  const steepness = p.steepness ?? 2.2;
  const bulky = p.bulky ?? 0.5;
  const elong = p.elong ?? 0.25;
  const angle = (p.angle ?? 45) * Math.PI / 180;
  const irregular = p.irregular ?? 0.4;
  const spurs = p.spurs ?? 0.6;
  const spursFreq = p.spursFreq ?? 6;
  const gullies = p.gullies ?? 0.5;
  const benches = p.benches ?? 0.4;
  const strataFreq = p.strataFreq ?? 8;
  const roughness = p.roughness ?? 0.22;
  const roughScale = p.roughScale ?? 6;
  const foothills = p.foothills ?? 0.6;

  // Noise generators
  const perlinSpine = new PerlinNoise(seed);
  const perlinSpurs = new PerlinNoise(seed + 77);
  const perlinCouloir = new PerlinNoise(seed + 144);
  const perlinWarp = new PerlinNoise(seed + 233);
  const perlinChisel = new PerlinNoise(seed + 377);
  const perlinHills = new PerlinNoise(seed + 512);

  const ca = Math.cos(angle), sa = Math.sin(angle);

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = x / (s - 1);
      const v = y / (s - 1);
      const dx = u - cx;
      const dy = v - cy;

      // 1. Multi-octave Tectonic Domain Warping
      const w1x = perlinWarp.noise(u * 2.5 + 11, v * 2.5 + 17) * 0.7;
      const w1y = perlinWarp.noise(u * 2.5 + 53, v * 2.5 + 79) * 0.7;
      const w2x = perlinWarp.noise(u * 6.0 + 101, v * 6.0 + 137) * 0.3;
      const w2y = perlinWarp.noise(u * 6.0 + 173, v * 6.0 + 211) * 0.3;
      const wx = dx + (w1x + w2x) * irregular * 0.22;
      const wy = dy + (w1y + w2y) * irregular * 0.22;

      // 2. Anisotropic coordinate rotation & elongation
      const rx = (wx * ca + wy * sa) / (1 + elong);
      const ry = (-wx * sa + wy * ca) * (1 + elong);
      const dRaw = Math.sqrt(rx * rx + ry * ry) / radius;

      // Perimeter fractal lobes for natural organic non-circular boundary
      const th = Math.atan2(wy, wx);
      const rim = perlinWarp.noise(Math.cos(th) * 2.2 + 13, Math.sin(th) * 2.2 + 17) * 0.6
                + perlinWarp.noise(Math.cos(th) * 5.0 + 41, Math.sin(th) * 5.0 + 53) * 0.4;
      const d = dRaw * (1 + irregular * 0.35 * rim);
      const dClamped = Math.min(Math.max(d, 0), 1);

      // 3. Volumetric mountain massing (cone vs parabolic dome)
      const cone = Math.pow(Math.max(0, 1 - dClamped), steepness);
      const dome = Math.pow(Math.cos(dClamped * Math.PI * 0.5), Math.max(0.4, steepness * 0.5));
      const mass = lerp(cone, dome, bulky);

      // 4. Heterogeneous Ridged Multifractal Synthesis:
      // Octave 0: Main spine / horn
      const spineNoise = perlinSpine.noise(rx * 3.5 + 7, ry * 3.5 + 11);
      let r0 = 1 - Math.abs(spineNoise);
      r0 = Math.pow(r0, style === 'alpine' ? 2.4 : 1.8);

      // Octave 1: Branching lateral spurs & arêtes (weighted by r0)
      const spurNoise = perlinSpurs.noise(rx * 7.5 + 23, ry * 7.5 + 31);
      let r1 = 1 - Math.abs(spurNoise);
      r1 = Math.pow(r1, 2.0) * (0.35 + 0.65 * r0);

      // Octave 2: Couloirs and gullies
      const couloirN = perlinCouloir.noise(rx * 15.0 + 47, ry * 15.0 + 59);
      let r2 = 1 - Math.abs(couloirN);
      r2 = r2 * (0.3 + 0.7 * r1);

      // Style-specific modifiers
      let fractalShape = 0;
      if (style === 'alpine') {
        // Razor-sharp arêtes and steep cirque horn
        fractalShape = r0 * 0.55 + r1 * spurs * 0.35 + r2 * 0.1;
      } else if (style === 'massif') {
        // Heavy, broad shoulders, tiered rock faces
        const broad = Math.pow(r0, 1.2);
        fractalShape = broad * 0.6 + r1 * 0.25 + r2 * 0.15;
      } else if (style === 'spined') {
        // Strong extended spine with prominent ribs
        fractalShape = r0 * 0.65 + r1 * spurs * 0.4;
      } else if (style === 'stratified') {
        // Layered stepped strata
        fractalShape = r0 * 0.5 + r1 * 0.3 + r2 * 0.2;
      } else { // craggy
        // Angular cellular rock crags
        const cell = voronoi(u, v, 14, seed, 'f2minusf1');
        fractalShape = r0 * 0.45 + r1 * 0.3 + cell * 0.25;
      }

      // 5. Downslope Couloir & Gully Drainage Carving
      const gullyMask = (1 - r1) * couloirN * gullies * 0.25;

      // 6. Geological Strata & Bench Terracing
      let strata = 0;
      if (benches > 0.01) {
        const strataScale = style === 'stratified' ? strataFreq * 1.5 : strataFreq;
        const strataTilt = (rx * 0.7 + ry * 0.4) * 0.08;
        const strataPhase = (mass + fractalShape * 0.5 + strataTilt) * strataScale;
        const kS = Math.floor(strataPhase);
        const fS = strataPhase - kS;
        const benchStep = ss((fS - 0.2) / 0.6);
        const strataStr = style === 'stratified' ? benches * 1.6 : benches;
        strata = (benchStep - 0.5) * (1 / strataScale) * strataStr * 1.4;
      }

      // 7. High-frequency Micro-Rock Chisel (Weighted by slope & height)
      const chisel1 = perlinChisel.noise(u * roughScale * 3 + 73, v * roughScale * 3 + 89);
      const chisel2 = perlinChisel.noise(u * roughScale * 7 + 131, v * roughScale * 7 + 157);
      const microRock = ((1 - Math.abs(chisel1)) * 0.65 + Math.abs(chisel2) * 0.35 - 0.5) * roughness * (0.3 + 0.7 * mass);

      // 8. Main Mountain Peak Combination
      const peak = Math.max(0, mass * (0.35 + 0.65 * fractalShape) - gullyMask * mass + strata + microRock);

      // 9. Graded Piedmont / Foothills Apron
      const ped = Math.exp(-dRaw * dRaw * 1.6);
      const hillN = perlinHills.noise(u * 4 + 31, v * 4 + 47) * 0.5 + 0.5;
      const apron = ped * (0.04 + 0.25 * foothills) * (0.5 + 0.5 * hillN);

      const total = apron + peak * heightMult;
      h.set(x, y, Math.max(0, total));
    }
  }

  return h.normalize();
}

for (const st of ['alpine', 'massif', 'spined', 'stratified', 'craggy'] as Style[]) {
  const h = generateMountain(st, {
    seed: 2025, height: 1, x: 0.5, y: 0.52, radius: 0.4, steepness: 2.2, bulky: 0.5,
    elong: 0.3, angle: 45, irregular: 0.4, spurs: 0.6, spursFreq: 6, gullies: 0.5,
    benches: 0.4, strataFreq: 8, roughness: 0.22, roughScale: 6, foothills: 0.6
  });
  console.log(`=== Style: ${st} === (min=${h.min().toFixed(3)} max=${h.max().toFixed(3)})`);
  console.log(ascii(h));
}
