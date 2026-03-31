"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CjBiDetailPanel } from "@/components/cx/cj-bi-detail-panel";
import { BpmnDropzone } from "@/components/cx/bpmn-dropzone";
import { BpmnViewerPanel } from "@/components/cx/bpmn-viewer";
import { getProductsByIds } from "@/lib/products-api";
import {
  downloadDocumentByTypeAndTarget,
  findCjBpmnDocumentationTypeId,
  getDocumentTextByTypeAndTarget,
  getDocumentationTypes,
  getDocumentVersions,
  type DocumentVersionDto,
  uploadCjBpmnDocument,
} from "@/lib/document-api";
import { getCjDetail, importCjFromBpmnCreate, importCjFromBpmnUpdate, updateCj } from "@/lib/cx-api";
import type { CjFullDetail, CjStepDetail } from "@/types/cx";
import type { Product } from "@/types/product";

function sortedSteps(detail: CjFullDetail | null): CjStepDetail[] {
  const s = detail?.steps ?? [];
  return [...s].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export default function CjDetailPage() {
  const params = useParams();
  const rawId = params?.id;
  const cjId = typeof rawId === "string" ? Number(rawId) : NaN;

  const [detail, setDetail] = useState<CjFullDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changingDraft, setChangingDraft] = useState(false);
  const [productForCJ, setProductForCJ] = useState<Product | null>(null);

  const [bpmnDocTypeId, setBpmnDocTypeId] = useState<number | undefined>();
  const [showBpmn, setShowBpmn] = useState(false);
  const [bpmnXml, setBpmnXml] = useState<string | null>(null);
  const [bpmnLoading, setBpmnLoading] = useState(false);
  const [bpmnError, setBpmnError] = useState<string | null>(null);
  const [bpmnViewerResetToken, setBpmnViewerResetToken] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [bpmnFile, setBpmnFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<DocumentVersionDto[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(cjId) || cjId <= 0) {
      setError("Некорректный идентификатор CJ.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const d = await getCjDetail(cjId);
      setDetail(d);
      setProductForCJ(null);
      if (d.productId != null) {
        try {
          const products = await getProductsByIds([d.productId]);
          setProductForCJ(products[0] ?? null);
        } catch {
          setProductForCJ(null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить CJ.");
      setDetail(null);
      setProductForCJ(null);
    } finally {
      setLoading(false);
    }
  }, [cjId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void getDocumentationTypes("CJ")
      .then((types) => {
        const id = findCjBpmnDocumentationTypeId(types);
        setBpmnDocTypeId(id);
      })
      .catch(() => setBpmnDocTypeId(undefined));
  }, []);

  const steps = useMemo(() => sortedSteps(detail), [detail]);

  const loadActualBpmn = useCallback(async (resetView?: boolean) => {
    if (resetView) {
      setBpmnViewerResetToken((x) => x + 1);
    }
    if (!bpmnDocTypeId || !Number.isFinite(cjId)) {
      setBpmnError("Тип документации BPMN не найден.");
      return;
    }
    setBpmnLoading(true);
    setBpmnError(null);
    try {
      const xml = await getDocumentTextByTypeAndTarget(bpmnDocTypeId, cjId);
      setBpmnXml(xml);
    } catch (e) {
      setBpmnXml(null);
      setBpmnError(e instanceof Error ? e.message : "Не удалось загрузить BPMN.");
    } finally {
      setBpmnLoading(false);
    }
  }, [bpmnDocTypeId, cjId]);

  const refreshVersions = useCallback(async () => {
    if (!bpmnDocTypeId || !Number.isFinite(cjId)) {
      setVersionsError("Тип документации BPMN не найден.");
      return;
    }
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      const v = await getDocumentVersions(bpmnDocTypeId, cjId);
      setVersions(v);
    } catch (e) {
      setVersionsError(e instanceof Error ? e.message : "Ошибка списка версий");
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }, [bpmnDocTypeId, cjId]);

  useEffect(() => {
    if (showVersions && bpmnDocTypeId) {
      void refreshVersions();
    }
  }, [showVersions, bpmnDocTypeId, refreshVersions]);

  useEffect(() => {
    if (showBpmn && bpmnDocTypeId) {
      void loadActualBpmn();
    }
  }, [showBpmn, bpmnDocTypeId, loadActualBpmn]);

  const handleImportBpmn = async () => {
    if (!bpmnFile || !Number.isFinite(cjId)) return;
    setImporting(true);
    setImportMsg(null);
    setError(null);
    try {
      await uploadCjBpmnDocument(cjId, bpmnFile);
      const hasSteps = (detail?.steps?.length ?? 0) > 0;
      if (hasSteps) {
        await importCjFromBpmnUpdate(cjId);
      } else {
        await importCjFromBpmnCreate(cjId);
      }
      setBpmnFile(null);
      setShowImport(false);
      await load();
      if (showBpmn) {
        await loadActualBpmn();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ошибка";
      const is503 = msg.includes("503") || msg.includes("Service Unavailable");
      setImportMsg(
        is503
          ? "BPMN не прикреплён (сервис документов недоступен). Попробуйте позже."
          : `BPMN не разобран: ${msg}`,
      );
    } finally {
      setImporting(false);
    }
  };

  const handleToggleDraft = async (nextDraft: boolean) => {
    if (!detail) return;
    setChangingDraft(true);
    setError(null);
    try {
      await updateCj(detail.id, { draft: nextDraft, name: detail.name || `CJ-${detail.id}` });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить статус CJ.");
    } finally {
      setChangingDraft(false);
    }
  };

  if (!Number.isFinite(cjId) || cjId <= 0) {
    return (
      <div className="p-6">
        <p className="text-red-600">Некорректная ссылка.</p>
        <Link href="/cx" className="mt-2 inline-block text-amber-700 underline">
          К списку CX
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-none space-y-6 -mx-4 px-4 md:-mx-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/cx" className="text-sm text-amber-700 hover:underline dark:text-amber-400">
            ← CX
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {detail?.name || (loading ? "Загрузка…" : `CJ #${cjId}`)}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
        >
          Обновить
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {loading && !detail && (
        <div className="rounded-xl border border-zinc-200 p-8 text-center text-zinc-500 dark:border-zinc-800">
          Загрузка…
        </div>
      )}

      {detail && (
        <>
          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Сводка</h2>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <dt className="text-zinc-500">ID</dt>
              <dd className="font-mono">{detail.id}</dd>
              <dt className="text-zinc-500">Код</dt>
              <dd className="font-mono">{detail.uniqueIdent || "—"}</dd>
              <dt className="text-zinc-500">Продукт</dt>
              <dd>
                {productForCJ?.alias ? (
                  <Link
                    href={`/products/${encodeURIComponent(productForCJ.alias)}`}
                    className="text-amber-700 underline hover:text-amber-800 dark:text-amber-400"
                  >
                    {productForCJ.name || `ID: ${productForCJ.id}`} (ID: {productForCJ.id})
                  </Link>
                ) : detail.productId != null ? (
                  <span className="font-mono">{detail.productId}</span>
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-zinc-500">Черновик</dt>
              <dd>
                <label className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(detail.draft)}
                    onClick={() => void handleToggleDraft(!detail.draft)}
                    disabled={changingDraft}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      detail.draft ? "bg-amber-600" : "bg-zinc-300 dark:bg-zinc-700"
                    } ${changingDraft ? "opacity-60" : ""}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        detail.draft ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <span>{detail.draft ? "Да" : "Нет"}</span>
                  {changingDraft && <span className="text-xs text-zinc-500">Сохранение...</span>}
                </label>
              </dd>
              <dt className="text-zinc-500">BPMN</dt>
              <dd>{detail.bpmn ? "Да" : "Нет"}</dd>
              <dt className="text-zinc-500">Портрет пользователя</dt>
              <dd className="break-words">{detail.userPortrait || "—"}</dd>
              <dt className="text-zinc-500">Автор</dt>
              <dd>
                {detail.author?.fullName || detail.author?.email || detail.author?.id || "—"}
              </dd>
              <dt className="text-zinc-500">Создан</dt>
              <dd>{detail.createdDate || "—"}</dd>
              <dt className="text-zinc-500">Изменён</dt>
              <dd>{detail.lastModifiedDate || "—"}</dd>
              {detail.tags && detail.tags.length > 0 && (
                <>
                  <dt className="text-zinc-500">Теги</dt>
                  <dd>{detail.tags.join(", ")}</dd>
                </>
              )}
            </dl>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setShowBpmn((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Диаграмма BPMN
              <span className="text-zinc-400">{showBpmn ? "▼" : "▶"}</span>
            </button>
            {showBpmn && (
              <div className="space-y-3 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Отображается актуальный BPMN, связанный с текущим CJ.
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadActualBpmn(true)}
                    className="rounded border border-zinc-300 px-2.5 py-1 text-xs dark:border-zinc-600"
                    disabled={bpmnLoading}
                  >
                    {bpmnLoading ? "Загрузка..." : "Обновить"}
                  </button>
                </div>
                <BpmnViewerPanel
                  xml={bpmnXml}
                  loading={bpmnLoading}
                  error={bpmnError}
                  resetToken={bpmnViewerResetToken}
                />
              </div>
            )}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setShowImport((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Импорт BPMN
              <span className="text-zinc-400">{showImport ? "▼" : "▶"}</span>
            </button>
            {showImport && (
              <div className="space-y-3 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Загрузите файл в хранилище документов и запустите разбор в CX (как при создании CJ).
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
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
                    setImportMsg("Нужен файл с расширением .bpmn.")
                  }
                  disabled={importing}
                />
                {importMsg && (
                  <p className="text-sm text-amber-800 dark:text-amber-200">{importMsg}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!bpmnFile || importing}
                    onClick={() => void handleImportBpmn()}
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {importing ? "Сохранение…" : "Сохранить и разобрать"}
                  </button>
                  {bpmnFile && (
                    <button
                      type="button"
                      className="rounded-lg border px-3 py-2 text-sm"
                      onClick={() => setBpmnFile(null)}
                    >
                      Сбросить файл
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setShowVersions((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Версии BPMN
              <span className="text-zinc-400">{showVersions ? "▼" : "▶"}</span>
            </button>
            {showVersions && (
              <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
                {versionsLoading && <p className="text-sm text-zinc-500">Загрузка версий…</p>}
                {versionsError && (
                  <p className="text-sm text-red-700 dark:text-red-300">{versionsError}</p>
                )}
                {!versionsLoading && versions.length === 0 && !versionsError && (
                  <p className="text-sm text-zinc-500">Версий пока нет.</p>
                )}
                {bpmnDocTypeId != null && versions.length > 0 && (
                  <div className="mb-3">
                    <button
                      type="button"
                      className="text-sm text-amber-700 underline dark:text-amber-400"
                      onClick={() => void downloadDocumentByTypeAndTarget(bpmnDocTypeId, cjId)}
                    >
                      Скачать текущий BPMN
                    </button>
                    <p className="mt-1 text-xs text-zinc-500">
                      Актуальный файл по типу документации и targetId = CJ.
                    </p>
                  </div>
                )}
                <ul className="space-y-2">
                  {versions.map((v) => (
                    <li
                      key={v.id ?? v.key}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-100 px-2 py-1.5 text-sm dark:border-zinc-800"
                    >
                      <span className="font-mono text-xs text-zinc-600">
                        {v.key || `id ${v.id}`}
                      </span>
                      <span className="text-xs text-zinc-500">{v.created_date || ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Шаги и BI ({steps.length})
            </h2>
            {steps.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Шагов нет — создайте CJ без BPMN или импортируйте BPMN выше.
              </p>
            ) : (
              <div className="space-y-8">
                {steps.map((step) => (
                  <div
                    key={step.id ?? `${step.order}-${step.name}`}
                    className="rounded-xl border border-amber-200/80 bg-amber-50/30 p-4 dark:border-amber-900/40 dark:bg-amber-950/15"
                  >
                    <div className="mb-3 flex flex-wrap items-baseline gap-2 border-b border-amber-200/60 pb-3 dark:border-amber-900/40">
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
                        Шаг CJ {step.order ?? "—"}
                      </span>
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                        {step.name || "Без названия"}
                      </h3>
                    </div>
                    {step.description && (
                      <p className="mb-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                        {step.description}
                      </p>
                    )}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                        Business interactions ({step.bi?.length ?? 0})
                      </p>
                      {(step.bi ?? []).length === 0 ? (
                        <p className="text-sm text-zinc-500">Нет BI на этом шаге.</p>
                      ) : (
                        <div className="space-y-3">
                          {(step.bi ?? []).map((bi) => (
                            <CjBiDetailPanel
                              key={bi.id ?? bi.uniqueIdent}
                              bi={bi}
                              onStepSaved={load}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
