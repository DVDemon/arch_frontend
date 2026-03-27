"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProductArchMapTab from "@/components/ProductArchMapTab";
import {
  getProductByAlias,
  getProductContainers,
  getProductUsers,
  getProductFitnessFunctions,
  updateProduct,
  uploadWorkspaceDsl,
  patchProductWorkspace,
  createStructurizrWorkspace,
} from "@/lib/products-api";
import type { ProductTechCapability } from "@/lib/products-api";
import { getTechList } from "@/lib/techradar-api";
import type {
  ProductFull,
  ProductUser,
  ContainerWithInterfaces,
  ContainerInterface,
  ContainerOperation,
  AssessmentResponse,
} from "@/types/product-detail";

type TabId = "info" | "tech" | "users" | "containers" | "fitness" | "capabilities" | "diagram";

const TABS: { id: TabId; label: string }[] = [
  { id: "info", label: "Информация" },
  { id: "tech", label: "Технологии" },
  { id: "users", label: "Пользователи" },
  { id: "containers", label: "Контейнеры" },
  { id: "fitness", label: "Проверки архитектуры" },
  { id: "capabilities", label: "Технические возможности" },
  { id: "diagram", label: "Диаграмма" },
];

function SecretField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [value]);

  return (
    <div className="flex items-center gap-4 border-b border-zinc-200 py-2 dark:border-zinc-700">
      <span className="w-48 shrink-0 font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </span>
      <span className="min-w-0 flex-1 break-all font-mono text-zinc-900 dark:text-zinc-100">
        {visible ? value : "••••••••"}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
          title={visible ? "Скрыть" : "Показать"}
          aria-label={visible ? "Скрыть" : "Показать"}
        >
          {visible ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
          title={copied ? "Скопировано" : "Копировать"}
          aria-label={copied ? "Скопировано" : "Копировать"}
        >
          {copied ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

function EditableField({
  label,
  value,
  onSave,
  multiline,
  isSecret,
}: {
  label: string;
  value: string;
  onSave: (v: string) => Promise<void>;
  multiline?: boolean;
  isSecret?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleStart = useCallback(() => {
    setDraft(value);
    setErr(null);
    setEditing(true);
  }, [value]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setDraft(value);
    setErr(null);
  }, [value]);

  const handleSave = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed === (value || "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }, [draft, value, onSave]);

  if (!editing) {
    const displayValue = isSecret && value ? "••••••••" : value || "—";
    return (
      <div className="flex items-center gap-4 border-b border-zinc-200 py-2 dark:border-zinc-700">
        <span className="w-48 shrink-0 font-medium text-zinc-600 dark:text-zinc-400">
          {label}
        </span>
        <span className="min-w-0 flex-1 break-all text-zinc-900 dark:text-zinc-100">
          {displayValue}
        </span>
        <button
          type="button"
          onClick={handleStart}
          className="shrink-0 rounded px-2 py-1 text-sm text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
        >
          Изменить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 border-b border-zinc-200 py-2 dark:border-zinc-700">
      <span className="block font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </span>
      {multiline ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      ) : (
        <input
          type={isSecret ? "password" : "text"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={isSecret && !value ? "Введите значение" : undefined}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      )}
      {err && (
        <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

function StructurizrFieldsBlock({
  product,
  onSave,
  onReload,
}: {
  product: ProductFull;
  onSave: (payload: {
    structurizrApiUrl?: string;
    structurizrApiKey?: string;
    structurizrApiSecret?: string;
    structurizrWorkspaceName?: string;
  }) => Promise<void>;
  onReload?: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    structurizrApiUrl: product.structurizrApiUrl ?? "",
    structurizrApiKey: product.structurizrApiKey ?? "",
    structurizrApiSecret: product.structurizrApiSecret ?? "",
    structurizrWorkspaceName: product.structurizrWorkspaceName ?? "",
  });
  const [architectName, setArchitectName] = useState(
    product.ownerName ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const canCreateWorkspace =
    !product.structurizrApiUrl?.trim() &&
    !product.structurizrApiKey?.trim() &&
    !product.structurizrApiSecret?.trim();

  const handleStart = useCallback(() => {
    setDraft({
      structurizrApiUrl: product.structurizrApiUrl ?? "",
      structurizrApiKey: product.structurizrApiKey ?? "",
      structurizrApiSecret: product.structurizrApiSecret ?? "",
      structurizrWorkspaceName: product.structurizrWorkspaceName ?? "",
    });
    setArchitectName(product.ownerName ?? "");
    setErr(null);
    setCreateErr(null);
    setEditing(true);
  }, [product]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setErr(null);
    setCreateErr(null);
  }, []);

  const handleCreateWorkspace = useCallback(async () => {
    const name = architectName.trim();
    if (!name) {
      setCreateErr("Укажите имя архитектора для создания workspace");
      return;
    }
    if (!onReload) {
      setCreateErr("Невозможно обновить данные продукта после создания");
      return;
    }
    setCreateErr(null);
    setCreatingWorkspace(true);
    try {
      await createStructurizrWorkspace(product.alias, name);
      await onReload();
      setEditing(false);
    } catch (e) {
      setCreateErr(
        e instanceof Error ? e.message : "Ошибка создания workspace"
      );
    } finally {
      setCreatingWorkspace(false);
    }
  }, [architectName, onReload, product.alias]);

  const handleSave = useCallback(async () => {
    const payload = {
      structurizrApiUrl: draft.structurizrApiUrl.trim() || undefined,
      structurizrApiKey: draft.structurizrApiKey.trim() || undefined,
      structurizrApiSecret: draft.structurizrApiSecret.trim() || undefined,
      structurizrWorkspaceName: draft.structurizrWorkspaceName.trim() || undefined,
    };
    if (
      !payload.structurizrApiUrl ||
      !payload.structurizrApiKey ||
      !payload.structurizrApiSecret ||
      !payload.structurizrWorkspaceName
    ) {
      setErr("Все поля Structurizr обязательны для заполнения");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onSave(payload);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }, [draft, onSave]);

  const inputClass =
    "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

  if (!editing) {
    const hasAny =
      product.structurizrApiUrl ||
      product.structurizrApiKey ||
      product.structurizrApiSecret ||
      product.structurizrWorkspaceName;
    return (
      <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-800/30">
        <div className="flex items-center justify-between">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            Structurizr
          </span>
          <button
            type="button"
            onClick={handleStart}
            className="rounded px-2 py-1 text-sm text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
          >
            Изменить
          </button>
        </div>
        {hasAny ? (
          <div className="space-y-1 text-sm">
            <div className="flex gap-4">
              <span className="w-40 shrink-0 text-zinc-500 dark:text-zinc-400">
                API URL
              </span>
              <span className="break-all text-zinc-900 dark:text-zinc-100">
                {product.structurizrApiUrl || "—"}
              </span>
            </div>
            <div className="flex gap-4">
              <span className="w-40 shrink-0 text-zinc-500 dark:text-zinc-400">
                API Key
              </span>
              <span className="text-zinc-900 dark:text-zinc-100">
                {product.structurizrApiKey ? "••••••••" : "—"}
              </span>
            </div>
            <div className="flex gap-4">
              <span className="w-40 shrink-0 text-zinc-500 dark:text-zinc-400">
                API Secret
              </span>
              <span className="text-zinc-900 dark:text-zinc-100">
                {product.structurizrApiSecret ? "••••••••" : "—"}
              </span>
            </div>
            <div className="flex gap-4">
              <span className="w-40 shrink-0 text-zinc-500 dark:text-zinc-400">
                Workspace
              </span>
              <span className="text-zinc-900 dark:text-zinc-100">
                {product.structurizrWorkspaceName || "—"}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Не задано. Нажмите «Изменить» для настройки.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-800/30">
      <div className="font-medium text-zinc-700 dark:text-zinc-300">
        Structurizr
      </div>
      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">
            API URL
          </label>
          <input
            type="text"
            value={draft.structurizrApiUrl}
            onChange={(e) =>
              setDraft((d) => ({ ...d, structurizrApiUrl: e.target.value }))
            }
            className={inputClass}
            placeholder="https://..."
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">
            API Key
          </label>
          <input
            type="password"
            value={draft.structurizrApiKey}
            onChange={(e) =>
              setDraft((d) => ({ ...d, structurizrApiKey: e.target.value }))
            }
            className={inputClass}
            placeholder="Введите API Key"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">
            API Secret
          </label>
          <input
            type="password"
            value={draft.structurizrApiSecret}
            onChange={(e) =>
              setDraft((d) => ({ ...d, structurizrApiSecret: e.target.value }))
            }
            className={inputClass}
            placeholder="Введите API Secret"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">
            Workspace Name
          </label>
          <input
            type="text"
            value={draft.structurizrWorkspaceName}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                structurizrWorkspaceName: e.target.value,
              }))
            }
            className={inputClass}
            placeholder="Имя workspace"
          />
        </div>
      </div>

      {canCreateWorkspace && (
        <div className="rounded-lg border border-dashed border-amber-300/80 bg-amber-50/60 p-3 dark:border-amber-700/60 dark:bg-amber-950/20">
          <p className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Создать workspace в Structurizr On-Premises
          </p>
          <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
            Будет создан новый workspace, сгенерированы API Key/Secret и URL.
            Генерация и публикация шаблона могут занять до нескольких минут —
            дождитесь завершения.
          </p>
          <div className="mb-3">
            <label className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">
              Имя архитектора
            </label>
            <input
              type="text"
              value={architectName}
              onChange={(e) => setArchitectName(e.target.value)}
              disabled={creatingWorkspace}
              className={inputClass}
              placeholder="ФИО (обязательно для создания)"
            />
          </div>
          {createErr && (
            <p className="mb-2 text-sm text-red-600 dark:text-red-400">
              {createErr}
            </p>
          )}
          <button
            type="button"
            onClick={handleCreateWorkspace}
            disabled={
              creatingWorkspace || saving || !architectName.trim() || !onReload
            }
            className="inline-flex items-center gap-2 rounded-lg border border-amber-600 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-500 dark:bg-zinc-900 dark:text-amber-200 dark:hover:bg-amber-950/40"
          >
            {creatingWorkspace && (
              <svg
                className="h-4 w-4 shrink-0 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {creatingWorkspace ? "Создание workspace…" : "Создать workspace"}
          </button>
        </div>
      )}

      {err && (
        <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || creatingWorkspace}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving || creatingWorkspace}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

function DslUploadBlock({
  productAlias,
  onSuccess,
}: {
  productAlias: string;
  onSuccess: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successPopup, setSuccessPopup] = useState(false);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setError(null);
      setSuccessPopup(false);
      setUploading(true);
      try {
        const text = await file.text();
        await uploadWorkspaceDsl(productAlias, text);
        onSuccess();
        setSuccessPopup(true);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Ошибка загрузки workspace.dsl";
        setError(msg);
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [productAlias, onSuccess]
  );

  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
      <div className="font-medium text-zinc-700 dark:text-zinc-300">
        Загрузка workspace.dsl
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Загрузите файл workspace.dsl для импорта в FDM. Операция может занять
        несколько минут.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".dsl"
          onChange={handleFileChange}
          disabled={uploading}
          className="block w-full max-w-xs text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-100 file:px-4 file:py-2 file:text-amber-800 file:hover:bg-amber-200 dark:text-zinc-400 dark:file:bg-amber-900/40 dark:file:text-amber-200 dark:file:hover:bg-amber-900/60"
        />
        {uploading && (
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <svg
              className="h-5 w-5 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Обработка…</span>
          </div>
        )}
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}
      {successPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSuccessPopup(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="success-title"
        >
          <div
            className="max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="success-title" className="mb-2 text-lg font-semibold text-green-700 dark:text-green-400">
              Загрузка завершена
            </h3>
            <p className="mb-4 text-zinc-600 dark:text-zinc-400">
              workspace.dsl успешно импортирован. Данные продукта обновлены.
            </p>
            <button
              type="button"
              onClick={() => setSuccessPopup(false)}
              className="w-full rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoSection({
  product,
  onProductUpdate,
  onReload,
}: {
  product: ProductFull;
  onProductUpdate: (p: ProductFull) => void;
  onReload?: () => void;
}) {
  const handleSaveName = useCallback(
    async (value: string) => {
      await updateProduct({
        alias: product.alias,
        name: value,
        description: product.description,
        gitUrl: product.gitUrl,
        critical: product.critical,
        ownerId: product.ownerID ?? undefined,
      });
      onProductUpdate({ ...product, name: value });
    },
    [product, onProductUpdate]
  );

  const handleSaveDescription = useCallback(
    async (value: string) => {
      await updateProduct({
        alias: product.alias,
        name: product.name,
        description: value,
        gitUrl: product.gitUrl,
        critical: product.critical,
        ownerId: product.ownerID ?? undefined,
      });
      onProductUpdate({ ...product, description: value });
    },
    [product, onProductUpdate]
  );

  const handleSaveGitUrl = useCallback(
    async (value: string) => {
      await updateProduct({
        alias: product.alias,
        name: product.name,
        description: product.description,
        gitUrl: value || undefined,
        critical: product.critical,
        ownerId: product.ownerID ?? undefined,
      });
      onProductUpdate({ ...product, gitUrl: value || undefined });
    },
    [product, onProductUpdate]
  );

  const handleSaveStructurizr = useCallback(
    async (payload: {
      structurizrApiUrl?: string;
      structurizrApiKey?: string;
      structurizrApiSecret?: string;
      structurizrWorkspaceName?: string;
    }) => {
      await patchProductWorkspace(product.alias, payload);
      onProductUpdate({ ...product, ...payload });
    },
    [product, onProductUpdate]
  );

  const items: { label: string; value?: string; isSecret?: boolean }[] = [
    { label: "Alias", value: product.alias },
    { label: "Источник", value: product.source },
    { label: "Дата обновления", value: product.uploadDate ? new Date(product.uploadDate).toLocaleString("ru") : undefined },
    { label: "Критичность", value: product.critical },
    { label: "Владелец", value: product.ownerName ? `${product.ownerName} (${product.ownerEmail})` : undefined },
  ];

  return (
    <div className="space-y-3 [&>*:last-child]:border-b-0">
      {onReload && (
        <DslUploadBlock productAlias={product.alias} onSuccess={onReload} />
      )}
      <div className="flex gap-4 border-b border-zinc-200 py-2 dark:border-zinc-700">
        <span className="w-48 shrink-0 font-medium text-zinc-600 dark:text-zinc-400">
          Код (alias)
        </span>
        <span className="break-all text-zinc-900 dark:text-zinc-100">
          {product.alias}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          — не редактируется
        </span>
      </div>
      <EditableField
        label="Название"
        value={product.name ?? ""}
        onSave={handleSaveName}
      />
      <EditableField
        label="Описание"
        value={product.description ?? ""}
        onSave={handleSaveDescription}
        multiline
      />
      <EditableField
        label="Git URL"
        value={product.gitUrl ?? ""}
        onSave={handleSaveGitUrl}
      />
      <StructurizrFieldsBlock
        product={product}
        onSave={handleSaveStructurizr}
        onReload={onReload}
      />
      {items.map((item) => {
        if (item.label === "Alias" || item.label === "Название" || item.label === "Описание" || item.label === "Git URL") return null;
        if (!item.value) return null;
        if (item.isSecret) {
          return <SecretField key={item.label} label={item.label} value={item.value} />;
        }
        return (
          <div key={item.label} className="flex gap-4 border-b border-zinc-200 py-2 dark:border-zinc-700">
            <span className="w-48 shrink-0 font-medium text-zinc-600 dark:text-zinc-400">
              {item.label}
            </span>
            <span className="break-all text-zinc-900 dark:text-zinc-100">
              {item.label.includes("URL") && item.value.startsWith("http") ? (
                <a
                  href={item.value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-600 hover:underline dark:text-amber-400"
                >
                  {item.value}
                </a>
              ) : (
                item.value
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

type CapabilitySortKey = "code" | "name" | "description" | "owner";

function TechCapabilitiesSection({
  capabilities,
  loading,
}: {
  capabilities: ProductTechCapability[];
  loading: boolean;
}) {
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<CapabilitySortKey>("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filteredAndSorted = useMemo(() => {
    let list = [...capabilities];
    if (filter.trim()) {
      const f = filter.toLowerCase().trim();
      list = list.filter(
        (c) =>
          (c.code || "").toLowerCase().includes(f) ||
          (c.name || "").toLowerCase().includes(f) ||
          (c.description || "").toLowerCase().includes(f) ||
          (c.owner || "").toLowerCase().includes(f)
      );
    }
    list.sort((a, b) => {
      const av = String(a[sortKey] ?? "");
      const bv = String(b[sortKey] ?? "");
      const cmp = av.localeCompare(bv, undefined, { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [capabilities, filter, sortKey, sortDir]);

  const handleSort = (key: CapabilitySortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ column }: { column: CapabilitySortKey }) =>
    sortKey === column ? (
      <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
    ) : null;

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center text-zinc-500 dark:text-zinc-400">
        Загрузка…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <input
          type="text"
          placeholder="Фильтр по коду, названию, описанию, владельцу…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-400"
        />
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          Показано: {filteredAndSorted.length} из {capabilities.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort("code")}
                  className="flex items-center font-semibold text-zinc-900 hover:text-amber-600 dark:text-zinc-100 dark:hover:text-amber-400"
                >
                  Код
                  <SortIcon column="code" />
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort("name")}
                  className="flex items-center font-semibold text-zinc-900 hover:text-amber-600 dark:text-zinc-100 dark:hover:text-amber-400"
                >
                  Название
                  <SortIcon column="name" />
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
                  onClick={() => handleSort("owner")}
                  className="flex items-center font-semibold text-zinc-900 hover:text-amber-600 dark:text-zinc-100 dark:hover:text-amber-400"
                >
                  Владелец
                  <SortIcon column="owner" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">
                  {capabilities.length === 0
                    ? "Нет технических возможностей"
                    : "Нет совпадений по фильтру"}
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <td className="px-4 py-2 font-mono text-sm">
                    <Link
                      href={`/capabilities?tc=${c.id}`}
                      className="text-amber-600 hover:underline dark:text-amber-400"
                    >
                      {c.code || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/capabilities?tc=${c.id}`}
                      className="text-amber-600 hover:underline dark:text-amber-400"
                    >
                      {c.name || "—"}
                    </Link>
                  </td>
                  <td className="max-w-xs truncate px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {c.description || "—"}
                  </td>
                  <td className="px-4 py-2">{c.owner || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getRingStatusClasses(ringName?: string) {
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
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300";
  }
}

function getRingRowClasses(ringName?: string) {
  switch (ringName) {
    case "Adopt":
      return "border-l-4 border-l-green-500";
    case "Trial":
      return "border-l-4 border-l-blue-500";
    case "Assess":
      return "border-l-4 border-l-amber-500";
    case "Hold":
      return "border-l-4 border-l-red-500";
    default:
      return "border-l-4 border-l-zinc-400";
  }
}

function TechSection({ techProducts }: { techProducts?: ProductFull["techProducts"] }) {
  const [techMap, setTechMap] = useState<Record<number, { label: string; ringName?: string }>>({});
  const [loadingNames, setLoadingNames] = useState(false);

  useEffect(() => {
    if (!techProducts?.length) return;
    setLoadingNames(true);
    getTechList(true)
      .then((techs) => {
        const map: Record<number, { label: string; ringName?: string }> = {};
        for (const tech of techs) {
          map[tech.id] = {
            label: tech.label ?? "",
            ringName: tech.ring?.name,
          };
        }
        setTechMap(map);
      })
      .catch(() => setTechMap({}))
      .finally(() => setLoadingNames(false));
  }, [techProducts]);

  if (!techProducts?.length) {
    return <p className="text-zinc-500 dark:text-zinc-400">Нет технологий</p>;
  }
  const active = techProducts.filter((t) => !t.deletedDate);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[400px]">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-700">
            <th className="px-4 py-2 text-left font-semibold text-zinc-900 dark:text-zinc-100">Название</th>
            <th className="px-4 py-2 text-left font-semibold text-zinc-900 dark:text-zinc-100">Статус</th>
            <th className="px-4 py-2 text-left font-semibold text-zinc-900 dark:text-zinc-100">ID</th>
            <th className="px-4 py-2 text-left font-semibold text-zinc-900 dark:text-zinc-100">Источник</th>
            <th className="px-4 py-2 text-left font-semibold text-zinc-900 dark:text-zinc-100">Дата создания</th>
          </tr>
        </thead>
        <tbody>
          {active.map((t) => {
            const tech = techMap[t.techId];
            const ringName = tech?.ringName;
            return (
              <tr
                key={t.id}
                className={`border-b border-zinc-100 dark:border-zinc-800 ${getRingRowClasses(ringName)}`}
              >
                <td className="px-4 py-2">{loadingNames ? "…" : (tech?.label || `ID ${t.techId}`)}</td>
                <td className="px-4 py-2">
                  {loadingNames ? (
                    "…"
                  ) : (
                    <span className={`rounded px-2 py-0.5 text-sm ${getRingStatusClasses(ringName)}`}>
                      {ringName ?? "—"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">{t.techId}</td>
                <td className="px-4 py-2">{t.source || "—"}</td>
                <td className="px-4 py-2">
                  {t.createdDate ? new Date(t.createdDate).toLocaleString("ru") : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UsersSection({ users }: { users: ProductUser[] }) {
  if (!users.length) {
    return <p className="text-zinc-500 dark:text-zinc-400">Нет пользователей</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[400px]">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-700">
            <th className="px-4 py-2 text-left font-semibold text-zinc-900 dark:text-zinc-100">ID</th>
            <th className="px-4 py-2 text-left font-semibold text-zinc-900 dark:text-zinc-100">ФИО</th>
            <th className="px-4 py-2 text-left font-semibold text-zinc-900 dark:text-zinc-100">Email</th>
            <th className="px-4 py-2 text-left font-semibold text-zinc-900 dark:text-zinc-100">Логин</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-zinc-100 dark:border-zinc-800">
              <td className="px-4 py-2">{u.id}</td>
              <td className="px-4 py-2">{u.fullName || "—"}</td>
              <td className="px-4 py-2">{u.email || "—"}</td>
              <td className="px-4 py-2">{u.login || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContainersSection({ containers }: { containers: ContainerWithInterfaces[] }) {
  const [filter, setFilter] = useState("");
  const filterLower = filter.trim().toLowerCase();

  const allOperations = useMemo(() => {
    const list: { op: ContainerOperation; iface: ContainerInterface; container: ContainerWithInterfaces }[] = [];
    for (const c of containers) {
      for (const iface of c.interfaces ?? []) {
        for (const op of iface.operations ?? []) {
          list.push({ op, iface, container: c });
        }
      }
    }
    return list;
  }, [containers]);

  const filtered = useMemo(() => {
    if (!filterLower) return null;
    return new Set(
      allOperations.filter(
        (x) =>
          (x.op.name ?? "").toLowerCase().includes(filterLower) ||
          (x.container.name ?? "").toLowerCase().includes(filterLower) ||
          (x.iface.name ?? "").toLowerCase().includes(filterLower)
      ).map((x) => `${x.container.id}-${x.iface.id}-${x.op.id}`)
    );
  }, [allOperations, filterLower]);

  const matchesFilter = (containerId: number, ifaceId: number, opId: number) => {
    if (!filtered) return true;
    return filtered.has(`${containerId}-${ifaceId}-${opId}`);
  };

  const containerMatchesFilter = (c: ContainerWithInterfaces) => {
    if (!filtered) return true;
    return (c.interfaces ?? []).some((iface) =>
      (iface.operations ?? []).some((op) => matchesFilter(c.id, iface.id, op.id))
    );
  };

  if (!containers.length) {
    return <p className="text-zinc-500 dark:text-zinc-400">Нет контейнеров</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="search"
          placeholder="Поиск по endpoint..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          aria-label="Поиск по endpoint"
        />
        {filter && (
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {allOperations.filter((x) => matchesFilter(x.container.id, x.iface.id, x.op.id)).length} из{" "}
            {allOperations.length}
          </span>
        )}
      </div>
      <div className="space-y-6">
        {containers
          .filter(containerMatchesFilter)
          .map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-800/30"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {c.name || c.code || `Контейнер #${c.id}`}
                </span>
                {c.code && (
                  <span className="rounded bg-zinc-200 px-2 py-0.5 text-sm dark:bg-zinc-700">{c.code}</span>
                )}
              </div>
              {c.interfaces?.length ? (
                <div className="ml-4 space-y-4">
                  {c.interfaces.map((iface) => (
                    <div
                      key={iface.id}
                      className="rounded border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
                        <span className="font-medium">{iface.name || iface.code || "—"}</span>
                        {iface.protocol && (
                          <span className="rounded bg-amber-100 px-1.5 text-xs dark:bg-amber-900/40">
                            {iface.protocol}
                          </span>
                        )}
                        {iface.techCapability && (
                          <span
                            className="rounded bg-blue-100 px-1.5 text-xs dark:bg-blue-900/40"
                            title={iface.techCapability.name}
                          >
                            TC: {iface.techCapability.code ?? iface.techCapability.name ?? "—"}
                          </span>
                        )}
                        {iface.specLink && (
                          <a
                            href={iface.specLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-amber-600 hover:underline dark:text-amber-400"
                          >
                            Спецификация
                          </a>
                        )}
                        {iface.description && (
                          <span className="w-full text-sm text-zinc-600 dark:text-zinc-400">
                            {iface.description}
                          </span>
                        )}
                      </div>
                      {iface.operations?.length ? (
                        <ul className="divide-y divide-zinc-100 dark:divide-zinc-700">
                          {iface.operations
                            .filter((op) => matchesFilter(c.id, iface.id, op.id))
                            .map((op) => (
                              <li key={op.id} className="px-3 py-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-sm">{op.name ?? "—"}</span>
                                  {op.type && (
                                    <span className="rounded bg-zinc-100 px-1.5 text-xs dark:bg-zinc-700">
                                      {op.type}
                                    </span>
                                  )}
                                  {op.techCapability && (
                                    <span
                                      className="rounded bg-emerald-100 px-1.5 text-xs dark:bg-emerald-900/40"
                                      title={op.techCapability.name}
                                    >
                                      TC: {op.techCapability.code ?? op.techCapability.name ?? "—"}
                                    </span>
                                  )}
                                </div>
                                {op.description && (
                                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                    {op.description}
                                  </p>
                                )}
                                {op.parameters && op.parameters.length > 0 && (
                                  <details className="mt-2">
                                    <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300">
                                      Параметры ({op.parameters.length})
                                    </summary>
                                    <ul className="mt-1 ml-4 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                                      {op.parameters.map((p, i) => (
                                        <li key={i} className="font-mono">
                                          {p.parameterName ?? "?"}
                                          {p.parameterType ? (
                                            <span className="text-zinc-500 dark:text-zinc-500">
                                              {" "}
                                              : {p.parameterType}
                                            </span>
                                          ) : null}
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                )}
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <p className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">Нет операций</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="ml-4 text-sm text-zinc-500 dark:text-zinc-400">Нет интерфейсов</p>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

function ContextDiagramPane({
  cmdb,
  type,
  title,
}: {
  cmdb: string;
  type: "outbound" | "inbound";
  title: string;
}) {
  const [dot, setDot] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [fetchStatus, setFetchStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [renderStatus, setRenderStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!cmdb.trim()) return;
    setFetchStatus("loading");
    setDot(null);
    setSvg(null);
    setErr(null);
    const url =
      type === "outbound"
        ? `/api/graph/context-influence-dot?cmdb=${encodeURIComponent(cmdb)}`
        : `/api/graph/context-dot?cmdb=${encodeURIComponent(cmdb)}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) return r.json().then((d) => Promise.reject(new Error((d as { error?: string }).error || r.statusText)));
        return r.text();
      })
      .then((text) => {
        setDot(text);
        setFetchStatus("done");
      })
      .catch((e) => {
        setErr(e instanceof Error ? e.message : "Ошибка загрузки");
        setFetchStatus("error");
      });
  }, [cmdb, type]);

  useEffect(() => {
    if (!dot?.trim()) return;
    setRenderStatus("loading");
    setSvg(null);
    import("@hpcc-js/wasm")
      .then(({ Graphviz }) => Graphviz.load())
      .then((graphviz) => {
        const result = graphviz.dot(dot);
        setSvg(result);
        setRenderStatus("done");
      })
      .catch((e) => {
        setErr(e instanceof Error ? e.message : "Ошибка рендеринга");
        setRenderStatus("error");
      });
  }, [dot]);

  const loading = fetchStatus === "loading" || renderStatus === "loading";
  const loadingText =
    fetchStatus === "loading"
      ? "Построение диаграммы…"
      : renderStatus === "loading"
        ? "Отрисовка…"
        : null;

  return (
    <div className="flex min-h-[280px] flex-1 flex-col rounded-lg border border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-800/30">
      <div className="border-b border-zinc-200 px-4 py-2 font-medium text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
        {title}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {loadingText && (
          <div className="flex h-48 items-center justify-center text-zinc-500 dark:text-zinc-400">
            <span className="animate-pulse">{loadingText}</span>
          </div>
        )}
        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
            {err}
          </div>
        )}
        {svg && !err && (
          <div className="min-w-0" dangerouslySetInnerHTML={{ __html: svg }} />
        )}
        {fetchStatus === "done" && !svg && !err && !loadingText && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Нет связей</p>
        )}
      </div>
    </div>
  );
}

function ContextSection({ cmdb }: { cmdb: string }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <ContextDiagramPane
        cmdb={cmdb}
        type="outbound"
        title="Исходящие связи (кого мы вызываем)"
      />
      <ContextDiagramPane
        cmdb={cmdb}
        type="inbound"
        title="Входящие связи (кто нас вызывает)"
      />
    </div>
  );
}

function FitnessSection({ assessment }: { assessment: AssessmentResponse | null }) {
  if (!assessment?.fitnessFunctions?.length) {
    return <p className="text-zinc-500 dark:text-zinc-400">Нет данных по проверкам архитектуры</p>;
  }
  const fns = assessment.fitnessFunctions;
  return (
    <div className="space-y-2">
      {assessment.createdDate && (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Дата проверки: {new Date(assessment.createdDate).toLocaleString("ru")}
          {assessment.source?.sourceType && ` • Источник: ${assessment.source.sourceType}`}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="px-4 py-2 text-left font-semibold text-zinc-900 dark:text-zinc-100">Код</th>
              <th className="px-4 py-2 text-left font-semibold text-zinc-900 dark:text-zinc-100">Описание</th>
              <th className="px-4 py-2 text-left font-semibold text-zinc-900 dark:text-zinc-100">Статус</th>
              <th className="px-4 py-2 text-left font-semibold text-zinc-900 dark:text-zinc-100">Результат</th>
            </tr>
          </thead>
          <tbody>
            {fns.map((ff) => (
              <tr key={ff.id} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-2 font-mono text-sm">{ff.code || "—"}</td>
                <td className="px-4 py-2">{ff.description || "—"}</td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-flex rounded px-2 py-0.5 text-sm ${
                      ff.isCheck
                        ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                        : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                    }`}
                  >
                    {ff.isCheck ? "✓ Пройдена" : "✗ Не пройдена"}
                  </span>
                </td>
                <td className="max-w-md px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 [&_a]:text-amber-600 [&_a]:hover:underline dark:[&_a]:text-amber-400">
                  {ff.resultDetails ? (
                    <span dangerouslySetInnerHTML={{ __html: ff.resultDetails }} />
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ProductDetailPage() {
  const params = useParams();
  const aliasParam = typeof params.alias === "string" ? params.alias : params.alias?.[0] ?? "";
  const [product, setProduct] = useState<ProductFull | null>(null);
  const [users, setUsers] = useState<ProductUser[]>([]);
  const [containers, setContainers] = useState<ContainerWithInterfaces[]>([]);
  const [assessment, setAssessment] = useState<AssessmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("info");

  const load = useCallback(async (a: string) => {
    setLoading(true);
    setError(null);
    try {
      const [prod, usrs, conts, ass] = await Promise.all([
        getProductByAlias(a),
        getProductUsers(a).catch(() => []),
        getProductContainers(a).catch(() => []),
        getProductFitnessFunctions(a),
      ]);
      setProduct(prod);
      setUsers(usrs);
      setContainers(conts);
      setAssessment(ass);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  const techCapabilities = useMemo(() => {
    const byId = new Map<number, ProductTechCapability>();
    for (const container of containers) {
      for (const iface of container.interfaces ?? []) {
        const tc = iface.techCapability;
        if (tc?.id && !byId.has(tc.id)) {
          byId.set(tc.id, {
            id: tc.id,
            code: tc.code,
            name: tc.name,
          });
        }
        for (const op of iface.operations ?? []) {
          const opTc = op.techCapability;
          if (opTc?.id && !byId.has(opTc.id)) {
            byId.set(opTc.id, {
              id: opTc.id,
              code: opTc.code,
              name: opTc.name,
            });
          }
        }
      }
    }
    return Array.from(byId.values());
  }, [containers]);

  useEffect(() => {
    if (aliasParam) load(aliasParam);
  }, [aliasParam, load]);

  if (loading && !product) {
    return (
      <div className="w-full">
        <div className="animate-pulse rounded-xl border border-zinc-200 bg-white p-12 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="h-8 w-48 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="mt-4 h-4 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="w-full">
        <Link
          href="/products"
          className="mb-4 inline-block text-sm text-amber-600 hover:underline dark:text-amber-400"
        >
          ← К каталогу продуктов
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {error || "Продукт не найден"}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Link
        href="/products"
        className="mb-4 inline-block text-sm text-amber-600 hover:underline dark:text-amber-400"
      >
        ← К каталогу продуктов
      </Link>

      <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        {product.name || product.alias}
      </h1>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-zinc-200 dark:border-zinc-700">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-4 py-2 font-medium transition-colors ${
              activeTab === tab.id
                ? "border-amber-500 text-amber-600 dark:border-amber-400 dark:text-amber-400"
                : "border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className={`rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${
          activeTab === "diagram"
            ? "h-[calc(100dvh-12rem)] overflow-hidden p-0"
            : "p-6"
        }`}
      >
        {activeTab === "info" && (
          <InfoSection
            product={product}
            onProductUpdate={setProduct}
            onReload={() => load(aliasParam)}
          />
        )}
        {activeTab === "tech" && <TechSection techProducts={product.techProducts} />}
        {activeTab === "users" && <UsersSection users={users} />}
        {activeTab === "containers" && <ContainersSection containers={containers} />}
        {activeTab === "fitness" && <FitnessSection assessment={assessment} />}
        {activeTab === "capabilities" && (
          <TechCapabilitiesSection
            capabilities={techCapabilities}
            loading={loading}
          />
        )}
        {activeTab === "diagram" && (
          <ProductArchMapTab
            productName={product.name || ""}
            productAlias={product.alias}
          />
        )}
      </div>
    </div>
  );
}
