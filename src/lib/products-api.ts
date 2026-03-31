import { fetchApi } from "./api";
import type { Product } from "@/types/product";
import type {
  ProductFull,
  ProductUser,
  ContainerWithInterfaces,
  AssessmentResponse,
} from "@/types/product-detail";

const PRODUCT_BASE = "/api-gateway/product/v1";

export async function getProducts(): Promise<Product[]> {
  const data = await fetchApi<Product[]>(`${PRODUCT_BASE}/user/product`);
  return Array.isArray(data) ? data : [];
}

export async function getProductsAdmin(): Promise<Product[]> {
  const data = await fetchApi<Product[]>(`${PRODUCT_BASE}/user/product/admin`);
  return Array.isArray(data) ? data : [];
}

export async function getProductsByIds(ids: number[]): Promise<Product[]> {
  if (!ids.length) return [];
  const qp = new URLSearchParams();
  for (const id of ids) {
    if (!Number.isFinite(id)) continue;
    qp.append("ids", String(id));
  }
  if (!qp.toString()) return [];
  const data = await fetchApi<Product[]>(`${PRODUCT_BASE}/product/by-ids?${qp.toString()}`);
  return Array.isArray(data) ? data : [];
}

export async function deleteProductByAlias(alias: string): Promise<void> {
  await fetchApi<void>(
    `${PRODUCT_BASE}/product/${encodeURIComponent(alias)}`,
    { method: "DELETE" }
  );
}

export interface UpdateProductPayload {
  alias: string;
  name?: string;
  description?: string;
  gitUrl?: string;
  critical?: string;
  ownerId?: number;
  employeesIds?: number[];
}

export interface PatchProductWorkspacePayload {
  structurizrApiUrl?: string;
  structurizrApiKey?: string;
  structurizrApiSecret?: string;
  structurizrWorkspaceName?: string;
}

export async function updateProduct(payload: UpdateProductPayload): Promise<void> {
  await fetchApi<void>(`${PRODUCT_BASE}/product`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function patchProductWorkspace(
  alias: string,
  payload: PatchProductWorkspacePayload
): Promise<void> {
  await fetchApi<void>(
    `${PRODUCT_BASE}/product/${encodeURIComponent(alias)}/workspace`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
}

export async function getProductByAlias(alias: string): Promise<ProductFull> {
  return fetchApi<ProductFull>(
    `${PRODUCT_BASE}/product/${encodeURIComponent(alias)}`
  );
}

export async function getProductUsers(alias: string): Promise<ProductUser[]> {
  const data = await fetchApi<ProductUser[]>(
    `${PRODUCT_BASE}/product/${encodeURIComponent(alias)}/employee`
  );
  return Array.isArray(data) ? data : [];
}

export async function getProductContainers(
  alias: string
): Promise<ContainerWithInterfaces[]> {
  const data = await fetchApi<ContainerWithInterfaces[]>(
    `${PRODUCT_BASE}/product/${encodeURIComponent(alias)}/container`
  );
  return Array.isArray(data) ? data : [];
}

export async function getProductFitnessFunctions(
  alias: string,
  options?: { sourceType?: string; sourceId?: number }
): Promise<AssessmentResponse | null> {
  try {
    const params = new URLSearchParams();
    if (options?.sourceType) params.set("source_type", options.sourceType);
    if (options?.sourceId != null) params.set("source_id", String(options.sourceId));
    const query = params.toString();
    const url = `${PRODUCT_BASE}/product/${encodeURIComponent(alias)}/fitness-function${query ? `?${query}` : ""}`;
    return await fetchApi<AssessmentResponse>(url);
  } catch {
    return null;
  }
}

export interface ProductTechCapability {
  id: number;
  code?: string;
  name?: string;
  description?: string;
  author?: string;
  link?: string;
  owner?: string;
  createdDate?: string;
  updatedDate?: string;
  deletedDate?: string;
}

export async function getProductTechCapabilities(
  alias: string,
  containerNames?: string[]
): Promise<ProductTechCapability[]> {
  const params = new URLSearchParams({ alias });
  containerNames?.forEach((name) => params.append("containers", name));
  const data = await fetchApi<ProductTechCapability[]>(
    `${PRODUCT_BASE}/product/implemented/container/tech-capability?${params}`
  );
  return Array.isArray(data) ? data : [];
}

const STRUCTURIZR_BASE = "/structurizr-backend";

/**
 * Кодирует UTF-8 строку в base64.
 */
function base64EncodeUtf8(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

/**
 * Загружает workspace.dsl и импортирует в FDM (dsl2fdm).
 * Может выполняться долго — предусмотрен таймаут.
 */
export async function uploadWorkspaceDsl(
  productAlias: string,
  dslContent: string
): Promise<void> {
  const base64 = base64EncodeUtf8(dslContent);
  await fetchApi<void>(`${STRUCTURIZR_BASE}/api/v1/dsl2fdm`, {
    method: "POST",
    body: JSON.stringify({
      productAlias,
      workspace: base64,
    }),
  });
}

/** Ответ POST /api/v1/workspace (Structurizr On-Premises). */
export interface StructurizrWorkspaceCreated {
  id: number;
  code?: string;
  name?: string;
  api_key?: string;
  api_secret?: string;
  api_url?: string;
}

const WORKSPACE_CREATE_TIMEOUT_MS = 180_000;

/**
 * Создаёт новый workspace в Structurizr On-Premises и обновляет продукт в BeeAtlas.
 * Операция может занимать десятки секунд (CLI push шаблона).
 */
export async function createStructurizrWorkspace(
  productCode: string,
  architectName: string
): Promise<StructurizrWorkspaceCreated> {
  const API_BASE =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
  const url = `${API_BASE}${STRUCTURIZR_BASE}/api/v1/workspace`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WORKSPACE_CREATE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: productCode,
        architect_name: architectName.trim(),
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      let message = text || res.statusText;
      try {
        const j = JSON.parse(text) as { detail?: string | unknown };
        if (typeof j.detail === "string") message = j.detail;
        else if (j.detail != null) message = JSON.stringify(j.detail);
      } catch {
        /* keep message */
      }
      throw new Error(`API error ${res.status}: ${message}`);
    }
    if (!text) {
      throw new Error("Пустой ответ сервера");
    }
    return JSON.parse(text) as StructurizrWorkspaceCreated;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        `Превышено время ожидания (${WORKSPACE_CREATE_TIMEOUT_MS / 1000} с). Попробуйте снова.`
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
