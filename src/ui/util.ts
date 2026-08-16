import { Heightmap } from '../core/heightmap';
import { biomeColor, grayscale } from '../render/colormap';

/** Render a heightmap preview (with hillshading) into a canvas element. */
export function renderThumb(
  h: Heightmap,
  canvas: HTMLCanvasElement,
  size = 72,
  mode: 'biome' | 'grayscale' = 'biome'
) {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(size, size);
  const e = 1 / size;
  const s = h.size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1), v = y / (size - 1);
      const hv = h.sample(u, v);
      const xm = Math.max(0, u - e), xp = Math.min(1, u + e);
      const ym = Math.max(0, v - e), yp = Math.min(1, v + e);
      const dx = (h.sample(xp, v) - h.sample(xm, v)) * s * 0.5;
      const dy = (h.sample(u, yp) - h.sample(u, ym)) * s * 0.5;
      const slope = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      // hillshade: light from NW
      const shade = Math.min(Math.max(0.62 + (dx + dy) * 1.4, 0.18), 1.25);
      const c = mode === 'biome' ? biomeColor(hv, slope) : grayscale(hv);
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, c[0] * shade * 255);
      img.data[i + 1] = Math.min(255, c[1] * shade * 255);
      img.data[i + 2] = Math.min(255, c[2] * shade * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Export heightmap as 8-bit grayscale PNG download. */
export function exportHeightmapPNG(h: Heightmap, filename = 'heightmap.png') {
  const s = h.size;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(s, s);
  for (let i = 0; i < s * s; i++) {
    const v = Math.round(Math.min(Math.max(h.data[i], 0), 1) * 255);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}

export function downloadJSON(data: any, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/** Export heightmap as 16-bit little-endian RAW (.r16) — the game-engine
 *  heightmap format used by Unreal/Unity importers (GAEA exports this too). */
export function exportHeightmapR16(h: Heightmap, filename = 'heightmap.r16') {
  const s = h.size;
  const u16 = new Uint16Array(s * s);
  for (let i = 0; i < s * s; i++) {
    u16[i] = Math.round(Math.min(Math.max(h.data[i], 0), 1) * 65535);
  }
  const blob = new Blob([u16.buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}
