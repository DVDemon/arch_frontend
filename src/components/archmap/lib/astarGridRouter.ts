/**
 * Ортогональный A* по сетке между гранями двух узлов, обход прочих прямоугольников.
 */

export interface LayoutBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Шаг ортогональной сетки A* (px). Больше шаг — меньше ячеек и быстрее поиск. */
export const GRID_CELL = 20;

const OBSTACLE_PAD = 2;
const INTERIOR_EPS = 0.5;
/** Поля bbox вокруг диаграммы — кратно GRID_CELL для согласованности с узлами. */
const MARGIN = Math.ceil(56 / GRID_CELL) * GRID_CELL;

/** Округление размера до целого числа шагов сетки (размеры карточек узлов). */
export function snapSizeToGrid(px: number): number {
  return Math.max(GRID_CELL, Math.round(px / GRID_CELL) * GRID_CELL);
}

/** Точка на стороне прямоугольника, смотрящая к (towardX, towardY). */
export function edgeAttachmentPointFacing(rect: LayoutBox, towardX: number, towardY: number): Point {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const vx = towardX - cx;
  const vy = towardY - cy;
  const edges: Array<{ nx: number; ny: number; p: () => Point }> = [
    {
      nx: 0,
      ny: -1,
      p: () => ({ x: cx, y: rect.y }),
    },
    {
      nx: 0,
      ny: 1,
      p: () => ({ x: cx, y: rect.y + rect.height }),
    },
    {
      nx: -1,
      ny: 0,
      p: () => ({ x: rect.x, y: cy }),
    },
    {
      nx: 1,
      ny: 0,
      p: () => ({ x: rect.x + rect.width, y: cy }),
    },
  ];
  let best = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < edges.length; i++) {
    const d = vx * edges[i].nx + vy * edges[i].ny;
    if (d > bestDot) {
      bestDot = d;
      best = i;
    }
  }
  return edges[best].p();
}

function pointStrictlyInsideRect(x: number, y: number, b: LayoutBox): boolean {
  return (
    x > b.x + INTERIOR_EPS &&
    x < b.x + b.width - INTERIOR_EPS &&
    y > b.y + INTERIOR_EPS &&
    y < b.y + b.height - INTERIOR_EPS
  );
}

function pointInPaddedObstacle(x: number, y: number, o: LayoutBox): boolean {
  const px = o.x - OBSTACLE_PAD;
  const py = o.y - OBSTACLE_PAD;
  const pw = o.width + OBSTACLE_PAD * 2;
  const ph = o.height + OBSTACLE_PAD * 2;
  return x >= px && x <= px + pw && y >= py && y <= py + ph;
}

function bboxFor(layout: LayoutBox[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of layout) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return {
    minX: minX - MARGIN,
    minY: minY - MARGIN,
    maxX: maxX + MARGIN,
    maxY: maxY + MARGIN,
  };
}

function cellBlocked(
  wx: number,
  wy: number,
  src: LayoutBox,
  tgt: LayoutBox,
  others: LayoutBox[]
): boolean {
  for (const o of others) {
    if (pointInPaddedObstacle(wx, wy, o)) return true;
  }
  if (pointStrictlyInsideRect(wx, wy, src)) return true;
  if (pointStrictlyInsideRect(wx, wy, tgt)) return true;
  return false;
}

function worldToGrid(
  wx: number,
  wy: number,
  minX: number,
  minY: number,
  cols: number,
  rows: number
): { gx: number; gy: number } | null {
  const gx = Math.floor((wx - minX) / GRID_CELL);
  const gy = Math.floor((wy - minY) / GRID_CELL);
  if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return null;
  return { gx, gy };
}

function cellCenter(gx: number, gy: number, minX: number, minY: number): Point {
  return {
    x: minX + gx * GRID_CELL + GRID_CELL / 2,
    y: minY + gy * GRID_CELL + GRID_CELL / 2,
  };
}

function key(gx: number, gy: number, cols: number): number {
  return gx + gy * cols;
}

function unkey(k: number, cols: number): { gx: number; gy: number } {
  const gy = Math.floor(k / cols);
  const gx = k % cols;
  return { gx, gy };
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function findNearestWalkable(
  startGx: number,
  startGy: number,
  cols: number,
  rows: number,
  minX: number,
  minY: number,
  src: LayoutBox,
  tgt: LayoutBox,
  others: LayoutBox[],
  maxR: number
): { gx: number; gy: number } | null {
  const blocked = (gx: number, gy: number) => {
    const { x, y } = cellCenter(gx, gy, minX, minY);
    return cellBlocked(x, y, src, tgt, others);
  };
  if (!blocked(startGx, startGy)) return { gx: startGx, gy: startGy };
  const q: Array<[number, number]> = [[startGx, startGy]];
  const seen = new Set<string>([`${startGx},${startGy}`]);
  let qi = 0;
  while (qi < q.length) {
    const [gx, gy] = q[qi++]!;
    if (Math.abs(gx - startGx) + Math.abs(gy - startGy) > maxR) continue;
    if (!blocked(gx, gy)) return { gx, gy };
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const sk = `${nx},${ny}`;
      if (seen.has(sk)) continue;
      if (Math.abs(nx - startGx) + Math.abs(ny - startGy) > maxR) continue;
      seen.add(sk);
      q.push([nx, ny]);
    }
  }
  return null;
}

