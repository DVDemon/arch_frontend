export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * Заголовки для сервисов за gateway (products и др.), когда нет JWT:
 * задайте NEXT_PUBLIC_USER_ID и при необходимости NEXT_PUBLIC_USER_ROLES в .env.local.
 */
export function defaultGatewayUserHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const uid = process.env.NEXT_PUBLIC_USER_ID?.trim();
  const roles = process.env.NEXT_PUBLIC_USER_ROLES?.trim();
  if (uid) h["user-id"] = uid;
  if (roles) h["user-roles"] = roles;
  return h;
}

/** Plain fetch: no JSON Content-Type; use for multipart or binary. */
export async function fetchRaw(path: string, init?: RequestInit): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...defaultGatewayUserHeaders(),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text || res.statusText}`);
  }
  return res;
}

export async function fetchApi<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...defaultGatewayUserHeaders(),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return res.json();
}
