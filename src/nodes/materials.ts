import { Heightmap } from '../core/heightmap';
import { NodeTypeDefinition } from '../core/graph';
import { makeSize } from './generators';

export interface MaterialDef {
  id: string;
  name: string;
  color: [number, number, number];
  metallic: number;
  roughness: number;
}

export const DEFAULT_MATERIALS: MaterialDef[] = [
  { id: 'sand', name: 'Sand', color: [0.76, 0.70, 0.50], metallic: 0, roughness: 0.95 },
  { id: 'grass', name: 'Grass', color: [0.29, 0.44, 0.19], metallic: 0, roughness: 0.9 },
  { id: 'rock', name: 'Rock', color: [0.42, 0.38, 0.35], metallic: 0.05, roughness: 0.85 },
  { id: 'snow', name: 'Snow', color: [0.93, 0.94, 0.96], metallic: 0, roughness: 0.7 },
  { id: 'mud', name: 'Mud', color: [0.35, 0.28, 0.22], metallic: 0, roughness: 0.95 },
  { id: 'gravel', name: 'Gravel', color: [0.5, 0.48, 0.45], metallic: 0.02, roughness: 0.8 },
];

const MATERIAL_OPTIONS = DEFAULT_MATERIALS.map(m => ({ value: m.id, label: m.name }));
const LAYER_SOURCE_OPTIONS = [
  { value: 'height', label: 'Height' },
  { value: 'slope', label: 'Slope' },
  { value: 'mask1', label: 'Mask 1' },
  { value: 'mask2', label: 'Mask 2' },
  { value: 'mask3', label: 'Mask 3' },
  { value: 'mask4', label: 'Mask 4' },
];

export interface SetMapEntry {
  materialId: string;
  mask: Float32Array;
  priority: number;
  size: number;
  strength: number;
  contrast: number;
}

export interface SetMapData {
  entries: SetMapEntry[];
  baseMaterialId: string;
}

function falloff(v: number, pos: number, half: number, range: number): number {
  const d = Math.abs(v - pos);
  if (d <= half) return 1;
  const t = (d - half) / Math.max(range, 1e-6);
  return t >= 1 ? 0 : 1 - t * t * (3 - 2 * t);
}

function createMask(size: number, position: number, range: number, falloffAmt: number, invert: boolean, source: Heightmap): Float32Array {
  const out = new Float32Array(size * size);
  const half = range * (1 - falloffAmt) * 0.5;
  const falloffRange = range * falloffAmt * 0.5 + 1e-6;
  for (let i = 0; i < source.data.length; i++) {
    let m = falloff(source.data[i], position, half, falloffRange);
    if (invert) m = 1 - m;
    out[i] = m;
  }
  return out;
}

