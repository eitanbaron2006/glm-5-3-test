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

  // steep slopes turn rocky, highest slopes darker rock
  const rockT = Math.min(Math.max((slope - 0.45) / 0.35, 0), 1);
  c = lerpColor(c[0], c[1], c[2], ROCK[0] * 0.75, ROCK[1] * 0.75, ROCK[2] * 0.78, rockT);

  // snow only sticks on flatter faces
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

export type ColorMode = 'biome' | 'grayscale';

export function colorFor(mode: ColorMode, h: number, slope: number): [number, number, number] {
  return mode === 'biome' ? biomeColor(h, slope) : grayscale(h);
}
