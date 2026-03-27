import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import type { C4Node, GraphEdge } from '../types/c4';
import { snapSizeToGrid } from './astarGridRouter';

/** Целевые размеры карточки; приводятся к кратным шагу сетки A* (см. GRID_CELL). */
const NODE_W = snapSizeToGrid(200);
const NODE_H = snapSizeToGrid(80);
const CLUSTER_MIN_W = snapSizeToGrid(320);
const CLUSTER_MIN_H = snapSizeToGrid(160);

function nodeSizeFromProperties(node: C4Node): { width: number; height: number } {
  const p = node.properties as Record<string, unknown>;
  const rawW = typeof p.__clusterWidth === 'number' ? p.__clusterWidth : NODE_W;
  const rawH = typeof p.__clusterHeight === 'number' ? p.__clusterHeight : NODE_H;
  const width = Math.max(CLUSTER_MIN_W, snapSizeToGrid(rawW));
  const height = Math.max(CLUSTER_MIN_H, snapSizeToGrid(rawH));
  if (p.__cluster === true) return { width, height };
  return { width: NODE_W, height: NODE_H };
}

/** Сверху вниз: система → контейнер → компонент → инстанс → деплой → окружение/инфра */
const LAYER_ORDER = [
  'SoftwareSystem',
  'Container',
  'Component',
  'ContainerInstance',
  'DeploymentNode',
  'Environment',
  'InfrastructureNode',
] as const;

/**
 * Индекс слоя по основному лейблу узла (0 — верх экрана).
 * Неизвестные лейблы — внизу, после всех перечисленных.
 */
export function tierFromLabels(labels: string[]): number {
  const hit = LAYER_ORDER.find((l) => labels.includes(l));
  if (hit !== undefined) return LAYER_ORDER.indexOf(hit);
  return LAYER_ORDER.length;
}

/** Базовый шаг между уровнями (до удвоения «центрального» уровня). */
function baseGap(height: number, maxTierInGraph: number): number {
  const tiers = Math.max(maxTierInGraph + 1, 1);
  return Math.max(118, Math.min(168, (height - 88) / Math.max(tiers, 5)));
}

/**
 * Верх каждого уровня (y левого верхнего угла карточки в этой полосе).
 * Уровень выбранного узла (centralTier) получает высоту 2×gap, остальные — gap.
 */
function computeTierTops(
  maxTierInGraph: number,
  centralTier: number | null,
  gap: number
): number[] {
  const tops: number[] = [];
  let y = 40;
  for (let t = 0; t <= maxTierInGraph; t++) {
    tops[t] = y;
    const band = centralTier !== null && t === centralTier ? gap * 2 : gap;
    y += band;
  }
  return tops;
}

export interface SimNode extends SimulationNodeDatum {
  id: string;
  node: C4Node;
  width: number;
  height: number;
}

export type GraphLink = SimulationLinkDatum<SimNode>;

interface SemiCirclePlacementInput {
  nodes: SimNode[];
  cx: number;
  cy: number;
  isTop: boolean;
  minRadius: number;
  yScale?: number;
  minVerticalOffset?: number;
}

function placeNodesOnSemicircle({
  nodes,
  cx,
  cy,
  isTop,
  minRadius,
  yScale = 1,
  minVerticalOffset = 0,
}: SemiCirclePlacementInput): void {
  if (nodes.length === 0) return;
  const maxDiag =
    nodes.length > 0
      ? Math.max(...nodes.map((n) => Math.hypot(n.width, n.height)))
      : Math.hypot(NODE_W, NODE_H);
  const nodeClearance = maxDiag + 12;
  const span = Math.PI;
  const slots = Math.max(nodes.length - 1, 1);
  const chordLimitedRadius = (nodeClearance * slots) / span;
  const radius = Math.max(minRadius, chordLimitedRadius);
  // Не используем крайние углы (0/π), чтобы узлы не попадали на горизонталь центра.
  const edgeInset = Math.PI * 0.12;
  const start = (isTop ? Math.PI : 0) + edgeInset;
  const effectiveSpan = Math.max(span - edgeInset * 2, Math.PI * 0.5);
  const step = nodes.length > 1 ? effectiveSpan / (nodes.length - 1) : 0;

  nodes.forEach((n, i) => {
    const a = start + step * i;
    const x = cx + radius * Math.cos(a);
    let y = cy + radius * Math.sin(a) * yScale;
    if (minVerticalOffset > 0) {
      if (isTop) y = Math.min(y, cy - minVerticalOffset);
      else y = Math.max(y, cy + minVerticalOffset);
    }
    n.x = x;
    n.y = y;
    n.fx = x;
    n.fy = y;
  });
}

