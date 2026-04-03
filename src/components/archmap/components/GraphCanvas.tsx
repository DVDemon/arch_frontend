import {
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import type { Simulation } from 'd3-force';
import {
  graphEdgeLabel,
  isStructuralEdgeRelationship,
  nodeDisplayName,
  type C4Node,
  type GraphEdge,
} from '../types/c4';
import { C4_COLORS } from '../types/c4';
import { createForceSimulation, type GraphLink, type SimNode } from '../lib/forceGraphLayout';
import {
  arrowAngleFromPolyline,
  GRID_CELL,
  labelPointAlongPolyline,
  routeEdgeWithAStar,
  snapSizeToGrid,
  type LayoutBox,
  type Point,
} from '../lib/astarGridRouter';
import { buildDiagramSvgString, type ClusterExportForSvg } from '../lib/graphExportSvg';
import { buildPlantUmlComponentDiagram } from '../lib/graphExportPlantUml';
import { computeDiagramBounds } from '../lib/graphDiagramBounds';
import { getDiagramPalette, type DiagramPalette } from '../lib/diagramTheme';
import { useTheme } from '@/components/ThemeProvider';
import type { DiagramLayoutPersist } from '../types/diagramLayout';
import { clusterMemberOffsetKey } from '../types/diagramLayout';

interface GraphCanvasProps {
  nodes: C4Node[];
  edges: GraphEdge[];
  /** Центр окрестности (корень диаграммы) — подписи связей смещаются к другому концу ребра. */
  focusNodeId?: string | null;
  selectedNodeId: string | null;
  /** Число локальных тегов по id узла (инциденты / точки отказа). */
  tagCountByNodeId?: ReadonlyMap<string, number>;
  /** Прикреплённые к диаграмме узлы (для отображения переключателя «вкл»). */
  pinnedNodeIds?: ReadonlySet<string>;
  /** Переключатель прикрепления в углу карточки; если не задан — не рисуется. */
  onPinToggle?: (node: C4Node, pinned: boolean) => void;
  onNodeClick: (node: C4Node) => void;
  /** Просмотр: клик ведёт навигацию (родитель). Редактирование: только выбор, без смены подграфа. */
  interactionMode?: 'view' | 'edit';
  /** Сохранённая раскладка для текущего контекста диаграммы. */
  initialLayout?: DiagramLayoutPersist | null;
  /** Вызывается после перетаскивания узла или мини-карточки в группе. */
  onLayoutPersist?: (layout: DiagramLayoutPersist) => void;
  emptyHint?: string;
  loading?: boolean;
}

export interface GraphCanvasHandle {
  exportPng: () => void;
  exportSvg: () => void;
  /** Узлы с координатами, рёбра, маршруты линий и подписи — для скриптов и внешних инструментов. */
  exportJson: () => void;
  /** PlantUML component diagram (.puml). */
  exportPlantUml: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitToScreen: () => void;
}

interface LayoutNode {
  node: C4Node;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ClusterMeta {
  id: string;
  members: C4Node[];
  memberType: string;
  edgeLabel: string;
}

const KNOWN = [
  'SoftwareSystem',
  'Container',
  'Component',
  'DeploymentNode',
  'Environment',
  'ContainerInstance',
  'InfrastructureNode',
];

function getMainLabel(labels: string[]): string {
  return labels.find((l) => KNOWN.includes(l)) || labels[0] || 'unknown';
}

function getLabelDisplay(label: string): string {
  const map: Record<string, string> = {
    SoftwareSystem: 'SYSTEM',
    Container: 'CONTAINER',
    Component: 'COMPONENT',
    DeploymentNode: 'DEPLOY_NODE',
    Environment: 'ENV',
    ContainerInstance: 'INSTANCE',
    InfrastructureNode: 'INFRA',
  };
  return map[label] || label.toUpperCase();
}

const EDGE_LABEL_FONT = '11px "JetBrains Mono", monospace';
const EDGE_LABEL_LINE = 12;
const EDGE_LABEL_PAD = 4;

/** К какому концу ребра сместить подпись: к соседу, не совпадающему с фокусом диаграммы. */
function labelBiasEnd(
  focusId: string | null | undefined,
  sourceId: string,
  targetId: string
): 'source' | 'target' | null {
  if (!focusId) return null;
  if (focusId === sourceId && targetId !== sourceId) return 'target';
  if (focusId === targetId && sourceId !== targetId) return 'source';
  return null;
}

function edgeStartsHorizontal(src: LayoutNode, tgt: LayoutNode): boolean {
  return src.node.labels.length === 1 || tgt.node.labels.length === 1;
}

const EDGE_HALO_WIDTH = 4;
const EDGE_STROKE_WIDTH = 1.35;
/** Пунктир для Child / Deploy (короткий штрих + зазор ≈ «точки» при round cap). */
const EDGE_DOT_DASH: number[] = [2, 6];

function tracePolylinePath(ctx: CanvasRenderingContext2D, points: Point[]): void {
  if (points.length === 0) return;
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i]!.x, points[i]!.y);
  }
}

function simplifyPolylinePoints(points: Point[], stride: number): Point[] {
  if (stride <= 1 || points.length <= 3) return points;
  const out: Point[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    if (i % stride === 0) out.push(points[i]!);
  }
  out.push(points[points.length - 1]!);
  return out;
}

function traceSplinePath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  options?: { lowQuality?: boolean }
): void {
  if (points.length === 0) return;
  if (points.length < 3) {
    tracePolylinePath(ctx, points);
    return;
  }
  const work = options?.lowQuality ? simplifyPolylinePoints(points, 2) : points;
  ctx.moveTo(work[0]!.x, work[0]!.y);
  for (let i = 1; i < work.length - 1; i++) {
    const p = work[i]!;
    const n = work[i + 1]!;
    const mx = (p.x + n.x) / 2;
    const my = (p.y + n.y) / 2;
    ctx.quadraticCurveTo(p.x, p.y, mx, my);
  }
  const penultimate = work[work.length - 2]!;
  const last = work[work.length - 1]!;
  ctx.quadraticCurveTo(penultimate.x, penultimate.y, last.x, last.y);
}

function strokeSplineOverNodes(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  options?: { lowQuality?: boolean; dotted?: boolean; palette: DiagramPalette }
): void {
  if (points.length < 2) return;
  const pal = options?.palette;
  if (!pal) return;
  const dash = options?.dotted ? EDGE_DOT_DASH : [];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  traceSplinePath(ctx, points, options);
  ctx.strokeStyle = pal.edgeHalo;
  ctx.lineWidth = EDGE_HALO_WIDTH;
  ctx.stroke();
  ctx.beginPath();
  traceSplinePath(ctx, points, options);
  ctx.strokeStyle = pal.edgeStroke;
  ctx.lineWidth = EDGE_STROKE_WIDTH;
  ctx.stroke();
  ctx.setLineDash([]);
}

interface EdgeLabelGeom {
  text: string;
  x: number;
  y: number;
  align: CanvasTextAlign;
}

interface GeometryCache {
  layoutVersion: number;
  focusId: string | null;
  edgePolylines: Point[][];
  /** true = пунктир (Child / Deploy) — индекс совпадает с edgePolylines */
  edgeDotted: boolean[];
  placedLabels: EdgeLabelGeom[];
}

// Оптимизация отрисовки диаграммы по скорости.
// <50: лучшее качество; 50..100: средняя оптимизация; >100: максимальная оптимизация.
const SPEED_OPT_MEDIUM_NODE_THRESHOLD = 50;
const SPEED_OPT_STRONG_NODE_THRESHOLD = 100;
const PROGRESSIVE_EDGE_CHUNK_SIZE = 5;
const PROGRESSIVE_EDGE_BUDGET_MS = 8;
const HEAVY_MODE_MAX_TICKS = 55;
const CLUSTER_MIN_SIZE = 5;
const CLUSTER_MEMBER_W = 120;
const CLUSTER_MEMBER_H = 48;
const CLUSTER_HEADER_H = 24;
/** Один шаг сетки от границы группы до внутренних мини-карточек (со всех сторон). */
const CLUSTER_BOX_PADDING = GRID_CELL;
const LOW_QUALITY_SPLINE_EDGE_THRESHOLD = 100;

/** Мини-переключатель «прикрепить» в правом нижнем углу карточки (мир. координаты), чтобы не пересекать текст слева. */
const PIN_TOGGLE_W = 30;
const PIN_TOGGLE_H = 14;
const PIN_TOGGLE_PAD_X = 8;
const PIN_TOGGLE_PAD_BOTTOM = 6;

