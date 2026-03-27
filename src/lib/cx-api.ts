import { fetchApi } from "./api";
import type { BiItem, BiUpsertPayload, CjItem, CjUpsertPayload } from "@/types/cx";

const CX_BASE = "/cx/api/cx";

export async function getCjList(params?: {
  idProduct?: number;
  sample?: "ALL" | "DRAFT" | "PUBLISHED";
  search?: string;
}): Promise<CjItem[]> {
  const qp = new URLSearchParams();
  if (params?.idProduct) qp.set("product-id", String(params.idProduct));
  if (params?.sample) qp.set("sample", params.sample);
  if (params?.search) qp.set("search", params.search);
  const suffix = qp.toString() ? `?${qp.toString()}` : "";

  // CX list endpoints are unstable across environments.
  // Try several compatible routes and gracefully degrade to an empty list.
  const attempts = [
    `${CX_BASE}/v2/product/cj${suffix}`,
    `${CX_BASE}/v1/product/cj${suffix || "?sample=PUBLIC"}`,
    `/api-gateway/cx/v1/cj?sample=PUBLIC`,
  ];

  for (const path of attempts) {
    try {
      const data = await fetchApi<CjItem[]>(path);
      if (Array.isArray(data)) return data;
    } catch {
      // try next endpoint
    }
  }

  return [];
}

export async function createCj(productId: number, payload: CjUpsertPayload): Promise<CjItem> {
  return fetchApi<CjItem>(`${CX_BASE}/v1/product/${productId}/cj`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateCj(id: number, payload: CjUpsertPayload): Promise<CjItem> {
  return fetchApi<CjItem>(`${CX_BASE}/v1/product/cj/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteCj(id: number): Promise<void> {
  await fetchApi<void>(`${CX_BASE}/v1/product/cj/${id}`, {
    method: "DELETE",
  });
}

export async function getBiList(params?: {
  idProduct?: number;
  text?: string;
}): Promise<BiItem[]> {
  const qp = new URLSearchParams();
  if (params?.idProduct) qp.set("id_product", String(params.idProduct));
  if (params?.text) qp.set("text", params.text);
  const suffix = qp.toString() ? `?${qp.toString()}` : "";
  const data = await fetchApi<BiItem[]>(`${CX_BASE}/v1/library/business-interactions${suffix}`);
  return Array.isArray(data) ? data : [];
}

export async function createBi(payload: BiUpsertPayload): Promise<BiItem> {
  // CX backend expects collection fields to be arrays, not null.
  const requestBody = {
    name: payload.name,
    descr: payload.descr,
    productId: payload.productId,
    draft: payload.draft ?? true,
    communal: false,
    target: false,
    participants: [],
    channel: [],
    flowLink: [],
    document: [],
    mockupLink: [],
  };

  return fetchApi<BiItem>(`${CX_BASE}/v1/library/business-interactions`, {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}

export async function updateBi(id: number, payload: Partial<BiUpsertPayload>): Promise<BiItem> {
  return fetchApi<BiItem>(`${CX_BASE}/v1/library/business-interactions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteBi(id: number): Promise<void> {
  await fetchApi<void>(`${CX_BASE}/v1/library/business-interactions/${id}`, {
    method: "DELETE",
  });
}