function sortNodesByName(nodes: SimNode[]): SimNode[] {
  return [...nodes].sort((a, b) =>
    a.node.name.localeCompare(b.node.name, undefined, { sensitivity: 'base' })
  );
}

function spreadTierNodesHorizontally(simNodes: SimNode[], centerX: number): void {
  const byTier = new Map<number, SimNode[]>();
  for (const n of simNodes) {
    const tier = tierFromLabels(n.node.labels);
    const arr = byTier.get(tier);
    if (arr) arr.push(n);
    else byTier.set(tier, [n]);
  }

  const minGap = 56;
  for (const [, tierNodes] of byTier) {
    if (tierNodes.length <= 1) continue;
    const sorted = [...tierNodes].sort((a, b) => (a.x ?? centerX) - (b.x ?? centerX));
    const maxWidth = sorted.reduce((m, n) => Math.max(m, n.width), 0);
    const step = Math.max(maxWidth + minGap, NODE_W + minGap);
    const start = centerX - ((sorted.length - 1) * step) / 2;
    sorted.forEach((n, i) => {
      n.x = start + i * step;
    });
  }
}

function createSoftwareSystemFocusLayout(
  nodes: C4Node[],
  edges: GraphEdge[],
  width: number,
  height: number,
  selectedNodeId: string
): { simulation: Simulation<SimNode, GraphLink>; simNodes: SimNode[] } | null {
  const selected = nodes.find((n) => n.id === selectedNodeId);
  if (!selected || !selected.labels.includes('SoftwareSystem')) return null;

  const cx = width / 2;
  const cy = height / 2;

  const simNodes: SimNode[] = nodes.map((node, i) => ({
    ...nodeSizeFromProperties(node),
    id: node.id,
    node,
    x: cx + 180 * Math.cos((i / Math.max(nodes.length, 1)) * Math.PI * 2),
    y: cy + 110 * Math.sin((i / Math.max(nodes.length, 1)) * Math.PI * 2),
  }));
  const simById = new Map(simNodes.map((n) => [n.id, n]));

  const selectedSim = simById.get(selectedNodeId);
  if (!selectedSim) return null;
  selectedSim.x = cx;
  selectedSim.y = cy;
  selectedSim.fx = cx;
  selectedSim.fy = cy;

  const lower = new Set<string>();
  const upper = new Set<string>();
  for (const e of edges) {
    // Для режима SoftwareSystem учитываем только связи, инцидентные выбранному узлу,
    // и не ограничиваемся типом (:Child, :Relationship и т.д.).
    if (e.source === selectedNodeId && e.target !== selectedNodeId && simById.has(e.target)) {
      lower.add(e.target);
      continue;
    }
    if (e.target === selectedNodeId && e.source !== selectedNodeId && simById.has(e.source)) {
      upper.add(e.source);
    }
  }

  // Если узел связан в обе стороны, приоритет у нижней полусферы (исходящие связи).
  for (const id of lower) upper.delete(id);

  const lowerNodes = sortNodesByName(
    Array.from(lower)
      .map((id) => simById.get(id))
      .filter((n): n is SimNode => Boolean(n))
  );
  const upperNodes = sortNodesByName(
    Array.from(upper)
    .map((id) => simById.get(id))
      .filter((n): n is SimNode => Boolean(n))
  );

  const baseMinRadius = Math.max(NODE_W * 0.78, NODE_H * 1.55, Math.min(width, height) * 0.12);
  const totalAroundSelected = lowerNodes.length + upperNodes.length;
  const minRadius = totalAroundSelected <= 10 ? baseMinRadius * 2 : baseMinRadius;
  const minVerticalOffset = NODE_H * 0.95;
  placeNodesOnSemicircle({
    nodes: lowerNodes,
    cx,
    cy,
    isTop: false,
    minRadius,
    yScale: 0.72,
    minVerticalOffset,
  });
  placeNodesOnSemicircle({
    nodes: upperNodes,
    cx,
    cy,
    isTop: true,
    minRadius,
    yScale: 0.72,
    minVerticalOffset,
  });

  const simulation = forceSimulation<SimNode, GraphLink>(simNodes)
    .force('charge', forceManyBody<SimNode>().strength(-520))
    .force(
      'collide',
      forceCollide<SimNode>()
        .radius((d) => Math.hypot(d.width, d.height) / 2 + 20)
        .strength(1)
    )
    .alpha(0)
    .alphaMin(0.001)
    .stop();

  return { simulation, simNodes };
}