function pinToggleRect(ln: LayoutNode): { x: number; y: number; w: number; h: number } {
  return {
    x: ln.x + ln.width - PIN_TOGGLE_W - PIN_TOGGLE_PAD_X,
    y: ln.y + ln.height - PIN_TOGGLE_PAD_BOTTOM - PIN_TOGGLE_H,
    w: PIN_TOGGLE_W,
    h: PIN_TOGGLE_H,
  };
}

function hitTestPinToggle(ln: LayoutNode, x: number, y: number): boolean {
  const r = pinToggleRect(ln);
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function drawPinToggle(
  ctx: CanvasRenderingContext2D,
  ln: LayoutNode,
  isPinned: boolean,
  palette: DiagramPalette
): void {
  const r = pinToggleRect(ln);
  const rr = PIN_TOGGLE_H / 2;
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, r.x, r.y, r.w, r.h, rr);
  ctx.fillStyle = isPinned ? 'rgba(245, 158, 11, 0.35)' : palette.cardBorder;
  ctx.fill();
  ctx.strokeStyle = palette.clusterOuterBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
  const pad = 2;
  const thumbR = (PIN_TOGGLE_H - pad * 2) / 2;
  const cx = isPinned ? r.x + r.w - pad - thumbR : r.x + pad + thumbR;
  const cy = r.y + PIN_TOGGLE_H / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, thumbR, 0, Math.PI * 2);
  ctx.fillStyle = isPinned ? '#d97706' : palette.clusterInnerFill;
  ctx.fill();
  ctx.strokeStyle = palette.clusterInnerBorder;
  ctx.stroke();
  ctx.restore();
}

function nodeMainLabel(node: C4Node): string {
  return getMainLabel(node.labels);
}

function isClusterNode(node: C4Node): boolean {
  return (node.properties as Record<string, unknown>).__cluster === true;
}

