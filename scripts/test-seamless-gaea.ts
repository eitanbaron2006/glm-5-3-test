import { Heightmap } from '../src/core/heightmap';
import { FBM, PerlinNoise, voronoi } from '../src/core/noise';

export function computeSeamlessGaeaMountain(p: any, size = 256): Heightmap {
  const s = size;
  const h = new Heightmap(s);

  const style = p.style ?? 'alpine';
  const seed = p.seed ?? 2025;
  const heightMult = p.height ?? 1;
  const cx = p.x ?? 0.5;
  const cy = p.y ?? 0.5;
  const scale = Math.max(0.15, (p.scale ?? p.radius ?? 0.45));
  const edge = p.edge ?? p.steepness ?? 2.0;
  const bulky = p.bulky ?? 0.5;
  const elong = p.elong ?? 0.35;
  const angle = ((p.angle ?? 45) * Math.PI) / 180;
  const irregular = p.irregular ?? 0.4;
  const roughness = p.roughness ?? 0.25;
  const roughScale = p.roughScale ?? 5;

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
