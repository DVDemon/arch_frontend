"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getTechList,
  getTechById,
  getCategories,
  getTechByCategory,
  getRings,
  getSectors,
} from "@/lib/techradar-api";
import type {
  TechRadarTech,
  TechRadarRing,
  TechRadarSector,
  TechRadarCategory,
} from "@/types/techradar";

const RADAR_SIZE = 500;
const RADAR_CENTER = RADAR_SIZE / 2;

function TechDescriptionBar({
  tech,
  loading,
}: {
  tech: TechRadarTech | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/30">
        <span className="text-zinc-500">Загрузка…</span>
      </div>
    );
  }
  if (!tech) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
        <span className="text-zinc-500 dark:text-zinc-400">
          Выберите технологию на радаре или в списке слева
        </span>
        <Link
          href="/tech-radar/edit"
          className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
        >
          Редактировать технологии
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-2">
      <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{tech.label}</h3>
      <span className={`rounded px-2 py-0.5 text-sm ${getRingColorClasses(tech.ring?.name)}`}>
        {tech.ring?.name ?? "—"}
      </span>
      {tech.sector && (
        <span className="text-sm text-zinc-600 dark:text-zinc-400">{tech.sector.name}</span>
      )}
      {tech.description && (
        <span className="text-sm text-zinc-600 dark:text-zinc-400">{tech.description}</span>
      )}
      {tech.link && (
        <a
          href={tech.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-amber-600 hover:underline dark:text-amber-400"
        >
          Ссылка
        </a>
      )}
      </div>
      <Link
        href="/tech-radar/edit"
        className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
      >
        Редактировать технологии
      </Link>
    </div>
  );
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