function dedupeEdges(edges: GraphEdge[]): GraphEdge[] {
  const out: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    const key = `${e.source}|${e.target}|${e.type}|${e.technology ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function clusterDimensions(memberCount: number): { width: number; height: number } {
  const pad = CLUSTER_BOX_PADDING;
  const cols = Math.ceil(Math.sqrt(memberCount));
  const rows = Math.ceil(memberCount / cols);
  const innerW =
    cols * CLUSTER_MEMBER_W + Math.max(0, cols - 1) * GRID_CELL;
  const innerH =
    rows * CLUSTER_MEMBER_H + Math.max(0, rows - 1) * GRID_CELL;
  const width = pad * 2 + innerW;
  const height = pad * 2 + CLUSTER_HEADER_H + innerH;
  return { width: snapSizeToGrid(width), height: snapSizeToGrid(height) };
}

function collapseDenseSimilarNodes(
  nodes: C4Node[],
  edges: GraphEdge[],
  selectedNodeId: string | null,
  /** Прикреплённые узлы никогда не схлопываются в группы. */
  pinnedNodeIds?: ReadonlySet<string> | null
): {
  nodes: C4Node[];
  edges: GraphEdge[];
  clusters: Map<string, ClusterMeta>;
  selectedVisibleId: string | null;
} {
  if (!selectedNodeId) {
    return { nodes, edges, clusters: new Map(), selectedVisibleId: null };
  }
  // Кластеры строим только для "осмысленных" типов узлов.
  // В UI "Instance" соответствует `ContainerInstance`.
  const eligibleTypes = new Set([
    'Container',
    'SoftwareSystem',
    'Component',
    'ContainerInstance',
    'DeploymentNode',
  ]);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const candidates = new Map<
    string,
    { ids: Set<string>; memberType: string; edgeLabel: string }
  >();

  edges.forEach((edge) => {
    const rawLabel = graphEdgeLabel(edge).trim();
    const label = rawLabel.length > 0 ? rawLabel : '(no-label)';
    const src = byId.get(edge.source);
    const tgt = byId.get(edge.target);
    if (!src || !tgt) return;
    const addCandidate = (member: C4Node) => {
      if (member.id === selectedNodeId) return;
      if (pinnedNodeIds?.has(member.id)) return;
      const memberType = nodeMainLabel(member);
      if (!eligibleTypes.has(memberType)) return;
      // Группируем по фактически отрисовываемой подписи связи + типу узла.
      // Не завязываемся на конкретного соседа/направление, иначе похожие узлы не схлопываются.
      const key = `${memberType}|${label}`;
      let bucket = candidates.get(key);
      if (!bucket) {
        bucket = { ids: new Set<string>(), memberType, edgeLabel: label };
        candidates.set(key, bucket);
      }
      bucket.ids.add(member.id);
    };
    addCandidate(src);
    addCandidate(tgt);
  });

  const sortedGroups = [...candidates.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .filter((x) => x.ids.size >= CLUSTER_MIN_SIZE)
    .sort((a, b) => b.ids.size - a.ids.size);

  if (sortedGroups.length === 0) {
    return { nodes, edges, clusters: new Map(), selectedVisibleId: selectedNodeId };
  }

  const memberToCluster = new Map<string, string>();
  const clusterNodes = new Map<string, C4Node>();
  const clusters = new Map<string, ClusterMeta>();
  const used = new Set<string>();

  sortedGroups.forEach((g, idx) => {
    const members = [...g.ids]
      .filter((id) => !used.has(id) && id !== selectedNodeId)
      .map((id) => byId.get(id))
      .filter((n): n is C4Node => Boolean(n));
    if (members.length < CLUSTER_MIN_SIZE) return;
    members.forEach((m) => used.add(m.id));
    const clusterId = `cluster:${g.memberType}:${idx}:${g.edgeLabel}`;
    const dim = clusterDimensions(members.length);
    const clusterNode: C4Node = {
      id: clusterId,
      labels: [g.memberType, 'ClusterGroup'],
      name: `${g.memberType} x${members.length}`,
      technology: g.edgeLabel === '(no-label)' ? undefined : g.edgeLabel,
      properties: {
        __cluster: true,
        __clusterType: g.memberType,
        __clusterSize: members.length,
        __clusterEdgeLabel: g.edgeLabel === '(no-label)' ? '' : g.edgeLabel,
        __clusterMemberNames: members.map((m) => nodeDisplayName(m)).join(', '),
        __clusterWidth: dim.width,
        __clusterHeight: dim.height,
      },
    };
    clusters.set(clusterId, {
      id: clusterId,
      members,
      memberType: g.memberType,
      edgeLabel: g.edgeLabel,
    });
    clusterNodes.set(clusterId, clusterNode);
    members.forEach((m) => memberToCluster.set(m.id, clusterId));
  });

  if (memberToCluster.size === 0) {
    return { nodes, edges, clusters: new Map(), selectedVisibleId: selectedNodeId };
  }

  const outNodes: C4Node[] = [];
  const added = new Set<string>();
  nodes.forEach((n) => {
    const clusterId = memberToCluster.get(n.id);
    if (!clusterId) {
      outNodes.push(n);
      return;
    }
    if (!added.has(clusterId)) {
      const node = clusterNodes.get(clusterId);
      if (node) outNodes.push(node);
      added.add(clusterId);
    }
  });

  const outEdges = dedupeEdges(
    edges
      .map((e) => ({
        ...e,
        source: memberToCluster.get(e.source) ?? e.source,
        target: memberToCluster.get(e.target) ?? e.target,
      }))
      .filter((e) => e.source !== e.target)
  );

  return {
    nodes: outNodes,
    edges: outEdges,
    clusters,
    selectedVisibleId: memberToCluster.get(selectedNodeId) ?? selectedNodeId,
  };
}

function clusterMemberSlotRect(
  ln: LayoutNode,
  memberIdx: number,
  memberCount: number
): { mx: number; my: number } {
  const cols = Math.ceil(Math.sqrt(memberCount));
  const col = memberIdx % cols;
  const row = Math.floor(memberIdx / cols);
  const innerStartX = ln.x + CLUSTER_BOX_PADDING;
  const innerStartY = ln.y + CLUSTER_BOX_PADDING + CLUSTER_HEADER_H;
  return {
    mx: innerStartX + col * (CLUSTER_MEMBER_W + GRID_CELL),
    my: innerStartY + row * (CLUSTER_MEMBER_H + GRID_CELL),
  };
}

function hitTestClusterMember(
  ln: LayoutNode,
  clusterMeta: ClusterMeta,
  x: number,
  y: number,
  memberOffsetsRecord?: Record<string, { dx: number; dy: number }> | null
): C4Node | null {
  const clusterId = ln.node.id;
  for (let idx = clusterMeta.members.length - 1; idx >= 0; idx--) {
    const member = clusterMeta.members[idx]!;
    const key = clusterMemberOffsetKey(clusterId, member.id);
    const off = memberOffsetsRecord?.[key] ?? { dx: 0, dy: 0 };
    const slot = clusterMemberSlotRect(ln, idx, clusterMeta.members.length);
    const mx = slot.mx + off.dx;
    const my = slot.my + off.dy;
    if (x >= mx && x <= mx + CLUSTER_MEMBER_W && y >= my && y <= my + CLUSTER_MEMBER_H) {
      return member;
    }
  }
  return null;
}

function clampMemberOffset(
  ln: LayoutNode,
  clusterMeta: ClusterMeta,
  memberIdx: number,
  dx: number,
  dy: number
): { dx: number; dy: number } {
  const slot = clusterMemberSlotRect(ln, memberIdx, clusterMeta.members.length);
  const innerLeft = ln.x + CLUSTER_BOX_PADDING;
  const innerTop = ln.y + CLUSTER_BOX_PADDING + CLUSTER_HEADER_H;
  const innerRight = ln.x + ln.width - CLUSTER_BOX_PADDING - CLUSTER_MEMBER_W;
  const innerBottom = ln.y + ln.height - CLUSTER_BOX_PADDING - CLUSTER_MEMBER_H;
  let mx = slot.mx + dx;
  let my = slot.my + dy;
  mx = Math.max(innerLeft, Math.min(mx, innerRight));
  my = Math.max(innerTop, Math.min(my, innerBottom));
  return { dx: mx - slot.mx, dy: my - slot.my };
}

type EditHit =
  | { kind: 'member'; clusterId: string; member: C4Node; memberIdx: number }
  | { kind: 'node'; nodeId: string };

function hitTestEditDrag(
  layout: LayoutNode[],
  clusterMetaById: ReadonlyMap<string, ClusterMeta>,
  x: number,
  y: number,
  memberOffsetsRecord: Record<string, { dx: number; dy: number }>
): EditHit | null {
  for (let i = layout.length - 1; i >= 0; i--) {
    const ln = layout[i]!;
    if (x < ln.x || x > ln.x + ln.width || y < ln.y || y > ln.y + ln.height) continue;
    const cm = clusterMetaById.get(ln.node.id);
    if (cm && isClusterNode(ln.node)) {
      const member = hitTestClusterMember(ln, cm, x, y, memberOffsetsRecord);
      if (member) {
        const idx = cm.members.findIndex((m) => m.id === member.id);
        if (idx >= 0) return { kind: 'member', clusterId: ln.node.id, member, memberIdx: idx };
      }
      return { kind: 'node', nodeId: ln.node.id };
    }
    return { kind: 'node', nodeId: ln.node.id };
  }
  return null;
}

function labelBoundingBox(
  ctx: CanvasRenderingContext2D,
  g: EdgeLabelGeom
): { left: number; top: number; right: number; bottom: number } {
  ctx.font = EDGE_LABEL_FONT;
  const w = ctx.measureText(g.text).width;
  const pad = EDGE_LABEL_PAD;
  let left: number;
  if (g.align === 'center') left = g.x - w / 2 - pad;
  else if (g.align === 'right') left = g.x - w - pad;
  else left = g.x - pad;
  const top = g.y - EDGE_LABEL_LINE - pad;
  return {
    left,
    top,
    right: left + w + pad * 2,
    bottom: top + EDGE_LABEL_LINE + pad * 2,
  };
}

function boxesOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
): boolean {
  return !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);
}

/** Push labels apart vertically (greedy) so bounding boxes do not overlap. */
function resolveEdgeLabelOverlaps(
  ctx: CanvasRenderingContext2D,
  labels: EdgeLabelGeom[]
): EdgeLabelGeom[] {
  if (labels.length === 0) return [];
  const sorted = [...labels].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: EdgeLabelGeom[] = [];
  const step = 15;
  const maxShift = 120;

  for (const g of sorted) {
    let cur: EdgeLabelGeom = { ...g };
    let box = labelBoundingBox(ctx, cur);
    let n = 0;
    while (n * step < maxShift) {
      let hit = false;
      for (const p of placed) {
        if (boxesOverlap(box, labelBoundingBox(ctx, p))) {
          hit = true;
          break;
        }
      }
      if (!hit) break;
      cur = { ...cur, y: cur.y + step };
      box = labelBoundingBox(ctx, cur);
      n += 1;
    }
    placed.push(cur);
  }
  return placed;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Бейдж: иконка инцидента + число тегов (правый верх карточки). */
function drawTagBadge(
  ctx: CanvasRenderingContext2D,
  ln: LayoutNode,
  count: number,
  palette: DiagramPalette
): void {
  if (count <= 0) return;
  const pad = 4;
  const badgeH = 18;
  const iconSlot = 12;
  const countStr = String(count);
  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  const tw = ctx.measureText(countStr).width;
  const badgeW = Math.min(iconSlot + 4 + tw + 6, ln.width - pad * 2);
  const rx = ln.x + ln.width - badgeW - pad;
  const ry = ln.y + pad;

  ctx.fillStyle = palette.badgeFill;
  ctx.strokeStyle = palette.badgeStroke;
  ctx.lineWidth = 1;
  roundRectPath(ctx, rx, ry, badgeW, badgeH, 4);
  ctx.fill();
  ctx.stroke();

  const tx = rx + 5;
  const ty = ry + badgeH / 2;
  ctx.beginPath();
  ctx.moveTo(tx, ty - 4);
  ctx.lineTo(tx + 4, ty + 3);
  ctx.lineTo(tx - 4, ty + 3);
  ctx.closePath();
  ctx.fillStyle = palette.badgeIcon;
  ctx.fill();

  ctx.fillStyle = palette.badgeText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  ctx.fillText(countStr, rx + iconSlot + 2, ry + badgeH / 2);
}

function drawEdgeLabelPill(ctx: CanvasRenderingContext2D, g: EdgeLabelGeom, palette: DiagramPalette) {
  ctx.font = EDGE_LABEL_FONT;
  const m = ctx.measureText(g.text);
  const w = m.width;
  const pad = EDGE_LABEL_PAD;
  let rx: number;
  if (g.align === 'center') rx = g.x - w / 2 - pad;
  else if (g.align === 'right') rx = g.x - w - pad;
  else rx = g.x - pad;
  const ry = g.y - EDGE_LABEL_LINE - pad;
  const rw = w + pad * 2;
  const rh = EDGE_LABEL_LINE + pad * 2;

  ctx.fillStyle = palette.edgeLabelBg;
  roundRectPath(ctx, rx, ry, rw, rh, 4);
  ctx.fill();
  ctx.strokeStyle = palette.edgeLabelBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = palette.edgeLabelText;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = g.align;
  ctx.fillText(g.text, g.x, g.y);
}

function buildEdgeGeometry(
  layout: LayoutNode[],
  edges: GraphEdge[],
  focusId: string | null | undefined
): { edgePolylines: Point[][]; edgeDotted: boolean[]; labelCandidates: EdgeLabelGeom[] } {
  const nodeMap = new Map(layout.map((ln) => [ln.node.id, ln]));
  const layoutBoxes: LayoutBox[] = layout.map((ln) => ({
    id: ln.node.id,
    x: ln.x,
    y: ln.y,
    width: ln.width,
    height: ln.height,
  }));
  const edgePolylines: Point[][] = [];
  const edgeDotted: boolean[] = [];
  const labelCandidates: EdgeLabelGeom[] = [];
  const seen = new Set<string>();

  edges.forEach((edge) => {
    const labelText = graphEdgeLabel(edge);
    const pair =
      edge.source < edge.target
        ? `${edge.source}|${edge.target}`
        : `${edge.target}|${edge.source}`;
    const dedupeKey = `${pair}|${labelText}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (!src || !tgt) return;

    const srcBox: LayoutBox = {
      id: src.node.id,
      x: src.x,
      y: src.y,
      width: src.width,
      height: src.height,
    };
    const tgtBox: LayoutBox = {
      id: tgt.node.id,
      x: tgt.x,
      y: tgt.y,
      width: tgt.width,
      height: tgt.height,
    };

    const horizontalFirst = edgeStartsHorizontal(src, tgt);
    const points = routeEdgeWithAStar(srcBox, tgtBox, layoutBoxes, horizontalFirst);
    edgePolylines.push(points);
    edgeDotted.push(isStructuralEdgeRelationship(edge.type));

    if (labelText) {
      const bias = labelBiasEnd(focusId, edge.source, edge.target);
      const anchor = labelPointAlongPolyline(points, bias);
      labelCandidates.push({
        text: labelText,
        x: anchor.x,
        y: anchor.y,
        align: anchor.align,
      });
    }
  });

  return { edgePolylines, edgeDotted, labelCandidates };
}

