export interface ProductFull {
  id: number;
  alias: string;
  name?: string;
  description?: string;
  gitUrl?: string;
  structurizrApiKey?: string;
  structurizrApiSecret?: string;
  structurizrApiUrl?: string;
  structurizrWorkspaceName?: string;
  source?: string;
  critical?: string;
  uploadDate?: string;
  ownerID?: number;
  ownerName?: string;
  ownerEmail?: string;
  techProducts?: TechProduct[];
  discoveredInterfaces?: unknown[];
}

export interface TechProduct {
  id: number;
  techId: number;
  source?: string;
  createdDate?: string;
  lastModifiedDate?: string;
  deletedDate?: string;
}

export interface ProductUser {
  id: number;
  fullName?: string;
  email?: string;
  login?: string;
}

/** Параметр операции (если API возвращает) */
export interface OperationParameter {
  parameterName?: string;
  parameterType?: string;
}

/** Операция (endpoint) API */
export interface ContainerOperation {
  id: number;
  name?: string;
  description?: string;
  type?: string;
  techCapability?: { id: number; code?: string; name?: string };
  parameters?: OperationParameter[];
}

export interface ContainerInterface {
  id: number;
  name?: string;
  description?: string;
  code?: string;
  specLink?: string;
  protocol?: string;
  version?: string;
  createDate?: string;
  updateDate?: string;
  /** Technical capability на уровне API */
  techCapability?: { id: number; code?: string; name?: string };
  /** Операции (endpoints) */
  operations?: ContainerOperation[];
}

export interface ContainerWithInterfaces {
  id: number;
  name?: string;
  code?: string;
  createDate?: string;
  updateDate?: string;
  deletedDate?: string;
  interfaces?: ContainerInterface[];
}

export interface FitnessFunction {
  id: number;
  code?: string;
  description?: string;
  isCheck?: boolean;
  resultDetails?: string;
  status?: string;
  assessmentDescription?: string;
  docLink?: string;
}

export interface AssessmentResponse {
  assessmentId?: number;
  source?: { sourceId?: number; sourceType?: string };
  createdDate?: string;
  productId?: number;
  fitnessFunctions?: FitnessFunction[];
}
