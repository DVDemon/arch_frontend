"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BpmnDropzone } from "@/components/cx/bpmn-dropzone";
import { uploadCjBpmnDocument } from "@/lib/document-api";
import { getProducts, getProductsAdmin } from "@/lib/products-api";
import {
  createBi,
  createCj,
  deleteBi,
  deleteCj,
  getBiList,
  getCjList,
  importCjFromBpmnCreate,
  updateBi,
  updateCj,
} from "@/lib/cx-api";
import type { BiItem, CjItem } from "@/types/cx";
import type { Product } from "@/types/product";

type CjSortKey = "id" | "name" | "id_product" | "draft";
type BiSortKey = "id" | "name" | "productId" | "draft";

function getCjProductId(item: CjItem): number | undefined {
  return item.id_product ?? item.productId ?? item.idProductExt;
}

function getCjDraft(item: CjItem): boolean {
  return Boolean(item.draft ?? item.bDraft);
}

function getCjPortrait(item: CjItem): string {
  return item.user_portrait ?? item.userPortrait ?? "";
}

function getCjAuthorId(item: CjItem): number | undefined {
  return item.authorId ?? item.id_user_profile;
}

function getBiProductId(item: BiItem): number | undefined {
  return item.productId ?? item.id_product ?? item.idProductExt;
}

function compare(a: string | number | boolean, b: string | number | boolean) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
}

