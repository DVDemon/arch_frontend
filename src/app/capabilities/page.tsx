"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function DomainIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function TechCapabilityIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function BusinessCapabilityIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}
import {
  getBusinessCapabilityTree,
  getBusinessCapabilityById,
  getBusinessCapabilityChildren,
  getTechCapabilityById,
  searchCapabilities,
} from "@/lib/capability-api";
import type {
  BusinessCapabilityTree,
  BusinessCapabilityShort,
  BusinessCapabilityChildren,
  TechCapability,
  SearchCapabilityResult,
} from "@/types/capability";

type SelectedCapability =
  | { type: "business"; id: number }
  | { type: "tech"; id: number }
  | null;

function filterTreeBySearch(
  nodes: BusinessCapabilityTree[],
  search: string
): BusinessCapabilityTree[] {
  if (!search?.trim()) return nodes;
  const q = search.toLowerCase().trim();
  const filterNode = (n: BusinessCapabilityTree): BusinessCapabilityTree | null => {
    const match =
      (n.name || "").toLowerCase().includes(q) ||
      (n.code || "").toLowerCase().includes(q) ||
      (n.description || "").toLowerCase().includes(q);
    const filteredChildren = (n.children || [])
      .map(filterNode)
      .filter((c): c is BusinessCapabilityTree => c !== null);
    if (match || filteredChildren.length > 0) {
      return { ...n, children: filteredChildren.length ? filteredChildren : n.children };
    }
    return null;
  };
  return nodes.map(filterNode).filter((c): c is BusinessCapabilityTree => c !== null);
}

