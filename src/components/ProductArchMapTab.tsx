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
const PINNED_STORAGE_PREFIX = "archmap-pinned-v1-";

/** Верхняя граница длины пути в shortestPath: при меньшем значении длинные цепочки в графе не попадают в выборку. */
const SHORTEST_PATH_MAX_HOPS = 120;

type PinnedEntry = { id: string; name: string; labels: string[] };

function loadPinnedEntries(productAlias: string): PinnedEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_PREFIX + productAlias);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is PinnedEntry =>
        x != null &&
        typeof x === "object" &&
        typeof (x as PinnedEntry).id === "string" &&
        typeof (x as PinnedEntry).name === "string" &&
        Array.isArray((x as PinnedEntry).labels)
    );
  } catch {
    return [];
  }
}

function persistPinnedEntries(productAlias: string, entries: PinnedEntry[]) {
  try {
    localStorage.setItem(PINNED_STORAGE_PREFIX + productAlias, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

function enumeratePinnedPairs(selectedId: string, pinnedIds: string[]): Array<[string, string]> {
  const ids = [...new Set([selectedId, ...pinnedIds])];
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      pairs.push([ids[i]!, ids[j]!]);
    }
  }
  return pairs;
}

function c4NodeFromPinnedEntry(e: PinnedEntry): C4Node {
  return {
    id: e.id,
    name: e.name,
    labels: [...e.labels],
    properties: { name: e.name },
  };
}

const KNOWN_LABELS = [
  "SoftwareSystem",
  "Container",
  "Component",
  "DeploymentNode",
  "Environment",
  "ContainerInstance",
  "InfrastructureNode",
] as const;

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

function mergeGraphData(a: GraphData, b: GraphData): GraphData {
  const map = new Map<string, C4Node>();
  for (const n of a.nodes) map.set(n.id, n);
  for (const n of b.nodes) map.set(n.id, n);
  return {
    nodes: Array.from(map.values()),
    edges: dedupeGraphEdges([...a.edges, ...b.edges]),
  };
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
  // В БД значения могут отличаться по регистру и содержать подстроку:
  // поэтому делаем case-insensitive CONTAINS.
  const needle = tag.toLowerCase();
  return `toLower(coalesce(${alias}.graphTag, '')) CONTAINS '${needle}'`;
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

function anchorWhereClause(node: C4Node, graphTag: GraphTag, alias: string): string {
  const mLabel = mainLabel(node.labels);
  const nodeName = escapeCypherString(node.name);
  const label = escapeCypherString(mLabel);
  return `${alias}.name = '${nodeName}' AND '${label}' IN labels(${alias}) AND ${graphTagPredicate(alias, graphTag)}`;
}

async function loadNeighborhoodSubgraph(node: C4Node, graphTag: GraphTag): Promise<GraphData> {
  const where = anchorWhereClause(node, graphTag, "anchor");
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

async function loadMergedSubgraph(
  selected: C4Node,
  graphTag: GraphTag,
  pinnedEntries: PinnedEntry[]
): Promise<GraphData> {
  const base = await loadNeighborhoodSubgraph(selected, graphTag);
  if (pinnedEntries.length === 0) return base;

  const pinnedMap = new Map(pinnedEntries.map((e) => [e.id, e]));
  const pairs = enumeratePinnedPairs(selected.id, pinnedEntries.map((p) => p.id));

  const resolveNodeForQuery = (id: string): C4Node | null => {
    if (id === selected.id) return selected;
    const fromBase = base.nodes.find((n) => n.id === id);
    if (fromBase) return fromBase;
    const e = pinnedMap.get(id);
    return e ? c4NodeFromPinnedEntry(e) : null;
  };

  const parts = await Promise.all(
    pairs.map(async ([idA, idB]) => {
      const nodeA = resolveNodeForQuery(idA);
      const nodeB = resolveNodeForQuery(idB);
      if (!nodeA || !nodeB) return { nodes: [], edges: [] };
      const q = `
MATCH (a) WHERE ${anchorWhereClause(nodeA, graphTag, "a")}
MATCH (b) WHERE ${anchorWhereClause(nodeB, graphTag, "b")}
MATCH p = shortestPath((a)-[*..${SHORTEST_PATH_MAX_HOPS}]-(b))
UNWIND relationships(p) AS r
RETURN startNode(r) AS n, r, endNode(r) AS m
`.trim();
      try {
        const rows = await executeCypher(q);
        return parseGraphFromRows(rows);
      } catch {
        return { nodes: [], edges: [] };
      }
    })
  );

  let merged = base;
  for (const p of parts) {
    merged = mergeGraphData(merged, p);
  }
  return merged;
}

export default function ProductArchMapTab({
  productName,
  productAlias,
}: {
  productName: string;
  productAlias: string;
}) {
  // Всегда выбираем данные по graphTag, содержащему "global"
  const [graphTag] = useState<GraphTag>("Global");
  const [graphLoading, setGraphLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState<C4Node | null>(null);
  const [diagramNameFilter, setDiagramNameFilter] = useState("");
  const [typeVisibility, setTypeVisibility] = useState<Record<C4Label, boolean>>(() => {
    const m = {} as Record<C4Label, boolean>;
    for (const l of KNOWN_LABELS) m[l as C4Label] = true;
    return m;
  });
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
  const [pinnedEntries, setPinnedEntries] = useState<PinnedEntry[]>(() => loadPinnedEntries(productAlias));
  const pinnedEntriesRef = useRef(pinnedEntries);
  pinnedEntriesRef.current = pinnedEntries;

  useEffect(() => {
    setPinnedEntries(loadPinnedEntries(productAlias));
  }, [productAlias]);

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
      const exact =
        systems.find((s) => s.name.trim().toLowerCase() === needle.toLowerCase()) ??
        systems.find((s) => s.name.trim().toLowerCase() === productAlias.trim().toLowerCase()) ??
        systems[0];
      if (!exact) {
        setGraph({ nodes: [], edges: [] });
        setSelectedNode(null);
        return;
      }
      const subgraph = await loadMergedSubgraph(exact, graphTag, pinnedEntriesRef.current);
      setGraph(subgraph);
      setSelectedNode(exact);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки диаграммы");
    } finally {
      setGraphLoading(false);
    }
  }, [graphTag, productAlias, productName]);

  useEffect(() => {
    void loadSystemRoot();
  }, [loadSystemRoot]);

  const openNode = useCallback(
    async (node: C4Node) => {
      setGraphLoading(true);
      setError(null);
      try {
        const subgraph = await loadMergedSubgraph(node, graphTag, pinnedEntriesRef.current);
        setGraph(subgraph);
        setSelectedNode(node);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка загрузки узла");
      } finally {
        setGraphLoading(false);
      }
    },
    [graphTag]
  );

  const refetchGraphForPins = useCallback(
    async (nextPins: PinnedEntry[]) => {
      if (!selectedNode) return;
      setGraphLoading(true);
      setError(null);
      try {
        const g = await loadMergedSubgraph(selectedNode, graphTag, nextPins);
        setGraph(g);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка загрузки диаграммы");
      } finally {
        setGraphLoading(false);
      }
    },
    [selectedNode, graphTag]
  );

  const handlePinToggle = useCallback(
    (node: C4Node, pinned: boolean) => {
      setPinnedEntries((prev) => {
        let next: PinnedEntry[];
        if (pinned) {
          if (prev.some((p) => p.id === node.id)) return prev;
          next = [...prev, { id: node.id, name: node.name, labels: [...node.labels] }];
        } else {
          if (!prev.some((p) => p.id === node.id)) return prev;
          next = prev.filter((p) => p.id !== node.id);
        }
        persistPinnedEntries(productAlias, next);
        pinnedEntriesRef.current = next;
        requestAnimationFrame(() => {
          void refetchGraphForPins(pinnedEntriesRef.current);
        });
        return next;
      });
    },
    [productAlias, refetchGraphForPins]
  );

  const handleUnpin = useCallback(
    (id: string) => {
      setPinnedEntries((prev) => {
        if (!prev.some((p) => p.id === id)) return prev;
        const next = prev.filter((p) => p.id !== id);
        persistPinnedEntries(productAlias, next);
        pinnedEntriesRef.current = next;
        requestAnimationFrame(() => {
          void refetchGraphForPins(pinnedEntriesRef.current);
        });
        return next;
      });
    },
    [productAlias, refetchGraphForPins]
  );

  const graphData = useMemo(() => {
    let nodes = graph.nodes as ArchNode[];
    let edges = graph.edges as ArchEdge[];
    if (selectedNode) {
      const selectedLabels = new Set(selectedNode.labels);
      const isDeploymentEnvironment =
        selectedLabels.has("DeploymentEnvironment") || selectedLabels.has("Environment");
      // С прикреплениями merged-граф содержит цепочки shortestPath; filterDirectNeighborhood оставляет
      // только 1-hop от якоря и выкидывает промежуточные узлы пути к прикреплённым.
      const skipLocalNeighborhoodFilter = pinnedEntries.length > 0;
      if (isDeploymentEnvironment) {
        if (!skipLocalNeighborhoodFilter) {
          const f = filterDeploymentEnvironmentNeighborhood(graph, selectedNode.id);
          nodes = f.nodes as ArchNode[];
          edges = f.edges as ArchEdge[];
        }
      } else if (!selectedLabels.has("SoftwareSystem")) {
        if (!skipLocalNeighborhoodFilter) {
          const f = filterDirectNeighborhood(graph, selectedNode.id);
          nodes = f.nodes as ArchNode[];
          edges = f.edges as ArchEdge[];
        }
      }
    }
    return { nodes, edges };
  }, [graph.edges, graph.nodes, selectedNode, pinnedEntries.length]);

  const visibleTypeSet = useMemo(() => {
    const out = new Set<C4Label>();
    (Object.keys(typeVisibility) as C4Label[]).forEach((k) => {
      if (typeVisibility[k]) out.add(k);
    });
    return out;
  }, [typeVisibility]);

  const visibleGraphData = useMemo(() => {
    const nodes = (graphData.nodes as ArchNode[]).filter((n) => {
      const t = mainLabel(n.labels) as C4Label;
      return visibleTypeSet.has(t);
    });
    const idSet = new Set(nodes.map((n) => n.id));
    const edges = (graphData.edges as ArchEdge[]).filter((e) => idSet.has(e.source) && idSet.has(e.target));
    return { nodes, edges };
  }, [graphData, visibleTypeSet]);

  const visibleNodeIds = useMemo(() => new Set(visibleGraphData.nodes.map((n) => n.id)), [visibleGraphData.nodes]);

  const displayedNodes = useMemo(
    () =>
      [...(visibleGraphData.nodes as C4Node[])].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [visibleGraphData.nodes]
  );

  const filteredDisplayedNodes = useMemo(() => {
    const q = diagramNameFilter.trim().toLowerCase();
    if (!q) return displayedNodes;
    return displayedNodes.filter((n) => n.name.toLowerCase().includes(q));
  }, [displayedNodes, diagramNameFilter]);

  const selectedTags = selectedNode ? tagsState[selectedNode.id] ?? [] : [];
  const tagCountByNodeId = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, tags] of Object.entries(tagsState)) {
      if (tags.length > 0) m.set(id, tags.length);
    }
    return m;
  }, [tagsState]);

  const pinnedIdSet = useMemo(() => new Set(pinnedEntries.map((p) => p.id)), [pinnedEntries]);

  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
      <aside
        className={`${leftCollapsed ? "w-12" : "w-80"} flex h-full min-h-0 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/70 p-2 dark:border-zinc-700 dark:bg-zinc-800/30`}
      >
        <button
          type="button"
          onClick={() => setLeftCollapsed((v) => !v)}
          className="mb-2 shrink-0 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
          title={leftCollapsed ? "Развернуть левую панель" : "Свернуть левую панель"}
        >
          {leftCollapsed ? "»" : "«"}
        </button>
        {!leftCollapsed && (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 items-center justify-center gap-1 border-b border-zinc-200 pb-2 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => graphRef.current?.zoomIn()}
                className="rounded-md border border-zinc-300 p-2 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700/60"
                title="Увеличить"
                aria-label="Увеличить масштаб"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => graphRef.current?.zoomOut()}
                className="rounded-md border border-zinc-300 p-2 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700/60"
                title="Уменьшить"
                aria-label="Уменьшить масштаб"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => graphRef.current?.fitToScreen()}
                className="rounded-md border border-zinc-300 p-2 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700/60"
                title="По размеру окна"
                aria-label="Вписать диаграмму в экран"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25v-4.5m0 4.5h-4.5m4.5 0L15 15" />
                </svg>
              </button>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Экспорт диаграммы">
                <button
                  type="button"
                  onClick={() => graphRef.current?.exportPng()}
                  className="rounded-md border border-zinc-300 p-2 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700/60"
                  title="Экспорт PNG"
                  aria-label="Экспорт диаграммы в PNG"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => graphRef.current?.exportSvg()}
                  className="rounded-md border border-zinc-300 p-2 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700/60"
                  title="Экспорт SVG"
                  aria-label="Экспорт диаграммы в SVG"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => graphRef.current?.exportJson()}
                  className="rounded-md border border-zinc-300 p-2 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700/60"
                  title="Экспорт JSON (узлы, рёбра, координаты)"
                  aria-label="Экспорт диаграммы в JSON"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => graphRef.current?.exportPlantUml()}
                  className="rounded-md border border-zinc-300 p-2 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700/60"
                  title="Экспорт PlantUML (component diagram)"
                  aria-label="Экспорт диаграммы в PlantUML"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <rect
                      x="2.5"
                      y="4"
                      width="19"
                      height="16"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    />
                    <text
                      x="12"
                      y="15.25"
                      textAnchor="middle"
                      fill="currentColor"
                      stroke="none"
                      fontSize="7"
                      fontWeight={700}
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                    >
                      PUML
                    </text>
                  </svg>
                </button>
              </div>
            </div>

            {pinnedEntries.length > 0 && (
              <div className="flex shrink-0 flex-col gap-1 rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Прикреплённые</div>
                <ul className="max-h-32 space-y-1 overflow-y-auto">
                  {pinnedEntries.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-200" title={p.name}>
                        {p.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUnpin(p.id)}
                        className="shrink-0 text-amber-700 hover:underline dark:text-amber-400"
                      >
                        Открепить
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex shrink-0 flex-col gap-1 rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Типы</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
                {KNOWN_LABELS.map((l) => {
                  const t = l as C4Label;
                  const checked = typeVisibility[t] ?? true;
                  return (
                    <label
                      key={l}
                      className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700 dark:text-zinc-200"
                      title={l}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setTypeVisibility((prev) => ({
                            ...prev,
                            [t]: e.target.checked,
                          }))
                        }
                        className="h-3 w-3 accent-amber-600"
                      />
                      <span className="whitespace-nowrap">[{l}]</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
              <input
                value={diagramNameFilter}
                onChange={(e) => setDiagramNameFilter(e.target.value)}
                placeholder="Фильтр по имени…"
                className="shrink-0 border-b border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <div className="min-h-0 flex-1 overflow-auto">
                {filteredDisplayedNodes.map((node) => {
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
                {displayedNodes.length > 0 && filteredDisplayedNodes.length === 0 && (
                  <div className="px-3 py-4 text-sm text-zinc-500 dark:text-zinc-400">Нет совпадений по имени</div>
                )}
              </div>
            </div>
          </div>
        )}
      </aside>

      <main className="min-w-0 flex h-full flex-1 bg-zinc-100/60 dark:bg-zinc-900/40">
        {graphLoading && (
          <div className="flex h-full items-center justify-center text-zinc-500 dark:text-zinc-400">
            Загрузка диаграммы...
          </div>
        )}
        {!graphLoading && visibleGraphData.nodes.length === 0 && (
          <div className="flex h-full items-center justify-center text-zinc-500 dark:text-zinc-400">
            Диаграмма пуста
          </div>
        )}
        {!graphLoading && visibleGraphData.nodes.length > 0 && (
          <GraphCanvas
            ref={graphRef}
            nodes={visibleGraphData.nodes}
            edges={visibleGraphData.edges}
            focusNodeId={selectedNode?.id ?? null}
            selectedNodeId={selectedNode?.id ?? null}
            tagCountByNodeId={tagCountByNodeId}
            pinnedNodeIds={pinnedIdSet}
            onPinToggle={handlePinToggle}
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
              <div className="whitespace-pre-line font-medium text-zinc-900 dark:text-zinc-100">
                {selectedNode.name.replace(/~/g, '\n')}
              </div>
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
