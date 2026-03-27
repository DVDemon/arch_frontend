import type { Point } from './astarGridRouter';

const CHAR_W_EST = 7;

export interface LabelBoundsHint {
  x: number;
  y: number;
  text: string;
}

/**
 * Ограничивающий прямоугольник всей диаграммы в мировых координатах.
 * offsetX/offsetY — сдвиг для translate, чтобы контент попал в (padding, padding).
 */
export function computeDiagramBounds(
  layout: Array<{ x: number; y: number; width: number; height: number }>,
  edgePolylines: Point[][],
  labelHints: LabelBoundsHint[],
  padding: number
): { width: number; height: number; offsetX: number; offsetY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const expand = (x0: number, y0: number, x1: number, y1: number) => {
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  };

  for (const ln of layout) {
    expand(ln.x, ln.y, ln.x + ln.width, ln.y + ln.height);
  }
  for (const pl of edgePolylines) {
    for (const p of pl) {
      expand(p.x, p.y, p.x, p.y);
    }
  }
  for (const g of labelHints) {
    const tw = Math.max(g.text.length * CHAR_W_EST + 16, 40);
    expand(g.x - tw / 2, g.y - 22, g.x + tw / 2, g.y + 8);
  }

  if (!Number.isFinite(minX)) {
    return { width: 320, height: 240, offsetX: 0, offsetY: 0 };
  }

  return {
    width: maxX - minX + 2 * padding,
    height: maxY - minY + 2 * padding,
    offsetX: -minX + padding,
    offsetY: -minY + padding,
  };
}