function TreeNode({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: BusinessCapabilityTree;
  depth: number;
  selected: SelectedCapability | null;
  onSelect: (type: "business", id: number) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 3);
  const isSelected = selected?.type === "business" && selected.id === node.id;
  const hasChildren = (node.children?.length ?? 0) > 0;

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-1 py-1 px-2 rounded cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
          isSelected ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200" : ""
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            setExpanded((prev) => !prev);
          }}
          className="w-6 h-6 shrink-0 flex items-center justify-center rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
          aria-label={expanded ? "Свернуть" : "Развернуть"}
        >
          {hasChildren ? (expanded ? "▼" : "▶") : "•"}
        </button>
        <button
          type="button"
          onClick={() => onSelect("business", node.id)}
          className="flex-1 text-left truncate min-w-0 flex items-center gap-1"
        >
          <span className="font-medium">{node.name || node.code || "—"}</span>
          {node.isDomain && (
            <span title="Домен" className="text-zinc-500 dark:text-zinc-400">
              <DomainIcon />
            </span>
          )}
        </button>
      </div>
      {expanded && hasChildren && (
        <div>
          {(node.children || []).map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DetailCard({
  selected,
  business,
  children,
  tech,
  loading,
  onSelectChild,
}: {
  selected: SelectedCapability | null;
  business: BusinessCapabilityShort | null;
  children: BusinessCapabilityChildren | null;
  tech: TechCapability | null;
  loading: boolean;
  onSelectChild: (type: "business" | "tech", id: number) => void;
}) {
  if (!selected) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50/50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/30 dark:text-zinc-400">
        Выберите возможность в дереве слева
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-800/30">
        <div className="animate-pulse text-zinc-500">Загрузка…</div>
      </div>
    );
  }

  if (selected.type === "tech" && tech) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400" title="Техническая возможность">
            <TechCapabilityIcon />
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {tech.name || tech.code || "—"}
          </h2>
          <div className="mt-4 space-y-2">
            {tech.code && (
              <div className="flex gap-2">
                <span className="text-zinc-500 dark:text-zinc-400">Код:</span>
                <span className="font-mono">{tech.code}</span>
              </div>
            )}
            {tech.description && (
              <p className="text-zinc-700 dark:text-zinc-300">{tech.description}</p>
            )}
            {tech.owner && (
              <div className="flex gap-2">
                <span className="text-zinc-500 dark:text-zinc-400">Владелец:</span>
                <span>{tech.owner}</span>
              </div>
            )}
            {tech.link && (
              <a
                href={tech.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-600 hover:underline dark:text-amber-400"
              >
                Ссылка
              </a>
            )}
            {tech.system?.alias && (
              <div className="flex flex-col gap-1">
                <span className="text-zinc-500 dark:text-zinc-400">Продукт, реализующий возможность:</span>
                <Link
                  href={`/products/${encodeURIComponent(tech.system.alias)}`}
                  className="inline-flex w-fit items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-amber-600 hover:bg-amber-50 hover:border-amber-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-amber-400 dark:hover:bg-amber-900/20 dark:hover:border-amber-800"
                >
                  {tech.system.name || tech.system.alias}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (selected.type === "business" && business) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400" title="Бизнес-возможность">
            <BusinessCapabilityIcon />
          </div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {business.name || business.code || "—"}
          </h2>
          {business.isDomain && (
            <span className="mt-1 inline-flex items-center gap-1 text-zinc-500 dark:text-zinc-400" title="Домен">
              <DomainIcon />
            </span>
          )}
          <div className="mt-4 space-y-2">
            {business.code && (
              <div className="flex gap-2">
                <span className="text-zinc-500 dark:text-zinc-400">Код:</span>
                <span className="font-mono">{business.code}</span>
              </div>
            )}
            {business.description && (
              <p className="text-zinc-700 dark:text-zinc-300">{business.description}</p>
            )}
            {business.owner && (
              <div className="flex gap-2">
                <span className="text-zinc-500 dark:text-zinc-400">Владелец:</span>
                <span>{business.owner}</span>
              </div>
            )}
            {business.link && (
              <a
                href={business.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-600 hover:underline dark:text-amber-400"
              >
                Ссылка
              </a>
            )}
          </div>
        </div>

        {children && (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-4 font-semibold text-zinc-900 dark:text-zinc-100">
              Дочерние возможности
            </h3>
            <div className="space-y-3">
              {(children.businessCapabilities || []).map((bc) => (
                <button
                  key={`bc-${bc.id}`}
                  type="button"
                  onClick={() => onSelectChild("business", bc.id)}
                  className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 p-3 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <span className="text-amber-600 dark:text-amber-400" title="Бизнес-возможность">
                    <BusinessCapabilityIcon />
                  </span>
                  <span className="font-medium">{bc.name || bc.code || "—"}</span>
                  {bc.isDomain && (
                    <span className="text-zinc-500 dark:text-zinc-400" title="Домен">
                      <DomainIcon />
                    </span>
                  )}
                </button>
              ))}
              {(children.techCapabilities || []).map((tc) => (
                <button
                  key={`tc-${tc.id}`}
                  type="button"
                  onClick={() => onSelectChild("tech", tc.id)}
                  className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 p-3 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <span className="text-blue-600 dark:text-blue-400" title="Техническая возможность">
                    <TechCapabilityIcon />
                  </span>
                  <span className="font-medium">{tc.name || tc.code || "—"}</span>
                </button>
              ))}
              {(!children.businessCapabilities?.length && !children.techCapabilities?.length) && (
                <p className="text-zinc-500 dark:text-zinc-400">Нет дочерних возможностей</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

function CapabilitiesContent() {
  const searchParams = useSearchParams();
  const [tree, setTree] = useState<BusinessCapabilityTree[]>([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [selected, setSelected] = useState<SelectedCapability>(null);
  const [businessDetail, setBusinessDetail] = useState<BusinessCapabilityShort | null>(null);
  const [childrenDetail, setChildrenDetail] = useState<BusinessCapabilityChildren | null>(null);
  const [techDetail, setTechDetail] = useState<TechCapability | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchCapabilityResult[] | null>(null);
  const [treeExpanded, setTreeExpanded] = useState(true);

  const loadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBusinessCapabilityTree();
      setTree(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки дерева");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  useEffect(() => {
    const tcId = searchParams.get("tc");
    if (tcId && /^\d+$/.test(tcId)) {
      setSelected({ type: "tech", id: parseInt(tcId, 10) });
    }
  }, [searchParams]);

  const loadDetail = useCallback(async (sel: SelectedCapability) => {
    if (!sel) return;
    setDetailLoading(true);
    setBusinessDetail(null);
    setChildrenDetail(null);
    setTechDetail(null);
    try {
      if (sel.type === "business") {
        const [bc, ch] = await Promise.all([
          getBusinessCapabilityById(sel.id),
          getBusinessCapabilityChildren(sel.id),
        ]);
        setBusinessDetail(bc);
        setChildrenDetail(ch);
      } else {
        const tc = await getTechCapabilityById(sel.id);
        setTechDetail(tc);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) {
      loadDetail(selected);
    } else {
      setBusinessDetail(null);
      setChildrenDetail(null);
      setTechDetail(null);
    }
  }, [selected, loadDetail]);

  const handleSearch = useCallback(async () => {
    if (!searchFilter.trim()) {
      setSearchResults(null);
      return;
    }
    setDetailLoading(true);
    try {
      const results = await searchCapabilities(searchFilter.trim());
      setSearchResults(results);
    } catch (e) {
      setSearchResults([]);
    } finally {
      setDetailLoading(false);
    }
  }, [searchFilter]);

  const filteredTree = useMemo(
    () => filterTreeBySearch(tree, searchFilter),
    [tree, searchFilter]
  );

  const handleSelectFromTree = useCallback((type: "business", id: number) => {
    setSelected({ type, id });
    setSearchResults(null);
  }, []);

  const handleSelectChild = useCallback((type: "business" | "tech", id: number) => {
    setSelected({ type, id });
    setSearchResults(null);
  }, []);

  const handleSelectFromSearch = useCallback((item: SearchCapabilityResult) => {
    const type = item.type === "TECH_CAPABILITY" ? "tech" : "business";
    setSelected({ type, id: item.id });
    setSearchFilter("");
    setSearchResults(null);
  }, []);

  return (
    <div className="w-full">
      <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Каталог возможностей
      </h1>

      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <input
          type="text"
          placeholder="Фильтр по названию, коду, описанию..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-400"
        />
        <button
          onClick={handleSearch}
          className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-white hover:bg-amber-600"
        >
          Поиск
        </button>
      </div>

      {searchResults !== null && (
        <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-2 font-semibold text-zinc-900 dark:text-zinc-100">Результаты поиска</h3>
          {searchResults.length === 0 ? (
            <p className="text-zinc-500 dark:text-zinc-400">Ничего не найдено</p>
          ) : (
            <div className="space-y-1">
              {searchResults.map((r) => (
                <button
                  key={`${r.type}-${r.id}`}
                  type="button"
                  onClick={() => handleSelectFromSearch(r)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  {r.type === "TECH_CAPABILITY" ? (
                    <span className="text-blue-600 dark:text-blue-400" title="Техническая возможность">
                      <TechCapabilityIcon />
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400" title="Бизнес-возможность">
                      <BusinessCapabilityIcon />
                    </span>
                  )}
                  <span className="font-medium">{r.name || r.code || "—"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="overflow-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setTreeExpanded((e) => !e)}
            className="flex w-full items-center justify-between p-4 font-semibold text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-t-xl transition-colors"
          >
            Дерево возможностей
            <span className="text-zinc-500 dark:text-zinc-400 transition-transform" style={{ transform: treeExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
              ▶
            </span>
          </button>
          {treeExpanded && (loading ? (
            <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">Загрузка…</div>
          ) : filteredTree.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">
              {searchFilter ? "Нет совпадений по фильтру" : "Нет данных"}
            </div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto pb-4">
              {filteredTree.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  selected={selected}
                  onSelect={handleSelectFromTree}
                />
              ))}
            </div>
          ))}
        </div>

        <div>
          <DetailCard
            selected={selected}
            business={businessDetail}
            children={childrenDetail}
            tech={techDetail}
            loading={detailLoading}
            onSelectChild={handleSelectChild}
          />
        </div>
      </div>
    </div>
  );
}

export default function CapabilitiesPage() {
  return (
    <Suspense fallback={
      <div className="w-full">
        <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-100">Каталог возможностей</h1>
        <div className="flex h-64 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50/50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/30 dark:text-zinc-400">
          Загрузка…
        </div>
      </div>
    }>
      <CapabilitiesContent />
    </Suspense>
  );
}
