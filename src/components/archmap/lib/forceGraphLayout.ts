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
import { nodeDisplayName, type C4Node, type GraphEdge } from '../types/c4';
import { GRID_CELL, snapSizeToGrid } from './astarGridRouter';

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

function isClusterSimNode(n: SimNode): boolean {
  return (n.node.properties as Record<string, unknown>).__cluster === true;
}

/** Радиус для forceCollide: кластеры — с большим зазором (широкие прямоугольники). */
function collideRadiusForNode(d: SimNode): number {
  const base = Math.hypot(d.width, d.height) / 2 + GRID_CELL / 2;
  return isClusterSimNode(d) ? base + GRID_CELL : base;
}

function pairGapExtra(a: SimNode, b: SimNode): number {
  return (isClusterSimNode(a) ? GRID_CELL : 0) + (isClusterSimNode(b) ? GRID_CELL : 0);
}

/** Слои обычной раскладки сверху вниз (по ТЗ). */
const LAYER_ORDER = [
  'SoftwareSystem',
  'Container',
  'Component',
  'ContainerInstance',
  'DeploymentNode',
  'DeploymentEnvironment',
] as const;

/**
 * Индекс слоя по основному лейблу узла (0 — верх экрана).
 * Неизвестные лейблы — внизу, после всех перечисленных.
 */
export function tierFromLabels(labels: string[]): number {
  const normalized = new Set(labels);
  if (normalized.has('Environment')) normalized.add('DeploymentEnvironment');
  const hit = LAYER_ORDER.find((l) => normalized.has(l));
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
    nodeDisplayName(a.node).localeCompare(nodeDisplayName(b.node), undefined, { sensitivity: 'base' })
  );
}

/**
 * Минимальное число колонок, чтобы не сваливаться в один столбец при n > 2.
 * Для 2 узлов — одна строка (2 колонки).
 */
function minColsForLayerCount(n: number): number {
  if (n <= 1) return 1;
  if (n === 2) return 2;
  return Math.min(n, Math.max(2, Math.ceil(Math.sqrt(n))));
}

/** Подбор числа колонок под целевой аспект ширина/высота блока ≈ 4/3. */
function chooseBestColsForLayer(
  n: number,
  maxW: number,
  maxH: number,
  minGap: number
): number {
  const targetAspect = 4 / 3;
  const minCols = minColsForLayerCount(n);
  let bestCols = minCols;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let cols = minCols; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const approxW = cols * maxW + Math.max(0, cols - 1) * minGap;
    const approxH = rows * maxH + Math.max(0, rows - 1) * minGap;
    const ratio = approxW / Math.max(approxH, 1);
    const score = Math.abs(ratio - targetAspect);
    if (score < bestScore) {
      bestScore = score;
      bestCols = cols;
    }
  }
  return bestCols;
}

/** Высота контента слоя (многострочная сетка) — та же логика колонок, что и в placeTierWithoutOverlap. */
function computeTierContentHeight(tierNodes: SimNode[]): number {
  if (tierNodes.length === 0) return 0;
  const minGap = GRID_CELL;
  const sorted = [...tierNodes].sort((a, b) =>
    nodeDisplayName(a.node).localeCompare(nodeDisplayName(b.node), undefined, { sensitivity: 'base' })
  );
  const maxW = sorted.reduce((m, n) => Math.max(m, n.width), NODE_W);
  const maxH = sorted.reduce((m, n) => Math.max(m, n.height), NODE_H);
  const bestCols = chooseBestColsForLayer(sorted.length, maxW, maxH, minGap);
  const rows = Math.ceil(sorted.length / bestCols);
  const rowPitch = maxH + minGap;
  return rows > 0 ? (rows - 1) * rowPitch + maxH : 0;
}

function placeTierWithoutOverlap(tierNodes: SimNode[], centerX: number, baseY: number): void {
  if (tierNodes.length === 0) return;
  const sorted = [...tierNodes].sort((a, b) =>
    nodeDisplayName(a.node).localeCompare(nodeDisplayName(b.node), undefined, { sensitivity: 'base' })
  );
  const minGap = GRID_CELL;
  const maxW = sorted.reduce((m, n) => Math.max(m, n.width), NODE_W);
  const maxH = sorted.reduce((m, n) => Math.max(m, n.height), NODE_H);

  const bestCols = chooseBestColsForLayer(sorted.length, maxW, maxH, minGap);
  const rows = Math.ceil(sorted.length / bestCols);
  const rowPitch = maxH + minGap;
  for (let r = 0; r < rows; r++) {
    const rowNodes = sorted.slice(r * bestCols, (r + 1) * bestCols);
    const rowW =
      rowNodes.reduce((sum, n) => sum + n.width, 0) + minGap * Math.max(rowNodes.length - 1, 0);
    let x = centerX - rowW / 2;
    const yTop = baseY + r * rowPitch;
    rowNodes.forEach((n) => {
      // Центр карточки — d3-force (collide, forceX) считает x,y центром узла.
      n.x = x + n.width / 2;
      n.y = yTop + n.height / 2;
      x += n.width + minGap;
    });
  }
}