/**
 * Якорь по центру canvas, соседи — на окружности с шагом по хорде, чтобы карточки
 * не пересекались до запуска force (симуляция с alpha(0), как у SoftwareSystem-focus).
 */
function placeNeighborRing(
  neighborNodes: SimNode[],
  cx: number,
  cy: number,
  width: number,
  height: number
): void {
  if (neighborNodes.length === 0) return;
  const maxW = Math.max(...neighborNodes.map((n) => n.width));
  const maxH = Math.max(...neighborNodes.map((n) => n.height));
  const cardDiag = Math.hypot(maxW, maxH);
  const nodeClearance = cardDiag + 18;
  const n = neighborNodes.length;
  const baseMin = Math.max(
    maxW * 0.78,
    maxH * 1.55,
    Math.min(width, height) * 0.12,
    nodeClearance
  );
  let radius = baseMin;
  if (n > 1) {
    const chordNeeded = nodeClearance / (2 * Math.sin(Math.PI / n));
    radius = Math.max(radius, chordNeeded);
  }
  const start = -Math.PI / 2;
  neighborNodes.forEach((node, i) => {
    const a = start + (2 * Math.PI * i) / n;
    const centerX = cx + radius * Math.cos(a);
    const centerY = cy + radius * Math.sin(a);
    node.x = centerX - node.width / 2;
    node.y = centerY - node.height / 2;
    node.fx = node.x;
    node.fy = node.y;
  });
}

function createNonSoftwareSystemFocusLayout(
  nodes: C4Node[],
  edges: GraphEdge[],
  width: number,
  height: number,
  selectedNodeId: string
): { simulation: Simulation<SimNode, GraphLink>; simNodes: SimNode[] } | null {
  const selected = nodes.find((n) => n.id === selectedNodeId);
  if (!selected || selected.labels.includes("SoftwareSystem")) return null;

  const cx = width / 2;
  const cy = height / 2;

  const neighborIds = new Set<string>();
  for (const e of edges) {
    if (e.source === selectedNodeId) neighborIds.add(e.target);
    if (e.target === selectedNodeId) neighborIds.add(e.source);
  }
  neighborIds.delete(selectedNodeId);

  const simNodes: SimNode[] = nodes.map((node) => ({
    ...nodeSizeFromProperties(node),
    id: node.id,
    node,
    x: cx - nodeSizeFromProperties(node).width / 2,
    y: cy - nodeSizeFromProperties(node).height / 2,
  }));
  const simById = new Map(simNodes.map((n) => [n.id, n]));

  const selectedSim = simById.get(selectedNodeId);
  if (!selectedSim) return null;
  selectedSim.x = cx - selectedSim.width / 2;
  selectedSim.y = cy - selectedSim.height / 2;
  selectedSim.fx = selectedSim.x;
  selectedSim.fy = selectedSim.y;

  const neighborNodes = sortNodesByName(
    Array.from(neighborIds)
      .map((id) => simById.get(id))
      .filter((n): n is SimNode => Boolean(n))
  );

  placeNeighborRing(neighborNodes, cx, cy, width, height);
  // Якорь фиксируем, соседям даем "дышать": их дальше разжмет force.
  neighborNodes.forEach((n) => {
    n.fx = undefined;
    n.fy = undefined;
  });

  const idSet = new Set(simNodes.map((n) => n.id));
  const simLinks: GraphLink[] = edges
    .filter((e) => idSet.has(e.source) && idSet.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }));

  const simulation = forceSimulation<SimNode, GraphLink>(simNodes)
    .force(
      'link',
      forceLink<SimNode, GraphLink>(simLinks)
        .id((d) => d.id)
        .distance(300)
        .strength(0.35)
    )
    .force('charge', forceManyBody<SimNode>().strength(-1450))
    .force('x', forceX<SimNode>(cx).strength(0.1))
    .force('y', forceY<SimNode>(cy).strength(0.1))
    .force(
      'collide',
      forceCollide<SimNode>()
        .radius((d) => Math.hypot(d.width, d.height) / 2 + 36)
        .strength(1)
    )
    .velocityDecay(0.5)
    .alphaDecay(0.018)
    .alphaMin(0.001);

  return { simulation, simNodes };
}

