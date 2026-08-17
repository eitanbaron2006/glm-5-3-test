import { Heightmap } from '../src/core/heightmap';
import { FBM, PerlinNoise, voronoi } from '../src/core/noise';

export function makeGaeaMountainFull(p: any, size = 256): Heightmap {
  const s = size;
  const h = new Heightmap(s);

  const style = p.style ?? 'alpine';
  const seed = p.seed ?? 2025;
  const heightMult = p.height ?? 1;
  const cx = p.x ?? 0.5;
  const cy = p.y ?? 0.5;
  const radius = Math.max(0.1, p.radius ?? 0.4);
  const edge = p.edge ?? 2.2;
  const bulky = p.bulky ?? 0.5;
  const elong = p.elong ?? 0.25;
  const angle = ((p.angle ?? 45) * Math.PI) / 180;
  const irregular = p.irregular ?? 0.35;
  const roughness = p.roughness ?? 0.2;
  const roughScale = p.roughScale ?? 5;
  const foothills = p.foothills ?? 0.5;

  const fbmWarp = new FBM(seed + 13, 4, 2.0, 0.5, 'perlin');
  const fbmSpine = new FBM(seed + 71, 3, 2.0, 0.5, 'perlin');
  const fbmFlank = new FBM(seed, 6, 2.0, 0.5, 'ridged');
  const fbmDetail = new FBM(seed + 109, 5, 2.1, 0.5, 'ridged');
  const fbmHills = new FBM(seed + 41, 5, 2.0, 0.5, 'perlin');
  const fbmPlains = new FBM(seed + 97, 4, 2.0, 0.5, 'perlin');

  const ca = Math.cos(angle), sa = Math.sin(angle);

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = x / (s - 1);
      const v = y / (s - 1);
      const dx = u - cx;
      const dy = v - cy;

      // 1. Tectonic domain warp
      const wx = dx + fbmWarp.sample(u * 2.5 + 11, v * 2.5 + 17) * irregular * 0.16;
      const wy = dy + fbmWarp.sample(u * 2.5 + 53, v * 2.5 + 79) * irregular * 0.16;

      // 2. Anisotropic rotation & spine elongation
      const rx = (wx * ca + wy * sa) / (1 + elong);
      let ry = (-wx * sa + wy * ca) * (1 + elong);
      const meander = fbmSpine.sample(rx * 2.5 + 7, 13.1) * 0.12 * elong;
      ry -= meander;

      const d = Math.sqrt(rx * rx + ry * ry) / radius;
      const edgeMask = Math.pow(Math.max(0, 1 - d), edge);

      let mountainBody = 0;

      if (edgeMask > 0.0001) {
        // 3. Gaea Modulated Voronoi & Cellular Ridge Foundation
        const vF1 = voronoi(u * 5 + wx * 0.8, v * 5 + wy * 0.8, 1, seed, 'f1');
        const vDiff = voronoi(u * 5 + wx * 0.8, v * 5 + wy * 0.8, 1, seed, 'f2minusf1');
        const voronoiRidge = (1 - vF1) * 0.6 + vDiff * 0.4;

        // 4. Multi-frequency Ridged Flank Detail
        const flankRidge = fbmFlank.sample(u * roughScale + 100, v * roughScale + 100) * 0.5 + 0.5;
        const microCrags = fbmDetail.sample(u * roughScale * 2 + 50, v * roughScale * 2 + 50) * 0.5 + 0.5;

        // Style differentiation
        let structure = 0;
        if (style === 'alpine') {
          // Sharp alpine horns & arêtes
          structure = (voronoiRidge * 0.5 + Math.pow(flankRidge, 1.8) * 0.5);
        } else if (style === 'massif') {
          // Bulky block massif
          structure = (voronoiRidge * 0.6 + flankRidge * 0.4);
        } else if (style === 'spined') {
          // Long crest spine
          const spineExp = Math.exp(-ry * ry * 35 / (radius * radius));
          structure = (spineExp * 0.4 + voronoiRidge * 0.35 + flankRidge * 0.25);
        } else if (style === 'stratified') {
          // Layered steps
          structure = (voronoiRidge * 0.5 + flankRidge * 0.5);
        } else {
          // Craggy
          structure = (voronoiRidge * 0.4 + vDiff * 0.3 + microCrags * 0.3);
        }

        const rawHeight = edgeMask * (0.35 + 0.65 * structure + roughness * (microCrags - 0.5));
        const bulkyExponent = 1.6 - bulky * 1.0;
        mountainBody = Math.pow(Math.max(0, rawHeight), bulkyExponent);
      }

      // 5. Foothills & plains (anchored cleanly around mountain)
      const ped = Math.exp(-d * d * 0.6);
      const hillN = fbmHills.sample(u * 3.5 + 31, v * 3.5 + 31) * 0.5 + 0.5;
      const plainN = fbmPlains.sample(u * 1.5 + 7, v * 1.5 + 7) * 0.5 + 0.5;
      const ground = plainN * 0.03 + ped * (0.02 + 0.18 * foothills) * (0.6 + 0.4 * hillN);

      const total = ground + mountainBody * heightMult;
      h.set(x, y, Math.max(0, total));
    }
  }

  return h.normalize();
}