export const SetMapNode: NodeTypeDefinition = {
  type: 'setmap',
  title: 'SetMap',
  category: 'Materials',
  color: '#70326a',
  inputs: [
    { id: 'height', label: 'Height' },
    { id: 'slope', label: 'Slope' },
    { id: 'mask1', label: 'Mask 1' },
    { id: 'mask2', label: 'Mask 2' },
    { id: 'mask3', label: 'Mask 3' },
    { id: 'mask4', label: 'Mask 4' },
  ],
  outputs: [
    { id: 'out', label: 'Terrain' },
  ],
  params: [
    { id: 'baseMaterial', label: 'Base Material', type: 'select', options: MATERIAL_OPTIONS, default: 'rock' },
    { id: 'layer1Material', label: 'Layer 1 Material', type: 'select', options: MATERIAL_OPTIONS, default: 'grass' },
    { id: 'layer1Source', label: 'Layer 1 Source', type: 'select', options: LAYER_SOURCE_OPTIONS, default: 'height' },
    { id: 'layer1Position', label: 'Layer 1 Position', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.3 },
    { id: 'layer1Range', label: 'Layer 1 Range', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.25 },
    { id: 'layer1Falloff', label: 'Layer 1 Falloff', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.3 },
    { id: 'layer1Strength', label: 'Layer 1 Strength', type: 'slider', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'layer1Contrast', label: 'Layer 1 Contrast', type: 'slider', min: 0, max: 4, step: 0.01, default: 1 },
    { id: 'layer1Invert', label: 'Layer 1 Invert', type: 'check', default: false },
    { id: 'layer1Priority', label: 'Layer 1 Priority', type: 'slider', min: 0, max: 10, step: 1, default: 1 },
    { id: 'layer2Enabled', label: 'Enable Layer 2', type: 'check', default: false },
    { id: 'layer2Material', label: 'Layer 2 Material', type: 'select', options: MATERIAL_OPTIONS, default: 'snow' },
    { id: 'layer2Source', label: 'Layer 2 Source', type: 'select', options: LAYER_SOURCE_OPTIONS, default: 'height' },
    { id: 'layer2Position', label: 'Layer 2 Position', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.7 },
    { id: 'layer2Range', label: 'Layer 2 Range', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.2 },
    { id: 'layer2Falloff', label: 'Layer 2 Falloff', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.25 },
    { id: 'layer2Strength', label: 'Layer 2 Strength', type: 'slider', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'layer2Contrast', label: 'Layer 2 Contrast', type: 'slider', min: 0, max: 4, step: 0.01, default: 1 },
    { id: 'layer2Invert', label: 'Layer 2 Invert', type: 'check', default: false },
    { id: 'layer2Priority', label: 'Layer 2 Priority', type: 'slider', min: 0, max: 10, step: 1, default: 2 },
    { id: 'layer3Enabled', label: 'Enable Layer 3', type: 'check', default: false },
    { id: 'layer3Material', label: 'Layer 3 Material', type: 'select', options: MATERIAL_OPTIONS, default: 'sand' },
    { id: 'layer3Source', label: 'Layer 3 Source', type: 'select', options: LAYER_SOURCE_OPTIONS, default: 'height' },
    { id: 'layer3Position', label: 'Layer 3 Position', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.05 },
    { id: 'layer3Range', label: 'Layer 3 Range', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.1 },
    { id: 'layer3Falloff', label: 'Layer 3 Falloff', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.3 },
    { id: 'layer3Strength', label: 'Layer 3 Strength', type: 'slider', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'layer3Contrast', label: 'Layer 3 Contrast', type: 'slider', min: 0, max: 4, step: 0.01, default: 1 },
    { id: 'layer3Invert', label: 'Layer 3 Invert', type: 'check', default: false },
    { id: 'layer3Priority', label: 'Layer 3 Priority', type: 'slider', min: 0, max: 10, step: 1, default: 0 },
    { id: 'layer4Enabled', label: 'Enable Layer 4', type: 'check', default: false },
    { id: 'layer4Material', label: 'Layer 4 Material', type: 'select', options: MATERIAL_OPTIONS, default: 'mud' },
    { id: 'layer4Source', label: 'Layer 4 Source', type: 'select', options: LAYER_SOURCE_OPTIONS, default: 'slope' },
    { id: 'layer4Position', label: 'Layer 4 Position', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.6 },
    { id: 'layer4Range', label: 'Layer 4 Range', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.3 },
    { id: 'layer4Falloff', label: 'Layer 4 Falloff', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.3 },
    { id: 'layer4Strength', label: 'Layer 4 Strength', type: 'slider', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'layer4Contrast', label: 'Layer 4 Contrast', type: 'slider', min: 0, max: 4, step: 0.01, default: 1 },
    { id: 'layer4Invert', label: 'Layer 4 Invert', type: 'check', default: false },
    { id: 'layer4Priority', label: 'Layer 4 Priority', type: 'slider', min: 0, max: 10, step: 1, default: 3 },
  ],
  compute(inputs, p, ctx) {
    const height = inputs.height ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const slope = inputs.slope ?? new Heightmap(makeSize(ctx.size)).fill(0);
    const masks = [
      inputs.mask1 ?? null,
      inputs.mask2 ?? null,
      inputs.mask3 ?? null,
      inputs.mask4 ?? null,
    ];

    const size = height.size;
    const entries: SetMapEntry[] = [];

    const baseMat = DEFAULT_MATERIALS.find(m => m.id === p.baseMaterial) ?? DEFAULT_MATERIALS[2];
    entries.push({
      materialId: baseMat.id,
      mask: new Float32Array(size * size).fill(1),
      priority: -1,
      size,
      strength: 1,
      contrast: 1,
    });

    const layers = [
      { enabled: true, material: p.layer1Material, source: p.layer1Source, position: p.layer1Position, range: p.layer1Range, falloff: p.layer1Falloff, invert: p.layer1Invert, priority: p.layer1Priority, strength: p.layer1Strength, contrast: p.layer1Contrast, maskIdx: 0 },
      { enabled: p.layer2Enabled, material: p.layer2Material, source: p.layer2Source, position: p.layer2Position, range: p.layer2Range, falloff: p.layer2Falloff, invert: p.layer2Invert, priority: p.layer2Priority, strength: p.layer2Strength, contrast: p.layer2Contrast, maskIdx: 1 },
      { enabled: p.layer3Enabled, material: p.layer3Material, source: p.layer3Source, position: p.layer3Position, range: p.layer3Range, falloff: p.layer3Falloff, invert: p.layer3Invert, priority: p.layer3Priority, strength: p.layer3Strength, contrast: p.layer3Contrast, maskIdx: 2 },
      { enabled: p.layer4Enabled, material: p.layer4Material, source: p.layer4Source, position: p.layer4Position, range: p.layer4Range, falloff: p.layer4Falloff, invert: p.layer4Invert, priority: p.layer4Priority, strength: p.layer4Strength, contrast: p.layer4Contrast, maskIdx: 3 },
    ];

    for (const layer of layers) {
      if (!layer.enabled) continue;
      let sourceMap: Heightmap;
      switch (layer.source) {
        case 'slope': sourceMap = slope; break;
        case 'mask1': sourceMap = masks[0] ?? height; break;
        case 'mask2': sourceMap = masks[1] ?? height; break;
        case 'mask3': sourceMap = masks[2] ?? height; break;
        case 'mask4': sourceMap = masks[3] ?? height; break;
        default: sourceMap = height; break;
      }
      const mask = createMask(size, layer.position, layer.range, layer.falloff, layer.invert, sourceMap);
      
      // Apply contrast (gamma) and strength
      if (layer.contrast !== 1 || layer.strength !== 1) {
        for (let i = 0; i < mask.length; i++) {
          mask[i] = Math.pow(mask[i], layer.contrast) * layer.strength;
        }
      }
      
      const mat = DEFAULT_MATERIALS.find(m => m.id === layer.material) ?? DEFAULT_MATERIALS[0];
      entries.push({
        materialId: mat.id,
        mask,
        priority: layer.priority,
        size,
        strength: layer.strength,
        contrast: layer.contrast,
      });
    }

    entries.sort((a, b) => b.priority - a.priority);

    const setmapData: SetMapData = { entries, baseMaterialId: baseMat.id };

    const out = new Heightmap(size);
    out.data.set(height.data);
    (out as any).setmap = setmapData;

    return out;
  },
};

