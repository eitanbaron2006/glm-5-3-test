import { Heightmap } from '../src/core/heightmap';
import { FBM, PerlinNoise, voronoi } from '../src/core/noise';

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

export function computeGaeaMountain(p: any, size = 256): Heightmap {
  const s = size;
  const h = new Heightmap(s);

  const style = p.style ?? 'alpine';
  const seed = p.seed ?? 2025;
  const heightMult = p.height ?? 1;
  const cx = p.x ?? 0.5;
  const cy = p.y ?? 0.5;
  const radius = Math.max(0.1, p.radius ?? 0.4);
  const steepness = p.steepness ?? 2.2;
  const bulky = p.bulky ?? 0.4;
  const elong = p.elong ?? 0.25;
  const angle = ((p.angle ?? 45) * Math.PI) / 180;
  const irregular = p.irregular ?? 0.35;
  const spurs = p.spurs ?? 0.5;
  const gullies = p.gullies ?? 0.4;
  const benches = p.benches ?? 0.25;
  const strataFreq = Math.max(2, Math.round(p.strataFreq ?? 8));
  const roughness = p.roughness ?? 0.18;
  const roughScale = p.roughScale ?? 5;
  const foothills = p.foothills ?? 0.5;

  // Primary mountain noise generators
  const flankFBM = new FBM(seed, 6, 2.0, 0.5, 'ridged');         // gullies & ridges on flanks
  const rockFBM = new FBM(seed + 109, 5, 2.1, 0.5, 'ridged');      // rock crag detail
  const warpFBM = new FBM(seed + 13, 4, 2.0, 0.5, 'perlin');       // large-scale tectonic folding
  const spineFBM = new FBM(seed + 71, 3, 2.0, 0.5, 'perlin');      // sinuous ridge spine meander
  const rimA = new FBM(seed + 17, 3, 2.0, 0.5, 'perlin');          // perimeter lobe A
  const rimB = new FBM(seed + 31, 3, 2.0, 0.5, 'billow');          // perimeter lobe B
  const hillsFBM = new FBM(seed + 41, 5, 2.0, 0.5, 'perlin');      // gentle foothills
  const plainFBM = new FBM(seed + 97, 4, 2.0, 0.5, 'perlin');      // chunk base plains

  const ca = Math.cos(angle), sa = Math.sin(angle);

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = x / (s - 1);
      const v = y / (s - 1);
      const dx = u - cx;
      const dy = v - cy;

      // 1. Tectonic Domain Warping & Sinuous Ridge Meander
      const wx = dx + warpFBM.sample(u * 2.5 + 11, v * 2.5 + 17) * irregular * 0.15;
      const wy = dy + warpFBM.sample(u * 2.5 + 53, v * 2.5 + 79) * irregular * 0.15;

      // 2. Anisotropic coordinate rotation & ridge elongation
      const rx = (wx * ca + wy * sa) / (1 + elong);
      let ry = (-wx * sa + wy * ca) * (1 + elong);
      const meander = spineFBM.sample(rx * 2.5 + 7, 13.1) * 0.12 * elong;
      ry -= meander;

      // 3. Perimeter polar lobes for natural non-circular mountain base
      const th = Math.atan2(wy, wx);
      const wa = rimA.sample(Math.cos(th) * 1.8 + 17, Math.sin(th) * 1.8 + 17);
      const wb = rimB.sample(Math.cos(th) * 4.2 + 53, Math.sin(th) * 4.2 + 53);
      const d = Math.sqrt(rx * rx + ry * ry) / radius * (1 + irregular * (0.6 * wa + 0.4 * wb));

      // 4. Clean Base Mountain Mass (strictly reaches 0 when d >= 1)
      const baseCone = Math.pow(Math.max(0, 1 - d), steepness);
      const bulkyCone = Math.pow(Math.max(0, 1 - d), Math.max(0.6, steepness * 0.6)) * Math.cos(Math.min(d, 1) * Math.PI * 0.5);
      const mass = lerp(baseCone, bulkyCone, bulky);

      let mountainFeature = 0;

      if (mass > 0.0001) {
        // 5. Flank Ridges & Couloirs (Rich ridged multifractal)
        const gullySample = flankFBM.sample(u * roughScale + 100, v * roughScale + 100) * 0.5 + 0.5;
        const rockSample = rockFBM.sample(u * roughScale * 2 + 50, v * roughScale * 2 + 50) * 0.5 + 0.5;

        let styleModifier = 1.0;
        if (style === 'alpine') {
          // Alpine: sharp arêtes and deep couloir chutes
          const arete = Math.pow(gullySample, 1.8);
          styleModifier = 1 + spurs * (arete - 0.4) * 1.6 + roughness * (rockSample - 0.5) * 1.5;
        } else if (style === 'massif') {
          // Massif: broader bulk with heavy stepped rock faces
          styleModifier = 1 + spurs * (gullySample - 0.5) * 0.8 + roughness * (rockSample - 0.5) * 1.2;
        } else if (style === 'spined') {
          // Spined: elongated dominant spine crest
          const spineRidge = Math.exp(-ry * ry * 40 / (radius * radius));
          styleModifier = 1 + 0.4 * spineRidge + spurs * (gullySample - 0.5) * 1.2 + roughness * (rockSample - 0.5);
        } else if (style === 'stratified') {
          // Stratified: horizontal rock shelves
          styleModifier = 1 + spurs * (gullySample - 0.5) * 0.9 + roughness * (rockSample - 0.5);
        } else { // craggy
          // Craggy: angular cell fractures
          const cell = voronoi(u, v, 16, seed, 'f2minusf1');
          styleModifier = 1 + spurs * (gullySample - 0.5) + 0.3 * (cell - 0.5) + roughness * (rockSample - 0.5) * 1.4;
        }

        // 6. Geological Strata & Terracing (Only active on the mountain slopes)
        let strataMod = 0;
        if (benches > 0.01) {
          const stFreq = style === 'stratified' ? strataFreq * 1.4 : strataFreq;
          const stPhase = (mass + gullySample * 0.2 + (rx * 0.7 + ry * 0.3) * 0.05) * stFreq;
          const kS = Math.floor(stPhase);
          const fS = stPhase - kS;
          const softStep = ss((fS - 0.3) / 0.4);
          strataMod = (softStep - 0.5) * (1 / stFreq) * benches * 1.2;
        }

        mountainFeature = Math.max(0, mass * styleModifier + strataMod * mass);
      }

      // 7. Graded Piedmont / Foothills Apron (Clean smooth decay to chunk edges)
      const ped = Math.exp(-d * d * 0.5);
      const ramp = lerp(ped, terrace(ped, 5, 0.55), benches * 0.5);
      const hillN = hillsFBM.sample(u * 3.5 + 31, v * 3.5 + 31) * 0.5 + 0.5;
      const plainN = plainFBM.sample(u * 1.5 + 7, v * 1.5 + 7) * 0.5 + 0.5;
      const ground = plainN * 0.04 + ramp * (0.04 + 0.22 * foothills) * (0.6 + 0.4 * hillN);

      const total = ground + mountainFeature * heightMult;
      h.set(x, y, Math.max(0, total));
    }
  }

  return h.normalize();
}

const h = computeGaeaMountain({
  style: 'alpine', seed: 2025, height: 1, x: 0.5, y: 0.5, radius: 0.4,
  steepness: 2.2, bulky: 0.4, elong: 0.25, angle: 45, irregular: 0.35,
  spurs: 0.5, gullies: 0.4, benches: 0.25, strataFreq: 8, roughness: 0.18,
  roughScale: 5, foothills: 0.5
});
console.log(`Generated clean GAEA mountain: min=${h.min().toFixed(3)} max=${h.max().toFixed(3)}`);
