"use client";

import { useCallback, useEffect, useState } from "react";

function DotDiagram({ dot }: { dot: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);

  const renderDot = useCallback(async () => {
    if (!dot.trim()) return;
    setErr(null);
    setSvg(null);
    setRendering(true);
    try {
      const { Graphviz } = await import("@hpcc-js/wasm");
      const graphviz = await Graphviz.load();
      const result = graphviz.dot(dot);
      setSvg(result);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка рендеринга DOT");
    } finally {
      setRendering(false);
    }
  }, [dot]);

  useEffect(() => {
    renderDot();
  }, [renderDot]);

  if (!dot.trim()) return null;

  return (
    <div className="space-y-3">
      {rendering && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Отрисовка диаграммы…
        </p>
      )}
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {err}
        </div>
      )}
      {svg && (
        <div className="overflow-auto rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <div
            className="min-w-0"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      )}
    </div>
  );
}

type DirectionMode = "dependent" | "influence";

export default function ContextDiagramTab() {
  const [mnemonic, setMnemonic] = useState("");
  const [directionMode, setDirectionMode] = useState<DirectionMode>("dependent");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dot, setDot] = useState<string | null>(null);
  const [json, setJson] = useState<string | null>(null);

  const handleBuild = useCallback(async () => {
    const code = mnemonic.trim();
    if (!code) {
      setError("Введите мнемонику приложения (код продукта)");
      return;
    }
    setLoading(true);
    setError(null);
    setDot(null);
    setJson(null);
    try {
      const dotUrl =
        directionMode === "influence"
          ? `/api/graph/context-influence-dot?cmdb=${encodeURIComponent(code)}`
          : `/api/graph/context-dot?cmdb=${encodeURIComponent(code)}`;

      const [dotRes, jsonRes] = await Promise.all([
        fetch(dotUrl),
        fetch(`/api/graph/context?mnemonic=${encodeURIComponent(code)}`),
      ]);

      if (!dotRes.ok) {
        const data = await dotRes.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || dotRes.statusText
        );
      }
      const dotText = await dotRes.text();
      setDot(dotText);

      if (jsonRes.ok) {
        const jsonText = await jsonRes.text();
        setJson(jsonText);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [mnemonic, directionMode]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            htmlFor="context-mnemonic"
            className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Мнемоника приложения (код продукта)
          </label>
          <input
            id="context-mnemonic"
            type="text"
            value={mnemonic}
            onChange={(e) => {
              setMnemonic(e.target.value);
              setError(null);
            }}
            placeholder="например: pbe_retention, FDMSHOWCASEAPP"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-400"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Направление
          </span>
          <div className="flex rounded-lg border border-zinc-300 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
            <button
              type="button"
              onClick={() => setDirectionMode("dependent")}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                directionMode === "dependent"
                  ? "bg-white text-amber-600 shadow dark:bg-zinc-700 dark:text-amber-400"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              Зависимые
            </button>
            <button
              type="button"
              onClick={() => setDirectionMode("influence")}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                directionMode === "influence"
                  ? "bg-white text-amber-600 shadow dark:bg-zinc-700 dark:text-amber-400"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              Зависящие
            </button>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {directionMode === "dependent"
              ? "Кто нас вызывает"
              : "Кого мы вызываем"}
          </p>
        </div>
        <button
          type="button"
          onClick={handleBuild}
          disabled={loading || !mnemonic.trim()}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Загрузка…" : "Построить диаграмму"}
        </button>
      </div>

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Введите код продукта (cmdb / softwareSystemMnemonic) для построения
        контекстной диаграммы C4 — система и её внешние зависимости.
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      {dot && <DotDiagram dot={dot} />}

      {json && (
        <details className="rounded-lg border border-zinc-200 dark:border-zinc-700">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Structurizr JSON (workspace)
          </summary>
          <pre className="max-h-64 overflow-auto p-4 text-xs text-zinc-600 dark:text-zinc-400">
            {(() => {
              try {
                return JSON.stringify(JSON.parse(json), null, 2);
              } catch {
                return json;
              }
            })()}
          </pre>
        </details>
      )}
    </div>
  );
}