export function getMaterialById(id: string): MaterialDef {
  return DEFAULT_MATERIALS.find(m => m.id === id) ?? DEFAULT_MATERIALS[2];
}

export function resolveSetMapColor(setmap: SetMapData | undefined, u: number, v: number): [number, number, number] {
  if (!setmap || !setmap.entries.length) {
    return [0.5, 0.5, 0.5];
  }

  // Gaea-style blended compositing: accumulate all layers with their mask weights
  // Base layer is always at full opacity (mask = 1)
  let r = 0, g = 0, b = 0;
  let totalWeight = 0;

  for (const entry of setmap.entries) {
    const iu = Math.min(Math.floor(u * entry.size), entry.size - 1);
    const iv = Math.min(Math.floor(v * entry.size), entry.size - 1);
    const idx = (iv * entry.size + iu);
    const maskVal = entry.mask[idx];

    if (maskVal <= 0) continue;

    const mat = getMaterialById(entry.materialId);
    const weight = maskVal * (entry.strength ?? 1);
    r += mat.color[0] * weight;
    g += mat.color[1] * weight;
    b += mat.color[2] * weight;
    totalWeight += weight;
  }

  if (totalWeight > 0) {
    return [r / totalWeight, g / totalWeight, b / totalWeight];
  }

  const baseMat = getMaterialById(setmap.baseMaterialId);
  return baseMat.color;
}