function aStar(
  startGx: number,
  startGy: number,
  goalGx: number,
  goalGy: number,
  cols: number,
  rows: number,
  minX: number,
  minY: number,
  src: LayoutBox,
  tgt: LayoutBox,
  others: LayoutBox[]
): Array<{ gx: number; gy: number }> | null {
  const blocked = (gx: number, gy: number) => {
    const { x, y } = cellCenter(gx, gy, minX, minY);
    return cellBlocked(x, y, src, tgt, others);
  };

  const startKey = key(startGx, startGy, cols);
  const goalKey = key(goalGx, goalGy, cols);

  const open: number[] = [startKey];
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  gScore.set(startKey, 0);

  const f = (k: number) => {
    const { gx, gy } = unkey(k, cols);
    return (gScore.get(k) ?? Infinity) + heuristic(gx, gy, goalGx, goalGy);
  };

  const openSet = new Set<number>([startKey]);
  let guard = 0;
  const maxIter = cols * rows * 8;

  while (open.length > 0 && guard++ < maxIter) {
    let minI = 0;
    let minF = Infinity;
    for (let i = 0; i < open.length; i++) {
      const fi = f(open[i]!);
      if (fi < minF) {
        minF = fi;
        minI = i;
      }
    }
    const current = open.splice(minI, 1)[0]!;
    openSet.delete(current);
    if (current === goalKey) {
      const path: Array<{ gx: number; gy: number }> = [];
      let c: number | undefined = current;
      while (c !== undefined) {
        path.push(unkey(c, cols));
        c = cameFrom.get(c);
      }
      path.reverse();
      return path;
    }

    const { gx: cx, gy: cy } = unkey(current, cols);
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (blocked(nx, ny)) continue;
      const nk = key(nx, ny, cols);
      const tentative = (gScore.get(current) ?? Infinity) + 1;
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, current);
        gScore.set(nk, tentative);
        if (!openSet.has(nk)) {
          openSet.add(nk);
          open.push(nk);
        }
      }
    }
  }
  return null;
}

function simplifyCollinear(points: Array<{ gx: number; gy: number }>): Array<{ gx: number; gy: number }> {
  if (points.length <= 2) return points;
  const out: Array<{ gx: number; gy: number }> = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = out[out.length - 1]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const sameRow = p0.gy === p1.gy && p1.gy === p2.gy;
    const sameCol = p0.gx === p1.gx && p1.gx === p2.gx;
    if (sameRow || sameCol) continue;
    out.push(p1);
  }
  out.push(points[points.length - 1]!);
  return out;
}

function fallbackOrthogonal(
  src: LayoutBox,
  tgt: LayoutBox,
  exitPt: Point,
  entryPt: Point,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  horizontalFirst: boolean
): Point[] {
  const sb = src.y + src.height;
  const tb = tgt.y + tgt.height;
  let yh: number;
  if (Math.abs(ty - sy) < 12) {
    yh = Math.max(sb, tb) + 28;
  } else if (ty >= sy) {
    yh = tgt.y >= sb - 2 ? sb + (tgt.y - sb) / 2 : (sy + ty) / 2;
  } else if (src.y >= tb - 2) {
    yh = tb + (src.y - tb) / 2;
  } else {
    yh = (sy + ty) / 2;
  }
  const sr = src.x + src.width;
  const sl = src.x;
  const tr = tgt.x + tgt.width;
  const tl = tgt.x;
  let xm: number;
  if (sr <= tl - 2) xm = sr + (tl - sr) / 2;
  else if (tr <= sl - 2) xm = tr + (sl - tr) / 2;
  else xm = (sx + tx) / 2;

  if (horizontalFirst) {
    return [
      exitPt,
      { x: xm, y: exitPt.y },
      { x: xm, y: entryPt.y },
      entryPt,
    ];
  }
  return [exitPt, { x: exitPt.x, y: yh }, { x: entryPt.x, y: yh }, entryPt];
}

function nudgeOutwardFromRect(rect: LayoutBox, edgePt: Point, dist: number): Point {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const nx = edgePt.x - cx;
  const ny = edgePt.y - cy;
  const len = Math.hypot(nx, ny) || 1;
  return { x: edgePt.x + (nx / len) * dist, y: edgePt.y + (ny / len) * dist };
}

