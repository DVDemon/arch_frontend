export interface BusinessCapabilityTree {
  id: number;
  code?: string;
  name?: string;
  description?: string;
  author?: string;
  status?: string;
  link?: string;
  isDomain?: boolean;
  owner?: string;
  parentId?: number | null;
  children?: BusinessCapabilityTree[];
}

export interface BusinessCapabilityShort {
  id: number;
  code?: string;
  name?: string;
  description?: string;
  author?: string;
  link?: string;
  createdDate?: string;
  updatedDate?: string;
  deletedDate?: string;
  owner?: string;
  isDomain?: boolean;
  hasChildren?: boolean;
  parent?: { id: number; name?: string };
}

export interface BusinessCapabilityChildren {
  businessCapabilities?: BusinessCapabilityShort[];
  techCapabilities?: TechCapabilityShort[];
}

export interface TechCapabilityShort {
  id: number;
  code?: string;
  name?: string;
  description?: string;
  type?: string;
  author?: string;
  owner?: string;
  link?: string;
  createdDate?: string;
  updatedDate?: string;
  deletedDate?: string;
}

export interface TechCapabilitySystem {
  id: number;
  name?: string;
  alias?: string;
}

export interface TechCapability {
  id: number;
  code?: string;
  name?: string;
  description?: string;
  author?: string;
  link?: string;
  createdDate?: string;
  updatedDate?: string;
  deletedDate?: string;
  owner?: string;
  parents?: { id: number; name?: string }[];
  /** Продукт, за который система ответственна (из capability API) */
  system?: TechCapabilitySystem;
}

export interface SearchCapabilityResult {
  id: number;
  code?: string;
  name?: string;
  description?: string;
  type?: string;
}