function rectBoundaryPointToward(from: LayoutNode, toX: number, toY: number): Point {
  const cx = from.x + from.width / 2;
  const cy = from.y + from.height / 2;
  const dx = toX - cx;
  const dy = toY - cy;
  const hw = from.width / 2;
  const hh = from.height / 2;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { x: cx, y: cy };
  const sx = Math.abs(dx) / Math.max(hw, 1e-6);
  const sy = Math.abs(dy) / Math.max(hh, 1e-6);
  const k = 1 / Math.max(sx, sy, 1e-6);
  return { x: cx + dx * k, y: cy + dy * k };
}

function buildEdgeGeometryStraight(
  layout: LayoutNode[],
  edges: GraphEdge[],
  focusId: string | null | undefined
): { edgePolylines: Point[][]; edgeDotted: boolean[]; labelCandidates: EdgeLabelGeom[] } {
  const nodeMap = new Map(layout.map((ln) => [ln.node.id, ln]));
  const edgePolylines: Point[][] = [];
  const edgeDotted: boolean[] = [];
  const labelCandidates: EdgeLabelGeom[] = [];

  edges.forEach((edge) => {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (!src || !tgt) return;
    const srcC = { x: src.x + src.width / 2, y: src.y + src.height / 2 };
    const tgtC = { x: tgt.x + tgt.width / 2, y: tgt.y + tgt.height / 2 };
    const p1 = rectBoundaryPointToward(src, tgtC.x, tgtC.y);
    const p2 = rectBoundaryPointToward(tgt, srcC.x, srcC.y);
    const points = [p1, p2];
    edgePolylines.push(points);
    edgeDotted.push(isStructuralEdgeRelationship(edge.type));

    const labelText = graphEdgeLabel(edge);
    if (labelText) {
      const bias = labelBiasEnd(focusId, edge.source, edge.target);
      const anchor = labelPointAlongPolyline(points, bias);
      labelCandidates.push({
        text: labelText,
        x: anchor.x,
        y: anchor.y,
        align: anchor.align,
      });
    }
  });

  return { edgePolylines, edgeDotted, labelCandidates };
}

/** Внутренние мини-карточки группы — отдельным проходом поверх рёбер, иначе линии перекрывают ячейки. */
function paintClusterInnerMiniCards(
  ctx: CanvasRenderingContext2D,
  layout: LayoutNode[],
  clusterMetaById: ReadonlyMap<string, ClusterMeta>,
  palette: DiagramPalette,
  memberOffsetsRecord?: Record<string, { dx: number; dy: number }> | null
): void {
  layout.forEach((ln) => {
    const clusterMeta = clusterMetaById.get(ln.node.id);
    if (!clusterMeta || !isClusterNode(ln.node)) return;
    const mainLabel = getMainLabel(ln.node.labels);
    const color = C4_COLORS[mainLabel] || '#777';
    const clusterId = ln.node.id;
    ctx.save();
    clusterMeta.members.forEach((member, idx) => {
      const slot = clusterMemberSlotRect(ln, idx, clusterMeta.members.length);
      const key = clusterMemberOffsetKey(clusterId, member.id);
      const off = memberOffsetsRecord?.[key] ?? { dx: 0, dy: 0 };
      const mx = slot.mx + off.dx;
      const my = slot.my + off.dy;
      ctx.fillStyle = palette.clusterInnerFill;
      ctx.strokeStyle = palette.clusterInnerBorder;
      ctx.lineWidth = 1;
      ctx.fillRect(mx, my, CLUSTER_MEMBER_W, CLUSTER_MEMBER_H);
      ctx.strokeRect(mx, my, CLUSTER_MEMBER_W, CLUSTER_MEMBER_H);
      ctx.fillStyle = color;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      const dn = nodeDisplayName(member);
      const shortName = dn.length > 14 ? `${dn.slice(0, 12)}...` : dn;
      ctx.fillText(shortName, mx + 8, my + 22);
    });
    ctx.restore();
  });
}

function paintDiagramNodes(
  ctx: CanvasRenderingContext2D,
  layout: LayoutNode[],
  sel: string | null,
  tagCountByNodeId: ReadonlyMap<string, number>,
  clusterMetaById: ReadonlyMap<string, ClusterMeta>,
  palette: DiagramPalette,
  pinnedNodeIds?: ReadonlySet<string>
): void {
  layout.forEach((ln) => {
    const mainLabel = getMainLabel(ln.node.labels);
    const color = C4_COLORS[mainLabel] || '#777';
    const isSelected = ln.node.id === sel;
    const tagCount = tagCountByNodeId.get(ln.node.id) ?? 0;
    const clusterMeta = clusterMetaById.get(ln.node.id);

    if (clusterMeta && isClusterNode(ln.node)) {
      ctx.save();
      ctx.fillStyle = palette.cardFill;
      ctx.fillRect(ln.x, ln.y, ln.width, ln.height);

      if (isSelected) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = palette.clusterOuterBorder;
        ctx.lineWidth = 1.5;
      }
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(ln.x, ln.y, ln.width, ln.height);
      ctx.setLineDash([]);

      const p = ln.node.properties as Record<string, unknown>;
      const edgeLabel = typeof p.__clusterEdgeLabel === 'string' ? p.__clusterEdgeLabel : '';
      ctx.fillStyle = color;
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`[GROUP ${clusterMeta.memberType.toUpperCase()}]`, ln.x + 10, ln.y + 15);
      ctx.fillStyle = palette.clusterTitleMuted;
      ctx.font = '10px "JetBrains Mono", monospace';
      const title = `${clusterMeta.members.length} nodes${edgeLabel ? ` | ${edgeLabel}` : ''}`;
      ctx.fillText(title, ln.x + 10, ln.y + 28);
      ctx.restore();
      return;
    }

    ctx.fillStyle = palette.cardFill;
    ctx.fillRect(ln.x, ln.y, ln.width, ln.height);

    if (tagCount > 0) {
      ctx.fillStyle = palette.tagStrip;
      ctx.fillRect(ln.x, ln.y, ln.width, 3);
    }

    if (isSelected) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.strokeRect(ln.x - 3, ln.y - 3, ln.width + 6, ln.height + 6);
      ctx.restore();
    }

    ctx.strokeStyle = isSelected ? color : palette.cardBorder;
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeRect(ln.x, ln.y, ln.width, ln.height);

    ctx.fillStyle = color;
    ctx.fillRect(ln.x, ln.y, 4, ln.height);

    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(`[${getLabelDisplay(mainLabel)}]`, ln.x + 12, ln.y + 18);

    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillStyle = palette.textPrimary;
    const display = nodeDisplayName(ln.node);
    const name = display.length > 22 ? display.slice(0, 20) + '...' : display;
    ctx.fillText(name, ln.x + 12, ln.y + 38);

    if (ln.node.technology) {
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = palette.textSecondary;
      const tech =
        ln.node.technology.length > 26
          ? ln.node.technology.slice(0, 24) + '...'
          : ln.node.technology;
      ctx.fillText(tech, ln.x + 12, ln.y + 56);
    }

    drawTagBadge(ctx, ln, tagCount, palette);
    if (pinnedNodeIds !== undefined) {
      const pinned = pinnedNodeIds.has(ln.node.id);
      drawPinToggle(ctx, ln, pinned, palette);
    }
  });
}