/** Горизонтальный зазор между карточками в строке; x,y — центры прямоугольников. */
function compactTierWithGapCenters(tierNodes: SimNode[], centerX: number): void {
  if (tierNodes.length <= 1) return;
  const minGap = GRID_CELL;
  const sorted = [...tierNodes].sort(
    (a, b) => (a.x ?? centerX) - a.width / 2 - ((b.x ?? centerX) - b.width / 2)
  );
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    const prevLeft = (prev.x ?? centerX) - prev.width / 2;
    const minLeft = prevLeft + prev.width + minGap;
    const curLeft = (cur.x ?? centerX) - cur.width / 2;
    if (curLeft < minLeft) cur.x = minLeft + cur.width / 2;
  }
}

function relaxTierWithForce(tierNodes: SimNode[], centerX: number, yFixed: number): void {
  if (tierNodes.length === 0) return;
  const minGap = GRID_CELL;
  const byRow = new Map<number, SimNode[]>();
  const rowPitch =
    tierNodes.reduce((m, n) => Math.max(m, n.height), NODE_H) + minGap;
  tierNodes.forEach((n) => {
    const top = (n.y ?? yFixed) - n.height / 2;
    const row = Math.max(0, Math.floor((top - yFixed) / Math.max(rowPitch, 1)));
    const arr = byRow.get(row);
    if (arr) arr.push(n);
    else byRow.set(row, [n]);
  });

  const rows = [...byRow.keys()].sort((a, b) => a - b);
  rows.forEach((row) => {
    const rowNodes = byRow.get(row)!;
    const rowTop = yFixed + row * rowPitch;
    const pinY = (n: SimNode) => rowTop + n.height / 2;
    rowNodes.forEach((n) => {
      const py = pinY(n);
      n.y = py;
      n.fy = py;
    });
    if (rowNodes.length <= 1) return;
    const sim = forceSimulation<SimNode>(rowNodes)
      .force('charge', forceManyBody<SimNode>().strength(-230))
      .force(
        'collide',
        forceCollide<SimNode>()
          .radius((d) => collideRadiusForNode(d))
          .strength(1)
      )
      .force('x', forceX<SimNode>(centerX).strength(0.14))
      .stop();
    for (let i = 0; i < 52; i++) {
      sim.tick();
      rowNodes.forEach((n) => {
        const py = pinY(n);
        n.y = py;
        n.vy = 0;
      });
    }
    compactTierWithGapCenters(rowNodes, centerX);
  });
}

/**
 * Разведение карточек в строках слоя по горизонтали (collide + charge), не меняя Y —
 * вызывать после финального позиционирования (в т.ч. подъёма выделенного), чтобы остались зазоры.
 */
