import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";

/**
 * GET /api/graph/context?mnemonic=xxx
 * Прокси к /arch-graph/api/v1/context/{softwareSystemMnemonic}
 * Возвращает Structurizr workspace JSON с контекстной диаграммой
 */
export async function GET(request: NextRequest) {
  const mnemonic = request.nextUrl.searchParams.get("mnemonic");
  if (!mnemonic?.trim()) {
    return NextResponse.json(
      { error: "Параметр mnemonic обязателен" },
      { status: 400 }
    );
  }

  try {
    const rankDirection =
      request.nextUrl.searchParams.get("rankDirection") || "TB";
    const url = `${API_BASE}/arch-graph/api/v1/context/${encodeURIComponent(mnemonic.trim())}?rankDirection=${rankDirection}`;
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
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка прокси";
    const cause = e instanceof Error && e.cause ? String(e.cause) : "";
    console.error("[graph/context] fetch failed:", msg, cause);
    return NextResponse.json(
      { error: msg + (cause ? ` (${cause})` : "") },
      { status: 500 }
    );
  }
}
