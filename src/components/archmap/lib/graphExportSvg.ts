import { C4_COLORS } from '../types/c4';
import type { Point } from './astarGridRouter';

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
  edgeLabels: EdgeLabelExport[];
  selectedId: string | null;
  /** Локальные теги: число по id узла (бейдж на карточке). */
  tagCounts?: Record<string, number>;
}): string {
  const { width, height, panX, panY, layout, edgePolylines, edgeLabels, selectedId, tagCounts } =
    options;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );
  parts.push(`<rect width="100%" height="100%" fill="#FAFAFA"/>`);

  for (const pl of edgePolylines) {
    if (pl.length < 2) continue;
    const d = polylineD(pl, panX, panY);
    parts.push(
      `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
    );
    parts.push(
      `<path d="${d}" fill="none" stroke="#BBBBBB" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>`
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
      `<polygon points="${bx},${by} ${p1x},${p1y} ${p2x},${p2y}" fill="#BBBBBB"/>`
    );
  }

  for (const g of edgeLabels) {
    const tx = g.x + panX;
    const ty = g.y + panY;
    const anchor =
      g.align === 'center' ? 'middle' : g.align === 'right' ? 'end' : 'start';
    parts.push(
      `<text x="${tx}" y="${ty}" text-anchor="${anchor}" dominant-baseline="alphabetic" font-family="JetBrains Mono, monospace" font-size="11" fill="#444444" stroke="#FAFAFA" stroke-width="2" paint-order="stroke fill">${escapeXml(g.text)}</text>`
    );
  }

  for (const ln of layout) {
    const mainLabel = getMainLabel(ln.labels);
    const color = C4_COLORS[mainLabel] || '#777';
    const x = ln.x + panX;
    const y = ln.y + panY;
    const isSel = selectedId === ln.id;
    const tc = tagCounts?.[ln.id] ?? 0;

    if (isSel) {
      parts.push(
        `<rect x="${x - 3}" y="${y - 3}" width="${ln.width + 6}" height="${ln.height + 6}" fill="none" stroke="${color}" stroke-width="2" opacity="0.85"/>`
      );
    }
    parts.push(`<rect x="${x}" y="${y}" width="${ln.width}" height="${ln.height}" fill="#FFFFFF" stroke="${isSel ? color : '#E0E0E0'}" stroke-width="${isSel ? 2 : 1}"/>`);
    if (tc > 0) {
      parts.push(`<rect x="${x}" y="${y}" width="${ln.width}" height="3" fill="#FFB74D"/>`);
    }
    parts.push(`<rect x="${x}" y="${y}" width="4" height="${ln.height}" fill="${color}"/>`);

    const tag = getLabelDisplay(mainLabel);
    const name =
      ln.name.length > 22 ? ln.name.slice(0, 20) + '...' : ln.name;
    parts.push(
      `<text x="${x + 12}" y="${y + 18}" font-family="JetBrains Mono, monospace" font-size="10" fill="${color}">[${escapeXml(tag)}]</text>`
    );
    parts.push(
      `<text x="${x + 12}" y="${y + 38}" font-family="JetBrains Mono, monospace" font-size="12" fill="#000000">${escapeXml(name)}</text>`
    );
    if (ln.technology) {
      const tech =
        ln.technology.length > 26 ? ln.technology.slice(0, 24) + '...' : ln.technology;
      parts.push(
        `<text x="${x + 12}" y="${y + 56}" font-family="JetBrains Mono, monospace" font-size="10" fill="#888888">${escapeXml(tech)}</text>`
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
        `<rect x="${bx}" y="${by}" width="${badgeW}" height="${badgeH}" rx="4" fill="#FFF3E0" stroke="#E65100" stroke-width="1"/>`
      );
      parts.push(
        `<polygon points="${bx + 5},${by + 5} ${bx + 9},${by + 12} ${bx + 1},${by + 12}" fill="#E65100"/>`
      );
      parts.push(
        `<text x="${bx + iconSlot + 4}" y="${by + 13}" font-family="JetBrains Mono, monospace" font-size="10" font-weight="bold" fill="#BF360C">${escapeXml(countStr)}</text>`
      );
    }
  }

  parts.push(`</svg>`);
  return parts.join('\n');
}