function paintDiagramEdges(
  ctx: CanvasRenderingContext2D,
  edgePolylines: Point[][],
  options?: {
    hideHalo?: boolean;
    lowQuality?: boolean;
    edgeDotted?: boolean[];
    palette: DiagramPalette;
  }
): void {
  const palette = options?.palette;
  if (!palette) return;
  const lowQuality =
    options?.lowQuality ?? edgePolylines.length >= LOW_QUALITY_SPLINE_EDGE_THRESHOLD;
  const dottedFlags = options?.edgeDotted;
  edgePolylines.forEach((points, i) => {
    const dotted = dottedFlags?.[i] ?? false;
    if (options?.hideHalo) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash(dotted ? EDGE_DOT_DASH : []);
      ctx.beginPath();
      traceSplinePath(ctx, points, { lowQuality });
      ctx.strokeStyle = palette.edgeStroke;
      ctx.lineWidth = EDGE_STROKE_WIDTH;
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      strokeSplineOverNodes(ctx, points, { lowQuality, dotted, palette });
    }
    if (points.length < 2) return;
    const angle = arrowAngleFromPolyline(points);
    const tx = points[points.length - 1]!.x;
    const ty = points[points.length - 1]!.y;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - 8 * Math.cos(angle - 0.4), ty - 8 * Math.sin(angle - 0.4));
    ctx.lineTo(tx - 8 * Math.cos(angle + 0.4), ty - 8 * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fillStyle = palette.edgeStroke;
    ctx.fill();
  });
}

/** Смещение панорамы: центр узла фокуса в центре видимой области canvas (логические px). */
function computePanToCenterFocus(
  canvas: HTMLCanvasElement,
  layout: LayoutNode[],
  focusId: string | null,
  zoom: number
): { x: number; y: number } | null {
  if (!focusId) return null;
  const ln = layout.find((l) => l.node.id === focusId);
  if (!ln) return null;
  const rect = canvas.getBoundingClientRect();
  const cx = ln.x + ln.width / 2;
  const cy = ln.y + ln.height / 2;
  return {
    x: rect.width / 2 - cx * zoom,
    y: rect.height / 2 - cy * zoom,
  };
}

const EXPORT_PAD = 48;

