"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d").then((mod) => mod.default),
  { ssr: false }
);

type ForceGraphRef = import("react-force-graph-2d").ForceGraphMethods | undefined;

type ViewMode = "table" | "graph";

const LABEL_COLORS = [
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
  "#6366f1", // indigo
  "#14b8a6", // teal
];

function getLabelColorMap(nodes: { labels?: string[] }[]): Map<string, string> {
  const labels = new Set<string>();
  for (const n of nodes) {
    const first = n.labels?.[0];
    if (first) labels.add(first);
  }
  const map = new Map<string, string>();
  let i = 0;
  for (const label of [...labels].sort()) {
    map.set(label, LABEL_COLORS[i % LABEL_COLORS.length]);
    i++;
  }
  return map;
}

function nodeId(obj: { labels?: string[]; properties?: Record<string, unknown> }): string {
  const p = obj.properties ?? {};
  const name = (p.name ?? p.external_name ?? p.cmdb ?? p.id) as string | undefined;
  if (name != null) return String(name);
  const labels = (obj.labels ?? []).join(":");
  return `${labels}:${JSON.stringify(p)}`;
}

type GraphNode = {
  id: string;
  labels?: string[];
  name?: string;
  properties?: Record<string, unknown>;
};

function extractGraphData(records: Record<string, unknown>[]) {
  const nodesMap = new Map<string, GraphNode>();
  const links: { source: string; target: string; type?: string }[] = [];

  for (const record of records) {
    const entries = Object.entries(record);
    const nodes: { key: string; data: { labels?: string[]; properties?: Record<string, unknown> } }[] = [];
    let rel: { type?: string; sourceKey?: string; targetKey?: string } | null = null;

    for (const [key, val] of entries) {
      if (val && typeof val === "object" && "labels" in val && Array.isArray((val as { labels?: string[] }).labels)) {
        const v = val as { labels?: string[]; properties?: Record<string, unknown> };
        const id = nodeId(v);
        nodes.push({ key, data: v });
        nodesMap.set(id, {
          id,
          labels: v.labels,
          name: (v.properties?.name ?? v.properties?.external_name ?? v.properties?.cmdb) as string | undefined,
          properties: v.properties,
        });
      } else if (
        val &&
        typeof val === "object" &&
        "type" in val &&
        typeof (val as { type?: string }).type === "string"
      ) {
        const v = val as { type?: string };
        rel = { type: v.type };
      }
    }

    if (rel && nodes.length >= 2) {
      rel.sourceKey = nodes[0].key;
      rel.targetKey = nodes[1].key;
      const srcId = nodeId(nodes[0].data);
      const tgtId = nodeId(nodes[1].data);
      if (srcId && tgtId) {
        links.push({ source: srcId, target: tgtId, type: rel.type });
      }
    } else if (nodes.length === 1) {
      nodeId(nodes[0].data);
    }
  }

  const nodesList = Array.from(nodesMap.values());
  const nodeIds = new Set(nodesList.map((n) => n.id));
  const validLinks = links.filter(
    (l) => nodeIds.has(l.source as string) && nodeIds.has(l.target as string)
  );
  return { nodes: nodesList, links: validLinks };
}

const EXAMPLE_QUERIES = [
  "MATCH (n) RETURN n LIMIT 25",
  "MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 50",
  "MATCH (n:SoftwareSystem) RETURN n LIMIT 20",
  "MATCH (n:DeploymentNode)-[r:Child]->(m) RETURN n, r, m LIMIT 30",
];

const RECENT_QUERIES_KEY = "beeatlas-cypher-recent-queries";
const MAX_RECENT = 15;

function loadRecentQueries(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_QUERIES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((q): q is string => typeof q === "string") : [];
  } catch {
    return [];
  }
}

function saveRecentQueries(queries: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(RECENT_QUERIES_KEY, JSON.stringify(queries.slice(0, MAX_RECENT)));
  } catch {
    // ignore
  }
}

