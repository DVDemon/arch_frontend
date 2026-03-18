import { NextRequest, NextResponse } from "next/server";

// API_URL — для серверных запросов (в Docker: gateway:8080)
// NEXT_PUBLIC_API_URL — fallback для локальной разработки
const API_BASE =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const res = await fetch(`${API_BASE}/arch-graph/api/v1/graph/local/json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });
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
    console.error("[graph/local] fetch failed:", msg, cause, "API_BASE:", API_BASE);
    return NextResponse.json(
      { error: msg + (cause ? ` (${cause})` : "") },
      { status: 500 }
    );
  }
}
