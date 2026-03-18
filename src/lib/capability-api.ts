import { fetchApi } from "./api";
import type {
  BusinessCapabilityTree,
  BusinessCapabilityShort,
  BusinessCapabilityChildren,
  TechCapability,
  SearchCapabilityResult,
} from "@/types/capability";

const CAPABILITY_BASE = "/api-gateway/capability/v1";

export async function getBusinessCapabilityTree(): Promise<BusinessCapabilityTree[]> {
  const data = await fetchApi<BusinessCapabilityTree[]>(`${CAPABILITY_BASE}/business/tree`);
  return Array.isArray(data) ? data : [];
}

export async function getBusinessCapabilityById(id: number): Promise<BusinessCapabilityShort> {
  return fetchApi<BusinessCapabilityShort>(`${CAPABILITY_BASE}/business/${id}`);
}

export async function getBusinessCapabilityChildren(id: number): Promise<BusinessCapabilityChildren> {
  return fetchApi<BusinessCapabilityChildren>(`${CAPABILITY_BASE}/business/${id}/children`);
}

export async function getTechCapabilityById(id: number): Promise<TechCapability> {
  return fetchApi<TechCapability>(`${CAPABILITY_BASE}/tech/${id}`);
}

export async function searchCapabilities(
  search: string,
  findBy: "ALL" | "CORE" | "BUSINESS_CAPABILITY" | "TECH_CAPABILITY" = "ALL"
): Promise<SearchCapabilityResult[]> {
  if (!search?.trim()) return [];
  const data = await fetchApi<SearchCapabilityResult[]>(
    `${CAPABILITY_BASE}/search?findBy=${encodeURIComponent(findBy)}&search=${encodeURIComponent(search.trim())}`
  );
  return Array.isArray(data) ? data : [];
}
