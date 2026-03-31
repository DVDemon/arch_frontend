"use client";

import { useEffect, useRef, useState } from "react";
import BpmnViewer from "bpmn-js/lib/NavigatedViewer";

export function BpmnViewerPanel({
  xml,
  loading,
  error,
  resetToken = 0,
}: {
  xml: string | null;
  loading?: boolean;
  error?: string | null;
  resetToken?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<any>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!viewerRef.current) {
      viewerRef.current = new BpmnViewer({
        container: containerRef.current,
      });
    }
    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    // Explicitly reset navigation state (drilldown) on demand.
    if (viewerRef.current) {
      viewerRef.current.destroy();
      viewerRef.current = null;
    }
    viewerRef.current = new BpmnViewer({
      container: containerRef.current,
    });
    return () => {};
  }, [resetToken]);

  useEffect(() => {
    if (!viewerRef.current || !xml) return;
    setViewerError(null);
    let cancelled = false;
    void viewerRef.current
      .importXML(xml)
      .then(() => {
        if (cancelled) return;
        const canvas = viewerRef.current.get("canvas");
        canvas.zoom("fit-viewport", "auto");
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "BPMN XML не удалось отрисовать.";
        setViewerError(msg);
      });
    return () => {
      cancelled = true;
    };
  }, [xml, resetToken]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">
        Интерактивный режим: колесо мыши для zoom, перетаскивание для панорамирования, клики по элементам.
      </p>
      {loading && <div className="text-sm text-zinc-500">Загрузка BPMN...</div>}
      {error && <div className="text-sm text-red-700 dark:text-red-300">{error}</div>}
      {viewerError && <div className="text-sm text-red-700 dark:text-red-300">Ошибка рендера BPMN: {viewerError}</div>}
      {!loading && !error && !viewerError && !xml && (
        <div className="text-sm text-zinc-500">
          BPMN документ не найден. Загрузите файл в блоке "Импорт BPMN".
        </div>
      )}
      <div ref={containerRef} className="h-[70vh] min-h-[520px] w-full rounded border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900" />
    </div>
  );
}