function relaxTierHorizontalPreserveY(
  tierNodes: SimNode[],
  centerX: number,
  baseY: number,
  pinnedNodeId?: string | null
): void {
  if (tierNodes.length === 0) return;
  const minGap = GRID_CELL;
  const rowPitch =
    tierNodes.reduce((m, n) => Math.max(m, n.height), NODE_H) + minGap;
  const byRow = new Map<number, SimNode[]>();
  tierNodes.forEach((n) => {
    const top = (n.y ?? baseY) - n.height / 2;
    const row = Math.max(0, Math.floor((top - baseY) / Math.max(rowPitch, 1)));
    const arr = byRow.get(row);
    if (arr) arr.push(n);
    else byRow.set(row, [n]);
  });

  const rows = [...byRow.keys()].sort((a, b) => a - b);
  rows.forEach((row) => {
    const rowNodes = byRow.get(row)!;
    if (rowNodes.length <= 1) return;
    const ySnap = new Map(rowNodes.map((n) => [n.id, n.y ?? baseY]));
    const pin =
      pinnedNodeId && rowNodes.some((n) => n.id === pinnedNodeId)
        ? (() => {
            const p = rowNodes.find((n) => n.id === pinnedNodeId)!;
            return { x: p.x ?? centerX, y: p.y ?? baseY };
          })()
        : null;
    const sim = forceSimulation<SimNode>(rowNodes)
      .force('charge', forceManyBody<SimNode>().strength(-340))
      .force(
        'collide',
        forceCollide<SimNode>()
          .radius((d) => collideRadiusForNode(d))
          .strength(1)
      )
      .force('x', forceX<SimNode>(centerX).strength(0.17))
      .stop();
    for (let i = 0; i < 56; i++) {
      sim.tick();
      rowNodes.forEach((n) => {
        n.y = ySnap.get(n.id)!;
        n.vy = 0;
        if (pin && n.id === pinnedNodeId) {
          n.x = pin.x;
          n.vx = 0;
        }
      });
    }
    compactTierWithGapCenters(rowNodes, centerX);
    if (pin && pinnedNodeId) {
      const p = rowNodes.find((n) => n.id === pinnedNodeId)!;
      p.x = pin.x;
      p.y = pin.y;
    }
  });
}

/** x,y — центр; границы AABB для разрешения пересечений. */
function rectEdgesFromCenter(n: SimNode): { l: number; t: number; r: number; b: number } {
  const x = n.x ?? 0;
  const y = n.y ?? 0;
  const hw = n.width / 2;
  const hh = n.height / 2;
  return { l: x - hw, t: y - hh, r: x + hw, b: y + hh };
}

/**
 * d3-forceCollide не гарантирует отсутствие пересечений осевых прямоугольников.
 * Разводим по горизонтали внутри слоя (центры).
 */
function resolveTierHorizontalAABBCollisions(
  tierNodes: SimNode[],
  gap: number,
  pinnedId?: string | null
): void {
  for (let iter = 0; iter < 48; iter++) {
    let moved = false;
    for (let i = 0; i < tierNodes.length; i++) {
      for (let j = i + 1; j < tierNodes.length; j++) {
        const a = tierNodes[i]!;
        const b = tierNodes[j]!;
        const A = rectEdgesFromCenter(a);
        const B = rectEdgesFromCenter(b);
        const overlapX = Math.min(A.r, B.r) - Math.max(A.l, B.l);
        const overlapY = Math.min(A.b, B.b) - Math.max(A.t, B.t);
        if (overlapX <= 0 || overlapY <= 0) continue;
        const g = gap + pairGapExtra(a, b);
        const total = overlapX + g;
        moved = true;
        if (pinnedId === a.id) {
          b.x = (b.x ?? 0) + (a.x! < b.x! ? total : -total);
        } else if (pinnedId === b.id) {
          a.x = (a.x ?? 0) + (a.x! < b.x! ? -total : total);
        } else {
          const half = total / 2;
          if (a.x! < b.x!) {
            a.x = a.x! - half;
            b.x = b.x! + half;
          } else {
            a.x = a.x! + half;
            b.x = b.x! - half;
          }
        }
      }
    }
    if (!moved) break;
  }
}

