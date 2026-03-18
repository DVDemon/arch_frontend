"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getProductsAdmin,
  deleteProductByAlias,
  updateProduct,
} from "@/lib/products-api";
import type { Product } from "@/types/product";

type SortKey = "alias" | "name" | "structurizrApiUrl";
type SortDir = "asc" | "desc";

function AddProductModal({
  onSave,
  onClose,
  existingAliases,
}: {
  onSave: (payload: { alias: string; name: string; description?: string }) => Promise<void>;
  onClose: () => void;
  existingAliases: string[];
}) {
  const [alias, setAlias] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aliasLower = alias.toLowerCase().trim();
  const aliasExists = existingAliases.some((a) => a.toLowerCase() === aliasLower);
  const canSave = alias.trim().length > 0 && name.trim().length > 0 && !aliasExists;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        alias: alias.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
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
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Добавить продукт
        </h3>
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Код (alias) *
            </label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="my-product"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              required
            />
            {aliasExists && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                Продукт с таким кодом уже существует
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Название *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название продукта"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Описание
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Описание продукта"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving || !canSave}
              className="rounded-lg bg-amber-600 px-4 py-2 text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? "Сохранение…" : "Добавить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("alias");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProductsAdmin();
      setProducts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filteredAndSorted = useMemo(() => {
    let list = [...products];
    if (filter.trim()) {
      const f = filter.toLowerCase().trim();
      list = list.filter(
        (p) =>
          (p.alias || "").toLowerCase().includes(f) ||
          (p.name || "").toLowerCase().includes(f) ||
          (p.structurizrApiUrl || "").toLowerCase().includes(f)
      );
    }
    list.sort((a, b) => {
      const av = (a[sortKey] ?? "") as string;
      const bv = (b[sortKey] ?? "") as string;
      const cmp = av.localeCompare(bv, undefined, { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [products, filter, sortKey, sortDir]);

  const handleAddProduct = async (payload: {
    alias: string;
    name: string;
    description?: string;
  }) => {
    await updateProduct(payload);
    await loadProducts();
  };

  const handleDelete = async (p: Product) => {
    if (!confirm(`Удалить продукт «${p.name || p.alias}»?`)) return;
    setDeletingId(p.id);
    setDeleteError(null);
    try {
      await deleteProductByAlias(p.alias || String(p.id));
      setProducts((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      setDeleteError(
        e instanceof Error ? e.message : "Удаление недоступно (API не реализован)"
      );
    } finally {
      setDeletingId(null);
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) =>
    sortKey === column ? (
      <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
    ) : null;

  return (
    <div className="w-full">
      <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Каталог продуктов
      </h1>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      {deleteError && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {deleteError}
        </div>
      )}

      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:flex-wrap">
        <input
          type="text"
          placeholder="Фильтр по коду, имени, structurizrApiUrl..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-400"
        />
        <button
          onClick={loadProducts}
          disabled={loading}
          className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {loading ? "Загрузка…" : "Обновить"}
        </button>
        <button
          onClick={() => setShowAddModal(true)}
          className="rounded-lg bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"
        >
          + Добавить продукт
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort("alias")}
                  className="flex items-center font-semibold text-zinc-900 hover:text-amber-600 dark:text-zinc-100 dark:hover:text-amber-400"
                >
                  Код
                  <SortIcon column="alias" />
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort("name")}
                  className="flex items-center font-semibold text-zinc-900 hover:text-amber-600 dark:text-zinc-100 dark:hover:text-amber-400"
                >
                  Имя продукта
                  <SortIcon column="name" />
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort("structurizrApiUrl")}
                  className="flex items-center font-semibold text-zinc-900 hover:text-amber-600 dark:text-zinc-100 dark:hover:text-amber-400"
                >
                  structurizrApiUrl
                  <SortIcon column="structurizrApiUrl" />
                </button>
              </th>
              <th className="w-32 px-4 py-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400"
                >
                  {loading ? "Загрузка…" : "Нет продуктов"}
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-zinc-100 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/products/${p.alias || p.id}`}
                      className="font-medium text-amber-600 hover:underline dark:text-amber-400"
                    >
                      {p.alias || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">
                    {p.name || "—"}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {p.structurizrApiUrl ? (
                      <a
                        href={p.structurizrApiUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-600 hover:underline dark:text-amber-400"
                      >
                        {p.structurizrApiUrl}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/products/${p.alias || p.id}`}
                        className="rounded px-2 py-1 text-sm text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                      >
                        Подробнее
                      </Link>
                      <button
                        onClick={() => handleDelete(p)}
                        disabled={deletingId === p.id}
                        className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        {deletingId === p.id ? "…" : "Удалить"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <AddProductModal
          onSave={handleAddProduct}
          onClose={() => setShowAddModal(false)}
          existingAliases={products.map((p) => p.alias || "").filter(Boolean)}
        />
      )}
    </div>
  );
}
