export interface TechRadarRing {
  id: number;
  name: string;
  order?: number;
}

export interface TechRadarSector {
  id: number;
  name: string;
  order?: number;
}

export interface TechRadarCategory {
  id: number;
  name: string;
}

export interface TechVersion {
  id: number;
  versionStart: string;
  versionEnd: string;
  createdDate?: string;
  deletedDate?: string;
  lastModifiedDate?: string;
  ring?: TechRadarRing;
}

export interface TechRadarTech {
  id: number;
  label?: string;
  description?: string;
  review?: boolean;
  link?: string;
  ring?: TechRadarRing;
  sector?: TechRadarRing;
  isCritical?: boolean;
  category?: TechRadarCategory[];
  versions?: TechVersion[];
  history?: unknown[];
}

export interface TechCategoryInput {
  id: number;
}

export interface TechUpdatePayload {
  label?: string;
  descr?: string;
  sector_id?: number;
  ring_id?: number;
  categories?: TechCategoryInput[];
  link?: string;
  review?: boolean;
  isCritical?: boolean;
}

export interface TechCreatePayload {
  label: string;
  descr?: string;
  sector_id?: number;
  ring_id?: number;
  categories?: TechCategoryInput[];
  link?: string;
  review?: boolean;
  isCritical?: boolean;
}

export interface TechVersionPayload {
  versionStart?: string;
  versionEnd?: string;
  statusId: number;
}