/**
 * Полилиния от грани source до грани target (включая концы на рёбрах).
 */
export function routeEdgeWithAStar(
  src: LayoutBox,
  tgt: LayoutBox,
  layout: LayoutBox[],
  horizontalFirst: boolean
): Point[] {
  const others = layout.filter((b) => b.id !== src.id && b.id !== tgt.id);
  const scx = src.x + src.width / 2;
  const scy = src.y + src.height / 2;
  const tcx = tgt.x + tgt.width / 2;
  const tcy = tgt.y + tgt.height / 2;

  const exitPt = edgeAttachmentPointFacing(src, tcx, tcy);
  const entryPt = edgeAttachmentPointFacing(tgt, scx, scy);

  const startWorld = nudgeOutwardFromRect(src, exitPt, GRID_CELL * 0.65);
  const goalWorld = nudgeOutwardFromRect(tgt, entryPt, GRID_CELL * 0.65);

  const bb = bboxFor(layout);
  const cols = Math.ceil((bb.maxX - bb.minX) / GRID_CELL);
  const rows = Math.ceil((bb.maxY - bb.minY) / GRID_CELL);

  const sw = worldToGrid(startWorld.x, startWorld.y, bb.minX, bb.minY, cols, rows);
  const gw = worldToGrid(goalWorld.x, goalWorld.y, bb.minX, bb.minY, cols, rows);
  if (!sw || !gw) {
    return fallbackOrthogonal(src, tgt, exitPt, entryPt, scx, scy, tcx, tcy, horizontalFirst);
  }

  /** Радиус поиска ближайшей проходимой ячейки (Манхэттен, в шагах сетки). */
  const walkSearchR = 40;
  const startFree = findNearestWalkable(
    sw.gx,
    sw.gy,
    cols,
    rows,
    bb.minX,
    bb.minY,
    src,
    tgt,
    others,
    walkSearchR
  );
  const goalFree = findNearestWalkable(
    gw.gx,
    gw.gy,
    cols,
    rows,
    bb.minX,
    bb.minY,
    src,
    tgt,
    others,
    walkSearchR
  );
  if (!startFree || !goalFree) {
    return fallbackOrthogonal(src, tgt, exitPt, entryPt, scx, scy, tcx, tcy, horizontalFirst);
  }

  const gridPath = aStar(
    startFree.gx,
    startFree.gy,
    goalFree.gx,
    goalFree.gy,
    cols,
    rows,
    bb.minX,
    bb.minY,
    src,
    tgt,
    others
  );

  if (!gridPath || gridPath.length === 0) {
    return fallbackOrthogonal(src, tgt, exitPt, entryPt, scx, scy, tcx, tcy, horizontalFirst);
  }

  const simp = simplifyCollinear(gridPath);
  const poly: Point[] = [exitPt];
  for (let i = 0; i < simp.length; i++) {
    const { gx, gy } = simp[i]!;
    poly.push(cellCenter(gx, gy, bb.minX, bb.minY));
  }
  poly.push(entryPt);

  const dedup: Point[] = [];
  for (const p of poly) {
    const last = dedup[dedup.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.5) dedup.push(p);
  }
  return dedup;
}

export function arrowAngleFromPolyline(points: Point[]): number {
  if (points.length < 2) return 0;
  const a = points[points.length - 2]!;
  const b = points[points.length - 1]!;
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Позиция подписи: середина по длине полилинии, слегка выше линии. */
export function labelPointAlongPolyline(
  points: Point[],
  biasEnd: 'source' | 'target' | null
): { x: number; y: number; align: CanvasTextAlign } {
  if (points.length < 2) {
    const p = points[0] ?? { x: 0, y: 0 };
    return { x: p.x, y: p.y - 6, align: 'center' };
  }
  let total = 0;
  const segLens: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    segLens.push(L);
    total += L;
  }
  if (total < 1e-6) {
    const m = points[Math.floor(points.length / 2)]!;
    return { x: m.x, y: m.y - 6, align: 'center' };
  }
  let remaining =
    biasEnd === 'target' ? total * 0.62 : biasEnd === 'source' ? total * 0.38 : total * 0.5;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const L = segLens[i]!;
    if (remaining <= L) {
      const r = L > 0 ? remaining / L : 0;
      const x = a.x + (b.x - a.x) * r;
      const y = a.y + (b.y - a.y) * r;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const horiz = Math.abs(dx) >= Math.abs(dy);
      if (horiz) {
        return { x, y: y - 6, align: 'center' };
      }
      return { x: x - 6, y, align: 'right' };
    }
    remaining -= L;
  }
  const last = points[points.length - 1]!;
  return { x: last.x, y: last.y - 6, align: 'center' };
}
