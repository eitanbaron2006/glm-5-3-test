/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAD2: Array<[number, number]> = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1]
];

/** Classic seeded 2D gradient (Perlin-style) noise, output ~[-1,1]. */
export class PerlinNoise {
  private perm: Uint8Array;

  constructor(seed = 1337) {
    const rand = mulberry32(seed);
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private grad(hash: number, x: number, y: number): number {
    const g = GRAD2[hash & 7];
    return g[0] * x + g[1] * y;
  }

  noise(x: number, y: number): number {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const u = fade(xf), v = fade(yf);
    const p = this.perm;
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const x1 = this.grad(aa, xf, yf) + u * (this.grad(ba, xf - 1, yf) - this.grad(aa, xf, yf));
    const x2 = this.grad(ab, xf, yf - 1) + u * (this.grad(bb, xf - 1, yf - 1) - this.grad(ab, xf, yf - 1));
    return x1 + v * (x2 - x1); // ~[-1.4, 1.4] in theory, practically [-1,1]
  }
}

export type NoiseType = 'perlin' | 'billow' | 'ridged' | 'wire' | 'classicfbm';

/** Fractal Brownian Motion noise generator with selectable style. */
export class FBM {
  private perlin: PerlinNoise;
  constructor(
    public seed = 1337,
    public octaves = 6,
    public lacunarity = 2.0,
    public gain = 0.5,
    public type: NoiseType = 'perlin'
  ) {
    this.perlin = new PerlinNoise(seed);
  }

  sample(x: number, y: number): number {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    let prev = 1.0;
    for (let o = 0; o < this.octaves; o++) {
      let n = this.perlin.noise(x * freq, y * freq);
      switch (this.type) {
        case 'billow': n = Math.abs(n) * 2 - 1; break;
        case 'ridged': n = 1 - Math.abs(n); n *= n; break;
        case 'wire': n = Math.abs(Math.abs(n) * 2 - 1); n = 1 - n * n; break;
        case 'classicfbm': n = n * 0.5 + 0.5; break; // per-octave softening
      }
      sum += n * amp * prev;
      norm += amp * prev;
      prev = Math.max(n, 0.35);
      amp *= this.gain;
      freq *= this.lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  }
}

export type VoronoiFeature = 'f1' | 'f2' | 'f2minusf1' | 'cellular';

/**
 * Jittered-grid Voronoi. Deterministic, tileable enough for terrain use.
 * Output in [0,1].
 */
export function voronoi(
  u: number, v: number, frequency: number, seed: number, feature: VoronoiFeature
): number {
  const px = u * frequency, py = v * frequency;
  const gx = Math.floor(px), gy = Math.floor(py);
  let f1 = Infinity, f2 = Infinity;
  let cellHash = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = gx + ox, cy = gy + oy;
      const h = (cx * 374761393 + cy * 668265263 + seed * 2246822519) >>> 0;
      const jx = ((h & 0xffff) / 65535) * 0.8 + 0.1;
      const jy = (((h >>> 8) & 0xffff) / 65535) * 0.8 + 0.1;
      const dx = cx + jx - px, dy = cy + jy - py;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; cellHash = h; }
      else if (d < f2) { f2 = d; }
    }
  }
  switch (feature) {
    case 'f1': return Math.min(f1, 1);
    case 'f2': return Math.min(f2, 1);
    case 'f2minusf1': return Math.min(f2 - f1, 1);
    case 'cellular': return ((cellHash >>> 16) & 0xff) / 255;
  }
}
