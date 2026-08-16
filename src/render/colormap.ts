/** Terrain color helpers shared by the 3D viewport and node thumbnails. */

export function lerpColor(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number, t: number
): [number, number, number] {
  return [r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t];
}

const SAND: [number, number, number] = [0.76, 0.70, 0.50];
const GRASS: [number, number, number] = [0.29, 0.44, 0.19];
const ROCK: [number, number, number] = [0.42, 0.38, 0.35];
const SNOW: [number, number, number] = [0.93, 0.94, 0.96];
const DEEP: [number, number, number] = [0.55, 0.50, 0.36];

/** Biome-ish coloring: sand -> grass -> rock -> snow, rock on steep slopes. */
export function biomeColor(h: number, slope: number): [number, number, number] {
  let c: [number, number, number];
  if (h < 0.08) c = lerpColor(...DEEP, ...SAND, h / 0.08);
  else if (h < 0.30) c = lerpColor(...SAND, ...GRASS, (h - 0.08) / 0.22);
  else if (h < 0.62) c = lerpColor(...GRASS, ...ROCK, (h - 0.30) / 0.32);
  else c = lerpColor(...ROCK, ...SNOW, Math.min(1, (h - 0.62) / 0.3));

  const rockT = Math.min(Math.max((slope - 0.45) / 0.35, 0), 1);
  c = lerpColor(c[0], c[1], c[2], ROCK[0] * 0.75, ROCK[1] * 0.75, ROCK[2] * 0.78, rockT);

  if (h > 0.72) {
    const snowT = Math.min(Math.max((h - 0.72) / 0.25, 0), 1) * Math.min(Math.max((0.7 - slope) / 0.4, 0), 1);
    c = lerpColor(c[0], c[1], c[2], SNOW[0], SNOW[1], SNOW[2], snowT);
  }
  return c;
}

/** Grayscale height ramp for 2D previews. */
export function grayscale(h: number): [number, number, number] {
  return [h, h, h];
}

export type ColorMode = 'biome' | 'grayscale' | 'materials';

export function colorFor(mode: ColorMode, h: number, slope: number): [number, number, number] {
  if (mode === 'biome') return biomeColor(h, slope);
  if (mode === 'grayscale') return grayscale(h);
  return biomeColor(h, slope);
}

export interface MaterialDef {
  id: string;
  name: string;
  color: [number, number, number];
  metallic: number;
  roughness: number;
}

export interface SetMapEntry {
  materialId: string;
  mask: Float32Array;
  priority: number;
  size: number;
}

export interface SetMapData {
  entries: SetMapEntry[];
  baseMaterialId: string;
}

export const DEFAULT_MATERIALS: MaterialDef[] = [
  { id: 'sand', name: 'Sand', color: [0.76, 0.70, 0.50], metallic: 0, roughness: 0.95 },
  { id: 'grass', name: 'Grass', color: [0.29, 0.44, 0.19], metallic: 0, roughness: 0.9 },
  { id: 'rock', name: 'Rock', color: [0.42, 0.38, 0.35], metallic: 0.05, roughness: 0.85 },
  { id: 'snow', name: 'Snow', color: [0.93, 0.94, 0.96], metallic: 0, roughness: 0.7 },
  { id: 'mud', name: 'Mud', color: [0.35, 0.28, 0.22], metallic: 0, roughness: 0.95 },
  { id: 'gravel', name: 'Gravel', color: [0.5, 0.48, 0.45], metallic: 0.02, roughness: 0.8 },
];

export function getMaterialById(id: string): MaterialDef {
  return DEFAULT_MATERIALS.find(m => m.id === id) ?? DEFAULT_MATERIALS[2];
}

export function resolveSetMapColor(setmap: SetMapData | undefined, u: number, v: number): [number, number, number] {
  if (!setmap || !setmap.entries.length) {
    return [0.5, 0.5, 0.5];
  }
  for (const entry of setmap.entries) {
    const iu = Math.min(Math.floor(u * entry.size), entry.size - 1);
    const iv = Math.min(Math.floor(v * entry.size), entry.size - 1);
    const idx = (iv * entry.size + iu);
    const maskVal = entry.mask[idx];
    if (maskVal > 0.5) {
      const mat = getMaterialById(entry.materialId);
      return mat.color;
    }
  }
  const baseMat = getMaterialById(setmap.baseMaterialId);
  return baseMat.color;
}
