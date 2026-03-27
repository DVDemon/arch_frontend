import { NextRequest, NextResponse } from "next/server";
import { cypherQueryAsciiForHeader } from "@/lib/cypherAsciiHeader";

const API_BASE =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";

/**
 * POST /api/graph/cypher
 * Прокси к GET /arch-graph/api/v1/elements с заголовком CYPHER-QUERY
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json(
        { error: "Поле query обязательно" },
        { status: 400 }
      );
    }

    const url = `${API_BASE}/arch-graph/api/v1/elements`;
    const safeQuery = cypherQueryAsciiForHeader(query)
      .replace(/\r\n|\r|\n/g, " ")
      .trim();
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "CYPHER-QUERY": safeQuery,
        "Content-Type": "application/json",
      },
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
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка прокси";
    const cause = e instanceof Error && e.cause ? String(e.cause) : "";
    console.error("[graph/cypher] fetch failed:", msg, cause);
    return NextResponse.json(
      { error: msg + (cause ? ` (${cause})` : "") },
      { status: 500 }
    );
  }
}
