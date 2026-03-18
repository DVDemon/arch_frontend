"use client";

import { useCallback, useRef, useState } from "react";
import { uploadGraphLocal, uploadGraphGlobal } from "@/lib/graph-api";
import ContextDiagramTab from "@/components/ContextDiagramTab";
import CypherTab from "@/components/CypherTab";

type TabId = "upload" | "context" | "cypher";

const TABS: { id: TabId; label: string }[] = [
  { id: "upload", label: "Загрузка архитектуры" },
  { id: "context", label: "Контекстные диаграммы" },
  { id: "cypher", label: "CYPHER запросы" },
];

function ArchitectureUploadTab() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    setFile(selected ?? null);
    setError(null);
    setSuccess(null);
  }, []);

  const handleUpload = useCallback(
    async (type: "local" | "global") => {
      if (!file) {
        setError("Выберите JSON файл");
        return;
      }
      setLoading(true);
      setError(null);
      setSuccess(null);
      try {
        const text = await file.text();
        try {
          JSON.parse(text);
        } catch {
          setError("Файл не является валидным JSON");
          setLoading(false);
          return;
        }
        const result =
          type === "local"
            ? await uploadGraphLocal(text)
            : await uploadGraphGlobal(text);
        setSuccess(
          type === "local"
            ? `Локальный граф успешно загружен: ${result || "OK"}`
            : `Глобальный граф успешно загружен: ${result || "OK"}`
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    },
    [file]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const dropped = e.dataTransfer.files?.[0];
      if (dropped?.name.endsWith(".json")) {
        setFile(dropped);
        setError(null);
        setSuccess(null);
      } else {
        setError("Выберите файл с расширением .json");
      }
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className="space-y-6">
      <div
        className="rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50/50 p-8 dark:border-zinc-600 dark:bg-zinc-800/30"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">
            Перетащите JSON файл с архитектурой (например, Structurizr workspace) или выберите файл
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Выбрать файл
          </button>
          {file && (
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Выбран: {file.name}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => handleUpload("local")}
          disabled={!file || loading}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Загрузка…" : "Загрузить в локальный граф"}
        </button>
        <button
          type="button"
          onClick={() => handleUpload("global")}
          disabled={!file || loading}
          className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-600 dark:hover:bg-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Загрузка…" : "Загрузить в глобальный граф"}
        </button>
      </div>

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        <strong>Локальный граф</strong> — вершины и связи помечаются graphTag: Local.
        <br />
        <strong>Глобальный граф</strong> — вершины и связи помечаются graphTag: Global.
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200">
          {success}
        </div>
      )}
    </div>
  );
}

export default function ArchitecturePage() {
  const [activeTab, setActiveTab] = useState<TabId>("upload");

  return (
    <div className="w-full">
      <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Архитектура
      </h1>

      <div className="mb-6 border-b border-zinc-200 dark:border-zinc-700">
        <nav className="flex gap-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-amber-500 text-amber-600 dark:text-amber-400"
                  : "border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div
        className={`rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 ${
          activeTab === "cypher" ? "flex max-h-[calc(100dvh-10rem)] flex-col overflow-hidden" : ""
        }`}
      >
        {activeTab === "upload" && <ArchitectureUploadTab />}
        {activeTab === "context" && <ContextDiagramTab />}
        {activeTab === "cypher" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <CypherTab />
          </div>
        )}
      </div>
    </div>
  );
}
