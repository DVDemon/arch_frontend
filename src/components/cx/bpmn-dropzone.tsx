"use client";

import { useCallback, useId, useState } from "react";

export function BpmnDropzone({
  file,
  onFile,
  onInvalidExtension,
  disabled,
  id: idProp,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  onInvalidExtension?: () => void;
  disabled?: boolean;
  id?: string;
}) {
  const genId = useId();
  const inputId = idProp ?? `bpmn-${genId}`;
  const [dragOver, setDragOver] = useState(false);

  const validate = useCallback(
    (f: File | null) => {
      if (!f) {
        onFile(null);
        return;
      }
      if (!f.name.toLowerCase().endsWith(".bpmn")) {
        onInvalidExtension?.();
        onFile(null);
        return;
      }
      onFile(f);
    },
    [onFile, onInvalidExtension],
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    validate(f);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const f = e.dataTransfer.files?.[0];
    if (f) validate(f);
  };

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
          dragOver
            ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
            : "border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/50"
        } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <input
          id={inputId}
          type="file"
          accept=".bpmn,application/xml,text/xml"
          className="sr-only"
          disabled={disabled}
          onChange={onInputChange}
        />
        {file ? (
          <span className="font-medium text-zinc-800 dark:text-zinc-100">{file.name}</span>
        ) : (
          <>
            <span className="text-zinc-600 dark:text-zinc-400">
              Перетащите BPMN сюда или{" "}
              <span className="text-amber-700 underline dark:text-amber-300">загрузите</span>
            </span>
            <span className="mt-1 text-xs text-zinc-500">Только файлы .bpmn</span>
          </>
        )}
      </label>
    </div>
  );
}
