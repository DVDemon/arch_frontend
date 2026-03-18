"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useState } from "react";
import { useTheme } from "./ThemeProvider";

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopyGatewayUrl = useCallback(async () => {
    try {
      const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, []);

  const gatewayUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 md:hidden"
            aria-label="Открыть меню"
          >
            ☰
          </button>
        )}
        <Link href="/" className="flex shrink-0 items-center" aria-label="BeeAtlas Lite">
          <Image
            src="/logo.png"
            alt="BeeAtlas Lite"
            width={36}
            height={36}
            className="object-contain"
            unoptimized
          />
        </Link>
        <div className="hidden min-w-0 items-center gap-2 sm:flex">
          <span className="truncate font-mono text-sm text-zinc-600 dark:text-zinc-400" title={gatewayUrl}>
            {gatewayUrl}
          </span>
          <button
            type="button"
            onClick={handleCopyGatewayUrl}
            className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title={copied ? "Скопировано" : "Копировать URL API Gateway"}
            aria-label={copied ? "Скопировано" : "Копировать"}
          >
            {copied ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Пользователь:
          </span>
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Иван Иванов
          </span>
        </div>
        <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setTheme("light")}
            className={`rounded-l-lg px-2.5 py-1.5 text-sm transition-colors ${
              (theme === "light" || (theme === "system" && resolvedTheme === "light"))
                ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
            title="Светлая тема"
          >
            ☀
          </button>
          <button
            onClick={() => setTheme("dark")}
            className={`rounded-r-lg px-2.5 py-1.5 text-sm transition-colors ${
              (theme === "dark" || (theme === "system" && resolvedTheme === "dark"))
                ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
            title="Тёмная тема"
          >
            ☾
          </button>
        </div>
      </div>
    </header>
  );
}
