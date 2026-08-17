import { Heightmap } from '../src/core/heightmap';
import { FBM, PerlinNoise, voronoi } from '../src/core/noise';

export function computeTrueGaeaMountain(p: any, size = 256): Heightmap {
  const s = size;
  const h = new Heightmap(s);

  const style = p.style ?? 'alpine';
  const seed = p.seed ?? 2025;
  const heightMult = p.height ?? 1;
  const cx = p.x ?? 0.5;
  const cy = p.y ?? 0.5;
  const scale = Math.max(0.1, (p.scale ?? p.radius ?? 0.45));
  const edge = p.edge ?? p.steepness ?? 1.8;
  const bulky = p.bulky ?? 0.5;
  const elong = p.elong ?? 0.25;
  const angle = ((p.angle ?? 45) * Math.PI) / 180;
  const irregular = p.irregular ?? 0.4;
  const roughness = p.roughness ?? 0.35;
  const roughScale = p.roughScale ?? 5;
  const foothills = p.foothills ?? 0.4;

  // Multi-frequency GAEA noise engines
  const warpA = new FBM(seed + 13, 4, 2.0, 0.5, 'perlin');
  const warpB = new FBM(seed + 47, 4, 2.0, 0.5, 'perlin');
  const fbmRidge1 = new FBM(seed, 6, 2.0, 0.5, 'ridged');
  const fbmRidge2 = new FBM(seed + 71, 5, 2.1, 0.5, 'ridged');
  const fbmRock = new FBM(seed + 109, 5, 2.2, 0.5, 'ridged');
  const fbmHills = new FBM(seed + 144, 4, 2.0, 0.5, 'perlin');
  const fbmPlains = new FBM(seed + 199, 4, 2.0, 0.5, 'perlin');

  const ca = Math.cos(angle), sa = Math.sin(angle);

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = x / (s - 1);
      const v = y / (s - 1);
      const dx = u - cx;
      const dy = v - cy;

      // 1. Dual-Domain Tectonic Warping (Folds mountain ridges naturally)
      const w1x = warpA.sample(u * 2.2 + 11, v * 2.2 + 17);
      const w1y = warpA.sample(u * 2.2 + 53, v * 2.2 + 79);
      const w2x = warpB.sample(u * 5.0 + 101, v * 5.0 + 137);
      const w2y = warpB.sample(u * 5.0 + 173, v * 5.0 + 211);
      const wx = dx + (w1x * 0.7 + w2x * 0.3) * irregular * 0.25;
      const wy = dy + (w1y * 0.7 + w2y * 0.3) * irregular * 0.25;

      // 2. Anisotropic rotation & spine orientation
      const rx = (wx * ca + wy * sa) / (1 + elong);
      const ry = (-wx * sa + wy * ca) * (1 + elong);
      const d = Math.sqrt(rx * rx + ry * ry) / scale;

      // 3. Smooth, organic edge envelope
      const envelope = Math.pow(Math.max(0, 1 - d), edge);

      if (envelope <= 0.0001) {
        // Base plains outside the mountain
        const plainN = fbmPlains.sample(u * 1.5 + 7, v * 1.5 + 7) * 0.5 + 0.5;
        h.set(x, y, plainN * 0.02);
        continue;
      }

      // 4. Multi-Cellular Voronoi Ridge Network (GAEA Modulated Voronoi)
      // Generates multiple interconnected sharp ridges, cols, and arêtes across the massif
      const cellScale = 3.5;
      const cu = u * cellScale + wx * 0.6;
      const cv = v * cellScale + wy * 0.6;
      const vF1 = voronoi(cu, cv, 1, seed, 'f1');
      const vF2 = voronoi(cu, cv, 1, seed, 'f2');
      const vDiff = voronoi(cu, cv, 1, seed, 'f2minusf1');

      // Sharp inverted cellular crests & faceted rock faces
      const cellularRidge = Math.pow(Math.max(0, 1 - vF1), 1.6) * 0.6 + Math.pow(vDiff, 0.8) * 0.4;

      // 5. Heterogeneous Ridged Multifractal Flank Detailing
      const flank1 = fbmRidge1.sample(u * roughScale + 50, v * roughScale + 50) * 0.5 + 0.5;
      const flank2 = fbmRidge2.sample(u * roughScale * 2 + 100, v * roughScale * 2 + 100) * 0.5 + 0.5;
      const rockCrags = fbmRock.sample(u * roughScale * 3 + 150, v * roughScale * 3 + 150) * 0.5 + 0.5;

      // Geological Style profiles
      let mountainForm = 0;
      if (style === 'alpine') {
        // Sharp horns, knifelike arêtes, jagged rock faces
        const arete = Math.pow(flank1, 1.7);
        mountainForm = cellularRidge * 0.55 + arete * 0.35 + rockCrags * roughness * 0.4;
      } else if (style === 'massif') {
        // Huge blocky shoulders, broad volume, heavy rock buttresses
        mountainForm = Math.pow(cellularRidge, 0.8) * 0.6 + flank1 * 0.3 + rockCrags * roughness * 0.3;
      } else if (style === 'spined') {
        // Extended dominant spine with branching ribs
        const spine = Math.exp(-ry * ry * 25 / (scale * scale));
        mountainForm = spine * 0.4 + cellularRidge * 0.35 + flank1 * 0.25;
      } else {
        // Craggy / Shattered
        mountainForm = cellularRidge * 0.35 + vDiff * 0.35 + rockCrags * 0.3;
      }

      // 6. Volumetric Massing (Bulky)
      // Combines the envelope with the mountain form and shapes the volume
      const baseHeight = envelope * (0.3 + 0.7 * mountainForm);
      const bulkyExp = 1.8 - bulky * 1.1; // 1.8 (sharp/lean) to 0.7 (heavy/bulky)
      const shapedMass = Math.pow(Math.max(0, baseHeight), bulkyExp);

      // 7. Foothills & Talus Pediment Apron
      const ped = Math.exp(-d * d * 0.7);
      const hillN = fbmHills.sample(u * 3.5 + 31, v * 3.5 + 31) * 0.5 + 0.5;
      const plainN = fbmPlains.sample(u * 1.5 + 7, v * 1.5 + 7) * 0.5 + 0.5;
      const ground = plainN * 0.02 + ped * (0.01 + 0.16 * foothills) * (0.5 + 0.5 * hillN);

      const total = ground + shapedMass * heightMult;
      h.set(x, y, Math.max(0, total));
    }
  }

  return h.normalize();
}
