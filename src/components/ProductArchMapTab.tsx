"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GraphCanvas, type GraphCanvasHandle } from "@/components/archmap/components/GraphCanvas";
import type { C4Node as ArchNode, GraphEdge as ArchEdge } from "@/components/archmap/types/c4";

type GraphTag = "Global" | "Local" | "All";
type C4Label =
  | "SoftwareSystem"
  | "Container"
  | "Component"
  | "DeploymentNode"
  | "Environment"
  | "ContainerInstance"
  | "InfrastructureNode";

type C4Node = {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
  name: string;
  description?: string;
  technology?: string;
};

type GraphEdge = {
  source: string;
  target: string;
  type: string;
  technology?: string;
};

type GraphData = {
  nodes: C4Node[];
  edges: GraphEdge[];
};

const TAG_STORAGE_KEY = "archmap-node-tags-v1";
const MAX_NODE_TAG_LENGTH = 128;

const KNOWN_LABELS = [
  "SoftwareSystem",
  "Container",
  "Component",
  "DeploymentNode",
  "Environment",
  "ContainerInstance",
  "InfrastructureNode",
] as const;

const C4_LABELS: { value: C4Label; display: string }[] = [
  { value: "SoftwareSystem", display: "Software System" },
  { value: "Container", display: "Container" },
  { value: "Component", display: "Component" },
  { value: "DeploymentNode", display: "Deployment Node" },
  { value: "Environment", display: "Environment" },
  { value: "ContainerInstance", display: "Container Instance" },
  { value: "InfrastructureNode", display: "Infrastructure Node" },
];

const C4_COLORS: Record<string, string> = {
  SoftwareSystem: "#1A73E8",
  Container: "#00897B",
  Component: "#7B1FA2",
  DeploymentNode: "#E65100",
  Environment: "#455A64",
  ContainerInstance: "#00897B",
  InfrastructureNode: "#6D4C41",
};

function stableNodeId(raw: { labels?: string[]; properties?: Record<string, unknown> }): string {
  const p = raw.properties ?? {};
  const name = (p.name ?? p.external_name ?? p.cmdb ?? p.id) as string | undefined;
  if (name != null) return String(name);
  const labels = (raw.labels ?? []).join(":");
  return `${labels}:${JSON.stringify(p)}`;
}

function toC4Node(raw: { labels?: string[]; properties?: Record<string, unknown> }): C4Node {
  const labels = raw.labels ?? [];
  const p = raw.properties ?? {};
  const id = stableNodeId(raw);
  return {
    id,
    labels: [...labels],
    properties: p,
    name: String(p.name ?? p.external_name ?? p.cmdb ?? id),
    description: typeof p.description === "string" ? p.description : undefined,
    technology: typeof p.technology === "string" ? p.technology : undefined,
  };
}

function parseNodesFromRows(rows: Record<string, unknown>[], column = "n"): C4Node[] {
  const out: C4Node[] = [];
  for (const row of rows) {
    const v = row[column] ?? row[Object.keys(row)[0]];
    if (v && typeof v === "object" && "labels" in v && Array.isArray((v as { labels?: unknown }).labels)) {
      out.push(toC4Node(v as { labels?: string[]; properties?: Record<string, unknown> }));
    }
  }
  const seen = new Set<string>();
  return out.filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
}

/**
 * Узлы: якорь + 1-hop соседи. Рёбра: полный подграф на этом множестве (в т.ч. связь сосед–сосед,
 * напр. контейнер–контейнер), а не только рёбра через якорь.
 */
function filterDirectNeighborhood(graph: GraphData, anchorId: string): GraphData {
  const allowed = new Set<string>([anchorId]);
  for (const e of graph.edges) {
    if (e.source === anchorId) allowed.add(e.target);
    if (e.target === anchorId) allowed.add(e.source);
  }
  const nodes = graph.nodes.filter((n) => allowed.has(n.id));
  const idSet = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => idSet.has(e.source) && idSet.has(e.target));
  return { nodes, edges };
}

