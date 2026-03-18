import { fetchApi } from "./api";
import type {
  TechRadarTech,
  TechRadarRing,
  TechRadarSector,
  TechRadarCategory,
  TechUpdatePayload,
  TechCreatePayload,
  TechVersionPayload,
} from "@/types/techradar";

const TECHRADAR_BASE = "/api-gateway/techradar/v1";

export async function getTechList(actualTech?: boolean): Promise<TechRadarTech[]> {
  const params = actualTech !== undefined ? `?actualTech=${actualTech}` : "";
  const data = await fetchApi<TechRadarTech[]>(`${TECHRADAR_BASE}/tech${params}`);
  return Array.isArray(data) ? data : [];
}

export async function getTechById(id: number): Promise<TechRadarTech> {
  return fetchApi<TechRadarTech>(`${TECHRADAR_BASE}/tech/${id}`);
}

export async function getRings(): Promise<TechRadarRing[]> {
  const data = await fetchApi<TechRadarRing[]>(`${TECHRADAR_BASE}/rings`);
  return Array.isArray(data) ? data : [];
}

export async function getSectors(): Promise<TechRadarSector[]> {
  const data = await fetchApi<TechRadarSector[]>(`${TECHRADAR_BASE}/sectors`);
  return Array.isArray(data) ? data : [];
}

export async function getCategories(): Promise<TechRadarCategory[]> {
  const data = await fetchApi<TechRadarCategory[]>(`${TECHRADAR_BASE}/category`);
  return Array.isArray(data) ? data : [];
}

export async function getTechByCategory(categoryIds: number[]): Promise<TechRadarTech[]> {
  if (categoryIds.length === 0) return getTechList(true);
  const params = categoryIds.map((id) => `id_category=${id}`).join("&");
  const data = await fetchApi<TechRadarTech[]>(`${TECHRADAR_BASE}/category/tech?${params}`);
  return Array.isArray(data) ? data : [];
}

export async function createTech(payload: TechCreatePayload): Promise<{ id: number }[]> {
  return fetchApi<{ id: number }[]>(`${TECHRADAR_BASE}/tech`, {
    method: "POST",
    body: JSON.stringify([payload]),
  });
}

export async function updateTech(id: number, payload: TechUpdatePayload): Promise<void> {
  await fetchApi<void>(`${TECHRADAR_BASE}/tech/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteTech(id: number): Promise<void> {
  await fetchApi<void>(`${TECHRADAR_BASE}/tech/${id}`, {
    method: "DELETE",
  });
}

export async function createTechVersion(
  techId: number,
  payload: TechVersionPayload | TechVersionPayload[]
): Promise<void> {
  const body = Array.isArray(payload) ? payload : [payload];
  await fetchApi<void>(`${TECHRADAR_BASE}/tech/${techId}/version`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateTechVersion(
  techId: number,
  versionId: number,
  payload: TechVersionPayload
): Promise<void> {
  await fetchApi<void>(`${TECHRADAR_BASE}/tech/${techId}/version/${versionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteTechVersion(techId: number, versionId: number): Promise<void> {
  await fetchApi<void>(`${TECHRADAR_BASE}/tech/${techId}/version/${versionId}`, {
    method: "DELETE",
  });
}
