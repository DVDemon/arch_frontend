"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  putBiScenarioStepRelations,
  updateBiScenarioStep,
} from "@/lib/cx-api";
import {
  getProductContainers,
  getProducts,
  getProductsAdmin,
  getProductTechCapabilities,
} from "@/lib/products-api";
import type {
  BiDetailV3,
  BiLinkItem,
  BiRelationDto,
  BiScenarioStep,
} from "@/types/cx";
import type { ContainerInterface } from "@/types/product-detail";
import type { Product } from "@/types/product";

function isLinkItem(x: unknown): x is BiLinkItem {
  return typeof x === "object" && x !== null && ("url" in x || "descr" in x);
}

function asLinks(arr: unknown[] | undefined): BiLinkItem[] {
  if (!arr?.length) return [];
  return arr.filter(isLinkItem);
}

function asScenarioSteps(arr: unknown[] | undefined): BiScenarioStep[] {
  if (!arr?.length) return [];
  return arr.filter((x): x is BiScenarioStep => typeof x === "object" && x !== null);
}

function AttrRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-0.5 break-words text-sm text-zinc-900 dark:text-zinc-100">{value}</div>
    </div>
  );
}

function LinksBlock({ title, items }: { title: string; items: BiLinkItem[] }) {
  if (!items.length) return null;
  return (
    <div className="col-span-full">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </h4>
      <ul className="space-y-1.5">
        {items.map((link, i) => (
          <li key={`${link.descr ?? ""}-${link.url ?? ""}-${i}`} className="flex flex-wrap gap-2 text-sm">
            {link.url ? (
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-700 underline hover:text-amber-800 dark:text-amber-400"
              >
                {link.descr || link.url}
              </a>
            ) : (
              <span>{link.descr || "—"}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RelationRow({ r }: { r: BiRelationDto }) {
  const parts = [
    r.tcName && `TC: ${r.tcName}${r.tcCode ? ` (${r.tcCode})` : ""}`,
    r.productName && `Продукт: ${r.productName}${r.productAlias ? ` [${r.productAlias}]` : ""}`,
    r.interfaceName && `Интерфейс: ${r.interfaceName}${r.interfaceCode ? ` (${r.interfaceCode})` : ""}`,
    r.operation && `Операция: ${r.operation}`,
    r.description,
  ].filter(Boolean);
  return (
    <li className="rounded border border-zinc-200 bg-white/80 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/50">
      <div className="font-mono text-xs text-zinc-500">#{r.order ?? "—"}</div>
      {parts.length > 0 ? (
        <p className="mt-1 text-zinc-800 dark:text-zinc-200">{parts.join(" · ")}</p>
      ) : (
        <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all text-zinc-600 dark:text-zinc-400">
          {JSON.stringify(r, null, 2)}
        </pre>
      )}
    </li>
  );
}

function ScenarioStepBlock({
  step,
  index,
  onSaved,
}: {
  step: BiScenarioStep;
  index: number;
  onSaved?: () => Promise<void> | void;
}) {
  const rels = step.relations ?? [];
  const initial = rels[0];
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [latency, setLatency] = useState(step.latency != null ? String(step.latency) : "");
  const [errorRate, setErrorRate] = useState(step.errorRate != null ? String(step.errorRate) : "");
  const [rps, setRps] = useState(step.rps != null ? String(step.rps) : "");
  const [description, setDescription] = useState(initial?.description || "");
  const [productId, setProductId] = useState(initial?.productId != null ? String(initial.productId) : "");
  const [tcId, setTcId] = useState(initial?.tcId != null ? String(initial.tcId) : "");
  const [interfaceId, setInterfaceId] = useState(initial?.interfaceId != null ? String(initial.interfaceId) : "");
  const [operationId, setOperationId] = useState(initial?.operationId != null ? String(initial.operationId) : "");
  const [products, setProducts] = useState<Product[]>([]);
  const [techCapabilities, setTechCapabilities] = useState<Array<{ id: number; name?: string; code?: string }>>([]);
  const [interfaces, setInterfaces] = useState<ContainerInterface[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const operations = useMemo(() => {
    if (!interfaceId) return [];
    const iface = interfaces.find((x) => String(x.id) === interfaceId);
    return iface?.operations ?? [];
  }, [interfaces, interfaceId]);
  const allOperations = useMemo(
    () =>
      interfaces.flatMap((iface) =>
        (iface.operations ?? []).map((op) => ({ op, iface })),
      ),
    [interfaces],
  );
  const selectedTc = useMemo(
    () => techCapabilities.find((x) => String(x.id) === tcId),
    [techCapabilities, tcId],
  );
  const selectedInterface = useMemo(
    () => interfaces.find((x) => String(x.id) === interfaceId),
    [interfaces, interfaceId],
  );
  const selectedOperation = useMemo(
    () =>
      operations.find((x) => String(x.id) === operationId) ??
      allOperations.find((x) => String(x.op.id) === operationId)?.op,
    [operations, allOperations, operationId],
  );

  const parseOptionalNumber = (v: string): number | undefined => {
    const t = v.trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  };

  const loadAvailableProducts = async () => {
    let user: Product[] = [];
    let admin: Product[] = [];
    try {
      user = await getProducts();
    } catch {
      user = [];
    }
    try {
      admin = await getProductsAdmin();
    } catch {
      admin = [];
    }
    const byId = new Map<number, Product>();
    for (const p of [...user, ...admin]) {
      if (!p?.id || byId.has(p.id)) continue;
      byId.set(p.id, p);
    }
    const merged = Array.from(byId.values()).sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }),
    );
    setProducts(merged);
  };

  const loadProductReferences = async (selectedId: string) => {
    const pid = Number(selectedId);
    if (!Number.isFinite(pid) || pid <= 0) {
      setTechCapabilities([]);
      setInterfaces([]);
      return;
    }
    const p = products.find((x) => x.id === pid);
    if (!p?.alias) {
      setTechCapabilities([]);
      setInterfaces([]);
      return;
    }
    setLoadingRefs(true);
    try {
      const [tcs, containers] = await Promise.all([
        getProductTechCapabilities(p.alias).catch(() => []),
        getProductContainers(p.alias).catch(() => []),
      ]);
      setTechCapabilities(tcs.map((x) => ({ id: x.id, name: x.name, code: x.code })));
      const allIfaces = containers.flatMap((c) => c.interfaces ?? []);
      setInterfaces(allIfaces);
    } finally {
      setLoadingRefs(false);
    }
  };

  useEffect(() => {
    if (!editing) return;
    void loadAvailableProducts();
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    if (!productId) return;
    void loadProductReferences(productId);
  }, [editing, productId, products.length]);

  useEffect(() => {
    if (!editing) return;
    if (!operationId) return;
    if (interfaceId) return;
    // Ensure cascade order: API is selected before operation.
    const matched = allOperations.find((x) => String(x.op.id) === operationId);
    if (matched) {
      setInterfaceId(String(matched.iface.id));
    }
  }, [editing, operationId, interfaceId, allOperations]);

  const handleSave = async () => {
    if (!step.id) {
      setFormError("Невозможно отредактировать: у шага нет id.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await updateBiScenarioStep(step.id, {
        latency: parseOptionalNumber(latency),
        errorRate: parseOptionalNumber(errorRate),
        rps: parseOptionalNumber(rps),
      });
      const relationCaptionParts = [
        selectedTc ? `TC: ${selectedTc.name || selectedTc.code || selectedTc.id}` : "",
        selectedInterface
          ? `API: ${selectedInterface.name || selectedInterface.code || selectedInterface.id}`
          : "",
        selectedOperation
          ? `operation: ${selectedOperation.name || selectedOperation.id}`
          : "",
      ].filter(Boolean);
      const relationCaption = relationCaptionParts.join(" | ");
      const baseDescription = description.trim();
      const mergedDescription =
        relationCaption && baseDescription
          ? `${baseDescription}\n${relationCaption}`
          : baseDescription || relationCaption || undefined;
      await putBiScenarioStepRelations(step.id, [
        {
          id: initial?.id,
          description: mergedDescription,
          productId: parseOptionalNumber(productId),
          tcId: parseOptionalNumber(tcId),
          interfaceId: parseOptionalNumber(interfaceId),
          operationId: parseOptionalNumber(operationId),
        },
      ]);
      await onSaved?.();
      setEditing(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Не удалось сохранить шаг.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="group rounded-lg border border-zinc-200 bg-zinc-50/90 dark:border-zinc-700 dark:bg-zinc-900/40">
      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-zinc-900 marker:content-none dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex w-full items-center justify-between gap-2">
          <span>
            Шаг {index + 1}
            {step.name ? `: ${step.name}` : ""}
            {step.type ? (
              <span className="ml-2 font-normal text-zinc-500">({step.type})</span>
            ) : null}
          </span>
          <span className="text-zinc-400 transition-transform group-open:rotate-90">▶</span>
        </span>
      </summary>
      <div className="space-y-3 border-t border-zinc-200 px-3 py-3 dark:border-zinc-700">
        <div className="flex justify-end">
          <button
            type="button"
            className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Скрыть редактор" : "Редактировать шаг"}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <AttrRow label="ID" value={step.id} />
          <AttrRow label="uniqueIdent" value={step.uniqueIdent} />
          <AttrRow label="Latency" value={step.latency != null ? String(step.latency) : undefined} />
          <AttrRow label="Error rate" value={step.errorRate != null ? String(step.errorRate) : undefined} />
          <AttrRow label="RPS" value={step.rps != null ? String(step.rps) : undefined} />
        </div>
        {editing && (
          <div className="space-y-3 rounded border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-950/40">
            <p className="font-semibold text-zinc-700 dark:text-zinc-300">
              Привязки шага: НФТ + техническая реализация API
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                value={latency}
                onChange={(e) => setLatency(e.target.value)}
                placeholder="Latency"
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
              />
              <input
                value={errorRate}
                onChange={(e) => setErrorRate(e.target.value)}
                placeholder="Error rate"
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
              />
              <input
                value={rps}
                onChange={(e) => setRps(e.target.value)}
                placeholder="RPS"
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
              />
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Нефункциональные требования / описание"
              rows={2}
              className="w-full rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
            />
            {(selectedTc || selectedInterface || selectedOperation) && (
              <p className="text-zinc-500 dark:text-zinc-400">
                В описание связи будет добавлено:{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-200">
                  {[selectedTc ? `TC: ${selectedTc.name || selectedTc.code || selectedTc.id}` : "",
                    selectedInterface
                      ? `API: ${selectedInterface.name || selectedInterface.code || selectedInterface.id}`
                      : "",
                    selectedOperation
                      ? `operation: ${selectedOperation.name || selectedOperation.id}`
                      : ""]
                    .filter(Boolean)
                    .join(" | ")}
                </span>
              </p>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <select
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setTcId("");
                  setInterfaceId("");
                  setOperationId("");
                }}
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
              >
                <option value="">Выберите продукт</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.alias} (ID: {p.id})
                  </option>
                ))}
                {productId &&
                  !products.some((p) => String(p.id) === productId) && (
                    <option value={productId}>{`Продукт ID: ${productId}`}</option>
                  )}
              </select>
              <select
                value={tcId}
                onChange={(e) => setTcId(e.target.value)}
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
                disabled={!productId}
              >
                <option value="">Выберите тех. возможность</option>
                {techCapabilities.map((tc) => (
                  <option key={tc.id} value={tc.id}>
                    {tc.name || tc.code || `TC ${tc.id}`} (ID: {tc.id})
                  </option>
                ))}
                {tcId &&
                  !techCapabilities.some((tc) => String(tc.id) === tcId) && (
                    <option value={tcId}>{`TC ID: ${tcId}`}</option>
                  )}
              </select>
              <select
                value={interfaceId}
                onChange={(e) => {
                  setInterfaceId(e.target.value);
                  setOperationId("");
                }}
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
                disabled={!productId}
              >
                <option value="">Выберите API</option>
                {interfaces.map((iface) => (
                  <option key={iface.id} value={iface.id}>
                    {iface.name || iface.code || `API ${iface.id}`} (ID: {iface.id})
                  </option>
                ))}
                {interfaceId &&
                  !interfaces.some((iface) => String(iface.id) === interfaceId) && (
                    <option value={interfaceId}>{`API ID: ${interfaceId}`}</option>
                  )}
              </select>
              <select
                value={operationId}
                onChange={(e) => setOperationId(e.target.value)}
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
                disabled={!interfaceId}
              >
                <option value="">Выберите operation</option>
                {operations.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.name || `${op.type || "operation"} ${op.id}`} (ID: {op.id})
                  </option>
                ))}
                {operationId &&
                  !operations.some((op) => String(op.id) === operationId) && (
                    <option value={operationId}>{`operation ID: ${operationId}`}</option>
                  )}
              </select>
            </div>
            {loadingRefs && (
              <p className="text-zinc-500 dark:text-zinc-400">Загрузка списка возможностей и API...</p>
            )}
            {formError && <p className="text-red-700 dark:text-red-300">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded border border-zinc-300 px-3 py-1 dark:border-zinc-600"
                disabled={saving}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                className="rounded bg-amber-600 px-3 py-1 text-white disabled:opacity-50"
                disabled={saving}
              >
                {saving ? "Сохранение..." : "Сохранить шаг"}
              </button>
            </div>
          </div>
        )}
        {rels.length > 0 && (
          <div>
            <h5 className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">Связи</h5>
            <ul className="space-y-2">{rels.map((r, i) => (
              <RelationRow key={r.id ?? `${i}-${r.order}`} r={r} />
            ))}</ul>
          </div>
        )}
      </div>
    </details>
  );
}

export function CjBiDetailPanel({
  bi,
  onStepSaved,
}: {
  bi: BiDetailV3;
  onStepSaved?: () => Promise<void> | void;
}) {
  const flowLinks = asLinks(bi.flowLink as unknown[] | undefined);
  const docs = asLinks(bi.document as unknown[] | undefined);
  const mockups = asLinks(bi.mockupLink as unknown[] | undefined);
  const steps = asScenarioSteps(bi.biSteps as unknown[] | undefined);
  const participants = bi.participants;
  const channels = bi.channel;

  return (
    <details className="group rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <summary className="flex cursor-pointer list-none items-stretch gap-0 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 flex-1 flex-col gap-1 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {bi.name || "—"}
            </span>
            {bi.uniqueIdent && (
              <span className="ml-2 font-mono text-xs text-zinc-500">{bi.uniqueIdent}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            {bi.id != null && <span className="font-mono">ID: {bi.id}</span>}
            {bi.isDraft !== undefined && (
              <span className="rounded bg-zinc-200 px-1.5 py-0.5 dark:bg-zinc-700">
                {bi.isDraft ? "черновик" : "опубликован"}
              </span>
            )}
            {bi.isCommunal && <span className="rounded bg-zinc-200 px-1.5 py-0.5 dark:bg-zinc-700">коммунальный</span>}
            {bi.isTarget && <span className="rounded bg-amber-100 px-1.5 py-0.5 dark:bg-amber-900/50">целевой</span>}
            <span className="text-zinc-400 transition group-open:rotate-90">▶</span>
          </div>
        </div>
      </summary>

      <div className="space-y-4 border-t border-zinc-200 px-4 py-4 dark:border-zinc-700">
        {bi.descr && (
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{bi.descr}</p>
        )}

        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <AttrRow label="Статус" value={bi.status?.name} />
          <AttrRow label="Продукт (ID)" value={bi.productId} />
          <AttrRow label="Автор (ID)" value={bi.authorId} />
          <AttrRow label="EA GUID" value={bi.eaGuid} />
          <AttrRow label="Owner role" value={bi.ownerRole} />
          <AttrRow label="Ощущения (feelings)" value={bi.feelings?.name} />
          <AttrRow label="Touch points" value={bi.touchPoints} />
          <AttrRow label="Metrics" value={bi.metrics} />
          <AttrRow label="Создан" value={bi.createdDate} />
          <AttrRow label="Изменён" value={bi.lastModifiedDate} />
        </div>

        {bi.clientScenario && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Сценарий клиента</h4>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {bi.clientScenario}
            </p>
          </div>
        )}
        {bi.ucsReaction && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">UCS reaction</h4>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {bi.ucsReaction}
            </p>
          </div>
        )}

        {participants && participants.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Участники</h4>
            <ul className="space-y-2">{participants.map((p, i) => (
              <li
                key={i}
                className="rounded border border-zinc-100 bg-zinc-50/80 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-800/50"
              >
                {typeof p === "object" && p !== null ? (
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs">
                    {JSON.stringify(p, null, 2)}
                  </pre>
                ) : (
                  String(p)
                )}
              </li>
            ))}</ul>
          </div>
        )}

        {channels && channels.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Каналы</h4>
            <ul className="flex flex-wrap gap-2">
              {channels.map((c, i) => (
                <li
                  key={i}
                  className="rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800"
                >
                  {typeof c === "object" && c !== null && "name" in c
                    ? String((c as { name?: string }).name)
                    : JSON.stringify(c)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <LinksBlock title="Flow / ссылки" items={flowLinks} />
          <LinksBlock title="Документы" items={docs} />
          <LinksBlock title="Макеты" items={mockups} />
        </div>

        {steps.length > 0 && (
          <div>
            <h4 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Шаги сценария (BI steps) — {steps.length}
            </h4>
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <ScenarioStepBlock
                  key={step.id ?? `${idx}-${step.uniqueIdent}`}
                  step={step}
                  index={idx}
                  onSaved={onStepSaved}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