/** Для DeploymentEnvironment: показываем только связанные DeploymentNode (без ContainerInstance). */
function filterDeploymentEnvironmentNeighborhood(graph: GraphData, anchorId: string): GraphData {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const allowed = new Set<string>([anchorId]);
  for (const e of graph.edges) {
    const neighborId = e.source === anchorId ? e.target : e.target === anchorId ? e.source : null;
    if (!neighborId) continue;
    const neighbor = byId.get(neighborId);
    if (!neighbor) continue;
    const labels = new Set(neighbor.labels);
    if (labels.has("DeploymentNode")) {
      allowed.add(neighborId);
    }
  }
  const nodes = graph.nodes.filter((n) => allowed.has(n.id));
  const idSet = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter(
    (e) =>
      idSet.has(e.source) &&
      idSet.has(e.target) &&
      (e.source === anchorId || e.target === anchorId)
  );
  return { nodes, edges };
}

function parseGraphFromRows(rows: Record<string, unknown>[]): GraphData {
  const nodesMap = new Map<string, C4Node>();
  const edges: GraphEdge[] = [];

  for (const row of rows) {
    const nVal = row.n;
    const mVal = row.m;
    const rVal = row.r;

    if (nVal && typeof nVal === "object" && "labels" in nVal) {
      const n = toC4Node(nVal as { labels?: string[]; properties?: Record<string, unknown> });
      nodesMap.set(n.id, n);
    }
    if (mVal && typeof mVal === "object" && "labels" in mVal) {
      const m = toC4Node(mVal as { labels?: string[]; properties?: Record<string, unknown> });
      nodesMap.set(m.id, m);
    }

    if (
      nVal &&
      mVal &&
      rVal &&
      typeof nVal === "object" &&
      typeof mVal === "object" &&
      typeof rVal === "object"
    ) {
      const nId = stableNodeId(nVal as { labels?: string[]; properties?: Record<string, unknown> });
      const mId = stableNodeId(mVal as { labels?: string[]; properties?: Record<string, unknown> });
      const rel = rVal as { type?: unknown; properties?: Record<string, unknown> };
      const relType =
        typeof rel.type === "string"
          ? rel.type
          : rel.type != null
            ? String(rel.type)
            : "RELATED";
      const technology = rel.properties?.technology;
      edges.push({
        source: nId,
        target: mId,
        type: relType,
        technology: typeof technology === "string" ? technology : undefined,
      });
    }
  }

  return { nodes: Array.from(nodesMap.values()), edges: dedupeGraphEdges(edges) };
}

function dedupeGraphEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  const out: GraphEdge[] = [];
  for (const e of edges) {
    const key = `${e.source}|${e.target}|${e.type}|${e.technology ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

async function executeCypher(query: string): Promise<Record<string, unknown>[]> {
  const res = await fetch("/api/graph/cypher", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : res.statusText);
  }
  if (!Array.isArray(data)) {
    throw new Error("Некорректный формат ответа graph API");
  }
  return data as Record<string, unknown>[];
}

function graphTagPredicate(alias: string, tag: GraphTag): string {
  if (tag === "All") return "true";
  return `${alias}.graphTag = '${tag}'`;
}

function mainLabel(labels: string[]): string {
  return labels.find((l) => KNOWN_LABELS.includes(l as (typeof KNOWN_LABELS)[number])) ?? labels[0] ?? "unknown";
}

function escapeCypherString(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; ) {
    const cp = value.codePointAt(i);
    if (cp == null) break;
    if (cp === 0x5c) out += "\\\\";
    else if (cp === 0x27) out += "\\'";
    else if (cp < 128) out += String.fromCodePoint(cp);
    else if (cp <= 0xffff) out += `\\u${cp.toString(16).padStart(4, "0")}`;
    else {
      const h = Math.floor((cp - 0x10000) / 0x400) + 0xd800;
      const l = ((cp - 0x10000) % 0x400) + 0xdc00;
      out += `\\u${h.toString(16).padStart(4, "0")}\\u${l.toString(16).padStart(4, "0")}`;
    }
    i += cp > 0xffff ? 2 : 1;
  }
  return out;
}

async function searchByLabelAndName(graphTag: GraphTag, label: C4Label, name?: string): Promise<C4Node[]> {
  const tagWhere = graphTagPredicate("n", graphTag);
  let query = `MATCH (n:${label}) WHERE ${tagWhere}`;
  if (name?.trim()) {
    query += ` AND toLower(coalesce(n.name, '')) CONTAINS toLower('${escapeCypherString(name.trim())}')`;
  }
  query += " RETURN n ORDER BY n.name LIMIT 100";
  const rows = await executeCypher(query);
  return parseNodesFromRows(rows, "n");
}

async function loadNeighborhoodSubgraph(node: C4Node, graphTag: GraphTag): Promise<GraphData> {
  const mLabel = mainLabel(node.labels);
  const nodeName = escapeCypherString(node.name);
  const label = escapeCypherString(mLabel);
  const where = `anchor.name = '${nodeName}' AND '${label}' IN labels(anchor) AND ${graphTagPredicate("anchor", graphTag)}`;
  // 1-hop соседи, затем все рёбра между узлами {anchor} ∪ соседи. Пары без дубля: id() (совместимо с Neo4j 4/5).
  const query = `
MATCH (anchor)
WHERE ${where}
OPTIONAL MATCH (anchor)-[r0]-(m)
WITH anchor, [x IN collect(DISTINCT m) WHERE x IS NOT NULL] AS neigh
WITH [anchor] + neigh AS nodes
UNWIND nodes AS n1
UNWIND nodes AS n2
WITH n1, n2
WHERE id(n1) < id(n2)
MATCH (n1)-[r]-(n2)
RETURN startNode(r) AS n, r, endNode(r) AS m
LIMIT 800
  `.trim();

  const [anchorRows, edgeRows] = await Promise.all([
    executeCypher(`MATCH (anchor) WHERE ${where} RETURN anchor AS n LIMIT 1`),
    executeCypher(query),
  ]);
  return parseGraphFromRows([...anchorRows, ...edgeRows]);
}

export default function ProductArchMapTab({
  productName,
  productAlias,
}: {
  productName: string;
  productAlias: string;
}) {
  const [graphTag, setGraphTag] = useState<GraphTag>("All");
  const [searchLabel, setSearchLabel] = useState<C4Label>("SoftwareSystem");
  const [searchName, setSearchName] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [graphLoading, setGraphLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<C4Node[]>([]);
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState<C4Node | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [tagsState, setTagsState] = useState<Record<string, string[]>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem(TAG_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : {};
      return parsed && typeof parsed === "object" ? (parsed as Record<string, string[]>) : {};
    } catch {
      return {};
    }
  });
  const [newTag, setNewTag] = useState("");
  const graphRef = useRef<GraphCanvasHandle>(null);

  const persistTags = useCallback((next: Record<string, string[]>) => {
    setTagsState(next);
    try {
      localStorage.setItem(TAG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const loadSystemRoot = useCallback(async () => {
    const needle = productName.trim();
    if (!needle && !productAlias.trim()) return;
    setGraphLoading(true);
    setError(null);
    try {
      // Сначала ищем по product.name, затем fallback на alias.
      const systemsByName = needle
        ? await searchByLabelAndName(graphTag, "SoftwareSystem", needle)
        : [];
      const systems = systemsByName.length
        ? systemsByName
        : await searchByLabelAndName(graphTag, "SoftwareSystem", productAlias);
      setResults(systems);
      const exact =
        systems.find((s) => s.name.trim().toLowerCase() === needle.toLowerCase()) ??
        systems.find((s) => s.name.trim().toLowerCase() === productAlias.trim().toLowerCase()) ??
        systems[0];
      if (!exact) {
        setGraph({ nodes: [], edges: [] });
        setSelectedNode(null);
        setPath([needle || productAlias]);
        return;
      }
      const subgraph = await loadNeighborhoodSubgraph(exact, graphTag);
      setGraph(subgraph);
      setSelectedNode(exact);
      setPath([exact.name]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки диаграммы");
    } finally {
      setGraphLoading(false);
    }
  }, [graphTag, productAlias, productName]);

  useEffect(() => {
    void loadSystemRoot();
  }, [loadSystemRoot]);

  const runSearch = useCallback(async () => {
    setSearchLoading(true);
    setError(null);
    try {
      const nodes = await searchByLabelAndName(graphTag, searchLabel, searchName);
      setResults(nodes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка поиска");
      setResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [graphTag, searchLabel, searchName]);

  const openNode = useCallback(
    async (node: C4Node, addToPath = true) => {
      setGraphLoading(true);
      setError(null);
      try {
        const subgraph = await loadNeighborhoodSubgraph(node, graphTag);
        setGraph(subgraph);
        setSelectedNode(node);
        setPath((prev) => (addToPath ? [...prev, node.name] : [node.name]));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка загрузки узла");
      } finally {
        setGraphLoading(false);
      }
    },
    [graphTag]
  );

  const graphData = useMemo(() => {
    let nodes = graph.nodes as ArchNode[];
    let edges = graph.edges as ArchEdge[];
    if (selectedNode) {
      const selectedLabels = new Set(selectedNode.labels);
      const isDeploymentEnvironment =
        selectedLabels.has("DeploymentEnvironment") || selectedLabels.has("Environment");
      if (isDeploymentEnvironment) {
        const f = filterDeploymentEnvironmentNeighborhood(graph, selectedNode.id);
        nodes = f.nodes as ArchNode[];
        edges = f.edges as ArchEdge[];
      } else if (!selectedLabels.has("SoftwareSystem")) {
        const f = filterDirectNeighborhood(graph, selectedNode.id);
        nodes = f.nodes as ArchNode[];
        edges = f.edges as ArchEdge[];
      }
    }
    return { nodes, edges };
  }, [graph.edges, graph.nodes, selectedNode]);
  const displayedNodes = useMemo(
    () =>
      [...(graphData.nodes as C4Node[])].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [graphData.nodes]
  );

  const selectedTags = selectedNode ? tagsState[selectedNode.id] ?? [] : [];
  const tagCountByNodeId = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, tags] of Object.entries(tagsState)) {
      if (tags.length > 0) m.set(id, tags.length);
    }
    return m;
  }, [tagsState]);

  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
      <aside className={`${leftCollapsed ? "w-12" : "w-80"} flex shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/70 p-2 dark:border-zinc-700 dark:bg-zinc-800/30`}>
        <button
          type="button"
          onClick={() => setLeftCollapsed((v) => !v)}
          className="mb-2 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
          title={leftCollapsed ? "Развернуть левую панель" : "Свернуть левую панель"}
        >
          {leftCollapsed ? "»" : "«"}
        </button>
        {!leftCollapsed && (
          <>
        <div className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          Навигация
        </div>
        <div className="mb-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          Текущий путь: {path.length ? path.join(" / ") : "—"}
        </div>

        <button
          type="button"
          onClick={() => void loadSystemRoot()}
          className="mb-3 rounded-md border border-amber-500 bg-amber-50 px-3 py-2 text-left text-sm font-medium text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/40"
        >
          Система: {productName || "—"}
        </button>

        <div className="mb-2 grid grid-cols-1 gap-2">
          <select
            value={graphTag}
            onChange={(e) => setGraphTag(e.target.value as GraphTag)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          >
            <option value="Global">Global</option>
            <option value="Local">Local</option>
            <option value="All">All</option>
          </select>
          <select
            value={searchLabel}
            onChange={(e) => setSearchLabel(e.target.value as C4Label)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          >
            {C4_LABELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.display}
              </option>
            ))}
          </select>
          <input
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
            placeholder="Поиск по имени"
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          />
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={searchLoading}
            className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-white hover:bg-zinc-900 disabled:opacity-50 dark:bg-zinc-700 dark:hover:bg-zinc-600"
          >
            {searchLoading ? "Поиск..." : "Найти"}
          </button>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button type="button" onClick={() => graphRef.current?.zoomIn()} className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600">
              Zoom +
            </button>
            <button type="button" onClick={() => graphRef.current?.zoomOut()} className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600">
              Zoom -
            </button>
            <button type="button" onClick={() => graphRef.current?.fitToScreen()} className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600">
              FIT
            </button>
            <button type="button" onClick={() => graphRef.current?.exportPng()} className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600">
              PNG
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          {results.map((node) => {
            const label = mainLabel(node.labels);
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => void openNode(node)}
                className="flex w-full flex-col items-start border-b border-zinc-100 px-3 py-2 text-left hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60"
              >
                <span className="text-[10px] font-semibold" style={{ color: C4_COLORS[label] ?? "#777" }}>
                  [{label}]
                </span>
                <span className="text-sm text-zinc-800 dark:text-zinc-200">{node.name}</span>
              </button>
            );
          })}
          {results.length === 0 && (
            <div className="px-3 py-4 text-sm text-zinc-500 dark:text-zinc-400">Нет результатов</div>
          )}
        </div>

        <div className="mt-3 min-h-0 max-h-64 overflow-auto rounded-md border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          <div className="sticky top-0 border-b border-zinc-100 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-300">
            На диаграмме ({displayedNodes.length})
          </div>
          {displayedNodes.map((node) => {
            const label = mainLabel(node.labels);
            const isActive = selectedNode?.id === node.id;
            return (
              <button
                key={`graph-node-${node.id}`}
                type="button"
                onClick={() => void openNode(node)}
                className={`flex w-full flex-col items-start border-b border-zinc-100 px-3 py-2 text-left hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60 ${
                  isActive ? "bg-zinc-100 dark:bg-zinc-800/70" : ""
                }`}
              >
                <span className="text-[10px] font-semibold" style={{ color: C4_COLORS[label] ?? "#777" }}>
                  [{label}]
                </span>
                <span className="text-sm text-zinc-800 dark:text-zinc-200">{node.name}</span>
              </button>
            );
          })}
          {displayedNodes.length === 0 && (
            <div className="px-3 py-4 text-sm text-zinc-500 dark:text-zinc-400">На диаграмме нет узлов</div>
          )}
        </div>
          </>
        )}
      </aside>

      <main className="min-w-0 flex h-full flex-1 bg-zinc-100/60 dark:bg-zinc-900/40">
        {graphLoading && (
          <div className="flex h-full items-center justify-center text-zinc-500 dark:text-zinc-400">
            Загрузка диаграммы...
          </div>
        )}
        {!graphLoading && graphData.nodes.length === 0 && (
          <div className="flex h-full items-center justify-center text-zinc-500 dark:text-zinc-400">
            Диаграмма пуста
          </div>
        )}
        {!graphLoading && graphData.nodes.length > 0 && (
          <GraphCanvas
            ref={graphRef}
            nodes={graphData.nodes}
            edges={graphData.edges}
            focusNodeId={selectedNode?.id ?? null}
            selectedNodeId={selectedNode?.id ?? null}
            tagCountByNodeId={tagCountByNodeId}
            onNodeClick={(node) => void openNode(node as C4Node)}
            loading={graphLoading}
          />
        )}
      </main>

      <aside className={`${rightCollapsed ? "w-12" : "w-96"} flex shrink-0 flex-col border-l border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900`}>
        <button
          type="button"
          onClick={() => setRightCollapsed((v) => !v)}
          className="mb-2 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
          title={rightCollapsed ? "Развернуть правую панель" : "Свернуть правую панель"}
        >
          {rightCollapsed ? "«" : "»"}
        </button>
        {!rightCollapsed && (
          <>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Свойства</div>
          {selectedNode && (
            <button
              type="button"
              onClick={() => setSelectedNode(null)}
              className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Очистить
            </button>
          )}
        </div>
        {!selectedNode && (
          <div className="rounded-md border border-dashed border-zinc-300 px-3 py-4 text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
            Выберите элемент диаграммы
          </div>
        )}
        {selectedNode && (
          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700">
            <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
              <div className="font-medium text-zinc-900 dark:text-zinc-100">{selectedNode.name}</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">{selectedNode.labels.join(", ")}</div>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(selectedNode.properties).map(([key, value]) => (
                  <tr key={key} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="w-40 px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">{key}</td>
                    <td className="break-all px-3 py-2 font-mono text-xs text-zinc-900 dark:text-zinc-100">
                      {typeof value === "object" ? JSON.stringify(value) : String(value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-zinc-200 p-3 dark:border-zinc-700">
              <div className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Теги ({selectedTags.length})
              </div>
              <div className="mb-2 flex flex-wrap gap-1">
                {selectedTags.map((tag, idx) => (
                  <span key={`${tag}-${idx}`} className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    {tag}
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedNode) return;
                        const current = tagsState[selectedNode.id] ?? [];
                        const nextTags = current.filter((_, i) => i !== idx);
                        const next = { ...tagsState };
                        if (nextTags.length === 0) delete next[selectedNode.id];
                        else next[selectedNode.id] = nextTags;
                        persistTags(next);
                      }}
                      className="text-[10px]"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  maxLength={MAX_NODE_TAG_LENGTH}
                  placeholder="Новый тег..."
                  className="w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800"
                />
                <button
                  type="button"
                  onClick={() => {
                    const t = newTag.trim().slice(0, MAX_NODE_TAG_LENGTH);
                    if (!selectedNode || !t) return;
                    const current = tagsState[selectedNode.id] ?? [];
                    persistTags({ ...tagsState, [selectedNode.id]: [...current, t] });
                    setNewTag("");
                  }}
                  className="rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-700"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}
          </>
        )}
      </aside>
    </div>
  );
}