function AddCjModal({
  open,
  onClose,
  saving,
  productsLoading,
  products,
  cjNamesLower,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  saving: boolean;
  productsLoading: boolean;
  products: Product[];
  /** Уже существующие названия CJ (нижний регистр) для проверки уникальности. */
  cjNamesLower: Set<string>;
  onSubmit: (payload: {
    name: string;
    productId: number;
    userPortrait?: string;
    bpmnFile?: File | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [productId, setProductId] = useState("");
  const [userPortrait, setUserPortrait] = useState("");
  const [bpmnFile, setBpmnFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || products.length !== 1) return;
    setProductId(String(products[0].id));
  }, [open, products]);

  if (!open) return null;

  const handleSubmit = async () => {
    const parsedProductId = Number(productId);
    if (!name.trim()) {
      setFormError("Введите название CJ.");
      return;
    }
    const key = name.trim().toLowerCase();
    if (cjNamesLower.has(key)) {
      setFormError("Название CJ должно быть уникальным.");
      return;
    }
    if (!Number.isFinite(parsedProductId) || parsedProductId <= 0) {
      setFormError("Выберите продукт из списка.");
      return;
    }
    setFormError(null);
    try {
      await onSubmit({
        name: name.trim(),
        productId: parsedProductId,
        userPortrait: userPortrait.trim() || undefined,
        bpmnFile,
      });
      setName("");
      setProductId("");
      setUserPortrait("");
      setBpmnFile(null);
      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Не удалось создать CJ.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold text-zinc-900 dark:text-zinc-100">Добавить CJ</h3>
        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название CJ"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <select
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              if (formError) setFormError(null);
            }}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">Выберите продукт</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (ID: {p.id})
              </option>
            ))}
          </select>
          {productsLoading && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Загрузка списка продуктов...
            </p>
          )}
          {!productsLoading && products.length === 0 && (
            <div className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
              <p>Нет доступных продуктов для создания CJ.</p>
              <p className="text-zinc-500 dark:text-zinc-400">
                Если API вызывается без авторизации, products-service ждёт заголовок user-id: задайте в
                .env.local переменные NEXT_PUBLIC_USER_ID и при необходимости NEXT_PUBLIC_USER_ROLES.
              </p>
            </div>
          )}
          <input
            value={userPortrait}
            onChange={(e) => {
              setUserPortrait(e.target.value);
              if (formError) setFormError(null);
            }}
            placeholder="User portrait (опц.)"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">BPMN (опционально)</p>
            <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
              Пример файла:{" "}
              <a
                href="/example.bpmn"
                download="example.bpmn"
                className="text-amber-700 underline hover:text-amber-800 dark:text-amber-400"
              >
                скачать example.bpmn
              </a>
            </p>
            <BpmnDropzone
              file={bpmnFile}
              onFile={setBpmnFile}
              onInvalidExtension={() =>
                setFormError("Ошибка обработки файла: нужен файл с расширением .bpmn.")
              }
              disabled={saving}
            />
            {bpmnFile && (
              <button
                type="button"
                className="mt-2 text-xs text-zinc-600 underline dark:text-zinc-400"
                onClick={() => setBpmnFile(null)}
              >
                Убрать файл
              </button>
            )}
          </div>
          {formError && (
            <p className="text-sm text-red-700 dark:text-red-300">{formError}</p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || productsLoading || !name.trim() || !productId.trim() || products.length === 0}
            className="rounded-lg bg-amber-600 px-4 py-2 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "Сохранение..." : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditCjModal({
  onClose,
  saving,
  products,
  cj,
  onSubmit,
}: {
  onClose: () => void;
  saving: boolean;
  products: Product[];
  cj: CjItem;
  onSubmit: (payload: { id: number; name: string; userPortrait?: string; draft: boolean; tags?: string[] }) => Promise<void>;
}) {
  const [name, setName] = useState(cj.name || "");
  const [userPortrait, setUserPortrait] = useState(getCjPortrait(cj));
  const [draft, setDraft] = useState(getCjDraft(cj));
  const [tagsText, setTagsText] = useState((cj.tags || []).join(", "));
  const [formError, setFormError] = useState<string | null>(null);

  const productId = getCjProductId(cj);
  const productName = productId ? products.find((p) => p.id === productId)?.name : undefined;

  const handleSubmit = async () => {
    if (!name.trim()) {
      setFormError("Введите название CJ.");
      return;
    }
    setFormError(null);
    try {
      await onSubmit({
        id: cj.id,
        name: name.trim(),
        userPortrait: userPortrait.trim() || undefined,
        draft,
        tags: tagsText
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Не удалось обновить CJ.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold text-zinc-900 dark:text-zinc-100">Редактировать CJ</h3>
        <div className="space-y-3">
          <input
            value={cj.uniqueIdent || "—"}
            readOnly
            className="w-full cursor-not-allowed rounded border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название CJ"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            value={productName ? `${productName}${productId ? ` (ID: ${productId})` : ""}` : productId ? `ID: ${productId}` : "—"}
            readOnly
            className="w-full cursor-not-allowed rounded border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          />
          <input
            value={userPortrait}
            onChange={(e) => setUserPortrait(e.target.value)}
            placeholder="User portrait (опц.)"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="Теги через запятую (опц.)"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
            Черновик
          </label>
          <input
            value={`BPMN: ${cj.bpmn ? "Да" : "Нет"}`}
            readOnly
            className="w-full cursor-not-allowed rounded border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          />
          <input
            value={`Создан: ${cj.createdDate || "—"}`}
            readOnly
            className="w-full cursor-not-allowed rounded border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          />
          <input
            value={`Обновлен: ${cj.lastModifiedDate || "—"}`}
            readOnly
            className="w-full cursor-not-allowed rounded border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          />
          {formError && <p className="text-sm text-red-700 dark:text-red-300">{formError}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !name.trim()}
            className="rounded-lg bg-amber-600 px-4 py-2 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddBiModal({
  open,
  onClose,
  saving,
  productsLoading,
  products,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  saving: boolean;
  productsLoading: boolean;
  products: Product[];
  onSubmit: (payload: { name: string; productId: number; descr?: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [productId, setProductId] = useState("");
  const [descr, setDescr] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async () => {
    const parsedProductId = Number(productId);
    if (!name.trim()) {
      setFormError("Введите название BI.");
      return;
    }
    if (!Number.isFinite(parsedProductId) || parsedProductId <= 0) {
      setFormError("Выберите продукт из списка.");
      return;
    }
    setFormError(null);
    try {
      await onSubmit({
        name: name.trim(),
        productId: parsedProductId,
        descr: descr.trim() || undefined,
      });
      setName("");
      setProductId("");
      setDescr("");
      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Не удалось создать BI.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold text-zinc-900 dark:text-zinc-100">Добавить BI</h3>
        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название BI"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <select
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              if (formError) setFormError(null);
            }}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">Выберите продукт</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (ID: {p.id})
              </option>
            ))}
          </select>
          {productsLoading && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Загрузка списка продуктов...</p>
          )}
          {!productsLoading && products.length === 0 && (
            <div className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
              <p>Нет доступных продуктов для создания BI.</p>
              <p className="text-zinc-500 dark:text-zinc-400">
                Без JWT задайте NEXT_PUBLIC_USER_ID (и при необходимости NEXT_PUBLIC_USER_ROLES) в .env.local.
              </p>
            </div>
          )}
          <input
            value={descr}
            onChange={(e) => {
              setDescr(e.target.value);
              if (formError) setFormError(null);
            }}
            placeholder="Описание (опц.)"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          {formError && <p className="text-sm text-red-700 dark:text-red-300">{formError}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || productsLoading || !name.trim() || !productId.trim() || products.length === 0}
            className="rounded-lg bg-amber-600 px-4 py-2 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "Сохранение..." : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditBiModal({
  onClose,
  saving,
  productsLoading,
  products,
  bi,
  onSubmit,
}: {
  onClose: () => void;
  saving: boolean;
  productsLoading: boolean;
  products: Product[];
  bi: BiItem;
  onSubmit: (payload: {
    id: number;
    name: string;
    productId: number;
    descr?: string;
    draft?: boolean;
    communal?: boolean;
    target?: boolean;
    touchPoints?: string;
    eaGuid?: string;
    ownerRole?: string;
    metrics?: string;
    clientScenario?: string;
    ucsReaction?: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(bi.name || "");
  const [productId, setProductId] = useState(() => {
    const pid = getBiProductId(bi);
    return pid ? String(pid) : "";
  });
  const [descr, setDescr] = useState(bi.descr || "");
  const [draft, setDraft] = useState(Boolean(bi.isDraft ?? bi.draft));
  const [communal, setCommunal] = useState(Boolean(bi.isCommunal));
  const [target, setTarget] = useState(Boolean(bi.isTarget));
  const [touchPoints, setTouchPoints] = useState(bi.touchPoints || "");
  const [eaGuid, setEaGuid] = useState(bi.eaGuid || "");
  const [ownerRole, setOwnerRole] = useState(bi.ownerRole || "");
  const [metrics, setMetrics] = useState(bi.metrics || "");
  const [clientScenario, setClientScenario] = useState(bi.clientScenario || "");
  const [ucsReaction, setUcsReaction] = useState(bi.ucsReaction || "");
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const parsedProductId = Number(productId);
    if (!name.trim()) {
      setFormError("Введите название BI.");
      return;
    }
    if (!Number.isFinite(parsedProductId) || parsedProductId <= 0) {
      setFormError("Выберите продукт из списка.");
      return;
    }
    setFormError(null);
    try {
      await onSubmit({
        id: bi.id,
        name: name.trim(),
        productId: parsedProductId,
        descr: descr.trim() || undefined,
        draft,
        communal,
        target,
        touchPoints: touchPoints.trim() || undefined,
        eaGuid: eaGuid.trim() || undefined,
        ownerRole: ownerRole.trim() || undefined,
        metrics: metrics.trim() || undefined,
        clientScenario: clientScenario.trim() || undefined,
        ucsReaction: ucsReaction.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Не удалось обновить BI.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold text-zinc-900 dark:text-zinc-100">Редактировать BI</h3>
        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название BI"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">Выберите продукт</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (ID: {p.id})
              </option>
            ))}
          </select>
          <input
            value={descr}
            onChange={(e) => setDescr(e.target.value)}
            placeholder="Описание (опц.)"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            value={ownerRole}
            onChange={(e) => setOwnerRole(e.target.value)}
            placeholder="Роль владельца (ownerRole)"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            value={metrics}
            onChange={(e) => setMetrics(e.target.value)}
            placeholder="Метрики (metrics)"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            value={touchPoints}
            onChange={(e) => setTouchPoints(e.target.value)}
            placeholder="Touch points"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            value={eaGuid}
            onChange={(e) => setEaGuid(e.target.value)}
            placeholder="EA GUID"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            value={clientScenario}
            onChange={(e) => setClientScenario(e.target.value)}
            placeholder="Client scenario"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            value={ucsReaction}
            onChange={(e) => setUcsReaction(e.target.value)}
            placeholder="UCS reaction"
            className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={communal} onChange={(e) => setCommunal(e.target.checked)} />
            Коммунальный (isCommunal)
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={target} onChange={(e) => setTarget(e.target.checked)} />
            Target (isTarget)
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
            Черновик
          </label>
          {formError && <p className="text-sm text-red-700 dark:text-red-300">{formError}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || productsLoading || !name.trim() || !productId.trim() || products.length === 0}
            className="rounded-lg bg-amber-600 px-4 py-2 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CxPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"cj" | "bi">("cj");
  const [cjList, setCjList] = useState<CjItem[]>([]);
  const [biList, setBiList] = useState<BiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cjSearch, setCjSearch] = useState("");
  const [biSearch, setBiSearch] = useState("");
  const [cjSortKey, setCjSortKey] = useState<CjSortKey>("id");
  const [cjSortDir, setCjSortDir] = useState<"asc" | "desc">("asc");
  const [biSortKey, setBiSortKey] = useState<BiSortKey>("id");
  const [biSortDir, setBiSortDir] = useState<"asc" | "desc">("asc");

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  const [showAddCjModal, setShowAddCjModal] = useState(false);
  const [showAddBiModal, setShowAddBiModal] = useState(false);
  const [editingCj, setEditingCj] = useState<CjItem | null>(null);
  const [editingBi, setEditingBi] = useState<BiItem | null>(null);

  const loadAvailableProducts = useCallback(async () => {
    setProductsLoading(true);
    let userList: Product[] = [];
    let adminList: Product[] = [];

    try {
      userList = await getProducts();
    } catch {
      userList = [];
    }

    // Всегда запрашиваем и user, и admin: разные окружения отдают полный список по-разному;
    // при отсутствии JWT оба могут упасть — тогда нужны NEXT_PUBLIC_USER_ID / USER_ROLES в env.
    try {
      adminList = await getProductsAdmin();
    } catch {
      adminList = [];
    }

    const merged = [...userList, ...adminList];
    const byId = new Map<number, Product>();
    for (const p of merged) {
      const id = Number(p.id);
      if (Number.isFinite(id) && id > 0 && !byId.has(id)) {
        byId.set(id, p);
      }
    }

    const normalized = Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
    setProducts(normalized);
    setProductsLoading(false);
  }, []);

  const loadCjData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cj = await getCjList();
      setCjList(cj);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки CJ");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBiData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bi = await getBiList();
      setBiList(bi);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки BI");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "cj") {
      void loadCjData();
    } else {
      void loadBiData();
    }
  }, [activeTab, loadBiData, loadCjData]);

  useEffect(() => {
    void loadAvailableProducts();
  }, [loadAvailableProducts]);

  const cjNamesLower = useMemo(() => {
    const s = new Set<string>();
    for (const c of cjList) {
      const n = (c.name || "").trim().toLowerCase();
      if (n) s.add(n);
    }
    return s;
  }, [cjList]);

  const filteredCj = useMemo(() => {
    const q = cjSearch.trim().toLowerCase();
    const list = q
      ? cjList.filter(
          (x) =>
            String(x.id).includes(q) ||
            (x.name || "").toLowerCase().includes(q) ||
            getCjPortrait(x).toLowerCase().includes(q) ||
            (x.uniqueIdent || "").toLowerCase().includes(q) ||
            String(getCjProductId(x) ?? "").includes(q) ||
            (products.find((p) => p.id === getCjProductId(x))?.name || "").toLowerCase().includes(q),
        )
      : [...cjList];
    list.sort((a, b) => {
      let av: string | number | boolean = "";
      let bv: string | number | boolean = "";
      if (cjSortKey === "id") {
        av = a.id;
        bv = b.id;
      } else if (cjSortKey === "name") {
        av = a.name || "";
        bv = b.name || "";
      } else if (cjSortKey === "id_product") {
        av = getCjProductId(a) || 0;
        bv = getCjProductId(b) || 0;
      } else if (cjSortKey === "draft") {
        av = getCjDraft(a);
        bv = getCjDraft(b);
      }
      const res = compare(av, bv);
      return cjSortDir === "asc" ? res : -res;
    });
    return list;
  }, [cjList, cjSearch, cjSortDir, cjSortKey, products]);

  const productNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of products) map.set(p.id, p.name);
    return map;
  }, [products]);

  const filteredBi = useMemo(() => {
    const q = biSearch.trim().toLowerCase();
    const list = q
      ? biList.filter(
          (x) =>
            String(x.id).includes(q) ||
            (x.name || "").toLowerCase().includes(q) ||
            (x.descr || "").toLowerCase().includes(q) ||
            String(getBiProductId(x) ?? "").includes(q) ||
            (products.find((p) => p.id === getBiProductId(x))?.name || "").toLowerCase().includes(q),
        )
      : [...biList];
    list.sort((a, b) => {
      let av: string | number | boolean = "";
      let bv: string | number | boolean = "";
      if (biSortKey === "id") {
        av = a.id;
        bv = b.id;
      } else if (biSortKey === "name") {
        av = a.name || "";
        bv = b.name || "";
      } else if (biSortKey === "productId") {
        av = getBiProductId(a) || 0;
        bv = getBiProductId(b) || 0;
      } else if (biSortKey === "draft") {
        av = Boolean(a.isDraft ?? a.draft);
        bv = Boolean(b.isDraft ?? b.draft);
      }
      const res = compare(av, bv);
      return biSortDir === "asc" ? res : -res;
    });
    return list;
  }, [biList, biSearch, biSortDir, biSortKey, products]);

  const handleCreateCjFromModal = async (payload: {
    name: string;
    productId: number;
    userPortrait?: string;
    bpmnFile?: File | null;
  }) => {
    setSaving(true);
    setError(null);
    try {
      const created = await createCj(payload.productId, {
        name: payload.name,
        user_portrait: payload.userPortrait,
        draft: true,
      });
      const cjId = created.id;
      if (payload.bpmnFile && cjId) {
        try {
          await uploadCjBpmnDocument(cjId, payload.bpmnFile);
          await importCjFromBpmnCreate(cjId);
        } catch (bpmnErr) {
          const msg =
            bpmnErr instanceof Error ? bpmnErr.message : "ошибка BPMN";
          const is503 =
            typeof msg === "string" && (msg.includes("503") || msg.includes("Service Unavailable"));
          setError(
            is503
              ? "CJ создан. BPMN файл не прикреплён (сервис документов недоступен), попробуйте ещё раз на странице CJ."
              : `CJ создан. BPMN файл не разобран (${msg}). Откройте карточку CJ и повторите импорт.`,
          );
          await loadCjData();
          router.push(`/cx/${cjId}`);
          return;
        }
      }
      await loadCjData();
      router.push(`/cx/${cjId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка создания CJ");
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateCjFromModal = async (payload: {
    id: number;
    name: string;
    userPortrait?: string;
    draft: boolean;
    tags?: string[];
  }) => {
    setSaving(true);
    setError(null);
    try {
      await updateCj(payload.id, {
        name: payload.name,
        user_portrait: payload.userPortrait,
        draft: payload.draft,
        tags: payload.tags,
      });
      await loadCjData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка изменения CJ");
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCj = async (id: number) => {
    if (!confirm("Удалить CJ?")) return;
    setDeletingId(id);
    setError(null);
    try {
      await deleteCj(id);
      setCjList((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка удаления CJ");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateBiFromModal = async (payload: {
    name: string;
    productId: number;
    descr?: string;
  }) => {
    setSaving(true);
    setError(null);
    try {
      await createBi({
        name: payload.name,
        descr: payload.descr,
        productId: payload.productId,
        draft: true,
      });
      await loadBiData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка создания BI");
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateBiFromModal = async (payload: {
    id: number;
    name: string;
    productId: number;
    descr?: string;
    draft?: boolean;
    communal?: boolean;
    target?: boolean;
    touchPoints?: string;
    eaGuid?: string;
    ownerRole?: string;
    metrics?: string;
    clientScenario?: string;
    ucsReaction?: string;
  }) => {
    setSaving(true);
    setError(null);
    try {
      await updateBi(payload.id, {
        name: payload.name,
        descr: payload.descr,
        productId: payload.productId,
        draft: payload.draft ?? true,
        communal: payload.communal,
        target: payload.target,
        touchPoints: payload.touchPoints,
        eaGuid: payload.eaGuid,
        ownerRole: payload.ownerRole,
        metrics: payload.metrics,
        clientScenario: payload.clientScenario,
        ucsReaction: payload.ucsReaction,
      });
      await loadBiData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка изменения BI");
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBi = async (id: number) => {
    if (!confirm("Удалить BI?")) return;
    setDeletingId(id);
    setError(null);
    try {
      await deleteBi(id);
      setBiList((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка удаления BI");
    } finally {
      setDeletingId(null);
    }
  };

  const sortLabel = (active: boolean, dir: "asc" | "desc") => (active ? (dir === "asc" ? " ↑" : " ↓") : "");

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">CX</h1>
        <div className="inline-flex rounded-lg border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setActiveTab("cj")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "cj"
                ? "bg-amber-500 text-white"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            CJ
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bi")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === "bi"
                ? "bg-amber-500 text-white"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            BI
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-6">
        {activeTab === "cj" && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">CJ</h2>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {filteredCj.length} из {cjList.length}
            </span>
          </div>

          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddCjModal(true)}
              disabled={saving}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              + Добавить CJ
            </button>
            <input
              value={cjSearch}
              onChange={(e) => setCjSearch(e.target.value)}
              placeholder="Фильтр CJ..."
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            {loading ? (
              <div className="p-8 text-center text-sm text-zinc-500">Загрузка…</div>
            ) : (
              <table className="w-full min-w-[1520px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700">
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setCjSortKey("id")} className="font-semibold">
                        ID{sortLabel(cjSortKey === "id", cjSortDir)}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left">Карточка</th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setCjSortKey("name")} className="font-semibold">
                        Название{sortLabel(cjSortKey === "name", cjSortDir)}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left">Код</th>
                    <th className="px-3 py-2 text-left">User Portrait</th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setCjSortKey("id_product")} className="font-semibold">
                        Продукт{sortLabel(cjSortKey === "id_product", cjSortDir)}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left">BPMN</th>
                    <th className="px-3 py-2 text-left">Автор ID</th>
                    <th className="px-3 py-2 text-left">Создан</th>
                    <th className="px-3 py-2 text-left">Обновлен</th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setCjSortKey("draft")} className="font-semibold">
                        Draft{sortLabel(cjSortKey === "draft", cjSortDir)}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCj.map((x) => (
                    <tr key={x.id} className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="px-3 py-2 font-mono">{x.id}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/cx/${x.id}`}
                          className="text-amber-700 underline hover:text-amber-800 dark:text-amber-400"
                        >
                          Открыть
                        </Link>
                      </td>
                      <td className="px-3 py-2">{x.name || "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{x.uniqueIdent || "—"}</td>
                      <td className="px-3 py-2">{getCjPortrait(x) || "—"}</td>
                      <td className="px-3 py-2">
                        {(() => {
                          const pid = getCjProductId(x);
                          if (!pid) return "—";
                          const pname = productNameById.get(pid);
                          return pname ? `${pname} (ID: ${pid})` : `ID: ${pid}`;
                        })()}
                      </td>
                      <td className="px-3 py-2">{x.bpmn ? "Да" : "Нет"}</td>
                      <td className="px-3 py-2">{getCjAuthorId(x) ?? "—"}</td>
                      <td className="px-3 py-2">{x.createdDate || "—"}</td>
                      <td className="px-3 py-2">{x.lastModifiedDate || "—"}</td>
                      <td className="px-3 py-2">{getCjDraft(x) ? "Да" : "Нет"}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setEditingCj(x)} className="rounded border px-2 py-1">
                            Изменить
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCj(x.id)}
                            disabled={deletingId === x.id}
                            className="rounded border border-red-300 px-2 py-1 text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-300"
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredCj.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-3 py-6 text-center text-zinc-500">
                        Нет данных
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setCjSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="rounded border px-2 py-1 text-xs"
            >
              Порядок: {cjSortDir === "asc" ? "A-Z" : "Z-A"}
            </button>
          </div>
        </section>
        )}

        {activeTab === "bi" && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">BI</h2>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {filteredBi.length} из {biList.length}
            </span>
          </div>

          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddBiModal(true)}
              disabled={saving}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              + Добавить BI
            </button>
            <input
              value={biSearch}
              onChange={(e) => setBiSearch(e.target.value)}
              placeholder="Фильтр BI..."
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            {loading ? (
              <div className="p-8 text-center text-sm text-zinc-500">Загрузка…</div>
            ) : (
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700">
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setBiSortKey("id")} className="font-semibold">
                        ID{sortLabel(biSortKey === "id", biSortDir)}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setBiSortKey("name")} className="font-semibold">
                        Название{sortLabel(biSortKey === "name", biSortDir)}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left">Код</th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setBiSortKey("productId")} className="font-semibold">
                        Продукт{sortLabel(biSortKey === "productId", biSortDir)}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left">Статус</th>
                    <th className="px-3 py-2 text-left">Owner Role</th>
                    <th className="px-3 py-2 text-left">Metrics</th>
                    <th className="px-3 py-2 text-left">Touch Points</th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setBiSortKey("draft")} className="font-semibold">
                        Draft{sortLabel(biSortKey === "draft", biSortDir)}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBi.map((x) => (
                    <tr key={x.id} className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="px-3 py-2 font-mono">{x.id}</td>
                      <td className="px-3 py-2">{x.name || "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{x.uniqueIdent || "—"}</td>
                      <td className="px-3 py-2">
                        {(() => {
                          const pid = getBiProductId(x);
                          if (!pid) return "—";
                          const pname = productNameById.get(pid);
                          return pname ? `${pname} (ID: ${pid})` : `ID: ${pid}`;
                        })()}
                      </td>
                      <td className="px-3 py-2">{x.status?.name || "—"}</td>
                      <td className="px-3 py-2">{x.ownerRole || "—"}</td>
                      <td className="px-3 py-2">{x.metrics || "—"}</td>
                      <td className="px-3 py-2">{x.touchPoints || "—"}</td>
                      <td className="px-3 py-2">{(x.isDraft ?? x.draft) ? "Да" : "Нет"}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setEditingBi(x)} className="rounded border px-2 py-1">
                            Изменить
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBi(x.id)}
                            disabled={deletingId === x.id}
                            className="rounded border border-red-300 px-2 py-1 text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-300"
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredBi.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">
                        Нет данных
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setBiSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="rounded border px-2 py-1 text-xs"
            >
              Порядок: {biSortDir === "asc" ? "A-Z" : "Z-A"}
            </button>
          </div>
        </section>
        )}
      </div>

      <AddCjModal
        open={showAddCjModal}
        onClose={() => setShowAddCjModal(false)}
        saving={saving}
        productsLoading={productsLoading}
        products={products}
        cjNamesLower={cjNamesLower}
        onSubmit={handleCreateCjFromModal}
      />
      {editingCj && (
        <EditCjModal
          key={editingCj.id}
          onClose={() => setEditingCj(null)}
          saving={saving}
          products={products}
          cj={editingCj}
          onSubmit={handleUpdateCjFromModal}
        />
      )}
      <AddBiModal
        open={showAddBiModal}
        onClose={() => setShowAddBiModal(false)}
        saving={saving}
        productsLoading={productsLoading}
        products={products}
        onSubmit={handleCreateBiFromModal}
      />
      {editingBi && (
        <EditBiModal
          key={editingBi.id}
          onClose={() => setEditingBi(null)}
          saving={saving}
          productsLoading={productsLoading}
          products={products}
          bi={editingBi}
          onSubmit={handleUpdateBiFromModal}
        />
      )}
    </div>
  );
}