export default function CypherTab() {
  const graphRef = useRef<ForceGraphRef>(undefined);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState(EXAMPLE_QUERIES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<Record<string, unknown>[] | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [panelWidth, setPanelWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ x: number; w: number } | null>(null);

  useEffect(() => {
    setMounted(true);
    setRecentQueries(loadRecentQueries());
  }, []);

  const graphData = useMemo(() => {
    if (!records?.length) return null;
    return extractGraphData(records);
  }, [records]);

  useEffect(() => {
    if (!graphData) return;
    const g = graphRef.current as { d3Force?: (n: string) => { distance?: (d: number) => unknown; strength?: (s: number) => unknown }; d3ReheatSimulation?: () => void } | null;
    if (!g?.d3Force) return;
    const linkForce = g.d3Force("link");
    if (linkForce?.distance) linkForce.distance(120);
    if (linkForce?.strength) linkForce.strength(0.15);
    g.d3ReheatSimulation?.();
  }, [graphData]);

  const labelColorMap = useMemo(() => {
    if (!graphData?.nodes.length) return null;
    return getLabelColorMap(graphData.nodes);
  }, [graphData]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartRef.current = { x: e.clientX, w: panelWidth };
    setIsResizing(true);
  }, [panelWidth]);

  useEffect(() => {
    if (!isResizing) return;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (e: MouseEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const delta = e.clientX - start.x;
      const newWidth = Math.min(600, Math.max(200, start.w - delta));
      setPanelWidth(newWidth);
    };
    const onUp = () => {
      resizeStartRef.current = null;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  const columns = useMemo(() => {
    if (!records?.length) return [];
    const keys = new Set<string>();
    for (const r of records) {
      for (const k of Object.keys(r)) keys.add(k);
    }
    return Array.from(keys);
  }, [records]);

  const runQuery = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setError("Введите CYPHER запрос");
      return;
    }
    setLoading(true);
    setError(null);
    setRecords(null);
    try {
      const res = await fetch("/api/graph/cypher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : res.statusText);
      }
      if (!Array.isArray(data)) {
        throw new Error("Некорректный формат ответа");
      }
      setRecords(data);
      setSelectedNode(null);
      const qTrimmed = q.trim();
      if (qTrimmed) {
        setRecentQueries((prev) => {
          const next = [qTrimmed, ...prev.filter((x) => x !== qTrimmed)].slice(0, MAX_RECENT);
          saveRecentQueries(next);
          return next;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка выполнения запроса");
    } finally {
      setLoading(false);
    }
  }, [query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
      <details
        className="group shrink-0 rounded-lg border border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-800/30"
      >
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between">
            <span>CYPHER запрос</span>
            <span className="hidden text-zinc-500 dark:text-zinc-400 group-open:inline">
              ▼ Свернуть
            </span>
            <span className="text-zinc-500 dark:text-zinc-400 group-open:hidden">
              ▶ Развернуть
            </span>
          </span>
        </summary>
        <div className="space-y-3 border-t border-zinc-200 px-4 pb-4 pt-3 dark:border-zinc-700">
          <div>
            <label
              htmlFor="cypher-query"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Запрос
            </label>
            <textarea
              id="cypher-query"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setError(null);
              }}
              rows={4}
              placeholder="MATCH (n) RETURN n LIMIT 10"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 placeholder-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-400"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={runQuery}
              disabled={loading || !query.trim()}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Выполнение…" : "Выполнить"}
            </button>
            {recentQueries.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Нед. запросы:</span>
                <select
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) {
                      setQuery(v);
                      e.target.value = "";
                    }
                  }}
                  className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
                >
                  <option value="">Выбрать…</option>
                  {recentQueries.map((q) => (
                    <option key={q} value={q}>
                      {q.length > 60 ? `${q.slice(0, 57)}…` : q}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {EXAMPLE_QUERIES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setQuery(ex)}
                  title={ex}
                  className="rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                >
                  {ex.slice(0, 30)}…
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Выполнение запросов к Neo4j через architect-graph-service.
          </p>
        </div>
      </details>

      {error && (
        <div className="shrink-0 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      {records && (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="shrink-0 flex gap-2 border-b border-zinc-200 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`border-b-2 px-1 py-2 text-sm font-medium transition-colors ${
                viewMode === "table"
                  ? "border-amber-500 text-amber-600 dark:text-amber-400"
                  : "border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              Таблица ({records.length} записей)
            </button>
            <button
              type="button"
              onClick={() => setViewMode("graph")}
              className={`border-b-2 px-1 py-2 text-sm font-medium transition-colors ${
                viewMode === "graph"
                  ? "border-amber-500 text-amber-600 dark:text-amber-400"
                  : "border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              Граф
              {graphData && ` (${graphData.nodes.length} узлов, ${graphData.links.length} связей)`}
            </button>
          </div>

          {viewMode === "table" && (
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                  <tr>
                    <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">#</th>
                    {columns.map((col) => (
                      <th key={col} className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700">
                  {records.map((row, i) => (
                    <tr key={i} className="bg-white dark:bg-zinc-900">
                      <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">{i + 1}</td>
                      {columns.map((col) => (
                        <td key={col} className="px-3 py-2">
                          {(() => {
                            const v = row[col];
                            if (v == null) return "—";
                            if (typeof v === "object" && v !== null && "labels" in v) {
                              const obj = v as { labels?: string[]; properties?: Record<string, unknown> };
                              return (
                                <span className="font-mono text-xs">
                                  {obj.labels?.join(":") ?? "Node"}{" "}
                                  {obj.properties && Object.keys(obj.properties).length > 0
                                    ? JSON.stringify(obj.properties)
                                    : ""}
                                </span>
                              );
                            }
                            if (typeof v === "object" && v !== null && "type" in v) {
                              const obj = v as { type?: string; properties?: Record<string, unknown> };
                              return (
                                <span className="font-mono text-xs">
                                  —[{obj.type ?? "?"}]→
                                  {obj.properties && Object.keys(obj.properties).length > 0
                                    ? ` ${JSON.stringify(obj.properties)}`
                                    : ""}
                                </span>
                              );
                            }
                            return String(v);
                          })()}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {viewMode === "graph" && graphData && graphData.nodes.length > 0 && mounted && (
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 pr-0">
                {labelColorMap && labelColorMap.size > 0 && (
                  <div className="shrink-0 flex flex-wrap gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/50">
                    {[...labelColorMap.entries()].map(([label, color]) => (
                      <span key={label} className="flex items-center gap-1.5 text-sm">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                          aria-hidden
                        />
                        <span className="text-zinc-700 dark:text-zinc-300">{label}</span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="min-h-[300px] flex-1 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                  <ForceGraph2D
                    ref={graphRef}
                    graphData={graphData}
                    nodeLabel={(n) => (n as { name?: string }).name ?? (n as { id?: string }).id ?? ""}
                    linkLabel={(l) => (l as { type?: string }).type ?? ""}
                    nodeColor={(n) =>
                      labelColorMap?.get((n as { labels?: string[] }).labels?.[0] ?? "") ?? "#94a3b8"
                    }
                    nodeVal={(n) => {
                      const nodeId = (n as { id?: string }).id;
                      const degree = graphData.links.filter(
                        (l) =>
                          (typeof l.source === "object" ? (l.source as { id?: string })?.id : l.source) === nodeId ||
                          (typeof l.target === "object" ? (l.target as { id?: string })?.id : l.target) === nodeId
                      ).length;
                      return (4 + Math.max(degree, 0) ** 2) / 150;
                    }}
                    nodeRelSize={6}
                    onNodeClick={(n) => setSelectedNode(n as GraphNode)}
                    onBackgroundClick={() => setSelectedNode(null)}
                  />
                </div>
              </div>
              <div
                role="separator"
                aria-orientation="vertical"
                onMouseDown={handleResizeStart}
                className={`shrink-0 w-2 cursor-col-resize select-none bg-zinc-200 hover:bg-amber-500/50 dark:bg-zinc-700 dark:hover:bg-amber-500/50 ${isResizing ? "bg-amber-500/70" : ""}`}
                title="Перетащите для изменения ширины"
              />
              {selectedNode ? (
                <div
                  className="ml-1 flex shrink-0 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                  style={{ width: panelWidth }}
                >
                  <div className="shrink-0 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {selectedNode.name ?? selectedNode.id}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedNode(null)}
                        className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                        aria-label="Закрыть"
                      >
                        ✕
                      </button>
                    </div>
                    {selectedNode.labels?.length ? (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {selectedNode.labels.join(" : ")}
                      </span>
                    ) : null}
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="sticky top-0 border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                        <tr>
                          <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                            Свойство
                          </th>
                          <th className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                            Значение
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700">
                        <tr>
                          <td className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">id</td>
                          <td className="max-w-[200px] truncate px-3 py-2 font-mono text-xs text-zinc-900 dark:text-zinc-100">
                            {selectedNode.id}
                          </td>
                        </tr>
                        {selectedNode.labels?.length ? (
                          <tr>
                            <td className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">
                              labels
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-zinc-900 dark:text-zinc-100">
                              {selectedNode.labels.join(", ")}
                            </td>
                          </tr>
                        ) : null}
                        {selectedNode.properties &&
                          Object.entries(selectedNode.properties).map(([key, val]) => (
                            <tr key={key}>
                              <td className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">
                                {key}
                              </td>
                              <td className="max-w-[200px] break-all px-3 py-2 font-mono text-xs text-zinc-900 dark:text-zinc-100">
                                {typeof val === "object" && val !== null
                                  ? JSON.stringify(val)
                                  : String(val ?? "—")}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div
                  className="ml-1 flex shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 py-8 dark:border-zinc-600 dark:bg-zinc-800/30"
                  style={{ width: panelWidth }}
                >
                  <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
                    Выберите узел на графе
                  </p>
                  <p className="mt-1 text-center text-xs text-zinc-400 dark:text-zinc-500">
                    для просмотра свойств
                  </p>
                </div>
              )}
            </div>
          )}

          {viewMode === "graph" && graphData && graphData.nodes.length === 0 && (
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
              Не удалось извлечь узлы для графа. Используйте запросы вида MATCH (n)-[r]-&gt;(m) RETURN n, r, m
            </p>
          )}
        </div>
      )}
    </div>
  );
}
