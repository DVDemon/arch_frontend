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

export async function updateProduct(payload: UpdateProductPayload): Promise<void> {
  await fetchApi<void>(`${PRODUCT_BASE}/product`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
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
  alias: string
): Promise<AssessmentResponse | null> {
  try {
    return await fetchApi<AssessmentResponse>(
      `${PRODUCT_BASE}/product/${encodeURIComponent(alias)}/fitness-function`
    );
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
