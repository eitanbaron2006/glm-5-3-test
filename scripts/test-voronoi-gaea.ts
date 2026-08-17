import { Heightmap } from '../src/core/heightmap';
import { FBM, PerlinNoise, voronoi } from '../src/core/noise';

function ascii(h: Heightmap, w = 90, ht = 35) {
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

const s = 128;
const h = new Heightmap(s);

const seed = 2025;
const fbmWarp = new FBM(seed + 13, 4, 2.0, 0.5, 'perlin');
const fbmDetail = new FBM(seed + 77, 5, 2.1, 0.5, 'ridged');
const fbmBillow = new FBM(seed + 109, 4, 2.0, 0.5, 'billow');

const cx = 0.5, cy = 0.5;
const scale = 0.4; // Mountain scale
const edge = 2.0;  // Edge falloff sprawl
const bulky = 0.5; // Bulky volume
const height = 1.0;

for (let y = 0; y < s; y++) {
  for (let x = 0; x < s; x++) {
    const u = x / (s - 1);
    const v = y / (s - 1);
    const dx = u - cx;
    const dy = v - cy;

    // Domain warp distortion
    const wx = dx + fbmWarp.sample(u * 3 + 11, v * 3 + 17) * 0.12;
    const wy = dy + fbmWarp.sample(u * 3 + 53, v * 3 + 79) * 0.12;

    const d = Math.sqrt(wx * wx + wy * wy) / scale;
    const edgeMask = Math.pow(Math.max(0, 1 - d), edge);

    if (edgeMask <= 0) {
      h.set(x, y, 0);
      continue;
    }

    // Modulated Voronoi patterns (Cellular & F1 & F2-F1)
    const v1 = voronoi(u + wx * 0.5, v + wy * 0.5, 6, seed, 'f1');
    const v2 = voronoi(u + wx * 0.5, v + wy * 0.5, 6, seed, 'f2minusf1');
    const vorRidge = (1 - v1) * 0.6 + v2 * 0.4;

    // Fractal ridged detail
    const detail = fbmDetail.sample(u * 6 + 101, v * 6 + 101) * 0.5 + 0.5;
    const billow = fbmBillow.sample(u * 4 + 203, v * 4 + 203) * 0.5 + 0.5;

    // Combined structure
    const shape = (vorRidge * 0.55 + detail * 0.35 + billow * 0.1);
    const rawVal = edgeMask * shape;

    // Bulky mass transfer
    const bulkyExp = 1.6 - bulky * 1.0; // 1.6 (pinched) to 0.6 (bulky)
    const finalVal = Math.pow(rawVal, bulkyExp) * height;

    h.set(x, y, finalVal);
  }
}

h.normalize();
console.log(`Voronoi Mountain: min=${h.min().toFixed(3)} max=${h.max().toFixed(3)}`);
console.log(ascii(h));
