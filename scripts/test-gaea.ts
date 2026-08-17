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

// Let's test a true GAEA Heterogeneous Ridged Multifractal + Anisotropic Tectonic Spine + Strata algorithm
const seed = 2025;
const perlin = new PerlinNoise(seed);
const warpPerlin = new PerlinNoise(seed + 101);
const detailPerlin = new PerlinNoise(seed + 202);
const strataPerlin = new PerlinNoise(seed + 303);

const cx = 0.5, cy = 0.52;
const radius = 0.4;
const steepness = 2.2;
const bulky = 0.5;
const elong = 0.3;
const angle = 45 * Math.PI / 180;
const irregular = 0.4;
const roughness = 0.25;
const benches = 0.4;
const foothills = 0.6;

const ca = Math.cos(angle), sa = Math.sin(angle);

for (let y = 0; y < s; y++) {
  for (let x = 0; x < s; x++) {
    const u = x / (s - 1);
    const v = y / (s - 1);
    const dx = u - cx;
    const dy = v - cy;

    // Tectonic domain warp
    const wx = dx + warpPerlin.noise(u * 3 + 12, v * 3 + 17) * irregular * 0.18;
    const wy = dy + warpPerlin.noise(u * 3 + 54, v * 3 + 79) * irregular * 0.18;

    // Rotated & elongated coordinate frame
    const rx = (wx * ca + wy * sa) / (1 + elong);
    const ry = (-wx * sa + wy * ca) * (1 + elong);
    const d = Math.sqrt(rx * rx + ry * ry) / radius;

    // Base mountain envelope / footprint
    const env = Math.max(0, 1 - d);
    const cone = Math.pow(env, steepness);
    const bulkM = Math.pow(Math.cos(Math.min(d, 1) * Math.PI * 0.5), Math.max(0.4, steepness * 0.6));
    const envelope = (1 - bulky) * cone + bulky * bulkM;

    // Heterogeneous ridged multifractal for true mountain ridges & horns
    // Octave 0: Primary spine & arêtes
    const n0 = perlin.noise(rx * 4 + 7, ry * 4 + 9);
    let r0 = 1 - Math.abs(n0);
    r0 = r0 * r0;

    // Octave 1: Secondary branching ridges (weighted by r0)
    const n1 = perlin.noise(rx * 8 + 19, ry * 8 + 23);
    let r1 = 1 - Math.abs(n1);
    r1 = r1 * r1 * (0.4 + 0.6 * r0);

    // Octave 2: Meso couloirs & spurs
    const n2 = perlin.noise(rx * 16 + 37, ry * 16 + 41);
    let r2 = 1 - Math.abs(n2);
    r2 = r2 * r2 * (0.3 + 0.7 * r1);

    // Octave 3: Micro crags & rock chisel
    const n3 = detailPerlin.noise(u * 28 + 53, v * 28 + 61);
    const r3 = (1 - Math.abs(n3)) * (0.3 + 0.7 * r2);

    const fractalRidge = (r0 * 0.5 + r1 * 0.3 + r2 * 0.15 + r3 * 0.05);

    // Geological strata terraces
    let strata = 0;
    if (benches > 0.01) {
      const stPhase = (envelope + fractalRidge * 0.5 + strataPerlin.noise(u * 2, v * 2) * 0.05) * 10;
      const k = Math.floor(stPhase);
      const f = stPhase - k;
      const ss = (t: number) => { const c = Math.min(Math.max(t, 0), 1); return c * c * (3 - 2 * c); };
      const step = ss((f - 0.25) / 0.5);
      strata = (step - 0.5) * 0.1 * benches;
    }

    // Mountain mass combination
    const peakHeight = envelope * (0.4 + 0.6 * fractalRidge + strata + roughness * (r3 - 0.5));

    // Foothills apron
    const ped = Math.exp(-d * d * 1.8);
    const hillNoise = perlin.noise(u * 4 + 73, v * 4 + 79) * 0.5 + 0.5;
    const apron = ped * foothills * 0.18 * hillNoise;

    h.set(x, y, Math.max(0, peakHeight + apron));
  }
}

h.normalize();
console.log(`Test Mountain: min=${h.min().toFixed(3)} max=${h.max().toFixed(3)}`);
console.log(ascii(h));
