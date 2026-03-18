import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";

/**
 * GET /api/graph/context-dot?cmdb=xxx
 * Прокси к /arch-graph/api/v1/context/dot?cmdb=xxx
 * Возвращает DOT-описание контекстной диаграммы
 */
export async function GET(request: NextRequest) {
  const cmdb = request.nextUrl.searchParams.get("cmdb");
  if (!cmdb?.trim()) {
    return NextResponse.json(
      { error: "Параметр cmdb обязателен" },
      { status: 400 }
    );
  }

  try {
    const url = `${API_BASE}/arch-graph/api/v1/context/dot?cmdb=${encodeURIComponent(cmdb.trim())}`;
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { error: text || res.statusText },
        { status: res.status }
      );
    }
    return new NextResponse(text, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка прокси";
    const cause = e instanceof Error && e.cause ? String(e.cause) : "";
    console.error("[graph/context-dot] fetch failed:", msg, cause);
    return NextResponse.json(
      { error: msg + (cause ? ` (${cause})` : "") },
      { status: 500 }
    );
  }
}
