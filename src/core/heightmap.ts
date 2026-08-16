/** Floating-point heightmap buffer with common utilities. */
export class Heightmap {
  readonly size: number;
  data: Float32Array;

  constructor(size: number) {
    this.size = size;
    this.data = new Float32Array(size * size);
  }

  get(x: number, y: number): number {
    return this.data[y * this.size + x];
  }

  set(x: number, y: number, v: number) {
    this.data[y * this.size + x] = v;
  }

  /** Bilinear sample in normalized [0,1] coordinates. */
  sample(u: number, v: number): number {
    const s = this.size;
    const fx = Math.min(Math.max(u, 0), 1) * (s - 1);
    const fy = Math.min(Math.max(v, 0), 1) * (s - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, s - 1), y1 = Math.min(y0 + 1, s - 1);
    const tx = fx - x0, ty = fy - y0;
    const a = this.data[y0 * s + x0], b = this.data[y0 * s + x1];
    const c = this.data[y1 * s + x0], d = this.data[y1 * s + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  min(): number {
    let m = Infinity;
    for (let i = 0; i < this.data.length; i++) if (this.data[i] < m) m = this.data[i];
    return m;
  }

  max(): number {
    let m = -Infinity;
    for (let i = 0; i < this.data.length; i++) if (this.data[i] > m) m = this.data[i];
    return m;
  }

  clone(): Heightmap {
    const h = new Heightmap(this.size);
    h.data.set(this.data);
    return h;
  }

  /** Normalize to full [0,1] range (safely, if range is degenerate). */
  normalize(): Heightmap {
    const mn = this.min(), mx = this.max();
    const r = mx - mn;
    if (r < 1e-12) { this.data.fill(0); return this; }
    const inv = 1 / r;
    for (let i = 0; i < this.data.length; i++) this.data[i] = (this.data[i] - mn) * inv;
    return this;
  }

  fill(v: number): Heightmap {
    this.data.fill(v);
    return this;
  }
}