/** Групповой блок может наезжать на соседний слой по вертикали — раздвигаем по Y. */
function resolveCrossTierOverlap(
  byTier: Map<number, SimNode[]>,
  maxTier: number,
  gap: number,
  pinnedId?: string | null
): void {
  for (let iter = 0; iter < 20; iter++) {
    let moved = false;
    for (let t = 0; t < maxTier; t++) {
      const upper = byTier.get(t) ?? [];
      const lower = byTier.get(t + 1) ?? [];
      for (const a of upper) {
        for (const b of lower) {
          const A = rectEdgesFromCenter(a);
          const B = rectEdgesFromCenter(b);
          const overlapX = Math.min(A.r, B.r) - Math.max(A.l, B.l);
          const overlapY = Math.min(A.b, B.b) - Math.max(A.t, B.t);
          if (overlapX <= 0 || overlapY <= 0) continue;
          const g = gap + pairGapExtra(a, b);
          const total = overlapY + g;
          moved = true;
          if (pinnedId === a.id) {
            b.y = (b.y ?? 0) + total;
          } else if (pinnedId === b.id) {
            a.y = (a.y ?? 0) - total;
          } else {
            a.y = (a.y ?? 0) - total / 2;
            b.y = (b.y ?? 0) + total / 2;
          }
        }
      }
    }
    if (!moved) break;
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
      const an = nodeDisplayName(simById.get(a)!.node);
      const bn = nodeDisplayName(simById.get(b)!.node);
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
      nodeDisplayName(a.node).localeCompare(nodeDisplayName(b.node), undefined, { sensitivity: 'base' })
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

/** Обычная раскладка: слои + независимый force внутри каждого слоя. */
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

  const padY = 8;
  const INTER_TIER_GAP = GRID_CELL;

  const spread = Math.min(width * 0.84, 560);

  const simNodes: SimNode[] = nodes.map((node, i) => {
    const { width: nodeW, height: nodeH } = nodeSizeFromProperties(node);
    return {
      id: node.id,
      node,
      width: nodeW,
      height: nodeH,
      x: cx + spread * Math.cos((i / Math.max(nodes.length, 1)) * Math.PI * 2) * 0.8,
      y: 0,
      fy: 0,
    };
  });

  const byTier = new Map<number, SimNode[]>();
  for (const n of simNodes) {
    const tier = tierFromLabels(n.node.labels);
    const arr = byTier.get(tier);
    if (arr) arr.push(n);
    else byTier.set(tier, [n]);
  }

  /** Верхние Y слоёв и полная высота полосы по фактическому контенту (многострочные слои). */
  const tierTops: number[] = [];
  const tierHeights: number[] = [];
  let yCursor = 40;
  for (let t = 0; t <= maxTier; t++) {
    tierTops[t] = yCursor;
    const tierNodes = byTier.get(t) ?? [];
    const contentH = computeTierContentHeight(tierNodes);
    const band = contentH + padY * 2;
    tierHeights[t] = band;
    yCursor += band + INTER_TIER_GAP;
  }

  for (const [tier, tierNodes] of byTier) {
    const baseY = (tierTops[tier] ?? 40) + padY;
    placeTierWithoutOverlap(tierNodes, cx, baseY);
    relaxTierWithForce(tierNodes, cx, baseY);
  }

  if (centralTier !== null && selectedNodeId) {
    const sel = simNodes.find((s) => s.id === selectedNodeId);
    if (sel && tierFromLabels(sel.node.labels) === centralTier) {
      const tier = centralTier;
      const bottomPrev =
        tier === 0 ? 8 : tierTops[tier - 1]! + tierHeights[tier - 1]! + INTER_TIER_GAP;
      const baseY = (tierTops[tier] ?? 40) + padY;
      const inTier = simNodes.filter((s) => tierFromLabels(s.node.labels) === centralTier);
      const others = inTier.filter((s) => s.id !== selectedNodeId);
      if (others.length > 0) {
        const minOthersTop = Math.min(...others.map((n) => (n.y ?? 0) - n.height / 2));
        const maxCenterY = minOthersTop - sel.height / 2 - GRID_CELL;
        const curY = sel.y ?? baseY + sel.height / 2;
        sel.y = Math.max(bottomPrev + sel.height / 2, Math.min(curY, maxCenterY));
      } else {
        sel.y = Math.max(bottomPrev + sel.height / 2, baseY + sel.height / 2);
      }
      sel.fy = sel.y;

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

  for (const [tier, tierNodes] of byTier) {
    const baseY = (tierTops[tier] ?? 40) + padY;
    relaxTierHorizontalPreserveY(
      tierNodes,
      cx,
      baseY,
      centralTier !== null && tier === centralTier ? selectedNodeId : undefined
    );
  }

  const gapResolve = GRID_CELL;
  for (let pass = 0; pass < 4; pass++) {
    for (const [tier, tierNodes] of byTier) {
      resolveTierHorizontalAABBCollisions(
        tierNodes,
        gapResolve,
        centralTier !== null && tier === centralTier ? selectedNodeId : undefined
      );
    }
    resolveCrossTierOverlap(byTier, maxTier, gapResolve, selectedNodeId ?? undefined);
  }

  // Отрисовка (simToLayout) ждёт левый верхний угол; симуляция — центр карточки.
  for (const n of simNodes) {
    n.x = (n.x ?? 0) - n.width / 2;
    n.y = (n.y ?? 0) - n.height / 2;
    if (n.fx != null) n.fx -= n.width / 2;
    if (n.fy != null) n.fy -= n.height / 2;
  }

  const simulation = forceSimulation<SimNode, GraphLink>(simNodes)
    .alpha(0)
    .alphaMin(0.001)
    .stop();

  return { simulation, simNodes };
}

export { NODE_W, NODE_H };