function computeFullExportData(
  layout: LayoutNode[],
  edges: GraphEdge[],
  focusId: string | null | undefined
): {
  bounds: { width: number; height: number; offsetX: number; offsetY: number };
  edgePolylines: Point[][];
  edgeDotted: boolean[];
  placedLabels: EdgeLabelGeom[];
} | null {
  if (layout.length === 0) return null;
  const { edgePolylines, edgeDotted, labelCandidates } = buildEdgeGeometry(layout, edges, focusId);
  const tmp = document.createElement('canvas');
  const ctx = tmp.getContext('2d');
  if (!ctx) return null;
  const placedLabels = resolveEdgeLabelOverlaps(ctx, labelCandidates);
  const labelHints = placedLabels.map((g) => ({ x: g.x, y: g.y, text: g.text }));
  const bounds = computeDiagramBounds(
    layout.map((ln) => ({ x: ln.x, y: ln.y, width: ln.width, height: ln.height })),
    edgePolylines,
    labelHints,
    EXPORT_PAD
  );
  return { bounds, edgePolylines, edgeDotted, placedLabels };
}

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(function GraphCanvas(
  {
    nodes,
    edges,
    focusNodeId = null,
    selectedNodeId,
    tagCountByNodeId,
    pinnedNodeIds,
    onPinToggle,
    onNodeClick,
    interactionMode = 'view',
    initialLayout = null,
    onLayoutPersist,
    emptyHint,
    loading,
  },
  ref
) {
  const { resolvedTheme } = useTheme();
  const palette = useMemo(
    () => getDiagramPalette(resolvedTheme === 'dark'),
    [resolvedTheme]
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<LayoutNode[]>([]);
  const pinnedNodeIdsRef = useRef(pinnedNodeIds);
  pinnedNodeIdsRef.current = pinnedNodeIds;
  const onPinToggleRef = useRef(onPinToggle);
  onPinToggleRef.current = onPinToggle;
  const interactionModeRef = useRef(interactionMode);
  interactionModeRef.current = interactionMode;
  const initialLayoutRef = useRef(initialLayout);
  initialLayoutRef.current = initialLayout;
  const onLayoutPersistRef = useRef(onLayoutPersist);
  onLayoutPersistRef.current = onLayoutPersist;
  const clusterMemberOffsetsRef = useRef<Record<string, { dx: number; dy: number }>>({});
  const editDragRef = useRef<{
    type: 'node' | 'member';
    nodeId: string;
    clusterId?: string;
    memberId?: string;
    memberIdx?: number;
    startClientX: number;
    startClientY: number;
    lastClientX: number;
    lastClientY: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const collapsedGraph = useMemo(
    () => collapseDenseSimilarNodes(nodes, edges, selectedNodeId, pinnedNodeIds),
    [nodes, edges, selectedNodeId, pinnedNodeIds]
  );
  const visibleNodes = collapsedGraph.nodes;
  const visibleEdges = collapsedGraph.edges;
  const selectedVisibleId = collapsedGraph.selectedVisibleId;
  const clusterMetaRef = useRef<Map<string, ClusterMeta>>(new Map());
  clusterMetaRef.current = collapsedGraph.clusters;
  const edgesRef = useRef(visibleEdges);
  edgesRef.current = visibleEdges;
  const tagCountRef = useRef<ReadonlyMap<string, number>>(tagCountByNodeId ?? new Map());
  tagCountRef.current = tagCountByNodeId ?? new Map();
  const simNodesRef = useRef<SimNode[]>([]);
  const simulationRef = useRef<Simulation<SimNode, GraphLink> | null>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const hasInitialFitRef = useRef(false);
  const prevGraphKeyRef = useRef<string | null>(null);
  const layoutVersionRef = useRef(0);
  const geometryCacheRef = useRef<GeometryCache | null>(null);
  const fastModeRef = useRef(false);
  const heavyModeRef = useRef(false);
  const deferredFullGeometryReadyRef = useRef(false);
  const progressiveTimerRef = useRef<number | null>(null);
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({
    dragging: false,
    lastX: 0,
    lastY: 0,
  });
  const selectedIdRef = useRef<string | null>(selectedVisibleId);
  selectedIdRef.current = selectedVisibleId;
  const focusIdRef = useRef<string | null>(focusNodeId ?? null);
  focusIdRef.current = focusNodeId ?? null;

  const graphKey = useMemo(
    () =>
      JSON.stringify({
        n: visibleNodes.map((n) => n.id).sort(),
        e: visibleEdges.map((e) => `${e.source}|${e.target}|${e.type}|${e.technology ?? ''}`).sort(),
      }),
    [visibleNodes, visibleEdges]
  );

  /** Сериализованная раскладка: при смене initialLayout без смены графа нужно перезапустить симуляцию. */
  const layoutPersistKey = useMemo(
    () => (initialLayout ? JSON.stringify(initialLayout) : ''),
    [initialLayout]
  );

  useEffect(() => {
    clusterMemberOffsetsRef.current = { ...(initialLayout?.clusterMemberOffsets ?? {}) };
  }, [graphKey, initialLayout]);

  const emitLayoutPersist = useCallback(() => {
    const cb = onLayoutPersistRef.current;
    if (!cb) return;
    const positions: Record<string, { x: number; y: number }> = {};
    for (const sn of simNodesRef.current) {
      positions[sn.id] = { x: sn.x ?? 0, y: sn.y ?? 0 };
    }
    cb({
      nodePositions: positions,
      clusterMemberOffsets: { ...clusterMemberOffsetsRef.current },
    });
  }, []);

  const selectedNodeMapRef = useRef(new Map(visibleNodes.map((n) => [n.id, n])));
  selectedNodeMapRef.current = new Map(visibleNodes.map((n) => [n.id, n]));

  const [resizeTick, setResizeTick] = useState(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(() => setResizeTick((t) => t + 1));
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const simToLayout = useCallback((simNodes: SimNode[]): LayoutNode[] => {
    return simNodes.map((s) => ({
      node: s.node,
      x: s.x ?? 0,
      y: s.y ?? 0,
      width: s.width,
      height: s.height,
    }));
  }, []);

  const fitToScreen = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const layout = simToLayout(simNodesRef.current);
    if (layout.length === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    layout.forEach((ln) => {
      minX = Math.min(minX, ln.x);
      minY = Math.min(minY, ln.y);
      maxX = Math.max(maxX, ln.x + ln.width);
      maxY = Math.max(maxY, ln.y + ln.height);
    });
    const worldW = Math.max(1, maxX - minX);
    const worldH = Math.max(1, maxY - minY);
    const rect = canvas.getBoundingClientRect();
    const fitScale = Math.min(
      1.4,
      Math.max(0.45, Math.min((rect.width * 0.9) / worldW, (rect.height * 0.9) / worldH))
    );
    zoomRef.current = fitScale;
    const worldCx = (minX + maxX) / 2;
    const worldCy = (minY + maxY) / 2;
    panRef.current = {
      x: rect.width / 2 - worldCx * fitScale,
      y: rect.height / 2 - worldCy * fitScale,
    };
    drawRef.current();
  }, [simToLayout]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = palette.canvasBg;
    ctx.fillRect(0, 0, rect.width, rect.height);

    const layout = simToLayout(simNodesRef.current);
    layoutRef.current = layout;

    const pan = panRef.current;
    ctx.save();
    ctx.translate(pan.x, pan.y);
    const zoom = zoomRef.current;
    ctx.scale(zoom, zoom);

    const sel = selectedIdRef.current;
    const focusId = focusIdRef.current;
    let edgePolylines: Point[][];
    let edgeDotted: boolean[];
    let placedLabels: EdgeLabelGeom[];
    const cached = geometryCacheRef.current;
    if (
      cached &&
      cached.layoutVersion === layoutVersionRef.current &&
      cached.focusId === focusId
    ) {
      edgePolylines = cached.edgePolylines;
      edgeDotted = cached.edgeDotted;
      placedLabels = cached.placedLabels;
    } else {
      const useFastGeometry = fastModeRef.current && !deferredFullGeometryReadyRef.current;
      const heavyMode = heavyModeRef.current;
      const useStraightEdges = heavyMode || fastModeRef.current;

      const { edgePolylines: ep, edgeDotted: ed, labelCandidates } = useFastGeometry
        ? { edgePolylines: [], edgeDotted: [], labelCandidates: [] }
        : useStraightEdges
          ? buildEdgeGeometryStraight(layout, visibleEdges, focusId)
          : buildEdgeGeometry(layout, visibleEdges, focusId);
      const labelCtx = document.createElement('canvas').getContext('2d');
      placedLabels =
        !useFastGeometry && !heavyMode && labelCtx
          ? resolveEdgeLabelOverlaps(labelCtx, labelCandidates)
          : [];
      edgePolylines = ep;
      edgeDotted = ed;
      geometryCacheRef.current = {
        layoutVersion: layoutVersionRef.current,
        focusId,
        edgePolylines,
        edgeDotted,
        placedLabels,
      };
    }

    paintDiagramNodes(
      ctx,
      layout,
      sel,
      tagCountRef.current,
      clusterMetaRef.current,
      palette,
      pinnedNodeIdsRef.current
    );
    paintDiagramEdges(ctx, edgePolylines, {
      hideHalo: heavyModeRef.current,
      lowQuality: heavyModeRef.current || edgePolylines.length >= LOW_QUALITY_SPLINE_EDGE_THRESHOLD,
      edgeDotted,
      palette,
    });
    if (!heavyModeRef.current) {
      placedLabels.forEach((g) => drawEdgeLabelPill(ctx, g, palette));
    }
    paintClusterInnerMiniCards(ctx, layout, clusterMetaRef.current, palette, clusterMemberOffsetsRef.current);

    ctx.restore();
  }, [visibleEdges, simToLayout, focusNodeId, palette, pinnedNodeIds]);

  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    drawRef.current();
  }, [palette, pinnedNodeIds, interactionMode]);

  useImperativeHandle(
    ref,
    () => ({
      exportPng: () => {
        const layout = simToLayout(simNodesRef.current);
        const data = computeFullExportData(layout, edgesRef.current, focusIdRef.current);
        if (!data) return;
        const { bounds, edgePolylines, edgeDotted, placedLabels } = data;
        if (bounds.width <= 0 || bounds.height <= 0) return;

        const dpr = window.devicePixelRatio || 1;
        const off = document.createElement('canvas');
        off.width = Math.ceil(bounds.width * dpr);
        off.height = Math.ceil(bounds.height * dpr);
        const ctx = off.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);
        ctx.fillStyle = palette.canvasBg;
        ctx.fillRect(0, 0, bounds.width, bounds.height);
        ctx.save();
        ctx.translate(bounds.offsetX, bounds.offsetY);

        const sel = selectedIdRef.current;
        paintDiagramNodes(
          ctx,
          layout,
          sel,
          tagCountRef.current,
          clusterMetaRef.current,
          palette,
          undefined
        );
        paintDiagramEdges(ctx, edgePolylines, { edgeDotted, palette });
        placedLabels.forEach((g) => drawEdgeLabelPill(ctx, g, palette));
        paintClusterInnerMiniCards(ctx, layout, clusterMetaRef.current, palette, clusterMemberOffsetsRef.current);
        ctx.restore();

        const a = document.createElement('a');
        a.href = off.toDataURL('image/png');
        a.download = 'archmap-diagram.png';
        a.click();
      },
      exportSvg: () => {
        const layout = simToLayout(simNodesRef.current);
        const data = computeFullExportData(layout, edgesRef.current, focusIdRef.current);
        if (!data) return;
        const { bounds, edgePolylines, edgeDotted, placedLabels } = data;

        const layoutExport = layout.map((ln) => ({
          x: ln.x,
          y: ln.y,
          width: ln.width,
          height: ln.height,
          id: ln.node.id,
          name: nodeDisplayName(ln.node),
          technology: ln.node.technology,
          labels: ln.node.labels,
        }));

        const tagCounts: Record<string, number> = {};
        tagCountRef.current.forEach((n, id) => {
          if (n > 0) tagCounts[id] = n;
        });

        const clustersExport: Record<string, ClusterExportForSvg> = {};
        clusterMetaRef.current.forEach((meta, id) => {
          clustersExport[id] = {
            memberType: meta.memberType,
            edgeLabel: meta.edgeLabel,
            members: meta.members.map((m) => ({ name: nodeDisplayName(m), id: m.id })),
          };
        });

        const svg = buildDiagramSvgString({
          width: bounds.width,
          height: bounds.height,
          panX: bounds.offsetX,
          panY: bounds.offsetY,
          layout: layoutExport,
          edgePolylines: edgePolylines.map((p) => p.map((q) => ({ ...q }))),
          edgeDotted,
          edgeLabels: placedLabels.map((g) => ({
            text: g.text,
            x: g.x,
            y: g.y,
            align: g.align,
          })),
          selectedId: selectedIdRef.current,
          tagCounts,
          palette,
          clusters: clustersExport,
          clusterMemberOffsets: clusterMemberOffsetsRef.current,
        });
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'archmap-diagram.svg';
        a.click();
        URL.revokeObjectURL(url);
      },
      exportJson: () => {
        const layout = simToLayout(simNodesRef.current);
        const data = computeFullExportData(layout, edgesRef.current, focusIdRef.current);
        if (!data) return;
        const { bounds, edgePolylines, edgeDotted, placedLabels } = data;
        const tagCounts: Record<string, number> = {};
        tagCountRef.current.forEach((n, id) => {
          if (n > 0) tagCounts[id] = n;
        });
        const payload = {
          version: 1 as const,
          exportedAt: new Date().toISOString(),
          theme: resolvedTheme,
          diagramBounds: bounds,
          focusNodeId: focusIdRef.current,
          selectedNodeId: selectedIdRef.current,
          nodes: layout.map((ln) => ({
            id: ln.node.id,
            name: nodeDisplayName(ln.node),
            labels: ln.node.labels,
            technology: ln.node.technology,
            description: ln.node.description,
            properties: ln.node.properties,
            x: ln.x,
            y: ln.y,
            width: ln.width,
            height: ln.height,
            tagCount: tagCounts[ln.node.id] ?? 0,
          })),
          edges: edgesRef.current.map((e) => ({ ...e })),
          edgeRoutes: edgePolylines.map((pl, i) => ({
            points: pl.map((p) => ({ x: p.x, y: p.y })),
            dotted: edgeDotted[i] ?? false,
          })),
          edgeLabels: placedLabels.map((g) => ({
            text: g.text,
            x: g.x,
            y: g.y,
            align: g.align,
          })),
          savedLayout: {
            nodePositions: Object.fromEntries(
              simNodesRef.current.map((sn) => [sn.id, { x: sn.x ?? 0, y: sn.y ?? 0 }])
            ),
            clusterMemberOffsets: { ...clusterMemberOffsetsRef.current },
          },
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: 'application/json;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'archmap-diagram.json';
        a.click();
        URL.revokeObjectURL(url);
      },
      exportPlantUml: () => {
        const layout = simToLayout(simNodesRef.current);
        const nodes = layout.map((ln) => ln.node);
        const edges = edgesRef.current;
        if (nodes.length === 0) return;
        const text = buildPlantUmlComponentDiagram(nodes, edges);
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'archmap-diagram.puml';
        a.click();
        URL.revokeObjectURL(url);
      },
      zoomIn: () => {
        zoomRef.current = Math.min(2.4, zoomRef.current * 1.12);
        drawRef.current();
      },
      zoomOut: () => {
        zoomRef.current = Math.max(0.35, zoomRef.current / 1.12);
        drawRef.current();
      },
      resetZoom: () => {
        zoomRef.current = 1;
        const canvas = canvasRef.current;
        if (canvas && focusIdRef.current) {
          const layout = simToLayout(simNodesRef.current);
          const p = computePanToCenterFocus(canvas, layout, focusIdRef.current, zoomRef.current);
          if (p) panRef.current = p;
        }
        drawRef.current();
      },
      fitToScreen,
    }),
    [fitToScreen, simToLayout, palette, resolvedTheme]
  );

  useEffect(() => {
    if (progressiveTimerRef.current !== null) {
      window.clearTimeout(progressiveTimerRef.current);
      progressiveTimerRef.current = null;
    }
    simulationRef.current?.stop();
    simulationRef.current = null;
    simNodesRef.current = [];
    const graphChanged = prevGraphKeyRef.current !== graphKey;
    prevGraphKeyRef.current = graphKey;
    const preserveViewport = interactionMode === 'edit' && !graphChanged;
    if (!preserveViewport) {
      panRef.current = { x: 0, y: 0 };
      zoomRef.current = 1;
    }
    if (graphChanged) {
      hasInitialFitRef.current = false;
    }
    layoutVersionRef.current = 0;
    geometryCacheRef.current = null;
    deferredFullGeometryReadyRef.current = false;

    if (visibleNodes.length === 0) {
      drawRef.current();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 320);
    const h = Math.max(rect.height, 240);
    const selected = selectedVisibleId
      ? visibleNodes.find((n) => n.id === selectedVisibleId)
      : null;
    const nodeCount = visibleNodes.length;
    const speedOptMode =
      nodeCount < SPEED_OPT_MEDIUM_NODE_THRESHOLD
        ? 'best'
        : nodeCount <= SPEED_OPT_STRONG_NODE_THRESHOLD
          ? 'medium'
          : 'strong';

    // Переиспользуем существующие флаги:
    // - fastModeRef: включаем прогрессивную геометрию (ускорение) — medium
    // - heavyModeRef: максимально агрессивная оптимизация — strong
    fastModeRef.current = speedOptMode === 'medium';
    heavyModeRef.current = speedOptMode === 'strong';
    const useStraightEdges = speedOptMode !== 'best';

    const { simulation, simNodes } = createForceSimulation(
      visibleNodes,
      visibleEdges,
      w,
      h,
      selectedVisibleId
    );
    simNodesRef.current = simNodes;
    simulationRef.current = simulation;

    const saved = initialLayoutRef.current?.nodePositions;
    if (saved) {
      let applied = false;
      for (const sn of simNodes) {
        const p = saved[sn.id];
        if (p) {
          sn.x = p.x;
          sn.y = p.y;
          sn.fx = p.x;
          sn.fy = p.y;
          applied = true;
        }
      }
      if (applied) hasInitialFitRef.current = true;
    }

    const tick = () => {
      if (heavyModeRef.current && simulation.alpha() < 0.055) {
        simulation.stop();
        onEnd();
        return;
      }
      layoutVersionRef.current += 1;
      geometryCacheRef.current = null;
      drawRef.current();
    };
    const onEnd = () => {
      const canvas = canvasRef.current;
      const edit = interactionModeRef.current === 'edit';
      if (canvas && !edit) {
        if (!hasInitialFitRef.current) {
          fitToScreen();
          hasInitialFitRef.current = true;
        } else if (focusIdRef.current) {
          const layout = simToLayout(simNodesRef.current);
          const p = computePanToCenterFocus(canvas, layout, focusIdRef.current, zoomRef.current);
          if (p) {
            panRef.current = p;
          }
        }
      } else if (canvas && edit && !hasInitialFitRef.current) {
        hasInitialFitRef.current = true;
      }
      drawRef.current();
    };
    simulation.on('tick', tick);
    simulation.on('end', onEnd);
    simulation.alpha(1).restart();
    if (heavyModeRef.current) {
      window.setTimeout(() => {
        if (simulationRef.current === simulation) {
          simulation.stop();
          onEnd();
        }
      }, HEAVY_MODE_MAX_TICKS * 16);
    }

    if (fastModeRef.current) {
      const layout = simToLayout(simNodesRef.current);
      const nodeMap = new Map(layout.map((ln) => [ln.node.id, ln]));
      const layoutBoxes: LayoutBox[] = layout.map((ln) => ({
        id: ln.node.id,
        x: ln.x,
        y: ln.y,
        width: ln.width,
        height: ln.height,
      }));
      const focusId = focusIdRef.current;
      const visibleEdgePairs = visibleEdges
        .map((edge) => {
          const src = nodeMap.get(edge.source);
          const tgt = nodeMap.get(edge.target);
          if (!src || !tgt) return null;
          return { edge, src, tgt };
        })
        .filter(
          (
            v
          ): v is { edge: GraphEdge; src: LayoutNode; tgt: LayoutNode } => v !== null
        );

      let cursor = 0;
      const progressivePolylines: Point[][] = [];
      const progressiveDotted: boolean[] = [];
      const labelCandidates: EdgeLabelGeom[] = [];
      geometryCacheRef.current = {
        layoutVersion: layoutVersionRef.current,
        focusId,
        edgePolylines: [],
        edgeDotted: [],
        placedLabels: [],
      };
      drawRef.current();

      const runChunk = () => {
        const t0 = performance.now();
        let processed = 0;
        while (
          cursor < visibleEdgePairs.length &&
          processed < PROGRESSIVE_EDGE_CHUNK_SIZE &&
          performance.now() - t0 < PROGRESSIVE_EDGE_BUDGET_MS
        ) {
          const { edge, src, tgt } = visibleEdgePairs[cursor]!;
          const srcBox: LayoutBox = {
            id: src.node.id,
            x: src.x,
            y: src.y,
            width: src.width,
            height: src.height,
          };
          const tgtBox: LayoutBox = {
            id: tgt.node.id,
            x: tgt.x,
            y: tgt.y,
            width: tgt.width,
            height: tgt.height,
          };
          const points = useStraightEdges
            ? [
                rectBoundaryPointToward(src, tgt.x + tgt.width / 2, tgt.y + tgt.height / 2),
                rectBoundaryPointToward(tgt, src.x + src.width / 2, src.y + src.height / 2),
              ]
            : routeEdgeWithAStar(srcBox, tgtBox, layoutBoxes, edgeStartsHorizontal(src, tgt));
          progressivePolylines.push(points);
          progressiveDotted.push(isStructuralEdgeRelationship(edge.type));

          const labelText = graphEdgeLabel(edge);
          if (labelText) {
            const bias = labelBiasEnd(focusId, edge.source, edge.target);
            const anchor = labelPointAlongPolyline(points, bias);
            labelCandidates.push({
              text: labelText,
              x: anchor.x,
              y: anchor.y,
              align: anchor.align,
            });
          }
          cursor += 1;
          processed += 1;
        }

        geometryCacheRef.current = {
          layoutVersion: layoutVersionRef.current,
          focusId,
          edgePolylines: [...progressivePolylines],
          edgeDotted: [...progressiveDotted],
          placedLabels: [],
        };
        drawRef.current();

        if (cursor < visibleEdgePairs.length) {
          progressiveTimerRef.current = window.setTimeout(runChunk, 16);
          return;
        }

        const labelCtx = document.createElement('canvas').getContext('2d');
        const placedLabels = labelCtx ? resolveEdgeLabelOverlaps(labelCtx, labelCandidates) : [];
        geometryCacheRef.current = {
          layoutVersion: layoutVersionRef.current,
          focusId,
          edgePolylines: progressivePolylines,
          edgeDotted: progressiveDotted,
          placedLabels,
        };
        deferredFullGeometryReadyRef.current = true;
        progressiveTimerRef.current = null;
        drawRef.current();
      };

      progressiveTimerRef.current = window.setTimeout(runChunk, 0);
    } else {
      deferredFullGeometryReadyRef.current = true;
    }

    return () => {
      if (progressiveTimerRef.current !== null) {
        window.clearTimeout(progressiveTimerRef.current);
        progressiveTimerRef.current = null;
      }
      simulation.stop();
    };
  }, [
    fitToScreen,
    graphKey,
    interactionMode,
    layoutPersistKey,
    resizeTick,
    simToLayout,
    selectedVisibleId,
    visibleEdges,
    visibleNodes,
  ]);

  useEffect(() => {
    drawRef.current();
  }, [selectedVisibleId, focusNodeId, tagCountByNodeId, pinnedNodeIds]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (canvas && onPinToggleRef.current && pinnedNodeIdsRef.current !== undefined) {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
      const y = (e.clientY - rect.top - panRef.current.y) / zoomRef.current;
      const hit = layoutRef.current.find(
        (ln) => x >= ln.x && x <= ln.x + ln.width && y >= ln.y && y <= ln.y + ln.height
      );
      if (hit && !isClusterNode(hit.node) && hitTestPinToggle(hit, x, y)) {
        return;
      }
    }
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const wx = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
    const wy = (e.clientY - rect.top - panRef.current.y) / zoomRef.current;

    if (interactionModeRef.current === 'edit') {
      const eh = hitTestEditDrag(
        layoutRef.current,
        clusterMetaRef.current,
        wx,
        wy,
        clusterMemberOffsetsRef.current
      );
      if (eh) {
        suppressClickRef.current = false;
        if (eh.kind === 'member') {
          editDragRef.current = {
            type: 'member',
            nodeId: eh.clusterId,
            clusterId: eh.clusterId,
            memberId: eh.member.id,
            memberIdx: eh.memberIdx,
            startClientX: e.clientX,
            startClientY: e.clientY,
            lastClientX: e.clientX,
            lastClientY: e.clientY,
          };
        } else {
          editDragRef.current = {
            type: 'node',
            nodeId: eh.nodeId,
            startClientX: e.clientX,
            startClientY: e.clientY,
            lastClientX: e.clientX,
            lastClientY: e.clientY,
          };
        }
        dragRef.current.dragging = false;
        canvas.style.cursor = 'move';
        return;
      }
    }

    dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
    canvas.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ed = editDragRef.current;
    if (ed) {
      const z = zoomRef.current;
      const dx = (e.clientX - ed.lastClientX) / z;
      const dy = (e.clientY - ed.lastClientY) / z;
      ed.lastClientX = e.clientX;
      ed.lastClientY = e.clientY;

      if (ed.type === 'node') {
        const sn = simNodesRef.current.find((s) => s.id === ed.nodeId);
        if (sn) {
          sn.x = (sn.x ?? 0) + dx;
          sn.y = (sn.y ?? 0) + dy;
          sn.fx = sn.x;
          sn.fy = sn.y;
        }
      } else if (ed.clusterId && ed.memberId != null && ed.memberIdx !== undefined) {
        const ln = layoutRef.current.find((l) => l.node.id === ed.clusterId);
        const cm = clusterMetaRef.current.get(ed.clusterId);
        if (ln && cm) {
          const key = clusterMemberOffsetKey(ed.clusterId, ed.memberId);
          const prev = clusterMemberOffsetsRef.current[key] ?? { dx: 0, dy: 0 };
          clusterMemberOffsetsRef.current[key] = clampMemberOffset(
            ln,
            cm,
            ed.memberIdx,
            prev.dx + dx,
            prev.dy + dy
          );
        }
      }
      layoutVersionRef.current += 1;
      geometryCacheRef.current = null;
      drawRef.current();
      return;
    }

    if (!dragRef.current.dragging) {
      handleMouseHover(e);
      return;
    }
    const panDx = e.clientX - dragRef.current.lastX;
    const panDy = e.clientY - dragRef.current.lastY;
    panRef.current.x += panDx;
    panRef.current.y += panDy;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    drawRef.current();
    canvas.style.cursor = 'grabbing';
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const prevZoom = zoomRef.current;
    const zoomDelta = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const nextZoom = Math.min(2.4, Math.max(0.35, prevZoom * zoomDelta));
    if (Math.abs(nextZoom - prevZoom) < 0.0001) return;

    // Zoom around cursor point to keep navigation predictable.
    const wx = (sx - panRef.current.x) / prevZoom;
    const wy = (sy - panRef.current.y) / prevZoom;
    zoomRef.current = nextZoom;
    panRef.current.x = sx - wx * nextZoom;
    panRef.current.y = sy - wy * nextZoom;
    drawRef.current();
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    const ed = editDragRef.current;
    if (ed) {
      const moved = Math.hypot(e.clientX - ed.startClientX, e.clientY - ed.startClientY);
      if (moved > 6) suppressClickRef.current = true;
      editDragRef.current = null;
      if (onLayoutPersistRef.current) emitLayoutPersist();
    }
    dragRef.current.dragging = false;
    if (canvas) {
      canvas.style.cursor = 'grab';
    }
  };

  const handleMouseHover = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || dragRef.current.dragging) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
    const y = (e.clientY - rect.top - panRef.current.y) / zoomRef.current;

    if (interactionModeRef.current === 'edit') {
      const eh = hitTestEditDrag(
        layoutRef.current,
        clusterMetaRef.current,
        x,
        y,
        clusterMemberOffsetsRef.current
      );
      if (eh) {
        canvas.style.cursor = 'move';
        return;
      }
    }

    const hovered = layoutRef.current.find(
      (ln) => x >= ln.x && x <= ln.x + ln.width && y >= ln.y && y <= ln.y + ln.height
    );
    if (!hovered) {
      canvas.style.cursor = 'grab';
      return;
    }
    if (
      pinnedNodeIdsRef.current !== undefined &&
      !isClusterNode(hovered.node) &&
      hitTestPinToggle(hovered, x, y)
    ) {
      canvas.style.cursor = 'pointer';
      return;
    }
    if (!isClusterNode(hovered.node)) {
      canvas.style.cursor = 'pointer';
      return;
    }
    const cm = clusterMetaRef.current.get(hovered.node.id);
    if (cm && hitTestClusterMember(hovered, cm, x, y, clusterMemberOffsetsRef.current)) {
      canvas.style.cursor = interactionModeRef.current === 'edit' ? 'move' : 'pointer';
      return;
    }
    canvas.style.cursor = 'grab';
  };

  const handleClick = (e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
    const y = (e.clientY - rect.top - panRef.current.y) / zoomRef.current;

    const clicked = layoutRef.current.find(
      (ln) => x >= ln.x && x <= ln.x + ln.width && y >= ln.y && y <= ln.y + ln.height
    );
    if (clicked) {
      if (
        onPinToggleRef.current &&
        pinnedNodeIdsRef.current !== undefined &&
        !isClusterNode(clicked.node) &&
        hitTestPinToggle(clicked, x, y)
      ) {
        const pinned = pinnedNodeIdsRef.current.has(clicked.node.id);
        onPinToggleRef.current(clicked.node, !pinned);
        return;
      }
      if (isClusterNode(clicked.node)) {
        const cm = clusterMetaRef.current.get(clicked.node.id);
        const member = cm
          ? hitTestClusterMember(clicked, cm, x, y, clusterMemberOffsetsRef.current)
          : null;
        if (member) onNodeClick(member);
        return;
      }
      onNodeClick(clicked.node);
    }
  };

  return (
    <div className="graph-canvas h-full w-full flex-1">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', cursor: 'grab' }}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseOver={handleMouseHover}
        onMouseEnter={handleMouseHover}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (editDragRef.current && onLayoutPersistRef.current) emitLayoutPersist();
          dragRef.current.dragging = false;
          editDragRef.current = null;
          const c = canvasRef.current;
          if (c) c.style.cursor = 'grab';
        }}
        onWheel={handleWheel}
      />
      {visibleNodes.length === 0 && (
        <div className="graph-empty">
          {loading ? (
            <div>&gt; загрузка диаграммы…</div>
          ) : (
            <>
              <div>&gt; нет узлов на диаграмме</div>
              {emptyHint ? (
                <div className="graph-empty-hint">{emptyHint}</div>
              ) : (
                <div>&gt; нет связей у выбранной системы или слишком узкий фильтр</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});

GraphCanvas.displayName = 'GraphCanvas';
