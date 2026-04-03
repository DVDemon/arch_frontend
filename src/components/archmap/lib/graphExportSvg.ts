import { C4_COLORS } from '../types/c4';
import { clusterMemberOffsetKey } from '../types/diagramLayout';
import { GRID_CELL, type Point } from './astarGridRouter';
import { getDiagramPalette, type DiagramPalette } from './diagramTheme';

/** Согласовано с GraphCanvas (мини-карточки внутри группы). */
const CLUSTER_MEMBER_W = 120;
const CLUSTER_MEMBER_H = 48;
const CLUSTER_HEADER_H = 24;
const CLUSTER_BOX_PADDING = GRID_CELL;

/** Данные группы для экспорта SVG (внутренние имена и тип). */
export interface ClusterExportForSvg {
  memberType: string;
  edgeLabel: string;
  members: { name: string; id: string }[];
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

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function polylineD(points: Point[], panX: number, panY: number): string {
  if (points.length === 0) return '';
  const p0 = points[0]!;
  let d = `M ${p0.x + panX} ${p0.y + panY}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    d += ` L ${p.x + panX} ${p.y + panY}`;
  }
  return d;
}

interface LayoutExportNode {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
  name: string;
  technology?: string;
  labels: string[];
}

export interface EdgeLabelExport {
  text: string;
  x: number;
  y: number;
  align: CanvasTextAlign;
}

export function buildDiagramSvgString(options: {
  width: number;
  height: number;
  panX: number;
  panY: number;
  layout: LayoutExportNode[];
  edgePolylines: Point[][];
  /** Пунктир (Child / Deploy) — индекс как у edgePolylines */
  edgeDotted?: boolean[];
  edgeLabels: EdgeLabelExport[];
  selectedId: string | null;
  /** Локальные теги: число по id узла (бейдж на карточке). */
  tagCounts?: Record<string, number>;
  /** Если не задано — светлая палитра (обратная совместимость). */
  palette?: DiagramPalette;
  /** Схлопнутые группы: id узла-кластера → состав (как на canvas). */
  clusters?: Record<string, ClusterExportForSvg>;
  /** Смещения мини-карточек в группе (ключ `clusterId::memberId`). */
  clusterMemberOffsets?: Record<string, { dx: number; dy: number }>;
}): string {
  const {
    width,
    height,
    panX,
    panY,
    layout,
    edgePolylines,
    edgeDotted,
    edgeLabels,
    selectedId,
    tagCounts,
    palette: paletteOpt,
    clusters,
    clusterMemberOffsets,
  } = options;
  const pal = paletteOpt ?? getDiagramPalette(false);
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );
  parts.push(`<rect width="100%" height="100%" fill="${pal.canvasBg}"/>`);

  for (let i = 0; i < edgePolylines.length; i++) {
    const pl = edgePolylines[i]!;
    if (pl.length < 2) continue;
    const dotted = edgeDotted?.[i] ?? false;
    const dash = dotted ? ' stroke-dasharray="2 6"' : '';
    const d = polylineD(pl, panX, panY);
    parts.push(
      `<path d="${d}" fill="none" stroke="${pal.edgeHalo}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"${dash}/>`
    );
    parts.push(
      `<path d="${d}" fill="none" stroke="${pal.edgeStroke}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"${dash}/>`
    );
    const a = pl[pl.length - 2]!;
    const b = pl[pl.length - 1]!;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const bx = b.x + panX;
    const by = b.y + panY;
    const s = 8;
    const p1x = bx - s * Math.cos(ang - 0.4);
    const p1y = by - s * Math.sin(ang - 0.4);
    const p2x = bx - s * Math.cos(ang + 0.4);
    const p2y = by - s * Math.sin(ang + 0.4);
    parts.push(
      `<polygon points="${bx},${by} ${p1x},${p1y} ${p2x},${p2y}" fill="${pal.edgeStroke}"/>`
    );
  }

  for (const g of edgeLabels) {
    const tx = g.x + panX;
    const ty = g.y + panY;
    const anchor =
      g.align === 'center' ? 'middle' : g.align === 'right' ? 'end' : 'start';
    parts.push(
      `<text x="${tx}" y="${ty}" text-anchor="${anchor}" dominant-baseline="alphabetic" font-family="JetBrains Mono, monospace" font-size="11" fill="${pal.edgeLabelText}" stroke="${pal.edgeLabelTextHalo}" stroke-width="2" paint-order="stroke fill">${escapeXml(g.text)}</text>`
    );
  }

  for (const ln of layout) {
    const cm = clusters?.[ln.id];
    const mainLabel = getMainLabel(ln.labels);
    const color = C4_COLORS[mainLabel] || '#777';
    const x = ln.x + panX;
    const y = ln.y + panY;
    const isSel = selectedId === ln.id;
    const tc = tagCounts?.[ln.id] ?? 0;

    if (cm) {
      if (isSel) {
        parts.push(
          `<rect x="${x - 3}" y="${y - 3}" width="${ln.width + 6}" height="${ln.height + 6}" fill="none" stroke="${color}" stroke-width="2" opacity="0.85"/>`
        );
      }
      const strokeW = isSel ? 2 : 1.5;
      const strokeC = isSel ? color : pal.clusterOuterBorder;
      parts.push(
        `<rect x="${x}" y="${y}" width="${ln.width}" height="${ln.height}" fill="${pal.cardFill}" stroke="${strokeC}" stroke-width="${strokeW}" stroke-dasharray="8 6"/>`
      );
      const edgePipe =
        cm.edgeLabel && cm.edgeLabel !== '(no-label)' ? ` | ${cm.edgeLabel}` : '';
      parts.push(
        `<text x="${x + 10}" y="${y + 15}" font-family="JetBrains Mono, monospace" font-size="10" font-weight="bold" fill="${color}">[GROUP ${escapeXml(cm.memberType.toUpperCase())}]</text>`
      );
      parts.push(
        `<text x="${x + 10}" y="${y + 28}" font-family="JetBrains Mono, monospace" font-size="10" fill="${pal.clusterTitleMuted}">${cm.members.length} nodes${escapeXml(edgePipe)}</text>`
      );
      continue;
    }

    if (isSel) {
      parts.push(
        `<rect x="${x - 3}" y="${y - 3}" width="${ln.width + 6}" height="${ln.height + 6}" fill="none" stroke="${color}" stroke-width="2" opacity="0.85"/>`
      );
    }
    parts.push(
      `<rect x="${x}" y="${y}" width="${ln.width}" height="${ln.height}" fill="${pal.cardFill}" stroke="${isSel ? color : pal.cardBorder}" stroke-width="${isSel ? 2 : 1}"/>`
    );
    if (tc > 0) {
      parts.push(`<rect x="${x}" y="${y}" width="${ln.width}" height="3" fill="${pal.tagStrip}"/>`);
    }
    parts.push(`<rect x="${x}" y="${y}" width="4" height="${ln.height}" fill="${color}"/>`);

    const tag = getLabelDisplay(mainLabel);
    const name =
      ln.name.length > 22 ? ln.name.slice(0, 20) + '...' : ln.name;
    parts.push(
      `<text x="${x + 12}" y="${y + 18}" font-family="JetBrains Mono, monospace" font-size="10" fill="${color}">[${escapeXml(tag)}]</text>`
    );
    parts.push(
      `<text x="${x + 12}" y="${y + 38}" font-family="JetBrains Mono, monospace" font-size="12" fill="${pal.textPrimary}">${escapeXml(name)}</text>`
    );
    if (ln.technology) {
      const tech =
        ln.technology.length > 26 ? ln.technology.slice(0, 24) + '...' : ln.technology;
      parts.push(
        `<text x="${x + 12}" y="${y + 56}" font-family="JetBrains Mono, monospace" font-size="10" fill="${pal.textSecondary}">${escapeXml(tech)}</text>`
      );
    }

    if (tc > 0) {
      const pad = 4;
      const badgeH = 18;
      const iconSlot = 12;
      const countStr = String(tc);
      const tw = countStr.length * 6.5 + 8;
      const badgeW = Math.min(iconSlot + 4 + tw, ln.width - pad * 2);
      const bx = x + ln.width - badgeW - pad;
      const by = y + pad;
      parts.push(
        `<rect x="${bx}" y="${by}" width="${badgeW}" height="${badgeH}" rx="4" fill="${pal.badgeFill}" stroke="${pal.badgeStroke}" stroke-width="1"/>`
      );
      parts.push(
        `<polygon points="${bx + 5},${by + 5} ${bx + 9},${by + 12} ${bx + 1},${by + 12}" fill="${pal.badgeIcon}"/>`
      );
      parts.push(
        `<text x="${bx + iconSlot + 4}" y="${by + 13}" font-family="JetBrains Mono, monospace" font-size="10" font-weight="bold" fill="${pal.badgeText}">${escapeXml(countStr)}</text>`
      );
    }
  }

  if (clusters && Object.keys(clusters).length > 0) {
    for (const ln of layout) {
      const cm = clusters[ln.id];
      if (!cm) continue;
      const mainLabel = getMainLabel(ln.labels);
      const color = C4_COLORS[mainLabel] || '#777';
      const x = ln.x + panX;
      const y = ln.y + panY;
      const cols = Math.ceil(Math.sqrt(cm.members.length));
      const innerStartX = x + CLUSTER_BOX_PADDING;
      const innerStartY = y + CLUSTER_BOX_PADDING + CLUSTER_HEADER_H;
      cm.members.forEach((member, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const mx0 = innerStartX + col * (CLUSTER_MEMBER_W + GRID_CELL);
        const my0 = innerStartY + row * (CLUSTER_MEMBER_H + GRID_CELL);
        const off = clusterMemberOffsets?.[clusterMemberOffsetKey(ln.id, member.id)] ?? { dx: 0, dy: 0 };
        const mx = mx0 + off.dx;
        const my = my0 + off.dy;
        const shortName =
          member.name.length > 14 ? `${member.name.slice(0, 12)}...` : member.name;
        parts.push(
          `<rect x="${mx}" y="${my}" width="${CLUSTER_MEMBER_W}" height="${CLUSTER_MEMBER_H}" fill="${pal.clusterInnerFill}" stroke="${pal.clusterInnerBorder}" stroke-width="1"/>`
        );
        parts.push(
          `<text x="${mx + 8}" y="${my + 22}" font-family="JetBrains Mono, monospace" font-size="10" fill="${color}">${escapeXml(shortName)}</text>`
        );
      });
    }
  }

  parts.push(`</svg>`);
  return parts.join('\n');
}