function isDeploymentEnvironmentNode(node: C4Node): boolean {
  return node.labels.includes('DeploymentEnvironment') || node.labels.includes('Environment');
}

function createDeploymentEnvironmentTreeLayout(
  nodes: C4Node[],
  edges: GraphEdge[],
  width: number,
  height: number,
  selectedNodeId: string
): { simulation: Simulation<SimNode, GraphLink>; simNodes: SimNode[] } | null {
  const selected = nodes.find((n) => n.id === selectedNodeId);
  if (!selected || !isDeploymentEnvironmentNode(selected)) return null;

  const simNodes: SimNode[] = nodes.map((node) => ({
    ...nodeSizeFromProperties(node),
    id: node.id,
    node,
    x: width / 2,
    y: 40,
  }));
  const simById = new Map(simNodes.map((n) => [n.id, n]));

  const adj = new Map<string, Set<string>>();
  const addAdj = (a: string, b: string) => {
    let set = adj.get(a);
    if (!set) {
      set = new Set<string>();
      adj.set(a, set);
    }
    set.add(b);
  };
  for (const e of edges) {
    if (!simById.has(e.source) || !simById.has(e.target)) continue;
    addAdj(e.source, e.target);
    addAdj(e.target, e.source);
  }

  const depth = new Map<string, number>([[selectedNodeId, 0]]);
  const q: string[] = [selectedNodeId];
  for (let i = 0; i < q.length; i++) {
    const cur = q[i]!;
    const d = depth.get(cur)!;
    const neighbors = adj.get(cur);
    if (!neighbors) continue;
    neighbors.forEach((nxt) => {
      if (depth.has(nxt)) return;
      depth.set(nxt, d + 1);
      q.push(nxt);
    });
  }

  const unreachable = simNodes
    .map((n) => n.id)
    .filter((id) => !depth.has(id))
    .sort((a, b) => {
      const an = simById.get(a)!.node.name;
      const bn = simById.get(b)!.node.name;
      return an.localeCompare(bn, undefined, { sensitivity: 'base' });
    });
  const maxDepth = depth.size > 0 ? Math.max(...depth.values()) : 0;
  unreachable.forEach((id, idx) => {
    depth.set(id, maxDepth + 1 + Math.floor(idx / 1000));
  });

  const levels = new Map<number, SimNode[]>();
  simNodes.forEach((n) => {
    const d = depth.get(n.id) ?? 0;
    const list = levels.get(d);
    if (list) list.push(n);
    else levels.set(d, [n]);
  });

  const root = simById.get(selectedNodeId)!;
  const topPad = 32;
  root.x = width / 2 - root.width / 2;
  root.y = topPad;
  root.fx = root.x;
  root.fy = root.y;

  const levelGap = Math.max(120, NODE_H + 56);
  const orderedDepths = [...levels.keys()].sort((a, b) => a - b);
  for (const d of orderedDepths) {
    if (d === 0) continue;
    const levelNodes = (levels.get(d) ?? []).sort((a, b) =>
      a.node.name.localeCompare(b.node.name, undefined, { sensitivity: 'base' })
    );
    if (levelNodes.length === 0) continue;
    const gap = 40;
    const totalW =
      levelNodes.reduce((sum, n) => sum + n.width, 0) + gap * Math.max(levelNodes.length - 1, 0);
    let x = width / 2 - totalW / 2;
    const y = topPad + d * levelGap;
    levelNodes.forEach((n) => {
      n.x = x;
      n.y = Math.min(y, height - n.height - 24);
      n.fx = n.x;
      n.fy = n.y;
      x += n.width + gap;
    });
  }

  const simulation = forceSimulation<SimNode, GraphLink>(simNodes)
    .force(
      'collide',
      forceCollide<SimNode>()
        .radius((d) => Math.hypot(d.width, d.height) / 2 + 18)
        .strength(1)
    )
    .alpha(0)
    .alphaMin(0.001)
    .stop();

  return { simulation, simNodes };
}