function RadarWidget({
  techs,
  rings,
  sectors,
  selectedId,
  onSelectTech,
}: {
  techs: TechRadarTech[];
  rings: TechRadarRing[];
  sectors: TechRadarSector[];
  selectedId: number | null;
  onSelectTech: (id: number) => void;
}) {
  const sortedRings = useMemo(
    () => [...rings].filter((r) => r.id !== 0).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [rings]
  );
  const sortedSectors = useMemo(
    () => [...sectors].filter((s) => s.id !== 0).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [sectors]
  );

  const ringCount = Math.max(sortedRings.length, 4);
  const sectorCount = Math.max(sortedSectors.length, 1);
  const maxRadius = RADAR_CENTER - 40;

  const getRingRadius = (ringIndex: number) => {
    return (maxRadius * (ringIndex + 1)) / ringCount;
  };

  const getSectorAngle = (sectorIndex: number) => {
    return (360 * sectorIndex) / sectorCount;
  };

  const getCellKey = (tech: TechRadarTech) => {
    const ringIdx = sortedRings.findIndex((r) => r.id === tech.ring?.id);
    const sectorIdx = sortedSectors.findIndex((s) => s.id === tech.sector?.id);
    const rIdx = ringIdx >= 0 ? ringIdx : 0;
    const sIdx = sectorIdx >= 0 ? sectorIdx : 0;
    return `${sIdx}-${rIdx}`;
  };

  const activeTechs = techs.filter(
    (t) => t.ring?.id != null && t.ring.id !== 0 && t.sector?.id != null && t.sector.id !== 0
  );

  const techPositions = useMemo(() => {
    const positions = new Map<number, { x: number; y: number }>();
    const byCell = new Map<string, TechRadarTech[]>();
    for (const t of activeTechs) {
      const key = getCellKey(t);
      if (!byCell.has(key)) byCell.set(key, []);
      byCell.get(key)!.push(t);
    }
    for (const [, cellTechs] of byCell) {
      const first = cellTechs[0]!;
      const ringIdx = sortedRings.findIndex((r) => r.id === first.ring?.id);
      const sectorIdx = sortedSectors.findIndex((s) => s.id === first.sector?.id);
      const rIdx = ringIdx >= 0 ? ringIdx : 0;
      const sIdx = sectorIdx >= 0 ? sectorIdx : 0;
      const innerR = getRingRadius(rIdx);
      const outerR = getRingRadius(rIdx + 1);
      const angleStart = getSectorAngle(sIdx);
      const angleEnd = getSectorAngle(sIdx + 1);
      const cellAngle = angleEnd - angleStart;
      const cellDepth = outerR - innerR;
      const n = cellTechs.length;
      const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
      const rows = Math.max(1, Math.ceil(n / cols));
      const stepR = cellDepth / (rows + 1);
      const stepA = cellAngle / (cols + 1);
      cellTechs.forEach((tech, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const r = innerR + stepR * (row + 1);
        const angle = angleStart + stepA * (col + 1);
        const { x, y } = polarToCartesian(RADAR_CENTER, RADAR_CENTER, r, angle);
        positions.set(tech.id, { x, y });
      });
    }
    return positions;
  }, [activeTechs, sortedRings, sortedSectors]);

  return (
    <svg
      viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
      width="100%"
      height="100%"
      overflow="visible"
      className="min-h-[400px] rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Секторы */}
      {sortedSectors.map((sector, si) => {
        const startAngle = getSectorAngle(si);
        const endAngle = getSectorAngle(si + 1);
        const largeArc = endAngle - startAngle > 180 ? 1 : 0;
        return sortedRings.map((_, ri) => {
          const innerR = getRingRadius(ri);
          const outerR = getRingRadius(ri + 1);
          const innerStart = polarToCartesian(RADAR_CENTER, RADAR_CENTER, innerR, startAngle);
          const innerEnd = polarToCartesian(RADAR_CENTER, RADAR_CENTER, innerR, endAngle);
          const outerStart = polarToCartesian(RADAR_CENTER, RADAR_CENTER, outerR, startAngle);
          const outerEnd = polarToCartesian(RADAR_CENTER, RADAR_CENTER, outerR, endAngle);
          const d = [
            `M ${innerStart.x} ${innerStart.y}`,
            `L ${outerStart.x} ${outerStart.y}`,
            `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
            `L ${innerEnd.x} ${innerEnd.y}`,
            `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
          ].join(" ");
          return (
            <path
              key={`${si}-${ri}`}
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-zinc-200 dark:text-zinc-700"
            />
          );
        });
      })}

      {/* Подписи колец */}
      {sortedRings.map((ring, ri) => {
        const r = getRingRadius(ri) + (getRingRadius(ri + 1) - getRingRadius(ri)) / 2;
        const pos = polarToCartesian(RADAR_CENTER, RADAR_CENTER, r, 0);
        return (
          <text
            key={ring.id}
            x={pos.x}
            y={pos.y}
            textAnchor="middle"
            className="fill-zinc-500 text-xs dark:fill-zinc-400"
          >
            {ring.name}
          </text>
        );
      })}

      {/* Технологии */}
      {activeTechs.map((tech) => {
        const pos = techPositions.get(tech.id) ?? { x: RADAR_CENTER, y: RADAR_CENTER };
        const isSelected = selectedId === tech.id;
        const labelOffset = 14;
        return (
          <g key={tech.id} onClick={() => onSelectTech(tech.id)}>
            <circle
              cx={pos.x}
              cy={pos.y}
              r={isSelected ? 8 : 6}
              className={getRingCircleClasses(tech.ring?.name, isSelected)}
            />
            <text
              x={pos.x + labelOffset}
              y={pos.y + 4}
              textAnchor="start"
              className="pointer-events-none fill-zinc-900 text-[10px] font-medium dark:fill-zinc-100"
            >
              {tech.label || "?"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function getRingColorClasses(ringName?: string) {
  switch (ringName) {
    case "Adopt":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
    case "Trial":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
    case "Assess":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
    case "Hold":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
    default:
      return "bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-300";
  }
}

function getRingCircleClasses(ringName?: string, isSelected?: boolean) {
  const base = isSelected ? "stroke-2" : "stroke-1";
  const fill =
    ringName === "Adopt"
      ? "fill-green-500"
      : ringName === "Trial"
        ? "fill-blue-500"
        : ringName === "Assess"
          ? "fill-amber-500"
          : ringName === "Hold"
            ? "fill-red-500"
            : "fill-zinc-400";
  const stroke = isSelected ? "stroke-zinc-800 dark:stroke-zinc-200" : "stroke-zinc-600 dark:stroke-zinc-500";
  return `${base} ${fill} ${stroke} cursor-pointer transition-all hover:opacity-90`;
}

export default function TechRadarPage() {
  const [techs, setTechs] = useState<TechRadarTech[]>([]);
  const [categories, setCategories] = useState<TechRadarCategory[]>([]);
  const [rings, setRings] = useState<TechRadarRing[]>([]);
  const [sectors, setSectors] = useState<TechRadarSector[]>([]);
  const [selectedTech, setSelectedTech] = useState<TechRadarTech | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(new Set());
  const [filterName, setFilterName] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoriesExpanded, setCategoriesExpanded] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [techList, catList, ringList, sectorList] = await Promise.all([
        getTechList(true),
        getCategories(),
        getRings(),
        getSectors(),
      ]);
      setTechs(techList);
      setCategories(catList);
      setRings(ringList);
      setSectors(sectorList);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadTechByCategory = useCallback(async (categoryIds: number[]) => {
    if (categoryIds.length === 0) {
      loadData();
      return;
    }
    setLoading(true);
    try {
      const data = await getTechByCategory(categoryIds);
      setTechs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [loadData]);

  const toggleCategory = useCallback(
    (id: number) => {
      setSelectedCategoryIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        const ids = Array.from(next);
        if (ids.length === 0) {
          loadData();
        } else {
          loadTechByCategory(ids);
        }
        return next;
      });
    },
    [loadTechByCategory, loadData]
  );

  const selectTech = useCallback((id: number) => {
    setDetailLoading(true);
    setSelectedTech(null);
    getTechById(id)
      .then(setSelectedTech)
      .catch(() => setSelectedTech(null))
      .finally(() => setDetailLoading(false));
  }, []);

  const filteredTechs = useMemo(() => {
    if (!filterName.trim()) return techs;
    const q = filterName.toLowerCase().trim();
    return techs.filter(
      (t) =>
        (t.label || "").toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q)
    );
  }, [techs, filterName]);

  return (
    <div className="flex h-[calc(100vh-8rem)] w-full flex-col">
      <h1 className="mb-4 shrink-0 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Технический радар
      </h1>

      <div className="mb-4 shrink-0">
        <TechDescriptionBar tech={selectedTech} loading={detailLoading} />
      </div>

      {error && (
        <div className="mb-4 shrink-0 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[240px_1fr]">
        {/* Категории и список технологий */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setCategoriesExpanded((e) => !e)}
            className="flex shrink-0 w-full items-center justify-between p-4 font-semibold text-zinc-900 dark:text-zinc-100"
          >
            Категории
            <span
              className="transition-transform"
              style={{ transform: categoriesExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
            >
              ▶
            </span>
          </button>
          {categoriesExpanded && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <input
                type="text"
                placeholder="Поиск технологий..."
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                className="mx-2 mb-2 shrink-0 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
                {categories.length === 0 ? (
                  <p className="py-2 text-sm text-zinc-500">Нет категорий</p>
                ) : (
                  <div className="space-y-2">
                    {categories.map((cat) => {
                      const techsInCategory = filteredTechs.filter((t) =>
                        t.category?.some((c) => c.id === cat.id)
                      );
                      const showCat = selectedCategoryIds.size === 0 || selectedCategoryIds.has(cat.id);
                      if (!showCat) return null;
                      return (
                        <div key={cat.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                            <input
                              type="checkbox"
                              checked={selectedCategoryIds.has(cat.id)}
                              onChange={() => toggleCategory(cat.id)}
                              className="rounded"
                            />
                            <span className="text-sm">{cat.name}</span>
                            <span className="ml-auto text-xs text-zinc-400">
                              ({techsInCategory.length})
                            </span>
                          </label>
                          <div className="ml-4 mt-1 space-y-0.5 border-l border-zinc-200 pl-2 dark:border-zinc-700">
                            {techsInCategory.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => selectTech(t.id)}
                                className={`block w-full text-left text-sm ${
                                  selectedTech?.id === t.id
                                    ? "font-medium text-amber-600 dark:text-amber-400"
                                    : "text-zinc-700 hover:underline dark:text-zinc-300"
                                }`}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {selectedCategoryIds.size === 0 &&
                      filteredTechs.filter((t) => !t.category?.length).length > 0 && (
                      <div>
                        <div className="mb-1 px-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          Вне категории
                        </div>
                        <div className="ml-4 space-y-0.5 border-l border-zinc-200 pl-2 dark:border-zinc-700">
                          {filteredTechs
                            .filter((t) => !t.category?.length)
                            .map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => selectTech(t.id)}
                                className={`block w-full text-left text-sm ${
                                  selectedTech?.id === t.id
                                    ? "font-medium text-amber-600 dark:text-amber-400"
                                    : "text-zinc-700 hover:underline dark:text-zinc-300"
                                }`}
                              >
                                {t.label}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Радар */}
        <div className="flex min-h-0 flex-col">
          {loading ? (
            <div className="flex min-h-[400px] flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-800/30">
              <span className="text-zinc-500">Загрузка…</span>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="relative w-full flex-1 overflow-hidden" style={{ minHeight: 400 }}>
                <div className="absolute inset-0">
                  <RadarWidget
                    techs={filteredTechs}
                    rings={rings}
                    sectors={sectors}
                    selectedId={selectedTech?.id ?? null}
                    onSelectTech={selectTech}
                  />
                </div>
              </div>
              <div className="mt-2 flex shrink-0 flex-wrap justify-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
                {rings.filter((r) => r.id !== 0).map((r) => (
                  <span key={r.id}>
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        r.name === "Adopt"
                          ? "bg-green-500"
                          : r.name === "Trial"
                            ? "bg-blue-500"
                            : r.name === "Assess"
                              ? "bg-amber-500"
                              : r.name === "Hold"
                                ? "bg-red-500"
                                : "bg-zinc-400"
                      }`}
                    />
                    {" "}
                    {r.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
