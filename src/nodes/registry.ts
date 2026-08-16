import { NodeTypeDefinition } from '../core/graph';
import { GradientNode, RadialGradientNode, ConstantNode } from './generators';
import { NoiseNode, VoronoiNode } from './noise-nodes';
import { BlurNode, SharpenNode, AdjustNode, RemapNode } from './filters';
import { ClampNode, InvertNode, TerraceNode, SlopeNode } from './filters-extra';
import { HydraulicErosionNode } from './erosion';
import { ThermalErosionNode } from './erosion-thermal';
import { WindErosionNode } from './erosion-wind';
import { BlendNode, DisplaceNode } from './combine';
import { SelectRangeNode, OutputNode } from './select';
import {
  MountainNode, IslandNode, RidgeNode, PeaksNode,
  CraterNode, CanyonNode, DunesNode, VolcanoNode, MesaNode
} from './primitives';

export const NODE_TYPES: NodeTypeDefinition[] = [
  // Primitives
  MountainNode,
  IslandNode,
  RidgeNode,
  PeaksNode,
  CraterNode,
  CanyonNode,
  DunesNode,
  VolcanoNode,
  MesaNode,
  // Generators
  NoiseNode,
  VoronoiNode,
  GradientNode,
  RadialGradientNode,
  ConstantNode,
  // Filters
  BlurNode,
  SharpenNode,
  AdjustNode,
  RemapNode,
  ClampNode,
  InvertNode,
  TerraceNode,
  SlopeNode,
  // Erosion
  HydraulicErosionNode,
  ThermalErosionNode,
  WindErosionNode,
  // Combiners
  BlendNode,
  DisplaceNode,
  // Selectors
  SelectRangeNode,
  // Output
  OutputNode,
];

export const CATEGORY_ORDER = ['Primitives', 'Generators', 'Filters', 'Erosion', 'Combiners', 'Selectors', 'Output'];

export function nodeDef(type: string): NodeTypeDefinition | undefined {
  return NODE_TYPES.find(n => n.type === type);
}