/**
 * Раскладка по уровням (вертикаль фиксирована по типу узла) + горизонтальная сила:
 * связи, слабое отталкивание, коллизии, притягивание к центру по X.
 *
 * Если задан selectedNodeId: уровень этого узла получает удвоенную высоту;
 * выбранный узел — в верхней половине полосы, остальные на том же уровне — в нижней;
 * выбранный фиксируется по X в среднем положении остальных узлов этого уровня (после их начального размещения).
 */
export function createForceSimulation(
  nodes: C4Node[],
  edges: GraphEdge[],
  width: number,
  height: number,
  selectedNodeId?: string | null
): { simulation: Simulation<SimNode, GraphLink>; simNodes: SimNode[] } {
  if (selectedNodeId) {
    const envTreeLayout = createDeploymentEnvironmentTreeLayout(
      nodes,
      edges,
      width,
      height,
      selectedNodeId
    );
    if (envTreeLayout) return envTreeLayout;

    const focusLayout = createSoftwareSystemFocusLayout(
      nodes,
      edges,
      width,
      height,
      selectedNodeId
    );
    if (focusLayout) return focusLayout;

    const localFocus = createNonSoftwareSystemFocusLayout(
      nodes,
      edges,
      width,
      height,
      selectedNodeId
    );
    if (localFocus) return localFocus;
  }

  const cx = width / 2;
  const maxTier = nodes.length
    ? Math.max(...nodes.map((n) => tierFromLabels(n.labels)))
    : 0;

  const gap = baseGap(height, maxTier);
  const selected =
    selectedNodeId && nodes.some((n) => n.id === selectedNodeId)
      ? nodes.find((n) => n.id === selectedNodeId)!
      : null;
  const centralTier = selected ? tierFromLabels(selected.labels) : null;

  const tierTops = computeTierTops(maxTier, centralTier, gap);
  const padY = 8;

  const spread = Math.min(width * 0.84, 560);

  const simNodes: SimNode[] = nodes.map((node, i) => {
    const tier = tierFromLabels(node.labels);
    const top = tierTops[tier] ?? 40 + tier * gap;

    let yFixed: number;
    if (centralTier !== null && tier === centralTier) {
      if (node.id === selectedNodeId) {
        yFixed = top + padY;
      } else {
        yFixed = top + gap + padY;
      }
    } else {
      yFixed = top + padY;
    }

    const { width: nodeW, height: nodeH } = nodeSizeFromProperties(node);
    return {
      id: node.id,
      node,
      width: nodeW,
      height: nodeH,
      x: cx + spread * Math.cos((i / Math.max(nodes.length, 1)) * Math.PI * 2) * 0.8,
      y: yFixed,
      fy: yFixed,
    };
  });

  // Для обычной раскладки (не SoftwareSystem-focus): раздвигаем узлы по горизонтали
  // внутри каждого уровня, чтобы карточки не перекрывались при большом количестве.
  spreadTierNodesHorizontally(simNodes, cx);

  if (centralTier !== null && selectedNodeId) {
    const inTier = simNodes.filter((s) => tierFromLabels(s.node.labels) === centralTier);
    const others = inTier.filter((s) => s.id !== selectedNodeId);
    const sel = simNodes.find((s) => s.id === selectedNodeId);
    if (sel) {
      if (others.length > 0) {
        const mx = others.reduce((sum, n) => sum + (n.x ?? cx), 0) / others.length;
        sel.x = mx;
        sel.fx = mx;
      } else {
        sel.x = cx;
        sel.fx = cx;
      }
    }
  }

  const idSet = new Set(simNodes.map((n) => n.id));
  const simLinks: GraphLink[] = edges
    .filter((e) => idSet.has(e.source) && idSet.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }));

  const simulation = forceSimulation<SimNode, GraphLink>(simNodes)
    .force(
      'link',
      forceLink<SimNode, GraphLink>(simLinks)
        .id((d) => d.id)
        .distance(360)
        .strength(0.55)
    )
    .force('charge', forceManyBody<SimNode>().strength(-980))
    .force('x', forceX<SimNode>(cx).strength(0.08))
    .force(
      'collide',
      forceCollide<SimNode>()
        .radius((d) => Math.hypot(d.width, d.height) / 2 + 30)
        .strength(0.9)
    )
    .velocityDecay(0.6)
    .alphaDecay(0.028)
    .alphaMin(0.001);

  return { simulation, simNodes };
}

export { NODE_W, NODE_H };
