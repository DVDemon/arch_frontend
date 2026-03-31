import { API_BASE, defaultGatewayUserHeaders, fetchApi, fetchRaw } from "./api";

const DOCUMENT_BASE = "/api-gateway/document/v1";

export interface DocumentationTypeDto {
  id: number;
  name?: string;
  docType?: string;
}

export interface DocumentVersionDto {
  id?: number;
  key?: string;
  created_date?: string;
}

export async function getDocumentationTypes(entityType: string): Promise<DocumentationTypeDto[]> {
  const data = await fetchApi<DocumentationTypeDto[]>(
    `${DOCUMENT_BASE}/documentations/${encodeURIComponent(entityType)}`,
  );
  return Array.isArray(data) ? data : [];
}

export function findCjBpmnDocumentationTypeId(types: DocumentationTypeDto[]): number | undefined {
  const t = types.find((x) => (x.docType || "").toLowerCase() === "bpmn");
  return t?.id;
}

/**
 * POST /documents/CJ_BPMN/bpmn — требует заголовок Content-Disposition с именем файла.
 * В DocumentService расширение = подстрока после последней точки во всём заголовке.
 * Формат `attachment; filename="x.bpmn"` даёт `bpmn"` и не совпадает с doc_type `bpmn` в БД —
 * передаём только имя файла (как в techradar допустимо, но только «чистое» имя).
 */
export async function uploadCjBpmnDocument(targetId: number, file: File): Promise<{ docId?: number }> {
  const form = new FormData();
  const safeName = file.name.replace(/^.*[/\\]/, "").trim() || "diagram.bpmn";
  form.append("file", file, safeName);
  const qp = new URLSearchParams();
  qp.set("targetId", String(targetId));
  const path = `${DOCUMENT_BASE}/documents/CJ_BPMN/bpmn?${qp.toString()}`;
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...defaultGatewayUserHeaders(),
      "Content-Disposition": safeName,
    },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<{ docId?: number }>;
}

export async function getDocumentVersions(
  documentationsTypeId: number,
  targetId: number,
): Promise<DocumentVersionDto[]> {
  const data = await fetchApi<DocumentVersionDto[]>(
    `${DOCUMENT_BASE}/documents/versions/${documentationsTypeId}/${targetId}`,
  );
  return Array.isArray(data) ? data : [];
}

export async function downloadDocumentByTypeAndTarget(
  documentationsTypeId: number,
  targetId: number,
): Promise<void> {
  const res = await fetchRaw(`${DOCUMENT_BASE}/documents/${documentationsTypeId}/${targetId}`);
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  let filename = `cj-${targetId}.bpmn`;
  const m = /filename\*?=(?:UTF-8''|")?([^";\n]+)/i.exec(cd);
  if (m?.[1]) {
    try {
      filename = decodeURIComponent(m[1].replace(/"/g, "").trim());
    } catch {
      filename = m[1].replace(/"/g, "").trim();
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function getDocumentTextByTypeAndTarget(
  documentationsTypeId: number,
  targetId: number,
): Promise<string> {
  const res = await fetchRaw(`${DOCUMENT_BASE}/documents/${documentationsTypeId}/${targetId}`);
  const buffer = await res.arrayBuffer();
  const text = new TextDecoder("utf-8").decode(buffer);
  return text;
}
