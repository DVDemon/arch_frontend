"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getTechList,
  getRings,
  getSectors,
  getCategories,
  createTech,
  updateTech,
  deleteTech,
} from "@/lib/techradar-api";
import type {
  TechRadarTech,
  TechRadarRing,
  TechRadarSector,
  TechRadarCategory,
  TechVersion,
} from "@/types/techradar";

type SortKey = "id" | "label" | "description" | "status" | "versions";

const IconVersions = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
  </svg>
);
const IconDescription = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);
const IconStatus = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);
const IconDelete = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

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

function VersionsModal({
  tech,
  onClose,
}: {
  tech: TechRadarTech;
  onClose: () => void;
}) {
  const versions = (tech.versions ?? []) as TechVersion[];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Версии: {tech.label}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>
        {versions.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400">Нет версий</p>
        ) : (
          <div className="space-y-2">
            {versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
              >
                <span className="font-mono text-sm">
                  {v.versionStart} — {v.versionEnd}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-sm ${getRingColorClasses(v.ring?.name)}`}
                >
                  {v.ring?.name ?? "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EditDescriptionModal({
  tech,
  onSave,
  onClose,
}: {
  tech: TechRadarTech;
  onSave: (description: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(tech.description ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(value);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Описание: {tech.label}
        </h3>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={5}
          className="mb-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-amber-600 px-4 py-2 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangeStatusModal({
  tech,
  rings,
  onSave,
  onClose,
}: {
  tech: TechRadarTech;
  rings: TechRadarRing[];
  onSave: (ringId: number) => Promise<void>;
  onClose: () => void;
}) {
  const [ringId, setRingId] = useState(tech.ring?.id ?? 0);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!ringId) return;
    setSaving(true);
    try {
      await onSave(ringId);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const activeRings = rings.filter((r) => r.id !== 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Статус: {tech.label}
        </h3>
        <select
          value={ringId}
          onChange={(e) => setRingId(Number(e.target.value))}
          className="mb-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <option value={0}>— Выберите —</option>
          {activeRings.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !ringId}
            className="rounded-lg bg-amber-600 px-4 py-2 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddTechModal({
  rings,
  sectors,
  categories,
  onSave,
  onClose,
}: {
  rings: TechRadarRing[];
  sectors: TechRadarSector[];
  categories: TechRadarCategory[];
  onSave: (payload: {
    label: string;
    descr?: string;
    sector_id?: number;
    ring_id?: number;
    categories?: { id: number }[];
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [descr, setDescr] = useState("");
  const [sectorId, setSectorId] = useState<number>(0);
  const [ringId, setRingId] = useState<number>(0);
  const [categoryIds, setCategoryIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const toggleCategory = (id: number) => {
    setCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await onSave({
        label: label.trim(),
        descr: descr.trim() || undefined,
        sector_id: sectorId || undefined,
        ring_id: ringId || undefined,
        categories: categoryIds.size > 0 ? Array.from(categoryIds).map((id) => ({ id })) : undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const activeRings = rings.filter((r) => r.id !== 0);
  const activeSectors = sectors.filter((s) => s.id !== 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Добавить технологию
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Название *
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Название технологии"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Описание
            </label>
            <textarea
              value={descr}
              onChange={(e) => setDescr(e.target.value)}
              rows={3}
              placeholder="Описание"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Статус (кольцо)
            </label>
            <select
              value={ringId}
              onChange={(e) => setRingId(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value={0}>— Выберите —</option>
              {activeRings.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Сектор
            </label>
            <select
              value={sectorId}
              onChange={(e) => setSectorId(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value={0}>— Выберите —</option>
              {activeSectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {categories.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Категории
              </label>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-600"
                  >
                    <input
                      type="checkbox"
                      checked={categoryIds.has(c.id)}
                      onChange={() => toggleCategory(c.id)}
                    />
                    <span>{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !label.trim()}
            className="rounded-lg bg-amber-600 px-4 py-2 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "Сохранение…" : "Добавить"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TechRadarEditPage() {
  const [techs, setTechs] = useState<TechRadarTech[]>([]);
  const [rings, setRings] = useState<TechRadarRing[]>([]);
  const [sectors, setSectors] = useState<TechRadarSector[]>([]);
  const [categories, setCategories] = useState<TechRadarCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("label");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterLabel, setFilterLabel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [versionsTech, setVersionsTech] = useState<TechRadarTech | null>(null);
  const [editDescTech, setEditDescTech] = useState<TechRadarTech | null>(null);
  const [changeStatusTech, setChangeStatusTech] = useState<TechRadarTech | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [techList, ringList, sectorList, catList] = await Promise.all([
        getTechList(false),
        getRings(),
        getSectors(),
        getCategories(),
      ]);
      setTechs(techList);
      setRings(ringList);
      setSectors(sectorList);
      setCategories(catList);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredAndSorted = useMemo(() => {
    let list = [...techs];
    if (filterLabel.trim()) {
      const q = filterLabel.toLowerCase().trim();
      list = list.filter(
        (t) =>
          (t.label || "").toLowerCase().includes(q) ||
          (t.description || "").toLowerCase().includes(q) ||
          String(t.id).includes(q)
      );
    }
    if (filterStatus.trim()) {
      const q = filterStatus.toLowerCase().trim();
      list = list.filter((t) => (t.ring?.name || "").toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      switch (sortKey) {
        case "id":
          av = a.id;
          bv = b.id;
          break;
        case "label":
          av = a.label ?? "";
          bv = b.label ?? "";
          break;
        case "description":
          av = a.description ?? "";
          bv = b.description ?? "";
          break;
        case "status":
          av = a.ring?.name ?? "";
          bv = b.ring?.name ?? "";
          break;
        case "versions":
          av = (a.versions?.length ?? 0) as number;
          bv = (b.versions?.length ?? 0) as number;
          break;
        default:
          av = "";
          bv = "";
      }
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [techs, filterLabel, filterStatus, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Удалить технологию?")) return;
    setDeletingId(id);
    try {
      await deleteTech(id);
      setTechs((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка удаления");
    } finally {
      setDeletingId(null);
    }
  };

  const buildFullPayload = useCallback(
    (tech: TechRadarTech, partial: { descr?: string; ring_id?: number }) => {
      const defaultRingId = rings.find((r) => r.id !== 0)?.id;
      const defaultSectorId = sectors.find((s) => s.id !== 0)?.id;
      return {
        label: tech.label ?? "",
        ring_id: partial.ring_id ?? tech.ring?.id ?? defaultRingId ?? 0,
        sector_id: tech.sector?.id ?? defaultSectorId ?? 0,
        descr: partial.descr ?? tech.description,
        link: tech.link,
        review: tech.review,
        isCritical: tech.isCritical,
        categories: tech.category?.map((c) => ({ id: c.id })) ?? [],
        ...partial,
      };
    },
    [rings, sectors]
  );

  const handleSaveDescription = async (tech: TechRadarTech, description: string) => {
    const payload = buildFullPayload(tech, { descr: description });
    await updateTech(tech.id, payload);
    setTechs((prev) =>
      prev.map((t) => (t.id === tech.id ? { ...t, description } : t))
    );
  };

  const handleSaveStatus = async (tech: TechRadarTech, ringId: number) => {
    const payload = buildFullPayload(tech, { ring_id: ringId });
    await updateTech(tech.id, payload);
    const ring = rings.find((r) => r.id === ringId);
    setTechs((prev) =>
      prev.map((t) => (t.id === tech.id ? { ...t, ring } : t))
    );
  };

  const handleAddTech = async (payload: {
    label: string;
    descr?: string;
    sector_id?: number;
    ring_id?: number;
    categories?: { id: number }[];
  }) => {
    const result = await createTech(payload);
    if (result?.length) {
      await loadData();
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) =>
    sortKey === column ? (
      <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
    ) : null;

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/tech-radar"
            className="text-amber-600 hover:underline dark:text-amber-400"
          >
            ← Технический радар
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Редактирование технологий
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="rounded-lg bg-amber-600 px-4 py-2 text-white hover:bg-amber-700"
        >
          + Добавить технологию
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:flex-wrap">
          <input
            type="text"
            placeholder="Фильтр по коду, названию, описанию…"
            value={filterLabel}
            onChange={(e) => setFilterLabel(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-400"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">Все статусы</option>
            {rings
              .filter((r) => r.id !== 0)
              .map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
          </select>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Показано: {filteredAndSorted.length} из {techs.length}
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          {loading ? (
            <div className="flex h-48 items-center justify-center text-zinc-500">
              Загрузка…
            </div>
          ) : (
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort("id")}
                      className="flex items-center font-semibold text-zinc-900 hover:text-amber-600 dark:text-zinc-100 dark:hover:text-amber-400"
                    >
                      Код
                      <SortIcon column="id" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort("label")}
                      className="flex items-center font-semibold text-zinc-900 hover:text-amber-600 dark:text-zinc-100 dark:hover:text-amber-400"
                    >
                      Название
                      <SortIcon column="label" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort("description")}
                      className="flex items-center font-semibold text-zinc-900 hover:text-amber-600 dark:text-zinc-100 dark:hover:text-amber-400"
                    >
                      Описание
                      <SortIcon column="description" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort("versions")}
                      className="flex items-center font-semibold text-zinc-900 hover:text-amber-600 dark:text-zinc-100 dark:hover:text-amber-400"
                    >
                      Версии
                      <SortIcon column="versions" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort("status")}
                      className="flex items-center font-semibold text-zinc-900 hover:text-amber-600 dark:text-zinc-100 dark:hover:text-amber-400"
                    >
                      Статус
                      <SortIcon column="status" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400"
                    >
                      {techs.length === 0
                        ? "Нет технологий"
                        : "Нет совпадений по фильтру"}
                    </td>
                  </tr>
                ) : (
                  filteredAndSorted.map((tech) => (
                    <tr
                      key={tech.id}
                      className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    >
                      <td className="px-4 py-2 font-mono text-sm">{tech.id}</td>
                      <td className="px-4 py-2 font-medium">{tech.label || "—"}</td>
                      <td className="max-w-xs truncate px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400">
                        {tech.description || "—"}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => setVersionsTech(tech)}
                          className="text-amber-600 hover:underline dark:text-amber-400"
                        >
                          {(tech.versions?.length ?? 0)} верс.
                        </button>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-sm ${getRingColorClasses(tech.ring?.name)}`}
                        >
                          {tech.ring?.name ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setVersionsTech(tech)}
                            className="rounded p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            title="Версии"
                          >
                            <IconVersions />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditDescTech(tech)}
                            className="rounded p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            title="Описание"
                          >
                            <IconDescription />
                          </button>
                          <button
                            type="button"
                            onClick={() => setChangeStatusTech(tech)}
                            className="rounded p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            title="Статус"
                          >
                            <IconStatus />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(tech.id)}
                            disabled={deletingId === tech.id}
                            className="rounded p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 disabled:opacity-50"
                            title="Удалить"
                          >
                            {deletingId === tech.id ? (
                              <span className="text-xs">…</span>
                            ) : (
                              <IconDelete />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {versionsTech && (
        <VersionsModal
          tech={versionsTech}
          onClose={() => setVersionsTech(null)}
        />
      )}
      {editDescTech && (
        <EditDescriptionModal
          tech={editDescTech}
          onSave={(d) => handleSaveDescription(editDescTech, d)}
          onClose={() => setEditDescTech(null)}
        />
      )}
      {changeStatusTech && rings.length > 0 && (
        <ChangeStatusModal
          tech={changeStatusTech}
          rings={rings}
          onSave={(ringId) => handleSaveStatus(changeStatusTech, ringId)}
          onClose={() => setChangeStatusTech(null)}
        />
      )}
      {showAddModal && (
        <AddTechModal
          rings={rings}
          sectors={sectors}
          categories={categories}
          onSave={handleAddTech}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
