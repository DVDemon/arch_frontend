/**
 * Загрузка архитектуры в локальный граф (graphTag: Local)
 * Использует API-прокси Next.js для обхода CORS
 */
export async function uploadGraphLocal(jsonBody: string): Promise<string> {
  const res = await fetch("/api/graph/local", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: jsonBody,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = (data as { error?: string }).error || res.statusText;
    throw new Error(`Ошибка загрузки локального графа ${res.status}: ${msg}`);
  }
  return res.text();
}

/**
 * Получение контекстной диаграммы по мнемонике приложения (код продукта)
 * GET /arch-graph/api/v1/context/{softwareSystemMnemonic}
 */
export async function fetchContextDiagram(mnemonic: string): Promise<string> {
  const res = await fetch(
    `/api/graph/context?mnemonic=${encodeURIComponent(mnemonic.trim())}`
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = (data as { error?: string }).error || res.statusText;
    throw new Error(`Ошибка загрузки контекстной диаграммы ${res.status}: ${msg}`);
  }
  return res.text();
}

/**
 * Получение DOT-описания контекстной диаграммы по cmdb (код продукта)
 * GET /arch-graph/api/v1/context/dot?cmdb=xxx
 */
export async function fetchContextDiagramDot(cmdb: string): Promise<string> {
  const res = await fetch(
    `/api/graph/context-dot?cmdb=${encodeURIComponent(cmdb.trim())}`
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = (data as { error?: string }).error || res.statusText;
    throw new Error(`Ошибка загрузки DOT ${res.status}: ${msg}`);
  }
  return res.text();
}

/**
 * Загрузка архитектуры в глобальный граф (graphTag: Global)
 * Использует API-прокси Next.js для обхода CORS
 */
export async function uploadGraphGlobal(jsonBody: string): Promise<string> {
  const res = await fetch("/api/graph/global", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: jsonBody,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = (data as { error?: string }).error || res.statusText;
    throw new Error(`Ошибка загрузки глобального графа ${res.status}: ${msg}`);
  }
  return res.text();
}
